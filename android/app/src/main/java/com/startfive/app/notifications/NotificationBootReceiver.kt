package com.startfive.app.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class NotificationBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
    val store = NotificationStore(context)
    val now = System.currentTimeMillis()
    try {
      NotificationStore.locked {
        store.all().forEach { previous ->
          restoreSnapshot(context, store, previous, now)
        }
      }
    } catch (error: Exception) {
      Log.e(TAG, "Failed to restore notification alarms after boot", error)
    }
  }

  private fun restoreSnapshot(
    context: Context,
    store: NotificationStore,
    previous: StoredSnapshot,
    now: Long,
  ) {
    val future = previous.intents.filter { storedIntent ->
      try {
        parseNotificationTriggerAt(storedIntent.triggerAt) > now
      } catch (_: Exception) {
        false
      }
    }
    if (!previous.scheduled || future.isEmpty()) {
      store.remove(previous.taskId)
      return
    }

    val recoverySnapshot = previous.copy(
      intents = future,
      scheduled = true,
      needsRecovery = true,
    )
    val scheduled = mutableListOf<StoredIntent>()
    val createdIds = mutableListOf<NotificationIdReservation>()
    try {
      store.put(recoverySnapshot)
      future.forEach { storedIntent ->
        scheduled += storedIntent
        val reservation = NotificationAlarmScheduler.schedule(context, store, storedIntent)
        if (reservation.created) createdIds += reservation
      }
      store.put(recoverySnapshot.copy(needsRecovery = false))
    } catch (error: Exception) {
      scheduled.asReversed().forEach { storedIntent ->
        runCatching { NotificationAlarmScheduler.cancel(context, store, storedIntent) }
      }
      createdIds.asReversed().forEach { reservation ->
        runCatching { store.releaseNotificationId(reservation) }
      }
      runCatching { store.put(recoverySnapshot) }
      Log.e(TAG, "Failed to restore notification snapshot ${previous.taskId}", error)
    }
  }

  private companion object {
    const val TAG = "StartFiveNotifications"
  }
}
