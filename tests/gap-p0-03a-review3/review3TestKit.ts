import type {FocusSession} from '../../src/domain/focusSession';
import type {Task} from '../../src/domain/task';
import {makeTask} from '../gap-p0-01a2/a2Fixtures';
import {
  ByteDiagnosisRepository,
  ByteReminderRepository,
  PhysicalDiagnosisBackend,
  PhysicalReminderBackend,
  SequenceValues,
  StaticDiagnosisContext,
  loadDiagnosisModule,
  loadReminderModule,
  type DelayDiagnosisContext,
  type DelayDiagnosisContextPort,
  type DelayDiagnosisModule,
  type DelayDiagnosisPolicy,
  type DelayDiagnosisService,
  type DelayDiagnosisSignals,
  type DelayDiagnosisSubmitInput,
  type ReminderReconcileInput,
  type ReminderReplaceRequest,
  type ReminderRule,
  type ReminderScheduleSnapshot,
  type ReminderScheduler,
  type ReminderSchedulingService,
} from './testKit';

export const REVIEW_REASON_KEYS: readonly string[] = [
  'task_too_large',
  'unclear_how_to_start',
  'afraid_of_poor_quality',
  'boring',
  'too_tired',
  'not_enough_time',
  'distracted',
  'not_necessary_now',
  'other',
];

export const REVIEW_POLICY: DelayDiagnosisPolicy = {
  minimumConsecutiveDelays: 2,
  minimumReminderDismissals: 3,
  dueRiskWindowMinutes: 120,
  dueRiskProgressBelow: 0.5,
  allowedReasonKeys: REVIEW_REASON_KEYS,
  maxPrivateTextCodePoints: 80,
};

export const REVIEW_STUCK_SIGNALS: DelayDiagnosisSignals = {
  consecutiveDelayCount: 0,
  dismissedReminderCount: 0,
  progressRatio: 0.8,
  userStuck: true,
};

export function reviewEligibleTask(id = 'review-diagnosis-task'): Task {
  return makeTask(id, {
    startAt: '2026-08-05T10:00:00.000Z',
    scheduledStartAt: '2026-08-05T10:00:00.000Z',
    dueAt: '2026-08-05T12:00:00.000Z',
  });
}

export function reviewSubmitInput(
  overrides: Partial<DelayDiagnosisSubmitInput> = {},
): DelayDiagnosisSubmitInput {
  return {
    taskId: 'review-diagnosis-task',
    focusSessionId: null,
    signals: REVIEW_STUCK_SIGNALS,
    trigger: 'user_stuck',
    reasonKey: 'task_too_large',
    privateText: null,
    suggestions: [],
    ...overrides,
  };
}

export type ReviewDiagnosisHarness = Readonly<{
  service: DelayDiagnosisService;
  backend: PhysicalDiagnosisBackend;
  context: DelayDiagnosisContextPort;
  clock: SequenceValues;
  ids: SequenceValues;
}>;

export function createReviewDiagnosisHarness(options: {
  module?: DelayDiagnosisModule;
  backend?: PhysicalDiagnosisBackend;
  context?: DelayDiagnosisContextPort;
  policy?: DelayDiagnosisPolicy;
  clock?: SequenceValues;
  ids?: SequenceValues;
} = {}): ReviewDiagnosisHarness {
  const module = options.module ?? loadDiagnosisModule();
  const backend = options.backend ?? new PhysicalDiagnosisBackend();
  const context = options.context ?? new StaticDiagnosisContext();
  const clock =
    options.clock ??
    new SequenceValues([
      '2026-08-05T10:00:00.000Z',
      '2026-08-05T10:01:00.000Z',
      '2026-08-05T10:02:00.000Z',
      '2026-08-05T10:03:00.000Z',
      '2026-08-05T10:04:00.000Z',
      '2026-08-05T10:05:00.000Z',
      '2026-08-05T10:06:00.000Z',
      '2026-08-05T10:07:00.000Z',
      '2026-08-05T10:08:00.000Z',
      '2026-08-05T10:09:00.000Z',
      '2026-08-05T10:10:00.000Z',
      '2026-08-05T10:11:00.000Z',
      '2026-08-05T10:12:00.000Z',
      '2026-08-05T10:13:00.000Z',
      '2026-08-05T10:14:00.000Z',
      '2026-08-05T10:15:00.000Z',
    ]);
  const ids =
    options.ids ??
    new SequenceValues([
      'review-diagnosis-01',
      'review-diagnosis-02',
      'review-diagnosis-03',
      'review-diagnosis-04',
      'review-diagnosis-05',
      'review-diagnosis-06',
      'review-diagnosis-07',
      'review-diagnosis-08',
      'review-diagnosis-09',
      'review-diagnosis-10',
      'review-diagnosis-11',
      'review-diagnosis-12',
      'review-diagnosis-13',
      'review-diagnosis-14',
      'review-diagnosis-15',
      'review-diagnosis-16',
    ]);
  const service = module.createDelayDiagnosisService({
    context,
    repository: new ByteDiagnosisRepository(backend),
    now: clock.next,
    idGenerator: ids.next,
    policy: options.policy ?? REVIEW_POLICY,
  });
  return {service, backend, context, clock, ids};
}

