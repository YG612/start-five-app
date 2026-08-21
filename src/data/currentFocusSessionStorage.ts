import type {FocusSessionKeyValueStorage} from './focusSessionRepository';
import {
  createPersistentFocusSessionStorage,
  type FocusSessionAsyncKeyValueBackend,
} from './persistentFocusSessionStorage';

export const CURRENT_FOCUS_SESSION_STORAGE_KEY =
  'start-five.focus-sessions.v1';
export const CURRENT_FOCUS_SESSION_SNAPSHOT_SCHEMA =
  'start-five.focus-sessions';
export const CURRENT_FOCUS_SESSION_SNAPSHOT_VERSION = 2;

const CURRENT_STORAGE_MARKER = Symbol.for(
  'start-five.current-focus-session-storage.v2',
);
const adapters = new WeakMap<
  FocusSessionAsyncKeyValueBackend,
  FocusSessionKeyValueStorage
>();

/**
 * Opts a backend into the current v2 focus-session envelope while the legacy
 * adapter keeps its immutable v1 contract.
 */
export function createCurrentFocusSessionStorage(
  backend: FocusSessionAsyncKeyValueBackend,
): FocusSessionKeyValueStorage {
  const existing = adapters.get(backend);
  if (existing !== undefined) return existing;

  const legacy = createPersistentFocusSessionStorage(backend);
  const storage: FocusSessionKeyValueStorage = {
    getItem: key => legacy.getItem(key),
    setItem: (key, value) => legacy.setItem(key, value),
    removeItem: key => legacy.removeItem(key),
  };
  Object.defineProperty(storage, CURRENT_STORAGE_MARKER, {
    value: true,
    enumerable: false,
  });
  adapters.set(backend, storage);
  return storage;
}
