import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type WorkspaceCoreAppService,
  type TaskActionRewardResult,
  type TaskCompletionResult,
  type WorkspaceTaskLifecycleService,
  type WorkspaceTaskLifecycleTaskInput,
  type WorkspaceTaskLifecycleTaskPatch,
} from '../application/coreAppService';
import type {TaskQuadrantProjection} from '../domain/quadrant';
import {totalGrowthScore} from '../domain/growth';
import type {Task} from '../domain/task';
import {useAppFocusSessionRuntime} from './focusSessionRuntime';

export type TaskWorkspaceSnapshot = Readonly<{
  loaded: boolean;
  revision: number;
  tasks: readonly Task[];
  quadrants: TaskQuadrantProjection | null;
  recommendation: Task | null;
  totalScore: number;
  growthScore: number;
  errorText: string | null;
  refreshErrorText: string | null;
  reminderSyncErrorText: string | null;
  mutationPending: boolean;
  refreshPending: boolean;
}>;

export type TaskWorkspaceRuntime = Readonly<{
  snapshot: TaskWorkspaceSnapshot;
  selectedTask: Task | null;
  selectTask(taskId: string): void;
  closeTask(): void;
  clearError(): void;
  refresh(): Promise<void>;
  refreshProjection(): Promise<void>;
  refreshAfterDurableCommit(): Promise<void>;
  startSelectedTask(taskId: string): Promise<Task>;
  createTask(input: WorkspaceTaskLifecycleTaskInput, idempotencyKey?: string): Promise<Task>;
  updateTask(taskId: string, patch: WorkspaceTaskLifecycleTaskPatch): Promise<Task>;
  completeTask(taskId: string): Promise<TaskCompletionResult>;
  completeFirstStep(
    taskId: string,
    nextStep?: string | null,
  ): Promise<TaskActionRewardResult>;
  undoFirstStep(taskId: string): Promise<Task>;
  undoCompleteTask(
    taskId: string,
    restoreStatus: 'pending' | 'in_progress',
  ): Promise<Task>;
  restoreCompletedTask(taskId: string): Promise<Task>;
  retryReminderSync(): Promise<void>;
  softDeleteTask(taskId: string): Promise<Task>;
}>;

type TaskWorkspaceRuntimeProviderProps = Readonly<{
  service: WorkspaceCoreAppService;
  lifecycle: WorkspaceTaskLifecycleService;
  reloadProjection(): Promise<readonly Task[]>;
  restoreCompletedReview(): Promise<unknown>;
  reconcileReminders?(): Promise<void>;
  startSelectedTask(taskId: string, operationId: string): Promise<Task>;
  children: React.ReactNode;
}>;

const EMPTY_SNAPSHOT: TaskWorkspaceSnapshot = {
  loaded: false,
  revision: 0,
  tasks: [],
  quadrants: null,
  recommendation: null,
  totalScore: 0,
  growthScore: 0,
  errorText: null,
  refreshErrorText: null,
  reminderSyncErrorText: null,
  mutationPending: false,
  refreshPending: false,
};

const TaskWorkspaceRuntimeContext =
  createContext<TaskWorkspaceRuntime | null>(null);

let workspaceRuntimeInstanceSequence = 0;

export function createWorkspaceOperationSessionId(
  now: () => number = Date.now,
  random: () => number = Math.random,
): string {
  workspaceRuntimeInstanceSequence += 1;
  const entropy = (): string => Math.floor(
    Math.max(0, Math.min(1, random())) * Number.MAX_SAFE_INTEGER,
  ).toString(36).padStart(11, '0');
  return [
    Math.max(0, Math.floor(now())).toString(36),
    entropy(),
    entropy(),
    workspaceRuntimeInstanceSequence.toString(36),
  ].join('-');
}

