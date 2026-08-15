import {
  createTaskLifecycleService,
  type TaskLifecycleService,
  type TaskLifecycleTaskInput,
} from '../../src/application/coreAppService';
import {createFocusSessionService} from '../../src/application/focusSessionService';
import {
  createStartFiveApp,
  type StartFiveAppDependencies,
  type StartFiveAppComposition,
} from '../../src/app/startFiveApp';
import {createFocusSessionRepository} from '../../src/data/focusSessionRepository';
import {createPersistentFocusSessionStorage} from '../../src/data/persistentFocusSessionStorage';
import type {AsyncKeyValueBackend} from '../../src/data/persistentTaskStorage';
import type {Task} from '../../src/domain/task';

export const P0_06_AT = '2026-08-09T08:00:00.000Z';

type SetAttempt = Readonly<{key: string; value: string}>;

export class WorkspaceBackend implements AsyncKeyValueBackend {
  private readonly values = new Map<string, string>();
  private failNextSetReason: unknown | null = null;

  readonly getCalls: string[] = [];
  readonly setAttempts: SetAttempt[] = [];
  readonly committedSets: SetAttempt[] = [];
  readonly failedSets: SetAttempt[] = [];
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
    const attempt = {key, value};
    this.setAttempts.push(attempt);
    if (this.failNextSetReason !== null) {
      const reason = this.failNextSetReason;
      this.failNextSetReason = null;
      this.failedSets.push(attempt);
      throw reason;
    }
    this.values.set(key, value);
    this.committedSets.push(attempt);
  }

  async removeItem(key: string): Promise<void> {
    this.removeAttempts.push(key);
    this.values.delete(key);
  }

  failNextSet(reason: unknown): void {
    if (this.failNextSetReason !== null) {
      throw new Error('GAP_P0_06_SET_FAILURE_ALREADY_ARMED');
    }
    this.failNextSetReason = reason;
  }

  clearTrace(): void {
    this.getCalls.length = 0;
    this.setAttempts.length = 0;
    this.committedSets.length = 0;
    this.failedSets.length = 0;
    this.removeAttempts.length = 0;
  }

  byteRestart(): WorkspaceBackend {
    return new WorkspaceBackend(
      Array.from(this.values.entries()).map(([key, value]) => [key, value]),
    );
  }

  stableByteSnapshot(): string {
    return JSON.stringify(
      Array.from(this.values.entries()).sort(([leftKey], [rightKey]) =>
        leftKey.localeCompare(rightKey),
      ),
    );
  }
}

export class WorkspaceClock {
  calls = 0;
  private current: string;
  private readonly subscribers = new Set<() => void>();

  constructor(initial: string = P0_06_AT) {
    this.current = initial;
  }

  readonly now = (): string => {
    this.calls += 1;
    return this.current;
  };

  readonly focusRuntimeClock = {
    nowMs: (): number => Date.parse(this.current),
    subscribe: (listener: () => void): (() => void) => {
      this.subscribers.add(listener);
      return () => this.subscribers.delete(listener);
    },
  };

  set(value: string): void {
    this.current = value;
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }
}

export class WorkspaceIds {
  calls = 0;

  constructor(private readonly values: readonly string[]) {}

  readonly next = (): string => {
    const index = this.calls;
    this.calls += 1;
    return this.values[index] ?? `gap-p0-06-generated-${String(index + 1)}`;
  };
}

export type WorkspaceHarness = {
  readonly composition: StartFiveAppComposition;
  readonly lifecycle: TaskLifecycleService;
};

export function createWorkspaceHarness(
  backend: WorkspaceBackend,
  clock: WorkspaceClock,
  ids: WorkspaceIds,
  overrides: Partial<Pick<
    StartFiveAppDependencies,
    'productMetricPort' | 'productMetricClock' | 'productMetricSessionId'
  >> = {},
): WorkspaceHarness {
  const composition = createStartFiveApp({
    storageBackend: backend,
    now: clock.now,
    idGenerator: ids.next,
    focusRuntimeClock: clock.focusRuntimeClock,
    ...overrides,
  });
  return {
    composition,
    lifecycle: createTaskLifecycleService({
      repository: composition.repository,
      now: clock.now,
      idGenerator: ids.next,
    }),
  };
}

export async function createLifecycleTask(
  harness: WorkspaceHarness,
  input: TaskLifecycleTaskInput,
  operationId: string,
): Promise<Task> {
  return harness.lifecycle.create(input, {operationId});
}

export async function addTaskStep(
  harness: WorkspaceHarness,
  taskId: string,
  title: string,
  operationId: string,
): Promise<Task> {
  return harness.composition.service.addFirstStep(
    taskId,
    {title},
    {operationId},
  );
}

export async function startTaskAndFocus(
  harness: WorkspaceHarness,
  backend: WorkspaceBackend,
  clock: WorkspaceClock,
  focusIds: WorkspaceIds,
  expectedTaskId: string,
): Promise<void> {
  const started = await harness.composition.service.startRecommended({
    operationId: `gap-p0-06:seed:start:${expectedTaskId}`,
  });
  expect(started.id).toBe(expectedTaskId);
  const focusService = createFocusSessionService({
    repository: createFocusSessionRepository(
      createPersistentFocusSessionStorage(backend),
    ),
    now: clock.now,
    idGenerator: focusIds.next,
  });
  await focusService.start({taskId: expectedTaskId, plannedMinutes: 5});
}

export async function flushUiWork(turns = 40): Promise<void> {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
  }
}
