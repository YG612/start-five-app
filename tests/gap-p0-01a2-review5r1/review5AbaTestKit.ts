import {
  createTaskLifecycleService,
  type TaskLifecycleService,
} from '../../src/application/coreAppService';
import {
  createPersistentTaskStorage,
  TASK_SNAPSHOT_SCHEMA,
  TASK_SNAPSHOT_VERSION,
  TASK_STORAGE_KEY,
} from '../../src/data/persistentTaskStorage';
import {
  createTaskRepository,
  type TaskRepository,
} from '../../src/data/taskRepository';
import type {Task} from '../../src/domain/task';

export interface Review5BackendSurface {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

interface Review5AtomicCapabilityV1 {
  readonly version: 1;
  readonly scope: string;
  compareExchangeItem(
    key: string,
    expectedValue: string | null,
    desiredValue: string | null,
  ): Promise<boolean>;
}

export type Review5Runtime = {
  readonly repository: TaskRepository;
  readonly service: TaskLifecycleService;
};

export type CasObservation = {
  readonly key: string;
  readonly expectedValue: string | null;
  readonly desiredValue: string | null;
};

export type RecordCasBoundaryEvidence = {
  readonly observation: CasObservation;
  readonly exactOwnerFenceReadBeforeEntry: boolean;
};

class Signal<T> {
  private resolveSignal!: (value: T) => void;
  readonly promise = new Promise<T>(resolve => {
    this.resolveSignal = resolve;
  });

  resolve(value: T): void {
    this.resolveSignal(value);
  }
}

export class DelayedPrimaryRecordCas {
  private readonly enteredSignal = new Signal<RecordCasBoundaryEvidence>();
  private readonly releaseSignal = new Signal<void>();
  private readonly appliedSignal = new Signal<boolean>();
  private released = false;

  readonly entered = this.enteredSignal.promise;
  readonly applied = this.appliedSignal.promise;

  enter(evidence: RecordCasBoundaryEvidence): void {
    this.enteredSignal.resolve(evidence);
  }

  async waitForRelease(): Promise<void> {
    await this.releaseSignal.promise;
  }

  settle(applied: boolean): void {
    this.appliedSignal.resolve(applied);
  }

  release(): void {
    if (!this.released) {
      this.released = true;
      this.releaseSignal.resolve();
    }
  }
}

type OwnerObservation = {
  readonly key: string;
  readonly value: string;
  readonly publicationSequence: number;
};

type PhysicalState = {
  readonly values: Map<string, string>;
  readonly scope: string;
  sequence: number;
  owner: OwnerObservation | null;
};

export class Review5PhysicalCasStore {
  private readonly state: PhysicalState;

  constructor(
    scope = 'start-five-review5-record-cas-aba',
    entries: readonly (readonly [string, string])[] = [],
  ) {
    this.state = {
      values: new Map(entries),
      scope,
      sequence: 0,
      owner: null,
    };
  }

  wrapper(label: string): Review5CasBackendWrapper {
    return new Review5CasBackendWrapper(this.state, label);
  }

  seedTask(task: Task): void {
    this.state.values.set(
      TASK_STORAGE_KEY,
      JSON.stringify({
        schema: TASK_SNAPSHOT_SCHEMA,
        version: TASK_SNAPSHOT_VERSION,
        tasks: [task],
      }),
    );
  }

  rawSnapshot(): Array<readonly [string, string]> {
    return Array.from(this.state.values.entries())
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, value]) => [key, value] as const);
  }
}

export class Review5CasBackendWrapper implements Review5BackendSurface {
  readonly ordinarySetAttempts: string[] = [];
  readonly ordinaryRemoveAttempts: string[] = [];
  readonly compareExchanges: CasObservation[] = [];
  readonly startFiveAtomic: Review5AtomicCapabilityV1;

  private delayedPrimaryCas: DelayedPrimaryRecordCas | null = null;
  private lastExactOwnerReadSequence = -1;

