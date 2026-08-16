import type {Task} from './task';
import type {FocusSession} from './focusSession';
import {growthRewardsForTask} from './growth';
import {effectiveQuadrantForTask, type TaskWithPriority} from './taskPriority';

export const INSIGHT_COOLDOWN_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;

export type GrowthInsight = Readonly<{
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  action:
    | Readonly<{kind: 'reschedule_task'; taskId: string}>
    | Readonly<{kind: 'edit_first_step'; taskId: string}>
    | Readonly<{
        kind: 'create_focus_schedule';
        taskId: string;
        suggestedLocalTime: string;
      }>;
}>;

export type InsightDismissal = Readonly<{
  id: string;
  dismissedAt: string;
}>;

function dismissalActive(
  insightId: string,
  dismissals: readonly InsightDismissal[],
  nowInput: string,
): boolean {
  return dismissals.some(dismissal => {
    if (dismissal.id !== insightId) return false;
    const remaining = Date.parse(nowInput) - Date.parse(dismissal.dismissedAt);
    return Number.isFinite(remaining) && remaining >= 0 && remaining < INSIGHT_COOLDOWN_MILLISECONDS;
  });
}

function isActiveTask(task: Task): boolean {
  return task.deletedAt === null && (task.status === 'pending' || task.status === 'in_progress');
}

function lateGrowthStartInsight(
  tasks: readonly Task[],
  nowInput: string,
): GrowthInsight | null {
  const since = Date.parse(nowInput) - INSIGHT_COOLDOWN_MILLISECONDS;
  const lateStarts = tasks.flatMap(task =>
    growthRewardsForTask(task)
      .filter(reward =>
        reward.kind === 'task_first_start' &&
        Date.parse(reward.awardedAt) >= since &&
        new Date(reward.awardedAt).getHours() >= 22 &&
        effectiveQuadrantForTask(task, reward.awardedAt) === 'Q2',
      )
      .map(reward => ({task, reward})),
  );
  if (lateStarts.length < 4) return null;
  const target = lateStarts
    .map(item => item.task)
    .find(isActiveTask);
  if (target === undefined) return null;
  return {
    id: `late-growth-start:${nowInput.slice(0, 10)}`,
    title: '把成长区任务提早一点开始',
    description: '本周已有 4 项成长区任务在 22:00 后才第一次开始，可以先安排下一次开始时间。',
    actionLabel: '安排开始时间',
    action: {kind: 'reschedule_task', taskId: target.id},
  };
}

function localHour(timestamp: string, timeZone: string): number {
  try {
    const hour = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(timestamp))
      .find(part => part.type === 'hour')?.value;
    return hour === undefined ? -1 : Number(hour);
  } catch {
    return new Date(timestamp).getUTCHours();
  }
}

function exactLateStartInsight(input: Readonly<{
  tasks: readonly Task[];
  sessions: readonly FocusSession[];
  now: string;
  timeZone: string;
}>): GrowthInsight | null {
  const since = Date.parse(input.now) - INSIGHT_COOLDOWN_MILLISECONDS;
  const taskById = new Map(input.tasks.map(task => [task.id, task]));
  const lateByTask = new Map<string, number>();
  for (const session of input.sessions) {
    if (
      (session.actualSeconds ?? 0) < 120 ||
      session.snapshot?.quadrantAtStart !== 'Q2' ||
      Date.parse(session.startedAt) < since ||
      Date.parse(session.startedAt) > Date.parse(input.now) ||
      localHour(session.startedAt, input.timeZone) < 22
    ) continue;
    lateByTask.set(session.taskId, (lateByTask.get(session.taskId) ?? 0) + 1);
  }
  const match = [...lateByTask.entries()]
    .filter(([, count]) => count >= 4)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([taskId, count]) => ({task: taskById.get(taskId), count}))
    .find(item => item.task !== undefined && isActiveTask(item.task));
  if (match?.task === undefined) return null;
  return {
    id: `late-growth-start:${match.task.id}:${match.count}`,
    title: '把这项重要任务提早一点开始',
    description: `你最近 ${match.count} 次都在 22:00 后开始“${match.task.title}”。要不要在 20:30 留 25 分钟？`,
    actionLabel: '安排专注时段',
    action: {
      kind: 'create_focus_schedule',
      taskId: match.task.id,
      suggestedLocalTime: '20:30',
    },
  };
}

