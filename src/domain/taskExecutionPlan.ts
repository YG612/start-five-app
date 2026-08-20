import {
  DomainError,
  type DeliveryRiskDismissedBand,
  type PlannedWorkSession,
  type Task,
  type TaskProgress,
  type TaskProgressSource,
  type TaskStep,
} from './task';

export type DeliveryRisk = 'UNKNOWN' | 'OK' | 'NEEDS_PLAN' | 'AT_RISK';

export type StepDraft = Readonly<{
  title: string;
  estimatedMinutes?: number;
}>;

export type FirstStepQualityResult = Readonly<{
  needsSuggestion: boolean;
  reason: 'SAME_AS_TASK' | 'ABSTRACT' | 'TOO_BROAD' | 'TOO_LONG' | null;
  suggestion: string | null;
}>;

const STEP_STATUSES = new Set(['PENDING', 'ACTIVE', 'DONE', 'SKIPPED']);
const PLANNED_STATUSES = new Set(['PLANNED', 'STARTED', 'DONE', 'SKIPPED']);
const PLAN_MINUTES = new Set([15, 25, 45]);
const ABSTRACT_STEPS = new Set([
  '开始',
  '准备',
  '处理',
  '推进',
  '学习',
  '复习',
  '写论文',
  '做项目',
  '弄一下',
]);
const TOO_BROAD_PATTERN = /(完成整个|完成全部|全部完成|处理一下|全部处理|做完所有)/;

function own(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalTimestamp(value: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DomainError('INVALID_TIMESTAMP');
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new DomainError('INVALID_TIMESTAMP');
  return new Date(milliseconds).toISOString();
}

function normalizedTitle(value: string): string {
  const title = typeof value === 'string' ? value.trim() : '';
  if (title === '') throw new DomainError('TASK_STEP_TITLE_REQUIRED');
  return title;
}

function normalizedEstimatedMinutes(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new DomainError('INVALID_TASK_STEP_ESTIMATE');
  }
  return value;
}

function uniqueId(value: string, used: Set<string>, code: string): string {
  const id = typeof value === 'string' ? value.trim() : '';
  if (id === '' || used.has(id)) throw new DomainError(code);
  used.add(id);
  return id;
}

export function normalizeCompletionDefinition(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') {
    throw new DomainError('INVALID_COMPLETION_DEFINITION');
  }
  const normalized = value.trim();
  if (normalized.length > 300) {
    throw new DomainError('COMPLETION_DEFINITION_TOO_LONG');
  }
  return normalized === '' ? null : normalized;
}

export function activeTaskStep(task: Task): TaskStep | null {
  return (task.steps ?? []).find(step => step.status === 'ACTIVE') ?? null;
}

export function projectedFirstStep(task: Task): string | null {
  return activeTaskStep(task)?.title ?? task.firstStep ?? null;
}

export function taskStepProgress(task: Task): TaskProgress {
  if (task.progressSource !== 'STEPS' || (task.steps?.length ?? 0) === 0) {
    return task.progress ?? 0;
  }
  const steps = task.steps ?? [];
  const weighted = steps.every(step => step.estimatedMinutes !== undefined);
  const total = weighted
    ? steps.reduce((sum, step) => sum + (step.estimatedMinutes ?? 0), 0)
    : steps.length;
  const finished = weighted
    ? steps.reduce(
        (sum, step) =>
          sum +
          (step.status === 'DONE' || step.status === 'SKIPPED'
            ? step.estimatedMinutes ?? 0
            : 0),
        0,
      )
    : steps.filter(step => step.status === 'DONE' || step.status === 'SKIPPED')
        .length;
  const ratio = total <= 0 ? 0 : finished / total;
  if (ratio >= 1) return 100;
  if (ratio >= 0.75) return 75;
  if (ratio >= 0.5) return 50;
  if (ratio >= 0.25) return 25;
  return 0;
}

function projectStepState(task: Task, steps: TaskStep[]): Task {
  const projected = steps.find(step => step.status === 'ACTIVE')?.title ?? null;
  const next: Task = {...task, steps, firstStep: projected};
  if (task.progressSource === 'STEPS') {
    next.progress = taskStepProgress(next);
  }
  return next;
}

