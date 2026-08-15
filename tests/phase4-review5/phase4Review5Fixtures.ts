import type {AsyncKeyValueBackend} from '../../src/data/persistentTaskStorage';
import {createPersistentTaskStorage} from '../../src/data/persistentTaskStorage';
import {createTaskRepository} from '../../src/data/taskRepository';
import type {Task} from '../../src/domain/task';

export const PHASE4_REVIEW5_STORAGE_KEY = 'start-five.tasks.v1';
export const PHASE4_REVIEW5_SCHEMA = 'start-five.tasks';
export const PHASE4_REVIEW5_VERSION = 1;
export const PHASE4_REVIEW5_CREATED_AT = '2026-08-05T03:00:00.000Z';
export const PHASE4_REVIEW5_UPDATED_AT = '2026-08-05T03:01:00.000Z';
export const PHASE4_REVIEW5_RECOVERY_AT = '2026-08-05T03:02:00.000Z';

export const READ_BUDGET_EXCEEDED = 'PHASE4_REVIEW5_READ_BUDGET_EXCEEDED';
export const SHARED_DAG_DEPTH = 14;
export const SHARED_DAG_UNIQUE_NODES = SHARED_DAG_DEPTH + 1;
export const SHARED_DAG_LEAF_MULTIPLICITY = 2 ** SHARED_DAG_DEPTH;
export const SHARED_DAG_GET_BUDGET = SHARED_DAG_UNIQUE_NODES * 4;

export const MAX_NESTING_DEPTH = 256;
export const MAX_ARRAY_LENGTH = 256;
export const MAX_CONTAINER_NODES = 512;
export const LINEAR_DEPTH_GET_BUDGET = MAX_NESTING_DEPTH * 2;
export const ARRAY_WITHIN_GET_BUDGET = MAX_ARRAY_LENGTH;
export const ARRAY_OVER_GET_BUDGET = 0;
export const CONTAINER_NODE_GET_BUDGET = MAX_CONTAINER_NODES * 3;

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

export function captureSyncOutcome<T>(
  work: () => T,
): PromiseOutcome<T> {
  try {
    return {status: 'fulfilled', value: work()};
  } catch (error: unknown) {
    return {status: 'rejected', error};
  }
}

export function outcomeIdentity<T>(
  outcome: PromiseOutcome<T>,
):
  | {status: 'fulfilled'}
  | {status: 'rejected'; code: unknown; message: unknown} {
  if (outcome.status === 'fulfilled') {
    return {status: 'fulfilled'};
  }
  if (typeof outcome.error !== 'object' || outcome.error === null) {
    return {
      status: 'rejected',
      code: undefined,
      message: undefined,
    };
  }
  return {
    status: 'rejected',
    code: (outcome.error as {code?: unknown}).code,
    message: (outcome.error as {message?: unknown}).message,
  };
}

export function makePendingTask(
  id: string,
  overrides: Partial<Task> = {},
): Task {
  return {
    id,
    title: `Phase 4 review 5 task ${id}`,
    description: `Plain durable task ${id}`,
    important: false,
    urgent: false,
    status: 'pending',
    startAt: null,
    dueAt: null,
    createdAt: PHASE4_REVIEW5_CREATED_AT,
    updatedAt: PHASE4_REVIEW5_CREATED_AT,
    startedAt: null,
    completedAt: null,
    deletedAt: null,
    score: null,
    scoreAwardedAt: null,
    subtasks: [],
    ...overrides,
  };
}

export function makePendingSubtask(
  taskId: string,
  ordinal: number,
): Task['subtasks'][number] {
  return {
    id: `${taskId}-subtask-${ordinal}`,
    taskId,
    title: `Small legal subtask ${ordinal}`,
    status: 'pending',
    createdAt: PHASE4_REVIEW5_CREATED_AT,
    updatedAt: PHASE4_REVIEW5_CREATED_AT,
    completedAt: null,
  };
}

export function serializeEnvelope(tasks: readonly unknown[]): string {
  return JSON.stringify({
    schema: PHASE4_REVIEW5_SCHEMA,
    version: PHASE4_REVIEW5_VERSION,
    tasks,
  });
}

export class ControlledBackend implements AsyncKeyValueBackend {
  private readonly values = new Map<string, string>();

  readonly getAttempts: string[] = [];
  readonly setAttempts: Array<{key: string; value: string}> = [];
  readonly setCommits: Array<{key: string; value: string}> = [];
  readonly removeAttempts: string[] = [];

  failNextSetWith: unknown | undefined;

