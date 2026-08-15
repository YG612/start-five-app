package com.startfive.app.notifications

internal object NotificationContract {
  const val MODULE_NAME = "StartFiveNotifications"
  const val TAP_EVENT = "startFiveNotificationTap"
  const val CHANNEL_ID = "start_five_reminders"
  const val CHANNEL_NAME = "任务提醒"
  const val ACTION_ALARM = "com.startfive.app.NOTIFICATION_ALARM"
  const val ACTION_TAP = "com.startfive.app.NOTIFICATION_TAP"
  const val ACTION_SHORTCUT_ADD = "com.startfive.app.SHORTCUT_ADD"
  const val ACTION_SHORTCUT_CONTINUE = "com.startfive.app.SHORTCUT_CONTINUE"
  const val ACTION_SHORTCUT_START_FIVE = "com.startfive.app.SHORTCUT_START_FIVE"
  const val EXTRA_STABLE_ID = "start_five_stable_id"
  const val EXTRA_TASK_ID = "start_five_task_id"
  const val EXTRA_RULE_ID = "start_five_rule_id"
  const val EXTRA_REMINDER_KIND = "start_five_reminder_kind"
  const val EXTRA_TAP_KIND = "start_five_tap_kind"
  const val EXTRA_DAY_KEY = "start_five_day_key"
  const val EXTRA_ENTRY_ID = "start_five_entry_id"
  const val TAP_KIND_TOMORROW_FIRST = "tomorrow_first"
  const val TAP_KIND_START_FIVE = "start_five"
  const val TAP_KIND_DELAY_TEN = "delay_ten"
  const val TAP_KIND_RESCHEDULE = "reschedule"
  const val TAP_KIND_SHORTCUT_ADD = "shortcut_add"
  const val TAP_KIND_SHORTCUT_CONTINUE = "shortcut_continue"
  const val TAP_KIND_SHORTCUT_START_FIVE = "shortcut_start_five"
  const val TAP_KIND_SHARE_TEXT = "share_text"
  const val MAX_SHARED_TEXT_LENGTH = 500
}
