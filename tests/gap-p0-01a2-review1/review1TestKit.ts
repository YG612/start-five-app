import {
  createTaskLifecycleService,
  type TaskLifecycleService,
  type TaskLifecycleTaskInput,
} from '../../src/application/coreAppService';
import {
  createPersistentTaskStorage,
  TASK_SNAPSHOT_SCHEMA,
  TASK_SNAPSHOT_VERSION,
  TASK_STORAGE_KEY,
  type AsyncKeyValueBackend,
} from '../../src/data/persistentTaskStorage';
import {
  createTaskRepository,
  type TaskRepository,
} from '../../src/data/taskRepository';
import type {Subtask, Task} from '../../src/domain/task';

export const REVIEW_NOW = '2026-08-05T12:00:00.000Z';

type DurableState = {
  readonly values: Map<string, string>;
};

export type ReviewForwardMutation = {
  readonly ordinal: number;
  readonly kind: 'setItem' | 'removeItem';
};

export class ReviewBackendFault extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'ReviewBackendFault';
    this.code = code;
  }
}

export class CommittedWriteBarrier {
  private signalStarted!: () => void;
  private signalReleased!: () => void;
  private released = false;

  readonly started = new Promise<void>(resolve => {
    this.signalStarted = resolve;
  });

  private readonly releasedPromise = new Promise<void>(resolve => {
    this.signalReleased = resolve;
  });

  async waitAfterCommit(): Promise<void> {
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
  barrier: CommittedWriteBarrier,
  operationPromise: Promise<T>,
): Promise<void> {
  const barrierReached: Promise<BarrierRaceResult> = barrier.started.then(
    (): BarrierRaceResult => ({kind: 'barrier'}),
  );
  const operationSettled: Promise<BarrierRaceResult> = operationPromise.then(
    (): BarrierRaceResult => ({kind: 'fulfilled'}),
    (error: unknown): BarrierRaceResult => ({kind: 'rejected', error}),
  );
  const outcome = await Promise.race([barrierReached, operationSettled]);
  if (outcome.kind === 'barrier') {
    return;
  }
  if (outcome.kind === 'rejected') {
    throw outcome.error;
  }
  throw new Error('A2_REVIEW1_OPERATION_SETTLED_BEFORE_COMMITTED_BARRIER');
}

export class PersistentReviewBackend implements AsyncKeyValueBackend {
  readonly reads: string[] = [];
  readonly setAttempts: Array<{key: string; value: string}> = [];
  readonly setCommits: Array<{key: string; value: string}> = [];
  readonly removeAttempts: string[] = [];
  readonly removeCommits: string[] = [];
  readonly forwardMutations: ReviewForwardMutation[] = [];

  private readonly sidecarReadFailures: ReviewBackendFault[] = [];
  private forwardMutationFailure: {
    targetOrdinal: number;
    timing: 'before' | 'after';
    cause: ReviewBackendFault;
  } | null = null;
  private nextCommittedBarrier: CommittedWriteBarrier | null = null;

  constructor(private readonly state: DurableState = {values: new Map()}) {}

  fork(): PersistentReviewBackend {
    return new PersistentReviewBackend(this.state);
  }

  raw(key: string): string | null {
    return this.state.values.get(key) ?? null;
  }

  putRaw(key: string, value: string): void {
    this.state.values.set(key, value);
  }

  deleteRaw(key: string): void {
    this.state.values.delete(key);
  }

  seedCurrentV1(tasks: readonly Task[]): void {
    this.putRaw(
      TASK_STORAGE_KEY,
      JSON.stringify({
        schema: TASK_SNAPSHOT_SCHEMA,
        version: TASK_SNAPSHOT_VERSION,
        tasks,
      }),
    );
  }

