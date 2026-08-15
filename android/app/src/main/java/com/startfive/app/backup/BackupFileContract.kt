package com.startfive.app.backup

internal object BackupFileContract {
  const val MODULE_NAME = "StartFiveBackupFiles"
  private const val SAVE_REQUEST_CODE_BASE = 0x4000
  private const val PICK_REQUEST_CODE_BASE = 0x6000
  private const val REQUEST_CODE_SLOTS = 0x2000
  const val MIME_TYPE = "application/json"
  const val MAX_BYTES = 8 * 1024 * 1024

  fun saveRequestCode(operationToken: Long): Int =
    SAVE_REQUEST_CODE_BASE + ((operationToken - 1) % REQUEST_CODE_SLOTS).toInt()

  fun pickRequestCode(operationToken: Long): Int =
    PICK_REQUEST_CODE_BASE + ((operationToken - 1) % REQUEST_CODE_SLOTS).toInt()

  fun isReservedRequestCode(requestCode: Int): Boolean =
    requestCode in SAVE_REQUEST_CODE_BASE until (PICK_REQUEST_CODE_BASE + REQUEST_CODE_SLOTS)
}
