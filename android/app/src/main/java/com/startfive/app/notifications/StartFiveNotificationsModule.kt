package com.startfive.app.notifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.modules.core.PermissionAwareActivity
import androidx.core.app.NotificationCompat
import com.startfive.app.MainActivity
import com.startfive.app.R
import java.lang.ref.WeakReference

class StartFiveNotificationsModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private val store = NotificationStore(reactContext)
  private var listenerCount = 0

  init {
    activeModule = WeakReference(this)
  }

  override fun getName() = NotificationContract.MODULE_NAME

  @ReactMethod
  fun getPermission(promise: Promise) {
    promise.resolve(permissionStatus())
  }

  @ReactMethod
  fun requestPermission(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
      reactApplicationContext.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    ) {
      promise.resolve("granted")
      return
    }
    val activity = reactApplicationContext.currentActivity as? PermissionAwareActivity
    if (activity == null) {
      promise.reject("NOTIFICATION_ACTIVITY_UNAVAILABLE", "A foreground activity is required")
      return
    }
    synchronized(permissionLock) {
      if (permissionPromise != null) {
        promise.reject("NOTIFICATION_PERMISSION_IN_PROGRESS", "Permission request already in progress")
        return
      }
      permissionPromise = promise
      permissionPreferences().edit().putBoolean("prompted", true).apply()
      activity.requestPermissions(
        arrayOf(Manifest.permission.POST_NOTIFICATIONS),
        PERMISSION_REQUEST_CODE,
      ) { requestCode, _, grantResults ->
        if (requestCode != PERMISSION_REQUEST_CODE) return@requestPermissions false
        val pending = synchronized(permissionLock) {
          permissionPromise.also { permissionPromise = null }
        }
        pending?.resolve(
          if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) "granted" else "denied",
        )
        true
      }
    }
  }

  @ReactMethod
  fun get(taskId: String, promise: Promise) {
    try {
      val snapshot = store.get(taskId)
      promise.resolve(
        snapshot
          ?.takeUnless { it.needsRecovery }
          ?.let(NotificationStore::toWritable),
      )
    } catch (error: Exception) {
      promise.reject("NOTIFICATION_STATE_CORRUPT", error)
    }
  }

  @ReactMethod
  fun replace(previous: ReadableMap?, next: ReadableMap, promise: Promise) {
    try {
      val suppliedPrevious = previous?.let(NotificationStore::fromReadable)
      val nextSnapshot = NotificationStore.fromReadable(next)
      require(suppliedPrevious == null || suppliedPrevious.taskId == nextSnapshot.taskId) {
        "previous taskId mismatch"
      }
      NotificationStore.locked { replaceAtomically(suppliedPrevious, nextSnapshot) }
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("NOTIFICATION_REPLACE_FAILED", error)
    }
  }

  @ReactMethod
  fun getInitialTap(promise: Promise) {
    val tap = synchronized(tapLock) {
      initialTap.also { initialTap = null }
    }
    promise.resolve(tap?.toWritable())
  }

  @ReactMethod
  fun startFocusOngoing(
    sessionId: String,
    title: String,
    firstStep: String,
    quietUntilEpochMs: Double,
    promise: Promise,
  ) {
    try {
      require(sessionId.isNotBlank()) { "sessionId required" }
      require(quietUntilEpochMs.isFinite() && quietUntilEpochMs > 0.0) { "quietUntilEpochMs invalid" }
      val manager = reactApplicationContext.getSystemService(NotificationManager::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        manager.createNotificationChannel(NotificationChannel(
          NotificationContract.FOCUS_CHANNEL_ID,
          NotificationContract.FOCUS_CHANNEL_NAME,
          NotificationManager.IMPORTANCE_LOW,
        ))
      }
      fun action(kind: String): PendingIntent {
        val intent = Intent(reactApplicationContext, MainActivity::class.java).apply {
          action = NotificationContract.ACTION_TAP
          flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
          putExtra(NotificationContract.EXTRA_TAP_KIND, kind)
          putExtra(NotificationContract.EXTRA_SESSION_ID, sessionId)
        }
        return PendingIntent.getActivity(
          reactApplicationContext,
          "$sessionId:$kind".hashCode() and Int.MAX_VALUE,
          intent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
      }
      val notification = NotificationCompat.Builder(reactApplicationContext, NotificationContract.FOCUS_CHANNEL_ID)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle(title.take(80))
        .setContentText(firstStep.take(120))
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setContentIntent(action(NotificationContract.TAP_KIND_FOCUS_ONGOING_CONTINUE))
        .addAction(R.mipmap.ic_launcher, "继续", action(NotificationContract.TAP_KIND_FOCUS_ONGOING_CONTINUE))
        .addAction(R.mipmap.ic_launcher, "结束", action(NotificationContract.TAP_KIND_FOCUS_ONGOING_END))
        .build()
      manager.notify(FOCUS_NOTIFICATION_ID, notification)
      check(focusQuietPreferences().edit()
        .putString(NotificationContract.FOCUS_QUIET_SESSION_KEY, sessionId)
        .putLong(NotificationContract.FOCUS_QUIET_UNTIL_KEY, quietUntilEpochMs.toLong())
        .commit()) { "FOCUS_QUIET_STATE_WRITE_FAILED" }
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("FOCUS_ONGOING_NOTIFICATION_FAILED", error)
    }
  }

  @ReactMethod
  fun stopFocusOngoing(sessionId: String, promise: Promise) {
    try {
      require(sessionId.isNotBlank()) { "sessionId required" }
      reactApplicationContext.getSystemService(NotificationManager::class.java)
        .cancel(FOCUS_NOTIFICATION_ID)
      val quiet = focusQuietPreferences()
      if (quiet.getString(NotificationContract.FOCUS_QUIET_SESSION_KEY, null) == sessionId) {
        check(quiet.edit()
          .remove(NotificationContract.FOCUS_QUIET_SESSION_KEY)
          .remove(NotificationContract.FOCUS_QUIET_UNTIL_KEY)
          .commit()) { "FOCUS_QUIET_STATE_WRITE_FAILED" }
      }
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("FOCUS_ONGOING_NOTIFICATION_FAILED", error)
    }
  }

  @ReactMethod
  fun addListener(eventName: String) {
    if (eventName == NotificationContract.TAP_EVENT) {
      listenerCount += 1
      flushPendingHotTap()
    }
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    listenerCount = (listenerCount - count).coerceAtLeast(0)
  }

  private fun permissionStatus(): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
      reactApplicationContext.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    ) return "granted"
    return if (permissionPreferences().getBoolean("prompted", false)) "denied" else "not_determined"
  }

  private fun permissionPreferences() = reactApplicationContext.getSharedPreferences(
    "start_five_notification_permission_v1",
    android.content.Context.MODE_PRIVATE,
  )

  private fun focusQuietPreferences() = reactApplicationContext.getSharedPreferences(
    NotificationContract.FOCUS_QUIET_PREFERENCES,
    android.content.Context.MODE_PRIVATE,
  )

  private fun replaceAtomically(
    suppliedPrevious: StoredSnapshot?,
    next: StoredSnapshot,
  ) {
    val durablePrevious = store.get(next.taskId)
    val affectedPrevious =
      (suppliedPrevious?.intents.orEmpty() + durablePrevious?.intents.orEmpty())
        .distinctBy { it.stableId }
    val scheduledNext = mutableListOf<StoredIntent>()
    val createdIds = mutableListOf<NotificationIdReservation>()

    try {
      affectedPrevious.forEach { storedIntent ->
        NotificationAlarmScheduler.cancel(reactApplicationContext, store, storedIntent)
      }
      if (next.scheduled) {
        next.intents.forEach { storedIntent ->
          val reservation = NotificationAlarmScheduler.schedule(
            reactApplicationContext,
            store,
            storedIntent,
          )
          scheduledNext += storedIntent
          if (reservation.created) createdIds += reservation
        }
        store.put(next.copy(needsRecovery = false))
      } else {
        store.remove(next.taskId)
      }
    } catch (primary: Exception) {
      val rollbackFailures = mutableListOf<Throwable>()
      scheduledNext.asReversed().forEach { storedIntent ->
        runCatching {
          NotificationAlarmScheduler.cancel(reactApplicationContext, store, storedIntent)
        }.exceptionOrNull()?.let(rollbackFailures::add)
      }
      createdIds.asReversed().forEach { reservation ->
        runCatching { store.releaseNotificationId(reservation) }
          .exceptionOrNull()?.let(rollbackFailures::add)
      }
      val restoredPrevious = mutableListOf<StoredIntent>()
      if (durablePrevious?.scheduled == true && !durablePrevious.needsRecovery) {
        durablePrevious.intents.forEach { storedIntent ->
          runCatching {
            NotificationAlarmScheduler.schedule(reactApplicationContext, store, storedIntent)
            restoredPrevious += storedIntent
          }.exceptionOrNull()?.let(rollbackFailures::add)
        }
      }
      if (rollbackFailures.isNotEmpty()) {
        restoredPrevious.asReversed().forEach { storedIntent ->
          runCatching {
            NotificationAlarmScheduler.cancel(reactApplicationContext, store, storedIntent)
          }.exceptionOrNull()?.let(rollbackFailures::add)
        }
      }
      runCatching {
        if (rollbackFailures.isEmpty()) {
          if (durablePrevious == null) {
            store.remove(next.taskId)
          } else {
            store.put(durablePrevious)
          }
        } else {
          val recoveryIntents = (affectedPrevious + next.intents)
            .distinctBy { it.stableId }
          store.put(
            next.copy(
              intents = recoveryIntents,
              scheduled = true,
              needsRecovery = true,
            ),
          )
        }
      }.exceptionOrNull()?.let(rollbackFailures::add)

      rollbackFailures.forEach(primary::addSuppressed)
      throw primary
    }
  }

  private fun flushPendingHotTap() {
    if (listenerCount == 0) return
    val tap = synchronized(tapLock) {
      pendingHotTap.also { pendingHotTap = null }
    } ?: return
    emitTap(tap)
  }

  private fun emitTap(tap: NotificationTap) {
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(NotificationContract.TAP_EVENT, tap.toWritable())
  }

  override fun invalidate() {
    synchronized(tapLock) {
      if (activeModule?.get() === this) activeModule = null
    }
    super.invalidate()
  }

  private data class NotificationTap(
    val kind: String,
    val dayKey: String? = null,
    val taskId: String? = null,
    val scheduleId: String? = null,
    val sessionId: String? = null,
    val entryId: String? = null,
    val text: String? = null,
    val truncated: Boolean = false,
  ) {
    fun toWritable() = Arguments.createMap().apply {
      putString("kind", kind)
      dayKey?.let { putString("dayKey", it) }
      taskId?.let { putString("taskId", it) }
      scheduleId?.let { putString("scheduleId", it) }
      sessionId?.let { putString("sessionId", it) }
      entryId?.let { putString("entryId", it) }
      text?.let { putString("text", it) }
      if (kind == NotificationContract.TAP_KIND_SHARE_TEXT) {
        putBoolean("truncated", truncated)
      }
    }
  }

  companion object {
    private const val PERMISSION_REQUEST_CODE = 7341
    private const val FOCUS_NOTIFICATION_ID = 7342
    private val permissionLock = Any()
    private val tapLock = Any()
    private var permissionPromise: Promise? = null
    private var activeModule: WeakReference<StartFiveNotificationsModule>? = null
    private var initialTap: NotificationTap? = null
    private var pendingHotTap: NotificationTap? = null

    fun receiveInitialTap(intent: Intent?) {
      val tap = parseAndConsumeTap(intent) ?: return
      synchronized(tapLock) {
        initialTap = tap
      }
    }

    fun receiveTap(intent: Intent?) {
      val tap = parseAndConsumeTap(intent) ?: return
      val module = synchronized(tapLock) {
        val current = activeModule?.get()
        if (current == null || current.listenerCount == 0) {
          pendingHotTap = tap
          null
        } else current
      }
      module?.emitTap(tap)
    }

    private fun parseAndConsumeTap(intent: Intent?): NotificationTap? {
      val source = intent ?: return null
      val result = when (source.action) {
        NotificationContract.ACTION_TAP -> {
          val kind = source.getStringExtra(NotificationContract.EXTRA_TAP_KIND) ?: return null
          val validKinds = setOf(
            NotificationContract.TAP_KIND_TOMORROW_FIRST,
            NotificationContract.TAP_KIND_START_FIVE,
            NotificationContract.TAP_KIND_DELAY_TEN,
            NotificationContract.TAP_KIND_RESCHEDULE,
            NotificationContract.TAP_KIND_FOCUS_SCHEDULE_START_FIVE,
            NotificationContract.TAP_KIND_FOCUS_SCHEDULE_START_PLANNED,
            NotificationContract.TAP_KIND_FOCUS_SCHEDULE_DELAY_TEN,
            NotificationContract.TAP_KIND_FOCUS_SCHEDULE_SKIP,
            NotificationContract.TAP_KIND_FOCUS_SCHEDULE_OPEN,
            NotificationContract.TAP_KIND_FOCUS_ONGOING_CONTINUE,
            NotificationContract.TAP_KIND_FOCUS_ONGOING_END,
          )
          if (kind !in validKinds) return null
          if (kind == NotificationContract.TAP_KIND_FOCUS_ONGOING_CONTINUE ||
            kind == NotificationContract.TAP_KIND_FOCUS_ONGOING_END
          ) {
            val sessionId = source.getStringExtra(NotificationContract.EXTRA_SESSION_ID) ?: return null
            NotificationTap(kind = kind, sessionId = sessionId)
          } else {
            val dayKey = source.getStringExtra(NotificationContract.EXTRA_DAY_KEY) ?: return null
            val taskId = source.getStringExtra(NotificationContract.EXTRA_TASK_ID)
            val scheduleId = source.getStringExtra(NotificationContract.EXTRA_SCHEDULE_ID)
            if (kind.startsWith("focus_schedule_") && scheduleId == null) return null
            if (!kind.startsWith("focus_schedule_") && taskId == null) return null
            NotificationTap(kind = kind, dayKey = dayKey, taskId = taskId, scheduleId = scheduleId)
          }
        }
        NotificationContract.ACTION_SHORTCUT_ADD -> NotificationTap(
          kind = NotificationContract.TAP_KIND_SHORTCUT_ADD,
          entryId = NotificationContract.ACTION_SHORTCUT_ADD,
        )
        NotificationContract.ACTION_SHORTCUT_CONTINUE -> NotificationTap(
          kind = NotificationContract.TAP_KIND_SHORTCUT_CONTINUE,
          entryId = NotificationContract.ACTION_SHORTCUT_CONTINUE,
        )
        NotificationContract.ACTION_SHORTCUT_START_FIVE -> NotificationTap(
          kind = NotificationContract.TAP_KIND_SHORTCUT_START_FIVE,
          entryId = NotificationContract.ACTION_SHORTCUT_START_FIVE,
        )
        Intent.ACTION_SEND -> {
          if (source.type != "text/plain") return null
          val raw = source.getStringExtra(Intent.EXTRA_TEXT) ?: return null
          val sanitized = raw
            .replace(Regex("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]"), " ")
            .take(NotificationContract.MAX_SHARED_TEXT_LENGTH)
          NotificationTap(
            kind = NotificationContract.TAP_KIND_SHARE_TEXT,
            entryId = "share:${raw.hashCode()}:${raw.length}",
            text = sanitized,
            truncated = raw.length > NotificationContract.MAX_SHARED_TEXT_LENGTH,
          )
        }
        else -> return null
      }
      source.action = null
      source.removeExtra(NotificationContract.EXTRA_TAP_KIND)
      source.removeExtra(NotificationContract.EXTRA_DAY_KEY)
      source.removeExtra(NotificationContract.EXTRA_TASK_ID)
      source.removeExtra(NotificationContract.EXTRA_SCHEDULE_ID)
      source.removeExtra(NotificationContract.EXTRA_SESSION_ID)
      source.removeExtra(Intent.EXTRA_TEXT)
      return result
    }
  }
}
