import {createFocusSessionService} from '../../src/application/focusSessionService';
import type {
  FocusSessionRepository,
  FocusSessionTransaction,
} from '../../src/data/focusSessionRepository';
import type {
  FocusDurationMinutes,
  FocusSession,
  FocusSessionInput,
  FocusSessionQueryResult,
} from '../../src/domain/focusSession';

export const BASE_TIME = '2026-08-05T08:00:00.000Z';

export class CodedTestError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'CodedTestError';
    this.code = code;
  }
}

export class ManualIsoClock {
  calls = 0;
  private current: string;

  constructor(initial: string = BASE_TIME) {
    this.current = initial;
  }

  readonly now = (): string => {
    this.calls += 1;
    return this.current;
  };

  set(value: string): void {
    this.current = value;
  }
}

export class SequenceIdGenerator {
  calls = 0;
  private readonly values: string[];

  constructor(values: readonly string[] = ['focus-001']) {
    this.values = [...values];
  }

  readonly next = (): string => {
    const index = this.calls;
    this.calls += 1;
    return this.values[index] ?? `focus-generated-${String(index + 1)}`;
  };
}

export type RepositoryCounters = {
  facadeLoad: number;
  facadeList: number;
  facadeGet: number;
  facadeSave: number;
  transactions: number;
  transactionLoad: number;
  transactionList: number;
  transactionGet: number;
  transactionSave: number;
  commits: number;
};

export const ZERO_REPOSITORY_COUNTERS: Readonly<RepositoryCounters> =
  Object.freeze({
    facadeLoad: 0,
    facadeList: 0,
    facadeGet: 0,
    facadeSave: 0,
    transactions: 0,
    transactionLoad: 0,
    transactionList: 0,
    transactionGet: 0,
    transactionSave: 0,
    commits: 0,
  });

function newCounters(): RepositoryCounters {
  return {...ZERO_REPOSITORY_COUNTERS};
}

export function cloneSession(session: FocusSession): FocusSession {
  return {...session};
}

export function cloneSessions(
  sessions: readonly FocusSession[],
): FocusSession[] {
  return sessions.map(cloneSession);
}

function upsertSession(
  sessions: FocusSession[],
  session: FocusSession,
): FocusSession {
  const stored = cloneSession(session);
  const index = sessions.findIndex(candidate => candidate.id === stored.id);
  if (index === -1) {
    sessions.push(stored);
  } else {
    sessions[index] = stored;
  }
  return cloneSession(stored);
}

