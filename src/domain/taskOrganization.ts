import type {
  Task,
  TaskArchiveReason,
  TaskPlacementState,
} from './task';
import {
  TASK_PRIORITY_SCHEMA_VERSION,
  legacyPriorityCoordinates,
  type TaskWithPriority,
} from './taskPriority';
import {nextStartAtForTask, type TaskWithSupport} from './taskSupport';

export type TaskWithOrganization = Task & Readonly<{
  placementState?: TaskPlacementState;
  archivedAt?: string | null;
  archiveReason?: TaskArchiveReason | null;
  lastMeaningfulActivityAt?: string | null;
  completionRewardConsumed?: boolean;
}>;

export type UnsortedClassificationAnswers = Readonly<{
  important: boolean;
  urgent: boolean;
}>;

export type TaskSearchStatus =
  | 'ACTIVE'
  | 'UNSORTED'
  | 'COMPLETED'
  | 'ARCHIVED';

export type TaskSearchResult = Readonly<{
  task: Task;
  status: TaskSearchStatus;
  matchIndex: number;
}>;

const ORGANIZATION_KEYS = [
  'placementState',
  'archivedAt',
  'archiveReason',
  'lastMeaningfulActivityAt',
  'completionRewardConsumed',
] as const;

const ARCHIVE_REASONS = new Set<TaskArchiveReason>([
  'NO_LONGER_NEEDED',
  'DUPLICATE',
  'PAUSED',
  'OTHER',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function timestamp(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds)
    ? new Date(milliseconds).toISOString()
    : null;
}

export function placementStateForTask(task: Task): TaskPlacementState {
  return (task as TaskWithOrganization).placementState === 'UNSORTED'
    ? 'UNSORTED'
    : 'QUADRANT';
}

export function isTaskArchived(task: Task): boolean {
  return timestamp((task as TaskWithOrganization).archivedAt) !== null;
}

export function isTaskUnsorted(task: Task): boolean {
  return placementStateForTask(task) === 'UNSORTED' && !isTaskArchived(task);
}

export function isTaskInQuadrants(task: Task): boolean {
  return placementStateForTask(task) === 'QUADRANT' && !isTaskArchived(task);
}

export function selectHomeVisibleTasks(tasks: readonly Task[]): readonly Task[] {
  return tasks.filter(task =>
    task.deletedAt === null &&
    (task.status === 'pending' || task.status === 'in_progress') &&
    isTaskInQuadrants(task),
  );
}

export function classifyUnsortedTask(
  task: Task,
  answers: UnsortedClassificationAnswers,
  nowInput: string,
): Partial<Omit<Task, 'id'>> {
  if (!isTaskUnsorted(task)) throw new Error('TASK_NOT_UNSORTED');
  const now = timestamp(nowInput);
  if (now === null) throw new Error('INVALID_TIMESTAMP');
  const coordinates = legacyPriorityCoordinates(answers.important, answers.urgent);
  return {
    placementState: 'QUADRANT',
    important: answers.important,
    urgent: answers.urgent,
    prioritySchemaVersion: TASK_PRIORITY_SCHEMA_VERSION,
    importanceScore: coordinates.importanceScore,
    manualUrgencyScore: coordinates.manualUrgencyScore,
    urgencyMode: task.dueAt === null ? 'manual' : 'hybrid',
    lastMeaningfulActivityAt: now,
  } as Partial<Omit<TaskWithPriority & TaskWithOrganization, 'id'>>;
}

export function restoreCompletedTask(
  task: Task,
  nowInput: string,
): Partial<Omit<Task, 'id'>> {
  if (task.status !== 'completed') throw new Error('TASK_NOT_COMPLETED');
  const now = timestamp(nowInput);
  if (now === null) throw new Error('INVALID_TIMESTAMP');
  return {
    status: 'pending',
    startedAt: null,
    completedAt: null,
    completionRewardConsumed: true,
    lastMeaningfulActivityAt: now,
    updatedAt: now,
  };
}

export function archiveTask(
  task: Task,
  reason: TaskArchiveReason,
  nowInput: string,
): Partial<Omit<Task, 'id'>> {
  if (!ARCHIVE_REASONS.has(reason)) throw new Error('INVALID_ARCHIVE_REASON');
  if (task.status === 'completed' || task.status === 'cancelled') {
    throw new Error('TERMINAL_TASK');
  }
  const now = timestamp(nowInput);
  if (now === null) throw new Error('INVALID_TIMESTAMP');
  return {
    archivedAt: now,
    archiveReason: reason,
    lastMeaningfulActivityAt: now,
    updatedAt: now,
  };
}

export function restoreArchivedTask(
  task: Task,
  nowInput: string,
): Partial<Omit<Task, 'id'>> {
  if (!isTaskArchived(task)) throw new Error('TASK_NOT_ARCHIVED');
  const now = timestamp(nowInput);
  if (now === null) throw new Error('INVALID_TIMESTAMP');
  return {
    archivedAt: null,
    archiveReason: null,
    placementState: 'UNSORTED',
    lastMeaningfulActivityAt: now,
    updatedAt: now,
  };
}

export function normalizeTaskSearchText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function searchCorpus(task: Task): string {
  return normalizeTaskSearchText([
    task.title,
    task.firstStep ?? '',
    task.description,
    ...task.subtasks.map(subtask => subtask.title),
  ].join(' '));
}

function searchStatus(task: Task): TaskSearchStatus {
  if (isTaskArchived(task)) return 'ARCHIVED';
  if (task.status === 'completed') return 'COMPLETED';
  if (isTaskUnsorted(task)) return 'UNSORTED';
  return 'ACTIVE';
}

const SEARCH_STATUS_RANK: Readonly<Record<TaskSearchStatus, number>> = {
  ACTIVE: 0,
  UNSORTED: 1,
  COMPLETED: 2,
  ARCHIVED: 3,
};

export function searchTasks(
  tasks: readonly Task[],
  queryInput: string,
  options: Readonly<{limit?: number}> = {},
): readonly TaskSearchResult[] {
  const query = normalizeTaskSearchText(queryInput);
  const limit = Math.min(50, Math.max(1, options.limit ?? 50));
  if (query === '') {
    return [...tasks]
      .filter(task => task.deletedAt === null)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, Math.min(5, limit))
      .map(task => ({task, status: searchStatus(task), matchIndex: 0}));
  }
  return tasks
    .filter(task => task.deletedAt === null)
    .map(task => ({
      task,
      status: searchStatus(task),
      matchIndex: searchCorpus(task).indexOf(query),
    }))
    .filter(result => result.matchIndex >= 0)
    .sort((left, right) =>
      SEARCH_STATUS_RANK[left.status] - SEARCH_STATUS_RANK[right.status] ||
      left.matchIndex - right.matchIndex ||
      right.task.updatedAt.localeCompare(left.task.updatedAt) ||
      left.task.id.localeCompare(right.task.id),
    )
    .slice(0, limit);
}

