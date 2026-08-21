import type {
  CurrentFocusDurationMinutes as FocusDurationMinutes,
  FocusContextSnapshot,
  CurrentFocusSession as FocusSession,
  CurrentFocusSessionInput as FocusSessionInput,
  CurrentFocusSessionQueryResult as FocusSessionQueryResult,
  FocusSession as LegacyFocusSession,
  FocusSessionInput as LegacyFocusSessionInput,
  FocusSessionQueryResult as LegacyFocusSessionQueryResult,
} from '../domain/focusSession';
import type {
  CurrentFocusSessionRepository as FocusSessionRepository,
  CurrentFocusSessionTransaction as FocusSessionTransaction,
  FocusSessionRepository as LegacyFocusSessionRepository,
} from '../data/focusSessionRepository';

export type CreateFocusSessionServiceOptions = Readonly<{
  repository: LegacyFocusSessionRepository;
  now(): string;
  idGenerator(): string;
}>;

export type CurrentCreateFocusSessionServiceOptions = Readonly<{
  repository: FocusSessionRepository;
  now(): string;
  idGenerator(): string;
  resolveContextSnapshot?(
    taskId: string,
    startedAt: string,
    focusScheduleId?: string,
  ): Promise<FocusContextSnapshot | null>;
}>;

export type FocusSessionService = {
  start(input: LegacyFocusSessionInput): Promise<LegacyFocusSession>;
  getActive(): Promise<LegacyFocusSession | null>;
  getById(sessionId: string): Promise<LegacyFocusSession | null>;
  listForTask(taskId: string): Promise<LegacyFocusSessionQueryResult>;
  finish(sessionId: string): Promise<LegacyFocusSession>;
  interrupt(sessionId: string, reason: string): Promise<LegacyFocusSession>;
  restore(): Promise<LegacyFocusSession | null>;
};

export type CurrentFocusSessionService = {
  start(input: FocusSessionInput): Promise<FocusSession>;
  getActive(): Promise<FocusSession | null>;
  getById(sessionId: string): Promise<FocusSession | null>;
  listForTask(taskId: string): Promise<FocusSessionQueryResult>;
  listHistory(): Promise<readonly FocusSession[]>;
  finish(sessionId: string): Promise<FocusSession>;
  interrupt(sessionId: string, reason: string): Promise<FocusSession>;
  restore(): Promise<FocusSession | null>;
};

const SUPPORTED_DURATIONS = new Set<number>([2, 5, 15, 25, 45, 50]);
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

class FocusSessionServiceError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'FocusSessionServiceError';
    this.code = code;
  }
}

function fail(code: string): never {
  throw new FocusSessionServiceError(code);
}

function cloneSession(session: FocusSession): FocusSession {
  return {
    ...session,
    ...(session.snapshot === undefined
      ? {}
      : {snapshot: session.snapshot === null ? null : {...session.snapshot}}),
  };
}

function normalizeIdentifier(value: unknown, code: string): string {
  if (typeof value !== 'string' || CONTROL_CHARACTERS.test(value)) {
    return fail(code);
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    return fail(code);
  }
  return normalized;
}

function normalizeReason(value: unknown): string {
  if (typeof value !== 'string') {
    return fail('FOCUS_SESSION_INVALID_REASON');
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    return fail('FOCUS_SESSION_INVALID_REASON');
  }
  return normalized;
}

function validateStartInput(input: unknown): {
  taskId: string;
  plannedMinutes: FocusDurationMinutes;
  focusScheduleId?: string;
} {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return fail('FOCUS_SESSION_INVALID_INPUT');
  }
  const keys = Object.keys(input);
  if (keys.some(key =>
    key !== 'taskId' && key !== 'plannedMinutes' && key !== 'focusScheduleId'
  )) {
    return fail('FOCUS_SESSION_INVALID_INPUT');
  }
  const candidate = input as Record<string, unknown>;
  const taskId = normalizeIdentifier(
    candidate.taskId,
    'FOCUS_SESSION_INVALID_TASK_ID',
  );
  if (
    typeof candidate.plannedMinutes !== 'number' ||
    !SUPPORTED_DURATIONS.has(candidate.plannedMinutes)
  ) {
    return fail('FOCUS_SESSION_INVALID_DURATION');
  }
  return {
    taskId,
    plannedMinutes: candidate.plannedMinutes as FocusDurationMinutes,
    ...(candidate.focusScheduleId === undefined
      ? {}
      : {focusScheduleId: normalizeIdentifier(
          candidate.focusScheduleId,
          'FOCUS_SESSION_INVALID_SCHEDULE_ID',
        )}),
  };
}

