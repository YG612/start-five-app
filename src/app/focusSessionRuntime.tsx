import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {FocusSessionService} from '../application/focusSessionService';
import type {PostFocusReviewService} from '../application/postFocusReviewService';
import type {FocusSession} from '../domain/focusSession';
import type {FocusDurationMinutes} from '../domain/focusSession';

type FocusRuntimeState = 'idle' | 'running' | 'finished';
type AsyncPhase = 'idle' | 'pending' | 'ready' | 'error';

export type FocusRuntimeClock = Readonly<{
  nowMs(): number;
  subscribe(listener: () => void): () => void;
}>;

export type AppFocusSessionSnapshot = Readonly<{
  state: FocusRuntimeState;
  durationMs: number;
  remainingMs: number;
  activeSession: FocusSession | null;
}>;

export type AppFocusSessionRuntime = Readonly<{
  snapshot: AppFocusSessionSnapshot;
  errorText: string | null;
  restoreRetryAvailable: boolean;
  finishRetryAvailable: boolean;
  taskCompletionBlocked: boolean;
  lifecyclePending: boolean;
  notifyTaskHydrated(inProgressTaskIds: readonly string[]): void;
  retryRestore(): void;
  retryFinish(): void;
  start(taskId: string, plannedMinutes?: FocusDurationMinutes): Promise<FocusSession>;
  interrupt(reason?: string): Promise<FocusSession>;
}>;

type FocusSessionRuntimeProviderProps = Readonly<{
  service: FocusSessionService;
  reviewService: Pick<
    PostFocusReviewService,
    | 'trackStartedSession'
    | 'trackRestoredSession'
    | 'captureEndedSession'
    | 'recoverTrackedSession'
    | 'recoverEligibleSessions'
  >;
  createRestoreService(writeIsCurrent: () => boolean): FocusSessionService;
  clock: FocusRuntimeClock;
  lastObservedNow(): string | null;
  children: React.ReactNode;
}>;

type RuntimeAnchor = Readonly<{
  sessionId: string;
  remainingMs: number;
  runtimeMs: number;
}>;

const FIVE_MINUTES_MS = 5 * 60_000;
const INITIAL_SNAPSHOT: AppFocusSessionSnapshot = {
  state: 'idle',
  durationMs: FIVE_MINUTES_MS,
  remainingMs: FIVE_MINUTES_MS,
  activeSession: null,
};
const FocusSessionRuntimeContext =
  createContext<AppFocusSessionRuntime | null>(null);

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() !== ''
    ? error.message
    : 'FOCUS_SESSION_OPERATION_FAILED';
}

function remainingAt(session: FocusSession, observedNow: string | null): number {
  if (observedNow === null) {
    return session.plannedMinutes * 60_000;
  }
  return Math.max(0, Date.parse(session.plannedEndAt) - Date.parse(observedNow));
}

