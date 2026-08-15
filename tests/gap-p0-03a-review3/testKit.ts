import type {FocusSession} from '../../src/domain/focusSession';
import type {Task} from '../../src/domain/task';

export type ReminderKind =
  | 'planning'
  | 'start'
  | 'progress'
  | 'rescue'
  | 'overdue_decision';

export type ReminderAnchor = 'scheduled_start' | 'due';
export type ReminderPermission = 'denied' | 'not_determined' | 'granted';

export type ReminderRule = Readonly<{
  id: string;
  kind: ReminderKind;
  anchor: ReminderAnchor;
  offsetMinutes: number;
  progressBelow: number | null;
}>;

export type ReminderIntent = Readonly<{
  taskId: string;
  ruleId: string;
  kind: ReminderKind;
  triggerAt: string;
}>;

export type ReminderPlanningInput = Readonly<{
  task: Task;
  now: string;
  timeZone: string;
  progressRatio: number | null;
  rules: readonly ReminderRule[];
}>;

export type ReminderReconcileInput = Readonly<{
  task: Task;
  now: string;
  timeZone: string;
  progressRatio: number | null;
  rules: readonly ReminderRule[];
  permission: ReminderPermission;
  operationId: string;
}>;

export type ReminderScheduleSnapshot = Readonly<{
  taskId: string;
  generation: number;
  permission: ReminderPermission;
  intents: readonly ReminderIntent[];
  scheduled: boolean;
}>;

export type ReminderOperationBinding = Readonly<{
  operationId: string;
  fingerprint: string;
}>;

export type ReminderStateRecord = Readonly<{
  snapshot: ReminderScheduleSnapshot;
  binding: ReminderOperationBinding;
}>;

export type ReminderTransaction = {
  get(taskId: string): Promise<ReminderStateRecord | null>;
  save(record: ReminderStateRecord): Promise<void>;
  remove(taskId: string): Promise<void>;
};

export type ReminderRepository = {
  get(taskId: string): Promise<ReminderStateRecord | null>;
  transaction<T>(
    work: (transaction: ReminderTransaction) => Promise<T>,
  ): Promise<T>;
};

export type ReminderReplaceRequest = Readonly<{
  previous: ReminderScheduleSnapshot | null;
  next: ReminderScheduleSnapshot;
}>;

export type ReminderScheduler = {
  get(taskId: string): Promise<ReminderScheduleSnapshot | null>;
  replace(request: ReminderReplaceRequest): Promise<void>;
};

export type ReminderSchedulingService = {
  reconcile(input: ReminderReconcileInput): Promise<ReminderScheduleSnapshot>;
  getState(taskId: string): Promise<ReminderScheduleSnapshot | null>;
};

export type ReminderModule = {
  deriveReminderPlan(input: ReminderPlanningInput): readonly ReminderIntent[];
  createReminderSchedulingService(options: Readonly<{
    repository: ReminderRepository;
    scheduler: ReminderScheduler;
  }>): ReminderSchedulingService;
};

export type DelayDiagnosisTrigger =
  | 'scheduled_start_missed'
  | 'repeated_delay'
  | 'reminder_dismissed'
  | 'due_progress_risk'
  | 'user_stuck'
  | 'focus_interrupted';

export type DelayDiagnosisSignals = Readonly<{
  consecutiveDelayCount: number;
  dismissedReminderCount: number;
  progressRatio: number;
  userStuck: boolean;
}>;

export type DelayDiagnosisPolicy = Readonly<{
  minimumConsecutiveDelays: number;
  minimumReminderDismissals: number;
  dueRiskWindowMinutes: number;
  dueRiskProgressBelow: number;
  allowedReasonKeys: readonly string[];
  maxPrivateTextCodePoints: number;
}>;

export type DelayDiagnosisEligibilityInput = Readonly<{
  task: Task;
  focusSession: FocusSession | null;
  now: string;
  signals: DelayDiagnosisSignals;
  policy: DelayDiagnosisPolicy;
}>;

