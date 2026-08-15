package com.startfive.app.notifications

import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent

internal object NotificationAlarmScheduler {
  fun schedule(
    context: Context,
    store: NotificationStore,
    intent: StoredIntent,
  ): NotificationIdReservation {
    val triggerAt = parseNotificationTriggerAt(intent.triggerAt)
    val reservation = store.reserveNotificationId(intent.stableId)
    val alarmIntent = Intent(context, NotificationAlarmReceiver::class.java).apply {
      action = NotificationContract.ACTION_ALARM
      putExtra(NotificationContract.EXTRA_STABLE_ID, intent.stableId)
      putExtra(NotificationContract.EXTRA_TASK_ID, intent.taskId)
      putExtra(NotificationContract.EXTRA_RULE_ID, intent.ruleId)
      putExtra(NotificationContract.EXTRA_REMINDER_KIND, intent.kind)
    }
    val pendingIntent = PendingIntent.getBroadcast(
      context,
      reservation.notificationId,
      alarmIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    try {
      context.getSystemService(AlarmManager::class.java)
        .setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
    } catch (error: Exception) {
      if (reservation.created) store.releaseNotificationId(reservation)
      throw error
    }
    return reservation
  }

  fun cancel(context: Context, store: NotificationStore, intent: StoredIntent) {
    val notificationId = store.findNotificationId(intent.stableId) ?: return
    val alarmIntent = Intent(context, NotificationAlarmReceiver::class.java).apply {
      action = NotificationContract.ACTION_ALARM
    }
    val pendingIntent = PendingIntent.getBroadcast(
      context,
      notificationId,
      alarmIntent,
      PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
    )
    if (pendingIntent != null) {
      context.getSystemService(AlarmManager::class.java).cancel(pendingIntent)
      pendingIntent.cancel()
    }
    context.getSystemService(NotificationManager::class.java).cancel(notificationId)
  }
}
