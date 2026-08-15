import {
  getTaskRepositoryCoordinationIdentity,
  type TaskRepository,
} from '../data/taskRepository';
import {
  getQuadrant,
  projectTaskQuadrantsAt,
  QUADRANT_POSITION,
  type TaskQuadrantProjection,
} from '../domain/quadrant';
import {recommendNextTask} from '../domain/recommendation';
import {awardCompletionScore} from '../domain/scoring';
import {
  isTaskInQuadrants,
  restoreCompletedTask,
} from '../domain/taskOrganization';
import {
  completeSubtask,
  completeTask,
  createFirstStep,
  createTask as createDomainTask,
  DomainError,
  startTask,
  type Task,
  type TaskArchiveReason,
  type TaskInput,
  type TaskPlacementState,
  type TaskProgress,
  type TaskProgressSource,
  type TaskStep,
  type PlannedWorkSession,
  type DeliveryRiskDismissedBand,
} from '../domain/task';
import {
  cancelRemainingPlannedWork,
  isValidTaskExecutionFields,
  normalizeCompletionDefinition,
  taskStepProgress,
} from '../domain/taskExecutionPlan';
import {
  deriveLegacyPriorityFields,
  hasTaskPriorityFields,
  legacyPriorityCoordinates,
  normalizePriorityScore,
  normalizeRepeatRule,
  priorityCoordinatesForTask,
  TASK_PRIORITY_SCHEMA_VERSION,
  type RepeatRule,
  type TaskWithPriority,
  type UrgencyMode,
} from '../domain/taskPriority';
import {
  buildNextRepeatedTask,
  nextRepeatDueAt,
  repeatBusinessKey,
} from '../domain/taskRecurrence';
import {
  TASK_SUPPORT_SCHEMA_VERSION,
  nextStartAtForTask,
  normalizeStuckRepairRecord,
  normalizeTaskRescuePlan,
  type StuckRepairRecord,
  type TaskRescuePlan,
} from '../domain/taskSupport';
import {
  TASK_GROWTH_SCHEMA_VERSION,
  awardFirstStartReward,
  completeFirstStepWithReward,
  undoFirstStepCompletion,
  type GrowthAwardResult,
  type TaskWithGrowth,
} from '../domain/growth';

export type OperationOptions = {
  operationId: string;
};

export type FirstStepInput = {
  title: string;
};

export type NetworkAdapter = {
  request(): Promise<unknown>;
};

export type OperationMutationKind =
  | 'createTask'
  | 'addFirstStep'
  | 'startRecommended'
  | 'completeFirstStep'
  | 'undoFirstStep'
  | 'finishStep'
  | 'finishTask';

export type OperationRegistryRequest = {
  operationId: string;
  kind: OperationMutationKind;
  fingerprint: string;
};

export type OperationRegistry = {
  readonly size: number;
  run<T>(
    request: OperationRegistryRequest,
    work: () => Promise<T>,
  ): Promise<T>;
};

export type CreateCoreAppServiceDependencies = {
  repository: TaskRepository;
  now(): string;
  idGenerator(): string;
  network?: NetworkAdapter;
  operationRegistry?: OperationRegistry;
};

export type TaskCompletionResult = {
  task: Task;
  points: number;
};

export type FirstStepCompletionInput = Readonly<{
  nextStep?: string | null;
}>;

export type TaskActionRewardResult = GrowthAwardResult;

export type CoreAppState = {
  tasks: Task[];
  totalScore: number;
};

export type CoreAppService = {
  createTask(input: TaskInput, operation: OperationOptions): Promise<Task>;
  addFirstStep(
    taskId: string,
    input: FirstStepInput,
    operation: OperationOptions,
  ): Promise<Task>;
  chooseRecommended(): Promise<Task | null>;
  startRecommended(operation: OperationOptions): Promise<Task>;
  completeFirstStep?(
    taskId: string,
    input: FirstStepCompletionInput,
    operation: OperationOptions,
  ): Promise<TaskActionRewardResult>;
  undoFirstStep?(
    taskId: string,
    operation: OperationOptions,
  ): Promise<Task>;
  finishStep(
    taskId: string,
    stepId: string,
    operation: OperationOptions,
  ): Promise<Task>;
  finishTask(
    taskId: string,
    operation: OperationOptions,
  ): Promise<TaskCompletionResult>;
  getState(): Promise<CoreAppState>;
};

export type TaskLifecycleTaskInput = {
  title: string;
  description?: string;
  important: boolean;
  urgent: boolean;
  startAt?: string | null;
  scheduledStartAt?: string | null;
  dueAt?: string | null;
  estimatedMinutes?: number | null;
  firstStep?: string | null;
  placementState?: TaskPlacementState;
};

export type TaskLifecycleTaskPatch = Partial<
  Pick<
    Task,
    | 'title'
    | 'description'
    | 'important'
    | 'urgent'
    | 'startAt'
    | 'scheduledStartAt'
    | 'dueAt'
    | 'estimatedMinutes'
    | 'firstStep'
    | 'placementState'
    | 'archivedAt'
    | 'archiveReason'
    | 'lastMeaningfulActivityAt'
    | 'completionRewardConsumed'
    | 'completionDefinition'
    | 'progressSource'
    | 'steps'
    | 'plannedWorkSessions'
    | 'deliveryRiskDismissedAt'
    | 'deliveryRiskDismissedBand'
  >
>;

export type TaskLifecycleReadOptions = {includeDeleted?: boolean};
export type TaskLifecycleOperationOptions = {operationId: string};
export type TaskLifecycleRescheduleInput = {
  scheduledStartAt: string | null;
  dueAt?: string | null;
};
export type TaskLifecycleDelayInput = {minutes: number};

export type TaskLifecycleQueryResult = {
  tasks: Task[];
  recommendation: Task | null;
  quadrants: TaskQuadrantProjection;
};

export type CreateTaskLifecycleServiceOptions = {
  repository: TaskRepository;
  now(): string;
  idGenerator(): string;
};

export type TaskLifecycleService = {
  create(
    input: TaskLifecycleTaskInput,
    operation: TaskLifecycleOperationOptions,
  ): Promise<Task>;
  getById(
    taskId: string,
    options?: TaskLifecycleReadOptions,
  ): Promise<Task | null>;
  list(options?: TaskLifecycleReadOptions): Promise<Task[]>;
  update(
    taskId: string,
    patch: TaskLifecycleTaskPatch,
    operation: TaskLifecycleOperationOptions,
  ): Promise<Task>;
  softDelete(
    taskId: string,
    operation: TaskLifecycleOperationOptions,
  ): Promise<Task>;
  complete(
    taskId: string,
    operation: TaskLifecycleOperationOptions,
  ): Promise<TaskCompletionResult>;
  restoreCompleted(
    taskId: string,
    operation: TaskLifecycleOperationOptions,
  ): Promise<Task>;
  undoComplete(
    taskId: string,
    restoreStatus: 'pending' | 'in_progress',
    operation: TaskLifecycleOperationOptions,
  ): Promise<Task>;
  reschedule(
    taskId: string,
    input: TaskLifecycleRescheduleInput,
    operation: TaskLifecycleOperationOptions,
  ): Promise<Task>;
  delay(
    taskId: string,
    input: TaskLifecycleDelayInput,
    operation: TaskLifecycleOperationOptions,
  ): Promise<Task>;
  getRecommendation(): Promise<Task | null>;
  getQuadrantProjection(): Promise<TaskQuadrantProjection>;
  getQueryResult(): Promise<TaskLifecycleQueryResult>;
};

type NormalizedLifecycleInput = {
  title: string;
  description: string;
  important: boolean;
  urgent: boolean;
  scheduledStartAt: string | null;
  dueAt: string | null;
  estimatedMinutes: number | null;
  firstStep: string | null;
  progress?: TaskProgress;
  prioritySchemaVersion?: typeof TASK_PRIORITY_SCHEMA_VERSION;
  importanceScore?: number;
  manualUrgencyScore?: number;
  urgencyMode?: UrgencyMode;
  repeatRule?: RepeatRule | null;
  placementState: TaskPlacementState;
};

type NormalizedLifecyclePatch = {
  title?: string;
  description?: string;
  important?: boolean;
  urgent?: boolean;
  scheduledStartAt?: string | null;
  dueAt?: string | null;
  estimatedMinutes?: number | null;
  firstStep?: string | null;
  progress?: TaskProgress;
  prioritySchemaVersion?: typeof TASK_PRIORITY_SCHEMA_VERSION;
  importanceScore?: number;
  manualUrgencyScore?: number;
  urgencyMode?: UrgencyMode;
  repeatRule?: RepeatRule | null;
  postponedCount?: number;
  supportSchemaVersion?: typeof TASK_SUPPORT_SCHEMA_VERSION;
  nextStartAt?: string | null;
  stuckRepair?: StuckRepairRecord | null;
  rescuePlan?: TaskRescuePlan | null;
  postponePromptAcknowledgedKey?: string | null;
  abandonReason?: 'no_longer_needed' | null;
  placementState?: TaskPlacementState;
  archivedAt?: string | null;
  archiveReason?: TaskArchiveReason | null;
  lastMeaningfulActivityAt?: string | null;
  completionRewardConsumed?: boolean;
  completionDefinition?: string | null;
  progressSource?: TaskProgressSource;
  steps?: TaskStep[];
  plannedWorkSessions?: PlannedWorkSession[];
  deliveryRiskDismissedAt?: string | null;
  deliveryRiskDismissedBand?: DeliveryRiskDismissedBand | null;
};

