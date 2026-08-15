import type {FocusSession} from '../domain/focusSession';
import {
  FOCUS_SESSION_SNAPSHOT_SCHEMA,
  FOCUS_SESSION_SNAPSHOT_VERSION,
} from './persistentFocusSessionStorage';

export interface FocusSessionTransaction {
  load(): Promise<readonly FocusSession[]>;
  list(taskId?: string): Promise<readonly FocusSession[]>;
  get(sessionId: string): Promise<FocusSession | null>;
  save(session: FocusSession): Promise<FocusSession>;
}

export interface FocusSessionRepository extends FocusSessionTransaction {
  transaction<T>(
    work: (transaction: FocusSessionTransaction) => Promise<T>,
  ): Promise<T>;
}

export type FocusSessionKeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export const DEFAULT_FOCUS_SESSION_STORAGE_KEY =
  'start-five.focus-sessions.v1';

const SESSION_FIELDS = [
  'actualSeconds',
  'createdAt',
  'endedAt',
  'id',
  'interruptionReason',
  'plannedEndAt',
  'plannedMinutes',
  'startedAt',
  'status',
  'taskId',
  'updatedAt',
] as const;

const ENVELOPE_FIELDS = ['schema', 'sessions', 'version'] as const;
const SUPPORTED_DURATIONS = new Set([2, 5, 15, 25, 45, 50]);
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

class FocusSessionRepositoryError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'FocusSessionRepositoryError';
    this.code = code;
  }
}

type SharedCoordinator = {
  tail: Promise<void>;
  revision: number;
  synchronousTransactionCallbacks: number;
};

const coordinators = new WeakMap<
  FocusSessionKeyValueStorage,
  Map<string, SharedCoordinator>
>();

function coordinatorFor(
  storage: FocusSessionKeyValueStorage,
  key: string,
): SharedCoordinator {
  let byKey = coordinators.get(storage);
  if (byKey === undefined) {
    byKey = new Map();
    coordinators.set(storage, byKey);
  }
  let coordinator = byKey.get(key);
  if (coordinator === undefined) {
    coordinator = {
      tail: Promise.resolve(),
      revision: 0,
      synchronousTransactionCallbacks: 0,
    };
    byKey.set(key, coordinator);
  }
  return coordinator;
}

function enqueue<T>(
  coordinator: SharedCoordinator,
  work: () => Promise<T>,
): Promise<T> {
  const result = coordinator.tail.then(work);
  coordinator.tail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function codedError(code: string): FocusSessionRepositoryError {
  return new FocusSessionRepositoryError(code);
}

function cloneSession(session: FocusSession): FocusSession {
  return {...session};
}

function cloneSessions(sessions: readonly FocusSession[]): FocusSession[] {
  return sessions.map(cloneSession);
}

function captureSession(session: FocusSession): FocusSession {
  if (typeof session !== 'object' || session === null) {
    return session;
  }
  return {...session};
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    return false;
  }
  try {
    return new Date(milliseconds).toISOString() === value;
  } catch {
    return false;
  }
}

function isCanonicalIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.trim() === value &&
    !CONTROL_CHARACTERS.test(value)
  );
}

function isCanonicalReason(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.trim() === value
  );
}

