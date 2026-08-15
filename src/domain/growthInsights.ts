import type {Task} from './task';
import {growthRewardsForTask} from './growth';
import {effectiveQuadrantForTask, type TaskWithPriority} from './taskPriority';

export const INSIGHT_COOLDOWN_MILLISECONDS = 7 * 24 * 60 * 60 * 1000;

export type GrowthInsight = Readonly<{
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  action:
    | Readonly<{kind: 'reschedule_task'; taskId: string}>
    | Readonly<{kind: 'edit_first_step'; taskId: string}>;
}>;

export type InsightDismissal = Readonly<{
  id: string;
  dismissedAt: string;
}>;

function dismissalActive(
  insightId: string,
  dismissal: InsightDismissal | null,
  nowInput: string,
): boolean {
  if (dismissal === null || dismissal.id !== insightId) return false;
  const remaining = Date.parse(nowInput) - Date.parse(dismissal.dismissedAt);
  return Number.isFinite(remaining) && remaining >= 0 && remaining < INSIGHT_COOLDOWN_MILLISECONDS;
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
  now: string;
  dismissal: InsightDismissal | null;
}>): GrowthInsight | null {
  const candidates = [
    lateGrowthStartInsight(input.tasks, input.now),
    repeatedPostponeInsight(input.tasks),
  ].filter((insight): insight is GrowthInsight => insight !== null);
  return candidates.find(
    insight => !dismissalActive(insight.id, input.dismissal, input.now),
  ) ?? null;
}