  async getItem(key: string): Promise<string | null> {
    this.getAttempts.push(key);
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

export function createHarness(baseline: readonly Task[]): {
  backend: ControlledBackend;
  durableBefore: string;
  repository: ReturnType<typeof createTaskRepository>;
} {
  const backend = new ControlledBackend();
  const durableBefore = serializeEnvelope(baseline);
  backend.seed(PHASE4_REVIEW5_STORAGE_KEY, durableBefore);
  const repository = createTaskRepository(
    createPersistentTaskStorage(backend),
  );
  return {backend, durableBefore, repository};
}

export async function freshTasks(raw: string): Promise<Task[]> {
  const backend = new ControlledBackend();
  backend.seed(PHASE4_REVIEW5_STORAGE_KEY, raw);
  return createTaskRepository(
    createPersistentTaskStorage(backend),
  ).list({includeDeleted: true});
}

export type OrdinaryGetEvent = {
  nodeId: string;
  key: PropertyKey;
  attempt: number;
  withinBudget: boolean;
};

export class OrdinaryGetBudgetAudit {
  readonly events: OrdinaryGetEvent[] = [];
  attempts = 0;
  successfulGets = 0;
  exceeded = false;

  constructor(readonly limit: number) {}

  beforeGet(nodeId: string, key: PropertyKey): void {
    this.attempts += 1;
    const withinBudget = this.attempts <= this.limit;
    this.events.push({
      nodeId,
      key,
      attempt: this.attempts,
      withinBudget,
    });
    if (!withinBudget) {
      this.exceeded = true;
      throw new Error(READ_BUDGET_EXCEEDED);
    }
    this.successfulGets += 1;
  }
}

export function auditedProxy<T extends object>(
  target: T,
  nodeId: string,
  audit: OrdinaryGetBudgetAudit,
): T {
  return new Proxy(target, {
    getPrototypeOf(candidate): object | null {
      return Reflect.getPrototypeOf(candidate);
    },
    ownKeys(candidate): ArrayLike<string | symbol> {
      return Reflect.ownKeys(candidate);
    },
    getOwnPropertyDescriptor(
      candidate,
      key,
    ): PropertyDescriptor | undefined {
      return Reflect.getOwnPropertyDescriptor(candidate, key);
    },
    get(candidate, key, receiver): unknown {
      audit.beforeGet(nodeId, key);
      return Reflect.get(candidate, key, receiver) as unknown;
    },
  });
}

export type SharedDagFixture = {
  root: object;
  nodes: readonly object[];
  audit: OrdinaryGetBudgetAudit;
  uniqueNodeCount: number;
  leafMultiplicity: number;
};

export function makeSharedDag(
  budget: number = SHARED_DAG_GET_BUDGET,
): SharedDagFixture {
  const audit = new OrdinaryGetBudgetAudit(budget);
  const nodes: object[] = [];
  let current: object = auditedProxy(
    {terminal: 'shared-leaf'},
    'dag-level-0',
    audit,
  );
  nodes.push(current);

  for (let level = 1; level <= SHARED_DAG_DEPTH; level += 1) {
    const sharedChild = current;
    current = auditedProxy(
      {left: sharedChild, right: sharedChild},
      `dag-level-${level}`,
      audit,
    );
    nodes.push(current);
  }

  return {
    root: current,
    nodes,
    audit,
    uniqueNodeCount: nodes.length,
    leafMultiplicity: SHARED_DAG_LEAF_MULTIPLICITY,
  };
}

export function makeCycle(
  budget: number = 4,
): {root: object; audit: OrdinaryGetBudgetAudit} {
  const audit = new OrdinaryGetBudgetAudit(budget);
  const target: {self?: object} = {};
  const root = auditedProxy(target, 'cycle-root', audit);
  target.self = root;
  return {root, audit};
}

export function makeLinearChain(
  depth: number,
  budget: number = LINEAR_DEPTH_GET_BUDGET,
): {
  root: object;
  nodes: readonly object[];
  audit: OrdinaryGetBudgetAudit;
} {
  const audit = new OrdinaryGetBudgetAudit(budget);
  const nodes: object[] = [];
  let current: unknown = 'linear-leaf';
  for (let level = depth; level >= 1; level -= 1) {
    current = auditedProxy(
      {marker: level, next: current},
      `linear-level-${level}`,
      audit,
    );
    nodes.push(current as object);
  }
  return {root: current as object, nodes, audit};
}

export function makeWideArray(
  length: number,
  budget: number = ARRAY_WITHIN_GET_BUDGET,
): {
  proxy: readonly number[];
  target: readonly number[];
  audit: OrdinaryGetBudgetAudit;
} {
  const audit = new OrdinaryGetBudgetAudit(budget);
  const target = Array.from({length}, (_, index) => index);
  const proxy = auditedProxy(target, 'wide-array', audit);
  return {proxy, target, audit};
}

export function makeExactContainerTree(
  containerCount: number,
  budget: number = CONTAINER_NODE_GET_BUDGET,
): {
  root: object;
  nodes: readonly object[];
  audit: OrdinaryGetBudgetAudit;
} {
  if (!Number.isSafeInteger(containerCount) || containerCount < 1) {
    throw new Error('PHASE4_REVIEW5_INVALID_CONTAINER_COUNT');
  }
  const audit = new OrdinaryGetBudgetAudit(budget);
  const nodes: object[] = [];

  function build(index: number): object | null {
    if (index >= containerCount) {
      return null;
    }
    const node = auditedProxy(
      {
        slot: index,
        left: build(index * 2 + 1),
        right: build(index * 2 + 2),
      },
      `tree-${index}`,
      audit,
    );
    nodes.push(node);
    return node;
  }

  const root = build(0);
  if (root === null) {
    throw new Error('PHASE4_REVIEW5_CONTAINER_TREE_REQUIRED');
  }
  return {root, nodes, audit};
}

export function unknownPatch(
  value: unknown,
): Partial<Omit<Task, 'id'>> {
  return {unknownFutureField: value} as unknown as Partial<
    Omit<Task, 'id'>
  >;
}
