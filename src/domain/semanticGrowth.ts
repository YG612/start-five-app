import type {FocusContextSnapshot, FocusSession} from './focusSession';
import type {Task} from './task';
import {effectiveQuadrantForTask} from './taskPriority';
import {normalizeStuckRepairRecord, type TaskWithSupport} from './taskSupport';

export type MetricQuality = 'EXACT' | 'ESTIMATED' | 'INSUFFICIENT';

export type SemanticGrowthMetric = Readonly<{
  id: 'focus_minutes' | 'proactive_starts' | 'growth_minutes' | 'repair_recoveries' | 'active_days';
  label: string;
  value: number;
  unit: '分钟' | '次' | '项' | '天';
  quality: MetricQuality;
}>;

export type ProactiveStartStreak = Readonly<{
  currentDays: number;
  previousBestDays: number;
  activeDaysThisWeek: number;
  activeToday: boolean;
}>;

export type SemanticGrowthSummary = Readonly<{
  today: readonly SemanticGrowthMetric[];
  week: readonly SemanticGrowthMetric[];
  hasWeeklySample: boolean;
  quality: MetricQuality;
  streak: ProactiveStartStreak;
}>;

type SessionFact = Readonly<{
  session: FocusSession;
  task: Task;
  actualSeconds: number;
  localDateKey: string;
  snapshot: FocusContextSnapshot;
  quality: Exclude<MetricQuality, 'INSUFFICIENT'>;
}>;

const DAY_MS = 24 * 60 * 60 * 1000;

function dateKeyAt(timestamp: string, timeZone: string): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const year = parts.find(part => part.type === 'year')?.value;
    const month = parts.find(part => part.type === 'month')?.value;
    const day = parts.find(part => part.type === 'day')?.value;
    return year === undefined || month === undefined || day === undefined
      ? ''
      : `${year}-${month}-${day}`;
  } catch {
    return timestamp.slice(0, 10);
  }
}

function shiftDateKey(key: string, days: number): string {
  const milliseconds = Date.parse(`${key}T00:00:00.000Z`);
  return Number.isFinite(milliseconds)
    ? new Date(milliseconds + days * DAY_MS).toISOString().slice(0, 10)
    : key;
}

