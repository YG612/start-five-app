package com.startfive.app.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.startfive.app.MainActivity
import com.startfive.app.R

class NotificationAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != NotificationContract.ACTION_ALARM) return
    val stableId = intent.getStringExtra(NotificationContract.EXTRA_STABLE_ID) ?: return
    val taskId = intent.getStringExtra(NotificationContract.EXTRA_TASK_ID) ?: return
    val ruleId = intent.getStringExtra(NotificationContract.EXTRA_RULE_ID) ?: return
    val suppliedTitle = intent.getStringExtra(NotificationContract.EXTRA_NOTIFICATION_TITLE)
    val suppliedBody = intent.getStringExtra(NotificationContract.EXTRA_NOTIFICATION_BODY)
    val store = NotificationStore(context)
    if (!store.consumeIntent(taskId, stableId)) return
    val quiet = context.getSharedPreferences(
      NotificationContract.FOCUS_QUIET_PREFERENCES,
      Context.MODE_PRIVATE,
    )
    val quietSession = quiet.getString(NotificationContract.FOCUS_QUIET_SESSION_KEY, null)
    val quietUntil = quiet.getLong(NotificationContract.FOCUS_QUIET_UNTIL_KEY, 0L)
    if (quietSession != null && quietUntil > System.currentTimeMillis()) return
    if (quietSession != null) {
      quiet.edit()
        .remove(NotificationContract.FOCUS_QUIET_SESSION_KEY)
        .remove(NotificationContract.FOCUS_QUIET_UNTIL_KEY)
        .apply()
    }
    val notificationId = store.notificationId(stableId)
    val manager = context.getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(NotificationChannel(
        NotificationContract.CHANNEL_ID,
        NotificationContract.CHANNEL_NAME,
        NotificationManager.IMPORTANCE_DEFAULT,
      ))
    }

    val focusRule = ruleId.startsWith("focus-schedule:")
    val focusPayload = ruleId.removePrefix("focus-schedule:")
    val focusSeparator = focusPayload.lastIndexOf(':')
    val scheduleId = if (focusRule && focusSeparator > 0) focusPayload.substring(0, focusSeparator) else null
    val dayKey = if (scheduleId == null) {
      ruleId.removePrefix("tomorrow-first:")
    } else {
      focusPayload.substring(focusSeparator + 1)
    }
    fun tapIntent(kind: String): PendingIntent {
      val actionIntent = Intent(context, MainActivity::class.java).apply {
        action = NotificationContract.ACTION_TAP
        flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        putExtra(NotificationContract.EXTRA_TAP_KIND, kind)
        putExtra(NotificationContract.EXTRA_DAY_KEY, dayKey)
        putExtra(NotificationContract.EXTRA_TASK_ID, taskId)
        scheduleId?.let { putExtra(NotificationContract.EXTRA_SCHEDULE_ID, it) }
      }
      return PendingIntent.getActivity(
        context,
        "$stableId:$kind".hashCode() and Int.MAX_VALUE,
        actionIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }
    val contentIntent = tapIntent(
      if (focusRule) NotificationContract.TAP_KIND_FOCUS_SCHEDULE_OPEN
      else NotificationContract.TAP_KIND_TOMORROW_FIRST,
    )
    val notification = NotificationCompat.Builder(context, NotificationContract.CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle(suppliedTitle ?: if (focusRule) "专注时段到了" else "明日第一项")
      .setContentText(suppliedBody ?: if (focusRule) "现在不用全部完成，先推进第一小步。" else "打开 Start Five，先开始 5 分钟")
      .setAutoCancel(true)
      .setContentIntent(contentIntent)
      .addAction(
        R.mipmap.ic_launcher,
        "先做 5 分钟",
        tapIntent(
          if (focusRule) NotificationContract.TAP_KIND_FOCUS_SCHEDULE_START_FIVE
          else NotificationContract.TAP_KIND_START_FIVE,
        ),
      )
      .addAction(
        R.mipmap.ic_launcher,
        "10 分钟后",
        tapIntent(
          if (focusRule) NotificationContract.TAP_KIND_FOCUS_SCHEDULE_DELAY_TEN
          else NotificationContract.TAP_KIND_DELAY_TEN,
        ),
      )
      .addAction(
        R.mipmap.ic_launcher,
        if (focusRule) "打开专注页" else "重新安排",
        tapIntent(
          if (focusRule) NotificationContract.TAP_KIND_FOCUS_SCHEDULE_OPEN
          else NotificationContract.TAP_KIND_RESCHEDULE,
        ),
      )
      .build()
    manager.notify(notificationId, notification)
  }
}