export class TransactionalMemoryFocusRepository
  implements FocusSessionRepository
{
  readonly counters = newCounters();
  private sessions: FocusSession[];
  private queue: Promise<void> = Promise.resolve();
  private readFailures = 0;
  private saveFailures = 0;

  constructor(seed: readonly FocusSession[] = []) {
    this.sessions = cloneSessions(seed);
  }

  failNextRead(count = 1): void {
    this.readFailures += count;
  }

  failNextSave(count = 1): void {
    this.saveFailures += count;
  }

  snapshot(): FocusSession[] {
    return cloneSessions(this.sessions);
  }

  private maybeFailRead(): void {
    if (this.readFailures <= 0) {
      return;
    }
    this.readFailures -= 1;
    throw new CodedTestError('TEST_REPOSITORY_READ_FAILED');
  }

  private maybeFailSave(): void {
    if (this.saveFailures <= 0) {
      return;
    }
    this.saveFailures -= 1;
    throw new CodedTestError('TEST_REPOSITORY_SAVE_FAILED');
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async load(): Promise<readonly FocusSession[]> {
    this.counters.facadeLoad += 1;
    this.maybeFailRead();
    return cloneSessions(this.sessions);
  }

  async list(taskId?: string): Promise<readonly FocusSession[]> {
    this.counters.facadeList += 1;
    this.maybeFailRead();
    const selected =
      taskId === undefined
        ? this.sessions
        : this.sessions.filter(session => session.taskId === taskId);
    return cloneSessions(selected);
  }

  async get(sessionId: string): Promise<FocusSession | null> {
    this.counters.facadeGet += 1;
    this.maybeFailRead();
    const session = this.sessions.find(candidate => candidate.id === sessionId);
    return session === undefined ? null : cloneSession(session);
  }

  save(session: FocusSession): Promise<FocusSession> {
    this.counters.facadeSave += 1;
    return this.enqueue(async () => {
      this.maybeFailSave();
      const staged = cloneSessions(this.sessions);
      const saved = upsertSession(staged, session);
      this.sessions = staged;
      this.counters.commits += 1;
      return saved;
    });
  }

  transaction<T>(
    work: (transaction: FocusSessionTransaction) => Promise<T>,
  ): Promise<T> {
    this.counters.transactions += 1;
    return this.enqueue(async () => {
      const staged = cloneSessions(this.sessions);
      let dirty = false;
      const transaction = {
        load: async (): Promise<readonly FocusSession[]> => {
          this.counters.transactionLoad += 1;
          this.maybeFailRead();
          return cloneSessions(staged);
        },
        list: async (taskId?: string): Promise<readonly FocusSession[]> => {
          this.counters.transactionList += 1;
          this.maybeFailRead();
          const selected =
            taskId === undefined
              ? staged
              : staged.filter(session => session.taskId === taskId);
          return cloneSessions(selected);
        },
        get: async (sessionId: string): Promise<FocusSession | null> => {
          this.counters.transactionGet += 1;
          this.maybeFailRead();
          const session = staged.find(candidate => candidate.id === sessionId);
          return session === undefined ? null : cloneSession(session);
        },
        save: async (session: FocusSession): Promise<FocusSession> => {
          this.counters.transactionSave += 1;
          this.maybeFailSave();
          dirty = true;
          return upsertSession(staged, session);
        },
      };

      const result = await work(transaction);
      if (dirty) {
        this.sessions = cloneSessions(staged);
        this.counters.commits += 1;
      }
      return result;
    });
  }
}

export function makeSession(
  overrides: Partial<FocusSession> = {},
): FocusSession {
  const startedAt = overrides.startedAt ?? BASE_TIME;
  const plannedMinutes = overrides.plannedMinutes ?? 5;
  const plannedEndAt =
    overrides.plannedEndAt ??
    new Date(Date.parse(startedAt) + plannedMinutes * 60_000).toISOString();
  return {
    id: 'focus-001',
    taskId: 'task-001',
    plannedMinutes,
    status: 'running',
    startedAt,
    plannedEndAt,
    endedAt: null,
    actualSeconds: null,
    interruptionReason: null,
    createdAt: startedAt,
    updatedAt: startedAt,
    ...overrides,
  };
}

export function completedSession(
  overrides: Partial<FocusSession> = {},
): FocusSession {
  const running = makeSession(overrides);
  const endedAt = overrides.endedAt ?? running.plannedEndAt;
  return {
    ...running,
    status: 'completed',
    endedAt,
    actualSeconds:
      overrides.actualSeconds ??
      Math.floor((Date.parse(endedAt) - Date.parse(running.startedAt)) / 1_000),
    interruptionReason: null,
    updatedAt: overrides.updatedAt ?? endedAt,
  };
}

export function interruptedSession(
  overrides: Partial<FocusSession> = {},
): FocusSession {
  const running = makeSession(overrides);
  const endedAt =
    overrides.endedAt ??
    new Date(Date.parse(running.startedAt) + 90_000).toISOString();
  return {
    ...running,
    status: 'interrupted',
    endedAt,
    actualSeconds:
      overrides.actualSeconds ??
      Math.floor((Date.parse(endedAt) - Date.parse(running.startedAt)) / 1_000),
    interruptionReason: overrides.interruptionReason ?? 'user stopped',
    updatedAt: overrides.updatedAt ?? endedAt,
  };
}

export function createServiceHarness(options?: {
  seed?: readonly FocusSession[];
  now?: string;
  ids?: readonly string[];
}): {
  repository: TransactionalMemoryFocusRepository;
  clock: ManualIsoClock;
  ids: SequenceIdGenerator;
  service: ReturnType<typeof createFocusSessionService>;
} {
  const repository = new TransactionalMemoryFocusRepository(
    options?.seed ?? [],
  );
  const clock = new ManualIsoClock(options?.now ?? BASE_TIME);
  const ids = new SequenceIdGenerator(options?.ids ?? ['focus-001']);
  const service = createFocusSessionService({
    repository,
    now: clock.now,
    idGenerator: ids.next,
  });
  return {repository, clock, ids, service};
}

export async function expectRejectCode(
  promise: Promise<unknown>,
  code: string,
): Promise<unknown> {
  try {
    await promise;
  } catch (error: unknown) {
    expect(error).toMatchObject({code});
    return error;
  }
  throw new Error(`EXPECTED_REJECTION:${code}`);
}

export type RuntimeStartInput =
  | object
  | string
  | number
  | boolean
  | null
  | undefined;

type RuntimeStartAdapter = {
  start(candidate: RuntimeStartInput): Promise<FocusSession>;
};

function hasRuntimeStart(
  value: {readonly start: unknown},
): value is RuntimeStartAdapter {
  return typeof value.start === 'function';
}

export function invokeStart(
  service: ReturnType<typeof createFocusSessionService>,
  input: RuntimeStartInput,
): Promise<FocusSession> {
  const runtimeService: {readonly start: unknown} = service;
  if (!hasRuntimeStart(runtimeService)) {
    throw new Error('GAP_P0_02B_RUNTIME_START_REQUIRED');
  }
  return runtimeService.start(input);
}

export function invokeFinish(
  service: ReturnType<typeof createFocusSessionService>,
  sessionId: object | string | null,
): Promise<FocusSession> {
  const invoke = service.finish as (
    candidate: object | string | null,
  ) => Promise<FocusSession>;
  return invoke(sessionId);
}

export function invokeGetById(
  service: ReturnType<typeof createFocusSessionService>,
  sessionId: object | string | null,
): Promise<FocusSession | null> {
  const invoke = service.getById as (
    candidate: object | string | null,
  ) => Promise<FocusSession | null>;
  return invoke(sessionId);
}

export function invokeListForTask(
  service: ReturnType<typeof createFocusSessionService>,
  taskId: object | string | null,
): Promise<FocusSessionQueryResult> {
  const invoke = service.listForTask as (
    candidate: object | string | null,
  ) => Promise<FocusSessionQueryResult>;
  return invoke(taskId);
}

export function invokeInterrupt(
  service: ReturnType<typeof createFocusSessionService>,
  sessionId: object | string | null,
  reason: object | string | null,
): Promise<FocusSession> {
  const invoke = service.interrupt as (
    candidateId: object | string | null,
    candidateReason: object | string | null,
  ) => Promise<FocusSession>;
  return invoke(sessionId, reason);
}

export type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
};

