import type {Task} from '../domain/task';
import {nextStartAtForTask} from '../domain/taskSupport';

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
  source?: 'explicit' | 'system' | 'low_energy';
}>;

export type ReminderBudgetPreference = Readonly<{
  maxSystemRemindersPerDay: number;
  maxSystemRemindersPerTaskPerDay: number;
  lowEnergyMaxPerDay: number;
}>;

export const DEFAULT_REMINDER_BUDGET: ReminderBudgetPreference = {
  maxSystemRemindersPerDay: 6,
  maxSystemRemindersPerTaskPerDay: 2,
  lowEnergyMaxPerDay: 3,
};

export type ReminderBudgetUsage = Readonly<{
  systemToday: number;
  systemForTaskToday: number;
  lowEnergyToday: number;
  lowEnergyForTaskToday: number;
}>;

export type ReminderIntent = Readonly<{
  taskId: string;
  ruleId: string;
  kind: ReminderKind;
  triggerAt: string;
  notificationTitle?: string;
  notificationBody?: string;
}>;

export type ReminderPlanningInput = Readonly<{
  task: Task;
  now: string;
  timeZone: string;
  progressRatio: number | null;
  rules: readonly ReminderRule[];
  budget?: ReminderBudgetPreference;
  usage?: ReminderBudgetUsage;
}>;