export type DelayDiagnosisEligibility = Readonly<{
  eligible: boolean;
  triggers: readonly DelayDiagnosisTrigger[];
}>;

export type DelaySuggestion =
  | Readonly<{kind: 'first_step'; value: string}>
  | Readonly<{kind: 'estimated_minutes'; value: number}>
  | Readonly<{kind: 'reschedule'; scheduledStartAt: string}>;

export type DelayDiagnosis = Readonly<{
  id: string;
  taskId: string;
  focusSessionId: string | null;
  trigger: DelayDiagnosisTrigger;
  reasonKey: string;
  privateText: string | null;
  suggestions: readonly DelaySuggestion[];
  createdAt: string;
}>;

export type DelayDiagnosisContext = Readonly<{
  task: Task | null;
  focusSession: FocusSession | null;
}>;

export type DelayDiagnosisContextPort = {
  load(
    taskId: string,
    focusSessionId: string | null,
  ): Promise<DelayDiagnosisContext>;
};

export type DelayDiagnosisOperationRecord = Readonly<{
  operationId: string;
  fingerprint: string;
  diagnosis: DelayDiagnosis;
}>;

export type DelayDiagnosisTransaction = {
  getOperation(
    operationId: string,
  ): Promise<DelayDiagnosisOperationRecord | null>;
  saveDiagnosis(diagnosis: DelayDiagnosis): Promise<void>;
  saveOperation(record: DelayDiagnosisOperationRecord): Promise<void>;
};

export type DelayDiagnosisRepository = {
  getOperation(
    operationId: string,
  ): Promise<DelayDiagnosisOperationRecord | null>;
  list(taskId?: string): Promise<readonly DelayDiagnosis[]>;
  transaction<T>(
    work: (transaction: DelayDiagnosisTransaction) => Promise<T>,
  ): Promise<T>;
};

export type DelayDiagnosisSubmitInput = Readonly<{
  taskId: string;
  focusSessionId: string | null;
  signals: DelayDiagnosisSignals;
  trigger: DelayDiagnosisTrigger;
  reasonKey: string;
  privateText: string | null;
  suggestions: readonly DelaySuggestion[];
}>;

export type DelayDiagnosisOperation = Readonly<{operationId: string}>;

export type DelayDiagnosisSummaryCount = Readonly<{
  key: string;
  count: number;
}>;

export type DelayDiagnosisSummary = Readonly<{
  total: number;
  byReason: readonly DelayDiagnosisSummaryCount[];
  byTrigger: readonly DelayDiagnosisSummaryCount[];
}>;

export type DelayDiagnosisService = {
  submit(
    input: DelayDiagnosisSubmitInput,
    operation: DelayDiagnosisOperation,
  ): Promise<DelayDiagnosis>;
  listForTask(taskId: string): Promise<readonly DelayDiagnosis[]>;
  summarize(taskId?: string): Promise<DelayDiagnosisSummary>;
};

export type DelayDiagnosisModule = {
  deriveDelayDiagnosisEligibility(
    input: DelayDiagnosisEligibilityInput,
  ): DelayDiagnosisEligibility;
  createDelayDiagnosisService(options: Readonly<{
    context: DelayDiagnosisContextPort;
    repository: DelayDiagnosisRepository;
    now(): string;
    idGenerator(): string;
    policy: DelayDiagnosisPolicy;
  }>): DelayDiagnosisService;
};

function freezeRecursively(value: unknown, seen: Set<object>): void {
  if (typeof value !== 'object' || value === null || seen.has(value)) {
    return;
  }
  seen.add(value);
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) {
      freezeRecursively(descriptor.value, seen);
    }
  }
  for (const key of Object.getOwnPropertySymbols(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) {
      freezeRecursively(descriptor.value, seen);
    }
  }
  Object.freeze(value);
}

