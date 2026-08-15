import type {StartFiveAppComposition} from '../../src/app/startFiveApp';
import type {KeyValueStorage} from '../../src/data/taskRepository';
import type {Subtask, Task} from '../../src/domain/task';

export const CURRENT_STORAGE_KEY = 'start-five.tasks.v1';
export const LEGACY_STORAGE_KEY = 'start-five.tasks';
export const FOCUS_SESSION_SENTINEL_KEY = 'start-five.focus-sessions.v1';
export const PENDING_RECOVERY_KEY = 'start-five.tasks.recovery.pending.v1';
export const SNAPSHOT_SCHEMA = 'start-five.tasks';
export const CURRENT_SCHEMA_VERSION = 1;
export const LEGACY_SCHEMA_VERSION = 0;
export const QUARANTINE_KEY_PREFIX = 'start-five.tasks.quarantine.';
export const FIXED_NOW = '2026-08-05T08:00:00.000Z';
export const FIXED_BACKUP_ID = 'backup-001';
export const FOCUS_SENTINEL_RAW =
  '{"schema":"start-five.focus-sessions","version":1,"sessions":[]}';

export type AsyncKeyValueBackend = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type IntegrityCategory =
  | 'MALFORMED_JSON'
  | 'WRONG_ROOT'
  | 'UNSUPPORTED_SCHEMA'
  | 'UNSUPPORTED_VERSION'
  | 'INVALID_SNAPSHOT';

export type TaskDataInspection =
  | {state: 'empty'}
  | {
      state: 'current';
      schema: typeof SNAPSHOT_SCHEMA;
      version: typeof CURRENT_SCHEMA_VERSION;
      taskCount: number;
    }
  | {
      state: 'legacy';
      sourceKey: typeof CURRENT_STORAGE_KEY | typeof LEGACY_STORAGE_KEY;
      fromVersion: typeof LEGACY_SCHEMA_VERSION | 'default';
      taskCount: number;
    }
  | {
      state: 'unreadable';
      sourceKey: typeof CURRENT_STORAGE_KEY | typeof LEGACY_STORAGE_KEY;
      category: IntegrityCategory;
    }
  | {
      state: 'conflict';
      currentKey: typeof CURRENT_STORAGE_KEY;
      legacyKey: typeof LEGACY_STORAGE_KEY;
    };

export type QuarantineReceipt = {
  state: 'quarantined';
  backupKey: string;
  category: IntegrityCategory;
  createdAt: string;
};

export type RecoveryReceipt = {
  state: 'recovered';
  backupKey: string;
  version: typeof CURRENT_SCHEMA_VERSION;
  taskCount: number;
};

export type RestoreReceipt = {
  state: 'restored';
  backupKey: string;
  version: typeof CURRENT_SCHEMA_VERSION;
  taskCount: number;
};

export type RecoveryDependencies = {
  now(): string;
  idGenerator(): string;
};

export interface TaskDataRecoveryController {
  inspect(): Promise<TaskDataInspection>;
  quarantine(): Promise<QuarantineReceipt>;
  recover(backupKey: string, candidate: unknown): Promise<RecoveryReceipt>;
  restore(backupKey: string): Promise<RestoreReceipt>;
}

export interface ManagedTaskStorage
  extends KeyValueStorage,
    TaskDataRecoveryController {}

export type StartFiveManagedRuntime = {
  app: StartFiveAppComposition;
  recovery: TaskDataRecoveryController;
};

type PersistentTaskStorageModule = {
  createPersistentTaskStorage(
    backend: AsyncKeyValueBackend,
  ): KeyValueStorage;
  createPersistentTaskStorage(
    backend: AsyncKeyValueBackend,
    dependencies: RecoveryDependencies,
  ): ManagedTaskStorage;
};

type ManagedRuntimeModule = {
  createStartFiveManagedRuntime(dependencies: {
    storageBackend: AsyncKeyValueBackend;
    now(): string;
    idGenerator(): string;
  }): StartFiveManagedRuntime;
};

export function loadPersistentTaskStorageModule(): PersistentTaskStorageModule {
  return jest.requireActual<PersistentTaskStorageModule>(
    '../../src/data/persistentTaskStorage',
  );
}

