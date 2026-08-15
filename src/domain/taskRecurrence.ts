import type {Task} from './task';
import {
  deriveLegacyPriorityFields,
  normalizeRepeatRule,
  priorityCoordinatesForTask,
  TASK_PRIORITY_SCHEMA_VERSION,
  type RepeatRule,
  type TaskWithPriority,
} from './taskPriority';

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function nextRepeatDueAt(
  baseInput: string,
  rule: RepeatRule,
): string {
  const base = new Date(baseInput);
  if (!Number.isFinite(base.getTime())) throw new Error('INVALID_REPEAT_BASE');
  if (rule.frequency === 'daily') {
    base.setDate(base.getDate() + 1);
    return base.toISOString();
  }
  if (rule.frequency === 'weekly') {
    const weekdays = [...rule.weekdays].sort((left, right) => left - right);
    for (let offset = 1; offset <= 7; offset += 1) {
      const candidate = new Date(base);
      candidate.setDate(base.getDate() + offset);
      if (weekdays.includes(candidate.getDay())) return candidate.toISOString();
    }
    throw new Error('INVALID_REPEAT_RULE');
  }
  const nextMonth = base.getMonth() + 1;
  const year = base.getFullYear() + Math.floor(nextMonth / 12);
  const month = nextMonth % 12;
  const day = Math.min(rule.dayOfMonth, daysInMonth(year, month));
  return new Date(
    year,
    month,
    day,
    base.getHours(),
    base.getMinutes(),
    base.getSeconds(),
    base.getMilliseconds(),
  ).toISOString();
}

export function repeatBusinessKey(seriesId: string, dueAt: string): string {
  return `${seriesId}:${dueAt}`;
}

export function buildNextRepeatedTask(
  source: Task,
  completedAt: string,
  id: string,
): Task | null {
  const extended = source as TaskWithPriority;
  const rule = normalizeRepeatRule(extended.repeatRule);
  if (rule === null) return null;
  const nextDueAt = nextRepeatDueAt(source.dueAt ?? completedAt, rule);
  const seriesId = extended.repeatSeriesId ?? source.id;
  const occurrenceKey = repeatBusinessKey(seriesId, nextDueAt);
  const coordinates = priorityCoordinatesForTask(source);
  const legacy = deriveLegacyPriorityFields(coordinates, nextDueAt, completedAt);
  const stepTemplate = [...(source.steps ?? [])]
    .filter(step => step.status !== 'SKIPPED')
    .sort((left, right) => left.order - right.order)
    .map((step, index) => ({
      id: `${id}:step:${index + 1}`,
      title: step.title,
      order: index,
      ...(step.estimatedMinutes === undefined
        ? {}
        : {estimatedMinutes: step.estimatedMinutes}),
      status: index === 0 ? ('ACTIVE' as const) : ('PENDING' as const),
      createdAt: completedAt,
    }));
  const next: TaskWithPriority = {
    id,
    title: source.title,
    description: source.description,
    important: legacy.important,
    urgent: legacy.urgent,
    status: 'pending',
    startAt: null,
    scheduledStartAt: null,
    dueAt: nextDueAt,
    estimatedMinutes: source.estimatedMinutes ?? null,
    firstStep: stepTemplate[0]?.title ?? source.firstStep ?? null,
    ...(source.completionDefinition == null
      ? {}
      : {completionDefinition: source.completionDefinition}),
    ...(stepTemplate.length === 0
      ? {}
      : {
          progressSource: source.progressSource ?? ('STEPS' as const),
          steps: stepTemplate,
          plannedWorkSessions: [],
          deliveryRiskDismissedAt: null,
          deliveryRiskDismissedBand: null,
        }),
    createdAt: completedAt,
    updatedAt: completedAt,
    startedAt: null,
    completedAt: null,
    deletedAt: null,
    score: null,
    scoreAwardedAt: null,
    subtasks: [],
    prioritySchemaVersion: TASK_PRIORITY_SCHEMA_VERSION,
    importanceScore: coordinates.importanceScore,
    manualUrgencyScore: coordinates.manualUrgencyScore,
    urgencyMode: coordinates.urgencyMode,
    repeatRule: rule,
    repeatSeriesId: seriesId,
    repeatOccurrenceKey: occurrenceKey,
  };
  return next;
}

export type CopyTaskInput = Readonly<{
  title: string;
  description: string;
  important: boolean;
  urgent: boolean;
  scheduledStartAt: null;
  dueAt: null;
  estimatedMinutes: number | null;
  firstStep: string | null;
  prioritySchemaVersion: typeof TASK_PRIORITY_SCHEMA_VERSION;
  importanceScore: number;
  manualUrgencyScore: number;
  urgencyMode: 'manual' | 'hybrid';
  repeatRule: null;
}>;

export function copyTaskInput(source: Task): CopyTaskInput {
  const coordinates = priorityCoordinatesForTask(source);
  return {
    title: source.title,
    description: source.description,
    important: source.important,
    urgent: source.urgent,
    scheduledStartAt: null,
    dueAt: null,
    estimatedMinutes: source.estimatedMinutes ?? null,
    firstStep: source.firstStep ?? null,
    prioritySchemaVersion: TASK_PRIORITY_SCHEMA_VERSION,
    importanceScore: coordinates.importanceScore,
    manualUrgencyScore: coordinates.manualUrgencyScore,
    urgencyMode: coordinates.urgencyMode,
    repeatRule: null,
  };
}