export function deepFreeze<T>(value: T): T {
  freezeRecursively(value, new Set<object>());
  return value;
}

function cloneTask(task: Task): Task {
  return {...task, subtasks: task.subtasks.map(subtask => ({...subtask}))};
}

function cloneFocusSession(session: FocusSession): FocusSession {
  return {...session};
}

function cloneRule(rule: ReminderRule): ReminderRule {
  return {...rule};
}

export function clonePlanningInput(
  input: ReminderPlanningInput,
): ReminderPlanningInput {
  return {
    task: cloneTask(input.task),
    now: input.now,
    timeZone: input.timeZone,
    progressRatio: input.progressRatio,
    rules: input.rules.map(cloneRule),
  };
}

function cloneIntent(intent: ReminderIntent): ReminderIntent {
  return {...intent};
}

function cloneReminderSnapshot(
  snapshot: ReminderScheduleSnapshot,
): ReminderScheduleSnapshot {
  return {...snapshot, intents: snapshot.intents.map(cloneIntent)};
}

function cloneReminderRecord(record: ReminderStateRecord): ReminderStateRecord {
  return {
    snapshot: cloneReminderSnapshot(record.snapshot),
    binding: {...record.binding},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isReminderKind(value: unknown): value is ReminderKind {
  return (
    value === 'planning' ||
    value === 'start' ||
    value === 'progress' ||
    value === 'rescue' ||
    value === 'overdue_decision'
  );
}

function isReminderPermission(value: unknown): value is ReminderPermission {
  return (
    value === 'denied' || value === 'not_determined' || value === 'granted'
  );
}

function parseIntent(value: unknown): ReminderIntent {
  if (
    !isRecord(value) ||
    typeof value.taskId !== 'string' ||
    typeof value.ruleId !== 'string' ||
    !isReminderKind(value.kind) ||
    typeof value.triggerAt !== 'string'
  ) {
    throw new Error('TEST_REMINDER_BYTES_INVALID');
  }
  return {
    taskId: value.taskId,
    ruleId: value.ruleId,
    kind: value.kind,
    triggerAt: value.triggerAt,
  };
}

function parseReminderSnapshot(value: unknown): ReminderScheduleSnapshot {
  if (
    !isRecord(value) ||
    typeof value.taskId !== 'string' ||
    typeof value.generation !== 'number' ||
    !Number.isInteger(value.generation) ||
    !isReminderPermission(value.permission) ||
    !Array.isArray(value.intents) ||
    typeof value.scheduled !== 'boolean'
  ) {
    throw new Error('TEST_REMINDER_BYTES_INVALID');
  }
  return {
    taskId: value.taskId,
    generation: value.generation,
    permission: value.permission,
    intents: value.intents.map(parseIntent),
    scheduled: value.scheduled,
  };
}

function parseReminderRecord(value: unknown): ReminderStateRecord {
  if (
    !isRecord(value) ||
    !isRecord(value.binding) ||
    typeof value.binding.operationId !== 'string' ||
    typeof value.binding.fingerprint !== 'string'
  ) {
    throw new Error('TEST_REMINDER_BYTES_INVALID');
  }
  return {
    snapshot: parseReminderSnapshot(value.snapshot),
    binding: {
      operationId: value.binding.operationId,
      fingerprint: value.binding.fingerprint,
    },
  };
}

function parseReminderBytes(raw: string | null): ReminderStateRecord[] {
  if (raw === null) {
    return [];
  }
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('TEST_REMINDER_BYTES_INVALID');
  }
  return parsed.map(parseReminderRecord);
}

export class PhysicalReminderBackend {
  raw: string | null = null;
  tail: Promise<void> = Promise.resolve();
  failNextCommit: Error | null = null;
  readonly events: string[] = [];
  readCount = 0;
  readOnlyLookupCount = 0;
  transactionAttemptCount = 0;
  saveAttemptCount = 0;
  removeAttemptCount = 0;
  commitCount = 0;
}

export class ByteReminderRepository implements ReminderRepository {
  constructor(readonly backend: PhysicalReminderBackend) {}

  get(taskId: string): Promise<ReminderStateRecord | null> {
    return this.backend.tail.then(() => {
      this.backend.readCount += 1;
      this.backend.readOnlyLookupCount += 1;
      this.backend.events.push('get-readonly');
      const found = parseReminderBytes(this.backend.raw).find(
        record => record.snapshot.taskId === taskId,
      );
      return found === undefined ? null : cloneReminderRecord(found);
    });
  }

  transaction<T>(
    work: (transaction: ReminderTransaction) => Promise<T>,
  ): Promise<T> {
    const thisBackend = this.backend;
    const result = this.backend.tail.then(async () => {
      this.backend.readCount += 1;
      this.backend.transactionAttemptCount += 1;
      this.backend.events.push('transaction-begin');
      const records = parseReminderBytes(this.backend.raw);
      let dirty = false;
      const transaction: ReminderTransaction = {
        async get(taskId) {
          thisBackend.events.push('transaction-get');
          const found = records.find(
            record => record.snapshot.taskId === taskId,
          );
          return found === undefined ? null : cloneReminderRecord(found);
        },
        async save(record) {
          thisBackend.saveAttemptCount += 1;
          thisBackend.events.push('save');
          const captured = cloneReminderRecord(record);
          const index = records.findIndex(
            candidate =>
              candidate.snapshot.taskId === captured.snapshot.taskId,
          );
          if (index === -1) {
            records.push(captured);
          } else {
            records[index] = captured;
          }
          dirty = true;
        },
        async remove(taskId) {
          thisBackend.removeAttemptCount += 1;
          thisBackend.events.push('remove');
          const index = records.findIndex(
            candidate => candidate.snapshot.taskId === taskId,
          );
          if (index !== -1) {
            records.splice(index, 1);
            dirty = true;
          }
        },
      };
      const output = await work(transaction);
      if (dirty) {
        const failure = this.backend.failNextCommit;
        this.backend.failNextCommit = null;
        if (failure !== null) {
          this.backend.events.push('commit-failed');
          throw failure;
        }
        this.backend.raw = JSON.stringify(records);
        this.backend.commitCount += 1;
        this.backend.events.push('commit-succeeded');
      }
      return output;
    });
    this.backend.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export class DeepFrozenReminderRepository implements ReminderRepository {
  constructor(private readonly inner: ReminderRepository) {}

  async get(taskId: string): Promise<ReminderStateRecord | null> {
    const value = await this.inner.get(taskId);
    return value === null ? null : deepFreeze(value);
  }

  transaction<T>(
    work: (transaction: ReminderTransaction) => Promise<T>,
  ): Promise<T> {
    return this.inner.transaction(transaction =>
      work({
        async get(taskId) {
          const value = await transaction.get(taskId);
          return value === null ? null : deepFreeze(value);
        },
        save(record) {
          return transaction.save(record);
        },
        remove(taskId) {
          return transaction.remove(taskId);
        },
      }),
    );
  }
}

export class ManualBarrier {
  readonly entered: Promise<void>;
  private signalEntered: (() => void) | null = null;
  private readonly released: Promise<void>;
  private signalReleased: (() => void) | null = null;

  constructor() {
    this.entered = new Promise(resolve => {
      this.signalEntered = resolve;
    });
    this.released = new Promise(resolve => {
      this.signalReleased = resolve;
    });
  }

  async wait(): Promise<void> {
    this.signalEntered?.();
    await this.released;
  }

  release(): void {
    this.signalReleased?.();
  }
}

export type SchedulerCall = Readonly<{
  previous: ReminderScheduleSnapshot | null;
  next: ReminderScheduleSnapshot;
}>;

export class PhysicalSchedulerBackend {
  raw: string | null = null;
  readonly calls: SchedulerCall[] = [];
  readonly events: string[] = [];
  failNext: Error | null = null;
  queryCount = 0;
}

function parseSchedulerBytes(raw: string | null): ReminderScheduleSnapshot[] {
  if (raw === null) {
    return [];
  }
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('TEST_SCHEDULER_BYTES_INVALID');
  }
  return parsed.map(parseReminderSnapshot);
}

function reminderSnapshotsEqual(
  left: ReminderScheduleSnapshot | null,
  right: ReminderScheduleSnapshot | null,
): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return (
    left.taskId === right.taskId &&
    left.generation === right.generation &&
    left.permission === right.permission &&
    left.scheduled === right.scheduled &&
    left.intents.length === right.intents.length &&
    left.intents.every((intent, index) => {
      const other = right.intents[index];
      return (
        other !== undefined &&
        intent.taskId === other.taskId &&
        intent.ruleId === other.ruleId &&
        intent.kind === other.kind &&
        intent.triggerAt === other.triggerAt
      );
    })
  );
}

export class AtomicReminderScheduler implements ReminderScheduler {
  constructor(
    readonly backend: PhysicalSchedulerBackend,
    private readonly barrier: ManualBarrier | null = null,
  ) {}

  async get(taskId: string): Promise<ReminderScheduleSnapshot | null> {
    this.backend.queryCount += 1;
    this.backend.events.push('get');
    const found = parseSchedulerBytes(this.backend.raw).find(
      snapshot => snapshot.taskId === taskId,
    );
    return found === undefined ? null : cloneReminderSnapshot(found);
  }

  async replace(request: ReminderReplaceRequest): Promise<void> {
    const captured: SchedulerCall = {
      previous:
        request.previous === null
          ? null
          : cloneReminderSnapshot(request.previous),
      next: cloneReminderSnapshot(request.next),
    };
    this.backend.calls.push(captured);
    this.backend.events.push('replace');
    if (this.barrier !== null) {
      await this.barrier.wait();
    }
    const current =
      parseSchedulerBytes(this.backend.raw).find(
        snapshot => snapshot.taskId === captured.next.taskId,
      ) ?? null;
    if (!reminderSnapshotsEqual(current, captured.previous)) {
      this.backend.events.push('replace-cas-mismatch');
      throw new Error('TEST_SCHEDULER_CAS_MISMATCH');
    }
    const failure = this.backend.failNext;
    this.backend.failNext = null;
    if (failure !== null) {
      this.backend.events.push('replace-failed');
      throw failure;
    }
    const snapshots = parseSchedulerBytes(this.backend.raw).filter(
      snapshot => snapshot.taskId !== captured.next.taskId,
    );
    if (captured.next.scheduled) {
      snapshots.push(cloneReminderSnapshot(captured.next));
    }
    this.backend.raw = JSON.stringify(snapshots);
    this.backend.events.push('replace-committed');
  }
}

export class DeepFrozenReminderScheduler implements ReminderScheduler {
  constructor(private readonly inner: ReminderScheduler) {}

  async get(taskId: string): Promise<ReminderScheduleSnapshot | null> {
    const value = await this.inner.get(taskId);
    return value === null ? null : deepFreeze(value);
  }

  replace(request: ReminderReplaceRequest): Promise<void> {
    return this.inner.replace(request);
  }
}

function cloneSuggestion(suggestion: DelaySuggestion): DelaySuggestion {
  if (suggestion.kind === 'reschedule') {
    return {...suggestion};
  }
  return {...suggestion};
}

function cloneDiagnosis(diagnosis: DelayDiagnosis): DelayDiagnosis {
  return {
    ...diagnosis,
    suggestions: diagnosis.suggestions.map(cloneSuggestion),
  };
}

function cloneDiagnosisOperation(
  operation: DelayDiagnosisOperationRecord,
): DelayDiagnosisOperationRecord {
  return {...operation, diagnosis: cloneDiagnosis(operation.diagnosis)};
}

function isDiagnosisTrigger(value: unknown): value is DelayDiagnosisTrigger {
  return (
    value === 'scheduled_start_missed' ||
    value === 'repeated_delay' ||
    value === 'reminder_dismissed' ||
    value === 'due_progress_risk' ||
    value === 'user_stuck' ||
    value === 'focus_interrupted'
  );
}

function parseSuggestion(value: unknown): DelaySuggestion {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    throw new Error('TEST_DIAGNOSIS_BYTES_INVALID');
  }
  if (value.kind === 'first_step' && typeof value.value === 'string') {
    return {kind: 'first_step', value: value.value};
  }
  if (value.kind === 'estimated_minutes' && typeof value.value === 'number') {
    return {kind: 'estimated_minutes', value: value.value};
  }
  if (
    value.kind === 'reschedule' &&
    typeof value.scheduledStartAt === 'string'
  ) {
    return {kind: 'reschedule', scheduledStartAt: value.scheduledStartAt};
  }
  throw new Error('TEST_DIAGNOSIS_BYTES_INVALID');
}

