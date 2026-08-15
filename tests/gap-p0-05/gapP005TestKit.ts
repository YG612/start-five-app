import {createFocusSessionService} from '../../src/application/focusSessionService';
import {
  createFocusSessionRepository,
  type FocusSessionRepository,
} from '../../src/data/focusSessionRepository';
import {
  createPersistentFocusSessionStorage,
  FOCUS_SESSION_STORAGE_KEY,
  type FocusSessionAsyncKeyValueBackend,
} from '../../src/data/persistentFocusSessionStorage';
import {
  TASK_SNAPSHOT_SCHEMA,
  TASK_SNAPSHOT_VERSION,
  TASK_STORAGE_KEY,
  type AsyncKeyValueBackend,
} from '../../src/data/persistentTaskStorage';
import type {FocusSession} from '../../src/domain/focusSession';
import type {Task} from '../../src/domain/task';

export const P0_05_STARTED_AT = '2026-08-09T08:00:00.000Z';
export const P0_05_TASK_ID = 'gap-p0-05-task-0001';
export const P0_05_TASK_TITLE = 'GAP-P0-05 persistent focus task';
export const P0_05_STEP_TITLE = 'Persist one five minute session';

export class ManualIsoClock {
  calls = 0;
  private current: string;

  constructor(initial: string = P0_05_STARTED_AT) {
    this.current = initial;
  }

  readonly now = (): string => {
    this.calls += 1;
    return this.current;
  };

  set(value: string): void {
    this.current = value;
  }

  advance(milliseconds: number): void {
    this.current = new Date(Date.parse(this.current) + milliseconds).toISOString();
  }
}

export class SequenceIds {
  calls = 0;

  constructor(private readonly values: readonly string[]) {}

  readonly next = (): string => {
    const index = this.calls;
    this.calls += 1;
    return this.values[index] ?? `gap-p0-05-generated-${String(index + 1)}`;
  };
}

export class BackendSetGate {
  entered = 0;
  private released = false;
  private resolveRelease!: () => void;
  private readonly releasePromise = new Promise<void>(resolve => {
    this.resolveRelease = resolve;
  });

  async enterAndWait(): Promise<void> {
    this.entered += 1;
    await this.releasePromise;
  }

  release(): void {
    if (this.released) {
      return;
    }
    this.released = true;
    this.resolveRelease();
  }
}

type SetCall = Readonly<{key: string; value: string}>;

export class AppIntegrationBackend
  implements AsyncKeyValueBackend, FocusSessionAsyncKeyValueBackend
{
  private readonly values = new Map<string, string>();
  private delayedSet: {key: string; gate: BackendSetGate} | null = null;
  private failedSet: {key: string; reason: unknown} | null = null;

  readonly getCalls: string[] = [];
  readonly setAttempts: SetCall[] = [];
  readonly committedSets: SetCall[] = [];
  readonly failedSets: SetCall[] = [];
  readonly removeAttempts: string[] = [];

  constructor(entries: readonly (readonly [string, string])[] = []) {
    for (const [key, value] of entries) {
      this.values.set(key, value);
    }
  }

  async getItem(key: string): Promise<string | null> {
    this.getCalls.push(key);
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    const call = {key, value};
    this.setAttempts.push(call);

    const delayed = this.delayedSet;
    if (delayed !== null && delayed.key === key) {
      this.delayedSet = null;
      await delayed.gate.enterAndWait();
    }

    const failed = this.failedSet;
    if (failed !== null && failed.key === key) {
      this.failedSet = null;
      this.failedSets.push(call);
      throw failed.reason;
    }

    this.values.set(key, value);
    this.committedSets.push(call);
  }

  async removeItem(key: string): Promise<void> {
    this.removeAttempts.push(key);
    this.values.delete(key);
  }

  seed(key: string, value: string): void {
    this.values.set(key, value);
  }

  raw(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  rawEntries(): Array<readonly [string, string]> {
    return Array.from(this.values.entries())
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, value]) => [key, value] as const);
  }

  byteRestart(): AppIntegrationBackend {
    return new AppIntegrationBackend(this.rawEntries());
  }

  delayNextSetFor(key: string): BackendSetGate {
    if (this.delayedSet !== null) {
      throw new Error('GAP_P0_05_SET_GATE_ALREADY_ARMED');
    }
    const gate = new BackendSetGate();
    this.delayedSet = {key, gate};
    return gate;
  }

  failNextSetFor(key: string, reason: unknown): void {
    if (this.failedSet !== null) {
      throw new Error('GAP_P0_05_SET_FAILURE_ALREADY_ARMED');
    }
    this.failedSet = {key, reason};
  }

  clearTrace(): void {
    this.getCalls.length = 0;
    this.setAttempts.length = 0;
    this.committedSets.length = 0;
    this.failedSets.length = 0;
    this.removeAttempts.length = 0;
  }

  committedSetCount(key: string): number {
    return this.committedSets.filter(call => call.key === key).length;
  }
}

