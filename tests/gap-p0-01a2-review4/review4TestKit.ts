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
} from '../../src/data/persistentTaskStorage';
import {
  createTaskRepository,
  type TaskRepository,
} from '../../src/data/taskRepository';
import type {Task} from '../../src/domain/task';

export interface Review4BackendSurface {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface Review4AtomicCapabilityV1 {
  readonly version: 1;
  readonly scope: string;
  compareExchangeItem(
    key: string,
    expectedValue: string | null,
    desiredValue: string | null,
  ): Promise<boolean>;
}

export type Review4Runtime = {
  readonly repository: TaskRepository;
  readonly service: TaskLifecycleService;
};

export function createReview4Runtime(
  backend: Review4BackendSurface,
  dependencies: {now(): string; idGenerator(): string},
): Review4Runtime {
  const repository = createTaskRepository(createPersistentTaskStorage(backend));
  const service = createTaskLifecycleService({repository, ...dependencies});
  return {repository, service};
}

export class CountingClock {
  consumed = 0;

  constructor(private readonly value = '2026-08-06T05:00:00.000Z') {}

  readonly now = (): string => {
    this.consumed += 1;
    return this.value;
  };
}

export class CountingIds {
  consumed = 0;

  constructor(private readonly prefix: string) {}

  readonly next = (): string => {
    this.consumed += 1;
    return `${this.prefix}-${String(this.consumed).padStart(4, '0')}`;
  };
}

export class ForbiddenClock {
  consumed = 0;

  readonly now = (): string => {
    this.consumed += 1;
    throw new Error('A2_REVIEW4_CLOCK_FORBIDDEN');
  };
}

export class ForbiddenIds {
  consumed = 0;

