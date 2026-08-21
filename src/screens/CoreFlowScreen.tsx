import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type {CoreAppService} from '../application/coreAppService';
import {useAppFocusSessionRuntime} from '../app/focusSessionRuntime';
import {useTaskWorkspaceRuntime} from '../app/taskWorkspaceRuntime';
import {selectNextStep} from '../domain/nextStep';
import type {Task} from '../domain/task';
import {FiveMinuteTimer} from '../services/fiveMinuteTimer';

export type CoreFlowTimerState = 'idle' | 'running' | 'paused' | 'finished';

export type CoreFlowTimerSnapshot = {
  state: CoreFlowTimerState;
  durationMs: number;
  remainingMs: number;
};

export type CoreFlowTimerController = {
  getSnapshot(): CoreFlowTimerSnapshot;
  subscribe(listener: (snapshot: CoreFlowTimerSnapshot) => void): () => void;
  start(): void;
  pause(): void;
  resume(): void;
  handleAppState(state: CoreFlowAppState): void;
  dispose(): void;
};

export type CoreFlowAppState = 'active' | 'background' | 'inactive';

export type CoreFlowAppStateSource = {
  addEventListener(
    event: 'change',
    listener: (state: CoreFlowAppState) => void,
  ): {remove(): void};
};

export type CoreFlowScreenProps = {
  service: CoreAppService;
  timerController?: CoreFlowTimerController;
  appStateSource?: CoreFlowAppStateSource;
  onUiCommit?: (kind: CoreFlowUiCommitKind) => void;
  onUiCommitError?: (
    error: unknown,
    kind: CoreFlowUiCommitKind,
  ) => void;
};

export type CoreFlowUiCommitKind =
  | 'activeTask'
  | 'selectedStep'
  | 'error'
  | 'starting';

type ActionButtonProps = {
  label: string;
  onPress(): void;
  disabled?: boolean;
};

let screenOperationSequence = 0;

const defaultAppStateSource: CoreFlowAppStateSource = {
  addEventListener(_event, listener) {
    const subscription = AppState.addEventListener('change', state => {
      if (
        state === 'active' ||
        state === 'background' ||
        state === 'inactive'
      ) {
        listener(state);
      }
    });

    return {
      remove(): void {
        subscription.remove();
      },
    };
  },
};

function snapshotsEqual(
  left: CoreFlowTimerSnapshot,
  right: CoreFlowTimerSnapshot,
): boolean {
  return (
    left.state === right.state &&
    left.durationMs === right.durationMs &&
    left.remainingMs === right.remainingMs
  );
}