function isMissingRequestedModule(
  error: unknown,
  requested: string,
): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const code = Reflect.get(error, 'code');
  const message = Reflect.get(error, 'message');
  if (code !== 'MODULE_NOT_FOUND' || typeof message !== 'string') {
    return false;
  }
  const firstLine = message.split(/\r?\n/, 1)[0] ?? '';
  return (
    firstLine === `Cannot find module '${requested}'` ||
    firstLine.startsWith(`Cannot find module '${requested}' from `) ||
    firstLine === `Cannot find module "${requested}"` ||
    firstLine.startsWith(`Cannot find module "${requested}" from `)
  );
}

export type RequireActual = (moduleName: string) => unknown;

export function loadManagedRuntimeModule(
  requireActual: RequireActual = moduleName => jest.requireActual(moduleName),
): ManagedRuntimeModule {
  const requested = '../../src/app/startFiveManagedRuntime';
  try {
    const loaded = requireActual(requested);
    if (typeof loaded !== 'object' || loaded === null) {
      throw new Error('GAP_P0_04_INVALID_RUNTIME_MODULE');
    }
    const factory = Reflect.get(loaded, 'createStartFiveManagedRuntime');
    if (typeof factory !== 'function') {
      throw new Error('GAP_P0_04_INVALID_RUNTIME_MODULE');
    }
    return {
      createStartFiveManagedRuntime(dependencies) {
        return Reflect.apply(factory, loaded, [dependencies]);
      },
    };
  } catch (error: unknown) {
    if (isMissingRequestedModule(error, requested)) {
      throw new Error(
        'GAP_P0_04_IMPLEMENTATION_REQUIRED:createStartFiveManagedRuntime',
      );
    }
    throw error;
  }
}

export function createManagedStorage(
  backend: AsyncKeyValueBackend,
  dependencies: RecoveryDependencies,
): ManagedTaskStorage {
  return loadPersistentTaskStorageModule().createPersistentTaskStorage(
    backend,
    dependencies,
  );
}

export function createCompatibilityStorage(
  backend: AsyncKeyValueBackend,
): KeyValueStorage {
  return loadPersistentTaskStorageModule().createPersistentTaskStorage(backend);
}

export function createManagedRuntime(
  backend: AsyncKeyValueBackend,
  dependencies: RecoveryDependencies,
): StartFiveManagedRuntime {
  return loadManagedRuntimeModule().createStartFiveManagedRuntime({
    storageBackend: backend,
    now: dependencies.now,
    idGenerator: dependencies.idGenerator,
  });
}

function implementationRequired(method: string): never {
  throw new Error(`GAP_P0_04_IMPLEMENTATION_REQUIRED:${method}`);
}

export function inspectStorage(
  storage: TaskDataRecoveryController,
): Promise<TaskDataInspection> {
  if (typeof storage.inspect !== 'function') {
    return implementationRequired('inspect');
  }
  return storage.inspect();
}

export function quarantineStorage(
  storage: TaskDataRecoveryController,
): Promise<QuarantineReceipt> {
  if (typeof storage.quarantine !== 'function') {
    return implementationRequired('quarantine');
  }
  return storage.quarantine();
}

export function recoverStorage(
  storage: TaskDataRecoveryController,
  backupKeyValue: string,
  candidate: unknown,
): Promise<RecoveryReceipt> {
  if (typeof storage.recover !== 'function') {
    return implementationRequired('recover');
  }
  return storage.recover(backupKeyValue, candidate);
}

export function restoreStorage(
  storage: TaskDataRecoveryController,
  backupKeyValue: string,
): Promise<RestoreReceipt> {
  if (typeof storage.restore !== 'function') {
    return implementationRequired('restore');
  }
  return storage.restore(backupKeyValue);
}

export type PromiseOutcome<T> =
  | {status: 'fulfilled'; value: T}
  | {status: 'rejected'; error: unknown};

export async function captureOutcome<T>(
  promise: Promise<T>,
): Promise<PromiseOutcome<T>> {
  try {
    return {status: 'fulfilled', value: await promise};
  } catch (error: unknown) {
    return {status: 'rejected', error};
  }
}

export function errorView(error: unknown): {
  code: unknown;
  message: unknown;
  category: unknown;
  cause: unknown;
} {
  if (typeof error !== 'object' || error === null) {
    return {
      code: undefined,
      message: undefined,
      category: undefined,
      cause: undefined,
    };
  }
  return {
    code: Reflect.get(error, 'code'),
    message: Reflect.get(error, 'message'),
    category: Reflect.get(error, 'category'),
    cause: Reflect.get(error, 'cause'),
  };
}