function canonicalClock(value: unknown): {value: string; milliseconds: number} {
  if (typeof value !== 'string') {
    return fail('FOCUS_SESSION_INVALID_CLOCK');
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    return fail('FOCUS_SESSION_INVALID_CLOCK');
  }
  try {
    if (new Date(milliseconds).toISOString() !== value) {
      return fail('FOCUS_SESSION_INVALID_CLOCK');
    }
  } catch {
    return fail('FOCUS_SESSION_INVALID_CLOCK');
  }
  return {value, milliseconds};
}

function completeAtDeadline(session: FocusSession): FocusSession {
  return {
    ...session,
    status: 'completed',
    endedAt: session.plannedEndAt,
    actualSeconds: session.plannedMinutes * 60,
    interruptionReason: null,
    updatedAt: session.plannedEndAt,
  };
}

function createRunningSession(
  id: string,
  taskId: string,
  plannedMinutes: FocusDurationMinutes,
  now: {value: string; milliseconds: number},
  snapshot: FocusContextSnapshot | null | undefined,
): FocusSession {
  return {
    id,
    taskId,
    plannedMinutes: plannedMinutes as FocusSession['plannedMinutes'],
    status: 'running',
    startedAt: now.value,
    plannedEndAt: new Date(
      now.milliseconds + plannedMinutes * 60_000,
    ).toISOString(),
    endedAt: null,
    actualSeconds: null,
    interruptionReason: null,
    createdAt: now.value,
    updatedAt: now.value,
    ...(snapshot === undefined ? {} : {snapshot}),
  };
}

function findActive(sessions: readonly FocusSession[]): FocusSession | null {
  return sessions.find(session => session.status === 'running') ?? null;
}

function ensureNotBeforeStart(
  nowMilliseconds: number,
  session: FocusSession,
): void {
  if (nowMilliseconds < Date.parse(session.startedAt)) {
    fail('FOCUS_SESSION_INVALID_CLOCK');
  }
}

async function reconcileActive(
  transaction: FocusSessionTransaction,
  clock: () => string,
): Promise<FocusSession | null> {
  const sessions = await transaction.load();
  const active = findActive(sessions);
  if (active === null) {
    return null;
  }
  const now = canonicalClock(clock());
  ensureNotBeforeStart(now.milliseconds, active);
  if (now.milliseconds < Date.parse(active.plannedEndAt)) {
    return cloneSession(active);
  }
  await transaction.save(completeAtDeadline(active));
  return null;
}