export function createDefaultCoreFlowTimerController(options?: {
  durationMs?: number;
  now?: () => number;
}): CoreFlowTimerController {
  const listeners = new Set<(snapshot: CoreFlowTimerSnapshot) => void>();
  let disposed = false;
  let publishing = false;
  let publishAgain = false;
  let lastPublishedSnapshot: CoreFlowTimerSnapshot;
  let scheduledRefresh: ReturnType<typeof setTimeout> | null = null;
  let timer: FiveMinuteTimer;

  function clearScheduledRefresh(): void {
    if (scheduledRefresh === null) {
      return;
    }

    clearTimeout(scheduledRefresh);
    scheduledRefresh = null;
  }

  function readSnapshot(): CoreFlowTimerSnapshot {
    const snapshot = timer.getSnapshot();
    return {
      state: snapshot.state,
      durationMs: snapshot.durationMs,
      remainingMs: snapshot.remainingMs,
    };
  }

  function publish(): void {
    if (disposed) {
      return;
    }
    if (publishing) {
      publishAgain = true;
      return;
    }

    publishing = true;
    try {
      do {
        publishAgain = false;
        const snapshot = readSnapshot();
        if (!snapshotsEqual(snapshot, lastPublishedSnapshot)) {
          lastPublishedSnapshot = snapshot;
          for (const listener of listeners) {
            listener(snapshot);
          }
        }
      } while (publishAgain && !disposed);
    } finally {
      publishing = false;
    }
  }

  function scheduleRefresh(): void {
    clearScheduledRefresh();
    if (disposed) {
      return;
    }

    const snapshot = readSnapshot();
    if (snapshot.state !== 'running') {
      return;
    }

    const remainder = snapshot.remainingMs % 1_000;
    const delayMs = remainder === 0 ? 1_000 : remainder;

    scheduledRefresh = setTimeout(() => {
      scheduledRefresh = null;
      publish();
      scheduleRefresh();
    }, delayMs);
  }

  function createSessionTimer(): FiveMinuteTimer {
    return new FiveMinuteTimer({
      ...(options?.durationMs === undefined
        ? {}
        : {durationMs: options.durationMs}),
      ...(options?.now === undefined ? {} : {now: options.now}),
      onFinish: () => {
        clearScheduledRefresh();
        publish();
      },
    });
  }

  timer = createSessionTimer();
  lastPublishedSnapshot = readSnapshot();

  return {
    getSnapshot(): CoreFlowTimerSnapshot {
      return readSnapshot();
    },
    subscribe(listener): () => void {
      if (disposed) {
        return () => undefined;
      }

      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start(): void {
      if (disposed) {
        return;
      }

      if (readSnapshot().state === 'finished') {
        timer.dispose();
        timer = createSessionTimer();
        lastPublishedSnapshot = readSnapshot();
      }

      timer.start();
      publish();
      scheduleRefresh();
    },
    pause(): void {
      if (disposed) {
        return;
      }
      clearScheduledRefresh();
      timer.pause();
      publish();
    },
    resume(): void {
      if (disposed) {
        return;
      }
      timer.resume();
      publish();
      scheduleRefresh();
    },
    handleAppState(state): void {
      if (disposed) {
        return;
      }
      clearScheduledRefresh();
      timer.handleAppState(state);
      publish();
      scheduleRefresh();
    },
    dispose(): void {
      if (disposed) {
        return;
      }

      clearScheduledRefresh();
      listeners.clear();
      timer.dispose();
      disposed = true;
    },
  };
}

function nextOperationId(action: string): string {
  screenOperationSequence += 1;
  return `core-flow:${action}:${screenOperationSequence}`;
}

function ActionButton({
  label,
  onPress,
  disabled = false,
}: ActionButtonProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && styles.buttonDisabled]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') {
    return error.message;
  }
  return '操作失败，请重试。';
}

