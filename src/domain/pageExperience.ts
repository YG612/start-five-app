import type {FocusSession} from './focusSession';
import type {PlannedWorkSession, Task} from './task';
import type {FocusScheduleOccurrence} from './focusSchedule';
import {nextStartAtForTask} from './taskSupport';
import {
  selectSemanticGrowthSummary,
  type MetricQuality,
  type ProactiveStartStreak,
} from './semanticGrowth';

export type LegacyFocusAgendaItem = Readonly<{
  task: Task;
  session: PlannedWorkSession;
}>;

export type FocusAgendaItem = Readonly<{
  id: string;
  source: 'ACTIVE_FOCUS' | 'TASK_PLAN' | 'NEXT_START' | 'FOCUS_SCHEDULE';
  plannedStartAt?: string;
  durationMinutes: number;
  taskId?: string;
  scheduleId?: string;
  localDateKey?: string;
  protectionLevel?: 'REMINDER_ONLY' | 'REDUCE_DISTRACTIONS';
  status: 'ACTIVE' | 'UPCOMING' | 'MISSED' | 'SKIPPED' | 'DONE';
  title: string;
  firstStep?: string;
}>;

export type FocusAgendaInput = Readonly<{
  tasks: readonly Task[];
  sessions: readonly FocusSession[];
  scheduleOccurrences: readonly FocusScheduleOccurrence[];
  now: string;
}>;

export type GrowthMetric = Readonly<{
  label: string;
  value: string;
  quality: MetricQuality;
}>;

export type GrowthPageSummary = Readonly<{
  today: readonly GrowthMetric[];
  week: readonly GrowthMetric[];
  hasWeeklySample: boolean;
  quality: MetricQuality;
  streak: ProactiveStartStreak;
}>;

function selectLegacyFocusAgenda(tasks: readonly Task[]): readonly LegacyFocusAgendaItem[] {
  const agenda: LegacyFocusAgendaItem[] = [];
  for (const task of tasks) {
    for (const session of task.plannedWorkSessions ?? []) {
      if (session.status === 'PLANNED') agenda.push({task, session});
    }
  }
  return agenda.sort(
    (left, right) => Date.parse(left.session.plannedStartAt) - Date.parse(right.session.plannedStartAt),
  );
}

const SOURCE_PRIORITY: Readonly<Record<FocusAgendaItem['source'], number>> = {
  ACTIVE_FOCUS: 4,
  TASK_PLAN: 3,
  NEXT_START: 2,
  FOCUS_SCHEDULE: 1,
};

function statusForScheduleOccurrence(
  occurrence: FocusScheduleOccurrence,
  now: string,
): FocusAgendaItem['status'] {
  if (occurrence.event?.type === 'STARTED') return 'DONE';
  if (occurrence.event?.type === 'COMPLETED') return 'DONE';
  if (occurrence.event?.type === 'SKIPPED') return 'SKIPPED';
  if (occurrence.event?.type === 'MISSED') return 'MISSED';
  const planned = occurrence.event?.type === 'RESCHEDULED'
    ? occurrence.event.rescheduledTo ?? occurrence.plannedStartAt
    : occurrence.plannedStartAt;
  return Date.parse(planned) < Date.parse(now) ? 'MISSED' : 'UPCOMING';
}

