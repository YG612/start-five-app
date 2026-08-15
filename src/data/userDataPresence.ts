import type {AsyncKeyValueBackend} from './persistentTaskStorage';
import {TASK_STORAGE_KEY} from './persistentTaskStorage';
import {FOCUS_SESSION_STORAGE_KEY} from './persistentFocusSessionStorage';
import {POST_FOCUS_REVIEW_STORAGE_KEY} from './postFocusReviewRepository';

// Keep durable key knowledge inside the data layer. A present empty/deleted task
// envelope still counts as an existing installation.
const CURRENT_USER_STORE_KEYS = [
  TASK_STORAGE_KEY,
  FOCUS_SESSION_STORAGE_KEY,
  POST_FOCUS_REVIEW_STORAGE_KEY,
  'start-five.day-closure.v1',
  'start-five/reminder-scheduling/v1',
  'start-five/tomorrow-first-reminder/v1',
] as const;

export async function hasExistingUserData(
  backend: AsyncKeyValueBackend,
): Promise<boolean> {
  for (const key of CURRENT_USER_STORE_KEYS) {
    if ((await backend.getItem(key)) !== null) {
      return true;
    }
  }
  return false;
}