  constructor(
    private readonly state: PhysicalState,
    readonly label: string,
  ) {
    this.startFiveAtomic = {
      version: 1,
      scope: state.scope,
      compareExchangeItem: async (key, expectedValue, desiredValue) => {
        const observation = {key, expectedValue, desiredValue};
        this.compareExchanges.push(observation);
        const sequence = ++this.state.sequence;
        const ownerAtEntry = this.state.owner;
        const armedGate = this.delayedPrimaryCas;
        let delayedGate: DelayedPrimaryRecordCas | null = null;
        if (
          armedGate !== null &&
          key === TASK_STORAGE_KEY &&
          expectedValue !== desiredValue
        ) {
          this.delayedPrimaryCas = null;
          delayedGate = armedGate;
          delayedGate.enter({
            observation,
            exactOwnerFenceReadBeforeEntry:
              ownerAtEntry !== null &&
              this.lastExactOwnerReadSequence >
                ownerAtEntry.publicationSequence &&
              this.lastExactOwnerReadSequence < sequence,
          });
          await delayedGate.waitForRelease();
        }

        const current = this.state.values.get(key) ?? null;
        const applied = current === expectedValue;
        if (applied) {
          if (desiredValue === null) {
            this.state.values.delete(key);
          } else {
            this.state.values.set(key, desiredValue);
          }

          if (
            this.state.owner === null &&
            key !== TASK_STORAGE_KEY &&
            expectedValue === null &&
            desiredValue !== null
          ) {
            this.state.owner = {
              key,
              value: desiredValue,
              publicationSequence: sequence,
            };
          } else if (
            this.state.owner !== null &&
            key === this.state.owner.key &&
            expectedValue === this.state.owner.value &&
            desiredValue === null
          ) {
            this.state.owner = null;
          }
        }
        delayedGate?.settle(applied);
        return applied;
      },
    };
  }

  delayNextPrimaryRecordCasAfterOwnerFence(): DelayedPrimaryRecordCas {
    if (this.delayedPrimaryCas !== null) {
      throw new Error('A2_REVIEW5_PRIMARY_CAS_GATE_ALREADY_ARMED');
    }
    const gate = new DelayedPrimaryRecordCas();
    this.delayedPrimaryCas = gate;
    return gate;
  }

  async getItem(key: string): Promise<string | null> {
    const value = this.state.values.get(key) ?? null;
    const sequence = ++this.state.sequence;
    const owner = this.state.owner;
    if (owner !== null && key === owner.key && value === owner.value) {
      this.lastExactOwnerReadSequence = sequence;
    }
    return value;
  }

  async setItem(key: string, _value: string): Promise<void> {
    this.ordinarySetAttempts.push(key);
    throw new Error('A2_REVIEW5_ORDINARY_SET_FORBIDDEN');
  }

  async removeItem(key: string): Promise<void> {
    this.ordinaryRemoveAttempts.push(key);
    throw new Error('A2_REVIEW5_ORDINARY_REMOVE_FORBIDDEN');
  }
}

export class CountingClock {
  consumed = 0;

  constructor(private readonly value: string) {}

  readonly now = (): string => {
    this.consumed += 1;
    return this.value;
  };
}

export class ForbiddenClock {
  consumed = 0;

  readonly now = (): string => {
    this.consumed += 1;
    throw new Error('A2_REVIEW5_CLOCK_FORBIDDEN');
  };
}

export class ForbiddenIds {
  consumed = 0;

  readonly next = (): string => {
    this.consumed += 1;
    throw new Error('A2_REVIEW5_ID_FORBIDDEN');
  };
}

export class CountingIds {
  consumed = 0;

  readonly next = (): string => {
    this.consumed += 1;
    return `review5-unexpected-id-${String(this.consumed)}`;
  };
}

export function createReview5Runtime(
  backend: Review5BackendSurface,
  dependencies: {now(): string; idGenerator(): string},
): Review5Runtime {
  const repository = createTaskRepository(createPersistentTaskStorage(backend));
  const service = createTaskLifecycleService({repository, ...dependencies});
  return {repository, service};
}

export function review5SeedTask(): Task {
  return {
    id: 'review5-record-aba-task-0001',
    title: 'Review5 record CAS ABA task',
    description: 'Restore these exact logical task bytes after A commits.',
    important: true,
    urgent: false,
    status: 'pending',
    startAt: null,
    scheduledStartAt: null,
    dueAt: null,
    estimatedMinutes: 25,
    firstStep: 'Reach the public record CAS boundary',
    createdAt: '2026-08-09T06:00:00.000Z',
    updatedAt: '2026-08-09T06:00:00.000Z',
    startedAt: null,
    completedAt: null,
    deletedAt: null,
    score: null,
    scoreAwardedAt: null,
    subtasks: [],
  };
}

export function expectNoOrdinaryMutation(
  ...backends: readonly Review5CasBackendWrapper[]
): void {
  for (const backend of backends) {
    expect({
      label: backend.label,
      set: backend.ordinarySetAttempts,
      remove: backend.ordinaryRemoveAttempts,
    }).toEqual({label: backend.label, set: [], remove: []});
  }
}

export type Captured<T> =
  | {readonly status: 'fulfilled'; readonly value: T}
  | {readonly status: 'rejected'; readonly reason: unknown};

export async function capture<T>(operation: Promise<T>): Promise<Captured<T>> {
  try {
    return {status: 'fulfilled', value: await operation};
  } catch (reason: unknown) {
    return {status: 'rejected', reason};
  }
}