function cloneTask(task: Task): Task {
  return {...task, subtasks: task.subtasks.map(subtask => ({...subtask}))};
}

function cloneFocusSession(session: FocusSession): FocusSession {
  return {...session};
}

export class ScriptedDiagnosisContext implements DelayDiagnosisContextPort {
  readonly calls: Array<
    Readonly<{taskId: string; focusSessionId: string | null}>
  > = [];
  loadCount = 0;

  constructor(
    private readonly value: DelayDiagnosisContext,
    private readonly failure: Error | null = null,
  ) {}

  async load(
    taskId: string,
    focusSessionId: string | null,
  ): Promise<DelayDiagnosisContext> {
    this.loadCount += 1;
    this.calls.push({taskId, focusSessionId});
    if (this.failure !== null) {
      throw this.failure;
    }
    return {
      task: this.value.task === null ? null : cloneTask(this.value.task),
      focusSession:
        this.value.focusSession === null
          ? null
          : cloneFocusSession(this.value.focusSession),
    };
  }
}

export const REVIEW_START_RULE: ReminderRule = {
  id: 'review-start',
  kind: 'start',
  anchor: 'scheduled_start',
  offsetMinutes: 0,
  progressBelow: null,
};

export const REVIEW_BEFORE_SNAPSHOT: ReminderScheduleSnapshot = {
  taskId: 'review-reminder-task',
  generation: 1,
  permission: 'granted',
  intents: [
    {
      taskId: 'review-reminder-task',
      ruleId: 'review-start',
      kind: 'start',
      triggerAt: '2026-08-05T10:00:00.000Z',
    },
  ],
  scheduled: true,
};

export const REVIEW_NEXT_SNAPSHOT: ReminderScheduleSnapshot = {
  taskId: 'review-reminder-task',
  generation: 2,
  permission: 'granted',
  intents: [
    {
      taskId: 'review-reminder-task',
      ruleId: 'review-start',
      kind: 'start',
      triggerAt: '2026-08-05T11:00:00.000Z',
    },
  ],
  scheduled: true,
};

export const REVIEW_ORPHAN_SNAPSHOT: ReminderScheduleSnapshot = {
  taskId: 'review-reminder-task',
  generation: 1,
  permission: 'granted',
  intents: [
    {
      taskId: 'review-reminder-task',
      ruleId: 'review-start',
      kind: 'start',
      triggerAt: '2026-08-05T11:00:00.000Z',
    },
  ],
  scheduled: true,
};

export const REVIEW_STALE_SNAPSHOT: ReminderScheduleSnapshot = {
  taskId: 'review-reminder-task',
  generation: 0,
  permission: 'granted',
  intents: [
    {
      taskId: 'review-reminder-task',
      ruleId: 'review-stale',
      kind: 'planning',
      triggerAt: '2026-08-05T08:00:00.000Z',
    },
  ],
  scheduled: true,
};

export function reviewReconcileInput(
  scheduledStartAt: string,
  operationId: string,
  overrides: Partial<ReminderReconcileInput> = {},
): ReminderReconcileInput {
  return {
    task: makeTask('review-reminder-task', {
      title: 'Review reminder task',
      startAt: scheduledStartAt,
      scheduledStartAt,
      dueAt: '2026-08-05T14:00:00.000Z',
    }),
    now: '2026-08-05T09:00:00.000Z',
    timeZone: 'Asia/Shanghai',
    progressRatio: 0,
    rules: [REVIEW_START_RULE],
    permission: 'granted',
    operationId,
    ...overrides,
  };
}

function cloneIntent(
  intent: ReminderScheduleSnapshot['intents'][number],
): ReminderScheduleSnapshot['intents'][number] {
  return {...intent};
}

function cloneSnapshot(
  snapshot: ReminderScheduleSnapshot,
): ReminderScheduleSnapshot {
  return {...snapshot, intents: snapshot.intents.map(cloneIntent)};
}

function snapshotsEqual(
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPermission(
  value: unknown,
): value is ReminderScheduleSnapshot['permission'] {
  return (
    value === 'denied' || value === 'not_determined' || value === 'granted'
  );
}

function isKind(
  value: unknown,
): value is ReminderScheduleSnapshot['intents'][number]['kind'] {
  return (
    value === 'planning' ||
    value === 'start' ||
    value === 'progress' ||
    value === 'rescue' ||
    value === 'overdue_decision'
  );
}

function parseSnapshot(value: unknown): ReminderScheduleSnapshot {
  if (
    !isRecord(value) ||
    typeof value.taskId !== 'string' ||
    typeof value.generation !== 'number' ||
    !Number.isInteger(value.generation) ||
    !isPermission(value.permission) ||
    typeof value.scheduled !== 'boolean' ||
    !Array.isArray(value.intents)
  ) {
    throw new Error('REVIEW_SCHEDULER_BYTES_INVALID');
  }
  const intents = value.intents.map(item => {
    if (
      !isRecord(item) ||
      typeof item.taskId !== 'string' ||
      typeof item.ruleId !== 'string' ||
      !isKind(item.kind) ||
      typeof item.triggerAt !== 'string'
    ) {
      throw new Error('REVIEW_SCHEDULER_BYTES_INVALID');
    }
    return {
      taskId: item.taskId,
      ruleId: item.ruleId,
      kind: item.kind,
      triggerAt: item.triggerAt,
    };
  });
  return {
    taskId: value.taskId,
    generation: value.generation,
    permission: value.permission,
    intents,
    scheduled: value.scheduled,
  };
}

function parseSchedulerBytes(raw: string | null): ReminderScheduleSnapshot[] {
  if (raw === null) {
    return [];
  }
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('REVIEW_SCHEDULER_BYTES_INVALID');
  }
  return parsed.map(parseSnapshot);
}