export function publicErrorText(error: unknown): string {
  if (typeof error !== 'object' || error === null) {
    return String(error);
  }
  const message = Reflect.get(error, 'message');
  const stack = Reflect.get(error, 'stack');
  let serialized = '';
  try {
    serialized = JSON.stringify(error);
  } catch {
    serialized = '[UNSERIALIZABLE_ERROR]';
  }
  return `${String(message)}\n${String(stack)}\n${serialized}`;
}

export function makeTask(
  id: string,
  overrides: Partial<Task> = {},
): Task {
  return {
    id,
    title: `Recovery task ${id}`,
    description: `Durable task ${id}`,
    important: true,
    urgent: false,
    status: 'pending',
    startAt: '2026-08-05T09:00:00.000Z',
    dueAt: '2026-08-05T12:00:00.000Z',
    createdAt: '2026-08-05T07:00:00.000Z',
    updatedAt: '2026-08-05T07:00:00.000Z',
    startedAt: null,
    completedAt: null,
    deletedAt: null,
    score: null,
    scoreAwardedAt: null,
    subtasks: [],
    ...overrides,
  };
}

export function makeSubtask(
  taskId: string,
  ordinal: number,
  overrides: Partial<Subtask> = {},
): Subtask {
  return {
    id: `${taskId}-step-${ordinal}`,
    taskId,
    title: `Recovery step ${ordinal}`,
    status: 'pending',
    createdAt: '2026-08-05T07:00:00.000Z',
    updatedAt: '2026-08-05T07:00:00.000Z',
    completedAt: null,
    ...overrides,
  };
}

export function makeCompletedTask(id: string): Task {
  const completedAt = '2026-08-05T07:10:00.000Z';
  return makeTask(id, {
    status: 'completed',
    startedAt: '2026-08-05T07:02:00.000Z',
    completedAt,
    updatedAt: completedAt,
    score: 10,
    scoreAwardedAt: completedAt,
    subtasks: [
      makeSubtask(id, 0, {
        status: 'completed',
        updatedAt: '2026-08-05T07:08:00.000Z',
        completedAt: '2026-08-05T07:08:00.000Z',
      }),
    ],
  });
}

export function cloneTask(task: Task): Task {
  return {...task, subtasks: task.subtasks.map(step => ({...step}))};
}

export function currentEnvelopeObject(
  tasks: readonly Task[],
): Record<string, unknown> {
  return {
    schema: SNAPSHOT_SCHEMA,
    version: CURRENT_SCHEMA_VERSION,
    tasks,
  };
}

export function versionEnvelopeObject(
  tasks: readonly Task[],
  version: unknown,
): Record<string, unknown> {
  return {schema: SNAPSHOT_SCHEMA, version, tasks};
}

export function defaultEnvelopeObject(
  tasks: readonly Task[],
): Record<string, unknown> {
  return {schema: SNAPSHOT_SCHEMA, tasks};
}

export function currentEnvelope(tasks: readonly Task[]): string {
  return JSON.stringify(currentEnvelopeObject(tasks));
}

export function legacyVersionEnvelope(tasks: readonly Task[]): string {
  return JSON.stringify(versionEnvelopeObject(tasks, LEGACY_SCHEMA_VERSION));
}

export function defaultVersionEnvelope(tasks: readonly Task[]): string {
  return JSON.stringify(defaultEnvelopeObject(tasks));
}

export function legacyRawArray(tasks: readonly Task[]): string {
  return JSON.stringify(tasks);
}

export function backupKey(id: string = FIXED_BACKUP_ID): string {
  return `${QUARANTINE_KEY_PREFIX}${id}`;
}

export type PendingRecoveryRecord = {
  schema: 'start-five.task-recovery-pending';
  version: 1;
  operation: 'quarantine';
  sourceKey: typeof CURRENT_STORAGE_KEY | typeof LEGACY_STORAGE_KEY;
  backupKey: string;
  category: IntegrityCategory;
  createdAt: string;
};

export function pendingRecord(
  sourceKey: typeof CURRENT_STORAGE_KEY | typeof LEGACY_STORAGE_KEY,
  backupKeyValue: string = backupKey(),
  category: IntegrityCategory = 'MALFORMED_JSON',
  createdAt: string = FIXED_NOW,
): PendingRecoveryRecord {
  return {
    schema: 'start-five.task-recovery-pending',
    version: 1,
    operation: 'quarantine',
    sourceKey,
    backupKey: backupKeyValue,
    category,
    createdAt,
  };
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
};