function weekStartKey(todayKey: string, weekStartsOn: number): string {
  const date = new Date(`${todayKey}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return todayKey;
  const normalizedStart = Number.isInteger(weekStartsOn)
    ? Math.max(0, Math.min(6, weekStartsOn))
    : 1;
  const offset = (date.getUTCDay() - normalizedStart + 7) % 7;
  return shiftDateKey(todayKey, -offset);
}

function snapshotFor(
  session: FocusSession,
  task: Task,
): Readonly<{snapshot: FocusContextSnapshot; quality: 'EXACT' | 'ESTIMATED'}> {
  if (session.snapshot !== undefined && session.snapshot !== null) {
    return {snapshot: session.snapshot, quality: 'EXACT'};
  }
  return {
    snapshot: {
      taskId: task.id,
      quadrantAtStart: effectiveQuadrantForTask(task, session.startedAt),
      ...(task.dueAt === null ? {} : {dueAtAtStart: task.dueAt}),
    },
    quality: 'ESTIMATED',
  };
}

function sessionFacts(input: Readonly<{
  tasks: readonly Task[];
  sessions: readonly FocusSession[];
  timeZone: string;
  now: string;
}>): readonly SessionFact[] {
  const taskById = new Map(input.tasks.map(task => [task.id, task]));
  const nowMs = Date.parse(input.now);
  return input.sessions
    .filter(session =>
      (session.actualSeconds ?? 0) >= 120 &&
      Date.parse(session.startedAt) <= nowMs
    )
    .flatMap(session => {
      const task = taskById.get(session.taskId);
      if (task === undefined) return [];
      const context = snapshotFor(session, task);
      const localDateKey = dateKeyAt(session.startedAt, input.timeZone);
      if (localDateKey === '') return [];
      return [{
        session,
        task,
        actualSeconds: session.actualSeconds ?? 0,
        localDateKey,
        snapshot: context.snapshot,
        quality: context.quality,
      }];
    })
    .sort((left, right) =>
      Date.parse(left.session.startedAt) - Date.parse(right.session.startedAt) ||
      left.session.id.localeCompare(right.session.id),
    );
}

function factIsImportant(fact: SessionFact): boolean {
  return fact.snapshot.importanceScoreAtStart !== undefined
    ? fact.snapshot.importanceScoreAtStart >= 50
    : fact.snapshot.quadrantAtStart === 'Q1' || fact.snapshot.quadrantAtStart === 'Q2';
}

function factIsProactive(fact: SessionFact): boolean {
  if (fact.snapshot.quadrantAtStart === 'Q2') return true;
  if (fact.snapshot.dueAtAtStart === undefined) return false;
  return Date.parse(fact.snapshot.dueAtAtStart) - Date.parse(fact.session.startedAt) >= DAY_MS;
}

function qualityFor(facts: readonly SessionFact[]): MetricQuality {
  if (facts.length === 0) return 'INSUFFICIENT';
  return facts.every(fact => fact.quality === 'EXACT') ? 'EXACT' : 'ESTIMATED';
}

function minutes(facts: readonly SessionFact[]): number {
  return Math.floor(facts.reduce((total, fact) => total + fact.actualSeconds, 0) / 60);
}

function proactiveFacts(allFacts: readonly SessionFact[]): readonly SessionFact[] {
  const firstByTask = new Map<string, SessionFact>();
  for (const fact of allFacts) {
    if (!firstByTask.has(fact.task.id)) firstByTask.set(fact.task.id, fact);
  }
  return [...firstByTask.values()].filter(factIsProactive);
}

function repairRecoveryFacts(facts: readonly SessionFact[]): readonly SessionFact[] {
  const recovered = new Set<string>();
  return facts.filter(fact => {
    if (recovered.has(fact.task.id)) return false;
    const repair = normalizeStuckRepairRecord((fact.task as TaskWithSupport).stuckRepair);
    if (repair === null) return false;
    const delay = Date.parse(fact.session.startedAt) - Date.parse(repair.createdAt);
    if (delay < 0 || delay > DAY_MS) return false;
    recovered.add(fact.task.id);
    return true;
  });
}

function streakFor(activeDayKeys: ReadonlySet<string>, todayKey: string, weekStart: string): ProactiveStartStreak {
  let currentDays = 0;
  let cursor = todayKey;
  while (activeDayKeys.has(cursor)) {
    currentDays += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  const ordered = [...activeDayKeys].sort();
  let longest = 0;
  let run = 0;
  let previous = '';
  for (const key of ordered) {
    run = previous !== '' && shiftDateKey(previous, 1) === key ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = key;
  }
  return {
    currentDays,
    previousBestDays: longest,
    activeDaysThisWeek: ordered.filter(key => key >= weekStart && key <= todayKey).length,
    activeToday: activeDayKeys.has(todayKey),
  };
}

export function selectSemanticGrowthSummary(input: Readonly<{
  tasks: readonly Task[];
  sessions: readonly FocusSession[];
  now: string;
  timeZone?: string;
  weekStartsOn?: number;
}>): SemanticGrowthSummary {
  const timeZone = input.timeZone ?? 'UTC';
  const todayKey = dateKeyAt(input.now, timeZone);
  const weekStart = weekStartKey(todayKey, input.weekStartsOn ?? 1);
  const allFacts = sessionFacts({...input, timeZone});
  const todayFacts = allFacts.filter(fact => fact.localDateKey === todayKey);
  const weekFacts = allFacts.filter(fact =>
    fact.localDateKey >= weekStart && fact.localDateKey <= todayKey,
  );
  const allProactive = proactiveFacts(allFacts);
  const todayProactive = allProactive.filter(fact => fact.localDateKey === todayKey);
  const weekProactive = allProactive.filter(fact =>
    fact.localDateKey >= weekStart && fact.localDateKey <= todayKey,
  );
  const todayGrowth = todayFacts.filter(fact => fact.snapshot.quadrantAtStart === 'Q2');
  const weekGrowth = weekFacts.filter(fact => fact.snapshot.quadrantAtStart === 'Q2');
  const weekRecoveries = repairRecoveryFacts(weekFacts);
  const activeDayKeys = new Set(
    allFacts.filter(factIsImportant).map(fact => fact.localDateKey),
  );
  const quality = qualityFor(allFacts);
  const todayQuality = qualityFor(todayFacts);
  const weekQuality = qualityFor(weekFacts);
  const streak = streakFor(activeDayKeys, todayKey, weekStart);
  const week: SemanticGrowthMetric[] = [];
  if (weekProactive.length > 0) week.push({
    id: 'proactive_starts', label: '重要任务提前开始', value: weekProactive.length,
    unit: '项', quality: qualityFor(weekProactive),
  });
  if (weekGrowth.length > 0) week.push({
    id: 'growth_minutes', label: '成长区投入', value: minutes(weekGrowth),
    unit: '分钟', quality: qualityFor(weekGrowth),
  });
  if (weekRecoveries.length > 0) week.push({
    id: 'repair_recoveries', label: '卡住后重新开始', value: weekRecoveries.length,
    unit: '次', quality: qualityFor(weekRecoveries),
  });
  if (week.length < 3 && streak.activeDaysThisWeek > 0) week.push({
    id: 'active_days', label: '这周主动开始', value: streak.activeDaysThisWeek,
    unit: '天', quality: weekQuality,
  });

  return {
    today: [
      {id: 'focus_minutes', label: '今日投入', value: minutes(todayFacts), unit: '分钟', quality: todayQuality},
      {id: 'proactive_starts', label: '主动开始', value: todayProactive.length, unit: '次', quality: qualityFor(todayProactive)},
      {id: 'growth_minutes', label: '成长区投入', value: minutes(todayGrowth), unit: '分钟', quality: qualityFor(todayGrowth)},
    ],
    week: week.slice(0, 3),
    hasWeeklySample: weekFacts.length >= 3 && week.length > 0,
    quality,
    streak,
  };
}
