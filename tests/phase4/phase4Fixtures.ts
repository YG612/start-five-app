import type {CoreAppService, NetworkAdapter} from '../../src/application/coreAppService';
import type {
  KeyValueStorage,
  TaskRepository,
} from '../../src/data/taskRepository';
import type {Task} from '../../src/domain/task';
import type React from 'react';

export const PHASE4_STORAGE_KEY = 'start-five.tasks.v1';
export const PHASE4_SNAPSHOT_SCHEMA = 'start-five.tasks';
export const PHASE4_SNAPSHOT_VERSION = 1;
export const PHASE4_NOW = '2026-08-04T10:00:00.000Z';

export type AsyncKeyValueBackend = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type PersistentTaskStorageModule = {
  createPersistentTaskStorage(
    backend: AsyncKeyValueBackend,
  ): KeyValueStorage;
};

export type StartFiveAppComposition = {
  repository: TaskRepository;
  service: CoreAppService;
  AppRoot: React.ComponentType;
};

export type StartFiveAppModule = {
  createStartFiveApp(dependencies: {
    storageBackend: AsyncKeyValueBackend;
    now(): string;
    idGenerator(): string;
    network?: NetworkAdapter;
  }): StartFiveAppComposition;
};

export type Phase4RequireActual = (moduleName: string) => unknown;

export class InspectableAsyncKeyValueBackend
  implements AsyncKeyValueBackend
{
  private readonly values = new Map<string, string>();

  readonly getCalls: string[] = [];
  readonly setAttempts: Array<{key: string; value: string}> = [];
  readonly committedSetCalls: Array<{key: string; value: string}> = [];
  readonly removeCalls: string[] = [];

  failNextGetWith: unknown = null;
  failNextSetWith: unknown = null;
  failNextRemoveWith: unknown = null;

  async getItem(key: string): Promise<string | null> {
    this.getCalls.push(key);
    const failure = this.failNextGetWith;
    this.failNextGetWith = null;
    if (failure !== null) {
      throw failure;
    }
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.setAttempts.push({key, value});
    const failure = this.failNextSetWith;
    this.failNextSetWith = null;
    if (failure !== null) {
      throw failure;
    }
    this.values.set(key, value);
    this.committedSetCalls.push({key, value});
  }

  async removeItem(key: string): Promise<void> {
    this.removeCalls.push(key);
    const failure = this.failNextRemoveWith;
    this.failNextRemoveWith = null;
    if (failure !== null) {
      throw failure;
    }
    this.values.delete(key);
  }

  raw(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  seed(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function isMissingRequestedModule(
  error: unknown,
  moduleName: string,
): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as {code?: unknown; message?: unknown};
  if (
    candidate.code !== 'MODULE_NOT_FOUND' ||
    typeof candidate.message !== 'string'
  ) {
    return false;
  }

  const firstLine = candidate.message.split(/\r?\n/, 1)[0] ?? '';
  const singleQuoted = `Cannot find module '${moduleName}'`;
  const doubleQuoted = `Cannot find module "${moduleName}"`;
  return (
    firstLine === singleQuoted ||
    firstLine.startsWith(`${singleQuoted} from `) ||
    firstLine === doubleQuoted ||
    firstLine.startsWith(`${doubleQuoted} from `)
  );
}

export function requirePhase4Module<T>(
  moduleName: string,
  contractName: string,
  requireActual: Phase4RequireActual = requestedModule =>
    jest.requireActual(requestedModule),
): T {
  try {
    return requireActual(moduleName) as T;
  } catch (error: unknown) {
    if (isMissingRequestedModule(error, moduleName)) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `PHASE4_IMPLEMENTATION_REQUIRED: ${contractName}; ${detail}`,
      );
    }
    throw error;
  }
}

export function makePhase4Task(
  id: string,
  overrides: Partial<Task> = {},
): Task {
  return {
    id,
    title: `Phase 4 task ${id}`,
    description: `Durable description for ${id}`,
    important: false,
    urgent: false,
    status: 'pending',
    startAt: '2026-08-05T09:00:00.000Z',
    dueAt: '2026-08-08T18:00:00.000Z',
    createdAt: PHASE4_NOW,
    updatedAt: PHASE4_NOW,
    startedAt: null,
    completedAt: null,
    deletedAt: null,
    score: null,
    scoreAwardedAt: null,
    subtasks: [],
    ...overrides,
  };
}

export function makeQuadrantAndStatusTasks(): Task[] {
  const q1 = makePhase4Task('q1-pending', {
    important: true,
    urgent: true,
    subtasks: [
      {
        id: 'q1-step-pending',
        taskId: 'q1-pending',
        title: 'Open the requirements document',
        status: 'pending',
        createdAt: PHASE4_NOW,
        updatedAt: PHASE4_NOW,
        completedAt: null,
      },
    ],
  });
  const q2 = makePhase4Task('q2-in-progress', {
    important: true,
    urgent: false,
    status: 'in_progress',
    startedAt: '2026-08-04T10:05:00.000Z',
    updatedAt: '2026-08-04T10:06:00.000Z',
    subtasks: [
      {
        id: 'q2-step-completed',
        taskId: 'q2-in-progress',
        title: 'Create the outline',
        status: 'completed',
        createdAt: PHASE4_NOW,
        updatedAt: '2026-08-04T10:06:00.000Z',
        completedAt: '2026-08-04T10:06:00.000Z',
      },
      {
        id: 'q2-step-pending',
        taskId: 'q2-in-progress',
        title: 'Write the first paragraph',
        status: 'pending',
        createdAt: PHASE4_NOW,
        updatedAt: PHASE4_NOW,
        completedAt: null,
      },
    ],
  });
  const q3 = makePhase4Task('q3-completed', {
    important: false,
    urgent: true,
    status: 'completed',
    startedAt: '2026-08-04T10:01:00.000Z',
    completedAt: '2026-08-04T10:09:00.000Z',
    updatedAt: '2026-08-04T10:09:00.000Z',
    score: 15,
    scoreAwardedAt: '2026-08-04T10:09:00.000Z',
    subtasks: [
      {
        id: 'q3-step-completed',
        taskId: 'q3-completed',
        title: 'Send the requested file',
        status: 'completed',
        createdAt: PHASE4_NOW,
        updatedAt: '2026-08-04T10:08:00.000Z',
        completedAt: '2026-08-04T10:08:00.000Z',
      },
    ],
  });
  const q4 = makePhase4Task('q4-cancelled', {
    important: false,
    urgent: false,
    status: 'cancelled',
    startAt: null,
    dueAt: null,
    updatedAt: '2026-08-04T10:20:00.000Z',
    deletedAt: '2026-08-04T10:20:00.000Z',
  });

  return [q1, q2, q3, q4];
}

export function serializePhase4Envelope(tasks: readonly Task[]): string {
  return JSON.stringify({
    schema: PHASE4_SNAPSHOT_SCHEMA,
    version: PHASE4_SNAPSHOT_VERSION,
    tasks,
  });
}
