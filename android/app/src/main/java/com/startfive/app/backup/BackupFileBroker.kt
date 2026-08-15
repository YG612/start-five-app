package com.startfive.app.backup

import android.app.Activity
import android.content.ContentResolver
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicLong

internal object BackupFileBroker {
  private sealed interface Pending {
    val promise: Promise
    val owner: Any
    val ownerGeneration: Long
    val launchedActivity: Activity
    val ownsActivity: (Activity) -> Boolean
    val operationToken: Long
    val requestCode: Int
    var ioStarted: Boolean

    data class Save(
      override val promise: Promise,
      override val owner: Any,
      override val ownerGeneration: Long,
      override val launchedActivity: Activity,
      override val ownsActivity: (Activity) -> Boolean,
      override val operationToken: Long,
      override val requestCode: Int,
      val bytes: ByteArray,
      override var ioStarted: Boolean = false,
    ) : Pending

    data class Pick(
      override val promise: Promise,
      override val owner: Any,
      override val ownerGeneration: Long,
      override val launchedActivity: Activity,
      override val ownsActivity: (Activity) -> Boolean,
      override val operationToken: Long,
      override val requestCode: Int,
      override var ioStarted: Boolean = false,
    ) : Pending
  }

  private val lock = Any()
  private val ioExecutor = Executors.newSingleThreadExecutor()
  private val nextOperationToken = AtomicLong(1)
  private var pending: Pending? = null

