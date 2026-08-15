import type {Subtask, Task} from '../domain/task';
import {
  TASK_REPOSITORY_COORDINATION_IDENTITY,
  type KeyValueStorage,
} from './taskRepository';
import {assertValidTaskSnapshot} from './taskSnapshotValidation';
import {normalizeTaskExtensionSnapshot} from '../domain/taskPriority';
import {
  isValidTaskSupportFields,
  normalizeTaskSupportSnapshot,
} from '../domain/taskSupport';
import {
  isValidTaskGrowthFields,
  normalizeTaskGrowthSnapshot,
} from '../domain/growth';
import {
  isValidTaskOrganizationFields,
  normalizeTaskOrganizationSnapshot,
} from '../domain/taskOrganization';
import {
  isValidTaskExecutionFields,
  normalizeTaskExecutionSnapshot,
} from '../domain/taskExecutionPlan';

export const TASK_STORAGE_KEY = 'start-five.tasks.v1';
export const TASK_SNAPSHOT_SCHEMA = 'start-five.tasks';
export const TASK_SNAPSHOT_VERSION = 1;

export type AsyncKeyValueBackend = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

type TaskStorageErrorCode =
  | 'TASK_SNAPSHOT_CORRUPT'
  | 'TASK_SNAPSHOT_UNSUPPORTED'
  | 'TASK_SNAPSHOT_INVALID'
  | 'TASK_STORAGE_READ_FAILED'
  | 'TASK_STORAGE_WRITE_FAILED';

class TaskStorageError extends Error {
  readonly code: TaskStorageErrorCode;
  readonly cause: unknown;

