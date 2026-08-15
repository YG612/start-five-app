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
    val store = NotificationStore(context)
    if (!store.consumeIntent(taskId, stableId)) return
    val notificationId = store.notificationId(stableId)
    val manager = context.getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(NotificationChannel(
        NotificationContract.CHANNEL_ID,
        NotificationContract.CHANNEL_NAME,
        NotificationManager.IMPORTANCE_DEFAULT,
      ))
    }

    val dayKey = ruleId.removePrefix("tomorrow-first:")
    fun tapIntent(kind: String): PendingIntent {
      val actionIntent = Intent(context, MainActivity::class.java).apply {
        action = NotificationContract.ACTION_TAP
        flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        putExtra(NotificationContract.EXTRA_TAP_KIND, kind)
        putExtra(NotificationContract.EXTRA_DAY_KEY, dayKey)
        putExtra(NotificationContract.EXTRA_TASK_ID, taskId)
      }
      return PendingIntent.getActivity(
        context,
        "$stableId:$kind".hashCode() and Int.MAX_VALUE,
        actionIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }
    val contentIntent = tapIntent(NotificationContract.TAP_KIND_TOMORROW_FIRST)
    val notification = NotificationCompat.Builder(context, NotificationContract.CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("明日第一项")
      .setContentText("打开 Start Five，先开始 5 分钟")
      .setAutoCancel(true)
      .setContentIntent(contentIntent)
      .addAction(
        R.mipmap.ic_launcher,
        "先做 5 分钟",
        tapIntent(NotificationContract.TAP_KIND_START_FIVE),
      )
      .addAction(
        R.mipmap.ic_launcher,
        "10 分钟后",
        tapIntent(NotificationContract.TAP_KIND_DELAY_TEN),
      )
      .addAction(
        R.mipmap.ic_launcher,
        "重新安排",
        tapIntent(NotificationContract.TAP_KIND_RESCHEDULE),
      )
      .build()
    manager.notify(notificationId, notification)
  }
}