  readonly next = (): string => {
    this.consumed += 1;
    throw new Error('A2_REVIEW4_ID_FORBIDDEN');
  };
}

export function review4CreateInput(
  seed: number,
  overrides: Partial<TaskLifecycleTaskInput> = {},
): TaskLifecycleTaskInput {
  return {
    title: `Review4 task ${String(seed)}`,
    description: `Review4 description ${String(seed)}`,
    important: seed % 2 === 0,
    urgent: seed % 3 === 0,
    startAt: null,
    scheduledStartAt: null,
    dueAt: null,
    estimatedMinutes: 5,
    firstStep: `Review4 first step ${String(seed)}`,
    ...overrides,
  };
}

export type CompareExchangeObservation = {
  readonly key: string;
  readonly expectedValue: string | null;
  readonly desiredValue: string | null;
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

export class LostCasAcknowledgement {
  private readonly committedSignal = new Signal<CompareExchangeObservation>();
  readonly committed = this.committedSignal.promise;

  markCommitted(observation: CompareExchangeObservation): void {
    this.committedSignal.resolve(observation);
  }

  resultThatNeverReturns(): Promise<boolean> {
    return new Promise<boolean>(() => undefined);
  }
}

export class DelayedCasAcknowledgement {
  private readonly committedSignal = new Signal<CompareExchangeObservation>();
  private readonly releasedSignal = new Signal<void>();
  private released = false;
  readonly committed = this.committedSignal.promise;

  markCommitted(observation: CompareExchangeObservation): void {
    this.committedSignal.resolve(observation);
  }

  async waitForRelease(): Promise<boolean> {
    await this.releasedSignal.promise;
    return true;
  }

  release(): void {
    if (!this.released) {
      this.released = true;
      this.releasedSignal.resolve();
    }
  }
}

export class PublicCasBoundaryGate {
  private readonly enteredSignal = new Signal<void>();
  private readonly releasedSignal = new Signal<void>();
  private released = false;
  readonly entered = this.enteredSignal.promise;

  async wait(): Promise<void> {
    this.enteredSignal.resolve();
    await this.releasedSignal.promise;
  }

  release(): void {
    if (!this.released) {
      this.released = true;
      this.releasedSignal.resolve();
    }
  }
}

type PhysicalCasState = {
  readonly diagnosticScope: string;
  readonly values: Map<string, string>;
};

export class Review4PhysicalCasStore {
  private readonly state: PhysicalCasState;

  constructor(
    diagnosticScope = 'start-five-review4-physical-cas',
    entries: readonly (readonly [string, string])[] = [],
  ) {
    this.state = {diagnosticScope, values: new Map(entries)};
  }

  wrapper(label: string): Review4CasBackendWrapper {
    return new Review4CasBackendWrapper(this.state, label);
  }

  seedCurrentV1(tasks: readonly Task[]): void {
    this.state.values.set(
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

  valueObservedAt(key: string): string | null {
    return this.state.values.get(key) ?? null;
  }
}

type AfterCommitFault =
  | {readonly kind: 'lost'; readonly fault: LostCasAcknowledgement}
  | {readonly kind: 'delayed'; readonly fault: DelayedCasAcknowledgement};

export class Review4CasBackendWrapper implements Review4BackendSurface {
  readonly reads: string[] = [];
  readonly ordinarySetAttempts: Array<{
    readonly key: string;
    readonly value: string;
  }> = [];
  readonly ordinaryRemoveAttempts: string[] = [];
  readonly compareExchanges: CompareExchangeObservation[] = [];
  readonly startFiveAtomic: Review4AtomicCapabilityV1;

  private nextAfterCommitFault: AfterCommitFault | null = null;
  private nextBoundaryGate: PublicCasBoundaryGate | null = null;
  private nextCasObserver: Signal<void> | null = null;

  constructor(
    private readonly state: PhysicalCasState,
    readonly label: string,
  ) {
    this.startFiveAtomic = {
      version: 1,
      scope: state.diagnosticScope,
      compareExchangeItem: async (key, expectedValue, desiredValue) => {
        const observation = {key, expectedValue, desiredValue};
        this.compareExchanges.push(observation);
        const observer = this.nextCasObserver;
        this.nextCasObserver = null;
        observer?.resolve();

        const boundaryGate = this.nextBoundaryGate;
        this.nextBoundaryGate = null;
        if (boundaryGate !== null) {
          await boundaryGate.wait();
        }

        const current = this.state.values.get(key) ?? null;
        if (current !== expectedValue) {
          return false;
        }
        if (desiredValue === null) {
          this.state.values.delete(key);
        } else {
          this.state.values.set(key, desiredValue);
        }

        const fault = this.nextAfterCommitFault;
        if (fault !== null && desiredValue !== current) {
          this.nextAfterCommitFault = null;
          if (fault.kind === 'lost') {
            fault.fault.markCommitted(observation);
            return fault.fault.resultThatNeverReturns();
          }
          fault.fault.markCommitted(observation);
          return fault.fault.waitForRelease();
        }
        return true;
      },
    };
  }

  loseAcknowledgementAfterNextSuccessfulMutation(): LostCasAcknowledgement {
    if (this.nextAfterCommitFault !== null) {
      throw new Error('A2_REVIEW4_AFTER_COMMIT_FAULT_ALREADY_ARMED');
    }
    const fault = new LostCasAcknowledgement();
    this.nextAfterCommitFault = {kind: 'lost', fault};
    return fault;
  }

  delayAcknowledgementAfterNextSuccessfulMutation(): DelayedCasAcknowledgement {
    if (this.nextAfterCommitFault !== null) {
      throw new Error('A2_REVIEW4_AFTER_COMMIT_FAULT_ALREADY_ARMED');
    }
    const fault = new DelayedCasAcknowledgement();
    this.nextAfterCommitFault = {kind: 'delayed', fault};
    return fault;
  }

  pauseNextPublicCas(): PublicCasBoundaryGate {
    if (this.nextBoundaryGate !== null) {
      throw new Error('A2_REVIEW4_PUBLIC_CAS_GATE_ALREADY_ARMED');
    }
    const gate = new PublicCasBoundaryGate();
    this.nextBoundaryGate = gate;
    return gate;
  }

  observeNextPublicCas(): Promise<void> {
    if (this.nextCasObserver !== null) {
      throw new Error('A2_REVIEW4_PUBLIC_CAS_OBSERVER_ALREADY_ARMED');
    }
    const observer = new Signal<void>();
    this.nextCasObserver = observer;
    return observer.promise;
  }

  primaryReadCount(): number {
    return this.reads.filter(key => key === TASK_STORAGE_KEY).length;
  }

  async getItem(key: string): Promise<string | null> {
    this.reads.push(key);
    return this.state.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.ordinarySetAttempts.push({key, value});
    throw new Error('A2_REVIEW4_ORDINARY_SET_FORBIDDEN');
  }

  async removeItem(key: string): Promise<void> {
    this.ordinaryRemoveAttempts.push(key);
    throw new Error('A2_REVIEW4_ORDINARY_REMOVE_FORBIDDEN');
  }
}

export class Review4LegacyBackend implements Review4BackendSurface {
  readonly values = new Map<string, string>();
  readonly reads: string[] = [];
  readonly writes: string[] = [];

  seedCurrentV1(tasks: readonly Task[]): void {
    this.values.set(
      TASK_STORAGE_KEY,
      JSON.stringify({
        schema: TASK_SNAPSHOT_SCHEMA,
        version: TASK_SNAPSHOT_VERSION,
        tasks,
      }),
    );
  }

  async getItem(key: string): Promise<string | null> {
    this.reads.push(key);
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.writes.push(key);
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.writes.push(key);
    this.values.delete(key);
  }
}

type BoundaryOutcome = 'cas-observed' | 'operation-settled';

export async function expectPublicCasBeforeSettlement(
  operation: Promise<unknown>,
  casObserved: Promise<void>,
): Promise<void> {
  const outcome = await Promise.race<BoundaryOutcome>([
    casObserved.then(() => 'cas-observed'),
    operation.then(
      () => 'operation-settled',
      () => 'operation-settled',
    ),
  ]);
  expect(outcome).toBe('cas-observed');
}

export function expectNoOrdinaryMutation(
  ...backends: readonly Review4CasBackendWrapper[]
): void {
  for (const backend of backends) {
    expect(backend.ordinarySetAttempts).toEqual([]);
    expect(backend.ordinaryRemoveAttempts).toEqual([]);
  }
}