function parseDiagnosis(value: unknown): DelayDiagnosis {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.taskId !== 'string' ||
    !(
      value.focusSessionId === null ||
      typeof value.focusSessionId === 'string'
    ) ||
    !isDiagnosisTrigger(value.trigger) ||
    typeof value.reasonKey !== 'string' ||
    !(value.privateText === null || typeof value.privateText === 'string') ||
    !Array.isArray(value.suggestions) ||
    typeof value.createdAt !== 'string'
  ) {
    throw new Error('TEST_DIAGNOSIS_BYTES_INVALID');
  }
  return {
    id: value.id,
    taskId: value.taskId,
    focusSessionId: value.focusSessionId,
    trigger: value.trigger,
    reasonKey: value.reasonKey,
    privateText: value.privateText,
    suggestions: value.suggestions.map(parseSuggestion),
    createdAt: value.createdAt,
  };
}

function parseDiagnosisOperation(
  value: unknown,
): DelayDiagnosisOperationRecord {
  if (
    !isRecord(value) ||
    typeof value.operationId !== 'string' ||
    typeof value.fingerprint !== 'string'
  ) {
    throw new Error('TEST_DIAGNOSIS_BYTES_INVALID');
  }
  return {
    operationId: value.operationId,
    fingerprint: value.fingerprint,
    diagnosis: parseDiagnosis(value.diagnosis),
  };
}