export function createDeferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | undefined;
  let rejectPromise: ((reason: unknown) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve(value): void {
      if (resolvePromise === undefined) {
        throw new Error('DEFERRED_RESOLVE_NOT_READY');
      }
      resolvePromise(value);
    },
    reject(reason): void {
      if (rejectPromise === undefined) {
        throw new Error('DEFERRED_REJECT_NOT_READY');
      }
      rejectPromise(reason);
    },
  };
}

export async function drainMicrotasks(rounds = 8): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await Promise.resolve();
  }
}

export class ManualWriteBarrier {
  private readonly enteredGate = createDeferred<void>();
  private readonly releaseGate = createDeferred<void>();
  private released = false;

  readonly entered = this.enteredGate.promise;

  async wait(): Promise<void> {
    this.enteredGate.resolve(undefined);
    await this.releaseGate.promise;
  }

  release(): void {
    if (!this.released) {
      this.released = true;
      this.releaseGate.resolve(undefined);
    }
  }
}

type WriteBarrierRaceResult =
  | {kind: 'barrier'}
  | {kind: 'fulfilled'}
  | {kind: 'rejected'; error: unknown};

export async function expectWriteBarrierBeforeSettlement<T>(
  barrier: ManualWriteBarrier,
  operation: Promise<T>,
): Promise<void> {
  const barrierEntered = barrier.entered.then(
    (): WriteBarrierRaceResult => ({kind: 'barrier'}),
  );
  const operationSettled = operation.then(
    (): WriteBarrierRaceResult => ({kind: 'fulfilled'}),
    (error: unknown): WriteBarrierRaceResult => ({kind: 'rejected', error}),
  );
  const first = await Promise.race([barrierEntered, operationSettled]);
  if (first.kind === 'barrier') {
    return;
  }
  if (first.kind === 'rejected') {
    throw first.error;
  }
  throw new Error('FOCUS_SESSION_OPERATION_SETTLED_BEFORE_WRITE_BARRIER');
}

type RuntimeModule = {
  [key: string]: unknown;
};

function isFocusSessionStorage(value: unknown): value is FocusSessionStorage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as RuntimeModule;
  return (
    typeof candidate.getItem === 'function' &&
    typeof candidate.setItem === 'function' &&
    typeof candidate.removeItem === 'function'
  );
}

function isFocusSessionRepository(
  value: unknown,
): value is FocusSessionRepository {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as RuntimeModule;
  return (
    typeof candidate.load === 'function' &&
    typeof candidate.list === 'function' &&
    typeof candidate.get === 'function' &&
    typeof candidate.save === 'function' &&
    typeof candidate.transaction === 'function'
  );
}

