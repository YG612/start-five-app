import type {Subtask, Task} from '../domain/task';
import {isValidTaskSupportFields} from '../domain/taskSupport';
import {isValidTaskGrowthFields} from '../domain/growth';
import {isValidTaskOrganizationFields} from '../domain/taskOrganization';
import {isValidTaskExecutionFields} from '../domain/taskExecutionPlan';

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

export class TaskSnapshotValidationError extends Error {
  readonly code = 'TASK_SNAPSHOT_INVALID';

  constructor() {
    super('TASK_SNAPSHOT_INVALID');
    this.name = 'TaskSnapshotValidationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function invalid(): never {
  throw new TaskSnapshotValidationError();
}

const MAX_PLAIN_JSON_CONTAINER_DEPTH = 256;
const MAX_PLAIN_JSON_ARRAY_LENGTH = 256;
const MAX_PLAIN_JSON_UNIQUE_CONTAINERS = 512;

/**
 * Build a detached ordinary-data snapshot while the caller-input error
 * boundary is still active. Descriptor checks reject accessors before they
 * can execute; ordinary reads deliberately materialize transparent Proxies
 * exactly once so a hostile `get` is normalized here and never retried later.
 */
export function materializePlainJsonData<T>(value: T): T {
  const ancestors = new Set<object>();
  const completedSnapshots = new WeakMap<object, object>();
  let uniqueContainerCount = 0;

  function materialize(candidate: unknown, depth: number): unknown {
    if (
      candidate === null ||
      typeof candidate === 'string' ||
      typeof candidate === 'boolean'
    ) {
      return candidate;
    }

    if (typeof candidate === 'number') {
      if (!Number.isFinite(candidate)) {
        return invalid();
      }
      return candidate;
    }

    if (typeof candidate !== 'object') {
      return invalid();
    }
    if (depth > MAX_PLAIN_JSON_CONTAINER_DEPTH) {
      return invalid();
    }
    if (ancestors.has(candidate)) {
      return invalid();
    }

    const completed = completedSnapshots.get(candidate);
    if (completed !== undefined) {
      return completed;
    }

    uniqueContainerCount += 1;
    if (uniqueContainerCount > MAX_PLAIN_JSON_UNIQUE_CONTAINERS) {
      return invalid();
    }

    ancestors.add(candidate);
    try {
      if (Array.isArray(candidate)) {
        if (
          Object.getPrototypeOf(candidate) !== Array.prototype ||
          Object.getOwnPropertySymbols(candidate).length !== 0
        ) {
          return invalid();
        }

        const names = Object.getOwnPropertyNames(candidate);
        const length = names.length - 1;
        const lengthDescriptor = Object.getOwnPropertyDescriptor(
          candidate,
          'length',
        );
        if (
          length < 0 ||
          names.at(-1) !== 'length' ||
          lengthDescriptor === undefined ||
          !('value' in lengthDescriptor) ||
          lengthDescriptor.value !== length ||
          length > MAX_PLAIN_JSON_ARRAY_LENGTH
        ) {
          return invalid();
        }
        const snapshot: unknown[] = new Array(length);
        for (let index = 0; index < length; index += 1) {
          if (names[index] !== String(index)) {
            return invalid();
          }
          const descriptor = Object.getOwnPropertyDescriptor(
            candidate,
            String(index),
          );
          if (descriptor === undefined || !('value' in descriptor)) {
            return invalid();
          }
          snapshot[index] = materialize(
            Reflect.get(candidate, String(index)),
            depth + 1,
          );
        }
        completedSnapshots.set(candidate, snapshot);
        return snapshot;
      }

      if (
        Object.getPrototypeOf(candidate) !== Object.prototype ||
        Object.getOwnPropertySymbols(candidate).length !== 0
      ) {
        return invalid();
      }

      const enumerableKeys = Object.keys(candidate);
      const ownNames = Object.getOwnPropertyNames(candidate);
      if (ownNames.length !== enumerableKeys.length) {
        return invalid();
      }
      const snapshot: Record<string, unknown> = {};
      for (const key of ownNames) {
        const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
        if (
          descriptor === undefined ||
          !descriptor.enumerable ||
          !('value' in descriptor)
        ) {
          return invalid();
        }
        Object.defineProperty(snapshot, key, {
          configurable: true,
          enumerable: true,
          value: materialize(Reflect.get(candidate, key), depth + 1),
          writable: true,
        });
      }
      completedSnapshots.set(candidate, snapshot);
      return snapshot;
    } finally {
      ancestors.delete(candidate);
    }
  }

  try {
    return materialize(value, 1) as T;
  } catch {
    // Proxy traps, revoked proxies, excessive nesting and other engine-level
    // introspection failures are all invalid public snapshot inputs.  Keep
    // the repository boundary deterministic instead of exposing a native
    // TypeError, RangeError or caller-controlled exception.
    return invalid();
  }
}

/**
 * Reject values whose in-memory identity or behaviour JSON serialization can
 * silently change. Repository callers are allowed to supply materializable
 * ordinary objects, arrays and JSON primitives only.
 */
export function assertPlainJsonData(value: unknown): void {
  materializePlainJsonData(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
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

function requiredNonBlankString(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    return invalid();
  }
  return value;
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string') {
    return invalid();
  }
  return value;
}

function requiredTimestamp(value: unknown): number {
  if (typeof value !== 'string' || value.trim() === '') {
    return invalid();
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    return invalid();
  }
  return milliseconds;
}

function optionalTimestamp(value: unknown): number | null {
  return value === null ? null : requiredTimestamp(value);
}

function validRepeatRule(value: unknown): boolean {
  if (value === null) return true;
  if (!isRecord(value) || typeof value.frequency !== 'string') return false;
  if (value.frequency === 'daily') {
    return hasExactKeys(value, ['frequency']);
  }
  if (value.frequency === 'weekly') {
    return (
      hasExactKeys(value, ['frequency', 'weekdays']) &&
      Array.isArray(value.weekdays) &&
      value.weekdays.length > 0 &&
      new Set(value.weekdays).size === value.weekdays.length &&
      value.weekdays.every(
        day =>
          typeof day === 'number' &&
          Number.isSafeInteger(day) &&
          day >= 0 &&
          day <= 6,
      )
    );
  }
  return (
    value.frequency === 'monthly' &&
    hasExactKeys(value, ['frequency', 'dayOfMonth']) &&
    typeof value.dayOfMonth === 'number' &&
    Number.isSafeInteger(value.dayOfMonth) &&
    value.dayOfMonth >= 1 &&
    value.dayOfMonth <= 31
  );
}

function validateSubtask(value: unknown, taskId: string): Subtask {
  if (!isRecord(value) || !hasExactKeys(value, SUBTASK_KEYS)) {
    return invalid();
  }

  requiredNonBlankString(value.id);
  if (value.taskId !== taskId) {
    return invalid();
  }
  requiredNonBlankString(value.title);
  if (value.status !== 'pending' && value.status !== 'completed') {
    return invalid();
  }

  const createdAt = requiredTimestamp(value.createdAt);
  const updatedAt = requiredTimestamp(value.updatedAt);
  const completedAt = optionalTimestamp(value.completedAt);
  if (
    updatedAt < createdAt ||
    (completedAt !== null && completedAt < createdAt) ||
    (completedAt !== null && updatedAt < completedAt)
  ) {
    return invalid();
  }
  const priorityKeys = [
    'prioritySchemaVersion',
    'importanceScore',
    'manualUrgencyScore',
    'urgencyMode',
  ] as const;
  const hasAnyPriority = priorityKeys.some(key =>
    Object.prototype.hasOwnProperty.call(value, key),
  );
  if (
    hasAnyPriority &&
    (!priorityKeys.every(key => Object.prototype.hasOwnProperty.call(value, key)) ||
      value.prioritySchemaVersion !== 1 ||
      typeof value.importanceScore !== 'number' ||
      !Number.isFinite(value.importanceScore) ||
      value.importanceScore < 0 ||
      value.importanceScore > 100 ||
      typeof value.manualUrgencyScore !== 'number' ||
      !Number.isFinite(value.manualUrgencyScore) ||
      value.manualUrgencyScore < 0 ||
      value.manualUrgencyScore > 100 ||
      (value.urgencyMode !== 'manual' && value.urgencyMode !== 'hybrid'))
  ) {
    return invalid();
  }
  if (
    Object.prototype.hasOwnProperty.call(value, 'repeatRule') &&
    !validRepeatRule(value.repeatRule)
  ) {
    return invalid();
  }
  for (const key of ['repeatSeriesId', 'repeatOccurrenceKey'] as const) {
    if (
      Object.prototype.hasOwnProperty.call(value, key) &&
      (typeof value[key] !== 'string' || value[key].trim() === '')
    ) {
      return invalid();
    }
  }
  if (
    Object.prototype.hasOwnProperty.call(value, 'postponedCount') &&
    (typeof value.postponedCount !== 'number' ||
      !Number.isSafeInteger(value.postponedCount) ||
      value.postponedCount < 0)
  ) {
    return invalid();
  }
  if (
    (value.status === 'completed' && completedAt === null) ||
    (value.status === 'pending' && completedAt !== null)
  ) {
    return invalid();
  }

  return value as unknown as Subtask;
}

type TaskValidationPolicy = {
  allowLegacyScorelessCompletion: boolean;
  allowLegacyMissingStartedAt: boolean;
};

const STRICT_POLICY: TaskValidationPolicy = {
  allowLegacyScorelessCompletion: false,
  allowLegacyMissingStartedAt: false,
};

const DIRECT_REPOSITORY_POLICY: TaskValidationPolicy = {
  // Review-1 direct-memory repositories pre-date awarded scores.  Keep that
  // one read shape recoverable while persistent versioned envelopes remain
  // strict and reject it.
  allowLegacyScorelessCompletion: true,
  allowLegacyMissingStartedAt: false,
};

const MUTATION_POLICY: TaskValidationPolicy = {
  // Scoreless completion is the one durable Review-1 compatibility shape.
  // Mutation code normalizes old missing-start inputs before applying this
  // policy so newly written in-progress/scored-completed tasks stay strict.
  allowLegacyScorelessCompletion: true,
  allowLegacyMissingStartedAt: false,
};

function validateTask(value: unknown, policy: TaskValidationPolicy): Task {
  if (!isRecord(value) || !hasTaskKeys(value)) {
    return invalid();
  }

  const id = requiredNonBlankString(value.id);
  requiredNonBlankString(value.title);
  requiredString(value.description);
  if (typeof value.important !== 'boolean' || typeof value.urgent !== 'boolean') {
    return invalid();
  }
  if (
    value.status !== 'pending' &&
    value.status !== 'in_progress' &&
    value.status !== 'completed' &&
    value.status !== 'cancelled'
  ) {
    return invalid();
  }

  const startAt = optionalTimestamp(value.startAt);
  const hasScheduledStartAt = Object.prototype.hasOwnProperty.call(
    value,
    'scheduledStartAt',
  );
  const scheduledStartAt = hasScheduledStartAt
    ? optionalTimestamp(value.scheduledStartAt)
    : startAt;
  const dueAt = optionalTimestamp(value.dueAt);
  const createdAt = requiredTimestamp(value.createdAt);
  const updatedAt = requiredTimestamp(value.updatedAt);
  const startedAt = optionalTimestamp(value.startedAt);
  const completedAt = optionalTimestamp(value.completedAt);
  const deletedAt = optionalTimestamp(value.deletedAt);
  const scoreAwardedAt = optionalTimestamp(value.scoreAwardedAt);

  if (hasScheduledStartAt && scheduledStartAt !== startAt) {
    return invalid();
  }
  if (Object.prototype.hasOwnProperty.call(value, 'estimatedMinutes')) {
    const estimatedMinutes = value.estimatedMinutes;
    if (
      estimatedMinutes !== null &&
      (typeof estimatedMinutes !== 'number' ||
        !Number.isSafeInteger(estimatedMinutes) ||
        estimatedMinutes <= 0 ||
        Object.is(estimatedMinutes, -0))
    ) {
      return invalid();
    }
  }
  if (Object.prototype.hasOwnProperty.call(value, 'firstStep')) {
    const firstStep = value.firstStep;
    if (
      firstStep !== null &&
      (typeof firstStep !== 'string' || firstStep.trim() === '')
    ) {
      return invalid();
    }
  }
  if (
    Object.prototype.hasOwnProperty.call(value, 'progress') &&
    value.progress !== 0 &&
    value.progress !== 25 &&
    value.progress !== 50 &&
    value.progress !== 75 &&
    value.progress !== 100
  ) {
    return invalid();
  }
  if (!isValidTaskSupportFields(value)) {
    return invalid();
  }
  if (!isValidTaskGrowthFields(value)) {
    return invalid();
  }
  if (!isValidTaskOrganizationFields(value)) {
    return invalid();
  }
  if (!isValidTaskExecutionFields(value)) {
    return invalid();
  }

  if (
    (startAt !== null && dueAt !== null && startAt > dueAt) ||
    updatedAt < createdAt ||
    (startedAt !== null && startedAt < createdAt) ||
    (completedAt !== null && completedAt < createdAt) ||
    (deletedAt !== null && deletedAt < createdAt) ||
    (scoreAwardedAt !== null && scoreAwardedAt < createdAt) ||
    (startedAt !== null && updatedAt < startedAt) ||
    (completedAt !== null && updatedAt < completedAt) ||
    (deletedAt !== null && updatedAt < deletedAt) ||
    (scoreAwardedAt !== null && updatedAt < scoreAwardedAt) ||
    (startedAt !== null && completedAt !== null && completedAt < startedAt) ||
    (completedAt !== null &&
      scoreAwardedAt !== null &&
      scoreAwardedAt < completedAt)
  ) {
    return invalid();
  }

  if (
    value.score !== null &&
    (typeof value.score !== 'number' ||
      !Number.isFinite(value.score) ||
      !Number.isSafeInteger(value.score) ||
      value.score < 0 ||
      Object.is(value.score, -0))
  ) {
    return invalid();
  }
  if ((value.score === null) !== (scoreAwardedAt === null)) {
    return invalid();
  }

  if (!Array.isArray(value.subtasks)) {
    return invalid();
  }
  const subtaskIds = new Set<string>();
  const subtasks = value.subtasks.map(candidate => {
    const subtask = validateSubtask(candidate, id);
    if (subtaskIds.has(subtask.id)) {
      return invalid();
    }
    subtaskIds.add(subtask.id);
    return subtask;
  });

  for (const subtask of subtasks) {
    const subtaskCreatedAt = requiredTimestamp(subtask.createdAt);
    const subtaskUpdatedAt = requiredTimestamp(subtask.updatedAt);
    const subtaskCompletedAt = optionalTimestamp(subtask.completedAt);
    if (
      subtaskCreatedAt < createdAt ||
      subtaskUpdatedAt > updatedAt ||
      (subtaskCompletedAt !== null &&
        completedAt !== null &&
        subtaskCompletedAt > completedAt)
    ) {
      return invalid();
    }
  }

  if (value.status === 'completed') {
    const legacyScorelessCompletion =
      policy.allowLegacyScorelessCompletion &&
      value.score === null &&
      scoreAwardedAt === null;
    if (
      (startedAt === null && !policy.allowLegacyMissingStartedAt) ||
      completedAt === null ||
      (!legacyScorelessCompletion &&
        (value.score === null || scoreAwardedAt === null)) ||
      subtasks.some(subtask => subtask.status !== 'completed')
    ) {
      return invalid();
    }
  } else {
    const retainedConsumedReward =
      value.completionRewardConsumed === true &&
      value.score !== null &&
      scoreAwardedAt !== null;
    if (
      completedAt !== null ||
      (!retainedConsumedReward &&
        (value.score !== null || scoreAwardedAt !== null))
    ) {
      return invalid();
    }
    if (value.status === 'pending' && startedAt !== null) {
      return invalid();
    }
    if (
      value.status === 'in_progress' &&
      startedAt === null &&
      !policy.allowLegacyMissingStartedAt
    ) {
      return invalid();
    }
  }

  return value as unknown as Task;
}

function assertTaskSnapshotWithPolicy(
  value: unknown,
  policy: TaskValidationPolicy,
): asserts value is Task[] {
  assertPlainJsonData(value);
  if (!Array.isArray(value)) {
    return invalid();
  }

  const taskIds = new Set<string>();
  for (const candidate of value) {
    const task = validateTask(candidate, policy);
    if (taskIds.has(task.id)) {
      return invalid();
    }
    taskIds.add(task.id);
  }
}

export function assertValidTaskSnapshot(
  value: unknown,
): asserts value is Task[] {
  assertTaskSnapshotWithPolicy(value, STRICT_POLICY);
}

export function assertValidDirectRepositorySnapshot(
  value: unknown,
): asserts value is Task[] {
  assertTaskSnapshotWithPolicy(value, DIRECT_REPOSITORY_POLICY);
}

export function assertValidTaskMutationSnapshot(
  value: unknown,
): asserts value is Task[] {
  assertTaskSnapshotWithPolicy(value, MUTATION_POLICY);
}

export function assertFiniteTaskScores(tasks: readonly Task[]): void {
  for (const task of tasks) {
    if (
      typeof task.score === 'number' &&
      !Number.isFinite(task.score)
    ) {
      return invalid();
    }
  }
}