type TaskPriorityFieldsPatch = {
  progress?: TaskProgress;
  prioritySchemaVersion?: typeof TASK_PRIORITY_SCHEMA_VERSION;
  importanceScore?: number;
  manualUrgencyScore?: number;
  urgencyMode?: UrgencyMode;
  repeatRule?: RepeatRule | null;
  repeatSeriesId?: string;
  repeatOccurrenceKey?: string;
  postponedCount?: number;
  supportSchemaVersion?: typeof TASK_SUPPORT_SCHEMA_VERSION;
  nextStartAt?: string | null;
  stuckRepair?: StuckRepairRecord | null;
  rescuePlan?: TaskRescuePlan | null;
  postponePromptAcknowledgedKey?: string | null;
  abandonReason?: 'no_longer_needed' | null;
  placementState?: TaskPlacementState;
  archivedAt?: string | null;
  archiveReason?: TaskArchiveReason | null;
  lastMeaningfulActivityAt?: string | null;
  completionRewardConsumed?: boolean;
  completionDefinition?: string | null;
  progressSource?: TaskProgressSource;
  steps?: TaskStep[];
  plannedWorkSessions?: PlannedWorkSession[];
  deliveryRiskDismissedAt?: string | null;
  deliveryRiskDismissedBand?: DeliveryRiskDismissedBand | null;
};

type LifecycleMutationKind =
  | 'create'
  | 'update'
  | 'softDelete'
  | 'complete'
  | 'undoComplete'
  | 'restoreCompleted'
  | 'reschedule'
  | 'delay';

type LifecycleOperationRecord = {
  kind: LifecycleMutationKind;
  fingerprint: string;
  result: Promise<unknown>;
};

type LifecycleTransaction = {
  create(task: Task): Promise<Task>;
  getById(
    id: string,
    options?: TaskLifecycleReadOptions,
  ): Promise<Task | null>;
  list(options?: TaskLifecycleReadOptions): Promise<Task[]>;
  update(id: string, patch: Partial<Omit<Task, 'id'>>): Promise<Task>;
  softDelete(id: string, deletedAt: string): Promise<Task>;
};

type DurableLifecycleCoordinator = {
  runDurableLifecycleOperation<T>(
    request: {
      operationId: string;
      kind: LifecycleMutationKind;
      fingerprint: string;
    },
    work: (transaction: LifecycleTransaction) => Promise<T>,
  ): Promise<T>;
};

const lifecycleOperationRegistries = new WeakMap<
  object,
  Map<string, LifecycleOperationRecord>
>();

function lifecycleRegistryFor(
  repository: TaskRepository,
): Map<string, LifecycleOperationRecord> {
  const identity = getTaskRepositoryCoordinationIdentity(repository);
  const existing = lifecycleOperationRegistries.get(identity);
  if (existing !== undefined) {
    return existing;
  }
  const created = new Map<string, LifecycleOperationRecord>();
  lifecycleOperationRegistries.set(identity, created);
  return created;
}

function isDurableLifecycleCoordinator(
  identity: object,
): identity is DurableLifecycleCoordinator {
  return (
    'runDurableLifecycleOperation' in identity &&
    typeof identity.runDurableLifecycleOperation === 'function'
  );
}

function durableLifecycleCoordinatorFor(
  repository: TaskRepository,
): DurableLifecycleCoordinator | null {
  const identity = getTaskRepositoryCoordinationIdentity(repository);
  if (isDurableLifecycleCoordinator(identity)) {
    return identity;
  }
  return null;
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function canonicalLifecycleTimestamp(value: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DomainError('INVALID_TIMESTAMP');
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new DomainError('INVALID_TIMESTAMP');
  }
  try {
    return new Date(milliseconds).toISOString();
  } catch {
    throw new DomainError('INVALID_TIMESTAMP');
  }
}

function canonicalNullableLifecycleTimestamp(
  value: string | null,
): string | null {
  return value === null ? null : canonicalLifecycleTimestamp(value);
}

function normalizedLifecycleTitle(value: string): string {
  const title = typeof value === 'string' ? value.trim() : '';
  if (title === '') {
    throw new DomainError('TITLE_REQUIRED');
  }
  return title;
}

function normalizedLifecycleDescription(value: string | undefined): string {
  if (value === undefined) {
    return '';
  }
  if (typeof value !== 'string') {
    throw new DomainError('INVALID_DESCRIPTION');
  }
  return value;
}

function normalizedEstimatedMinutes(
  value: number | null,
): number | null {
  if (
    value !== null &&
    (!Number.isSafeInteger(value) || value <= 0 || Object.is(value, -0))
  ) {
    throw new DomainError('INVALID_ESTIMATED_MINUTES');
  }
  return value;
}

function normalizedFirstStep(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const firstStep = typeof value === 'string' ? value.trim() : '';
  if (firstStep === '') {
    throw new DomainError('FIRST_STEP_REQUIRED');
  }
  return firstStep;
}

function normalizedProgress(value: number): TaskProgress {
  if (value !== 0 && value !== 25 && value !== 50 && value !== 75 && value !== 100) {
    throw new DomainError('INVALID_TASK_PROGRESS');
  }
  return value;
}

type InternalLifecycleFields = {
  prioritySchemaVersion?: unknown;
  importanceScore?: unknown;
  manualUrgencyScore?: unknown;
  urgencyMode?: unknown;
  repeatRule?: unknown;
  postponedCount?: unknown;
  supportSchemaVersion?: unknown;
  nextStartAt?: unknown;
  stuckRepair?: unknown;
  rescuePlan?: unknown;
  postponePromptAcknowledgedKey?: unknown;
  abandonReason?: unknown;
  placementState?: unknown;
  archivedAt?: unknown;
  archiveReason?: unknown;
  lastMeaningfulActivityAt?: unknown;
  completionRewardConsumed?: unknown;
  completionDefinition?: unknown;
  progressSource?: unknown;
  steps?: unknown;
  plannedWorkSessions?: unknown;
  deliveryRiskDismissedAt?: unknown;
  deliveryRiskDismissedBand?: unknown;
};

function normalizeExecutionPatch(
  taskId: string,
  patch: TaskLifecycleTaskPatch,
): Pick<
  NormalizedLifecyclePatch,
  | 'completionDefinition'
  | 'progressSource'
  | 'steps'
  | 'plannedWorkSessions'
  | 'deliveryRiskDismissedAt'
  | 'deliveryRiskDismissedBand'
> {
  const internal = patch as TaskLifecycleTaskPatch & InternalLifecycleFields;
  const normalized: Pick<
    NormalizedLifecyclePatch,
    | 'completionDefinition'
    | 'progressSource'
    | 'steps'
    | 'plannedWorkSessions'
    | 'deliveryRiskDismissedAt'
    | 'deliveryRiskDismissedBand'
  > = {};
  if (hasOwn(internal, 'completionDefinition')) {
    normalized.completionDefinition = normalizeCompletionDefinition(
      internal.completionDefinition as string | null | undefined,
    );
  }
  if (hasOwn(internal, 'progressSource')) {
    if (internal.progressSource !== 'MANUAL' && internal.progressSource !== 'STEPS') {
      throw new DomainError('INVALID_PROGRESS_SOURCE');
    }
    normalized.progressSource = internal.progressSource;
  }
  if (hasOwn(internal, 'steps')) {
    const candidate = {id: taskId, steps: internal.steps};
    if (!isValidTaskExecutionFields(candidate) || !Array.isArray(internal.steps)) {
      throw new DomainError('INVALID_TASK_STEPS');
    }
    normalized.steps = internal.steps.map(step => ({...(step as TaskStep)}));
  }
  if (hasOwn(internal, 'plannedWorkSessions')) {
    const candidate = {id: taskId, plannedWorkSessions: internal.plannedWorkSessions};
    if (
      !isValidTaskExecutionFields(candidate) ||
      !Array.isArray(internal.plannedWorkSessions)
    ) {
      throw new DomainError('INVALID_PLANNED_WORK_SESSIONS');
    }
    normalized.plannedWorkSessions = internal.plannedWorkSessions.map(session => ({
      ...(session as PlannedWorkSession),
    }));
  }
  if (hasOwn(internal, 'deliveryRiskDismissedAt')) {
    if (
      internal.deliveryRiskDismissedAt !== null &&
      typeof internal.deliveryRiskDismissedAt !== 'string'
    ) throw new DomainError('INVALID_TIMESTAMP');
    normalized.deliveryRiskDismissedAt = canonicalNullableLifecycleTimestamp(
      internal.deliveryRiskDismissedAt as string | null,
    );
  }
  if (hasOwn(internal, 'deliveryRiskDismissedBand')) {
    if (
      internal.deliveryRiskDismissedBand !== null &&
      internal.deliveryRiskDismissedBand !== 'SEVEN_DAYS' &&
      internal.deliveryRiskDismissedBand !== '24_HOURS'
    ) throw new DomainError('INVALID_DELIVERY_RISK_BAND');
    normalized.deliveryRiskDismissedBand =
      internal.deliveryRiskDismissedBand as DeliveryRiskDismissedBand | null;
  }
  return normalized;
}

