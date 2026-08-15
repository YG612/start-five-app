import type {Task} from '../../src/domain/task';
import type {AsyncKeyValueBackend} from '../../src/data/persistentTaskStorage';

export const PHASE4_REVIEW4_STORAGE_KEY = 'start-five.tasks.v1';
export const PHASE4_REVIEW4_SCHEMA = 'start-five.tasks';
export const PHASE4_REVIEW4_VERSION = 1;
export const PHASE4_REVIEW4_CREATED_AT = '2026-08-05T02:00:00.000Z';
export const PHASE4_REVIEW4_UPDATED_AT = '2026-08-05T02:01:00.000Z';
export const PHASE4_REVIEW4_RECOVERY_AT = '2026-08-05T02:02:00.000Z';
export const CALLER_CONTROLLED_PROXY_GET = 'CALLER_CONTROLLED_PROXY_GET';

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
  outcome: PromiseOutcome<T>,
):
  | {status: 'fulfilled'}
  | {status: 'rejected'; code: unknown; message: unknown} {
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
    title: `Phase 4 review 4 task ${id}`,
    description: `Plain durable task ${id}`,
    important: false,
    urgent: false,
    status: 'pending',
    startAt: null,
    dueAt: null,
    createdAt: PHASE4_REVIEW4_CREATED_AT,
    updatedAt: PHASE4_REVIEW4_CREATED_AT,
    startedAt: null,
    completedAt: null,
    deletedAt: null,
    score: null,
    scoreAwardedAt: null,
    subtasks: [],
    ...overrides,
  };
}

export function serializeEnvelope(tasks: readonly unknown[]): string {
  return JSON.stringify({
    schema: PHASE4_REVIEW4_SCHEMA,
    version: PHASE4_REVIEW4_VERSION,
    tasks,
  });
}

export class ControlledBackend implements AsyncKeyValueBackend {
  private readonly values = new Map<string, string>();

  readonly getAttempts: string[] = [];
  readonly setAttempts: Array<{key: string; value: string}> = [];
  readonly setCommits: Array<{key: string; value: string}> = [];
  readonly removeAttempts: string[] = [];

  failNextGetWith: unknown | undefined;
  failNextSetWith: unknown | undefined;

  async getItem(key: string): Promise<string | null> {
    this.getAttempts.push(key);
    if (this.failNextGetWith !== undefined) {
      const failure = this.failNextGetWith;
      this.failNextGetWith = undefined;
      throw failure;
    }
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.setAttempts.push({key, value});
    if (this.failNextSetWith !== undefined) {
      const failure = this.failNextSetWith;
      this.failNextSetWith = undefined;
      throw failure;
    }
    this.values.set(key, value);
    this.setCommits.push({key, value});
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
}

export type ProxyAuditEvent =
  | {kind: 'getPrototypeOf'}
  | {kind: 'ownKeys'}
  | {kind: 'descriptor'; key: PropertyKey}
  | {kind: 'get'; key: PropertyKey}
  | {kind: 'throwingGet'; key: PropertyKey};

export class ProxyAudit {
  readonly events: ProxyAuditEvent[] = [];

  record(event: ProxyAuditEvent): void {
    this.events.push(event);
  }

  hasIntrospection(): boolean {
    return this.events.some(
      event =>
        event.kind === 'getPrototypeOf' ||
        event.kind === 'ownKeys' ||
        event.kind === 'descriptor',
    );
  }

  hasThrowingGet(key: PropertyKey): boolean {
    return this.events.some(
      event => event.kind === 'throwingGet' && event.key === key,
    );
  }

  firstThrowingGetIndex(key: PropertyKey): number {
    return this.events.findIndex(
      event => event.kind === 'throwingGet' && event.key === key,
    );
  }

  firstIntrospectionIndex(): number {
    return this.events.findIndex(
      event =>
        event.kind === 'getPrototypeOf' ||
        event.kind === 'ownKeys' ||
        event.kind === 'descriptor',
    );
  }
}

export function throwingOrdinaryGetProxy<T extends object>(
  target: T,
  throwingKey: PropertyKey,
): {proxy: T; audit: ProxyAudit} {
  const audit = new ProxyAudit();
  const proxy = new Proxy(target, {
    getPrototypeOf(candidate): object | null {
      audit.record({kind: 'getPrototypeOf'});
      return Reflect.getPrototypeOf(candidate);
    },
    ownKeys(candidate): ArrayLike<string | symbol> {
      audit.record({kind: 'ownKeys'});
      return Reflect.ownKeys(candidate);
    },
    getOwnPropertyDescriptor(candidate, key): PropertyDescriptor | undefined {
      audit.record({kind: 'descriptor', key});
      return Reflect.getOwnPropertyDescriptor(candidate, key);
    },
    get(candidate, key, receiver): unknown {
      if (key === throwingKey) {
        audit.record({kind: 'throwingGet', key});
        throw new Error(CALLER_CONTROLLED_PROXY_GET);
      }
      audit.record({kind: 'get', key});
      return Reflect.get(candidate, key, receiver) as unknown;
    },
  });
  return {proxy, audit};
}

export function transparentProxy<T extends object>(target: T): T {
  return new Proxy(target, {});
}

export type TransactionSurface = {
  create(task: Task): Promise<Task>;
  update(id: string, patch: Partial<Omit<Task, 'id'>>): Promise<Task>;
};
