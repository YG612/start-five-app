import type {Subtask, Task} from '../../src/domain/task';

export const PHASE4_REVIEW_STORAGE_KEY = 'start-five.tasks.v1';
export const PHASE4_REVIEW_SCHEMA = 'start-five.tasks';
export const PHASE4_REVIEW_VERSION = 1;
export const PHASE4_REVIEW_NOW = '2026-08-04T14:00:00.000Z';

export type AsyncKeyValueBackend = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

type Deferred = {
  promise: Promise<void>;
  resolve(): void;
};

function deferred(): Deferred {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>(resolve => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve() {
      resolvePromise?.();
    },
  };
}

export class ControlledAsyncKeyValueBackend implements AsyncKeyValueBackend {
  private readonly values = new Map<string, string>();
  private nextSetGate: Deferred | null = null;
  private gateClaimed = false;

  readonly getCalls: string[] = [];
  readonly setAttempts: Array<{key: string; value: string}> = [];
  readonly committedSetCalls: Array<{key: string; value: string}> = [];
  readonly removeCalls: string[] = [];
  blockedSetCount = 0;

  async getItem(key: string): Promise<string | null> {
    this.getCalls.push(key);
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.setAttempts.push({key, value});
    const gate = this.nextSetGate;
    if (gate !== null && !this.gateClaimed) {
      this.gateClaimed = true;
      this.blockedSetCount += 1;
      await gate.promise;
    }
    this.values.set(key, value);
    this.committedSetCalls.push({key, value});
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

  gateNextSet(): void {
    if (this.nextSetGate !== null) {
      throw new Error('SET_GATE_ALREADY_ARMED');
    }
    this.nextSetGate = deferred();
    this.gateClaimed = false;
  }

  releaseSetGate(): void {
    this.nextSetGate?.resolve();
    this.nextSetGate = null;
  }
}

export function makePendingSubtask(
  taskId: string,
  overrides: Partial<Subtask> = {},
): Subtask {
  return {
    id: `${taskId}-step`,
    taskId,
    title: `First step for ${taskId}`,
    status: 'pending',
    createdAt: PHASE4_REVIEW_NOW,
    updatedAt: PHASE4_REVIEW_NOW,
    completedAt: null,
    ...overrides,
  };
}

export function makeCompletedSubtask(
  taskId: string,
  overrides: Partial<Subtask> = {},
): Subtask {
  return makePendingSubtask(taskId, {
    status: 'completed',
    updatedAt: '2026-08-04T14:02:00.000Z',
    completedAt: '2026-08-04T14:02:00.000Z',
    ...overrides,
  });
}

export function makePendingTask(
  id: string,
  overrides: Partial<Task> = {},
): Task {
  return {
    id,
    title: `Phase 4 review task ${id}`,
    description: `Durable Phase 4 review data for ${id}`,
    important: false,
    urgent: false,
    status: 'pending',
    startAt: '2026-08-04T14:05:00.000Z',
    dueAt: '2026-08-05T14:00:00.000Z',
    createdAt: PHASE4_REVIEW_NOW,
    updatedAt: PHASE4_REVIEW_NOW,
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
    startedAt: '2026-08-04T14:01:00.000Z',
    completedAt: '2026-08-04T14:03:00.000Z',
    updatedAt: '2026-08-04T14:03:00.000Z',
    score: 15,
    scoreAwardedAt: '2026-08-04T14:03:00.000Z',
    subtasks: [makeCompletedSubtask(id)],
    ...overrides,
  });
}

export function serializeEnvelope(tasks: readonly unknown[]): string {
  return JSON.stringify({
    schema: PHASE4_REVIEW_SCHEMA,
    version: PHASE4_REVIEW_VERSION,
    tasks,
  });
}

export async function drainMicrotasks(turns: number = 32): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) {
    await Promise.resolve();
  }
}

export async function captureOutcome(
  promise: Promise<unknown>,
): Promise<
  | {status: 'fulfilled'; value: unknown}
  | {status: 'rejected'; error: unknown}
> {
  try {
    return {status: 'fulfilled', value: await promise};
  } catch (error: unknown) {
    return {status: 'rejected', error};
  }
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