type DiagnosisBytes = {
  diagnoses: DelayDiagnosis[];
  operations: DelayDiagnosisOperationRecord[];
};

function parseDiagnosisBytes(raw: string | null): DiagnosisBytes {
  if (raw === null) {
    return {diagnoses: [], operations: []};
  }
  const parsed: unknown = JSON.parse(raw);
  if (
    !isRecord(parsed) ||
    !Array.isArray(parsed.diagnoses) ||
    !Array.isArray(parsed.operations)
  ) {
    throw new Error('TEST_DIAGNOSIS_BYTES_INVALID');
  }
  return {
    diagnoses: parsed.diagnoses.map(parseDiagnosis),
    operations: parsed.operations.map(parseDiagnosisOperation),
  };
}

export class PhysicalDiagnosisBackend {
  raw: string | null = null;
  tail: Promise<void> = Promise.resolve();
  failNextCommit: Error | null = null;
  commitBarrier: ManualBarrier | null = null;
  readonly events: string[] = [];
  readCount = 0;
  readOnlyOperationLookupCount = 0;
  transactionAttemptCount = 0;
  commitCount = 0;
}

export class ByteDiagnosisRepository implements DelayDiagnosisRepository {
  constructor(readonly backend: PhysicalDiagnosisBackend) {}