export function makeAppTask(
  overrides: Partial<Task> = {},
): Task {
  return {
    id: P0_05_TASK_ID,
    title: P0_05_TASK_TITLE,
    description: 'Real AppRoot focus-session integration contract.',
    important: true,
    urgent: true,
    status: 'pending',
    startAt: null,
    dueAt: null,
    createdAt: P0_05_STARTED_AT,
    updatedAt: P0_05_STARTED_AT,
    startedAt: null,
    completedAt: null,
    deletedAt: null,
    score: null,
    scoreAwardedAt: null,
    subtasks: [
      {
        id: 'gap-p0-05-step-0001',
        taskId: P0_05_TASK_ID,
        title: P0_05_STEP_TITLE,
        status: 'pending',
        createdAt: P0_05_STARTED_AT,
        updatedAt: P0_05_STARTED_AT,
        completedAt: null,
      },
    ],
    ...overrides,
  };
}

export function seedAppTask(
  backend: AppIntegrationBackend,
  task: Task = makeAppTask(),
): Task {
  backend.seed(
    TASK_STORAGE_KEY,
    JSON.stringify({
      schema: TASK_SNAPSHOT_SCHEMA,
      version: TASK_SNAPSHOT_VERSION,
      tasks: [task],
    }),
  );
  return task;
}

export function createFocusRuntime(
  backend: AppIntegrationBackend,
  clock: ManualIsoClock,
  ids: SequenceIds,
): {
  readonly repository: FocusSessionRepository;
  readonly service: ReturnType<typeof createFocusSessionService>;
} {
  const storage = createPersistentFocusSessionStorage(backend);
  const repository = createFocusSessionRepository(storage);
  const service = createFocusSessionService({
    repository,
    now: clock.now,
    idGenerator: ids.next,
  });
  return {repository, service};
}

export async function seedRunningFocus(
  backend: AppIntegrationBackend,
  options: {
    readonly taskId?: string;
    readonly sessionId?: string;
    readonly startedAt?: string;
  } = {},
): Promise<FocusSession> {
  const clock = new ManualIsoClock(options.startedAt ?? P0_05_STARTED_AT);
  const ids = new SequenceIds([options.sessionId ?? 'gap-p0-05-focus-seed']);
  return createFocusRuntime(backend, clock, ids).service.start({
    taskId: options.taskId ?? P0_05_TASK_ID,
    plannedMinutes: 5,
  });
}

export async function readTaskFocusHistory(
  backend: AppIntegrationBackend,
  taskId: string = P0_05_TASK_ID,
): Promise<readonly FocusSession[]> {
  const forbiddenClock = new ManualIsoClock('2099-01-01T00:00:00.000Z');
  const forbiddenIds = new SequenceIds(['GAP_P0_05_INSPECTOR_ID_FORBIDDEN']);
  const result = await createFocusRuntime(
    backend,
    forbiddenClock,
    forbiddenIds,
  ).service.listForTask(taskId);
  expect({clock: forbiddenClock.calls, ids: forbiddenIds.calls}).toEqual({
    clock: 0,
    ids: 0,
  });
  return result.sessions;
}

export async function flushMicrotasks(turns = 60): Promise<void> {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
  }
}

export {FOCUS_SESSION_STORAGE_KEY, TASK_STORAGE_KEY};
