package com.startfive.app.notifications

import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import org.json.JSONArray
import org.json.JSONObject

internal data class NotificationIdReservation(
  val stableId: String,
  val notificationId: Int,
  val created: Boolean,
)

internal data class StoredIntent(
  val taskId: String,
  val ruleId: String,
  val kind: String,
  val triggerAt: String,
) {
  val stableId: String
    get() = "reminder:$taskId:$ruleId"
}

internal data class StoredSnapshot(
  val taskId: String,
  val generation: Int,
  val permission: String,
  val intents: List<StoredIntent>,
  val scheduled: Boolean,
  val needsRecovery: Boolean = false,
)

internal class NotificationStore(context: Context) {
  private val preferences = context.getSharedPreferences(
    "start_five_notifications_v1",
    Context.MODE_PRIVATE,
  )

  fun reserveNotificationId(stableId: String): NotificationIdReservation = locked {
    val key = notificationIdKey(stableId)
    val existing = preferences.getInt(key, 0)
    if (existing != 0) {
      return@locked NotificationIdReservation(stableId, existing, false)
    }

    var candidate = stableId.hashCode() and Int.MAX_VALUE
    if (candidate == 0) candidate = 1
    while (true) {
      val owner = preferences.getString(notificationOwnerKey(candidate), null)
      if (owner == null || owner == stableId) {
        requireCommit(
          preferences.edit()
            .putInt(key, candidate)
            .putString(notificationOwnerKey(candidate), stableId),
        )
        return@locked NotificationIdReservation(stableId, candidate, true)
      }
      candidate = if (candidate == Int.MAX_VALUE) 1 else candidate + 1
    }
    error("unreachable")
  }

  fun notificationId(stableId: String): Int =
    reserveNotificationId(stableId).notificationId

  fun findNotificationId(stableId: String): Int? = locked {
    preferences.getInt(notificationIdKey(stableId), 0).takeIf { it != 0 }
  }

  fun releaseNotificationId(reservation: NotificationIdReservation) = locked {
    if (!reservation.created) return@locked
    val idKey = notificationIdKey(reservation.stableId)
    val ownerKey = notificationOwnerKey(reservation.notificationId)
    if (
      preferences.getInt(idKey, 0) == reservation.notificationId &&
      preferences.getString(ownerKey, null) == reservation.stableId
    ) {
      requireCommit(preferences.edit().remove(idKey).remove(ownerKey))
    }
  }

  fun get(taskId: String): StoredSnapshot? = locked {
    val raw = preferences.getString(snapshotKey(taskId), null) ?: return@locked null
    parseJson(JSONObject(raw))
  }

  fun all(): List<StoredSnapshot> = locked {
    val snapshots = mutableListOf<StoredSnapshot>()
    val corruptKeys = mutableListOf<String>()
    preferences.all.keys
      .filter { it.startsWith(SNAPSHOT_PREFIX) }
      .sorted()
      .forEach { key ->
        val raw = preferences.getString(key, null)
        if (raw == null) {
          corruptKeys += key
        } else {
          try {
            snapshots += parseJson(JSONObject(raw))
          } catch (_: Exception) {
            corruptKeys += key
          }
        }
      }
    if (corruptKeys.isNotEmpty()) {
      val editor = preferences.edit()
      corruptKeys.forEach(editor::remove)
      requireCommit(editor)
    }
    snapshots
  }

  fun put(snapshot: StoredSnapshot) = locked {
    requireCommit(
      preferences.edit()
        .putString(snapshotKey(snapshot.taskId), toJson(snapshot).toString()),
    )
  }

  fun remove(taskId: String) = locked {
    requireCommit(preferences.edit().remove(snapshotKey(taskId)))
  }

  fun consumeIntent(taskId: String, stableId: String): Boolean = locked {
    val snapshot = get(taskId) ?: return@locked false
    val remaining = snapshot.intents.filterNot { it.stableId == stableId }
    if (remaining.size == snapshot.intents.size) return@locked false
    if (remaining.isEmpty()) {
      remove(taskId)
    } else {
      put(snapshot.copy(intents = remaining, scheduled = true))
    }
    true
  }