  getOperation(
    operationId: string,
  ): Promise<DelayDiagnosisOperationRecord | null> {
    return this.backend.tail.then(() => {
      this.backend.readCount += 1;
      this.backend.readOnlyOperationLookupCount += 1;
      this.backend.events.push('get-operation-readonly');
      const {operations} = parseDiagnosisBytes(this.backend.raw);
      const found = operations.find(
        operation => operation.operationId === operationId,
      );
      return found === undefined ? null : cloneDiagnosisOperation(found);
    });
  }

  list(taskId?: string): Promise<readonly DelayDiagnosis[]> {
    return this.backend.tail.then(() => {
      this.backend.readCount += 1;
      this.backend.events.push('list');
      const {diagnoses} = parseDiagnosisBytes(this.backend.raw);
      return diagnoses
        .filter(diagnosis => taskId === undefined || diagnosis.taskId === taskId)
        .map(cloneDiagnosis);
    });
  }

  transaction<T>(
    work: (transaction: DelayDiagnosisTransaction) => Promise<T>,
  ): Promise<T> {
    const backend = this.backend;
    const result = backend.tail.then(async () => {
      backend.readCount += 1;
      backend.transactionAttemptCount += 1;
      backend.events.push('transaction-begin');
      const staged = parseDiagnosisBytes(backend.raw);
      let dirty = false;
      const transaction: DelayDiagnosisTransaction = {
        async getOperation(operationId) {
          backend.events.push('get-operation');
          const found = staged.operations.find(
            operation => operation.operationId === operationId,
          );
          return found === undefined ? null : cloneDiagnosisOperation(found);
        },
        async saveDiagnosis(diagnosis) {
          backend.events.push('save-diagnosis');
          const captured = cloneDiagnosis(diagnosis);
          if (staged.diagnoses.some(item => item.id === captured.id)) {
            throw new Error('TEST_DIAGNOSIS_ID_CONFLICT');
          }
          staged.diagnoses.push(captured);
          dirty = true;
        },
        async saveOperation(operation) {
          backend.events.push('save-operation');
          const captured = cloneDiagnosisOperation(operation);
          const index = staged.operations.findIndex(
            item => item.operationId === captured.operationId,
          );
          if (index === -1) {
            staged.operations.push(captured);
          } else {
            staged.operations[index] = captured;
          }
          dirty = true;
        },
      };
      const output = await work(transaction);
      if (dirty) {
        if (backend.commitBarrier !== null) {
          await backend.commitBarrier.wait();
        }
        const failure = backend.failNextCommit;
        backend.failNextCommit = null;
        if (failure !== null) {
          backend.events.push('commit-failed');
          throw failure;
        }
        backend.raw = JSON.stringify(staged);
        backend.commitCount += 1;
        backend.events.push('commit-succeeded');
      }
      return output;
    });
    backend.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export class DeepFrozenDiagnosisRepository
  implements DelayDiagnosisRepository
{
  constructor(private readonly inner: DelayDiagnosisRepository) {}

  async getOperation(
    operationId: string,
  ): Promise<DelayDiagnosisOperationRecord | null> {
    const value = await this.inner.getOperation(operationId);
    return value === null ? null : deepFreeze(value);
  }

  async list(taskId?: string): Promise<readonly DelayDiagnosis[]> {
    return deepFreeze(await this.inner.list(taskId));
  }

  transaction<T>(
    work: (transaction: DelayDiagnosisTransaction) => Promise<T>,
  ): Promise<T> {
    return this.inner.transaction(transaction =>
      work({
        async getOperation(operationId) {
          const value = await transaction.getOperation(operationId);
          return value === null ? null : deepFreeze(value);
        },
        saveDiagnosis(diagnosis) {
          return transaction.saveDiagnosis(diagnosis);
        },
        saveOperation(operation) {
          return transaction.saveOperation(operation);
        },
      }),
    );
  }
}

export class StaticDiagnosisContext implements DelayDiagnosisContextPort {
  readonly tasks = new Map<string, Task>();
  readonly sessions = new Map<string, FocusSession>();
  readonly calls: Array<
    Readonly<{taskId: string; focusSessionId: string | null}>
  > = [];
  loadCount = 0;

  async load(
    taskId: string,
    focusSessionId: string | null,
  ): Promise<DelayDiagnosisContext> {
    this.loadCount += 1;
    this.calls.push({taskId, focusSessionId});
    const task = this.tasks.get(taskId);
    const session =
      focusSessionId === null ? undefined : this.sessions.get(focusSessionId);
    return {
      task: task === undefined ? null : cloneTask(task),
      focusSession:
        session === undefined ? null : cloneFocusSession(session),
    };
  }
}

export class DeepFrozenDiagnosisContext
  implements DelayDiagnosisContextPort
{
  constructor(private readonly inner: DelayDiagnosisContextPort) {}

  async load(
    taskId: string,
    focusSessionId: string | null,
  ): Promise<DelayDiagnosisContext> {
    return deepFreeze(await this.inner.load(taskId, focusSessionId));
  }
}

export class SequenceValues {
  private index = 0;

  constructor(private readonly values: readonly string[]) {}

  next = (): string => {
    const value = this.values[this.index];
    if (value === undefined) {
      throw new Error('TEST_SEQUENCE_EXHAUSTED');
    }
    this.index += 1;
    return value;
  };

  get calls(): number {
    return this.index;
  }
}

export function loadReminderModule(): ReminderModule {
  try {
    return jest.requireActual<ReminderModule>(
      '../../src/application/reminderScheduling',
    );
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`GAP_P0_03A_IMPLEMENTATION_REQUIRED:reminder:${detail}`);
  }
}

export function loadDiagnosisModule(): DelayDiagnosisModule {
  try {
    return jest.requireActual<DelayDiagnosisModule>(
      '../../src/application/delayDiagnosis',
    );
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`GAP_P0_03A_IMPLEMENTATION_REQUIRED:diagnosis:${detail}`);
  }
}