export function createTaskStepPlan(input: Readonly<{
  task: Task;
  drafts: readonly StepDraft[];
  progressSource?: TaskProgressSource;
  now: string;
  idGenerator(): string;
}>): Task {
  if (input.drafts.length < 1 || input.drafts.length > 12) {
    throw new DomainError('TASK_STEP_COUNT_OUT_OF_RANGE');
  }
  const createdAt = canonicalTimestamp(input.now);
  const used = new Set<string>();
  const steps = input.drafts.map((draft, index): TaskStep => {
    const estimatedMinutes = normalizedEstimatedMinutes(draft.estimatedMinutes);
    return {
      id: uniqueId(input.idGenerator(), used, 'TASK_STEP_ID_CONFLICT'),
      title: normalizedTitle(draft.title),
      order: index,
      ...(estimatedMinutes === undefined ? {} : {estimatedMinutes}),
      status: index === 0 ? 'ACTIVE' : 'PENDING',
      createdAt,
    };
  });
  return projectStepState(
    {
      ...input.task,
      progressSource: input.progressSource ?? 'STEPS',
      updatedAt: createdAt,
    },
    steps,
  );
}

export function completeActiveTaskStep(task: Task, nowInput: string): Task {
  const active = activeTaskStep(task);
  if (active === null) return task;
  const completedAt = canonicalTimestamp(nowInput);
  const ordered = [...(task.steps ?? [])].sort((a, b) => a.order - b.order);
  const nextPending = ordered.find(
    step => step.order > active.order && step.status === 'PENDING',
  );
  const steps = ordered.map(step => {
    if (step.id === active.id) {
      return {...step, status: 'DONE' as const, completedAt};
    }
    if (nextPending !== undefined && step.id === nextPending.id) {
      const {completedAt: _ignored, ...withoutCompletion} = step;
      return {...withoutCompletion, status: 'ACTIVE' as const};
    }
    return {...step};
  });
  return projectStepState({...task, updatedAt: completedAt}, steps);
}

export function skipOrRemoveTaskStep(input: Readonly<{
  task: Task;
  stepId: string;
  now: string;
  hasFocusHistory: boolean;
}>): Task {
  const now = canonicalTimestamp(input.now);
  const target = (input.task.steps ?? []).find(step => step.id === input.stepId);
  if (target === undefined) throw new DomainError('TASK_STEP_NOT_FOUND');
  let steps = (input.task.steps ?? []).map(step => ({...step}));
  if (input.hasFocusHistory) {
    steps = steps.map(step =>
      step.id === input.stepId
        ? {...step, status: 'SKIPPED' as const, completedAt: now}
        : step,
    );
  } else {
    steps = steps.filter(step => step.id !== input.stepId);
  }
  steps = steps
    .sort((a, b) => a.order - b.order)
    .map((step, index) => ({...step, order: index}));
  if (!steps.some(step => step.status === 'ACTIVE')) {
    const next = steps.find(step => step.status === 'PENDING');
    if (next !== undefined) {
      steps = steps.map(step =>
        step.id === next.id ? {...step, status: 'ACTIVE' as const} : step,
      );
    }
  }
  return projectStepState({...input.task, updatedAt: now}, steps);
}

export function moveTaskStep(
  task: Task,
  stepId: string,
  direction: 'UP' | 'DOWN',
): Task {
  const steps = [...(task.steps ?? [])].sort((a, b) => a.order - b.order);
  const index = steps.findIndex(step => step.id === stepId);
  if (index < 0) throw new DomainError('TASK_STEP_NOT_FOUND');
  const swap = direction === 'UP' ? index - 1 : index + 1;
  if (swap < 0 || swap >= steps.length) return task;
  const first = steps[index];
  const second = steps[swap];
  if (first === undefined || second === undefined) return task;
  steps[index] = second;
  steps[swap] = first;
  return projectStepState(
    task,
    steps.map((step, order) => ({...step, order})),
  );
}