function lowGrowthInvestmentInsight(input: Readonly<{
  tasks: readonly Task[];
  sessions: readonly FocusSession[];
  now: string;
}>): GrowthInsight | null {
  const since = Date.parse(input.now) - INSIGHT_COOLDOWN_MILLISECONDS;
  const qualifying = input.sessions.filter(session =>
    (session.actualSeconds ?? 0) >= 120 &&
    session.snapshot !== null &&
    session.snapshot !== undefined &&
    Date.parse(session.startedAt) >= since &&
    Date.parse(session.startedAt) <= Date.parse(input.now),
  );
  if (qualifying.length < 4) return null;
  const growth = qualifying.filter(session => session.snapshot?.quadrantAtStart === 'Q2');
  if (growth.length / qualifying.length >= 0.25) return null;
  const target = input.tasks
    .filter(isActiveTask)
    .find(task => effectiveQuadrantForTask(task, input.now) === 'Q2');
  if (target === undefined) return null;
  return {
    id: `low-growth-investment:${target.id}`,
    title: '给成长区留一个开始位置',
    description: '最近的有效专注较少投入成长区，可以先为一项重要但不紧急的任务留 25 分钟。',
    actionLabel: '安排专注时段',
    action: {kind: 'create_focus_schedule', taskId: target.id, suggestedLocalTime: '20:30'},
  };
}

function repeatedPostponeInsight(tasks: readonly Task[]): GrowthInsight | null {
  const target = tasks
    .filter(isActiveTask)
    .filter(task => ((task as TaskWithPriority).postponedCount ?? 0) >= 2)
    .filter(task =>
      task.firstStep == null ||
      task.firstStep.trim() === '' ||
      task.firstStep.trim().length > 40 ||
      (task.estimatedMinutes ?? 0) > 25,
    )
    .sort((left, right) =>
      ((right as TaskWithPriority).postponedCount ?? 0) -
      ((left as TaskWithPriority).postponedCount ?? 0) ||
      left.createdAt.localeCompare(right.createdAt),
    )[0];
  if (target === undefined) return null;
  return {
    id: `postponed-first-step:${target.id}:${(target as TaskWithPriority).postponedCount ?? 0}`,
    title: '把第一小步缩到 5 分钟',
    description: '这项任务已多次重新安排，填写一个能在 5 分钟内完成的第一步会更容易继续。',
    actionLabel: '填写第一小步',
    action: {kind: 'edit_first_step', taskId: target.id},
  };
}

export function selectGrowthInsight(input: Readonly<{
  tasks: readonly Task[];
  sessions?: readonly FocusSession[];
  now: string;
  dismissal: InsightDismissal | null;
  dismissals?: readonly InsightDismissal[];
  timeZone?: string;
}>): GrowthInsight | null {
  const exactLate = input.sessions === undefined
    ? lateGrowthStartInsight(input.tasks, input.now)
    : exactLateStartInsight({
        tasks: input.tasks,
        sessions: input.sessions,
        now: input.now,
        timeZone: input.timeZone ?? 'UTC',
      });
  const candidates = [
    exactLate,
    repeatedPostponeInsight(input.tasks),
    ...(input.sessions === undefined
      ? []
      : [lowGrowthInvestmentInsight({
          tasks: input.tasks,
          sessions: input.sessions,
          now: input.now,
        })]),
  ].filter((insight): insight is GrowthInsight => insight !== null);
  const dismissals = [
    ...(input.dismissals ?? []),
    ...(input.dismissal === null ? [] : [input.dismissal]),
  ];
  return candidates.find(
    insight => !dismissalActive(insight.id, dismissals, input.now),
  ) ?? null;
}