export function deferred<T>(): Deferred<T> {
  let resolvePromise: (value: T) => void = () => {
    throw new Error('DEFERRED_NOT_INITIALIZED');
  };
  const promise = new Promise<T>(resolve => {
    resolvePromise = resolve;
  });
  return {promise, resolve: resolvePromise};
}

export async function afterMicrotasks(turns: number): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) {
    await Promise.resolve();
  }
}

export type BackendOperation = 'get' | 'set' | 'remove';

type OperationHold = {
  operation: BackendOperation;
  key: string;
  entered: Deferred<void>;
  release: Deferred<void>;
};

type TargetedFailure = {
  operation: BackendOperation;
  key: string;
  error: unknown;
};

export type BackendEvent = {
  operation: BackendOperation;
  phase: 'attempt' | 'commit';
  key: string;
  value?: string;
};

export class ControlledBackend implements AsyncKeyValueBackend {
  readonly getAttempts: string[] = [];
  readonly setAttempts: Array<{key: string; value: string}> = [];
  readonly setCommits: Array<{key: string; value: string}> = [];
  readonly removeAttempts: string[] = [];
  readonly removeCommits: string[] = [];
  readonly events: BackendEvent[] = [];

  private readonly holds: OperationHold[] = [];
  private readonly failures: TargetedFailure[] = [];

  constructor(readonly values: Map<string, string> = new Map()) {}

  private takeFailure(
    operation: BackendOperation,
    key: string,
  ): unknown | undefined {
    const index = this.failures.findIndex(
      failure => failure.operation === operation && failure.key === key,
    );
    if (index < 0) {
      return undefined;
    }
    const [failure] = this.failures.splice(index, 1);
    return failure?.error;
  }

  private async waitOnHold(
    operation: BackendOperation,
    key: string,
  ): Promise<void> {
    const index = this.holds.findIndex(
      hold => hold.operation === operation && hold.key === key,
    );
    if (index < 0) {
      return;
    }
    const [hold] = this.holds.splice(index, 1);
    if (hold === undefined) {
      return;
    }
    hold.entered.resolve();
    await hold.release.promise;
  }

  async getItem(key: string): Promise<string | null> {
    this.getAttempts.push(key);
    this.events.push({operation: 'get', phase: 'attempt', key});
    const failure = this.takeFailure('get', key);
    if (failure !== undefined) {
      throw failure;
    }
    await this.waitOnHold('get', key);
    this.events.push({operation: 'get', phase: 'commit', key});
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.setAttempts.push({key, value});
    this.events.push({
      operation: 'set',
      phase: 'attempt',
      key,
      value,
    });
    const failure = this.takeFailure('set', key);
    if (failure !== undefined) {
      throw failure;
    }
    await this.waitOnHold('set', key);
    this.values.set(key, value);
    this.setCommits.push({key, value});
    this.events.push({
      operation: 'set',
      phase: 'commit',
      key,
      value,
    });
  }

  async removeItem(key: string): Promise<void> {
    this.removeAttempts.push(key);
    this.events.push({
      operation: 'remove',
      phase: 'attempt',
      key,
    });
    const failure = this.takeFailure('remove', key);
    if (failure !== undefined) {
      throw failure;
    }
    await this.waitOnHold('remove', key);
    this.values.delete(key);
    this.removeCommits.push(key);
    this.events.push({
      operation: 'remove',
      phase: 'commit',
      key,
    });
  }

  failNext(
    operation: BackendOperation,
    key: string,
    error: unknown,
  ): void {
    this.failures.push({operation, key, error});
  }

  holdNext(
    operation: BackendOperation,
    key: string,
  ): {entered: Promise<void>; release(): void} {
    const hold: OperationHold = {
      operation,
      key,
      entered: deferred<void>(),
      release: deferred<void>(),
    };
    this.holds.push(hold);
    return {
      entered: hold.entered.promise,
      release() {
        hold.release.resolve();
      },
    };
  }

  seed(key: string, value: string): void {
    this.values.set(key, value);
  }

