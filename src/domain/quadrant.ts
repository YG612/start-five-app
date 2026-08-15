import {DomainError, type Task} from './task';
import {effectiveQuadrantForTask} from './taskPriority';
import {isTaskInQuadrants} from './taskOrganization';

export type Quadrant = 'Q1' | 'Q2' | 'Q3' | 'Q4';

export const QUADRANT_POSITION = {
  Q1: {row: 0, column: 0, order: 0},
  Q2: {row: 0, column: 1, order: 1},
  Q3: {row: 1, column: 0, order: 2},
  Q4: {row: 1, column: 1, order: 3},
} as const;

export type TaskQuadrantBucket<Q extends Quadrant> = {
  quadrant: Q;
  position: (typeof QUADRANT_POSITION)[Q];
  totalCount: number;
  preview: Task[];
  allTasks: Task[];
};

export type TaskQuadrantProjection = readonly [
  TaskQuadrantBucket<'Q1'>,
  TaskQuadrantBucket<'Q2'>,
  TaskQuadrantBucket<'Q3'>,
  TaskQuadrantBucket<'Q4'>,
];

export function projectTaskQuadrants(
  tasks: readonly Task[],
): TaskQuadrantProjection {
  return projectTaskQuadrantsAt(tasks, new Date().toISOString());
}

export function projectTaskQuadrantsAt(
  tasks: readonly Task[],
  nowInput: string,
): TaskQuadrantProjection {
  const active = tasks.filter(
    task =>
      task.deletedAt === null &&
      isTaskInQuadrants(task) &&
      (task.status === 'pending' || task.status === 'in_progress'),
  );

  function cloneTask(task: Task): Task {
    return {
      ...task,
      subtasks: task.subtasks.map(subtask => ({...subtask})),
    };
  }

  function plannedStart(task: Task): string | null {
    return task.scheduledStartAt === undefined
      ? task.startAt
      : task.scheduledStartAt;
  }

  function compareNullableTimestamp(
    left: string | null,
    right: string | null,
  ): number {
    if (left === null) {
      return right === null ? 0 : 1;
    }
    if (right === null) {
      return -1;
    }
    return Date.parse(left) - Date.parse(right);
  }

  function compareTask(left: Task, right: Task): number {
    const statusComparison =
      (left.status === 'in_progress' ? 0 : 1) -
      (right.status === 'in_progress' ? 0 : 1);
    if (statusComparison !== 0) {
      return statusComparison;
    }
    const plannedComparison = compareNullableTimestamp(
      plannedStart(left),
      plannedStart(right),
    );
    if (plannedComparison !== 0) {
      return plannedComparison;
    }
    const dueComparison = compareNullableTimestamp(left.dueAt, right.dueAt);
    if (dueComparison !== 0) {
      return dueComparison;
    }
    const creationComparison = Date.parse(left.createdAt) - Date.parse(right.createdAt);
    if (creationComparison !== 0) {
      return creationComparison;
    }
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  }

  function bucket<Q extends Quadrant>(quadrant: Q): TaskQuadrantBucket<Q> {
    const sorted = active
      .filter(task => effectiveQuadrantForTask(task, nowInput) === quadrant)
      .slice()
      .sort(compareTask);
    return {
      quadrant,
      position: QUADRANT_POSITION[quadrant],
      totalCount: sorted.length,
      preview: sorted.slice(0, 3).map(cloneTask),
      allTasks: sorted.map(cloneTask),
    };
  }

  return [bucket('Q1'), bucket('Q2'), bucket('Q3'), bucket('Q4')];
}

export function getQuadrant(important: boolean, urgent: boolean): Quadrant {
  if (typeof important !== 'boolean' || typeof urgent !== 'boolean') {
    throw new DomainError('INVALID_QUADRANT_FLAG');
  }

  if (important) {
    return urgent ? 'Q1' : 'Q2';
  }
  return urgent ? 'Q3' : 'Q4';
}