export function cloneTaskStepTemplate(input: Readonly<{
  source: Task;
  taskId: string;
  now: string;
  idGenerator(): string;
}>): Pick<Task, 'steps' | 'firstStep' | 'progressSource'> {
  const now = canonicalTimestamp(input.now);
  const used = new Set<string>();
  const source = [...(input.source.steps ?? [])]
    .filter(step => step.status !== 'SKIPPED')
    .sort((a, b) => a.order - b.order);
  const steps = source.map((step, index): TaskStep => ({
    id: uniqueId(input.idGenerator(), used, 'TASK_STEP_ID_CONFLICT'),
    title: step.title,
    order: index,
    ...(step.estimatedMinutes === undefined
      ? {}
      : {estimatedMinutes: step.estimatedMinutes}),
    status: index === 0 ? 'ACTIVE' : 'PENDING',
    createdAt: now,
  }));
  return {
    steps,
    firstStep: steps[0]?.title ?? input.source.firstStep ?? null,
    progressSource: input.source.progressSource ?? 'STEPS',
  };
}

export function remainingMinutesForTask(task: Task): number | null {
  const unfinished = (task.steps ?? []).filter(
    step => step.status === 'ACTIVE' || step.status === 'PENDING',
  );
  if (
    unfinished.length > 0 &&
    unfinished.every(step => step.estimatedMinutes !== undefined)
  ) {
    return unfinished.reduce((sum, step) => sum + (step.estimatedMinutes ?? 0), 0);
  }
  if (task.estimatedMinutes == null) return null;
  const progress = taskStepProgress(task);
  return Math.max(0, Math.ceil(task.estimatedMinutes * (1 - progress / 100)));
}

export function generatePlannedWorkSessions(input: Readonly<{
  task: Task;
  plannedMinutes: 15 | 25 | 45;
  plannedStartTimes: readonly string[];
  now: string;
  idGenerator(): string;
}>): Task {
  if (!PLAN_MINUTES.has(input.plannedMinutes)) {
    throw new DomainError('INVALID_PLANNED_WORK_MINUTES');
  }
  if (input.plannedStartTimes.length < 1 || input.plannedStartTimes.length > 10) {
    throw new DomainError('PLANNED_WORK_COUNT_OUT_OF_RANGE');
  }
  const createdAt = canonicalTimestamp(input.now);
  const used = new Set((input.task.plannedWorkSessions ?? []).map(item => item.id));
  const activeStepId = activeTaskStep(input.task)?.id;
  const generated = input.plannedStartTimes.map(plannedStartAt => {
    const canonical = canonicalTimestamp(plannedStartAt);
    if (Date.parse(canonical) <= Date.parse(createdAt)) {
      throw new DomainError('PLANNED_WORK_MUST_BE_FUTURE');
    }
    return {
      id: uniqueId(input.idGenerator(), used, 'PLANNED_WORK_ID_CONFLICT'),
      taskId: input.task.id,
      ...(activeStepId === undefined ? {} : {stepId: activeStepId}),
      plannedStartAt: canonical,
      plannedMinutes: input.plannedMinutes,
      status: 'PLANNED' as const,
      createdAt,
    };
  });
  const sessions = [...(input.task.plannedWorkSessions ?? []), ...generated].sort(
    (left, right) => Date.parse(left.plannedStartAt) - Date.parse(right.plannedStartAt),
  );
  return {
    ...input.task,
    plannedWorkSessions: sessions,
    nextStartAt: nextPlannedWorkSession({...input.task, plannedWorkSessions: sessions})
      ?.plannedStartAt ?? null,
    updatedAt: createdAt,
  } as Task;
}

export function nextPlannedWorkSession(task: Task): PlannedWorkSession | null {
  return (
    [...(task.plannedWorkSessions ?? [])]
      .filter(item => item.status === 'PLANNED')
      .sort(
        (left, right) =>
          Date.parse(left.plannedStartAt) - Date.parse(right.plannedStartAt),
      )[0] ?? null
  );
}

