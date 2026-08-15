import type {CoreAppService} from '../../../src/application/coreAppService';
import type {Subtask, Task} from '../../../src/domain/task';

export type ReviewTimerState = 'idle' | 'running' | 'paused' | 'finished';

export type ReviewTimerSnapshot = {
  state: ReviewTimerState;
  durationMs: number;
  remainingMs: number;
};

export type ReviewTimerController = {
  getSnapshot(): ReviewTimerSnapshot;
  subscribe(listener: (snapshot: ReviewTimerSnapshot) => void): () => void;
  start(): void;
  pause(): void;
  resume(): void;
  handleAppState(state: ReviewAppState): void;
  dispose(): void;
};

export type ReviewAppState = 'active' | 'background' | 'inactive';

export type ReviewAppStateSource = {
  addEventListener(
    event: 'change',
    listener: (state: ReviewAppState) => void,
  ): {remove(): void};
};

export const REVIEW_NOW = '2026-08-04T01:02:03.000Z';

export function makeReviewSubtask(
  overrides: Partial<Subtask> = {},
): Subtask {
  return {
    id: 'step-review-1',
    taskId: 'task-review-1',
    title: '打开文档',
    status: 'pending',
    createdAt: REVIEW_NOW,
    updatedAt: REVIEW_NOW,
    completedAt: null,
    ...overrides,
  };
}

export function makeReviewTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-review-1',
    title: '写项目周报',
    description: '',
    important: true,
    urgent: false,
    status: 'pending',
    startAt: null,
    dueAt: null,
    createdAt: REVIEW_NOW,
    updatedAt: REVIEW_NOW,
    startedAt: null,
    completedAt: null,
    deletedAt: null,
    score: null,
    scoreAwardedAt: null,
    subtasks: [],
    ...overrides,
  };
}

export class ReviewMemoryStorage {
  private readonly values = new Map<string, string>();

  readonly setCalls: Array<{key: string; value: string}> = [];

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
    this.setCalls.push({key, value});
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }

  raw(key: string): string | null {
    return this.values.get(key) ?? null;
  }
}

export function createTimerControllerFixture() {
  let snapshot: ReviewTimerSnapshot = {
    state: 'idle',
    durationMs: 300_000,
    remainingMs: 300_000,
  };
  const listeners = new Set<(next: ReviewTimerSnapshot) => void>();
  const unsubscribe = jest.fn();

  const emit = (next: ReviewTimerSnapshot): void => {
    snapshot = next;
    for (const listener of listeners) {
      listener(next);
    }
  };

  const controller: ReviewTimerController = {
    getSnapshot: jest.fn(() => snapshot),
    subscribe: jest.fn(listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        unsubscribe();
      };
    }),
    start: jest.fn(() => {
      if (snapshot.state === 'idle') {
        emit({...snapshot, state: 'running'});
      }
    }),
    pause: jest.fn(() => {
      if (snapshot.state === 'running') {
        emit({...snapshot, state: 'paused', remainingMs: 240_000});
      }
    }),
    resume: jest.fn(() => {
      if (snapshot.state === 'paused') {
        emit({...snapshot, state: 'running'});
      }
    }),
    handleAppState: jest.fn(),
    dispose: jest.fn(),
  };

  return {controller, emit, unsubscribe};
}

export function createAppStateSourceFixture() {
  let listener: ((state: ReviewAppState) => void) | null = null;
  const remove = jest.fn(() => {
    listener = null;
  });
  const source: ReviewAppStateSource = {
    addEventListener: jest.fn((_event, nextListener) => {
      listener = nextListener;
      return {remove};
    }),
  };

  return {
    source,
    remove,
    emit(state: ReviewAppState): void {
      listener?.(state);
    },
  };
}

export function createCoreServiceFixture(options?: {
  startPromise?: Promise<Task>;
}) {
  const pendingTask = makeReviewTask({
    subtasks: [makeReviewSubtask()],
  });
  const startedTask = makeReviewTask({
    status: 'in_progress',
    startedAt: REVIEW_NOW,
    subtasks: [makeReviewSubtask()],
  });

  const service: CoreAppService = {
    createTask: jest.fn(async () => pendingTask),
    addFirstStep: jest.fn(async () => pendingTask),
    chooseRecommended: jest.fn(async () => pendingTask),
    startRecommended: jest.fn(
      () => options?.startPromise ?? Promise.resolve(startedTask),
    ),
    finishStep: jest.fn(async () => startedTask),
    finishTask: jest.fn(async () => ({task: startedTask, points: 0})),
    getState: jest.fn(async () => ({tasks: [pendingTask], totalScore: 0})),
  };

  return {service, pendingTask, startedTask};
}

export function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {promise, resolve, reject};
}
