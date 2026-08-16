import type {FocusSessionKeyValueStorage} from './focusSessionRepository';

export const FOCUS_SESSION_STORAGE_KEY = 'start-five.focus-sessions.v1';
export const FOCUS_SESSION_SNAPSHOT_SCHEMA = 'start-five.focus-sessions';
export const FOCUS_SESSION_SNAPSHOT_VERSION = 2;

export type FocusSessionAsyncKeyValueBackend = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

class FocusSessionStorageError extends Error {
  readonly code: string;
  readonly cause: unknown;

  constructor(code: string, cause: unknown) {
    super(code);
    this.name = 'FocusSessionStorageError';
    this.code = code;
    this.cause = cause;
  }
}

const adapters = new WeakMap<
  FocusSessionAsyncKeyValueBackend,
  FocusSessionKeyValueStorage
>();

export function createPersistentFocusSessionStorage(
  backend: FocusSessionAsyncKeyValueBackend,
): FocusSessionKeyValueStorage {
  const existing = adapters.get(backend);
  if (existing !== undefined) {
    return existing;
  }

  const storage: FocusSessionKeyValueStorage = {
    async getItem(key) {
      try {
        return await backend.getItem(key);
      } catch (error: unknown) {
        throw new FocusSessionStorageError(
          'FOCUS_SESSION_STORAGE_READ_FAILED',
          error,
        );
      }
    },
    async setItem(key, value) {
      try {
        await backend.setItem(key, value);
      } catch (error: unknown) {
        throw new FocusSessionStorageError(
          'FOCUS_SESSION_STORAGE_WRITE_FAILED',
          error,
        );
      }
    },
    async removeItem(key) {
      try {
        await backend.removeItem(key);
      } catch (error: unknown) {
        throw new FocusSessionStorageError(
          'FOCUS_SESSION_STORAGE_WRITE_FAILED',
          error,
        );
      }
    },
  };

  adapters.set(backend, storage);
  return storage;
}