  private fun snapshotKey(taskId: String) = "$SNAPSHOT_PREFIX$taskId"

  private fun notificationIdKey(stableId: String) = "id:$stableId"

  private fun notificationOwnerKey(notificationId: Int) = "owner:$notificationId"

  private fun requireCommit(editor: android.content.SharedPreferences.Editor) {
    check(editor.commit()) { "NOTIFICATION_STORE_COMMIT_FAILED" }
  }

  companion object {
    private const val SNAPSHOT_PREFIX = "snapshot:"
    private val storageLock = Any()

    fun <T> locked(work: () -> T): T = synchronized(storageLock, work)

    fun fromReadable(map: ReadableMap): StoredSnapshot {
      val taskId = requiredString(map, "taskId")
      val generation = map.getInt("generation")
      val permission = requiredString(map, "permission")
      val scheduled = map.getBoolean("scheduled")
      val array = map.getArray("intents") ?: throw IllegalArgumentException("intents is required")
      val intents = buildList {
        for (index in 0 until array.size()) {
          val item = array.getMap(index) ?: throw IllegalArgumentException("intent is required")
          val intent = StoredIntent(
            taskId = requiredString(item, "taskId"),
            ruleId = requiredString(item, "ruleId"),
            kind = requiredString(item, "kind"),
            triggerAt = requiredString(item, "triggerAt"),
          )
          require(intent.taskId == taskId) { "intent taskId mismatch" }
          add(intent)
        }
      }
      return StoredSnapshot(
        taskId,
        generation,
        permission,
        intents,
        scheduled,
        needsRecovery = false,
      )
    }

    fun toWritable(snapshot: StoredSnapshot): WritableMap = Arguments.createMap().apply {
      putString("taskId", snapshot.taskId)
      putInt("generation", snapshot.generation)
      putString("permission", snapshot.permission)
      putBoolean("scheduled", snapshot.scheduled)
      putArray("intents", Arguments.createArray().apply {
        snapshot.intents.forEach { intent ->
          pushMap(Arguments.createMap().apply {
            putString("taskId", intent.taskId)
            putString("ruleId", intent.ruleId)
            putString("kind", intent.kind)
            putString("triggerAt", intent.triggerAt)
          })
        }
      })
    }

    private fun requiredString(map: ReadableMap, key: String): String =
      map.getString(key)?.takeIf { it.isNotEmpty() }
        ?: throw IllegalArgumentException("$key is required")

    private fun toJson(snapshot: StoredSnapshot) = JSONObject().apply {
      put("taskId", snapshot.taskId)
      put("generation", snapshot.generation)
      put("permission", snapshot.permission)
      put("scheduled", snapshot.scheduled)
      put("needsRecovery", snapshot.needsRecovery)
      put("intents", JSONArray().apply {
        snapshot.intents.forEach { intent ->
          put(JSONObject().apply {
            put("taskId", intent.taskId)
            put("ruleId", intent.ruleId)
            put("kind", intent.kind)
            put("triggerAt", intent.triggerAt)
          })
        }
      })
    }

    private fun parseJson(value: JSONObject): StoredSnapshot {
      val intentsJson = value.getJSONArray("intents")
      val intents = buildList {
        for (index in 0 until intentsJson.length()) {
          val item = intentsJson.getJSONObject(index)
          add(StoredIntent(
            taskId = item.getString("taskId"),
            ruleId = item.getString("ruleId"),
            kind = item.getString("kind"),
            triggerAt = item.getString("triggerAt"),
          ))
        }
      }
      return StoredSnapshot(
        taskId = value.getString("taskId"),
        generation = value.getInt("generation"),
        permission = value.getString("permission"),
        intents = intents,
        scheduled = value.getBoolean("scheduled"),
        needsRecovery = value.optBoolean("needsRecovery", false),
      )
    }
  }
}
