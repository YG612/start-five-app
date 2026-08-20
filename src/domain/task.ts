export type Subtask = {
  id: string;
  taskId: string;
  title: string;
  status: 'pending' | 'completed';
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type TaskProgress = 0 | 25 | 50 | 75 | 100;

export type TaskStepStatus = 'PENDING' | 'ACTIVE' | 'DONE' | 'SKIPPED';

export type TaskStep = {
  id: string;
  title: string;
  order: number;
  estimatedMinutes?: number;
  status: TaskStepStatus;
  createdAt: string;
  completedAt?: string;
};

export type PlannedWorkStatus = 'PLANNED' | 'STARTED' | 'DONE' | 'SKIPPED';

export type PlannedWorkSession = {
  id: string;
  taskId: string;
  stepId?: string;
  plannedStartAt: string;
  plannedMinutes: 15 | 25 | 45;
  status: PlannedWorkStatus;
  focusSessionId?: string;
  createdAt: string;
  completedAt?: string;
};

export type TaskProgressSource = 'MANUAL' | 'STEPS';
export type DeliveryRiskDismissedBand = 'SEVEN_DAYS' | '24_HOURS';

export type TaskPlacementState = 'QUADRANT' | 'UNSORTED';
export type TaskArchiveReason =
  | 'NO_LONGER_NEEDED'
  | 'DUPLICATE'
  | 'PAUSED'
  | 'OTHER';

export type Task = {
  id: string;
  title: string;
  description: string;
  important: boolean;
  urgent: boolean;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  startAt: string | null;
  scheduledStartAt?: string | null;
  dueAt: string | null;
  estimatedMinutes?: number | null;
  firstStep?: string | null;
  completionDefinition?: string | null;
  progress?: TaskProgress;
  progressSource?: TaskProgressSource;
  steps?: TaskStep[];
  plannedWorkSessions?: PlannedWorkSession[];
  deliveryRiskDismissedAt?: string | null;
  deliveryRiskDismissedBand?: DeliveryRiskDismissedBand | null;
  placementState?: TaskPlacementState;
  archivedAt?: string | null;
  archiveReason?: TaskArchiveReason | null;
  lastMeaningfulActivityAt?: string | null;
  completionRewardConsumed?: boolean;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  deletedAt: string | null;
  score: number | null;
  scoreAwardedAt: string | null;
  subtasks: Subtask[];
};

export type TaskInput = {
  title: string;
  description?: string;
  important: boolean;
  urgent: boolean;
  startAt?: string | null;
  scheduledStartAt?: string | null;
  dueAt?: string | null;
  estimatedMinutes?: number | null;
  firstStep?: string | null;
};

type IdentityAndClock = {
  id: string;
  now: string;
};

type FirstStepInput = {
  title: string;
};

export class DomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string = code) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
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

function normalizedRequiredTitle(value: string, errorCode: string): string {
  const title = typeof value === 'string' ? value.trim() : '';
  if (title === '') {
    throw new DomainError(errorCode);
  }
  return title;
}

export function createTask(
  input: TaskInput,
  identityAndClock: IdentityAndClock,
): Task {
  const title = normalizedRequiredTitle(input.title, 'TITLE_REQUIRED');
  const now = canonicalTimestamp(identityAndClock.now);
  const startAt = optionalCanonicalTimestamp(input.startAt);
  const dueAt = optionalCanonicalTimestamp(input.dueAt);

  if (startAt !== null && dueAt !== null && startAt > dueAt) {
    throw new DomainError('INVALID_TIME_RANGE');
  }

  return {
    id: identityAndClock.id,
    title,
    description: input.description ?? '',
    important: input.important,
    urgent: input.urgent,
    status: 'pending',
    startAt,
    dueAt,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    deletedAt: null,
    score: null,
    scoreAwardedAt: null,
    subtasks: [],
  };
}

export function createFirstStep(
  task: Task,
  input: FirstStepInput,
  identityAndClock: IdentityAndClock,
): Task {
  if (task.status === 'completed' || task.status === 'cancelled') {
    throw new DomainError('TERMINAL_TASK');
  }

  const title = normalizedRequiredTitle(input.title, 'SUBTASK_TITLE_REQUIRED');
  const now = canonicalTimestamp(identityAndClock.now);
  const subtask: Subtask = {
    id: identityAndClock.id,
    taskId: task.id,
    title,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };

  return {
    ...task,
    updatedAt: now,
    subtasks: [...task.subtasks, subtask],
  };
}

export function startTask(task: Task, nowInput: string): Task {
  const now = canonicalTimestamp(nowInput);

  if (task.status === 'in_progress') {
    return task;
  }
  if (task.status !== 'pending') {
    throw new DomainError('INVALID_TASK_TRANSITION');
  }

  return {
    ...task,
    status: 'in_progress',
    startedAt: now,
    updatedAt: now,
  };
}

export function completeSubtask(
  task: Task,
  subtaskId: string,
  nowInput: string,
): Task {
  const now = canonicalTimestamp(nowInput);
  const subtaskIndex = task.subtasks.findIndex(subtask => subtask.id === subtaskId);

  if (subtaskIndex < 0) {
    throw new DomainError('SUBTASK_NOT_FOUND');
  }

  const target = task.subtasks[subtaskIndex];
  if (target === undefined) {
    throw new DomainError('SUBTASK_NOT_FOUND');
  }
  if (target.taskId !== task.id) {
    throw new DomainError('SUBTASK_PARENT_MISMATCH');
  }
  if (target.status === 'completed') {
    return task;
  }

  const completedSubtask: Subtask = {
    ...target,
    status: 'completed',
    completedAt: now,
    updatedAt: now,
  };
  const subtasks = task.subtasks.map((subtask, index) =>
    index === subtaskIndex ? completedSubtask : subtask,
  );

  return {
    ...task,
    updatedAt: now,
    subtasks,
  };
}

export function completeTask(task: Task, nowInput: string): Task {
  const now = canonicalTimestamp(nowInput);

  if (task.status === 'completed') {
    return task;
  }
  if (task.status !== 'in_progress') {
    throw new DomainError('INVALID_TASK_TRANSITION');
  }
  if (task.subtasks.some(subtask => subtask.status !== 'completed')) {
    throw new DomainError('UNFINISHED_SUBTASKS');
  }

  return {
    ...task,
    status: 'completed',
    completedAt: now,
    updatedAt: now,
  };
}