function normalizeSupportPatch(
  patch: TaskLifecycleTaskPatch,
): Pick<
  NormalizedLifecyclePatch,
  | 'supportSchemaVersion'
  | 'nextStartAt'
  | 'stuckRepair'
  | 'rescuePlan'
  | 'postponePromptAcknowledgedKey'
  | 'abandonReason'
> {
  const internal = patch as TaskLifecycleTaskPatch & InternalLifecycleFields;
  const normalized: Pick<
    NormalizedLifecyclePatch,
    | 'supportSchemaVersion'
    | 'nextStartAt'
    | 'stuckRepair'
    | 'rescuePlan'
    | 'postponePromptAcknowledgedKey'
    | 'abandonReason'
  > = {};
  const keys = [
    'supportSchemaVersion',
    'nextStartAt',
    'stuckRepair',
    'rescuePlan',
    'postponePromptAcknowledgedKey',
    'abandonReason',
  ] as const;
  if (!keys.some(key => hasOwn(internal, key))) return normalized;
  if (
    internal.supportSchemaVersion !== undefined &&
    internal.supportSchemaVersion !== TASK_SUPPORT_SCHEMA_VERSION
  ) {
    throw new DomainError('INVALID_TASK_SUPPORT_SCHEMA');
  }
  normalized.supportSchemaVersion = TASK_SUPPORT_SCHEMA_VERSION;
  if (hasOwn(internal, 'nextStartAt')) {
    if (internal.nextStartAt !== null && typeof internal.nextStartAt !== 'string') {
      throw new DomainError('INVALID_TIMESTAMP');
    }
    normalized.nextStartAt = canonicalNullableLifecycleTimestamp(
      internal.nextStartAt as string | null,
    );
  }
  if (hasOwn(internal, 'stuckRepair')) {
    const repair = internal.stuckRepair === null
      ? null
      : normalizeStuckRepairRecord(internal.stuckRepair);
    if (internal.stuckRepair !== null && repair === null) {
      throw new DomainError('INVALID_STUCK_REPAIR');
    }
    normalized.stuckRepair = repair;
  }
  if (hasOwn(internal, 'rescuePlan')) {
    const plan = internal.rescuePlan === null
      ? null
      : normalizeTaskRescuePlan(internal.rescuePlan);
    if (internal.rescuePlan !== null && plan === null) {
      throw new DomainError('INVALID_RESCUE_PLAN');
    }
    normalized.rescuePlan = plan;
  }
  if (hasOwn(internal, 'postponePromptAcknowledgedKey')) {
    const value = internal.postponePromptAcknowledgedKey;
    if (value !== null && (typeof value !== 'string' || value.trim() === '')) {
      throw new DomainError('INVALID_POSTPONE_PROMPT_KEY');
    }
    normalized.postponePromptAcknowledgedKey = value === null
      ? null
      : (value as string).trim();
  }
  if (hasOwn(internal, 'abandonReason')) {
    if (
      internal.abandonReason !== null &&
      internal.abandonReason !== 'no_longer_needed'
    ) {
      throw new DomainError('INVALID_ABANDON_REASON');
    }
    normalized.abandonReason = internal.abandonReason as
      | 'no_longer_needed'
      | null;
  }
  return normalized;
}

const TASK_ARCHIVE_REASONS = new Set<TaskArchiveReason>([
  'NO_LONGER_NEEDED',
  'DUPLICATE',
  'PAUSED',
  'OTHER',
]);

function normalizeOrganizationPatch(
  patch: TaskLifecycleTaskPatch,
): Pick<
  NormalizedLifecyclePatch,
  | 'placementState'
  | 'archivedAt'
  | 'archiveReason'
  | 'lastMeaningfulActivityAt'
  | 'completionRewardConsumed'
> {
  const internal = patch as TaskLifecycleTaskPatch & InternalLifecycleFields;
  const normalized: Pick<
    NormalizedLifecyclePatch,
    | 'placementState'
    | 'archivedAt'
    | 'archiveReason'
    | 'lastMeaningfulActivityAt'
    | 'completionRewardConsumed'
  > = {};
  if (hasOwn(internal, 'placementState')) {
    if (
      internal.placementState !== 'QUADRANT' &&
      internal.placementState !== 'UNSORTED'
    ) {
      throw new DomainError('INVALID_PLACEMENT_STATE');
    }
    normalized.placementState = internal.placementState;
  }
  if (hasOwn(internal, 'archivedAt')) {
    if (internal.archivedAt !== null && typeof internal.archivedAt !== 'string') {
      throw new DomainError('INVALID_TIMESTAMP');
    }
    normalized.archivedAt = canonicalNullableLifecycleTimestamp(
      internal.archivedAt as string | null,
    );
  }
  if (hasOwn(internal, 'archiveReason')) {
    if (
      internal.archiveReason !== null &&
      !TASK_ARCHIVE_REASONS.has(internal.archiveReason as TaskArchiveReason)
    ) {
      throw new DomainError('INVALID_ARCHIVE_REASON');
    }
    normalized.archiveReason = internal.archiveReason as TaskArchiveReason | null;
  }
  if (hasOwn(internal, 'lastMeaningfulActivityAt')) {
    if (
      internal.lastMeaningfulActivityAt !== null &&
      typeof internal.lastMeaningfulActivityAt !== 'string'
    ) {
      throw new DomainError('INVALID_TIMESTAMP');
    }
    normalized.lastMeaningfulActivityAt = canonicalNullableLifecycleTimestamp(
      internal.lastMeaningfulActivityAt as string | null,
    );
  }
  if (hasOwn(internal, 'completionRewardConsumed')) {
    if (typeof internal.completionRewardConsumed !== 'boolean') {
      throw new DomainError('INVALID_COMPLETION_REWARD_STATE');
    }
    normalized.completionRewardConsumed = internal.completionRewardConsumed;
  }
  return normalized;
}

function normalizeCreateExtensions(
  input: TaskLifecycleTaskInput,
  important: boolean,
  urgent: boolean,
): Pick<
  NormalizedLifecycleInput,
  | 'prioritySchemaVersion'
  | 'importanceScore'
  | 'manualUrgencyScore'
  | 'urgencyMode'
  | 'repeatRule'
> {
  const internal = input as TaskLifecycleTaskInput & InternalLifecycleFields;
  const hasPriority =
    hasOwn(internal, 'prioritySchemaVersion') ||
    hasOwn(internal, 'importanceScore') ||
    hasOwn(internal, 'manualUrgencyScore') ||
    hasOwn(internal, 'urgencyMode');
  const extensions: Pick<
    NormalizedLifecycleInput,
    | 'prioritySchemaVersion'
    | 'importanceScore'
    | 'manualUrgencyScore'
    | 'urgencyMode'
    | 'repeatRule'
  > = {};
  if (hasPriority) {
    if (
      internal.prioritySchemaVersion !== undefined &&
      internal.prioritySchemaVersion !== TASK_PRIORITY_SCHEMA_VERSION
    ) {
      throw new DomainError('INVALID_PRIORITY_SCHEMA');
    }
    const legacy = legacyPriorityCoordinates(important, urgent);
    extensions.prioritySchemaVersion = TASK_PRIORITY_SCHEMA_VERSION;
    extensions.importanceScore = normalizePriorityScore(
      internal.importanceScore,
      legacy.importanceScore,
    );
    extensions.manualUrgencyScore = normalizePriorityScore(
      internal.manualUrgencyScore,
      legacy.manualUrgencyScore,
    );
    if (
      internal.urgencyMode !== undefined &&
      internal.urgencyMode !== 'manual' &&
      internal.urgencyMode !== 'hybrid'
    ) {
      throw new DomainError('INVALID_URGENCY_MODE');
    }
    extensions.urgencyMode =
      internal.urgencyMode === 'manual' || internal.urgencyMode === 'hybrid'
        ? internal.urgencyMode
        : 'manual';
  }
  if (hasOwn(internal, 'repeatRule')) {
    const repeatRule = normalizeRepeatRule(internal.repeatRule);
    if (internal.repeatRule != null && repeatRule === null) {
      throw new DomainError('INVALID_REPEAT_RULE');
    }
    extensions.repeatRule = repeatRule;
  }
  return extensions;
}

function normalizePatchExtensions(
  patch: TaskLifecycleTaskPatch,
): Pick<
  NormalizedLifecyclePatch,
  | 'prioritySchemaVersion'
  | 'importanceScore'
  | 'manualUrgencyScore'
  | 'urgencyMode'
  | 'repeatRule'
  | 'postponedCount'