export function FocusSessionRuntimeProvider({
  service,
  reviewService,
  createRestoreService,
  clock,
  lastObservedNow,
  children,
}: FocusSessionRuntimeProviderProps): React.JSX.Element {
  const [snapshot, setSnapshot] =
    useState<AppFocusSessionSnapshot>(INITIAL_SNAPSHOT);
  const [restorePhase, setRestorePhase] = useState<AsyncPhase>('idle');
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [finishPhase, setFinishPhase] = useState<AsyncPhase>('idle');
  const [finishError, setFinishError] = useState<string | null>(null);
  const [lifecyclePending, setLifecyclePending] = useState(false);
  const mountedRef = useRef(true);
  const snapshotRef = useRef(snapshot);
  const runtimeAnchorRef = useRef<RuntimeAnchor | null>(null);
  const eligibleTaskIdsRef = useRef<ReadonlySet<string>>(new Set());
  const hydrationStartedRef = useRef(false);
  const restoreGenerationRef = useRef(0);
  const startInFlightRef = useRef<Promise<FocusSession> | null>(null);
  const lifecycleInFlightRef = useRef<{
    kind: 'finish' | 'interrupt';
    promise: Promise<FocusSession>;
  } | null>(null);
  const finishBlockedSessionRef = useRef<string | null>(null);
  const attemptDeadlineFinishRef = useRef<(force: boolean) => void>(() => undefined);

  function commitSnapshot(next: AppFocusSessionSnapshot): void {
    snapshotRef.current = next;
    if (mountedRef.current) {
      setSnapshot(next);
    }
  }

  function adoptRunning(session: FocusSession): void {
    const remainingMs = remainingAt(session, lastObservedNow());
    runtimeAnchorRef.current = {
      sessionId: session.id,
      remainingMs,
      runtimeMs: clock.nowMs(),
    };
    finishBlockedSessionRef.current = null;
    setFinishPhase('idle');
    setFinishError(null);
    commitSnapshot({
      state: 'running',
      durationMs: session.plannedMinutes * 60_000,
      remainingMs,
      activeSession: session,
    });
  }

  function commitLifecycleResult(session: FocusSession): void {
    runtimeAnchorRef.current = null;
    finishBlockedSessionRef.current = null;
    setFinishError(null);
    if (session.status === 'running') {
      adoptRunning(session);
      return;
    }
    if (session.status === 'completed') {
      setFinishPhase('ready');
      commitSnapshot({
        state: 'finished',
        durationMs: session.plannedMinutes * 60_000,
        remainingMs: 0,
        activeSession: null,
      });
      return;
    }
    setFinishPhase('idle');
    commitSnapshot({
      state: 'idle',
      durationMs: session.plannedMinutes * 60_000,
      remainingMs: session.plannedMinutes * 60_000,
      activeSession: null,
    });
  }

  function beginRestore(): void {
    const eligibleTaskIds = eligibleTaskIdsRef.current;
    if (eligibleTaskIds.size === 0 || !mountedRef.current) {
      return;
    }
    const generation = restoreGenerationRef.current + 1;
    restoreGenerationRef.current = generation;
    setRestorePhase('pending');
    setRestoreError(null);
    const writeIsCurrent = () =>
      mountedRef.current && restoreGenerationRef.current === generation;
    void createRestoreService(writeIsCurrent)
      .restore()
      .then(async active => {
        if (active === null) {
          await reviewService.recoverEligibleSessions(
            Array.from(eligibleTaskIds),
          );
        } else {
          await reviewService.trackRestoredSession(active);
        }
        if (
          !mountedRef.current ||
          restoreGenerationRef.current !== generation
        ) {
          return;
        }
        setRestorePhase('ready');
        setRestoreError(null);
        if (active !== null && eligibleTaskIds.has(active.taskId)) {
          adoptRunning(active);
        }
      })
      .catch(error => {
        if (
          !mountedRef.current ||
          restoreGenerationRef.current !== generation
        ) {
          return;
        }
        setRestorePhase('error');
        setRestoreError(errorMessage(error));
      });
  }

  function attemptDeadlineFinish(force: boolean): void {
    const active = snapshotRef.current.activeSession;
    if (
      active === null ||
      snapshotRef.current.state !== 'running' ||
      lifecycleInFlightRef.current !== null ||
      (!force && finishBlockedSessionRef.current === active.id)
    ) {
      return;
    }
    if (force) {
      finishBlockedSessionRef.current = null;
    }
    setFinishPhase('pending');
    setFinishError(null);
    const pending = service.finish(active.id);
    lifecycleInFlightRef.current = {kind: 'finish', promise: pending};
    setLifecyclePending(true);
    void pending
      .then(async finished => {
        await reviewService.captureEndedSession(finished);
        if (
          !mountedRef.current ||
          snapshotRef.current.activeSession?.id !== active.id
        ) {
          return;
        }
        commitLifecycleResult(finished);
      })
      .catch(error => {
        if (
          !mountedRef.current ||
          snapshotRef.current.activeSession?.id !== active.id
        ) {
          return;
        }
        finishBlockedSessionRef.current = active.id;
        setFinishPhase('error');
        setFinishError(errorMessage(error));
      })
      .finally(() => {
        if (lifecycleInFlightRef.current?.promise === pending) {
          lifecycleInFlightRef.current = null;
          if (mountedRef.current) {
            setLifecyclePending(false);
          }
        }
      });
  }

  attemptDeadlineFinishRef.current = attemptDeadlineFinish;

  useEffect(() => {
    mountedRef.current = true;
    const unsubscribe = clock.subscribe(() => {
      const current = snapshotRef.current;
      const active = current.activeSession;
      const anchor = runtimeAnchorRef.current;
      if (
        current.state !== 'running' ||
        active === null ||
        anchor === null ||
        anchor.sessionId !== active.id
      ) {
        return;
      }
      const elapsedMs = Math.max(0, clock.nowMs() - anchor.runtimeMs);
      const remainingMs = Math.max(0, anchor.remainingMs - elapsedMs);
      if (remainingMs > 0) {
        if (remainingMs !== current.remainingMs) {
          commitSnapshot({...current, remainingMs});
        }
        return;
      }
      attemptDeadlineFinishRef.current(false);
    });
    return () => {
      mountedRef.current = false;
      restoreGenerationRef.current += 1;
      unsubscribe();
    };
  }, [clock]);

  const runtime = useMemo<AppFocusSessionRuntime>(() => ({
    snapshot,
    errorText: finishError ?? restoreError,
    restoreRetryAvailable:
      restorePhase === 'pending' || restorePhase === 'error',
    finishRetryAvailable: finishPhase === 'error',
    taskCompletionBlocked:
      restorePhase !== 'ready' ||
      snapshot.state === 'running' ||
      lifecyclePending,
    lifecyclePending,
    notifyTaskHydrated(inProgressTaskIds) {
      if (hydrationStartedRef.current) {
        return;
      }
      hydrationStartedRef.current = true;
      eligibleTaskIdsRef.current = new Set(inProgressTaskIds);
      if (eligibleTaskIdsRef.current.size === 0) {
        setRestorePhase('ready');
        setRestoreError(null);
        return;
      }
      beginRestore();
    },
    retryRestore() {
      beginRestore();
    },
    retryFinish() {
      attemptDeadlineFinishRef.current(true);
    },
    start(taskId, plannedMinutes = 5) {
      const existing = startInFlightRef.current;
      if (existing !== null) {
        return existing;
      }
      restoreGenerationRef.current += 1;
      setRestorePhase('ready');
      setRestoreError(null);
      const pending = service
        .start({taskId, plannedMinutes})
        .then(async started => {
          await reviewService.trackStartedSession(started);
          if (mountedRef.current) {
            adoptRunning(started);
          }
          return started;
        })
        .finally(() => {
          if (startInFlightRef.current === pending) {
            startInFlightRef.current = null;
          }
        });
      startInFlightRef.current = pending;
      return pending;
    },
    interrupt(reason = '用户中断专注') {
      const active = snapshotRef.current.activeSession;
      if (active === null) {
        return Promise.reject(new Error('FOCUS_SESSION_NOT_FOUND'));
      }
      if (lifecycleInFlightRef.current !== null) {
        return Promise.reject(new Error('FOCUS_SESSION_LIFECYCLE_PENDING'));
      }
      const pending = service
        .interrupt(active.id, reason)
        .then(async interrupted => {
          await reviewService.captureEndedSession(interrupted);
          if (mountedRef.current) {
            commitLifecycleResult(interrupted);
          }
          return interrupted;
        })
        .finally(() => {
          if (lifecycleInFlightRef.current?.promise === pending) {
            lifecycleInFlightRef.current = null;
            if (mountedRef.current) {
              setLifecyclePending(false);
            }
          }
        });
      lifecycleInFlightRef.current = {kind: 'interrupt', promise: pending};
      setLifecyclePending(true);
      return pending;
    },
  }), [
    finishError,
    finishPhase,
    lifecyclePending,
    restoreError,
    restorePhase,
    reviewService,
    service,
    snapshot,
  ]);

  return (
    <FocusSessionRuntimeContext.Provider value={runtime}>
      {children}
    </FocusSessionRuntimeContext.Provider>
  );
}

export function useAppFocusSessionRuntime(): AppFocusSessionRuntime | null {
  return useContext(FocusSessionRuntimeContext);
}
