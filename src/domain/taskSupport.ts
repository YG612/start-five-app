import type {FocusDurationMinutes} from './focusSession';
import type {Task, TaskProgress} from './task';

export const TASK_SUPPORT_SCHEMA_VERSION = 1 as const;

export type StuckReason =
  | 'TOO_LARGE'
  | 'DONT_KNOW_HOW'
  | 'FEAR_OF_POOR_RESULT'
  | 'LOW_ENERGY'
  | 'OTHER';

export type RepairAction =
  | 'SET_SMALLER_FIRST_STEP'
  | 'CLARIFY_OUTPUT'
  | 'ROUGH_DRAFT'
  | 'START_TWO_MINUTES'
  | 'START_FIVE_MINUTES'
  | 'RESCHEDULE'
  | 'SET_MINIMUM_GOAL'
  | 'ABANDON';

export type StuckRepairRecord = Readonly<{
  operationKey: string;
  reason: StuckReason;
  action: RepairAction;
  note: string | null;
  firstStep: string | null;
  focusMinutes: 2 | 5 | null;
  createdAt: string;
}>;

export type TaskRescuePlan = Readonly<{
  taskId: string;
  minimumDeliverable: string;
  nextRequiredStep: string;
  optionalScopeToDrop?: string;
  focusMinutes: 5 | 15 | 25;
  createdAt: string;
  resolvedAt?: string;
}>;

export type TaskSupportFields = Readonly<{
  supportSchemaVersion?: typeof TASK_SUPPORT_SCHEMA_VERSION;
  nextStartAt?: string | null;
  stuckRepair?: StuckRepairRecord | null;
  rescuePlan?: TaskRescuePlan | null;
  postponePromptAcknowledgedKey?: string | null;
  abandonReason?: 'no_longer_needed' | null;
}>;

export type TaskWithSupport = Task & TaskSupportFields;