  fun save(
    activity: Activity,
    owner: Any,
    ownerGeneration: Long,
    ownsActivity: (Activity) -> Boolean,
    suggestedName: String,
    bytesBase64: String,
    promise: Promise,
  ) {
    val operation = synchronized(lock) {
      if (pending != null) {
        promise.reject("BACKUP_FILE_OPERATION_IN_PROGRESS", "A file operation is already in progress")
        return
      }
      val decoded = try {
        decodeBase64(bytesBase64)
      } catch (error: Exception) {
        promise.reject("BACKUP_FILE_BYTES_INVALID", error)
        return
      }
      val operationToken = nextOperationToken.getAndIncrement()
      Pending.Save(
        promise = promise,
        owner = owner,
        ownerGeneration = ownerGeneration,
        launchedActivity = activity,
        ownsActivity = ownsActivity,
        operationToken = operationToken,
        requestCode = BackupFileContract.saveRequestCode(operationToken),
        bytes = decoded,
      ).also { pending = it }
    }
    val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = BackupFileContract.MIME_TYPE
      putExtra(Intent.EXTRA_TITLE, sanitizeSuggestedName(suggestedName))
    }
    try {
      activity.startActivityForResult(intent, operation.requestCode)
    } catch (error: Exception) {
      finishWithError(owner, ownerGeneration, operation.operationToken,
        "BACKUP_FILE_SAVE_UNAVAILABLE", error)
    }
  }

  fun pick(
    activity: Activity,
    owner: Any,
    ownerGeneration: Long,
    ownsActivity: (Activity) -> Boolean,
    promise: Promise,
  ) {
    val operation = synchronized(lock) {
      if (pending != null) {
        promise.reject("BACKUP_FILE_OPERATION_IN_PROGRESS", "A file operation is already in progress")
        return
      }
      val operationToken = nextOperationToken.getAndIncrement()
      Pending.Pick(
        promise = promise,
        owner = owner,
        ownerGeneration = ownerGeneration,
        launchedActivity = activity,
        ownsActivity = ownsActivity,
        operationToken = operationToken,
        requestCode = BackupFileContract.pickRequestCode(operationToken),
      ).also { pending = it }
    }
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = BackupFileContract.MIME_TYPE
    }
    try {
      activity.startActivityForResult(intent, operation.requestCode)
    } catch (error: Exception) {
      finishWithError(
        owner,
        ownerGeneration,
        operation.operationToken,
        "BACKUP_FILE_PICK_UNAVAILABLE",
        error,
      )
    }
  }

  fun onActivityResult(
    activity: Activity,
    requestCode: Int,
    resultCode: Int,
    data: Intent?,
  ): Boolean {
    if (!BackupFileContract.isReservedRequestCode(requestCode)) return false

    val operation = synchronized(lock) {
      pending?.takeIf {
        it.requestCode == requestCode &&
          it.operationToken > 0 &&
          it.ownsActivity(activity)
      }
    } ?: return false

    if (resultCode != Activity.RESULT_OK) {
      complete(operation) {
        when (operation) {
          is Pending.Save -> operation.promise.resolve("cancelled")
          is Pending.Pick -> operation.promise.resolve(null)
        }
      }
      return true
    }
    val uri = data?.data
    if (uri == null || uri.scheme != ContentResolver.SCHEME_CONTENT) {
      complete(operation) {
        operation.promise.reject(
          "BACKUP_FILE_RESULT_INVALID",
          "The document provider returned an invalid content URI",
        )
      }
      return true
    }

    val mayStartIo = synchronized(lock) {
      if (pending !== operation || operation.ioStarted) false else {
        operation.ioStarted = true
        true
      }
    }
    if (!mayStartIo) return true
    ioExecutor.execute {
      when (operation) {
        is Pending.Save -> writeSelected(activity, uri, operation)
        is Pending.Pick -> readSelected(activity, uri, operation)
      }
    }
    return true
  }

  fun releaseOwner(owner: Any, ownerGeneration: Long) {
    rejectAndClear(
      predicate = { it.owner === owner && it.ownerGeneration == ownerGeneration },
      code = "BACKUP_FILE_MODULE_INVALIDATED",
      message = "The backup file module was invalidated",
    )
  }

  fun releaseActivity(activity: Activity) {
    rejectAndClear(
      predicate = {
        it.launchedActivity === activity || it.ownsActivity(activity)
      },
      code = "BACKUP_FILE_ACTIVITY_DESTROYED",
      message = "The activity was destroyed before the file operation completed",
    )
  }

  private fun writeSelected(activity: Activity, uri: Uri, operation: Pending.Save) {
    try {
      activity.contentResolver.openOutputStream(uri, "w")?.use { stream ->
        stream.write(operation.bytes)
        stream.flush()
      } ?: throw IllegalStateException("The selected document cannot be opened for writing")
      complete(operation) { operation.promise.resolve("saved") }
    } catch (error: Exception) {
      complete(operation) { operation.promise.reject("BACKUP_FILE_SAVE_FAILED", error) }
    } finally {
      operation.bytes.fill(0)
    }
  }

  private fun readSelected(activity: Activity, uri: Uri, operation: Pending.Pick) {
    try {
      val declaredSize = querySize(activity, uri)
      if (declaredSize != null && declaredSize > BackupFileContract.MAX_BYTES) {
        throw BackupTooLargeException()
      }
      val bytes = activity.contentResolver.openInputStream(uri)?.use { stream ->
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        var total = 0
        while (true) {
          val count = stream.read(buffer)
          if (count < 0) break
          total += count
          if (total > BackupFileContract.MAX_BYTES) throw BackupTooLargeException()
          output.write(buffer, 0, count)
        }
        output.toByteArray()
      } ?: throw IllegalStateException("The selected document cannot be opened for reading")
      val result = Arguments.createMap().apply {
        putString("name", queryDisplayName(activity, uri))
        putString("bytesBase64", Base64.encodeToString(bytes, Base64.NO_WRAP))
      }
      bytes.fill(0)
      complete(operation) { operation.promise.resolve(result) }
    } catch (error: BackupTooLargeException) {
      complete(operation) { operation.promise.reject("BACKUP_FILE_TOO_LARGE", error) }
    } catch (error: Exception) {
      complete(operation) { operation.promise.reject("BACKUP_FILE_READ_FAILED", error) }
    }
  }

  private fun querySize(activity: Activity, uri: Uri): Long? =
    query(activity, uri, OpenableColumns.SIZE) { cursor, index ->
      if (cursor.isNull(index)) null else cursor.getLong(index)
    }

  private fun queryDisplayName(activity: Activity, uri: Uri): String =
    query(activity, uri, OpenableColumns.DISPLAY_NAME) { cursor, index ->
      cursor.getString(index)
    }
      ?.let(::sanitizeDisplayName)
      ?: "start-five-backup.json"

  private fun <T> query(
    activity: Activity,
    uri: Uri,
    column: String,
    read: (Cursor, Int) -> T,
  ): T? = activity.contentResolver.query(uri, arrayOf(column), null, null, null)?.use { cursor ->
    val index = cursor.getColumnIndex(column)
    if (index < 0 || !cursor.moveToFirst()) null else read(cursor, index)
  }

  private fun complete(operation: Pending, resolution: () -> Unit) {
    val ownsPending = synchronized(lock) {
      if (pending !== operation) false else {
        pending = null
        true
      }
    }
    if (ownsPending) {
      cleanupIfIdle(operation)
      resolution()
    }
  }

  private fun finishWithError(
    owner: Any,
    ownerGeneration: Long,
    operationToken: Long,
    code: String,
    error: Exception,
  ) {
    val operation = synchronized(lock) {
      val current = pending
      if (current == null || current.owner !== owner ||
        current.ownerGeneration != ownerGeneration || current.operationToken != operationToken
      ) null else {
        pending = null
        current
      }
    }
    operation?.let {
      cleanupIfIdle(it)
      it.promise.reject(code, error)
    }
  }

  private fun rejectAndClear(
    predicate: (Pending) -> Boolean,
    code: String,
    message: String,
  ) {
    val operation = synchronized(lock) {
      pending?.takeIf(predicate)?.also { pending = null }
    } ?: return
    cleanupIfIdle(operation)
    operation.promise.reject(code, message)
  }

  private fun cleanupIfIdle(operation: Pending) {
    if (operation is Pending.Save && !operation.ioStarted) operation.bytes.fill(0)
  }

  private fun decodeBase64(value: String): ByteArray {
    val maximumEncodedLength = ((BackupFileContract.MAX_BYTES + 2) / 3) * 4
    require(value.length <= maximumEncodedLength) { "Backup exceeds 8 MiB" }
    require(BASE64_PATTERN.matches(value)) { "Backup bytes are not strict base64" }
    val bytes = Base64.decode(value, Base64.NO_WRAP)
    require(bytes.size <= BackupFileContract.MAX_BYTES) { "Backup exceeds 8 MiB" }
    return bytes
  }

  private fun sanitizeSuggestedName(value: String): String {
    val sanitized = sanitizeDisplayName(value).take(120).trim('.', ' ')
    val base = sanitized.ifBlank { "start-five-backup.json" }
    return if (base.endsWith(".json", ignoreCase = true)) base else "$base.json"
  }

  private fun sanitizeDisplayName(value: String): String {
    val leaf = value.substringAfterLast('/').substringAfterLast('\\')
    return leaf
      .replace(INVALID_FILENAME_CHARACTERS, "_")
      .trim()
      .takeIf(String::isNotBlank)
      ?: "start-five-backup.json"
  }

  private class BackupTooLargeException : Exception("Backup exceeds 8 MiB")

  private val BASE64_PATTERN = Regex(
    "^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$",
  )
  private val INVALID_FILENAME_CHARACTERS = Regex("[\\u0000-\\u001f\\u007f\\\\/:*?\"<>|]")
}