export type FocusSessionBackend = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export class MemoryFocusBackend implements FocusSessionBackend {
  readonly reads: string[] = [];
  readonly writes: Array<{key: string; value: string}> = [];
  readonly deletes: string[] = [];
  private readonly values: Map<string, string>;
  private readFailures = 0;
  private writeFailures = 0;
  private nextWriteBarrier: ManualWriteBarrier | null = null;

  constructor(values: Map<string, string> = new Map()) {
    this.values = values;
  }

  fork(): MemoryFocusBackend {
    return new MemoryFocusBackend(this.values);
  }

  failNextRead(count = 1): void {
    this.readFailures += count;
  }

  failNextWrite(count = 1): void {
    this.writeFailures += count;
  }

  blockNextWrite(): ManualWriteBarrier {
    if (this.nextWriteBarrier !== null) {
      throw new Error('FOCUS_SESSION_WRITE_BARRIER_ALREADY_ARMED');
    }
    const barrier = new ManualWriteBarrier();
    this.nextWriteBarrier = barrier;
    return barrier;
  }

  raw(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  putRaw(key: string, value: string): void {
    this.values.set(key, value);
  }

  async getItem(key: string): Promise<string | null> {
    this.reads.push(key);
    if (this.readFailures > 0) {
      this.readFailures -= 1;
      throw new CodedTestError('BACKEND_READ_SENTINEL');
    }
    return this.raw(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    this.writes.push({key, value});
    if (this.writeFailures > 0) {
      this.writeFailures -= 1;
      throw new CodedTestError('BACKEND_WRITE_SENTINEL');
    }
    const barrier = this.nextWriteBarrier;
    this.nextWriteBarrier = null;
    if (barrier !== null) {
      await barrier.wait();
    }
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.deletes.push(key);
    this.values.delete(key);
  }
}

type FocusSessionStorage = FocusSessionBackend;

export type PersistentProduction = {
  defaultRepositoryKey: string;
  storageKey: string;
  schema: string;
  version: number;
  createStorage(backend: FocusSessionBackend): FocusSessionStorage;
  createRepository(
    storage: FocusSessionStorage,
    key?: string,
  ): FocusSessionRepository;
};

function requiredString(moduleValue: RuntimeModule, key: string): string {
  const candidate = moduleValue[key];
  if (typeof candidate !== 'string') {
    throw new Error(`GAP_P0_02B_IMPLEMENTATION_REQUIRED:${key}`);
  }
  return candidate;
}

function requiredNumber(moduleValue: RuntimeModule, key: string): number {
  const candidate = moduleValue[key];
  if (typeof candidate !== 'number') {
    throw new Error(`GAP_P0_02B_IMPLEMENTATION_REQUIRED:${key}`);
  }
  return candidate;
}

export function loadPersistentProduction(): PersistentProduction {
  const repositoryModule = jest.requireActual<RuntimeModule>(
    '../../src/data/focusSessionRepository',
  );
  let storageModule: RuntimeModule;
  try {
    storageModule = jest.requireActual<RuntimeModule>(
      '../../src/data/persistentFocusSessionStorage',
    );
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `GAP_P0_02B_IMPLEMENTATION_REQUIRED:persistentFocusSessionStorage:${detail}`,
    );
  }

  const repositoryFactory = repositoryModule.createFocusSessionRepository;
  if (typeof repositoryFactory !== 'function') {
    throw new Error(
      'GAP_P0_02B_IMPLEMENTATION_REQUIRED:createFocusSessionRepository',
    );
  }
  const storageFactory = storageModule.createPersistentFocusSessionStorage;
  if (typeof storageFactory !== 'function') {
    throw new Error(
      'GAP_P0_02B_IMPLEMENTATION_REQUIRED:createPersistentFocusSessionStorage',
    );
  }

  return {
    defaultRepositoryKey: requiredString(
      repositoryModule,
      'DEFAULT_FOCUS_SESSION_STORAGE_KEY',
    ),
    storageKey: requiredString(storageModule, 'FOCUS_SESSION_STORAGE_KEY'),
    schema: requiredString(storageModule, 'FOCUS_SESSION_SNAPSHOT_SCHEMA'),
    version: requiredNumber(storageModule, 'FOCUS_SESSION_SNAPSHOT_VERSION'),
    createStorage(backend): FocusSessionStorage {
      const storage = storageFactory(backend);
      if (!isFocusSessionStorage(storage)) {
        throw new Error(
          'GAP_P0_02B_IMPLEMENTATION_REQUIRED:FocusSessionKeyValueStorage',
        );
      }
      return storage;
    },
    createRepository(storage, key): FocusSessionRepository {
      const repository =
        key === undefined
          ? repositoryFactory(storage)
          : repositoryFactory(storage, key);
      if (!isFocusSessionRepository(repository)) {
        throw new Error(
          'GAP_P0_02B_IMPLEMENTATION_REQUIRED:FocusSessionRepository',
        );
      }
      return repository;
    },
  };
}

export function input(
  taskId: string,
  plannedMinutes: FocusDurationMinutes,
): FocusSessionInput {
  return {taskId, plannedMinutes};
}
