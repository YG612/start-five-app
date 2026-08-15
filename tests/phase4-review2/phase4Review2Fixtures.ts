import type {Task} from '../../src/domain/task';
import type {
  KeyValueStorage,
  TaskRepository,
} from '../../src/data/taskRepository';
import type {AsyncKeyValueBackend} from '../../src/data/persistentTaskStorage';

export const PHASE4_REVIEW2_STORAGE_KEY = 'start-five.tasks.v1';
export const PHASE4_REVIEW2_SCHEMA = 'start-five.tasks';
export const PHASE4_REVIEW2_VERSION = 1;
export const PHASE4_REVIEW2_CREATED_AT = '2026-08-04T16:00:00.000Z';
export const PHASE4_REVIEW2_STARTED_AT = '2026-08-04T16:01:00.000Z';
export const PHASE4_REVIEW2_COMPLETED_AT = '2026-08-04T16:03:00.000Z';
export const PHASE4_REVIEW2_DELETED_AT = '2026-08-04T16:04:00.000Z';

export type PromiseOutcome<T> =
  | {status: 'fulfilled'; value: T}
  | {status: 'rejected'; error: unknown};

export type BoundedPromiseOutcome<T> =
  | PromiseOutcome<T>
  | {status: 'microtask-budget-exceeded'};

export class InspectableKeyValueStorage implements KeyValueStorage {
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

  seed(key: string, raw: string): void {
    this.values.set(key, raw);
  }

  raw(key: string): string | null {
    return this.values.get(key) ?? null;
  }
}

export class InspectableAsyncKeyValueBackend implements AsyncKeyValueBackend {
  private readonly values = new Map<string, string>();

  readonly getCalls: string[] = [];
  readonly setAttempts: Array<{key: string; value: string}> = [];
  readonly removeCalls: string[] = [];

  async getItem(key: string): Promise<string | null> {
    this.getCalls.push(key);
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.setAttempts.push({key, value});
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.removeCalls.push(key);
    this.values.delete(key);
  }

  seed(key: string, raw: string): void {
    this.values.set(key, raw);
  }

  raw(key: string): string | null {
    return this.values.get(key) ?? null;
  }
}

export function makePendingTask(
  id: string,
  overrides: Partial<Task> = {},
): Task {
  return {
    id,
    title: `Phase 4 review 2 task ${id}`,
    description: `Plain durable data for ${id}`,
    important: false,
    urgent: false,
    status: 'pending',
    startAt: null,
    dueAt: null,
    createdAt: PHASE4_REVIEW2_CREATED_AT,
    updatedAt: PHASE4_REVIEW2_CREATED_AT,
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
    startedAt: PHASE4_REVIEW2_STARTED_AT,
    completedAt: PHASE4_REVIEW2_COMPLETED_AT,
    updatedAt: PHASE4_REVIEW2_COMPLETED_AT,
    score: 15,
    scoreAwardedAt: PHASE4_REVIEW2_COMPLETED_AT,
    subtasks: [
      {
        id: `${id}-step`,
        taskId: id,
        title: `Completed step for ${id}`,
        status: 'completed',
        createdAt: PHASE4_REVIEW2_CREATED_AT,
        updatedAt: '2026-08-04T16:02:00.000Z',
        completedAt: '2026-08-04T16:02:00.000Z',
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
    schema: PHASE4_REVIEW2_SCHEMA,
    version: PHASE4_REVIEW2_VERSION,
    tasks,
  });
}

export function envelopeFromTaskArrayRaw(taskArrayRaw: string): string {
  return `{"schema":"${PHASE4_REVIEW2_SCHEMA}","version":${PHASE4_REVIEW2_VERSION},"tasks":${taskArrayRaw}}`;
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
  turns: number = 64,
): Promise<BoundedPromiseOutcome<T>> {
  const observed: Promise<PromiseOutcome<T>> = promise.then(
    value => ({status: 'fulfilled', value}),
    (error: unknown) => ({status: 'rejected', error}),
  );
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

export function errorCode(error: unknown): unknown {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  return (error as {code?: unknown}).code;
}

export function errorMessage(error: unknown): unknown {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  return (error as {message?: unknown}).message;
}

export function taskWithOwnToJSON(task: Task): Task {
  const serializedView = cloneTask(task);
  return Object.assign(cloneTask(task), {
    toJSON(): Task {
      return serializedView;
    },
  });
}

export function taskWithCustomPrototype(task: Task): Task {
  const candidate = cloneTask(task);
  Object.setPrototypeOf(candidate, {source: 'custom-task-prototype'});
  return candidate;
}

export function patchWithCustomPrototype(
  patch: Partial<Omit<Task, 'id'>>,
): Partial<Omit<Task, 'id'>> {
  Object.setPrototypeOf(patch, {source: 'custom-patch-prototype'});
  return patch;
}

export type ReentrantMutation = (
  repository: TaskRepository,
  baseline: Task,
) => Promise<unknown>;