export async function expectCode(
  operation: () => Promise<unknown>,
  expected: string,
): Promise<unknown> {
  try {
    await operation();
  } catch (error: unknown) {
    expect(error).toMatchObject({code: expected});
    return error;
  }
  throw new Error(`TEST_EXPECTED_ERROR_NOT_THROWN:${expected}`);
}

export async function captureError(
  operation: () => Promise<unknown>,
): Promise<unknown> {
  try {
    await operation();
  } catch (error: unknown) {
    return error;
  }
  throw new Error('TEST_EXPECTED_ERROR_NOT_THROWN');
}

function serializeForPrivacy(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? '' : serialized;
  } catch (error: unknown) {
    return `TEST_SERIALIZATION_FAILED:${String(error)}`;
  }
}

export function errorPrivacyChannels(error: unknown): readonly string[] {
  const channels: string[] = [String(error), serializeForPrivacy(error)];
  if (error instanceof Error) {
    channels.push(error.message);
  }
  if (isRecord(error) && error.cause !== undefined) {
    channels.push(String(error.cause), serializeForPrivacy(error.cause));
    if (error.cause instanceof Error) {
      channels.push(error.cause.message);
    }
  }
  return channels;
}

export function focusSession(
  id: string,
  taskId: string,
  overrides: Partial<FocusSession> = {},
): FocusSession {
  return {
    id,
    taskId,
    plannedMinutes: 5,
    status: 'interrupted',
    startedAt: '2026-08-05T09:00:00.000Z',
    plannedEndAt: '2026-08-05T09:05:00.000Z',
    endedAt: '2026-08-05T09:02:00.000Z',
    actualSeconds: 120,
    interruptionReason: 'interrupted',
    createdAt: '2026-08-05T09:00:00.000Z',
    updatedAt: '2026-08-05T09:02:00.000Z',
    ...overrides,
  };
}
