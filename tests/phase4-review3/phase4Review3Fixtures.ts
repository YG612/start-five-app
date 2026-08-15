import type {Task} from '../../src/domain/task';
import type {KeyValueStorage} from '../../src/data/taskRepository';
import type {AsyncKeyValueBackend} from '../../src/data/persistentTaskStorage';

export const PHASE4_REVIEW3_STORAGE_KEY = 'start-five.tasks.v1';
export const PHASE4_REVIEW3_SCHEMA = 'start-five.tasks';
export const PHASE4_REVIEW3_VERSION = 1;
export const PHASE4_REVIEW3_CREATED_AT = '2026-08-04T18:00:00.000Z';
export const PHASE4_REVIEW3_STARTED_AT = '2026-08-04T18:01:00.000Z';
export const PHASE4_REVIEW3_STEP_COMPLETED_AT =
  '2026-08-04T18:02:00.000Z';
export const PHASE4_REVIEW3_COMPLETED_AT = '2026-08-04T18:03:00.000Z';
export const PHASE4_REVIEW3_DELETED_AT = '2026-08-04T18:04:00.000Z';
export const PHASE4_REVIEW3_RECOVERY_AT = '2026-08-04T18:05:00.000Z';

export type PromiseOutcome<T> =
  | {status: 'fulfilled'; value: T}
  | {status: 'rejected'; error: unknown};

export type BoundedPromiseOutcome<T> =
  | PromiseOutcome<T>
  | {status: 'microtask-budget-exceeded'};

export type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
  reject(reason?: unknown): void;
};

export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {promise, resolve, reject};
}

export async function captureOutcome<T>(
  promise: Promise<T>,
): Promise<PromiseOutcome<T>> {
  try {
    return {status: 'fulfilled', value: await promise};
  } catch (error: unknown) {
    return {status: 'rejected', error};
  }
}

export async function settleWithinMicrotasks<T>(
  promise: Promise<T>,
  turns: number = 128,
): Promise<BoundedPromiseOutcome<T>> {
  const observed = captureOutcome(promise);
  const budget = (async (): Promise<{
    status: 'microtask-budget-exceeded';
  }> => {
    for (let turn = 0; turn < turns; turn += 1) {
      await Promise.resolve();
    }
    return {status: 'microtask-budget-exceeded'};
  })();
  return Promise.race([observed, budget]);
}

export function errorIdentity(error: unknown): {
  code: unknown;
  message: unknown;
} {
  if (typeof error !== 'object' || error === null) {
    return {code: undefined, message: undefined};
  }
  return {
    code: (error as {code?: unknown}).code,
    message: (error as {message?: unknown}).message,
  };
}

export function outcomeIdentity<T>(
  outcome: PromiseOutcome<T> | BoundedPromiseOutcome<T>,
):
  | {status: 'fulfilled'}
  | {status: 'rejected'; code: unknown; message: unknown}
  | {status: 'microtask-budget-exceeded'} {
  if (outcome.status === 'microtask-budget-exceeded') {
    return outcome;
  }
  if (outcome.status === 'fulfilled') {
    return {status: 'fulfilled'};
  }
  return {status: 'rejected', ...errorIdentity(outcome.error)};
}

export function makePendingTask(
  id: string,
  overrides: Partial<Task> = {},
): Task {
  return {
    id,
    title: `Phase 4 review 3 task ${id}`,
    description: `Durable task ${id}`,
    important: false,
    urgent: false,
    status: 'pending',
    startAt: null,
    dueAt: null,
    createdAt: PHASE4_REVIEW3_CREATED_AT,
    updatedAt: PHASE4_REVIEW3_CREATED_AT,
    startedAt: null,
    completedAt: null,
    deletedAt: null,
    score: null,
    scoreAwardedAt: null,
    subtasks: [],
    ...overrides,
  };
}

export function makeCompletedTask(
  id: string,
  overrides: Partial<Task> = {},
): Task {
  return makePendingTask(id, {
    status: 'completed',
    updatedAt: PHASE4_REVIEW3_COMPLETED_AT,
    startedAt: PHASE4_REVIEW3_STARTED_AT,
    completedAt: PHASE4_REVIEW3_COMPLETED_AT,
    score: 15,
    scoreAwardedAt: PHASE4_REVIEW3_COMPLETED_AT,
    subtasks: [
      {
        id: `${id}-step`,
        taskId: id,
        title: `Completed step for ${id}`,
        status: 'completed',
        createdAt: PHASE4_REVIEW3_CREATED_AT,
        updatedAt: PHASE4_REVIEW3_STEP_COMPLETED_AT,
        completedAt: PHASE4_REVIEW3_STEP_COMPLETED_AT,
      },
    ],
    ...overrides,
  });
}