function formatRemainingTime(remainingMs: number): string {
  const totalSeconds =
    remainingMs > 0 ? Math.ceil(remainingMs / 1_000) : 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
    2,
    '0',
  )}`;
}

function timerStateText(state: CoreFlowTimerState): string {
  switch (state) {
    case 'running':
      return '进行中';
    case 'paused':
      return '已暂停';
    case 'finished':
      return '已结束';
    case 'idle':
      return '未开始';
  }
}

export function CoreFlowScreen({
  service,
  timerController,
  appStateSource,
  onUiCommit,
  onUiCommitError,
}: CoreFlowScreenProps): React.JSX.Element {
  const appFocusRuntime = useAppFocusSessionRuntime();
  const taskWorkspaceRuntime = useTaskWorkspaceRuntime();
  const workspaceSelectedTaskId = taskWorkspaceRuntime?.selectedTask?.id ?? null;
  const workspaceRecommendationTaskId =
    taskWorkspaceRuntime?.snapshot.recommendation?.id ?? null;
  const workspaceProjectionRevision =
    taskWorkspaceRuntime?.snapshot.revision ?? 0;
  const selectedWorkspaceMode =
    taskWorkspaceRuntime !== null && workspaceSelectedTaskId !== null;
  const persistentFocusRuntime =
    timerController === undefined ? appFocusRuntime : null;
  const resolvedTimerController = useMemo(
    () => timerController ?? createDefaultCoreFlowTimerController(),
    [timerController],
  );
  const resolvedAppStateSource = appStateSource ?? defaultAppStateSource;
  const serviceGeneration = useMemo(
    () => ({}),
    [service, workspaceProjectionRevision, workspaceSelectedTaskId],
  );
  const startGeneration = useMemo(
    () => ({}),
    [
      service,
      resolvedTimerController,
      workspaceProjectionRevision,
      workspaceRecommendationTaskId,
      workspaceSelectedTaskId,
    ],
  );
  const [loaded, setLoaded] = useState(false);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [recommendedTask, setRecommendedTask] = useState<Task | null>(null);
  const [hydratedTasks, setHydratedTasks] = useState<readonly Task[]>([]);
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  const [lastPoints, setLastPoints] = useState<number | null>(null);
  const [totalScore, setTotalScore] = useState(0);
  const [taskTitle, setTaskTitle] = useState('');
  const [stepTitle, setStepTitle] = useState('');
  const [important, setImportant] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [timerSnapshot, setTimerSnapshot] =
    useState<CoreFlowTimerSnapshot>(() =>
      resolvedTimerController.getSnapshot(),
    );
  const displayedTimerSnapshot =
    persistentFocusRuntime?.snapshot ?? timerSnapshot;
  const inFlightActions = useRef(new Map<string, object>());
  const inFlightStart = useRef<object | null>(null);
  const mountedRef = useRef(true);
  const currentServiceGenerationRef = useRef(serviceGeneration);
  const currentStartGenerationRef = useRef(startGeneration);
  const currentTimerControllerRef = useRef(resolvedTimerController);
  const currentAppStateSourceRef = useRef(resolvedAppStateSource);
  const onUiCommitRef = useRef(onUiCommit);
  const onUiCommitErrorRef = useRef(onUiCommitError);
  const taskTitleRef = useRef('');
  const stepTitleRef = useRef('');
  const importantRef = useRef(false);
  const urgentRef = useRef(false);
  const createTaskOperationIdRef = useRef<string | null>(null);
  const addFirstStepOperationIdRef = useRef<string | null>(null);
  const startRecommendedOperationIdRef = useRef<string | null>(null);
  const finishStepOperationIdRef = useRef<string | null>(null);
  const finishTaskOperationIdRef = useRef<string | null>(null);
  const durablyStartedTaskRef = useRef<Task | null>(null);
  const selectedRecommendationContextRef = useRef<Readonly<{
    selectedTaskId: string;
    workspaceRecommendationTaskId: string | null;
  }> | null>(null);
  const hydratedFocusEligibleTaskIdsRef = useRef<readonly string[]>([]);
  const taskCompletionBlockedRef = useRef(false);

  taskCompletionBlockedRef.current =
    persistentFocusRuntime?.taskCompletionBlocked ?? false;

  currentServiceGenerationRef.current = serviceGeneration;
  currentStartGenerationRef.current = startGeneration;
  currentTimerControllerRef.current = resolvedTimerController;
  currentAppStateSourceRef.current = resolvedAppStateSource;
  onUiCommitRef.current = onUiCommit;
  onUiCommitErrorRef.current = onUiCommitError;

  function isCurrentServiceGeneration(generation: object): boolean {
    return (
      mountedRef.current && currentServiceGenerationRef.current === generation
    );
  }

  function isCurrentStartGeneration(generation: object): boolean {
    return (
      mountedRef.current && currentStartGenerationRef.current === generation
    );
  }

  function reportUiCommitFailure(
    error: unknown,
    kind: CoreFlowUiCommitKind,
  ): void {
    try {
      if (onUiCommitErrorRef.current !== undefined) {
        onUiCommitErrorRef.current(error, kind);
        return;
      }
      console.error('CoreFlowScreen UI commit observer failed', kind, error);
    } catch (reportingError) {
      try {
        console.error(
          'CoreFlowScreen UI commit failure reporter failed',
          kind,
          error,
          reportingError,
        );
      } catch {
        // Diagnostics must never interrupt the product continuation.
      }
    }
  }

  function notifyUiCommit(kind: CoreFlowUiCommitKind): void {
    try {
      onUiCommitRef.current?.(kind);
    } catch (error) {
      reportUiCommitFailure(error, kind);
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setTimerSnapshot(resolvedTimerController.getSnapshot());
    const unsubscribe = resolvedTimerController.subscribe(snapshot => {
      if (
        !mountedRef.current ||
        currentTimerControllerRef.current !== resolvedTimerController
      ) {
        return;
      }
      setTimerSnapshot(snapshot);
    });

    return () => {
      unsubscribe();
      resolvedTimerController.dispose();
    };
  }, [resolvedTimerController]);

  useEffect(() => {
    const appStateSubscription = resolvedAppStateSource.addEventListener(
      'change',
      state => {
        if (
          !mountedRef.current ||
          currentTimerControllerRef.current !== resolvedTimerController ||
          currentAppStateSourceRef.current !== resolvedAppStateSource
        ) {
          return;
        }
        resolvedTimerController.handleAppState(state);
      },
    );

    return () => {
      appStateSubscription.remove();
    };
  }, [resolvedAppStateSource, resolvedTimerController]);

  useEffect(() => {
    const generation = serviceGeneration;
    void service
      .getState()
      .then(state => {
        if (!isCurrentServiceGeneration(generation)) {
          return;
        }
        hydratedFocusEligibleTaskIdsRef.current = state.tasks
          .filter(task =>
            task.status === 'in_progress' || selectNextStep(task) !== null,
          )
          .map(task => task.id);
        const hydratedActiveTask =
          workspaceSelectedTaskId === null
            ? state.tasks[0] ?? null
            : state.tasks.find(task => task.id === workspaceSelectedTaskId) ??
              null;
        setHydratedTasks(state.tasks);
        setActiveTask(hydratedActiveTask);
        if (workspaceSelectedTaskId !== null) {
          const selectedIsWorkspaceRecommendation =
            workspaceRecommendationTaskId === workspaceSelectedTaskId;
          selectedRecommendationContextRef.current =
            selectedIsWorkspaceRecommendation
              ? {
                  selectedTaskId: workspaceSelectedTaskId,
                  workspaceRecommendationTaskId,
                }
              : null;
          setRecommendedTask(
            selectedIsWorkspaceRecommendation ? hydratedActiveTask : null,
          );
        }
        setTotalScore(state.totalScore);
        setLoaded(true);
      })
      .catch(error => {
        if (!isCurrentServiceGeneration(generation)) {
          return;
        }
        hydratedFocusEligibleTaskIdsRef.current = [];
        setErrorText(errorMessage(error));
        setLoaded(true);
      });

  }, [
    service,
    serviceGeneration,
    workspaceProjectionRevision,
    workspaceRecommendationTaskId,
    workspaceSelectedTaskId,
  ]);

  useEffect(() => {
    if (loaded) {
      persistentFocusRuntime?.notifyTaskHydrated(
        hydratedFocusEligibleTaskIdsRef.current,
      );
    }
  }, [loaded, persistentFocusRuntime]);

  function selectedRecommendationIsCurrent(task: Task | null): boolean {
    if (!selectedWorkspaceMode) {
      return true;
    }
    const context = selectedRecommendationContextRef.current;
    return (
      task !== null &&
      context !== null &&
      task.id === workspaceSelectedTaskId &&
      taskWorkspaceRuntime?.selectedTask?.id === workspaceSelectedTaskId &&
      context.selectedTaskId === workspaceSelectedTaskId &&
      context.workspaceRecommendationTaskId === workspaceRecommendationTaskId
    );
  }

  async function refreshWorkspaceAfterDurable(): Promise<void> {
    await taskWorkspaceRuntime
      ?.refreshAfterDurableCommit()
      .catch(() => undefined);
  }

  const visibleRecommendedTask = selectedRecommendationIsCurrent(recommendedTask)
    ? recommendedTask
    : null;

  const displayedStep = activeTask?.subtasks[0] ?? null;
  const currentStep = useMemo(
    () =>
      activeTask?.subtasks.find(step => step.id === currentStepId) ?? null,
    [activeTask, currentStepId],
  );
  const recommendedStep = useMemo(
    () =>
      visibleRecommendedTask !== null &&
      visibleRecommendedTask.status !== 'completed' &&
      visibleRecommendedTask.status !== 'cancelled'
        ? selectNextStep(visibleRecommendedTask)
        : null,
    [visibleRecommendedTask],
  );
  const hydratedFocusTask =
    persistentFocusRuntime?.snapshot.activeSession === null ||
    persistentFocusRuntime?.snapshot.activeSession === undefined
      ? null
      : hydratedTasks.find(
          task =>
            task.id === persistentFocusRuntime.snapshot.activeSession?.taskId,
        ) ?? null;
  const focusTask =
    selectedWorkspaceMode && hydratedFocusTask?.id !== workspaceSelectedTaskId
      ? null
      : hydratedFocusTask;
  const timerCanStart =
    displayedTimerSnapshot.state === 'idle' ||
    displayedTimerSnapshot.state === 'finished';
  const canStartRecommendation = recommendedStep !== null && timerCanStart;

  function runAction(
    action: string,
    work: (isCurrent: () => boolean) => Promise<void>,
  ): void {
    const generation = serviceGeneration;
    if (!isCurrentServiceGeneration(generation) || inFlightActions.current.has(action)) {
      return;
    }

    const token = {};
    inFlightActions.current.set(action, token);
    setErrorText(null);
    const isCurrent = (): boolean => isCurrentServiceGeneration(generation);
    void work(isCurrent)
      .catch(error => {
        if (!isCurrent()) {
          return;
        }
        setErrorText(errorMessage(error));
      })
      .finally(() => {
        if (inFlightActions.current.get(action) === token) {
          inFlightActions.current.delete(action);
        }
      });
  }

  function saveTask(): void {
    const operationId =
      createTaskOperationIdRef.current ?? nextOperationId('create-task');
    createTaskOperationIdRef.current = operationId;

    runAction('create-task', async isCurrent => {
      const created = await service.createTask(
        {
          title: taskTitleRef.current,
          important: importantRef.current,
          urgent: urgentRef.current,
        },
        {operationId},
      );
      createTaskOperationIdRef.current = null;
      await refreshWorkspaceAfterDurable();
      if (!isCurrent()) {
        return;
      }
      setActiveTask(created);
      setRecommendedTask(null);
      setCurrentStepId(null);
      setLastPoints(null);
      setTaskTitle('');
      taskTitleRef.current = '';
    });
  }

  function saveFirstStep(): void {
    if (activeTask === null) {
      setErrorText('请先新建任务。');
      return;
    }
    const taskId = activeTask.id;
    const operationId =
      addFirstStepOperationIdRef.current ??
      nextOperationId('add-first-step');
    addFirstStepOperationIdRef.current = operationId;

    runAction('add-first-step', async isCurrent => {
      const updated = await service.addFirstStep(
        taskId,
        {title: stepTitleRef.current},
        {operationId},
      );
      addFirstStepOperationIdRef.current = null;
      await refreshWorkspaceAfterDurable();
      if (!isCurrent()) {
        return;
      }
      setActiveTask(updated);
      setStepTitle('');
      stepTitleRef.current = '';
    });
  }

  function chooseRecommendation(): void {
    if (selectedWorkspaceMode) {
      const selectedTaskId = workspaceSelectedTaskId;
      const selectedTask = activeTask;
      const recommendationId = workspaceRecommendationTaskId;
      runAction('choose-selected-task', async isCurrent => {
        if (
          selectedTaskId === null ||
          selectedTask === null ||
          selectedTask.id !== selectedTaskId ||
          taskWorkspaceRuntime?.selectedTask?.id !== selectedTaskId
        ) {
          throw new Error('SELECTED_TASK_CHANGED');
        }
        if (!isCurrent()) {
          return;
        }
        selectedRecommendationContextRef.current = {
          selectedTaskId,
          workspaceRecommendationTaskId: recommendationId,
        };
        setRecommendedTask(selectedTask);
      });
      return;
    }
    runAction('choose-recommendation', async isCurrent => {
      const recommended = await service.chooseRecommended();
      if (!isCurrent()) {
        return;
      }
      setRecommendedTask(recommended);
    });
  }

  function startRecommendation(): void {
    const generation = startGeneration;
    const currentTimerState =
      persistentFocusRuntime?.snapshot.state ??
      resolvedTimerController.getSnapshot().state;
    if (
      !isCurrentStartGeneration(generation) ||
      recommendedStep === null ||
      !selectedRecommendationIsCurrent(visibleRecommendedTask) ||
      (currentTimerState !== 'idle' && currentTimerState !== 'finished') ||
      inFlightStart.current !== null
    ) {
      return;
    }

    const token = {};
    const operationId =
      startRecommendedOperationIdRef.current ??
      nextOperationId('start-recommended');
    startRecommendedOperationIdRef.current = operationId;
    inFlightStart.current = token;
    setErrorText(null);
    setStarting(true);
    notifyUiCommit('starting');
    if (!isCurrentStartGeneration(generation)) {
      if (inFlightStart.current === token) {
        inFlightStart.current = null;
      }
      if (mountedRef.current) {
        setStarting(false);
      }
      return;
    }

    const durablyStarted = durablyStartedTaskRef.current;
    const taskStart =
      durablyStarted !== null && durablyStarted.id === visibleRecommendedTask?.id
        ? Promise.resolve(durablyStarted)
        : (selectedWorkspaceMode && workspaceSelectedTaskId !== null
            ? taskWorkspaceRuntime?.startSelectedTask(workspaceSelectedTaskId) ??
              Promise.reject(new Error('TASK_WORKSPACE_UNAVAILABLE'))
            : service.startRecommended({operationId})).then(started => {
            durablyStartedTaskRef.current = started;
            return started;
          });

    void taskStart
      .then(async started => {
        await persistentFocusRuntime?.start(started.id);
        startRecommendedOperationIdRef.current = null;
        durablyStartedTaskRef.current = null;
        await refreshWorkspaceAfterDurable();
        return started;
      })
      .then(started => {
        if (!isCurrentStartGeneration(generation)) {
          return;
        }

        notifyUiCommit('activeTask');
        if (!isCurrentStartGeneration(generation)) {
          return;
        }
        setActiveTask(started);
        setRecommendedTask(started);

        const selectedStepId = selectNextStep(started)?.id ?? null;
        notifyUiCommit('selectedStep');
        if (!isCurrentStartGeneration(generation)) {
          return;
        }
        setCurrentStepId(selectedStepId);

        if (!isCurrentStartGeneration(generation)) {
          return;
        }
        if (persistentFocusRuntime === null) {
          resolvedTimerController.start();
        }
      })
      .catch(error => {
        if (!isCurrentStartGeneration(generation)) {
          return;
        }
        notifyUiCommit('error');
        if (!isCurrentStartGeneration(generation)) {
          return;
        }
        setErrorText(errorMessage(error));
      })
      .finally(() => {
        if (inFlightStart.current === token) {
          inFlightStart.current = null;
        }
        if (mountedRef.current) {
          setStarting(false);
        }
      });
  }

  function pauseTimer(): void {
    try {
      resolvedTimerController.pause();
    } catch (error) {
      setErrorText(errorMessage(error));
    }
  }

  function resumeTimer(): void {
    try {
      resolvedTimerController.resume();
    } catch (error) {
      setErrorText(errorMessage(error));
    }
  }

  function interruptFocus(): void {
    if (persistentFocusRuntime === null) {
      return;
    }
    runAction('interrupt-focus', async isCurrent => {
      await persistentFocusRuntime.interrupt();
      if (!isCurrent()) {
        return;
      }
      setCurrentStepId(null);
    });
  }

  function finishCurrentStep(): void {
    if (activeTask === null || currentStepId === null) {
      setErrorText('当前没有可完成的小步。');
      return;
    }
    const taskId = activeTask.id;
    const stepId = currentStepId;
    const operationId =
      finishStepOperationIdRef.current ?? nextOperationId('finish-step');
    finishStepOperationIdRef.current = operationId;

    runAction('finish-step', async isCurrent => {
      const updated = await service.finishStep(taskId, stepId, {
        operationId,
      });
      finishStepOperationIdRef.current = null;
      await refreshWorkspaceAfterDurable();
      if (!isCurrent()) {
        return;
      }
      setActiveTask(updated);
      setRecommendedTask(updated);
    });
  }

  function finishActiveTask(): void {
    if (taskCompletionBlockedRef.current) {
      setErrorText('FOCUS_SESSION_ACTIVE');
      return;
    }
    if (activeTask === null) {
      setErrorText('当前没有可完成的任务。');
      return;
    }
    const taskId = activeTask.id;
    const operationId =
      finishTaskOperationIdRef.current ?? nextOperationId('finish-task');
    finishTaskOperationIdRef.current = operationId;

    runAction('finish-task', async isCurrent => {
      if (taskCompletionBlockedRef.current) {
        throw new Error('FOCUS_SESSION_ACTIVE');
      }
      const completion = await service.finishTask(taskId, {
        operationId,
      });
      finishTaskOperationIdRef.current = null;
      await refreshWorkspaceAfterDurable();
      if (!isCurrent()) {
        return;
      }
      setActiveTask(completion.task);
      setRecommendedTask(null);
      setLastPoints(completion.points);
      const state = await service.getState();
      if (!isCurrent()) {
        return;
      }
      setTotalScore(state.totalScore);
    });
  }

  const canFinishTask =
    activeTask?.status === 'in_progress' &&
    activeTask.subtasks.every(step => step.status === 'completed') &&
    !taskCompletionBlockedRef.current;
  const canAddFirstStep =
    activeTask !== null &&
    activeTask.status !== 'completed' &&
    activeTask.status !== 'cancelled';

  return (
    <View style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          先做5分钟
        </Text>
        <Text style={styles.subtitle}>不要求一次完成，只要求现在开始。</Text>

        {!selectedWorkspaceMode ? (
          <>
            <ActionButton
              label="新建任务"
              onPress={() => {
                createTaskOperationIdRef.current = null;
                taskTitleRef.current = '';
                importantRef.current = false;
                urgentRef.current = false;
                setTaskTitle('');
                setImportant(false);
                setUrgent(false);
                setErrorText(null);
              }}
            />

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>新建任务</Text>
              <TextInput
                accessibilityLabel="任务名称"
                onChangeText={value => {
                  createTaskOperationIdRef.current = null;
                  taskTitleRef.current = value;
                  setTaskTitle(value);
                }}
                placeholder="例如：写周报"
                style={styles.input}
                value={taskTitle}
              />
              <View style={styles.checkboxRow}>
                <Pressable
                  accessibilityLabel="重要"
                  accessibilityRole="checkbox"
                  accessibilityState={{checked: important}}
                  onPress={() => {
                    createTaskOperationIdRef.current = null;
                    const nextValue = !importantRef.current;
                    importantRef.current = nextValue;
                    setImportant(nextValue);
                  }}
                  style={[
                    styles.checkbox,
                    important && styles.checkboxSelected,
                  ]}>
                  <Text style={styles.checkboxText}>重要</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="紧急"
                  accessibilityRole="checkbox"
                  accessibilityState={{checked: urgent}}
                  onPress={() => {
                    createTaskOperationIdRef.current = null;
                    const nextValue = !urgentRef.current;
                    urgentRef.current = nextValue;
                    setUrgent(nextValue);
                  }}
                  style={[styles.checkbox, urgent && styles.checkboxSelected]}>
                  <Text style={styles.checkboxText}>紧急</Text>
                </Pressable>
              </View>
              <ActionButton label="保存任务" onPress={saveTask} />
            </View>
          </>
        ) : null}

        {!selectedWorkspaceMode && loaded && activeTask === null ? (
          <Text accessibilityLiveRegion="polite" style={styles.emptyState}>
            还没有任务，先新建一项吧。
          </Text>
        ) : null}

        {activeTask !== null ? (
          <View style={styles.card}>
            <Text style={styles.taskText}>任务：{activeTask.title}</Text>
            <Text style={styles.metaText}>
        总成长值：{totalScore}
            </Text>
            {canAddFirstStep ? (
              <>
                <ActionButton
                  label="添加第一小步"
                  onPress={() => setErrorText(null)}
                />

                <View style={styles.formSection}>
                  <TextInput
                    accessibilityLabel="第一小步"
                    onChangeText={value => {
                      addFirstStepOperationIdRef.current = null;
                      stepTitleRef.current = value;
                      setStepTitle(value);
                    }}
                    placeholder="例如：打开文档"
                    style={styles.input}
                    value={stepTitle}
                  />
                  <ActionButton label="保存小步" onPress={saveFirstStep} />
                </View>
              </>
            ) : null}

            {displayedStep !== null ? (
              <>
                <Text style={styles.stepText}>小步：{displayedStep.title}</Text>
                {displayedStep.status === 'completed' ? (
                  <Text accessibilityLiveRegion="polite" style={styles.metaText}>
                    小步状态：已完成
                  </Text>
                ) : null}
              </>
            ) : null}

            <ActionButton label="推荐下一项" onPress={chooseRecommendation} />

            {visibleRecommendedTask !== null ? (
              <>
                <Text accessibilityLiveRegion="polite" style={styles.taskText}>
                  推荐：{visibleRecommendedTask.title}
                </Text>
                <ActionButton
                  disabled={!canStartRecommendation || starting}
                  label="开始5分钟"
                  onPress={startRecommendation}
                />
              </>
            ) : null}

            <View style={styles.timerSection}>
              <Text
                accessibilityLabel="5分钟计时状态"
                accessibilityLiveRegion="polite"
                style={styles.metaText}>
                计时状态：{timerStateText(displayedTimerSnapshot.state)}
              </Text>
              <Text
                accessibilityLabel="5分钟剩余时间"
                style={styles.timerText}>
                剩余时间：
                {formatRemainingTime(displayedTimerSnapshot.remainingMs)}
              </Text>
              {focusTask !== null ? (
                <Text style={styles.taskText}>
                  专注任务：{focusTask.title}
                </Text>
              ) : null}
              {persistentFocusRuntime !== null &&
              displayedTimerSnapshot.state === 'running' &&
              !persistentFocusRuntime.lifecyclePending ? (
                <ActionButton label="中断专注" onPress={interruptFocus} />
              ) : null}
              {persistentFocusRuntime?.restoreRetryAvailable ? (
                <ActionButton
                  label="重试恢复专注"
                  onPress={persistentFocusRuntime.retryRestore}
                />
              ) : null}
              {persistentFocusRuntime?.finishRetryAvailable ? (
                <ActionButton
                  label="重试结束专注"
                  onPress={persistentFocusRuntime.retryFinish}
                />
              ) : null}
              {persistentFocusRuntime === null &&
              displayedTimerSnapshot.state === 'running' ? (
                <ActionButton label="暂停计时" onPress={pauseTimer} />
              ) : null}
              {persistentFocusRuntime === null &&
              displayedTimerSnapshot.state === 'paused' ? (
                <ActionButton label="继续计时" onPress={resumeTimer} />
              ) : null}
              {displayedTimerSnapshot.state === 'finished' ? (
                <Text accessibilityLiveRegion="polite" style={styles.scoreText}>
                  5分钟已结束，可以继续下一小步。
                </Text>
              ) : null}
            </View>

            {currentStep !== null ? (
              <>
                <Text accessibilityLiveRegion="polite" style={styles.stepText}>
                  当前小步：{currentStep.title}
                </Text>
                {currentStep.status === 'pending' ? (
                  <ActionButton label="完成小步" onPress={finishCurrentStep} />
                ) : null}
              </>
            ) : null}

            {canFinishTask ? (
              <ActionButton label="完成任务" onPress={finishActiveTask} />
            ) : null}

            {lastPoints !== null ? (
              <Text accessibilityLiveRegion="polite" style={styles.scoreText}>
                  本次积分：{lastPoints}
              </Text>
            ) : null}
          </View>
        ) : null}

        {errorText !== null ? (
          <Text accessibilityLiveRegion="assertive" style={styles.errorText}>
            {errorText}
          </Text>
        ) : null}
        {persistentFocusRuntime?.errorText !== null &&
        persistentFocusRuntime?.errorText !== undefined ? (
          <Text accessibilityLiveRegion="assertive" style={styles.errorText}>
            {persistentFocusRuntime.errorText}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F8F7',
  },
  content: {
    flexGrow: 1,
    padding: 20,
    gap: 12,
  },
  title: {
    color: '#173F3A',
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    color: '#526A66',
    fontSize: 15,
    marginBottom: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    color: '#173F3A',
    fontSize: 18,
    fontWeight: '700',
  },
  formSection: {
    gap: 10,
  },
  timerSection: {
    gap: 10,
  },
  input: {
    minHeight: 48,
    borderColor: '#91A9A5',
    borderRadius: 12,
    borderWidth: 1,
    color: '#173F3A',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  checkboxRow: {
    flexDirection: 'row',
    gap: 12,
  },
  checkbox: {
    minHeight: 44,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: '#91A9A5',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  checkboxSelected: {
    backgroundColor: '#D5ECE7',
    borderColor: '#247A6B',
    borderWidth: 2,
  },
  checkboxText: {
    color: '#173F3A',
    fontSize: 15,
    fontWeight: '600',
  },
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#247A6B',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyState: {
    color: '#526A66',
    fontSize: 15,
    paddingVertical: 16,
    textAlign: 'center',
  },
  taskText: {
    color: '#173F3A',
    fontSize: 17,
    fontWeight: '700',
  },
  stepText: {
    color: '#294E48',
    fontSize: 16,
    fontWeight: '600',
  },
  metaText: {
    color: '#526A66',
    fontSize: 14,
  },
  timerText: {
    color: '#294E48',
    fontSize: 18,
    fontWeight: '700',
  },
  scoreText: {
    color: '#176B32',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  errorText: {
    color: '#9C2F24',
    fontSize: 14,
  },
});