> {
  const internal = patch as TaskLifecycleTaskPatch & InternalLifecycleFields;
  const normalized: Pick<
    NormalizedLifecyclePatch,
    | 'prioritySchemaVersion'
    | 'importanceScore'
    | 'manualUrgencyScore'
    | 'urgencyMode'
    | 'repeatRule'
    | 'postponedCount'
  > = {};
  if (hasOwn(internal, 'prioritySchemaVersion')) {
    if (internal.prioritySchemaVersion !== TASK_PRIORITY_SCHEMA_VERSION) {
      throw new DomainError('INVALID_PRIORITY_SCHEMA');
    }
    normalized.prioritySchemaVersion = TASK_PRIORITY_SCHEMA_VERSION;
  }
  if (hasOwn(internal, 'importanceScore')) {
    normalized.importanceScore = normalizePriorityScore(internal.importanceScore);
  }
  if (hasOwn(internal, 'manualUrgencyScore')) {
    normalized.manualUrgencyScore = normalizePriorityScore(
      internal.manualUrgencyScore,
    );
  }
  if (hasOwn(internal, 'urgencyMode')) {
    if (internal.urgencyMode !== 'manual' && internal.urgencyMode !== 'hybrid') {
      throw new DomainError('INVALID_URGENCY_MODE');
    }
    normalized.urgencyMode = internal.urgencyMode;
  }
  if (hasOwn(internal, 'repeatRule')) {
    const repeatRule = normalizeRepeatRule(internal.repeatRule);
    if (internal.repeatRule != null && repeatRule === null) {
      throw new DomainError('INVALID_REPEAT_RULE');
    }
    normalized.repeatRule = repeatRule;
  }
  if (hasOwn(internal, 'postponedCount')) {
    if (
      typeof internal.postponedCount !== 'number' ||
      !Number.isSafeInteger(internal.postponedCount) ||
      internal.postponedCount < 0
    ) {
      throw new DomainError('INVALID_POSTPONED_COUNT');
    }
    normalized.postponedCount = internal.postponedCount;
  }
  return normalized;
}

function validateQuadrantFlags(important: boolean, urgent: boolean): void {
  if (typeof important !== 'boolean' || typeof urgent !== 'boolean') {
    throw new DomainError('INVALID_QUADRANT_FLAG');
  }
}

function validateLifecycleTimeRange(
  scheduledStartAt: string | null,
  dueAt: string | null,
): void {
  if (
    scheduledStartAt !== null &&
    dueAt !== null &&
    Date.parse(scheduledStartAt) > Date.parse(dueAt)
  ) {
    throw new DomainError('INVALID_TIME_RANGE');
  }
}

function normalizePlannedAliases(
  startAt: string | null | undefined,
  scheduledStartAt: string | null | undefined,
  startAtPresent: boolean,
  scheduledStartAtPresent: boolean,
): {present: boolean; value: string | null} {
  const hasLegacy = startAtPresent && startAt !== undefined;
  const hasCanonical =
    scheduledStartAtPresent && scheduledStartAt !== undefined;
  if (!hasLegacy && !hasCanonical) {
    return {present: false, value: null};
  }
  const legacy = hasLegacy
    ? canonicalNullableLifecycleTimestamp(startAt ?? null)
    : null;
  const canonical = hasCanonical
    ? canonicalNullableLifecycleTimestamp(scheduledStartAt ?? null)
    : null;
  if (hasLegacy && hasCanonical && legacy !== canonical) {
    throw new DomainError('SCHEDULED_START_CONFLICT');
  }
  return {present: true, value: hasCanonical ? canonical : legacy};
}

function normalizeLifecycleCreateInput(
  input: TaskLifecycleTaskInput,
): NormalizedLifecycleInput {
  const title = normalizedLifecycleTitle(input.title);
  const description = normalizedLifecycleDescription(input.description);
  const important = input.important;
  const urgent = input.urgent;
  validateQuadrantFlags(important, urgent);
  const placementState = input.placementState ?? 'QUADRANT';
  if (placementState !== 'QUADRANT' && placementState !== 'UNSORTED') {
    throw new DomainError('INVALID_PLACEMENT_STATE');
  }
  const planned = normalizePlannedAliases(
    input.startAt,
    input.scheduledStartAt,
    hasOwn(input, 'startAt'),
    hasOwn(input, 'scheduledStartAt'),
  );
  const dueAt =
    input.dueAt === undefined
      ? null
      : canonicalNullableLifecycleTimestamp(input.dueAt);
  const estimatedMinutes =
    input.estimatedMinutes === undefined
      ? null
      : normalizedEstimatedMinutes(input.estimatedMinutes);
  const firstStep =
    input.firstStep === undefined
      ? null
      : normalizedFirstStep(input.firstStep);
  const progress =
    (input as TaskLifecycleTaskInput & {progress?: TaskProgress}).progress === undefined
      ? undefined
      : normalizedProgress(
          (input as TaskLifecycleTaskInput & {progress: TaskProgress}).progress,
        );
  const scheduledStartAt = planned.present ? planned.value : null;
  validateLifecycleTimeRange(scheduledStartAt, dueAt);
  return {
    title,
    description,
    important,
    urgent,
    scheduledStartAt,
    dueAt,
    estimatedMinutes,
    firstStep,
    placementState,
    ...(progress === undefined ? {} : {progress}),
    ...normalizeCreateExtensions(input, important, urgent),
  };
}

function normalizeLifecyclePatch(
  taskId: string,
  patch: TaskLifecycleTaskPatch,
): NormalizedLifecyclePatch {
  const normalized: NormalizedLifecyclePatch = {};
  if (hasOwn(patch, 'title') && patch.title !== undefined) {
    normalized.title = normalizedLifecycleTitle(patch.title);
  }
  if (hasOwn(patch, 'description') && patch.description !== undefined) {
    normalized.description = normalizedLifecycleDescription(patch.description);
  }
  if (hasOwn(patch, 'important') && patch.important !== undefined) {
    if (typeof patch.important !== 'boolean') {
      throw new DomainError('INVALID_QUADRANT_FLAG');
    }
    normalized.important = patch.important;
  }
  if (hasOwn(patch, 'urgent') && patch.urgent !== undefined) {
    if (typeof patch.urgent !== 'boolean') {
      throw new DomainError('INVALID_QUADRANT_FLAG');
    }
    normalized.urgent = patch.urgent;
  }
  const planned = normalizePlannedAliases(
    patch.startAt,
    patch.scheduledStartAt,
    hasOwn(patch, 'startAt'),
    hasOwn(patch, 'scheduledStartAt'),
  );
  if (planned.present) {
    normalized.scheduledStartAt = planned.value;
  }
  if (hasOwn(patch, 'dueAt') && patch.dueAt !== undefined) {
    normalized.dueAt = canonicalNullableLifecycleTimestamp(patch.dueAt);
  }
  if (
    hasOwn(patch, 'estimatedMinutes') &&
    patch.estimatedMinutes !== undefined
  ) {
    normalized.estimatedMinutes = normalizedEstimatedMinutes(
      patch.estimatedMinutes,
    );
  }
  if (hasOwn(patch, 'firstStep') && patch.firstStep !== undefined) {
    normalized.firstStep = normalizedFirstStep(patch.firstStep);
  }
  const progressPatch = patch as TaskLifecycleTaskPatch & {progress?: TaskProgress};
  if (hasOwn(progressPatch, 'progress') && progressPatch.progress !== undefined) {
    normalized.progress = normalizedProgress(progressPatch.progress);
  }
  if (
    hasOwn(normalized, 'scheduledStartAt') &&
    hasOwn(normalized, 'dueAt')
  ) {
    validateLifecycleTimeRange(
      normalized.scheduledStartAt ?? null,
      normalized.dueAt ?? null,
    );
  }
  return {
    ...normalized,
    ...normalizePatchExtensions(patch),
    ...normalizeSupportPatch(patch),
    ...normalizeOrganizationPatch(patch),
    ...normalizeExecutionPatch(taskId, patch),
  };
}

function decorateNewLifecycleTask(
  task: Task,
  normalized: NormalizedLifecycleInput,
): Task {
  const extended = task as TaskWithPriority;
  if (
    normalized.prioritySchemaVersion !== undefined &&
    normalized.importanceScore !== undefined &&
    normalized.manualUrgencyScore !== undefined &&
    normalized.urgencyMode !== undefined
  ) {
    const coordinates = {
      importanceScore: normalized.importanceScore,
      manualUrgencyScore: normalized.manualUrgencyScore,
      urgencyMode: normalized.urgencyMode,
    } as const;
    const legacy = deriveLegacyPriorityFields(
      coordinates,
      task.dueAt,
      task.createdAt,
    );
    task.important = legacy.important;
    task.urgent = legacy.urgent;
    Object.assign(extended, {
      prioritySchemaVersion: TASK_PRIORITY_SCHEMA_VERSION,
      ...coordinates,
    });
  }
  if (normalized.repeatRule !== undefined) {
    Object.assign(extended, {repeatRule: normalized.repeatRule});
    if (normalized.repeatRule !== null) {
      Object.assign(extended, {
        repeatSeriesId: task.id,
        repeatOccurrenceKey: repeatBusinessKey(
          task.id,
          task.dueAt ?? task.createdAt,
        ),
      });
    }
  }
  Object.assign(task, {
    placementState: normalized.placementState,
    archivedAt: null,
    archiveReason: null,
    lastMeaningfulActivityAt: task.createdAt,
    completionRewardConsumed: false,
  });
  return task;
}