const STUCK_REASONS = new Set<StuckReason>([
  'TOO_LARGE',
  'DONT_KNOW_HOW',
  'FEAR_OF_POOR_RESULT',
  'LOW_ENERGY',
  'OTHER',
]);
const REPAIR_ACTIONS = new Set<RepairAction>([
  'SET_SMALLER_FIRST_STEP',
  'CLARIFY_OUTPUT',
  'ROUGH_DRAFT',
  'START_TWO_MINUTES',
  'START_FIVE_MINUTES',
  'RESCHEDULE',
  'SET_MINIMUM_GOAL',
  'ABANDON',
]);
const SUPPORT_KEYS = [
  'supportSchemaVersion',
  'nextStartAt',
  'stuckRepair',
  'rescuePlan',
  'postponePromptAcknowledgedKey',
  'abandonReason',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function nonBlank(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : null;
}

function timestamp(value: unknown): string | null {
  const text = nonBlank(value);
  return text !== null && Number.isFinite(Date.parse(text))
    ? new Date(text).toISOString()
    : null;
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : nonBlank(value);
}

export function normalizeStuckRepairRecord(
  value: unknown,
): StuckRepairRecord | null {
  if (!isRecord(value)) return null;
  const operationKey = nonBlank(value.operationKey);
  const createdAt = timestamp(value.createdAt);
  const reason = value.reason as StuckReason;
  const action = value.action as RepairAction;
  const firstStep = nullableText(value.firstStep);
  const note = nullableText(value.note);
  const focusMinutes =
    value.focusMinutes === 2 || value.focusMinutes === 5
      ? value.focusMinutes
      : value.focusMinutes === null
        ? null
        : undefined;
  if (
    operationKey === null ||
    createdAt === null ||
    !STUCK_REASONS.has(reason) ||
    !REPAIR_ACTIONS.has(action) ||
    focusMinutes === undefined
  ) {
    return null;
  }
  return {
    operationKey,
    reason,
    action,
    note,
    firstStep,
    focusMinutes,
    createdAt,
  };
}

export function createStuckRepairRecord(input: Readonly<{
  taskId: string;
  reason: StuckReason;
  action: RepairAction;
  note?: string | null;
  firstStep?: string | null;
  focusMinutes?: 2 | 5 | null;
  now: string;
}>): StuckRepairRecord {
  const record = normalizeStuckRepairRecord({
    operationKey: `${input.taskId}:${input.reason}:${input.action}:${input.now}`,
    reason: input.reason,
    action: input.action,
    note: input.note ?? null,
    firstStep: input.firstStep ?? null,
    focusMinutes: input.focusMinutes ?? null,
    createdAt: input.now,
  });
  if (record === null) throw new Error('INVALID_STUCK_REPAIR');
  return record;
}

export function normalizeTaskRescuePlan(
  value: unknown,
  expectedTaskId?: string,
): TaskRescuePlan | null {
  if (!isRecord(value)) return null;
  const taskId = nonBlank(value.taskId);
  const minimumDeliverable = nonBlank(value.minimumDeliverable);
  const nextRequiredStep = nonBlank(value.nextRequiredStep);
  const optionalScopeToDrop = nullableText(value.optionalScopeToDrop);
  const createdAt = timestamp(value.createdAt);
  const resolvedAt = value.resolvedAt === undefined
    ? undefined
    : timestamp(value.resolvedAt);
  if (
    taskId === null ||
    (expectedTaskId !== undefined && taskId !== expectedTaskId) ||
    minimumDeliverable === null ||
    nextRequiredStep === null ||
    createdAt === null ||
    (value.focusMinutes !== 5 && value.focusMinutes !== 15 && value.focusMinutes !== 25) ||
    (value.resolvedAt !== undefined && resolvedAt === null)
  ) {
    return null;
  }
  return {
    taskId,
    minimumDeliverable,
    nextRequiredStep,
    ...(optionalScopeToDrop === null ? {} : {optionalScopeToDrop}),
    focusMinutes: value.focusMinutes,
    createdAt,
    ...(typeof resolvedAt === 'string' ? {resolvedAt} : {}),
  };
}

export function createTaskRescuePlan(input: Readonly<{
  taskId: string;
  minimumDeliverable: string;
  nextRequiredStep: string;
  optionalScopeToDrop?: string;
  focusMinutes: 5 | 15 | 25;
  now: string;
}>): TaskRescuePlan {
  const plan = normalizeTaskRescuePlan({
    ...input,
    createdAt: input.now,
  }, input.taskId);
  if (plan === null) throw new Error('INVALID_RESCUE_PLAN');
  return plan;
}

export function taskProgress(task: Task): TaskProgress {
  const progress = (task as Task & {progress?: TaskProgress}).progress;
  return progress ?? (task.status === 'in_progress' ? 25 : 0);
}

export function isTaskEligibleForRescue(task: Task, nowInput: string): boolean {
  if (
    task.deletedAt !== null ||
    (task.status !== 'pending' && task.status !== 'in_progress') ||
    task.dueAt === null ||
    taskProgress(task) >= 50
  ) {
    return false;
  }
  const remaining = Date.parse(task.dueAt) - Date.parse(nowInput);
  return Number.isFinite(remaining) && remaining >= 0 && remaining <= 86_400_000;
}

export function nextStartAtForTask(task: Task): string | null {
  const value = (task as TaskWithSupport).nextStartAt;
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
}

export function postponePromptKey(task: Task, nowInput: string): string {
  const postponed = (task as Task & {postponedCount?: number}).postponedCount ?? 0;
  return `${nowInput.slice(0, 10)}:${postponed}`;
}

export function shouldShowPostponeRepair(task: Task, nowInput: string): boolean {
  const support = task as TaskWithSupport & {postponedCount?: number};
  return (
    typeof support.postponedCount === 'number' &&
    support.postponedCount >= 2 &&
    support.postponePromptAcknowledgedKey !== postponePromptKey(task, nowInput)
  );
}

export function startReminderPresentation(task: Task): Readonly<{
  title: string;
  body: string;
  actions: readonly ['start_five', 'delay_ten', 'reschedule'];
}> {
  const step = task.firstStep == null || task.firstStep.trim() === ''
    ? task.title
    : task.firstStep;
  return {
    title: '可以开始下一小步了',
    body: step,
    actions: ['start_five', 'delay_ten', 'reschedule'],
  };
}

export function hasTaskSupportFields(value: object): boolean {
  return SUPPORT_KEYS.some(key => hasOwn(value, key));
}

export function normalizeTaskSupportRecord<T>(value: T): T {
  if (!isRecord(value) || !hasTaskSupportFields(value)) return value;
  const next: Record<string, unknown> = {...value};
  next.supportSchemaVersion = TASK_SUPPORT_SCHEMA_VERSION;
  if (hasOwn(value, 'nextStartAt')) {
    next.nextStartAt = value.nextStartAt === null ? null : timestamp(value.nextStartAt);
  }
  if (hasOwn(value, 'stuckRepair')) {
    next.stuckRepair = value.stuckRepair === null
      ? null
      : normalizeStuckRepairRecord(value.stuckRepair);
  }
  if (hasOwn(value, 'rescuePlan')) {
    next.rescuePlan = value.rescuePlan === null
      ? null
      : normalizeTaskRescuePlan(value.rescuePlan, nonBlank(value.id) ?? undefined);
  }
  if (hasOwn(value, 'postponePromptAcknowledgedKey')) {
    next.postponePromptAcknowledgedKey = nullableText(
      value.postponePromptAcknowledgedKey,
    );
  }
  if (hasOwn(value, 'abandonReason')) {
    next.abandonReason = value.abandonReason === 'no_longer_needed'
      ? 'no_longer_needed'
      : null;
  }
  return next as T;
}

export function normalizeTaskSupportSnapshot<T>(value: T): T {
  return Array.isArray(value)
    ? value.map(normalizeTaskSupportRecord) as T
    : value;
}

export function isValidTaskSupportFields(value: Record<string, unknown>): boolean {
  if (!hasTaskSupportFields(value)) return true;
  if (value.supportSchemaVersion !== TASK_SUPPORT_SCHEMA_VERSION) return false;
  if (
    hasOwn(value, 'nextStartAt') &&
    value.nextStartAt !== null &&
    timestamp(value.nextStartAt) === null
  ) return false;
  if (
    hasOwn(value, 'stuckRepair') &&
    value.stuckRepair !== null &&
    normalizeStuckRepairRecord(value.stuckRepair) === null
  ) return false;
  if (
    hasOwn(value, 'rescuePlan') &&
    value.rescuePlan !== null &&
    normalizeTaskRescuePlan(value.rescuePlan, nonBlank(value.id) ?? undefined) === null
  ) return false;
  if (
    hasOwn(value, 'postponePromptAcknowledgedKey') &&
    value.postponePromptAcknowledgedKey !== null &&
    nonBlank(value.postponePromptAcknowledgedKey) === null
  ) return false;
  return !hasOwn(value, 'abandonReason') ||
    value.abandonReason === null ||
    value.abandonReason === 'no_longer_needed';
}

export function focusDurationForRepair(
  action: RepairAction,
): Extract<FocusDurationMinutes, 2 | 5> | null {
  return action === 'START_TWO_MINUTES'
    ? 2
    : action === 'RESCHEDULE' || action === 'ABANDON'
      ? null
      : 5;
}
