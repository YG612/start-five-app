import type {Quadrant} from './quadrant';
import type {Task} from './task';
import {
  deriveDeadlineUrgencyScore,
  effectiveQuadrantForTask,
} from './taskPriority';

export type ActionPointerCandidate = Readonly<{
  task: Task;
  score: number;
  reasons: readonly string[];
}>;

export type ActionPointerContext = Readonly<{
  activeFocusTaskId?: string | null;
  recentContinuationTaskId?: string | null;
}>;

const QUADRANT_WEIGHT: Readonly<Record<Quadrant, number>> = {
  Q1: 110,
  Q2: 120,
  Q3: 40,
  Q4: 10,
};

function postponeCount(task: Task): number {
  const value = (task as Task & {postponedCount?: number}).postponedCount;
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : 0;
}

function compareCandidates(
  left: ActionPointerCandidate,
  right: ActionPointerCandidate,
): number {
  if (left.score !== right.score) return right.score - left.score;
  const leftDue = left.task.dueAt ?? '\uffff';
  const rightDue = right.task.dueAt ?? '\uffff';
  if (leftDue !== rightDue) return leftDue < rightDue ? -1 : 1;
  if (left.task.createdAt !== right.task.createdAt) {
    return left.task.createdAt < right.task.createdAt ? -1 : 1;
  }
  return left.task.id < right.task.id ? -1 : left.task.id > right.task.id ? 1 : 0;
}

export function rankActionPointerTasks(
  tasks: readonly Task[],
  nowInput: string,
  context: ActionPointerContext = {},
): readonly ActionPointerCandidate[] {
  return tasks
    .filter(
      task =>
        task.deletedAt === null &&
        (task.status === 'pending' || task.status === 'in_progress'),
    )
    .map(task => {
      let score = QUADRANT_WEIGHT[effectiveQuadrantForTask(task, nowInput)];
      const facts: Array<Readonly<{points: number; text: string}>> = [];
      if (task.id === context.activeFocusTaskId) {
        score += 1_000;
        facts.push({points: 1_000, text: '专注正在进行'});
      } else if (task.id === context.recentContinuationTaskId) {
        score += 900;
        facts.push({points: 900, text: '刚刚推进过'});
      }

      const deadline = deriveDeadlineUrgencyScore(task.dueAt, nowInput);
      if (deadline === 100) {
        score += 80;
        facts.push({points: 80, text: '已经超过截止时间'});
      } else if (deadline !== null && deadline >= 85) {
        score += 65;
        facts.push({points: 65, text: '24 小时内截止'});
      } else if (deadline !== null && deadline >= 70) {
        score += 45;
        facts.push({points: 45, text: '3 天内截止'});
      } else if (deadline !== null && deadline >= 55) {
        score += 25;
        facts.push({points: 25, text: '7 天内截止'});
      }
      if (task.status === 'in_progress') {
        score += 30;
        facts.push({points: 30, text: '已经开始'});
      }
      if (task.firstStep != null && task.firstStep.trim() !== '') {
        score += 20;
        facts.push({points: 20, text: '第一步很明确'});
      }
      const postponed = postponeCount(task);
      if (postponed === 1) {
        score += 10;
        facts.push({points: 10, text: '曾推迟 1 次'});
      } else if (postponed >= 2) {
        score += 25;
        facts.push({points: 25, text: `已经推迟 ${postponed} 次`});
      }
      if (task.estimatedMinutes != null && task.estimatedMinutes <= 15) {
        score += 10;
        facts.push({points: 10, text: '预计 15 分钟内可推进'});
      }
      return {
        task,
        score,
        reasons: facts
          .sort((left, right) => right.points - left.points)
          .slice(0, 2)
          .map(fact => fact.text),
      };
    })
    .sort(compareCandidates);
}

export function selectActionPointer(
  tasks: readonly Task[],
  nowInput: string,
  sessionIndex: number,
  context: ActionPointerContext = {},
): ActionPointerCandidate | null {
  const top = rankActionPointerTasks(tasks, nowInput, context).slice(0, 3);
  if (top.length === 0) return null;
  return top[((sessionIndex % top.length) + top.length) % top.length] ?? null;
}