export function bindPlannedWorkSessionFocus(input: Readonly<{
  task: Task;
  plannedSessionId: string;
  focusSessionId: string;
  now: string;
}>): Task {
  const now = canonicalTimestamp(input.now);
  let found = false;
  const sessions = (input.task.plannedWorkSessions ?? []).map(session => {
    if (session.id !== input.plannedSessionId) return {...session};
    found = true;
    if (
      session.focusSessionId !== undefined &&
      session.focusSessionId !== input.focusSessionId
    ) {
      throw new DomainError('PLANNED_WORK_ALREADY_STARTED');
    }
    return {
      ...session,
      status: 'STARTED' as const,
      focusSessionId: input.focusSessionId,
    };
  });
  if (!found) throw new DomainError('PLANNED_WORK_NOT_FOUND');
  return {...input.task, plannedWorkSessions: sessions, updatedAt: now};
}

export function settlePlannedWorkSession(input: Readonly<{
  task: Task;
  plannedSessionId: string;
  outcome: 'DONE' | 'SKIPPED';
  now: string;
}>): Task {
  const now = canonicalTimestamp(input.now);
  let found = false;
  const sessions = (input.task.plannedWorkSessions ?? []).map(session => {
    if (session.id !== input.plannedSessionId) return {...session};
    found = true;
    if (session.status === 'DONE' || session.status === 'SKIPPED') return session;
    return {...session, status: input.outcome, completedAt: now};
  });
  if (!found) throw new DomainError('PLANNED_WORK_NOT_FOUND');
  const nextTask = {...input.task, plannedWorkSessions: sessions} as Task;
  return {
    ...nextTask,
    nextStartAt: nextPlannedWorkSession(nextTask)?.plannedStartAt ?? null,
    updatedAt: now,
  } as Task;
}

export function shiftUnstartedPlanByLocalDay(input: Readonly<{
  task: Task;
  now: string;
}>): Readonly<{task: Task; crossesDueAt: boolean}> {
  const now = canonicalTimestamp(input.now);
  let crossesDueAt = false;
  const due = input.task.dueAt == null ? null : Date.parse(input.task.dueAt);
  const sessions = (input.task.plannedWorkSessions ?? []).map(session => {
    if (session.status !== 'PLANNED') return {...session};
    const shifted = new Date(session.plannedStartAt);
    shifted.setDate(shifted.getDate() + 1);
    const plannedStartAt = shifted.toISOString();
    if (due !== null && Date.parse(plannedStartAt) > due) crossesDueAt = true;
    return {...session, plannedStartAt};
  });
  const task = {...input.task, plannedWorkSessions: sessions} as Task;
  return {
    task: {
      ...task,
      nextStartAt: nextPlannedWorkSession(task)?.plannedStartAt ?? null,
      updatedAt: now,
    } as Task,
    crossesDueAt,
  };
}

export function cancelRemainingPlannedWork(task: Task, nowInput: string): Task {
  const now = canonicalTimestamp(nowInput);
  const hasPlannedWork = task.plannedWorkSessions !== undefined;
  const hasNextStartAt = Object.prototype.hasOwnProperty.call(task, 'nextStartAt');
  return {
    ...task,
    ...(hasPlannedWork
      ? {
          plannedWorkSessions: (task.plannedWorkSessions ?? []).map(session =>
            session.status === 'PLANNED' || session.status === 'STARTED'
              ? {...session, status: 'SKIPPED' as const, completedAt: now}
              : {...session},
          ),
        }
      : {}),
    ...(hasNextStartAt ? {nextStartAt: null} : {}),
    updatedAt: now,
  } as Task;
}

export function deriveDeliveryRisk(input: Readonly<{
  remainingMinutes: number | null;
  plannedMinutesBeforeDue: number;
  dueAt: string | null;
  nextStartAt: string | null;
  now: string;
}>): DeliveryRisk {
  const now = Date.parse(input.now);
  const due = input.dueAt == null ? Number.NaN : Date.parse(input.dueAt);
  if (
    input.remainingMinutes == null ||
    !Number.isFinite(input.remainingMinutes) ||
    !Number.isFinite(now) ||
    !Number.isFinite(due)
  ) {
    return 'UNKNOWN';
  }
  if (input.plannedMinutesBeforeDue >= input.remainingMinutes) return 'OK';
  const untilDue = due - now;
  if (untilDue <= 24 * 60 * 60_000 && input.remainingMinutes > input.plannedMinutesBeforeDue) {
    return 'AT_RISK';
  }
  if (input.plannedMinutesBeforeDue > 0 && input.plannedMinutesBeforeDue < input.remainingMinutes) {
    return 'AT_RISK';
  }
  if (
    untilDue >= 0 &&
    untilDue <= 7 * 24 * 60 * 60_000 &&
    input.remainingMinutes > 60 &&
    input.nextStartAt == null
  ) {
    return 'NEEDS_PLAN';
  }
  return 'OK';
}