function isValidSession(value: unknown): value is FocusSession {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  if (!hasExactKeys(value, SESSION_FIELDS)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (
    !isCanonicalIdentifier(record.id) ||
    !isCanonicalIdentifier(record.taskId) ||
    typeof record.plannedMinutes !== 'number' ||
    !SUPPORTED_DURATIONS.has(record.plannedMinutes) ||
    !isCanonicalTimestamp(record.startedAt) ||
    !isCanonicalTimestamp(record.plannedEndAt) ||
    !isCanonicalTimestamp(record.createdAt) ||
    !isCanonicalTimestamp(record.updatedAt)
  ) {
    return false;
  }

  const startedAt = Date.parse(record.startedAt);
  const plannedEndAt = Date.parse(record.plannedEndAt);
  if (
    record.createdAt !== record.startedAt ||
    plannedEndAt !== startedAt + record.plannedMinutes * 60_000
  ) {
    return false;
  }

  if (record.status === 'running') {
    return (
      record.endedAt === null &&
      record.actualSeconds === null &&
      record.interruptionReason === null &&
      record.updatedAt === record.startedAt
    );
  }

  if (record.status !== 'completed' && record.status !== 'interrupted') {
    return false;
  }
  if (
    !isCanonicalTimestamp(record.endedAt) ||
    typeof record.actualSeconds !== 'number' ||
    !Number.isFinite(record.actualSeconds) ||
    !Number.isInteger(record.actualSeconds) ||
    record.actualSeconds < 0 ||
    record.updatedAt !== record.endedAt
  ) {
    return false;
  }

  const endedAt = Date.parse(record.endedAt);
  if (
    endedAt < startedAt ||
    record.actualSeconds !== Math.floor((endedAt - startedAt) / 1_000)
  ) {
    return false;
  }

  if (record.status === 'completed') {
    return endedAt <= plannedEndAt && record.interruptionReason === null;
  }

  return (
    endedAt < plannedEndAt && isCanonicalReason(record.interruptionReason)
  );
}

function validateSessions(value: unknown): FocusSession[] {
  if (!Array.isArray(value)) {
    throw codedError('FOCUS_SESSION_SNAPSHOT_INVALID');
  }
  const sessions: FocusSession[] = [];
  const ids = new Set<string>();
  let running = 0;
  for (const candidate of value) {
    if (!isValidSession(candidate)) {
      throw codedError('FOCUS_SESSION_SNAPSHOT_INVALID');
    }
    if (ids.has(candidate.id)) {
      throw codedError('FOCUS_SESSION_SNAPSHOT_INVALID');
    }
    ids.add(candidate.id);
    if (candidate.status === 'running') {
      running += 1;
      if (running > 1) {
        throw codedError('FOCUS_SESSION_SNAPSHOT_INVALID');
      }
    }
    sessions.push(cloneSession(candidate));
  }
  return sessions;
}

function parseSnapshot(raw: string | null): FocusSession[] {
  if (raw === null) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw codedError('FOCUS_SESSION_SNAPSHOT_CORRUPT');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw codedError('FOCUS_SESSION_SNAPSHOT_UNSUPPORTED');
  }

  const envelope = parsed as Record<string, unknown>;
  if (
    envelope.schema !== FOCUS_SESSION_SNAPSHOT_SCHEMA ||
    envelope.version !== FOCUS_SESSION_SNAPSHOT_VERSION ||
    typeof envelope.schema !== 'string' ||
    typeof envelope.version !== 'number' ||
    !Number.isInteger(envelope.version)
  ) {
    throw codedError('FOCUS_SESSION_SNAPSHOT_UNSUPPORTED');
  }
  if (!hasExactKeys(parsed, ENVELOPE_FIELDS)) {
    throw codedError('FOCUS_SESSION_SNAPSHOT_INVALID');
  }
  return validateSessions(envelope.sessions);
}

export function validateFocusSessionBackup(raw: string | null): number {
  return parseSnapshot(raw).length;
}

function serializeSnapshot(sessions: readonly FocusSession[]): string {
  return JSON.stringify({
    schema: FOCUS_SESSION_SNAPSHOT_SCHEMA,
    version: FOCUS_SESSION_SNAPSHOT_VERSION,
    sessions,
  });
}

function sameSession(left: FocusSession, right: FocusSession): boolean {
  return SESSION_FIELDS.every(field => left[field] === right[field]);
}

function upsert(
  sessions: FocusSession[],
  captured: FocusSession,
): {saved: FocusSession; changed: boolean} {
  if (!isValidSession(captured)) {
    throw codedError('FOCUS_SESSION_SNAPSHOT_INVALID');
  }
  const index = sessions.findIndex(candidate => candidate.id === captured.id);
  if (index === -1) {
    const next = [...sessions, cloneSession(captured)];
    validateSessions(next);
    sessions.push(cloneSession(captured));
    return {saved: cloneSession(captured), changed: true};
  }

  const previous = sessions[index];
  if (previous === undefined) {
    throw codedError('FOCUS_SESSION_SNAPSHOT_INVALID');
  }
  if (sameSession(previous, captured)) {
    return {saved: cloneSession(previous), changed: false};
  }
  if (previous.status !== 'running') {
    throw codedError('FOCUS_SESSION_SNAPSHOT_INVALID');
  }

  const next = cloneSessions(sessions);
  next[index] = cloneSession(captured);
  validateSessions(next);
  sessions[index] = cloneSession(captured);
  return {saved: cloneSession(captured), changed: true};
}