function normalizeLifecycleRescheduleInput(
  input: TaskLifecycleRescheduleInput,
): NormalizedLifecyclePatch {
  if (input.scheduledStartAt === undefined) {
    throw new DomainError('INVALID_TIMESTAMP');
  }
  const normalized: NormalizedLifecyclePatch = {
    scheduledStartAt: canonicalNullableLifecycleTimestamp(
      input.scheduledStartAt,
    ),
  };
  if (hasOwn(input, 'dueAt') && input.dueAt !== undefined) {
    normalized.dueAt = canonicalNullableLifecycleTimestamp(input.dueAt);
    validateLifecycleTimeRange(
      normalized.scheduledStartAt ?? null,
      normalized.dueAt,
    );
  }
  return normalized;
}

function normalizedDelayMinutes(minutes: number): number {
  if (
    !Number.isSafeInteger(minutes) ||
    minutes <= 0 ||
    Object.is(minutes, -0)
  ) {
    throw new DomainError('INVALID_DELAY_MINUTES');
  }
  return minutes;
}

function cloneLifecycleTask(task: Task): Task {
  return {
    ...task,
    subtasks: task.subtasks.map(subtask => ({...subtask})),
    ...(task.steps === undefined
      ? {}
      : {steps: task.steps.map(step => ({...step}))}),
    ...(task.plannedWorkSessions === undefined
      ? {}
      : {
          plannedWorkSessions: task.plannedWorkSessions.map(session => ({
            ...session,
          })),
        }),
  };
}

function cloneLifecycleCompletion(
  result: TaskCompletionResult,
): TaskCompletionResult {
  return {task: cloneLifecycleTask(result.task), points: result.points};
}

function requireLifecycleOperationId(
  operation: TaskLifecycleOperationOptions,
): string {
  const operationId = operation.operationId;
  if (typeof operationId !== 'string' || operationId.trim() === '') {
    throw new DomainError('OPERATION_ID_REQUIRED');
  }
  return operationId.trim();
}

function runLifecycleMutation<T>(
  registry: Map<string, LifecycleOperationRecord>,
  durableCoordinator: DurableLifecycleCoordinator | null,
  now: () => string,
  operationId: string,
  kind: LifecycleMutationKind,
  commandFingerprint: string,
  fallbackWork: () => Promise<T>,
  durableWork: (
    transaction: LifecycleTransaction,
    reserveClock: () => string,
  ) => Promise<T>,
  cloneResult: (result: T) => T,
): Promise<T> {
  const existing = registry.get(operationId);
  if (existing !== undefined) {
    if (
      existing.kind !== kind ||
      existing.fingerprint !== commandFingerprint
    ) {
      return Promise.reject(new DomainError('OPERATION_ID_CONFLICT'));
    }
    return (existing.result as Promise<T>).then(cloneResult);
  }

  const result = Promise.resolve().then(() => {
    if (durableCoordinator === null) {
      return fallbackWork();
    }
    const reserveClock = (): string => canonicalLifecycleTimestamp(now());
    return durableCoordinator.runDurableLifecycleOperation(
      {operationId, kind, fingerprint: commandFingerprint},
      transaction =>
        unwrapTransactionWithoutCommit(
          Promise.resolve().then(() => durableWork(transaction, reserveClock)),
        ),
    );
  });
  const record: LifecycleOperationRecord = {
    kind,
    fingerprint: commandFingerprint,
    result,
  };
  registry.set(operationId, record);
  void result.then(
    () => {
      if (
        durableCoordinator !== null &&
        registry.get(operationId) === record
      ) {
        registry.delete(operationId);
      }
    },
    () => {
      if (registry.get(operationId) === record) {
        registry.delete(operationId);
      }
    },
  );
  return result.then(cloneResult);
}

function errorIsStorageReadFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  const code = error.code;
  return typeof code === 'string' && code.endsWith('READ_FAILED');
}

function runLifecycleTransaction<T>(
  repository: TaskRepository,
  now: () => string,
  work: (
    transaction: LifecycleTransaction,
    reserveClock: () => string,
  ) => Promise<T>,
): Promise<T> {
  let clockReserved = false;
  const reserveClock = (): string => {
    clockReserved = true;
    return canonicalLifecycleTimestamp(now());
  };
  return unwrapTransactionWithoutCommit(
    repository.transaction(transaction => work(transaction, reserveClock)),
  ).catch((error: unknown) => {
    if (!clockReserved && errorIsStorageReadFailure(error)) {
      // A failed valid attempt still consumes its externally generated clock
      // value, but the failed value never enters staged or durable data.
      void now();
    }
    throw error;
  });
}

function currentPlannedStart(task: Task): string | null {
  return task.scheduledStartAt === undefined
    ? task.startAt
    : task.scheduledStartAt;
}

function requireMutableLifecycleTask(task: Task | null): Task {
  if (task === null) {
    throw new DomainError('TASK_NOT_FOUND');
  }
  if (task.deletedAt !== null) {
    throw new DomainError('TASK_DELETED');
  }
  return task;
}