  constructor(code: TaskStorageErrorCode, cause?: unknown) {
    super(code);
    this.name = 'TaskStorageError';
    this.code = code;
    this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

type TaskSnapshotEnvelope = {
  schema: typeof TASK_SNAPSHOT_SCHEMA;
  version: typeof TASK_SNAPSHOT_VERSION;
  tasks: Task[];
};

const TASK_KEYS = [
  'id',
  'title',
  'description',
  'important',
  'urgent',
  'status',
  'startAt',
  'dueAt',
  'createdAt',
  'updatedAt',
  'startedAt',
  'completedAt',
  'deletedAt',
  'score',
  'scoreAwardedAt',
  'subtasks',
] as const;

const TASK_OPTIONAL_PLANNING_KEYS = [
  'scheduledStartAt',
  'estimatedMinutes',
  'firstStep',
  'progress',
  'prioritySchemaVersion',
  'importanceScore',
  'manualUrgencyScore',
  'urgencyMode',
  'repeatRule',
  'repeatSeriesId',
  'repeatOccurrenceKey',
  'postponedCount',
  'supportSchemaVersion',
  'nextStartAt',
  'stuckRepair',
  'rescuePlan',
  'postponePromptAcknowledgedKey',
  'abandonReason',
  'growthSchemaVersion',
  'growthRewards',
  'firstStepCompletion',
  'placementState',
  'archivedAt',
  'archiveReason',
  'lastMeaningfulActivityAt',
  'completionRewardConsumed',
  'completionDefinition',
  'progressSource',
  'steps',
  'plannedWorkSessions',
  'deliveryRiskDismissedAt',
  'deliveryRiskDismissedBand',
] as const;

const SUBTASK_KEYS = [
  'id',
  'taskId',
  'title',
  'status',
  'createdAt',
  'updatedAt',
  'completedAt',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === expected.length &&
    expected.every(key => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function hasTaskKeys(value: Record<string, unknown>): boolean {
  const actual = Object.keys(value);
  const allowed = new Set<string>([
    ...TASK_KEYS,
    ...TASK_OPTIONAL_PLANNING_KEYS,
  ]);
  return (
    TASK_KEYS.every(key => Object.prototype.hasOwnProperty.call(value, key)) &&
    actual.every(key => allowed.has(key))
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isSubtask(value: unknown, taskId: string): value is Subtask {
  if (!isRecord(value) || !hasExactKeys(value, SUBTASK_KEYS)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    value.taskId === taskId &&
    typeof value.title === 'string' &&
    (value.status === 'pending' || value.status === 'completed') &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string' &&
    isNullableString(value.completedAt)
  );
}

function isTask(value: unknown): value is Task {
  if (!isRecord(value) || !hasTaskKeys(value)) {
    return false;
  }

  const taskId = value.id;
  const hasScheduledStartAt = Object.prototype.hasOwnProperty.call(
    value,
    'scheduledStartAt',
  );
  const scheduledStartAtIsValid =
    !hasScheduledStartAt || isNullableString(value.scheduledStartAt);
  const estimatedMinutesIsValid =
    !Object.prototype.hasOwnProperty.call(value, 'estimatedMinutes') ||
    value.estimatedMinutes === null ||
    (typeof value.estimatedMinutes === 'number' &&
      Number.isSafeInteger(value.estimatedMinutes) &&
      value.estimatedMinutes > 0 &&
      !Object.is(value.estimatedMinutes, -0));
  const firstStepIsValid =
    !Object.prototype.hasOwnProperty.call(value, 'firstStep') ||
    value.firstStep === null ||
    (typeof value.firstStep === 'string' && value.firstStep.trim() !== '');
  const progressIsValid =
    !Object.prototype.hasOwnProperty.call(value, 'progress') ||
    value.progress === 0 ||
    value.progress === 25 ||
    value.progress === 50 ||
    value.progress === 75 ||
    value.progress === 100;
  const priorityKeys = [
    'prioritySchemaVersion',
    'importanceScore',
    'manualUrgencyScore',
    'urgencyMode',
  ] as const;
  const hasAnyPriority = priorityKeys.some(key =>
    Object.prototype.hasOwnProperty.call(value, key),
  );
  const priorityIsValid =
    !hasAnyPriority ||
    (priorityKeys.every(key => Object.prototype.hasOwnProperty.call(value, key)) &&
      value.prioritySchemaVersion === 1 &&
      typeof value.importanceScore === 'number' &&
      Number.isFinite(value.importanceScore) &&
      value.importanceScore >= 0 &&
      value.importanceScore <= 100 &&
      typeof value.manualUrgencyScore === 'number' &&
      Number.isFinite(value.manualUrgencyScore) &&
      value.manualUrgencyScore >= 0 &&
      value.manualUrgencyScore <= 100 &&
      (value.urgencyMode === 'manual' || value.urgencyMode === 'hybrid'));

  return (
    typeof taskId === 'string' &&
    typeof value.title === 'string' &&
    typeof value.description === 'string' &&
    typeof value.important === 'boolean' &&
    typeof value.urgent === 'boolean' &&
    (value.status === 'pending' ||
      value.status === 'in_progress' ||
      value.status === 'completed' ||
      value.status === 'cancelled') &&
    isNullableString(value.startAt) &&
    scheduledStartAtIsValid &&
    (!hasScheduledStartAt ||
      (value.startAt === null && value.scheduledStartAt === null) ||
      (typeof value.startAt === 'string' &&
        typeof value.scheduledStartAt === 'string' &&
        Date.parse(value.startAt) === Date.parse(value.scheduledStartAt))) &&
    isNullableString(value.dueAt) &&
    estimatedMinutesIsValid &&
    firstStepIsValid &&
    progressIsValid &&
    priorityIsValid &&
    isValidTaskSupportFields(value) &&
    isValidTaskGrowthFields(value) &&
    isValidTaskOrganizationFields(value) &&
    isValidTaskExecutionFields(value) &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string' &&
    isNullableString(value.startedAt) &&
    isNullableString(value.completedAt) &&
    isNullableString(value.deletedAt) &&
    isNullableFiniteNumber(value.score) &&
    isNullableString(value.scoreAwardedAt) &&
    Array.isArray(value.subtasks) &&
    value.subtasks.every(subtask => isSubtask(subtask, taskId))
  );
}

function isTaskArray(value: unknown): value is Task[] {
  return Array.isArray(value) && value.every(isTask);
}

function parseStoredEnvelope(serialized: string): TaskSnapshotEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    throw new TaskStorageError('TASK_SNAPSHOT_CORRUPT');
  }

  if (
    !isRecord(parsed) ||
    parsed.schema !== TASK_SNAPSHOT_SCHEMA ||
    parsed.version !== TASK_SNAPSHOT_VERSION
  ) {
    throw new TaskStorageError('TASK_SNAPSHOT_UNSUPPORTED');
  }

  const normalizedTasks = normalizeTaskExecutionSnapshot(
    normalizeTaskOrganizationSnapshot(
      normalizeTaskGrowthSnapshot(
        normalizeTaskSupportSnapshot(
          normalizeTaskExtensionSnapshot(parsed.tasks),
        ),
      ),
    ),
  );
  if (
    !hasExactKeys(parsed, ['schema', 'version', 'tasks']) ||
    !isTaskArray(normalizedTasks)
  ) {
    throw new TaskStorageError('TASK_SNAPSHOT_INVALID');
  }
  assertValidTaskSnapshot(normalizedTasks);

  return {
    schema: TASK_SNAPSHOT_SCHEMA,
    version: TASK_SNAPSHOT_VERSION,
    tasks: normalizedTasks,
  };
}

function parseRepositorySnapshot(serialized: string): Task[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    throw new TaskStorageError('TASK_SNAPSHOT_INVALID');
  }

  const normalized = normalizeTaskExecutionSnapshot(
    normalizeTaskOrganizationSnapshot(
      normalizeTaskGrowthSnapshot(
        normalizeTaskSupportSnapshot(
          normalizeTaskExtensionSnapshot(parsed),
        ),
      ),
    ),
  );
  if (!isTaskArray(normalized)) {
    throw new TaskStorageError('TASK_SNAPSHOT_INVALID');
  }
  assertValidTaskSnapshot(normalized);
  return normalized;
}

function serializeEnvelope(tasks: readonly Task[]): string {
  return JSON.stringify({
    schema: TASK_SNAPSHOT_SCHEMA,
    version: TASK_SNAPSHOT_VERSION,
    tasks,
  });
}

function readFailure(cause: unknown): TaskStorageError {
  return new TaskStorageError('TASK_STORAGE_READ_FAILED', cause);
}

function writeFailure(cause: unknown): TaskStorageError {
  return new TaskStorageError('TASK_STORAGE_WRITE_FAILED', cause);
}

export function createPersistentTaskStorage(
  backend: AsyncKeyValueBackend,
): KeyValueStorage {
  return {
    [TASK_REPOSITORY_COORDINATION_IDENTITY]: backend,

    async getItem(key): Promise<string | null> {
      let durableValue: string | null;
      try {
        durableValue = await backend.getItem(key);
      } catch (cause: unknown) {
        throw readFailure(cause);
      }

      if (durableValue === null) {
        return null;
      }
      if (typeof durableValue !== 'string') {
        throw new TaskStorageError('TASK_SNAPSHOT_INVALID');
      }

      const envelope = parseStoredEnvelope(durableValue);
      return JSON.stringify(envelope.tasks);
    },

    async setItem(key, value): Promise<void> {
      const tasks = parseRepositorySnapshot(value);
      const envelope = serializeEnvelope(tasks);

      try {
        await backend.setItem(key, envelope);
      } catch (cause: unknown) {
        throw writeFailure(cause);
      }
    },

    async removeItem(key): Promise<void> {
      try {
        await backend.removeItem(key);
      } catch (cause: unknown) {
        throw writeFailure(cause);
      }
    },
  };
}
