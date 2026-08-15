package com.startfive.app.notifications

import java.text.ParsePosition
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

internal fun parseNotificationTriggerAt(value: String): Long {
  val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
    isLenient = false
    timeZone = TimeZone.getTimeZone("UTC")
  }
  val position = ParsePosition(0)
  val parsed = parser.parse(value, position)
    ?: throw IllegalArgumentException("Invalid notification triggerAt")
  require(position.index == value.length) { "Invalid notification triggerAt" }
  return parsed.time
}