export type TaskSearchPage = Readonly<{
  items: readonly TaskSearchResult[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}>;

export function searchTasksPage(
  tasks: readonly Task[],
  queryInput: string,
  pageInput = 0,
  pageSizeInput = 25,
): TaskSearchPage {
  const page = Math.max(0, Math.floor(pageInput));
  const pageSize = Math.min(50, Math.max(1, Math.floor(pageSizeInput)));
  const query = normalizeTaskSearchText(queryInput);
  if (query === '') {
    const recent = searchTasks(tasks, '', {limit: 5});
    return {items: recent, page: 0, pageSize: 5, total: recent.length, hasMore: false};
  }
  const matches = tasks
    .filter(task => task.deletedAt === null)
    .map(task => ({task, status: searchStatus(task), matchIndex: searchCorpus(task).indexOf(query)}))
    .filter(result => result.matchIndex >= 0)
    .sort((left, right) =>
      SEARCH_STATUS_RANK[left.status] - SEARCH_STATUS_RANK[right.status] ||
      left.matchIndex - right.matchIndex ||
      right.task.updatedAt.localeCompare(left.task.updatedAt) ||
      left.task.id.localeCompare(right.task.id),
    );
  const end = Math.min(matches.length, (page + 1) * pageSize);
  return {
    items: matches.slice(0, end),
    page,
    pageSize,
    total: matches.length,
    hasMore: end < matches.length,
  };
}

export function selectBacklogCandidates(
  tasks: readonly Task[],
  nowInput: string,
  activeFocusTaskId: string | null,
  limit = 5,
): readonly Task[] {
  const now = Date.parse(nowInput);
  if (!Number.isFinite(now)) throw new Error('INVALID_TIMESTAMP');
  const boundary = now - 14 * 86_400_000;
  return tasks
    .filter(task => {
      const extended = task as TaskWithOrganization & TaskWithPriority & TaskWithSupport;
      const meaningful = timestamp(extended.lastMeaningfulActivityAt) ?? task.updatedAt;
      const nextStart = nextStartAtForTask(task);
      return (
        task.deletedAt === null &&
        task.id !== activeFocusTaskId &&
        (task.status === 'pending' || task.status === 'in_progress') &&
        isTaskInQuadrants(task) &&
        extended.repeatRule == null &&
        (nextStart === null || Date.parse(nextStart) <= now) &&
        Date.parse(meaningful) <= boundary
      );
    })
    .sort((left, right) =>
      (timestamp((left as TaskWithOrganization).lastMeaningfulActivityAt) ?? left.updatedAt)
        .localeCompare(
          timestamp((right as TaskWithOrganization).lastMeaningfulActivityAt) ?? right.updatedAt,
        ) || left.id.localeCompare(right.id),
    )
    .slice(0, Math.min(5, Math.max(0, limit)));
}

export function hasTaskOrganizationFields(value: object): boolean {
  return ORGANIZATION_KEYS.some(key => hasOwn(value, key));
}

export function normalizeTaskOrganizationRecord<T>(value: T): T {
  if (!isRecord(value) || !hasTaskOrganizationFields(value)) return value;
  const next: Record<string, unknown> = {...value};
  if (hasOwn(value, 'placementState')) {
    next.placementState = value.placementState === 'UNSORTED'
      ? 'UNSORTED'
      : 'QUADRANT';
  }
  if (hasOwn(value, 'archivedAt')) {
    next.archivedAt = value.archivedAt == null ? null : timestamp(value.archivedAt);
  }
  if (hasOwn(value, 'archiveReason')) {
    next.archiveReason = value.archiveReason == null
      ? null
      : ARCHIVE_REASONS.has(value.archiveReason as TaskArchiveReason)
        ? value.archiveReason
        : null;
  }
  if (hasOwn(value, 'lastMeaningfulActivityAt')) {
    next.lastMeaningfulActivityAt = value.lastMeaningfulActivityAt == null
      ? null
      : timestamp(value.lastMeaningfulActivityAt);
  }
  if (hasOwn(value, 'completionRewardConsumed')) {
    next.completionRewardConsumed = value.completionRewardConsumed === true;
  }
  return next as T;
}

export function normalizeTaskOrganizationSnapshot<T>(value: T): T {
  return Array.isArray(value)
    ? value.map(normalizeTaskOrganizationRecord) as T
    : value;
}

export function isValidTaskOrganizationFields(
  value: Record<string, unknown>,
): boolean {
  if (
    hasOwn(value, 'placementState') &&
    value.placementState !== 'QUADRANT' &&
    value.placementState !== 'UNSORTED'
  ) return false;
  if (
    hasOwn(value, 'archivedAt') &&
    value.archivedAt !== null &&
    timestamp(value.archivedAt) === null
  ) return false;
  if (
    hasOwn(value, 'archiveReason') &&
    value.archiveReason !== null &&
    !ARCHIVE_REASONS.has(value.archiveReason as TaskArchiveReason)
  ) return false;
  if (
    hasOwn(value, 'lastMeaningfulActivityAt') &&
    value.lastMeaningfulActivityAt !== null &&
    timestamp(value.lastMeaningfulActivityAt) === null
  ) return false;
  if (
    hasOwn(value, 'completionRewardConsumed') &&
    typeof value.completionRewardConsumed !== 'boolean'
  ) return false;
  return true;
}