export function plannedMinutesBeforeDue(task: Task): number {
  const due = task.dueAt == null ? Number.POSITIVE_INFINITY : Date.parse(task.dueAt);
  return (task.plannedWorkSessions ?? [])
    .filter(
      session =>
        session.status === 'PLANNED' && Date.parse(session.plannedStartAt) <= due,
    )
    .reduce((sum, session) => sum + session.plannedMinutes, 0);
}

export function deliveryRiskDismissedBand(
  task: Task,
  nowInput: string,
): DeliveryRiskDismissedBand | null {
  if (task.dueAt == null) return null;
  const remaining = Date.parse(task.dueAt) - Date.parse(nowInput);
  return remaining <= 24 * 60 * 60_000 ? '24_HOURS' : 'SEVEN_DAYS';
}

export function shouldShowDeliveryRisk(task: Task, nowInput: string): boolean {
  const now = Date.parse(nowInput);
  if (!Number.isFinite(now)) return false;
  const currentBand = deliveryRiskDismissedBand(task, nowInput);
  if (currentBand === null) return false;
  if (task.deliveryRiskDismissedAt == null) return true;
  if (task.deliveryRiskDismissedBand !== currentBand) return true;
  return now - Date.parse(task.deliveryRiskDismissedAt) >= 24 * 60 * 60_000;
}

export function firstStepQualityHint(input: Readonly<{
  taskTitle: string;
  stepTitle: string;
  estimatedMinutes?: number;
}>): FirstStepQualityResult {
  const task = input.taskTitle.trim().toLocaleLowerCase();
  const step = input.stepTitle.trim().toLocaleLowerCase();
  const suggestion = '可以写成：“打开文档，列出三个小标题”。';
  if (step !== '' && step === task) {
    return {needsSuggestion: true, reason: 'SAME_AS_TASK', suggestion};
  }
  if (ABSTRACT_STEPS.has(step)) {
    return {needsSuggestion: true, reason: 'ABSTRACT', suggestion};
  }
  if (TOO_BROAD_PATTERN.test(step)) {
    return {needsSuggestion: true, reason: 'TOO_BROAD', suggestion};
  }
  if (input.estimatedMinutes !== undefined && input.estimatedMinutes > 15) {
    return {needsSuggestion: true, reason: 'TOO_LONG', suggestion};
  }
  return {needsSuggestion: false, reason: null, suggestion: null};
}