export function cloneTask(task: Task): Task {
  return {
    ...task,
    subtasks: task.subtasks.map(subtask => ({...subtask})),
  };
}

export function serializeEnvelope(tasks: readonly unknown[]): string {
  return JSON.stringify({
    schema: PHASE4_REVIEW3_SCHEMA,
    version: PHASE4_REVIEW3_VERSION,
    tasks,
  });
}

export function envelopeFromTaskArrayRaw(taskArrayRaw: string): string {
  return `{"schema":"${PHASE4_REVIEW3_SCHEMA}","version":${PHASE4_REVIEW3_VERSION},"tasks":${taskArrayRaw}}`;
}

export class InspectableDirectStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();

  readonly getCalls: string[] = [];
  readonly setCalls: Array<{key: string; value: string}> = [];
  readonly removeCalls: string[] = [];

  async getItem(key: string): Promise<string | null> {
    this.getCalls.push(key);
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.setCalls.push({key, value});
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.removeCalls.push(key);
    this.values.delete(key);
  }

  seed(key: string, value: string): void {
    this.values.set(key, value);
  }

  raw(key: string): string | null {
    return this.values.get(key) ?? null;
  }
}

type DeferredWrite = {
  entered: Deferred<void>;
  release: Deferred<void>;
};

export class InspectableBackend implements AsyncKeyValueBackend {
  private readonly values = new Map<string, string>();
  private deferredWrite: DeferredWrite | null = null;

  readonly getCalls: string[] = [];
  readonly setAttempts: Array<{key: string; value: string}> = [];
  readonly removeCalls: string[] = [];

  async getItem(key: string): Promise<string | null> {
    this.getCalls.push(key);
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.setAttempts.push({key, value});
    const deferred = this.deferredWrite;
    this.deferredWrite = null;
    if (deferred !== null) {
      deferred.entered.resolve(undefined);
      await deferred.release.promise;
    }
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.removeCalls.push(key);
    this.values.delete(key);
  }

  seed(key: string, value: string): void {
    this.values.set(key, value);
  }

  raw(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  deferNextWrite(): {
    entered: Promise<void>;
    release(): void;
  } {
    if (this.deferredWrite !== null) {
      throw new Error('PHASE4_REVIEW3_WRITE_ALREADY_DEFERRED');
    }
    const entered = createDeferred<void>();
    const release = createDeferred<void>();
    this.deferredWrite = {entered, release};
    return {
      entered: entered.promise,
      release: () => release.resolve(undefined),
    };
  }
}

export type TransactionSurface = {
  create(task: Task): Promise<Task>;
  getById(
    id: string,
    options?: {includeDeleted?: boolean},
  ): Promise<Task | null>;
  list(options?: {includeDeleted?: boolean}): Promise<Task[]>;
  update(id: string, patch: Partial<Omit<Task, 'id'>>): Promise<Task>;
  softDelete(id: string, deletedAt: string): Promise<Task>;
};

export function throwingAggregateProxy(task: Task): Task {
  return new Proxy(cloneTask(task), {
    getPrototypeOf(): object | null {
      throw new Error('PHASE4_REVIEW3_THROWING_PROXY_TRAP');
    },
  });
}

export function revokedPatchProxy(): Partial<Omit<Task, 'id'>> {
  const revocable = Proxy.revocable(
    {title: 'revoked patch must not be inspected unsafely'},
    {},
  );
  revocable.revoke();
  return revocable.proxy;
}

export function deepGetterPatch(depth: number = 256): {
  patch: Partial<Omit<Task, 'id'>>;
  getterCalls(): number;
} {
  let calls = 0;
  const getterLeaf: Record<string, unknown> = {};
  Object.defineProperty(getterLeaf, 'dangerous', {
    configurable: true,
    enumerable: true,
    get(): never {
      calls += 1;
      throw new Error('PHASE4_REVIEW3_DEEP_GETTER_INVOKED');
    },
  });
  let nested: unknown = getterLeaf;
  for (let level = 0; level < depth; level += 1) {
    nested = {next: nested};
  }
  return {
    patch: {unknownFutureField: nested} as unknown as Partial<
      Omit<Task, 'id'>
    >,
    getterCalls: () => calls,
  };
}