export type ReviewSchedulerCall = Readonly<{
  previous: ReminderScheduleSnapshot | null;
  next: ReminderScheduleSnapshot;
}>;

export class ScriptedSchedulerBackend {
  raw: string | null = null;
  readonly calls: ReviewSchedulerCall[] = [];
  readonly events: string[] = [];
  readonly failures: Array<Readonly<{attempt: number; error: Error}>> = [];
  queryCount = 0;
  replaceAttemptCount = 0;
}

export class ScriptedReminderScheduler implements ReminderScheduler {
  constructor(readonly backend: ScriptedSchedulerBackend) {}

  async get(taskId: string): Promise<ReminderScheduleSnapshot | null> {
    this.backend.queryCount += 1;
    this.backend.events.push('get');
    const found = parseSchedulerBytes(this.backend.raw).find(
      snapshot => snapshot.taskId === taskId,
    );
    return found === undefined ? null : cloneSnapshot(found);
  }

  async replace(request: ReminderReplaceRequest): Promise<void> {
    this.backend.replaceAttemptCount += 1;
    const attempt = this.backend.replaceAttemptCount;
    const captured: ReviewSchedulerCall = {
      previous:
        request.previous === null ? null : cloneSnapshot(request.previous),
      next: cloneSnapshot(request.next),
    };
    this.backend.calls.push(captured);
    this.backend.events.push(`replace-${attempt}-begin`);
    const current =
      parseSchedulerBytes(this.backend.raw).find(
        snapshot => snapshot.taskId === captured.next.taskId,
      ) ?? null;
    if (!snapshotsEqual(current, captured.previous)) {
      this.backend.events.push(`replace-${attempt}-cas-mismatch`);
      throw new Error('REVIEW_SCHEDULER_CAS_MISMATCH');
    }
    const failure = this.backend.failures.find(item => item.attempt === attempt);
    if (failure !== undefined) {
      this.backend.events.push(`replace-${attempt}-failed`);
      throw failure.error;
    }
    const snapshots = parseSchedulerBytes(this.backend.raw).filter(
      snapshot => snapshot.taskId !== captured.next.taskId,
    );
    if (captured.next.scheduled) {
      snapshots.push(cloneSnapshot(captured.next));
    }
    this.backend.raw = JSON.stringify(snapshots);
    this.backend.events.push(`replace-${attempt}-committed`);
  }
}

export type ReviewReminderHarness = Readonly<{
  service: ReminderSchedulingService;
  repositoryBackend: PhysicalReminderBackend;
  schedulerBackend: ScriptedSchedulerBackend;
  scheduler: ScriptedReminderScheduler;
}>;

export function createReviewReminderHarness(options: {
  repositoryBackend?: PhysicalReminderBackend;
  schedulerBackend?: ScriptedSchedulerBackend;
} = {}): ReviewReminderHarness {
  const repositoryBackend =
    options.repositoryBackend ?? new PhysicalReminderBackend();
  const schedulerBackend =
    options.schedulerBackend ?? new ScriptedSchedulerBackend();
  const scheduler = new ScriptedReminderScheduler(schedulerBackend);
  const service = loadReminderModule().createReminderSchedulingService({
    repository: new ByteReminderRepository(repositoryBackend),
    scheduler,
  });
  return {service, repositoryBackend, schedulerBackend, scheduler};
}

export function reminderRepositoryBytes(
  snapshot: ReminderScheduleSnapshot,
  operationId: string,
  fingerprint = 'review-prior-fingerprint',
): string {
  return JSON.stringify([
    {
      snapshot: cloneSnapshot(snapshot),
      binding: {operationId, fingerprint},
    },
  ]);
}

export function schedulerBytes(
  snapshots: readonly ReminderScheduleSnapshot[],
): string {
  return JSON.stringify(snapshots.map(cloneSnapshot));
}

export function isRecoveryRequiredError(
  value: unknown,
): value is Error & {
  code: 'REMINDER_RECOVERY_REQUIRED';
  recoveryRequired: true;
  cause: unknown;
  rollbackCause: unknown;
} {
  return (
    value instanceof Error &&
    'code' in value &&
    value.code === 'REMINDER_RECOVERY_REQUIRED' &&
    'recoveryRequired' in value &&
    value.recoveryRequired === true &&
    'cause' in value &&
    'rollbackCause' in value
  );
}