export function isValidTaskExecutionFields(value: Record<string, unknown>): boolean {
  if (own(value, 'completionDefinition')) {
    const definition = value.completionDefinition;
    if (
      definition !== null &&
      (typeof definition !== 'string' ||
        definition.trim() === '' ||
        definition.length > 300)
    ) return false;
  }
  if (
    own(value, 'progressSource') &&
    value.progressSource !== 'MANUAL' &&
    value.progressSource !== 'STEPS'
  ) return false;
  if (own(value, 'steps')) {
    if (!Array.isArray(value.steps) || value.steps.length > 12) return false;
    const ids = new Set<string>();
    let active = 0;
    for (const candidate of value.steps) {
      if (!record(candidate)) return false;
      const allowed = new Set([
        'id', 'title', 'order', 'estimatedMinutes', 'status', 'createdAt', 'completedAt',
      ]);
      if (Object.keys(candidate).some(key => !allowed.has(key))) return false;
      if (
        typeof candidate.id !== 'string' || candidate.id.trim() === '' || ids.has(candidate.id) ||
        typeof candidate.title !== 'string' || candidate.title.trim() === '' ||
        typeof candidate.order !== 'number' || !Number.isSafeInteger(candidate.order) || candidate.order < 0 ||
        !STEP_STATUSES.has(candidate.status as string) ||
        typeof candidate.createdAt !== 'string' || !Number.isFinite(Date.parse(candidate.createdAt)) ||
        (candidate.estimatedMinutes !== undefined &&
          (typeof candidate.estimatedMinutes !== 'number' || !Number.isSafeInteger(candidate.estimatedMinutes) || candidate.estimatedMinutes <= 0)) ||
        (candidate.completedAt !== undefined &&
          (typeof candidate.completedAt !== 'string' || !Number.isFinite(Date.parse(candidate.completedAt))))
      ) return false;
      ids.add(candidate.id);
      if (candidate.status === 'ACTIVE') active += 1;
    }
    if (value.steps.length > 0 && active > 1) return false;
    const orders = value.steps.map(item => (item as Record<string, unknown>).order);
    if (new Set(orders).size !== orders.length) return false;
  }
  if (own(value, 'plannedWorkSessions')) {
    if (!Array.isArray(value.plannedWorkSessions) || value.plannedWorkSessions.length > 256) return false;
    const ids = new Set<string>();
    for (const candidate of value.plannedWorkSessions) {
      if (!record(candidate)) return false;
      const allowed = new Set([
        'id', 'taskId', 'stepId', 'plannedStartAt', 'plannedMinutes', 'status',
        'focusSessionId', 'createdAt', 'completedAt',
      ]);
      if (Object.keys(candidate).some(key => !allowed.has(key))) return false;
      if (
        typeof candidate.id !== 'string' || candidate.id.trim() === '' || ids.has(candidate.id) ||
        candidate.taskId !== value.id ||
        (candidate.stepId !== undefined && (typeof candidate.stepId !== 'string' || candidate.stepId.trim() === '')) ||
        typeof candidate.plannedStartAt !== 'string' || !Number.isFinite(Date.parse(candidate.plannedStartAt)) ||
        !PLAN_MINUTES.has(candidate.plannedMinutes as number) ||
        !PLANNED_STATUSES.has(candidate.status as string) ||
        (candidate.focusSessionId !== undefined && (typeof candidate.focusSessionId !== 'string' || candidate.focusSessionId.trim() === '')) ||
        typeof candidate.createdAt !== 'string' || !Number.isFinite(Date.parse(candidate.createdAt)) ||
        (candidate.completedAt !== undefined && (typeof candidate.completedAt !== 'string' || !Number.isFinite(Date.parse(candidate.completedAt))))
      ) return false;
      ids.add(candidate.id);
    }
  }
  if (own(value, 'deliveryRiskDismissedAt')) {
    if (value.deliveryRiskDismissedAt !== null &&
      (typeof value.deliveryRiskDismissedAt !== 'string' || !Number.isFinite(Date.parse(value.deliveryRiskDismissedAt)))) return false;
  }
  if (own(value, 'deliveryRiskDismissedBand')) {
    if (value.deliveryRiskDismissedBand !== null &&
      value.deliveryRiskDismissedBand !== 'SEVEN_DAYS' &&
      value.deliveryRiskDismissedBand !== '24_HOURS') return false;
  }
  return true;
}

export function normalizeTaskExecutionSnapshot(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map(candidate => {
    if (!record(candidate)) return candidate;
    const task = {...candidate};
    if (own(task, 'completionDefinition')) {
      if (typeof task.completionDefinition === 'string') {
        const normalized = task.completionDefinition.trim();
        task.completionDefinition = normalized === '' ? null : normalized;
      }
    }
    if (Array.isArray(task.steps)) {
      const steps = task.steps.map(step => (record(step) ? {...step} : step));
      task.steps = steps;
      const active = steps.find(
        step => record(step) && step.status === 'ACTIVE',
      );
      if (record(active) && typeof active.title === 'string') {
        task.firstStep = active.title;
      }
    }
    if (Array.isArray(task.plannedWorkSessions)) {
      task.plannedWorkSessions = task.plannedWorkSessions.map(session =>
        record(session) ? {...session} : session,
      );
    }
    return task;
  });
}