export function createFocusSessionRepository(
  storage: FocusSessionKeyValueStorage,
  key: string = DEFAULT_FOCUS_SESSION_STORAGE_KEY,
): FocusSessionRepository {
  const coordinator = coordinatorFor(storage, key);
  let cache: FocusSession[] | null = null;
  let observedRevision = -1;

  async function hydrate(): Promise<FocusSession[]> {
    if (cache !== null && observedRevision === coordinator.revision) {
      return cache;
    }
    const loaded = parseSnapshot(await storage.getItem(key));
    cache = cloneSessions(loaded);
    observedRevision = coordinator.revision;
    return cache;
  }

  function rejectReentrantMutation<T>(): Promise<T> | null {
    if (coordinator.synchronousTransactionCallbacks > 0) {
      return Promise.reject(
        codedError('FOCUS_SESSION_REPOSITORY_REENTRANT_MUTATION'),
      );
    }
    return null;
  }

  async function load(): Promise<readonly FocusSession[]> {
    return cloneSessions(await hydrate());
  }

  async function list(taskId?: string): Promise<readonly FocusSession[]> {
    const sessions = await hydrate();
    return cloneSessions(
      taskId === undefined
        ? sessions
        : sessions.filter(session => session.taskId === taskId),
    );
  }

  async function get(sessionId: string): Promise<FocusSession | null> {
    const sessions = await hydrate();
    const found = sessions.find(session => session.id === sessionId);
    return found === undefined ? null : cloneSession(found);
  }

  function save(session: FocusSession): Promise<FocusSession> {
    const captured = captureSession(session);
    const reentrant = rejectReentrantMutation<FocusSession>();
    if (reentrant !== null) {
      return reentrant;
    }
    return enqueue(coordinator, async () => {
      const current = cloneSessions(await hydrate());
      const result = upsert(current, captured);
      if (!result.changed) {
        return result.saved;
      }
      await storage.setItem(key, serializeSnapshot(current));
      cache = cloneSessions(current);
      coordinator.revision += 1;
      observedRevision = coordinator.revision;
      return cloneSession(result.saved);
    });
  }

  function transaction<T>(
    work: (transaction: FocusSessionTransaction) => Promise<T>,
  ): Promise<T> {
    const reentrant = rejectReentrantMutation<T>();
    if (reentrant !== null) {
      return reentrant;
    }
    return enqueue(coordinator, async () => {
      const staged = cloneSessions(await hydrate());
      let dirty = false;
      let active = true;
      const listSnapshots = new Map<string | undefined, FocusSession[]>();

      function ensureActive(): void {
        if (!active) {
          throw codedError('FOCUS_SESSION_REPOSITORY_TRANSACTION_EXPIRED');
        }
      }

      const surface: FocusSessionTransaction = {
        async load() {
          ensureActive();
          return cloneSessions(staged);
        },
        async list(taskId?: string) {
          ensureActive();
          // Predicate reads are repeatable within one transaction. Returned
          // values are always fresh clones of the first matching staged view.
          let snapshot = listSnapshots.get(taskId);
          if (snapshot === undefined) {
            snapshot = cloneSessions(
              taskId === undefined
                ? staged
                : staged.filter(session => session.taskId === taskId),
            );
            listSnapshots.set(taskId, snapshot);
          }
          return cloneSessions(snapshot);
        },
        async get(sessionId: string) {
          ensureActive();
          const found = staged.find(session => session.id === sessionId);
          return found === undefined ? null : cloneSession(found);
        },
        async save(session: FocusSession) {
          ensureActive();
          const captured = captureSession(session);
          const result = upsert(staged, captured);
          dirty = dirty || result.changed;
          return cloneSession(result.saved);
        },
      };

      try {
        let pending: Promise<T>;
        coordinator.synchronousTransactionCallbacks += 1;
        try {
          pending = work(surface);
        } finally {
          coordinator.synchronousTransactionCallbacks -= 1;
        }
        const result = await pending;
        if (dirty) {
          await storage.setItem(key, serializeSnapshot(staged));
          cache = cloneSessions(staged);
          coordinator.revision += 1;
          observedRevision = coordinator.revision;
        }
        return result;
      } finally {
        active = false;
      }
    });
  }

  return {load, list, get, save, transaction};
}
