package com.startfive.app.backup

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.atomic.AtomicLong

class StartFiveBackupFilesModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private val ownerGeneration = nextOwnerGeneration.getAndIncrement()
  @Volatile private var isActive = true

  override fun getName() = BackupFileContract.MODULE_NAME

  @ReactMethod
  fun saveBackup(suggestedName: String, bytesBase64: String, promise: Promise) {
    if (!isActive) {
      promise.reject("BACKUP_FILE_MODULE_INVALIDATED", "The backup file module was invalidated")
      return
    }
    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.reject("BACKUP_FILE_ACTIVITY_UNAVAILABLE", "A foreground activity is required")
      return
    }
    BackupFileBroker.save(
      activity = activity,
      owner = this,
      ownerGeneration = ownerGeneration,
      ownsActivity = ::ownsActivity,
      suggestedName = suggestedName,
      bytesBase64 = bytesBase64,
      promise = promise,
    )
  }

  @ReactMethod
  fun pickBackup(promise: Promise) {
    if (!isActive) {
      promise.reject("BACKUP_FILE_MODULE_INVALIDATED", "The backup file module was invalidated")
      return
    }
    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.reject("BACKUP_FILE_ACTIVITY_UNAVAILABLE", "A foreground activity is required")
      return
    }
    BackupFileBroker.pick(
      activity = activity,
      owner = this,
      ownerGeneration = ownerGeneration,
      ownsActivity = ::ownsActivity,
      promise = promise,
    )
  }

  override fun invalidate() {
    releaseOwner()
    super.invalidate()
  }

  @Suppress("DEPRECATION")
  override fun onCatalystInstanceDestroy() {
    releaseOwner()
    super.onCatalystInstanceDestroy()
  }

  private fun ownsActivity(activity: android.app.Activity): Boolean =
    isActive && reactApplicationContext.currentActivity === activity

  private fun releaseOwner() {
    if (!isActive) return
    isActive = false
    BackupFileBroker.releaseOwner(this, ownerGeneration)
  }

  private companion object {
    val nextOwnerGeneration = AtomicLong(1)
  }
}