  rawSnapshot(): Array<readonly [string, string]> {
    return Array.from(this.state.values.entries())
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, value]) => [key, value] as const);
  }

  serializedRawBytes(): string {
    return JSON.stringify(this.rawSnapshot());
  }

  static fromSerializedRawBytes(
    serializedRawBytes: string,
  ): PersistentReviewBackend {
    let parsed: unknown;
    try {
      parsed = JSON.parse(serializedRawBytes);
    } catch {
      throw new Error('A2_REVIEW1_SERIALIZED_RAW_BYTES_INVALID');
    }
    if (!Array.isArray(parsed)) {
      throw new Error('A2_REVIEW1_SERIALIZED_RAW_BYTES_INVALID');
    }
    const values = new Map<string, string>();
    for (const entry of parsed) {
      if (
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        typeof entry[0] !== 'string' ||
        typeof entry[1] !== 'string' ||
        values.has(entry[0])
      ) {
        throw new Error('A2_REVIEW1_SERIALIZED_RAW_BYTES_INVALID');
      }
      values.set(entry[0], entry[1]);
    }
    return new PersistentReviewBackend({values});
  }

  nonPrimaryKeys(): string[] {
    return Array.from(this.state.values.keys())
      .filter(key => key !== TASK_STORAGE_KEY)
      .sort();
  }

  private armNthForwardMutationFailure(
    ordinal: number,
    timing: 'before' | 'after',
    cause: ReviewBackendFault,
  ): void {
    if (!Number.isSafeInteger(ordinal) || ordinal <= 0) {
      throw new Error('A2_REVIEW1_INVALID_FORWARD_MUTATION_ORDINAL');
    }
    if (this.forwardMutationFailure !== null) {
      throw new Error('A2_REVIEW1_FORWARD_MUTATION_FAILURE_ALREADY_ARMED');
    }
    this.forwardMutationFailure = {
      targetOrdinal: this.forwardMutations.length + ordinal,
      timing,
      cause,
    };
  }

  failNthForwardMutationBefore(
    ordinal: number,
    cause: ReviewBackendFault,
  ): void {
    this.armNthForwardMutationFailure(ordinal, 'before', cause);
  }

  failNthForwardMutationAfter(
    ordinal: number,
    cause: ReviewBackendFault,
  ): void {
    this.armNthForwardMutationFailure(ordinal, 'after', cause);
  }

  failNextSidecarRead(cause: ReviewBackendFault): void {
    this.sidecarReadFailures.push(cause);
  }

  resetMutationObservations(): void {
    this.setAttempts.length = 0;
    this.setCommits.length = 0;
    this.removeAttempts.length = 0;
    this.removeCommits.length = 0;
    this.forwardMutations.length = 0;
  }

  blockNextCommittedWrite(): CommittedWriteBarrier {
    if (this.nextCommittedBarrier !== null) {
      throw new Error('A2_REVIEW1_WRITE_BARRIER_ALREADY_ARMED');
    }
    const barrier = new CommittedWriteBarrier();
    this.nextCommittedBarrier = barrier;
    return barrier;
  }

  async getItem(key: string): Promise<string | null> {
    this.reads.push(key);
    if (key !== TASK_STORAGE_KEY) {
      const sidecarReadFailure = this.sidecarReadFailures.shift();
      if (sidecarReadFailure !== undefined) {
        throw sidecarReadFailure;
      }
    }
    return this.raw(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    this.setAttempts.push({key, value});
    const ordinal = this.forwardMutations.length + 1;
    this.forwardMutations.push({ordinal, kind: 'setItem'});
    const forwardFailure = this.forwardMutationFailure;
    if (
      forwardFailure !== null &&
      forwardFailure.targetOrdinal === ordinal &&
      forwardFailure.timing === 'before'
    ) {
      this.forwardMutationFailure = null;
      throw forwardFailure.cause;
    }

    this.state.values.set(key, value);
    this.setCommits.push({key, value});
    if (
      forwardFailure !== null &&
      forwardFailure.targetOrdinal === ordinal &&
      forwardFailure.timing === 'after'
    ) {
      this.forwardMutationFailure = null;
      throw forwardFailure.cause;
    }
    const barrier = this.nextCommittedBarrier;
    this.nextCommittedBarrier = null;
    if (barrier !== null) {
      await barrier.waitAfterCommit();
    }
  }

  async removeItem(key: string): Promise<void> {
    this.removeAttempts.push(key);
    const ordinal = this.forwardMutations.length + 1;
    this.forwardMutations.push({ordinal, kind: 'removeItem'});
    const forwardFailure = this.forwardMutationFailure;
    if (
      forwardFailure !== null &&
      forwardFailure.targetOrdinal === ordinal &&
      forwardFailure.timing === 'before'
    ) {
      this.forwardMutationFailure = null;
      throw forwardFailure.cause;
    }
    this.state.values.delete(key);
    this.removeCommits.push(key);
    if (
      forwardFailure !== null &&
      forwardFailure.targetOrdinal === ordinal &&
      forwardFailure.timing === 'after'
    ) {
      this.forwardMutationFailure = null;
      throw forwardFailure.cause;
    }
  }
}

export class CountingClock {
  private count = 0;
  private readonly startMilliseconds: number;

