import {type Quadrant} from './quadrant';
import {DomainError, type Task} from './task';
import {effectiveQuadrantForTask} from './taskPriority';
import {isTaskInQuadrants} from './taskOrganization';

export const BASE_SCORE_BY_QUADRANT: Record<Quadrant, number> = {
  Q1: 35,
  Q2: 45,
  Q3: 15,
  Q4: 5,
};

export type CompletionScoreAward = {
  task: Task;
  points: number;
};

function canonicalTimestamp(value: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DomainError('INVALID_TIMESTAMP');
  }

  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new DomainError('INVALID_TIMESTAMP');
  }
  return new Date(milliseconds).toISOString();
}

export function awardCompletionScore(
  task: Task,
  completedAtInput: string,
): CompletionScoreAward {
  const completedAt = canonicalTimestamp(completedAtInput);

  if (task.status !== 'completed') {
    throw new DomainError('TASK_NOT_COMPLETED');
  }
  if (!isTaskInQuadrants(task)) {
    throw new DomainError('TASK_REQUIRES_PLACEMENT');
  }
  if (task.score !== null || task.scoreAwardedAt !== null) {
    return {task, points: 0};
  }

  const points = BASE_SCORE_BY_QUADRANT[
    effectiveQuadrantForTask(task, completedAt)
  ];
  return {
    task: {
      ...task,
      score: points,
      scoreAwardedAt: completedAt,
      updatedAt: completedAt,
    },
    points,
  };
}