export function workspaceOperationId(
  sessionId: string,
  kind: string,
  sequence: number,
): string {
  return `task-workspace:${sessionId}:${kind}:${sequence}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() !== ''
    ? error.message
    : 'TASK_WORKSPACE_OPERATION_FAILED';
}

export function TaskWorkspaceRuntimeProvider({
  service,
  lifecycle,
  reloadProjection,
  restoreCompletedReview,
  reconcileReminders,
  startSelectedTask: startSelectedTaskDurably,
  children,
}: TaskWorkspaceRuntimeProviderProps): React.JSX.Element {
  const focusRuntime = useAppFocusSessionRuntime();
  const [snapshot, setSnapshot] =
    useState<TaskWorkspaceSnapshot>(EMPTY_SNAPSHOT);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const selectedTaskCacheRef = useRef<Task | null>(null);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const mutationsRef = useRef(new Map<string, Promise<unknown>>());
  const mutationOperationIdsRef = useRef(new Map<string, string>());
  const completedReviewRestoreStartedRef = useRef(false);
  const operationSessionIdRef = useRef<string | null>(null);
  const operationSequenceRef = useRef(0);
  if (operationSessionIdRef.current === null) {
    operationSessionIdRef.current = createWorkspaceOperationSessionId();
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
    };
  }, []);

  function refresh(): Promise<void> {
    const existing = refreshInFlightRef.current;
    if (existing !== null) {
      return existing;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    if (mountedRef.current) {
      setSnapshot(current => ({
        ...current,
        refreshPending: true,
      }));
    }
    const pending = service
      .getState()
      .then(async coreState => {
        if (!mountedRef.current || generationRef.current !== generation) {
          return;
        }
        const inProgressTaskIds = coreState.tasks
          .filter(task => task.status === 'in_progress')
          .map(task => task.id);
        focusRuntime?.notifyTaskHydrated(inProgressTaskIds);
        if (
          inProgressTaskIds.length === 0 &&
          !completedReviewRestoreStartedRef.current &&
          coreState.tasks.some(task => task.status === 'completed')
        ) {
          completedReviewRestoreStartedRef.current = true;
          try {
            await restoreCompletedReview();
          } catch (error: unknown) {
            completedReviewRestoreStartedRef.current = false;
            throw error;
          }
        }
        const query = await lifecycle.getQueryResult();
        if (!mountedRef.current || generationRef.current !== generation) {
          return;
        }
        setSnapshot(current => ({
          ...current,
          loaded: true,
          revision: current.revision + 1,
          tasks: query.tasks,
          quadrants: query.quadrants,
          recommendation: query.recommendation,
          totalScore: coreState.totalScore,
          growthScore: totalGrowthScore(query.tasks),
          refreshErrorText: null,
          refreshPending: false,
        }));
      })
      .catch(error => {
        if (mountedRef.current && generationRef.current === generation) {
          setSnapshot(current => ({
            ...current,
            loaded: true,
            refreshErrorText: errorMessage(error),
            refreshPending: false,
          }));
        }
        throw error;
      })
      .finally(() => {
        if (refreshInFlightRef.current === pending) {
          refreshInFlightRef.current = null;
        }
      });
    refreshInFlightRef.current = pending;
    return pending;
  }

  useEffect(() => {
    void refresh().catch(() => undefined);
    // The composition owns stable service instances for the Provider lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lifecycle, service]);

  async function refreshAfterDurableCommit(): Promise<void> {
    const refreshAtCommit = refreshInFlightRef.current;
    if (refreshAtCommit !== null) {
      await refreshAtCommit.catch(() => undefined);
    }
    await refresh();
  }

  async function refreshProjection(): Promise<void> {
    const refreshAtRequest = refreshInFlightRef.current;
    if (refreshAtRequest !== null) {
      // This is one user-visible projection attempt. If an already-running
      // read fails, surface that failure. If it succeeds, start a fresh read
      // so a fulfilled-but-not-yet-cleared promise cannot masquerade as the
      // requested refresh.
      await refreshAtRequest;
    }
    await reloadProjection();
    await refresh();
  }

  function runMutation<T>(
    key: string,
    kind: string,
    work: (operationId: string) => Promise<T>,
    resolveBeforePostCommit = false,
  ): Promise<T> {
    const existing = mutationsRef.current.get(key);
    if (existing !== undefined) {
      return existing as Promise<T>;
    }
    if (mountedRef.current) {
      setSnapshot(current => ({
        ...current,
        mutationPending: true,
        errorText: null,
      }));
    }
    let operationId = mutationOperationIdsRef.current.get(key);
    if (operationId === undefined) {
      const operationSessionId = operationSessionIdRef.current;
      if (operationSessionId === null) {
        throw new Error('TASK_WORKSPACE_SESSION_UNAVAILABLE');
      }
      operationSequenceRef.current += 1;
      operationId = workspaceOperationId(
        operationSessionId,
        kind,
        operationSequenceRef.current,
      );
    }
    mutationOperationIdsRef.current.set(key, operationId);
    let pending: Promise<T>;
    pending = Promise.resolve()
      .then(() => work(operationId))
      .then(async task => {
        mutationOperationIdsRef.current.delete(key);
        // The command is already durable. Projection failure is recoverable by
        // refresh and must never turn this command into a replayable mutation.
        const postCommit = refreshAfterDurableCommit()
          .catch(() => undefined)
          .then(() => {
            if (reconcileReminders === undefined) return;
            // Reminder reconciliation is a secondary side effect. A native
            // scheduler that stalls must not keep an already-durable task
            // mutation pending or prevent the focus session from starting.
            void reconcileReminders()
              .then(() => {
                if (mountedRef.current) {
                  setSnapshot(current => ({
                    ...current,
                    reminderSyncErrorText: null,
                  }));
                }
              })
              .catch(error => {
                if (mountedRef.current) {
                  setSnapshot(current => ({
                    ...current,
                    reminderSyncErrorText: errorMessage(error),
                  }));
                }
              });
          });
        if (resolveBeforePostCommit) {
          void postCommit;
        } else {
          await postCommit;
        }
        return task;
      })
      .catch(error => {
        if (mountedRef.current) {
          setSnapshot(current => ({
            ...current,
            errorText: errorMessage(error),
          }));
        }
        throw error;
      })
      .finally(() => {
        if (mutationsRef.current.get(key) === pending) {
          mutationsRef.current.delete(key);
        }
        if (mountedRef.current) {
          setSnapshot(current => ({
            ...current,
            mutationPending: mutationsRef.current.size !== 0,
          }));
        }
      });
    mutationsRef.current.set(key, pending);
    return pending;
  }

  const selectedSnapshotTask =
    snapshot.tasks.find(task => task.id === selectedTaskId) ?? null;
  if (selectedSnapshotTask !== null) {
    selectedTaskCacheRef.current = selectedSnapshotTask;
  }
  const selectedTask =
    selectedSnapshotTask ??
    (selectedTaskCacheRef.current?.id === selectedTaskId
      ? selectedTaskCacheRef.current
      : null);

  const runtime = useMemo<TaskWorkspaceRuntime>(() => ({
    snapshot,
    selectedTask,
    selectTask(taskId) {
      const task = snapshot.tasks.find(candidate => candidate.id === taskId);
      if (task !== undefined) {
        selectedTaskCacheRef.current = task;
        setSelectedTaskId(taskId);
      }
    },
    closeTask() {
      selectedTaskCacheRef.current = null;
      setSelectedTaskId(null);
    },
    clearError() {
      setSnapshot(current => ({...current, errorText: null}));
    },
    refresh,
    refreshProjection,
    refreshAfterDurableCommit,
    startSelectedTask(taskId) {
      return runMutation(`start:${taskId}`, 'start', operationId =>
        startSelectedTaskDurably(taskId, operationId),
        true,
      );
    },
    createTask(input, idempotencyKey) {
      const key = idempotencyKey === undefined
        ? `create:${JSON.stringify(input)}`
        : `create:${idempotencyKey}`;
      return runMutation(key, 'create', operationId =>
        lifecycle.create(input, {
          operationId,
        }),
      );
    },
    updateTask(taskId, patch) {
      const key = `update:${taskId}:${JSON.stringify(patch)}`;
      return runMutation(key, 'update', operationId =>
        lifecycle.update(taskId, patch, {
          operationId,
        }),
      );
    },
    completeTask(taskId) {
      return runMutation(`complete:${taskId}`, 'complete', operationId =>
        lifecycle.complete(taskId, {operationId}),
      );
    },
    completeFirstStep(taskId, nextStep) {
      return runMutation(`complete-first-step:${taskId}`, 'complete-first-step', operationId =>
        service.completeFirstStep(
          taskId,
          nextStep === undefined ? {} : {nextStep},
          {operationId},
        ),
      );
    },
    undoFirstStep(taskId) {
      return runMutation(`undo-first-step:${taskId}`, 'undo-first-step', operationId =>
        service.undoFirstStep(taskId, {operationId}),
      );
    },
    undoCompleteTask(taskId, restoreStatus) {
      return runMutation(`undo-complete:${taskId}`, 'undo-complete', operationId =>
        lifecycle.undoComplete(
          taskId,
          restoreStatus,
          {operationId},
        ),
      );
    },
    restoreCompletedTask(taskId) {
      return runMutation(`restore-completed:${taskId}`, 'restore-completed', operationId =>
        lifecycle.restoreCompleted(taskId, {operationId}),
      );
    },
    retryReminderSync() {
      if (reconcileReminders === undefined) {
        return Promise.resolve();
      }
      return reconcileReminders()
        .then(() => {
          if (mountedRef.current) {
            setSnapshot(current => ({...current, reminderSyncErrorText: null}));
          }
        })
        .catch(error => {
          if (mountedRef.current) {
            setSnapshot(current => ({
              ...current,
              reminderSyncErrorText: errorMessage(error),
            }));
          }
          throw error;
        });
    },
    softDeleteTask(taskId) {
      return runMutation(`delete:${taskId}`, 'delete', async operationId => {
        const deleted = await lifecycle.softDelete(taskId, {
          operationId,
        });
        if (mountedRef.current) {
          selectedTaskCacheRef.current = null;
          setSelectedTaskId(current => (current === taskId ? null : current));
        }
        return deleted;
      });
    },
  }), [
    lifecycle,
    reconcileReminders,
    reloadProjection,
    restoreCompletedReview,
    selectedTask,
    snapshot,
    startSelectedTaskDurably,
  ]);

  return (
    <TaskWorkspaceRuntimeContext.Provider value={runtime}>
      {children}
    </TaskWorkspaceRuntimeContext.Provider>
  );
}

export function useTaskWorkspaceRuntime(): TaskWorkspaceRuntime | null {
  return useContext(TaskWorkspaceRuntimeContext);
}