  constructor(
    start: string = REVIEW_NOW,
    private readonly stepMilliseconds = 1_000,
  ) {
    this.startMilliseconds = Date.parse(start);
  }

  readonly now = (): string => {
    const value = new Date(
      this.startMilliseconds + this.count * this.stepMilliseconds,
    ).toISOString();
    this.count += 1;
    return value;
  };

  get consumed(): number {
    return this.count;
  }
}

export class CountingIds {
  private count = 0;

  constructor(private readonly prefix = 'review-task') {}

  readonly next = (): string => {
    this.count += 1;
    return `${this.prefix}-${String(this.count).padStart(4, '0')}`;
  };

  get consumed(): number {
    return this.count;
  }
}

export class ForbiddenClock {
  private count = 0;

  readonly now = (): string => {
    this.count += 1;
    throw new Error('A2_REVIEW1_FORBIDDEN_CLOCK_CALL');
  };

  get consumed(): number {
    return this.count;
  }
}

export class ForbiddenIds {
  private count = 0;

  readonly next = (): string => {
    this.count += 1;
    throw new Error('A2_REVIEW1_FORBIDDEN_ID_CALL');
  };

  get consumed(): number {
    return this.count;
  }
}

export type PersistentReviewRuntime = {
  readonly backend: PersistentReviewBackend;
  readonly repository: TaskRepository;
  readonly service: TaskLifecycleService;
};

export function createPersistentReviewRuntime(
  backend: PersistentReviewBackend,
  dependencies: {
    now(): string;
    idGenerator(): string;
  },
): PersistentReviewRuntime {
  const storage = createPersistentTaskStorage(backend);
  const repository = createTaskRepository(storage);
  const service = createTaskLifecycleService({
    repository,
    now: dependencies.now,
    idGenerator: dependencies.idGenerator,
  });
  return {backend, repository, service};
}

export async function createIsolatedPersistentReviewRuntimeFromRawBytes(
  serializedRawBytes: string,
  dependencies: {
    now(): string;
    idGenerator(): string;
  },
): Promise<PersistentReviewRuntime> {
  const backend = PersistentReviewBackend.fromSerializedRawBytes(
    serializedRawBytes,
  );
  const holder: {runtime?: PersistentReviewRuntime} = {};
  await jest.isolateModulesAsync(async () => {
    const persistentStorageModule = await import(
      '../../src/data/persistentTaskStorage'
    );
    const repositoryModule = await import('../../src/data/taskRepository');
    const lifecycleModule = await import(
      '../../src/application/coreAppService'
    );
    const storage = persistentStorageModule.createPersistentTaskStorage(
      backend,
    );
    const repository = repositoryModule.createTaskRepository(storage);
    const service = lifecycleModule.createTaskLifecycleService({
      repository,
      now: dependencies.now,
      idGenerator: dependencies.idGenerator,
    });
    holder.runtime = {backend, repository, service};
  });
  if (holder.runtime === undefined) {
    throw new Error('A2_REVIEW1_ISOLATED_RUNTIME_NOT_CREATED');
  }
  return holder.runtime;
}

export function makeReviewSubtask(
  taskId: string,
  index: number,
): Subtask {
  return {
    id: `${taskId}-subtask-${String(index).padStart(4, '0')}`,
    taskId,
    title: `Subtask ${String(index)}`,
    status: 'pending',
    createdAt: '2026-08-05T08:00:00.000Z',
    updatedAt: '2026-08-05T08:00:00.000Z',
    completedAt: null,
  };
}

export function makeReviewTask(
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

export function makeReviewDeletedTask(id: string): Task {
  return makeReviewTask(id, {
    deletedAt: '2026-08-05T09:00:00.000Z',
    updatedAt: '2026-08-05T09:00:00.000Z',
  });
}

export function reviewCreateInput(
  index: number,
  overrides: Partial<TaskLifecycleTaskInput> = {},
): TaskLifecycleTaskInput {
  return {
    title: `Created task ${String(index)}`,
    description: `Created description ${String(index)}`,
    important: false,
    urgent: false,
    ...overrides,
  };
}

export async function expectErrorCode(
  operationPromise: Promise<unknown>,
  code: string,
): Promise<unknown> {
  try {
    await operationPromise;
  } catch (error: unknown) {
    expect(error).toMatchObject({code});
    return error;
  }
  throw new Error(`A2_REVIEW1_EXPECTED_REJECTION:${code}`);
}