function compareNullableLifecycleTime(
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

function compareLifecycleRecommendation(left: Task, right: Task): number {
  const statusComparison =
    (left.status === 'in_progress' ? 0 : 1) -
    (right.status === 'in_progress' ? 0 : 1);
  if (statusComparison !== 0) {
    return statusComparison;
  }
  const quadrantComparison =
    QUADRANT_POSITION[getQuadrant(left.important, left.urgent)].order -
    QUADRANT_POSITION[getQuadrant(right.important, right.urgent)].order;
  if (quadrantComparison !== 0) {
    return quadrantComparison;
  }
  const plannedComparison = compareNullableLifecycleTime(
    currentPlannedStart(left),
    currentPlannedStart(right),
  );
  if (plannedComparison !== 0) {
    return plannedComparison;
  }
  const dueComparison = compareNullableLifecycleTime(left.dueAt, right.dueAt);
  if (dueComparison !== 0) {
    return dueComparison;
  }
  const creationComparison = Date.parse(left.createdAt) - Date.parse(right.createdAt);
  if (creationComparison !== 0) {
    return creationComparison;
  }
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function lifecycleRecommendation(
  tasks: readonly Task[],
  nowInput: string,
): Task | null {
  const nowMilliseconds = Date.parse(canonicalLifecycleTimestamp(nowInput));
  const eligible = tasks.filter(task => {
    const planned = currentPlannedStart(task);
    return (
      task.deletedAt === null &&
      isTaskInQuadrants(task) &&
      (task.status === 'pending' || task.status === 'in_progress') &&
      (planned === null || Date.parse(planned) <= nowMilliseconds)
    );
  });
  if (eligible.length === 0) {
    return null;
  }
  const recommendation = eligible.slice().sort(compareLifecycleRecommendation)[0];
  return recommendation === undefined ? null : cloneLifecycleTask(recommendation);
}

export function createTaskLifecycleService(
  options: CreateTaskLifecycleServiceOptions,
): TaskLifecycleService {
  const {repository, now, idGenerator} = options;
  const operationRegistry = lifecycleRegistryFor(repository);
  const durableCoordinator = durableLifecycleCoordinatorFor(repository);

  function runTransactionalLifecycleMutation<T>(
    operationId: string,
    kind: LifecycleMutationKind,
    commandFingerprint: string,
    work: (
      transaction: LifecycleTransaction,
      reserveClock: () => string,
    ) => Promise<T>,
    cloneResult: (result: T) => T,
  ): Promise<T> {
    return runLifecycleMutation(
      operationRegistry,
      durableCoordinator,
      now,
      operationId,
      kind,
      commandFingerprint,
      () => runLifecycleTransaction(repository, now, work),
      work,
      cloneResult,
    );
  }

  const lifecycle: TaskLifecycleService = {
    complete(taskId, operation) {
      const operationId = requireLifecycleOperationId(operation);
      return runTransactionalLifecycleMutation(
        operationId,
        'complete',
        fingerprint([taskId]),
        async (transaction, reserveClock) => {
            const current = requireMutableLifecycleTask(
              await transaction.getById(taskId, {includeDeleted: true}),
            );
            if (current.status === 'completed') {
              throw new TransactionWithoutCommit({
                task: cloneLifecycleTask(current),
                points: 0,
              });
            }
            if (current.status === 'cancelled') {
              throw new DomainError('TERMINAL_TASK');
            }
            if (!isTaskInQuadrants(current)) {
              throw new DomainError('TASK_REQUIRES_PLACEMENT');
            }
            if (current.subtasks.some(subtask => subtask.status !== 'completed')) {
              throw new DomainError('UNFINISHED_SUBTASKS');
            }
            const completedAt = reserveClock();
            const completed: Task = cancelRemainingPlannedWork({
              ...current,
              status: 'completed',
              startedAt: current.startedAt ?? completedAt,
              completedAt,
              updatedAt: completedAt,
            }, completedAt);
            const award = awardCompletionScore(completed, completedAt);
            const persisted = await transaction.update(taskId, taskPatch(award.task));
            const repeatRule = normalizeRepeatRule(
              (current as TaskWithPriority).repeatRule,
            );
            if (repeatRule !== null) {
              const seriesId =
                (current as TaskWithPriority).repeatSeriesId ?? current.id;
              const nextDueAt = nextRepeatDueAt(
                current.dueAt ?? completedAt,
                repeatRule,
              );
              const occurrenceKey = repeatBusinessKey(seriesId, nextDueAt);
              const existing = (await transaction.list({includeDeleted: true}))
                .some(candidate =>
                  (candidate as TaskWithPriority).repeatOccurrenceKey ===
                  occurrenceKey,
                );
              if (!existing) {
                const next = buildNextRepeatedTask(
                  current,
                  completedAt,
                  idGenerator(),
                );
                if (next !== null) {
                  await transaction.create(next);
                }
              }
            }
            return {task: persisted, points: award.points};
          },
        cloneLifecycleCompletion,
      );
    },

    undoComplete(taskId, restoreStatus, operation) {
      const operationId = requireLifecycleOperationId(operation);
      return runTransactionalLifecycleMutation(
        operationId,
        'undoComplete',
        fingerprint([taskId, restoreStatus]),
        async (transaction, reserveClock) => {
          const current = requireMutableLifecycleTask(
            await transaction.getById(taskId, {includeDeleted: true}),
          );
          if (current.status !== 'completed') {
            throw new DomainError('TASK_NOT_COMPLETED');
          }
          return transaction.update(taskId, {
            status: restoreStatus,
            startedAt: restoreStatus === 'pending' ? null : current.startedAt,
            completedAt: null,
            score: null,
            scoreAwardedAt: null,
            updatedAt: reserveClock(),
          });
        },
        cloneLifecycleTask,
      );
    },

    restoreCompleted(taskId, operation) {
      const operationId = requireLifecycleOperationId(operation);
      return runTransactionalLifecycleMutation(
        operationId,
        'restoreCompleted',
        fingerprint([taskId]),
        async (transaction, reserveClock) => {
          const current = requireMutableLifecycleTask(
            await transaction.getById(taskId, {includeDeleted: true}),
          );
          if (current.status !== 'completed') {
            throw new DomainError('TASK_NOT_COMPLETED');
          }
          const restored = restoreCompletedTask(current, reserveClock());
          return transaction.update(taskId, restored);
        },
        cloneLifecycleTask,
      );
    },

    create(input, operation) {
      const operationId = requireLifecycleOperationId(operation);
      const normalized = normalizeLifecycleCreateInput(input);
      return runLifecycleMutation(
        operationRegistry,
        durableCoordinator,
        now,
        operationId,
        'create',
        fingerprint([normalized]),
        async () => {
          const id = idGenerator();
          const createdAt = canonicalLifecycleTimestamp(now());
          const task: Task = {
            id,
            title: normalized.title,
            description: normalized.description,
            important: normalized.important,
            urgent: normalized.urgent,
            status: 'pending',
            startAt: normalized.scheduledStartAt,
            scheduledStartAt: normalized.scheduledStartAt,
            dueAt: normalized.dueAt,
            estimatedMinutes: normalized.estimatedMinutes,
            firstStep: normalized.firstStep,
            createdAt,
            updatedAt: createdAt,
            startedAt: null,
            completedAt: null,
            deletedAt: null,
            score: null,
            scoreAwardedAt: null,
            subtasks: [],
          };
          if (normalized.progress !== undefined) {
            (task as Task & {progress?: TaskProgress}).progress = normalized.progress;
          }
          return repository.create(decorateNewLifecycleTask(task, normalized));
        },
        async (transaction, reserveClock) => {
          const id = idGenerator();
          const createdAt = reserveClock();
          const task: Task = {
            id,
            title: normalized.title,
            description: normalized.description,
            important: normalized.important,
            urgent: normalized.urgent,
            status: 'pending',
            startAt: normalized.scheduledStartAt,
            scheduledStartAt: normalized.scheduledStartAt,
            dueAt: normalized.dueAt,
            estimatedMinutes: normalized.estimatedMinutes,
            firstStep: normalized.firstStep,
            createdAt,
            updatedAt: createdAt,
            startedAt: null,
            completedAt: null,
            deletedAt: null,
            score: null,
            scoreAwardedAt: null,
            subtasks: [],
          };
          if (normalized.progress !== undefined) {
            (task as Task & {progress?: TaskProgress}).progress = normalized.progress;
          }
          return transaction.create(decorateNewLifecycleTask(task, normalized));
        },
        cloneLifecycleTask,
      );
    },

    delay(taskId, input, operation) {
      const operationId = requireLifecycleOperationId(operation);
      const minutes = normalizedDelayMinutes(input.minutes);
      return runTransactionalLifecycleMutation(
        operationId,
        'delay',
        fingerprint([taskId, minutes]),
        async (transaction, reserveClock) => {
            const current = requireMutableLifecycleTask(
              await transaction.getById(taskId, {includeDeleted: true}),
            );
            if (current.status === 'completed' || current.status === 'cancelled') {
              throw new DomainError('TERMINAL_TASK');
            }
            const updatedAt = reserveClock();
            const currentStart = currentPlannedStart(current);
            const baseMilliseconds = Math.max(
              currentStart === null ? Number.NEGATIVE_INFINITY : Date.parse(currentStart),
              Date.parse(updatedAt),
            );
            const delayedMilliseconds = baseMilliseconds + minutes * 60_000;
            if (
              !Number.isFinite(delayedMilliseconds) ||
              delayedMilliseconds < -8_640_000_000_000_000 ||
              delayedMilliseconds > 8_640_000_000_000_000
            ) {
              throw new DomainError('INVALID_TIME_RANGE');
            }
            const scheduledStartAt = new Date(delayedMilliseconds).toISOString();
            validateLifecycleTimeRange(scheduledStartAt, current.dueAt);
            return transaction.update(taskId, {
              startAt: scheduledStartAt,
              scheduledStartAt,
              updatedAt,
            });
          },
        cloneLifecycleTask,
      );
    },

    async getById(taskId, readOptions) {
      const task = await repository.getById(taskId, readOptions);
      return task === null ? null : cloneLifecycleTask(task);
    },

    async getQuadrantProjection() {
      const observedNow = now();
      return projectTaskQuadrantsAt(await repository.list(), observedNow);
    },

    async getQueryResult() {
      const snapshot = await repository.list();
      const observedNow = now();
      const recommendation = lifecycleRecommendation(snapshot, observedNow);
      return {
        tasks: snapshot.map(cloneLifecycleTask),
        recommendation,
        quadrants: projectTaskQuadrantsAt(snapshot, observedNow),
      };
    },

    async getRecommendation() {
      return lifecycleRecommendation(await repository.list(), now());
    },

    async list(readOptions) {
      return (await repository.list(readOptions)).map(cloneLifecycleTask);
    },

    reschedule(taskId, input, operation) {
      const operationId = requireLifecycleOperationId(operation);
      const normalized = normalizeLifecycleRescheduleInput(input);
      return runTransactionalLifecycleMutation(
        operationId,
        'reschedule',
        fingerprint([taskId, normalized]),
        async (transaction, reserveClock) => {
            const current = requireMutableLifecycleTask(
              await transaction.getById(taskId, {includeDeleted: true}),
            );
            if (current.status === 'completed' || current.status === 'cancelled') {
              throw new DomainError('TERMINAL_TASK');
            }
            const scheduledStartAt = normalized.scheduledStartAt ?? null;
            const dueAt = hasOwn(normalized, 'dueAt')
              ? normalized.dueAt ?? null
              : current.dueAt;
            validateLifecycleTimeRange(scheduledStartAt, dueAt);
            const patch: Partial<Omit<Task, 'id'>> & {progress?: TaskProgress} = {
              startAt: scheduledStartAt,
              scheduledStartAt,
              updatedAt: reserveClock(),
            };
            if (hasOwn(normalized, 'dueAt')) {
              patch.dueAt = dueAt;
            }
            return transaction.update(taskId, patch);
          },
        cloneLifecycleTask,
      );
    },

    softDelete(taskId, operation) {
      const operationId = requireLifecycleOperationId(operation);
      return runTransactionalLifecycleMutation(
        operationId,
        'softDelete',
        fingerprint([taskId]),
        async (transaction, reserveClock) => {
            const current = await transaction.getById(taskId, {
              includeDeleted: true,
            });
            if (current === null) {
              throw new DomainError('TASK_NOT_FOUND');
            }
            if (current.deletedAt !== null) {
              throw new TransactionWithoutCommit(cloneLifecycleTask(current));
            }
            return transaction.softDelete(taskId, reserveClock());
          },
        cloneLifecycleTask,
      );
    },

    update(taskId, patchInput, operation) {
      const operationId = requireLifecycleOperationId(operation);
      const normalized = normalizeLifecyclePatch(taskId, patchInput);
      return runTransactionalLifecycleMutation(
        operationId,
        'update',
        fingerprint([taskId, normalized]),
        async (transaction, reserveClock) => {
            const current = requireMutableLifecycleTask(
              await transaction.getById(taskId, {includeDeleted: true}),
            );
            const finalScheduledStartAt = hasOwn(normalized, 'scheduledStartAt')
              ? normalized.scheduledStartAt ?? null
              : currentPlannedStart(current);
            const finalDueAt = hasOwn(normalized, 'dueAt')
              ? normalized.dueAt ?? null
              : current.dueAt;
            validateLifecycleTimeRange(finalScheduledStartAt, finalDueAt);
            const finalNextStartAt = hasOwn(normalized, 'nextStartAt')
              ? normalized.nextStartAt ?? null
              : nextStartAtForTask(current);
            validateLifecycleTimeRange(finalNextStartAt, finalDueAt);

            const updatedAt = reserveClock();
            const patch: Partial<Omit<Task, 'id'>> & TaskPriorityFieldsPatch = {
              updatedAt,
            };
            if (normalized.title !== undefined) {
              patch.title = normalized.title;
            }
            if (normalized.description !== undefined) {
              patch.description = normalized.description;
            }
            if (normalized.important !== undefined) {
              patch.important = normalized.important;
            }
            if (normalized.urgent !== undefined) {
              patch.urgent = normalized.urgent;
            }
            if (hasOwn(normalized, 'scheduledStartAt')) {
              patch.startAt = finalScheduledStartAt;
              patch.scheduledStartAt = finalScheduledStartAt;
            }
            if (hasOwn(normalized, 'dueAt')) {
              patch.dueAt = finalDueAt;
            }
            if (normalized.estimatedMinutes !== undefined) {
              patch.estimatedMinutes = normalized.estimatedMinutes;
            }
            if (normalized.firstStep !== undefined) {
              if (
                current.progressSource === 'STEPS' &&
                normalized.steps === undefined
              ) {
                throw new DomainError('FIRST_STEP_IS_PROJECTED');
              }
              patch.firstStep = normalized.firstStep;
            }
            if (normalized.progress !== undefined) {
              patch.progress = normalized.progress;
            }
            const currentPriority = priorityCoordinatesForTask(current);
            const hasPriorityPatch =
              normalized.prioritySchemaVersion !== undefined ||
              normalized.importanceScore !== undefined ||
              normalized.manualUrgencyScore !== undefined ||
              normalized.urgencyMode !== undefined;
            if (hasPriorityPatch) {
              const coordinates = {
                importanceScore:
                  normalized.importanceScore ?? currentPriority.importanceScore,
                manualUrgencyScore:
                  normalized.manualUrgencyScore ??
                  currentPriority.manualUrgencyScore,
                urgencyMode:
                  normalized.urgencyMode ?? currentPriority.urgencyMode,
              };
              Object.assign(patch, {
                prioritySchemaVersion: TASK_PRIORITY_SCHEMA_VERSION,
                ...coordinates,
              });
              const legacy = deriveLegacyPriorityFields(
                coordinates,
                finalDueAt,
                updatedAt,
              );
              patch.important = legacy.important;
              patch.urgent = legacy.urgent;
            } else if (
              hasTaskPriorityFields(current) &&
              hasOwn(normalized, 'dueAt')
            ) {
              const legacy = deriveLegacyPriorityFields(
                currentPriority,
                finalDueAt,
                updatedAt,
              );
              patch.important = legacy.important;
              patch.urgent = legacy.urgent;
            }
            if (normalized.repeatRule !== undefined) {
              patch.repeatRule = normalized.repeatRule;
              if (normalized.repeatRule !== null) {
                const extended = current as TaskWithPriority;
                patch.repeatSeriesId = extended.repeatSeriesId ?? current.id;
                patch.repeatOccurrenceKey =
                  extended.repeatOccurrenceKey ??
                  repeatBusinessKey(current.id, current.dueAt ?? current.createdAt);
              }
            }
            if (normalized.postponedCount !== undefined) {
              patch.postponedCount = normalized.postponedCount;
            }
            if (normalized.supportSchemaVersion !== undefined) {
              patch.supportSchemaVersion = TASK_SUPPORT_SCHEMA_VERSION;
            }
            if (hasOwn(normalized, 'nextStartAt')) {
              patch.nextStartAt = finalNextStartAt;
            }
            if (normalized.stuckRepair !== undefined) {
              patch.stuckRepair = normalized.stuckRepair;
            }
            if (normalized.rescuePlan !== undefined) {
              if (
                normalized.rescuePlan !== null &&
                normalized.rescuePlan.taskId !== taskId
              ) {
                throw new DomainError('INVALID_RESCUE_PLAN_TASK');
              }
              patch.rescuePlan = normalized.rescuePlan;
            }
            if (normalized.postponePromptAcknowledgedKey !== undefined) {
              patch.postponePromptAcknowledgedKey =
                normalized.postponePromptAcknowledgedKey;
            }
            if (normalized.abandonReason !== undefined) {
              patch.abandonReason = normalized.abandonReason;
            }
            if (normalized.placementState !== undefined) {
              patch.placementState = normalized.placementState;
            }
            if (hasOwn(normalized, 'archivedAt')) {
              patch.archivedAt = normalized.archivedAt ?? null;
            }
            if (hasOwn(normalized, 'archiveReason')) {
              patch.archiveReason = normalized.archiveReason ?? null;
            }
            if (hasOwn(normalized, 'lastMeaningfulActivityAt')) {
              patch.lastMeaningfulActivityAt =
                normalized.lastMeaningfulActivityAt ?? null;
            }
            if (normalized.completionRewardConsumed !== undefined) {
              patch.completionRewardConsumed =
                normalized.completionRewardConsumed;
            }
            if (hasOwn(normalized, 'completionDefinition')) {
              patch.completionDefinition = normalized.completionDefinition ?? null;
            }
            if (normalized.progressSource !== undefined) {
              patch.progressSource = normalized.progressSource;
            }
            if (normalized.steps !== undefined) {
              patch.steps = normalized.steps.map(step => ({...step}));
              patch.firstStep =
                normalized.steps.find(step => step.status === 'ACTIVE')?.title ?? null;
              const projected = {
                ...current,
                ...patch,
                progressSource: normalized.progressSource ?? current.progressSource,
                steps: patch.steps,
              } as Task;
              if (projected.progressSource === 'STEPS') {
                patch.progress = taskStepProgress(projected);
              }
            }
            if (normalized.plannedWorkSessions !== undefined) {
              patch.plannedWorkSessions = normalized.plannedWorkSessions.map(session => ({
                ...session,
              }));
            }
            if (hasOwn(normalized, 'deliveryRiskDismissedAt')) {
              patch.deliveryRiskDismissedAt = normalized.deliveryRiskDismissedAt ?? null;
            }
            if (hasOwn(normalized, 'deliveryRiskDismissedBand')) {
              patch.deliveryRiskDismissedBand =
                normalized.deliveryRiskDismissedBand ?? null;
            }
            return transaction.update(taskId, patch);
          },
        cloneLifecycleTask,
      );
    },
  };
  return lifecycle;
}

type OperationRecord = {
  request: OperationRegistryRequest;
  result: Promise<unknown>;
  state: 'in_flight' | 'settled';
};

export const DEFAULT_OPERATION_REGISTRY_CAPACITY = 128;

const defaultOperationRegistries = new WeakMap<TaskRepository, OperationRegistry>();

function sameOperationRequest(
  left: OperationRegistryRequest,
  right: OperationRegistryRequest,
): boolean {
  return (
    left.operationId === right.operationId &&
    left.kind === right.kind &&
    left.fingerprint === right.fingerprint
  );
}

export function createOperationRegistry(options: {
  maxEntries: number;
}): OperationRegistry {
  const {maxEntries} = options;
  if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
    throw new DomainError('INVALID_OPERATION_REGISTRY_CAPACITY');
  }

  const records = new Map<string, OperationRecord>();

  function touch(operationId: string, record: OperationRecord): void {
    if (records.get(operationId) !== record) {
      return;
    }
    records.delete(operationId);
    records.set(operationId, record);
  }

  function evictLeastRecentlyUsedSettled(): boolean {
    for (const [operationId, record] of records) {
      if (record.state === 'settled') {
        records.delete(operationId);
        return true;
      }
    }
    return false;
  }

  return {
    get size() {
      return records.size;
    },

    run<T>(
      request: OperationRegistryRequest,
      work: () => Promise<T>,
    ): Promise<T> {
      if (
        typeof request.operationId !== 'string' ||
        request.operationId.trim() === ''
      ) {
        return Promise.reject(new DomainError('OPERATION_ID_REQUIRED'));
      }

      const existing = records.get(request.operationId);
      if (existing !== undefined) {
        if (!sameOperationRequest(existing.request, request)) {
          return Promise.reject(new DomainError('OPERATION_ID_CONFLICT'));
        }
        if (existing.state === 'settled') {
          touch(request.operationId, existing);
        }
        return existing.result as Promise<T>;
      }

      if (records.size >= maxEntries && !evictLeastRecentlyUsedSettled()) {
        return Promise.reject(new DomainError('OPERATION_REGISTRY_CAPACITY'));
      }

      // Invoke work after registration so concurrent duplicates share the same
      // promise before any ID generation or repository mutation can begin.
      const result = Promise.resolve().then(work);
      const record: OperationRecord = {
        request: {...request},
        result,
        state: 'in_flight',
      };
      records.set(request.operationId, record);

      void result.then(
        () => {
          if (records.get(request.operationId) === record) {
            record.state = 'settled';
            touch(request.operationId, record);
          }
        },
        () => {
          if (records.get(request.operationId) === record) {
            records.delete(request.operationId);
          }
        },
      );

      return result;
    },
  };
}

function defaultOperationRegistryFor(
  repository: TaskRepository,
): OperationRegistry {
  const existing = defaultOperationRegistries.get(repository);
  if (existing !== undefined) {
    return existing;
  }

  const created = createOperationRegistry({
    maxEntries: DEFAULT_OPERATION_REGISTRY_CAPACITY,
  });
  defaultOperationRegistries.set(repository, created);
  return created;
}

export function getDefaultOperationRegistryDiagnostics(
  repository: TaskRepository,
): Readonly<{size: number; maxEntries: number}> {
  return {
    size: defaultOperationRegistryFor(repository).size,
    maxEntries: DEFAULT_OPERATION_REGISTRY_CAPACITY,
  };
}

function requireOperationId(operation: OperationOptions): string {
  const operationId = operation.operationId;
  if (typeof operationId !== 'string' || operationId.trim() === '') {
    throw new DomainError('OPERATION_ID_REQUIRED');
  }
  return operationId;
}

function runIdempotentMutation<T>(
  registry: OperationRegistry,
  kind: OperationMutationKind,
  operation: OperationOptions,
  createFingerprint: () => string,
  work: () => Promise<T>,
): Promise<T> {
  const operationId = requireOperationId(operation);
  return registry.run(
    {
      operationId,
      kind,
      fingerprint: createFingerprint(),
    },
    work,
  );
}

function normalizedRequiredTitle(value: string, errorCode: string): string {
  const title = typeof value === 'string' ? value.trim() : '';
  if (title === '') {
    throw new DomainError(errorCode);
  }
  return title;
}

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

function optionalCanonicalTimestamp(
  value: string | null | undefined,
): string | null {
  return value == null ? null : canonicalTimestamp(value);
}

function fingerprint(parts: readonly unknown[]): string {
  return JSON.stringify(parts);
}

function createTaskFingerprint(input: TaskInput): string {
  return fingerprint([
    normalizedRequiredTitle(input.title, 'TITLE_REQUIRED'),
    input.description ?? '',
    input.important,
    input.urgent,
    optionalCanonicalTimestamp(input.startAt),
    optionalCanonicalTimestamp(input.dueAt),
  ]);
}

function addFirstStepFingerprint(
  taskId: string,
  input: FirstStepInput,
): string {
  return fingerprint([
    taskId,
    normalizedRequiredTitle(input.title, 'SUBTASK_TITLE_REQUIRED'),
  ]);
}

function finishStepFingerprint(taskId: string, stepId: string): string {
  return fingerprint([taskId, stepId]);
}

function completeFirstStepFingerprint(
  taskId: string,
  input: FirstStepCompletionInput,
): string {
  return fingerprint([taskId, input.nextStep?.trim() || null]);
}

function finishTaskFingerprint(taskId: string): string {
  return fingerprint([taskId]);
}

function startRecommendedFingerprint(): string {
  return fingerprint([]);
}

function taskPatch(task: Task): Omit<Task, 'id'> {
  const {id, ...patch} = task;
  void id;
  return patch;
}

function taskNotFound(): DomainError {
  return new DomainError('TASK_NOT_FOUND');
}

class TransactionWithoutCommit<T> {
  constructor(readonly result: T) {}
}

async function unwrapTransactionWithoutCommit<T>(
  transaction: Promise<T>,
): Promise<T> {
  try {
    return await transaction;
  } catch (error: unknown) {
    if (error instanceof TransactionWithoutCommit) {
      return error.result as T;
    }
    throw error;
  }
}

export function createCoreAppService(
  dependencies: CreateCoreAppServiceDependencies,
): CoreAppService {
  const {repository, now, idGenerator} = dependencies;
  const operationRegistry =
    dependencies.operationRegistry ?? defaultOperationRegistryFor(repository);

  return {
    createTask(input, operation) {
      return runIdempotentMutation(
        operationRegistry,
        'createTask',
        operation,
        () => createTaskFingerprint(input),
        async () => {
          const task = createDomainTask(input, {
            id: idGenerator(),
            now: now(),
          });
          return repository.create(task);
        },
      );
    },

    addFirstStep(taskId, input, operation) {
      return runIdempotentMutation(
        operationRegistry,
        'addFirstStep',
        operation,
        () => addFirstStepFingerprint(taskId, input),
        () =>
          repository.transaction(async transaction => {
            const task = await transaction.getById(taskId);
            if (task === null) {
              throw taskNotFound();
            }

            const updated = createFirstStep(task, input, {
              id: idGenerator(),
              now: now(),
            });
            return transaction.update(taskId, taskPatch(updated));
          }),
      );
    },

    async chooseRecommended() {
      return recommendNextTask(await repository.list());
    },

    startRecommended(operation) {
      return runIdempotentMutation(
        operationRegistry,
        'startRecommended',
        operation,
        startRecommendedFingerprint,
        () =>
          repository.transaction(async transaction => {
            const recommendation = recommendNextTask(await transaction.list());
            if (recommendation === null) {
              throw new DomainError('NO_RECOMMENDED_TASK');
            }

            const observedAt = now();
            const started = startTask(recommendation, observedAt);
            const reward = awardFirstStartReward(started, observedAt);
            const pendingNextStart = nextStartAtForTask(recommendation);
            if (
              started === recommendation &&
              reward.points === 0 &&
              pendingNextStart === null
            ) {
              return recommendation;
            }
            const patch = taskPatch(reward.task) as Omit<Task, 'id'> & {
              supportSchemaVersion?: typeof TASK_SUPPORT_SCHEMA_VERSION;
              nextStartAt?: string | null;
              growthSchemaVersion?: typeof TASK_GROWTH_SCHEMA_VERSION;
            };
            if (pendingNextStart !== null) {
              patch.supportSchemaVersion = TASK_SUPPORT_SCHEMA_VERSION;
              patch.nextStartAt = null;
            }
            return transaction.update(started.id, patch);
          }),
      );
    },

    completeFirstStep(taskId, input, operation) {
      return runIdempotentMutation(
        operationRegistry,
        'completeFirstStep',
        operation,
        () => completeFirstStepFingerprint(taskId, input),
        () => unwrapTransactionWithoutCommit(
          repository.transaction(async transaction => {
            const task = await transaction.getById(taskId);
            if (task === null) throw taskNotFound();
            const award = completeFirstStepWithReward(task, input.nextStep, now());
            if (award.points === 0) {
              throw new TransactionWithoutCommit(award);
            }
            const persisted = await transaction.update(
              taskId,
              taskPatch(award.task),
            );
            return {...award, task: persisted as TaskWithGrowth};
          }),
        ),
      );
    },

    undoFirstStep(taskId, operation) {
      return runIdempotentMutation(
        operationRegistry,
        'undoFirstStep',
        operation,
        () => fingerprint([taskId]),
        () => unwrapTransactionWithoutCommit(
          repository.transaction(async transaction => {
            const task = await transaction.getById(taskId);
            if (task === null) throw taskNotFound();
            const updated = undoFirstStepCompletion(task, now());
            if (updated === task) {
              throw new TransactionWithoutCommit(task);
            }
            return transaction.update(taskId, taskPatch(updated));
          }),
        ),
      );
    },

    finishStep(taskId, stepId, operation) {
      return runIdempotentMutation(
        operationRegistry,
        'finishStep',
        operation,
        () => finishStepFingerprint(taskId, stepId),
        () =>
          repository.transaction(async transaction => {
            const task = await transaction.getById(taskId);
            if (task === null) {
              throw taskNotFound();
            }

            const completed = completeSubtask(task, stepId, now());
            if (completed === task) {
              return task;
            }
            return transaction.update(taskId, taskPatch(completed));
          }),
      );
    },

    finishTask(taskId, operation) {
      return runIdempotentMutation(
        operationRegistry,
        'finishTask',
        operation,
        () => finishTaskFingerprint(taskId),
        () =>
          unwrapTransactionWithoutCommit(
            repository.transaction(async transaction => {
              const task = await transaction.getById(taskId);
              if (task === null) {
                throw taskNotFound();
              }

              const completedAt = now();
              const completed = completeTask(task, completedAt);
              const award = awardCompletionScore(completed, completedAt);
              if (award.task === task) {
                // The repository transaction API commits after any fulfilled
                // callback. Abort with a private result marker so a genuine
                // no-op completion remains read-only while still running inside
                // the repository's serialized transaction boundary.
                throw new TransactionWithoutCommit(award);
              }

              const persisted = await transaction.update(
                taskId,
                taskPatch(award.task),
              );
              return {task: persisted, points: award.points};
            }),
          ),
      );
    },

    async getState() {
      const tasks = await repository.list();
      return {
        tasks,
        // Keep the frozen P0 public meaning: totalScore is the sum of task
        // completion awards. P10 action rewards are projected separately by
        // the workspace so older callers do not observe a silent score shift.
        totalScore: tasks.reduce((total, task) => total + (task.score ?? 0), 0),
      };
    },
  };
}