export function createFocusSessionService(
  options: CreateFocusSessionServiceOptions,
): FocusSessionService {
  const currentOptions = options as unknown as CurrentCreateFocusSessionServiceOptions;
  const {repository, now, idGenerator} = currentOptions;

  async function start(input: FocusSessionInput): Promise<FocusSession> {
    const normalized = validateStartInput(input);
    return repository.transaction(async transaction => {
      const sessions = await transaction.load();
      const active = findActive(sessions);
      const current = canonicalClock(now());

      if (active !== null) {
        ensureNotBeforeStart(current.milliseconds, active);
        if (current.milliseconds < Date.parse(active.plannedEndAt)) {
          if (
            active.taskId === normalized.taskId &&
            active.plannedMinutes === normalized.plannedMinutes
          ) {
            return cloneSession(active);
          }
          return fail('FOCUS_SESSION_ACTIVE_CONFLICT');
        }
      }

      const snapshot = currentOptions.resolveContextSnapshot === undefined
        ? undefined
        : await currentOptions.resolveContextSnapshot(
            normalized.taskId,
            current.value,
            normalized.focusScheduleId,
          );
      const generatedId = normalizeIdentifier(
        idGenerator(),
        'FOCUS_SESSION_INVALID_ID',
      );
      if (sessions.some(session => session.id === generatedId)) {
        return fail('FOCUS_SESSION_ID_CONFLICT');
      }

      const next = createRunningSession(
        generatedId,
        normalized.taskId,
        normalized.plannedMinutes,
        current,
        snapshot,
      );
      if (active !== null) {
        await transaction.save(completeAtDeadline(active));
      }
      return cloneSession(await transaction.save(next));
    });
  }

  async function getActive(): Promise<FocusSession | null> {
    return repository.transaction(transaction =>
      reconcileActive(transaction, now),
    );
  }

  async function getById(sessionId: string): Promise<FocusSession | null> {
    const normalizedId = normalizeIdentifier(
      sessionId,
      'FOCUS_SESSION_INVALID_ID',
    );
    const found = await repository.get(normalizedId);
    return found === null ? null : cloneSession(found);
  }

  async function listForTask(taskId: string): Promise<FocusSessionQueryResult> {
    const normalizedTaskId = normalizeIdentifier(
      taskId,
      'FOCUS_SESSION_INVALID_TASK_ID',
    );
    const sessions = (await repository.list(normalizedTaskId))
      .map(cloneSession)
      .sort((left, right) => {
        const byStart = Date.parse(right.startedAt) - Date.parse(left.startedAt);
        if (byStart !== 0) {
          return byStart;
        }
        return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
      });
    const active = findActive(sessions);
    return {
      taskId: normalizedTaskId,
      sessions: sessions.map(cloneSession),
      activeSession: active === null ? null : cloneSession(active),
    };
  }

  async function listHistory(): Promise<readonly FocusSession[]> {
    return (await repository.list())
      .map(cloneSession)
      .sort((left, right) =>
        Date.parse(right.startedAt) - Date.parse(left.startedAt) ||
        left.id.localeCompare(right.id),
      );
  }

  async function terminalize(
    sessionId: string,
    interruptionReason: string | null,
  ): Promise<FocusSession> {
    return repository.transaction(async transaction => {
      const session = await transaction.get(sessionId);
      if (session === null) {
        return fail('FOCUS_SESSION_NOT_FOUND');
      }
      if (session.status !== 'running') {
        return cloneSession(session);
      }

      const current = canonicalClock(now());
      ensureNotBeforeStart(current.milliseconds, session);
      let terminal: FocusSession;
      if (current.milliseconds >= Date.parse(session.plannedEndAt)) {
        terminal = completeAtDeadline(session);
      } else {
        terminal = {
          ...session,
          status:
            interruptionReason === null ? 'completed' : 'interrupted',
          endedAt: current.value,
          actualSeconds: Math.floor(
            (current.milliseconds - Date.parse(session.startedAt)) / 1_000,
          ),
          interruptionReason,
          updatedAt: current.value,
        };
      }
      return cloneSession(await transaction.save(terminal));
    });
  }

  async function finish(sessionId: string): Promise<FocusSession> {
    const normalizedId = normalizeIdentifier(
      sessionId,
      'FOCUS_SESSION_INVALID_ID',
    );
    return terminalize(normalizedId, null);
  }

  async function interrupt(
    sessionId: string,
    reason: string,
  ): Promise<FocusSession> {
    const normalizedId = normalizeIdentifier(
      sessionId,
      'FOCUS_SESSION_INVALID_ID',
    );
    const normalizedReason = normalizeReason(reason);
    return terminalize(normalizedId, normalizedReason);
  }

  async function restore(): Promise<FocusSession | null> {
    return repository.transaction(transaction =>
      reconcileActive(transaction, now),
    );
  }

  const service = {
    start,
    getActive,
    getById,
    listForTask,
    finish,
    interrupt,
    restore,
  } as CurrentFocusSessionService;
  Object.defineProperty(service, 'listHistory', {
    value: listHistory,
    enumerable: false,
  });
  return service as unknown as FocusSessionService;
}