  raw(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  callsFor(key: string): BackendEvent[] {
    return this.events.filter(event => event.key === key);
  }

  clearAudit(): void {
    this.getAttempts.splice(0);
    this.setAttempts.splice(0);
    this.setCommits.splice(0);
    this.removeAttempts.splice(0);
    this.removeCommits.splice(0);
    this.events.splice(0);
  }
}

export function makeDependencies(
  nowValue: string = FIXED_NOW,
  idValue: string = FIXED_BACKUP_ID,
): {
  dependencies: RecoveryDependencies;
  now: jest.Mock<string, []>;
  idGenerator: jest.Mock<string, []>;
} {
  const now = jest.fn<string, []>(() => nowValue);
  const idGenerator = jest.fn<string, []>(() => idValue);
  return {
    dependencies: {now, idGenerator},
    now,
    idGenerator,
  };
}

export function makeFailIfCalledDependencies(): {
  dependencies: RecoveryDependencies;
  now: jest.Mock<string, []>;
  idGenerator: jest.Mock<string, []>;
} {
  const now = jest.fn<string, []>(() => {
    throw new Error('RESTART_CLOCK_MUST_NOT_BE_CALLED');
  });
  const idGenerator = jest.fn<string, []>(() => {
    throw new Error('RESTART_ID_MUST_NOT_BE_CALLED');
  });
  return {
    dependencies: {now, idGenerator},
    now,
    idGenerator,
  };
}

export function seedFocusSentinel(backend: ControlledBackend): void {
  backend.seed(FOCUS_SESSION_SENTINEL_KEY, FOCUS_SENTINEL_RAW);
}

export function expectFocusSentinelUntouched(
  backend: ControlledBackend,
): void {
  expect(backend.raw(FOCUS_SESSION_SENTINEL_KEY)).toBe(FOCUS_SENTINEL_RAW);
  expect(backend.callsFor(FOCUS_SESSION_SENTINEL_KEY)).toEqual([]);
}

export function makeTasksWithSubtaskCount(count: number): Task[] {
  const taskId = `subtask-boundary-${count}`;
  const subtasks = Array.from({length: count}, (_, index) =>
    makeSubtask(taskId, index),
  );
  return [makeTask(taskId, {subtasks})];
}

export function makeExactContainerCandidate(
  containerCount: 512 | 513,
): Task[] {
  if (containerCount === 512) {
    const tasks = Array.from({length: 255}, (_, index) =>
      makeTask(`container-${containerCount}-${index}`),
    );
    const first = tasks[0];
    if (first === undefined) {
      throw new Error('EXACT_CONTAINER_FIXTURE_REQUIRED');
    }
    first.subtasks.push(makeSubtask(first.id, 0));
    return tasks;
  }
  return Array.from({length: 256}, (_, index) =>
    makeTask(`container-${containerCount}-${index}`),
  );
}

export function countTaskCandidateContainers(tasks: readonly Task[]): number {
  let count = 1;
  for (const task of tasks) {
    count += 2;
    count += task.subtasks.length;
  }
  return count;
}

export function makeAccessorCandidate(audit: {calls: number}): object {
  const task = makeTask('accessor-target');
  Object.defineProperty(task, 'description', {
    configurable: true,
    enumerable: true,
    get() {
      audit.calls += 1;
      return 'semantically legal if accessors were allowed';
    },
  });
  return currentEnvelopeObject([task]);
}

export function makeSymbolCandidate(): object {
  const task = makeTask('symbol-target');
  const marker = Symbol('only-adversary');
  Object.defineProperty(task, marker, {
    configurable: true,
    enumerable: true,
    value: 'symbol-only',
    writable: true,
  });
  return currentEnvelopeObject([task]);
}

export function makeSparseCandidate(): object {
  const task = makeTask('sparse-target');
  const subtasks: Subtask[] = new Array(2);
  subtasks[1] = makeSubtask(task.id, 1);
  task.subtasks = subtasks;
  return currentEnvelopeObject([task]);
}

export function makeBehavioralCycleCandidate(): {
  candidate: object;
  taskTarget: Task;
} {
  const taskTarget = makeTask('cycle-target');
  let taskProxy: Task;
  taskProxy = new Proxy(taskTarget, {
    get(target, key, receiver): unknown {
      if (key === 'description') {
        return taskProxy;
      }
      return Reflect.get(target, key, receiver);
    },
  });
  return {
    candidate: currentEnvelopeObject([taskProxy]),
    taskTarget,
  };
}

export function makeDeepBehavioralCandidate(depth: number): object {
  let nested: unknown = 'semantically legal leaf';
  for (let index = 0; index < depth; index += 1) {
    nested = {next: nested};
  }
  const taskTarget = makeTask('depth-target');
  const taskProxy = new Proxy(taskTarget, {
    get(target, key, receiver): unknown {
      if (key === 'description') {
        return nested;
      }
      return Reflect.get(target, key, receiver);
    },
  });
  return currentEnvelopeObject([taskProxy]);
}
