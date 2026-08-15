import {
  createTaskLifecycleService,
  type TaskLifecycleOperationOptions,
  type TaskLifecycleService,
} from '../../src/application/coreAppService';
import {
  createTaskRepository,
  TASK_REPOSITORY_COORDINATION_IDENTITY,
  type KeyValueStorage,
  type TaskRepository,
} from '../../src/data/taskRepository';
import type {Subtask, Task} from '../../src/domain/task';

export const A2_STORAGE_KEY = 'gap-p0-01a2.tasks';
export const A2_NOW = '2026-08-05T10:00:00.000Z';
export const A2_LATER = '2026-08-05T10:05:00.000Z';

export class SequenceClock {
  private index = 0;

  constructor(private readonly values: readonly string[]) {}

  readonly now = (): string => {
    const value = this.values[this.index];
    if (value === undefined) {
      throw new Error('A2_CLOCK_SEQUENCE_EXHAUSTED');
    }
    this.index += 1;
    return value;
  };

  get consumed(): number {
    return this.index;
  }
}

export class SequenceIds {
  private index = 0;

  constructor(private readonly values: readonly string[]) {}

  readonly next = (): string => {
    const value = this.values[this.index];
    if (value === undefined) {
      throw new Error('A2_ID_SEQUENCE_EXHAUSTED');
    }
    this.index += 1;
    return value;
  };

  get consumed(): number {
    return this.index;
  }
}

export class StableClock {
  constructor(readonly value: string = A2_NOW) {}

  readonly now = (): string => this.value;
}

export class PrefixIds {
  private nextIndex = 1;

  constructor(private readonly prefix: string = 'a2-task') {}

  readonly next = (): string => {
    const id = `${this.prefix}-${String(this.nextIndex).padStart(3, '0')}`;
    this.nextIndex += 1;
    return id;
  };
}

export class StorageFault extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'StorageFault';
    this.code = code;
  }
}

export class ManualWriteBarrier {
  private signalStarted!: () => void;
  private signalReleased!: () => void;
  private released = false;

  readonly started = new Promise<void>(resolve => {
    this.signalStarted = resolve;
  });

  private readonly releasedPromise = new Promise<void>(resolve => {
    this.signalReleased = resolve;
  });

  async wait(): Promise<void> {
    this.signalStarted();
    await this.releasedPromise;
  }

  release(): void {
    if (!this.released) {
      this.released = true;
      this.signalReleased();
    }
  }
}

type BarrierRaceResult =
  | {kind: 'barrier'}
  | {kind: 'fulfilled'}
  | {kind: 'rejected'; error: unknown};

export async function expectBarrierBeforeSettlement<T>(
  barrier: ManualWriteBarrier,
  operationPromise: Promise<T>,
): Promise<void> {
  const barrierReached: Promise<BarrierRaceResult> = barrier.started.then(
    (): BarrierRaceResult => ({kind: 'barrier'}),
  );
  const operationSettled: Promise<BarrierRaceResult> = operationPromise.then(
    (): BarrierRaceResult => ({kind: 'fulfilled'}),
    (error: unknown): BarrierRaceResult => ({kind: 'rejected', error}),
  );
  const result = await Promise.race([barrierReached, operationSettled]);
  if (result.kind === 'barrier') {
    return;
  }
  if (result.kind === 'rejected') {
    throw result.error;
  }
  throw new Error('A2_OPERATION_FULFILLED_BEFORE_WRITE_BARRIER');
}

export class PhysicalTaskBackend {
  readonly values = new Map<string, string>();
  readonly coordinationIdentity = {};
}

export class ControlledTaskStorage implements KeyValueStorage {
  readonly [TASK_REPOSITORY_COORDINATION_IDENTITY]?: object;

  readonly getCalls: string[] = [];
  readonly setAttempts: Array<{key: string; value: string}> = [];
  readonly setCommits: Array<{key: string; value: string}> = [];
  readonly removeCalls: string[] = [];

  failNextGetWith: Error | null = null;
  failNextSetWith: Error | null = null;
  private nextWriteBarrier: ManualWriteBarrier | null = null;

  constructor(
    readonly backend: PhysicalTaskBackend,
    coordinate: boolean = true,
  ) {
    if (coordinate) {
      this[TASK_REPOSITORY_COORDINATION_IDENTITY] =
        backend.coordinationIdentity;
    }
  }

  async getItem(key: string): Promise<string | null> {
    this.getCalls.push(key);
    const failure = this.failNextGetWith;
    this.failNextGetWith = null;
    if (failure !== null) {
      throw failure;
    }
    return this.backend.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.setAttempts.push({key, value});
    const failure = this.failNextSetWith;
    this.failNextSetWith = null;
    if (failure !== null) {
      throw failure;
    }

    const barrier = this.nextWriteBarrier;
    this.nextWriteBarrier = null;
    if (barrier !== null) {
      await barrier.wait();
    }

    this.backend.values.set(key, value);
    this.setCommits.push({key, value});
  }

  async removeItem(key: string): Promise<void> {
    this.removeCalls.push(key);
    this.backend.values.delete(key);
  }