export function selectFocusAgendaWithMeta(input: FocusAgendaInput): Readonly<{
  items: readonly FocusAgendaItem[];
  mergedConflict: boolean;
}> {
  const taskById = new Map(input.tasks.map(task => [task.id, task]));
  const candidates: FocusAgendaItem[] = [];
  const active = input.sessions.find(session => session.status === 'running') ?? null;
  if (active !== null) {
    const task = taskById.get(active.taskId);
    candidates.push({
      id: `active:${active.id}`,
      source: 'ACTIVE_FOCUS',
      plannedStartAt: active.startedAt,
      durationMinutes: active.plannedMinutes,
      taskId: active.taskId,
      status: 'ACTIVE',
      title: task?.title ?? '当前专注',
      ...(task?.firstStep == null ? {} : {firstStep: task.firstStep}),
    });
  }
  for (const task of input.tasks) {
    for (const session of task.plannedWorkSessions ?? []) {
      if (session.status !== 'PLANNED') continue;
      candidates.push({
        id: `plan:${session.id}`,
        source: 'TASK_PLAN',
        plannedStartAt: session.plannedStartAt,
        durationMinutes: session.plannedMinutes,
        taskId: task.id,
        status: Date.parse(session.plannedStartAt) < Date.parse(input.now) ? 'MISSED' : 'UPCOMING',
        title: task.title,
        ...(task.firstStep == null ? {} : {firstStep: task.firstStep}),
      });
    }
    const nextStartAt = nextStartAtForTask(task);
    if (nextStartAt !== null) {
      candidates.push({
        id: `next:${task.id}:${nextStartAt}`,
        source: 'NEXT_START',
        plannedStartAt: nextStartAt,
        durationMinutes: task.estimatedMinutes ?? 5,
        taskId: task.id,
        status: Date.parse(nextStartAt) < Date.parse(input.now) ? 'MISSED' : 'UPCOMING',
        title: task.title,
        ...(task.firstStep == null ? {} : {firstStep: task.firstStep}),
      });
    }
  }
  for (const occurrence of input.scheduleOccurrences) {
    const target = occurrence.schedule.target;
    const taskId = target.kind === 'TASK' ? target.taskId : undefined;
    const task = taskId === undefined ? undefined : taskById.get(taskId);
    const plannedStartAt = occurrence.event?.type === 'RESCHEDULED'
      ? occurrence.event.rescheduledTo ?? occurrence.plannedStartAt
      : occurrence.plannedStartAt;
    candidates.push({
      id: `schedule:${occurrence.schedule.id}:${occurrence.localDateKey}`,
      source: 'FOCUS_SCHEDULE',
      plannedStartAt,
      durationMinutes: occurrence.schedule.durationMinutes,
      ...(taskId === undefined ? {} : {taskId}),
      scheduleId: occurrence.schedule.id,
      localDateKey: occurrence.localDateKey,
      protectionLevel: occurrence.schedule.protectionLevel,
      status: statusForScheduleOccurrence(occurrence, input.now),
      title: task?.title ?? (
        target.kind === 'QUADRANT'
          ? `${target.quadrant === 'Q2' ? '成长区' : '指定象限'}的一项任务`
          : target.kind === 'AUTO' ? '到时自动选择' : '这项任务已经完成。'
      ),
      ...(task?.firstStep == null ? {} : {firstStep: task.firstStep}),
    });
  }
  candidates.sort((left, right) => {
    if (left.source === 'ACTIVE_FOCUS' && right.source !== 'ACTIVE_FOCUS') return -1;
    if (right.source === 'ACTIVE_FOCUS' && left.source !== 'ACTIVE_FOCUS') return 1;
    return Date.parse(left.plannedStartAt ?? input.now) - Date.parse(right.plannedStartAt ?? input.now) ||
      SOURCE_PRIORITY[right.source] - SOURCE_PRIORITY[left.source];
  });
  const result: FocusAgendaItem[] = [];
  let mergedConflict = false;
  for (const item of candidates) {
    const conflictIndex = item.taskId === undefined ? -1 : result.findIndex(existing =>
      existing.taskId === item.taskId &&
      existing.plannedStartAt !== undefined &&
      item.plannedStartAt !== undefined &&
      Math.abs(Date.parse(existing.plannedStartAt) - Date.parse(item.plannedStartAt)) <= 5 * 60_000,
    );
    if (conflictIndex < 0) {
      result.push(item);
      continue;
    }
    mergedConflict = true;
    const previous = result[conflictIndex]!;
    if (SOURCE_PRIORITY[item.source] > SOURCE_PRIORITY[previous.source]) {
      result[conflictIndex] = item;
    }
  }
  return {items: result, mergedConflict};
}

export function selectFocusAgenda(tasks: readonly Task[]): readonly LegacyFocusAgendaItem[];
export function selectFocusAgenda(input: FocusAgendaInput): readonly FocusAgendaItem[];
export function selectFocusAgenda(
  input: readonly Task[] | FocusAgendaInput,
): readonly LegacyFocusAgendaItem[] | readonly FocusAgendaItem[] {
  return Array.isArray(input)
    ? selectLegacyFocusAgenda(input)
    : selectFocusAgendaWithMeta(input as FocusAgendaInput).items;
}

export function selectTodayFocusAgenda(
  tasks: readonly Task[],
  nowInput: string,
  limit = 3,
): readonly LegacyFocusAgendaItem[] {
  const day = nowInput.slice(0, 10);
  return selectLegacyFocusAgenda(tasks)
    .filter(item => item.session.plannedStartAt.slice(0, 10) === day)
    .slice(0, Math.max(0, limit));
}

export type GrowthPageSummaryInput = Readonly<{
  tasks: readonly Task[];
  sessions: readonly FocusSession[];
  now: string;
  timeZone?: string;
  weekStartsOn?: number;
}>;

export function selectGrowthPageSummary(input: GrowthPageSummaryInput): GrowthPageSummary {
  const summary = selectSemanticGrowthSummary(input);
  const display = (metric: (typeof summary.today)[number]): GrowthMetric => ({
    label: metric.label,
    value: `${metric.value} ${metric.unit}`,
    quality: metric.quality,
  });
  return {
    today: summary.today.map(display),
    week: summary.week.map(display),
    hasWeeklySample: summary.hasWeeklySample,
    quality: summary.quality,
    streak: summary.streak,
  };
}

function growthLocalDateKey(now: string, timeZone: string): string {
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) return now.slice(0, 10);
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const part = (type: 'year' | 'month' | 'day') =>
      parts.find(item => item.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch {
    return now.slice(0, 10);
  }
}

export function createGrowthPageSummarySelector(): (
  input: GrowthPageSummaryInput,
) => GrowthPageSummary {
  let previous: Readonly<{
    tasks: readonly Task[];
    sessions: readonly FocusSession[];
    localDateKey: string;
    timeZone: string;
    weekStartsOn: number;
    result: GrowthPageSummary;
  }> | null = null;
  return input => {
    const timeZone = input.timeZone ?? 'UTC';
    const weekStartsOn = input.weekStartsOn ?? 1;
    const localDateKey = growthLocalDateKey(input.now, timeZone);
    if (
      previous !== null &&
      previous.tasks === input.tasks &&
      previous.sessions === input.sessions &&
      previous.localDateKey === localDateKey &&
      previous.timeZone === timeZone &&
      previous.weekStartsOn === weekStartsOn
    ) return previous.result;
    const result = selectGrowthPageSummary(input);
    previous = {tasks: input.tasks, sessions: input.sessions, localDateKey, timeZone, weekStartsOn, result};
    return result;
  };
}

export function formatPageDate(nowInput: string): string {
  const date = new Date(nowInput);
  if (!Number.isFinite(date.getTime())) return nowInput.slice(0, 10);
  const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]!;
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日 · ${weekday}`;
}

export function formatAgendaTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '--:--';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
