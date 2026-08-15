import type {Task} from './task';
import {isTaskInQuadrants} from './taskOrganization';

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function compareTasks(left: Task, right: Task): number {
  const leftStartedRank = left.status === 'in_progress' ? 0 : 1;
  const rightStartedRank = right.status === 'in_progress' ? 0 : 1;
  if (leftStartedRank !== rightStartedRank) {
    return leftStartedRank - rightStartedRank;
  }

  if (left.important !== right.important) {
    return left.important ? -1 : 1;
  }
  if (left.urgent !== right.urgent) {
    return left.urgent ? -1 : 1;
  }

  if (left.dueAt === null && right.dueAt !== null) {
    return 1;
  }
  if (left.dueAt !== null && right.dueAt === null) {
    return -1;
  }
  if (left.dueAt !== null && right.dueAt !== null) {
    const dueComparison = compareStrings(left.dueAt, right.dueAt);
    if (dueComparison !== 0) {
      return dueComparison;
    }
  }

  const creationComparison = compareStrings(left.createdAt, right.createdAt);
  if (creationComparison !== 0) {
    return creationComparison;
  }
  return compareStrings(left.id, right.id);
}

export function recommendNextTask(tasks: readonly Task[]): Task | null {
  let recommendation: Task | null = null;

  for (const task of tasks) {
    const eligible =
      task.deletedAt === null &&
      isTaskInQuadrants(task) &&
      (task.status === 'pending' || task.status === 'in_progress');
    if (!eligible) {
      continue;
    }

    if (recommendation === null || compareTasks(task, recommendation) < 0) {
      recommendation = task;
    }
  }

  return recommendation;
}