  blockNextWrite(): ManualWriteBarrier {
    if (this.nextWriteBarrier !== null) {
      throw new Error('A2_WRITE_BARRIER_ALREADY_ARMED');
    }
    const barrier = new ManualWriteBarrier();
    this.nextWriteBarrier = barrier;
    return barrier;
  }

  seedTasks(tasks: readonly Task[], key: string = A2_STORAGE_KEY): void {
    this.backend.values.set(key, JSON.stringify(tasks));
  }

  raw(key: string = A2_STORAGE_KEY): string | null {
    return this.backend.values.get(key) ?? null;
  }
}

export type A2Harness = {
  backend: PhysicalTaskBackend;
  storage: ControlledTaskStorage;
  repository: TaskRepository;
  service: TaskLifecycleService;
};

export type A2HarnessOptions = {
  tasks?: readonly Task[];
  backend?: PhysicalTaskBackend;
  storage?: ControlledTaskStorage;
  repository?: TaskRepository;
  now?: () => string;
  idGenerator?: () => string;
  key?: string;
};

export function createA2Harness(options: A2HarnessOptions = {}): A2Harness {
  const backend = options.backend ?? new PhysicalTaskBackend();
  const storage = options.storage ?? new ControlledTaskStorage(backend);
  const key = options.key ?? A2_STORAGE_KEY;
  if (options.tasks !== undefined) {
    storage.seedTasks(options.tasks, key);
  } else if (storage.raw(key) === null) {
    storage.seedTasks([], key);
  }
  const repository = options.repository ?? createTaskRepository(storage, key);
  const clock = new StableClock();
  const ids = new PrefixIds();
  const service = createTaskLifecycleService({
    repository,
    now: options.now ?? clock.now,
    idGenerator: options.idGenerator ?? ids.next,
  });
  return {backend, storage, repository, service};
}

export function createFreshA2Harness(
  backend: PhysicalTaskBackend,
  options: Omit<A2HarnessOptions, 'backend' | 'storage' | 'repository' | 'tasks'> = {},
): A2Harness {
  const storage = new ControlledTaskStorage(backend, false);
  return createA2Harness({...options, backend, storage});
}

export function operation(operationId: string): TaskLifecycleOperationOptions {
  return {operationId};
}

export function makeSubtask(
  taskId: string,
  id: string = `${taskId}-step`,
  overrides: Partial<Subtask> = {},
): Subtask {
  return {
    id,
    taskId,
    title: `Step for ${taskId}`,
    status: 'pending',
    createdAt: '2026-08-05T08:00:00.000Z',
    updatedAt: '2026-08-05T08:00:00.000Z',
    completedAt: null,
    ...overrides,
  };
}

export function makeTask(
  id: string,
  overrides: Partial<Task> = {},
): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `Description ${id}`,
    important: false,
    urgent: false,
    status: 'pending',
    startAt: null,
    dueAt: null,
    createdAt: '2026-08-05T08:00:00.000Z',
    updatedAt: '2026-08-05T08:00:00.000Z',
    startedAt: null,
    completedAt: null,
    deletedAt: null,
    score: null,
    scoreAwardedAt: null,
    subtasks: [],
    ...overrides,
  };
}

export function makeInProgressTask(
  id: string,
  overrides: Partial<Task> = {},
): Task {
  return makeTask(id, {
    status: 'in_progress',
    startedAt: '2026-08-05T08:05:00.000Z',
    updatedAt: '2026-08-05T08:05:00.000Z',
    ...overrides,
  });
}

export function makeCompletedTask(
  id: string,
  overrides: Partial<Task> = {},
): Task {
  return makeInProgressTask(id, {
    status: 'completed',
    completedAt: '2026-08-05T08:10:00.000Z',
    updatedAt: '2026-08-05T08:10:00.000Z',
    score: 5,
    scoreAwardedAt: '2026-08-05T08:10:00.000Z',
    ...overrides,
  });
}

export function makeDeletedTask(
  id: string,
  overrides: Partial<Task> = {},
): Task {
  return makeTask(id, {
    deletedAt: '2026-08-05T08:10:00.000Z',
    updatedAt: '2026-08-05T08:10:00.000Z',
    ...overrides,
  });
}

export function makeCancelledTask(
  id: string,
  overrides: Partial<Task> = {},
): Task {
  return makeTask(id, {
    status: 'cancelled',
    deletedAt: null,
    ...overrides,
  });
}

export async function expectErrorCode(
  invoke: () => Promise<unknown>,
  code: string,
): Promise<unknown> {
  try {
    await invoke();
  } catch (error: unknown) {
    expect(error).toMatchObject({code});
    return error;
  }
  throw new Error(`A2_EXPECTED_ERROR_NOT_THROWN:${code}`);
}

export async function readFreshTasks(
  backend: PhysicalTaskBackend,
  key: string = A2_STORAGE_KEY,
): Promise<Task[]> {
  const storage = new ControlledTaskStorage(backend, false);
  return createTaskRepository(storage, key).list({includeDeleted: true});
}

export function cloneTaskForExpected(task: Task): Task {
  return {
    ...task,
    subtasks: task.subtasks.map(subtask => ({...subtask})),
  };
}