export type ReminderReconcileInput = Readonly<{
  task: Task;
  now: string;
  timeZone: string;
  progressRatio: number | null;
  rules: readonly ReminderRule[];
  permission: ReminderPermission;
  operationId: string;
  budget?: ReminderBudgetPreference;
  usage?: ReminderBudgetUsage;
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

class ReminderSchedulingError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'ReminderSchedulingError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

class ReminderRecoveryRequiredError extends Error {
  readonly code = 'REMINDER_RECOVERY_REQUIRED';
  readonly recoveryRequired = true;
  readonly cause: unknown;
  readonly rollbackCause: unknown;

  constructor(cause: unknown, rollbackCause: unknown) {
    super('REMINDER_RECOVERY_REQUIRED');
    this.name = 'ReminderRecoveryRequiredError';
    this.cause = cause;
    this.rollbackCause = rollbackCause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function isTerminalTask(task: Task): boolean {
  return (
    task.deletedAt !== null ||
    task.status === 'completed' ||
    task.status === 'cancelled'
  );
}

function canonicalMilliseconds(value: string): number {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new ReminderSchedulingError('REMINDER_TIMESTAMP_INVALID');
  }
  return milliseconds;
}

const MAXIMUM_DATE_MILLISECONDS = 8_640_000_000_000_000;

function validateReminderRules(input: ReminderPlanningInput): void {
  const ruleIds = new Set<string>();
  const scheduledStart =
    nextStartAtForTask(input.task) ??
    (input.task.scheduledStartAt === undefined
      ? input.task.startAt
      : input.task.scheduledStartAt);

  for (const rule of input.rules) {
    if (ruleIds.has(rule.id)) {
      throw new ReminderSchedulingError('REMINDER_RULE_ID_DUPLICATE');
    }
    ruleIds.add(rule.id);

    if (!Number.isFinite(rule.offsetMinutes) || !Number.isInteger(rule.offsetMinutes)) {
      throw new ReminderSchedulingError('REMINDER_RULE_OFFSET_INVALID');
    }
    if (
      rule.progressBelow !== null &&
      (!Number.isFinite(rule.progressBelow) ||
        rule.progressBelow < 0 ||
        rule.progressBelow > 1)
    ) {
      throw new ReminderSchedulingError(
        'REMINDER_RULE_PROGRESS_THRESHOLD_INVALID',
      );
    }

    const anchor =
      rule.anchor === 'scheduled_start' ? scheduledStart : input.task.dueAt;
    if (anchor !== null) {
      const trigger =
        canonicalMilliseconds(anchor) + rule.offsetMinutes * 60_000;
      if (
        !Number.isFinite(trigger) ||
        Math.abs(trigger) > MAXIMUM_DATE_MILLISECONDS
      ) {
        throw new ReminderSchedulingError(
          'REMINDER_TRIGGER_TIMESTAMP_OUT_OF_RANGE',
        );
      }
    }
  }
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function cloneIntent(intent: ReminderIntent): ReminderIntent {
  return {...intent};
}

function cloneSnapshot(
  snapshot: ReminderScheduleSnapshot,
): ReminderScheduleSnapshot {
  return {...snapshot, intents: snapshot.intents.map(cloneIntent)};
}

function cloneRecord(record: ReminderStateRecord): ReminderStateRecord {
  return {
    snapshot: cloneSnapshot(record.snapshot),
    binding: {...record.binding},
  };
}

function intentsEqual(
  left: readonly ReminderIntent[],
  right: readonly ReminderIntent[],
): boolean {
  return (
    left.length === right.length &&
    left.every((intent, index) => {
      const other = right[index];
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
    intentsEqual(left.intents, right.intents)
  );
}

function snapshotSemanticsEqual(
  left: ReminderScheduleSnapshot,
  right: ReminderScheduleSnapshot,
): boolean {
  return (
    left.taskId === right.taskId &&
    left.permission === right.permission &&
    left.scheduled === right.scheduled &&
    intentsEqual(left.intents, right.intents)
  );
}

function expectedPlatformState(
  snapshot: ReminderScheduleSnapshot,
): ReminderScheduleSnapshot | null {
  return snapshot.scheduled ? snapshot : null;
}

function snapshotFingerprint(snapshot: ReminderScheduleSnapshot): string {
  return JSON.stringify({
    taskId: snapshot.taskId,
    permission: snapshot.permission,
    scheduled: snapshot.scheduled,
    intents: snapshot.intents.map(intent => ({
      taskId: intent.taskId,
      ruleId: intent.ruleId,
      kind: intent.kind,
      triggerAt: intent.triggerAt,
    })),
  });
}

function unscheduledCompensationTarget(
  taskId: string,
  permission: ReminderPermission,
): ReminderScheduleSnapshot {
  return {
    taskId,
    generation: 0,
    permission,
    intents: [],
    scheduled: false,
  };
}

export function deriveReminderPlan(
  input: ReminderPlanningInput,
): readonly ReminderIntent[] {
  validateReminderRules(input);
  if (isTerminalTask(input.task)) {
    return [];
  }

  const now = canonicalMilliseconds(input.now);
  const scheduledStart =
    nextStartAtForTask(input.task) ??
    (input.task.scheduledStartAt === undefined
      ? input.task.startAt
      : input.task.scheduledStartAt);
  const intents: ReminderIntent[] = [];

  for (const rule of input.rules) {
    if (
      rule.progressBelow !== null &&
      (input.progressRatio === null ||
        input.progressRatio >= rule.progressBelow)
    ) {
      continue;
    }

    const anchor =
      rule.anchor === 'scheduled_start' ? scheduledStart : input.task.dueAt;
    if (anchor === null) {
      continue;
    }
    const trigger =
      canonicalMilliseconds(anchor) + rule.offsetMinutes * 60_000;
    if (trigger < now) {
      continue;
    }
    intents.push({
      taskId: input.task.id,
      ruleId: rule.id,
      kind: rule.kind,
      triggerAt: new Date(trigger).toISOString(),
    });
  }

  intents.sort((left, right) => {
    const instantOrder =
      canonicalMilliseconds(left.triggerAt) -
      canonicalMilliseconds(right.triggerAt);
    return instantOrder !== 0
      ? instantOrder
      : compareStrings(left.ruleId, right.ruleId);
  });
  const budgetRequested = input.budget !== undefined ||
    input.usage !== undefined ||
    input.rules.some(rule => rule.source !== undefined);
  if (!budgetRequested) return intents.map(cloneIntent);
  const rulesById = new Map(input.rules.map(rule => [rule.id, rule]));
  const deduplicatedByTrigger = new Map<string, ReminderIntent>();
  for (const intent of intents) {
    const key = `${intent.taskId}:${intent.triggerAt}`;
    const existing = deduplicatedByTrigger.get(key);
    const source = rulesById.get(intent.ruleId)?.source ?? 'system';
    const existingSource = existing === undefined
      ? null
      : rulesById.get(existing.ruleId)?.source ?? 'system';
    if (existing === undefined || (source === 'explicit' && existingSource !== 'explicit')) {
      deduplicatedByTrigger.set(key, intent);
    }
  }
  const budget = input.budget ?? DEFAULT_REMINDER_BUDGET;
  const usage = input.usage ?? {
    systemToday: 0,
    systemForTaskToday: 0,
    lowEnergyToday: 0,
    lowEnergyForTaskToday: 0,
  };
  let systemToday = usage.systemToday;
  let systemForTask = usage.systemForTaskToday;
  let lowEnergyToday = usage.lowEnergyToday;
  let lowEnergyForTask = usage.lowEnergyForTaskToday;
  const budgeted: ReminderIntent[] = [];
  for (const intent of deduplicatedByTrigger.values()) {
    const source = rulesById.get(intent.ruleId)?.source ?? 'system';
    if (source === 'system') {
      if (
        systemToday >= budget.maxSystemRemindersPerDay ||
        systemForTask >= budget.maxSystemRemindersPerTaskPerDay
      ) continue;
      systemToday += 1;
      systemForTask += 1;
    } else if (source === 'low_energy') {
      if (
        lowEnergyToday >= budget.lowEnergyMaxPerDay ||
        lowEnergyForTask >= 1
      ) continue;
      lowEnergyToday += 1;
      lowEnergyForTask += 1;
    }
    budgeted.push(intent);
  }
  return budgeted.map(cloneIntent);
}

export function postponeTaskTenMinutes(
  task: Task,
  nowInput: string,
): Readonly<{
  nextStartAt: string;
  postponedCount: number;
  suggestSmallerStep: boolean;
}> {
  const now = Date.parse(nowInput);
  if (!Number.isFinite(now)) throw new ReminderSchedulingError('REMINDER_TIMESTAMP_INVALID');
  const postponedCount = ((task as Task & {postponedCount?: number}).postponedCount ?? 0) + 1;
  return {
    nextStartAt: new Date(now + 10 * 60_000).toISOString(),
    postponedCount,
    suggestSmallerStep: postponedCount >= 3,
  };
}

export function createReminderSchedulingService(
  options: Readonly<{
    repository: ReminderRepository;
    scheduler: ReminderScheduler;
  }>,
): ReminderSchedulingService {
  async function convergePlatform(
    expected: ReminderScheduleSnapshot,
  ): Promise<void> {
    const actual = await options.scheduler.get(expected.taskId);
    if (!snapshotsEqual(actual, expectedPlatformState(expected))) {
      await options.scheduler.replace({previous: actual, next: expected});
    }
  }

  return {
    async reconcile(input) {
      const intents = deriveReminderPlan({
        ...input,
        budget: input.budget ?? DEFAULT_REMINDER_BUDGET,
      });
      const scheduled = input.permission === 'granted' && intents.length > 0;
      const semanticCandidate: ReminderScheduleSnapshot = {
        taskId: input.task.id,
        generation: 0,
        permission: input.permission,
        intents: intents.map(cloneIntent),
        scheduled,
      };
      const fingerprint = snapshotFingerprint(semanticCandidate);
      const applicationState: {
        applied: Readonly<{
          next: ReminderScheduleSnapshot;
          durablePrevious: ReminderScheduleSnapshot | null;
        }> | null;
      } = {applied: null};

      try {
        const result = await options.repository.transaction(
          async transaction => {
            const currentRecord = await transaction.get(input.task.id);
            if (
              currentRecord !== null &&
              currentRecord.binding.operationId === input.operationId &&
              currentRecord.binding.fingerprint !== fingerprint
            ) {
              throw new ReminderSchedulingError(
                'REMINDER_OPERATION_CONFLICT',
              );
            }

            if (
              currentRecord !== null &&
              snapshotSemanticsEqual(
                currentRecord.snapshot,
                semanticCandidate,
              )
            ) {
              await convergePlatform(currentRecord.snapshot);
              if (
                currentRecord.binding.operationId !== input.operationId ||
                currentRecord.binding.fingerprint !== fingerprint
              ) {
                await transaction.save({
                  snapshot: cloneSnapshot(currentRecord.snapshot),
                  binding: {operationId: input.operationId, fingerprint},
                });
              }
              return cloneSnapshot(currentRecord.snapshot);
            }

            const next: ReminderScheduleSnapshot = {
              ...semanticCandidate,
              generation:
                currentRecord === null
                  ? 1
                  : currentRecord.snapshot.generation + 1,
              intents: semanticCandidate.intents.map(cloneIntent),
            };
            const actualPlatform =
              next.scheduled || currentRecord !== null
                ? await options.scheduler.get(input.task.id)
                : null;
            if (!snapshotsEqual(actualPlatform, expectedPlatformState(next))) {
              await options.scheduler.replace({
                previous: actualPlatform,
                next,
              });
              applicationState.applied = {
                next: cloneSnapshot(next),
                durablePrevious:
                  currentRecord === null
                    ? null
                    : cloneSnapshot(currentRecord.snapshot),
              };
            }

            const record: ReminderStateRecord = {
              snapshot: cloneSnapshot(next),
              binding: {operationId: input.operationId, fingerprint},
            };
            await transaction.save(record);
            return cloneSnapshot(next);
          },
        );
        applicationState.applied = null;
        return cloneSnapshot(result);
      } catch (error: unknown) {
        const replacement = applicationState.applied;
        if (replacement !== null) {
          const rollbackTarget =
            replacement.durablePrevious ??
            unscheduledCompensationTarget(
              replacement.next.taskId,
              replacement.next.permission,
            );
          try {
            await options.scheduler.replace({
              previous: replacement.next,
              next: rollbackTarget,
            });
          } catch (rollbackError: unknown) {
            throw new ReminderRecoveryRequiredError(error, rollbackError);
          }
        }
        throw error;
      }
    },

    async getState(taskId) {
      const record = await options.repository.get(taskId);
      return record === null ? null : cloneRecord(record).snapshot;
    },
  };
}
