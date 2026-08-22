import React from 'react';
import {
  createCoreAppService,
  createTaskLifecycleService,
  type CoreAppService,
  type NetworkAdapter,
  type WorkspaceCoreAppService,
  type WorkspaceTaskLifecycleService,
} from '../application/coreAppService';
import {createCurrentFocusSessionService} from '../application/currentFocusSessionService';
import {
  createFocusSessionService,
  type CurrentFocusSessionService,
} from '../application/focusSessionService';
import {
  createFocusScheduleService,
  type FocusScheduleService,
} from '../application/focusScheduleService';
import {createDayClosureService} from '../application/dayClosureService';
import {
  createPostFocusReviewService,
  type ReceiptHistorySnapshot,
} from '../application/postFocusReviewService';
import {startTask} from '../domain/task';
import {
  TASK_GROWTH_SCHEMA_VERSION,
  awardFirstStartReward,
} from '../domain/growth';
import {
  TASK_SUPPORT_SCHEMA_VERSION,
  nextStartAtForTask,
} from '../domain/taskSupport';
import {isTaskInQuadrants} from '../domain/taskOrganization';
import {
  effectiveQuadrantForTask,
  effectiveUrgencyForTask,
  priorityCoordinatesForTask,
} from '../domain/taskPriority';
import {createCurrentFocusSessionRepository} from '../data/currentFocusSessionRepository';
import {createFocusSessionRepository} from '../data/focusSessionRepository';
import {createFocusScheduleRepository} from '../data/focusScheduleRepository';
import {createDayClosureRepository} from '../data/dayClosureRepository';
import {createPostFocusReviewRepository} from '../data/postFocusReviewRepository';
import {createCurrentFocusSessionStorage} from '../data/currentFocusSessionStorage';
import {createPersistentFocusSessionStorage} from '../data/persistentFocusSessionStorage';
import {
  createPersistentTaskStorage,
  type AsyncKeyValueBackend,
} from '../data/persistentTaskStorage';
import {
  createTaskDurablePresenceProbe,
  createTaskBackupAdapter,
  createTaskRepository,
  type TaskDurablePresenceProbe,
  type TaskRepository,
} from '../data/taskRepository';
import {QuadrantHomeScreen} from '../screens/QuadrantHomeScreen';
import {CoreFlowScreen} from '../screens/CoreFlowScreen';
import {PostFocusReviewScreen} from '../screens/PostFocusReviewScreen';
import {
  FocusSessionRuntimeProvider,
  type FocusRuntimeClock,
} from './focusSessionRuntime';
import {
  PostFocusReviewRuntimeProvider,
} from './postFocusReviewRuntime';
import {TaskWorkspaceRuntimeProvider} from './taskWorkspaceRuntime';
import {
  createTomorrowFirstReminderService,
  TOMORROW_FIRST_TIME_SEAMS_PARTIAL,
  type LocalTriggerInput,
  type TomorrowFirstNotifications,
} from '../application/tomorrowFirstNotifications';
import {createFirstActivationService} from '../application/firstActivationService';
import {
  createFirstActivationRepository,
} from '../data/firstActivationRepository';
import {hasExistingUserData} from '../data/userDataPresence';
import {FirstActivationReadError} from '../screens/FirstActivationScreen';
import {createCoordinatedBackend} from '../data/coordinatedBackend';
import {createQuadrantHomePreferences} from '../data/quadrantHomePreferences';
import {createQuadrantTaskLayoutRepository} from '../data/quadrantTaskLayoutStore';
import {createTaskDraftStore} from '../data/taskDraftStore';
import {
  createLocalBackupService,
  type LocalBackupService,
} from '../application/localBackupService';
import type {BackupFileBridge} from '../screens/LocalBackupScreen';
import {
  NoopProductMetricPort,
  SYSTEM_PRODUCT_METRIC_CLOCK,
  type ProductMetricClock,
  type ProductMetricPort,
} from '../application/productMetrics';

export type StartFiveAppDependencies = {
  storageBackend: AsyncKeyValueBackend;
  now(): string;
  idGenerator(): string;
  network?: NetworkAdapter;
  focusRuntimeClock?: FocusRuntimeClock;
  tomorrowFirstNotifications?: TomorrowFirstNotifications;
  currentTimeZone?(): string;
  resolveLocalTrigger?(input: LocalTriggerInput): string;
  resolveFocusScheduleTrigger?(input: Readonly<{
    localDateKey: string;
    localTime: string;
    timeZone: string;
  }>): string;
  backupFileBridge?: BackupFileBridge;
  productMetricPort?: ProductMetricPort;
  productMetricClock?: ProductMetricClock;
  productMetricSessionId?: string;
  public?: Readonly<{
    firstActivation?: Readonly<{
      enabled: true;
      taskDurablePresenceProbe?: TaskDurablePresenceProbe;
    }>;
  }>;
};

export type StartFiveAppComposition = {
  repository: TaskRepository;
  service: WorkspaceCoreAppService;
  reviewHistory: Readonly<{
    listReceiptHistory(): Promise<ReceiptHistorySnapshot>;
  }>;
  localBackup: LocalBackupService;
  focusSchedules: FocusScheduleService;
  AppRoot: React.ComponentType;
};

function createDefaultFocusRuntimeClock(): FocusRuntimeClock {
  return {
    nowMs: Date.now,
    subscribe(listener) {
      const interval = setInterval(listener, 1_000);
      return () => clearInterval(interval);
    },
  };
}

export function createStartFiveApp(
  dependencies: StartFiveAppDependencies,
): StartFiveAppComposition {
  const currentExperience =
    dependencies.focusRuntimeClock !== undefined ||
    dependencies.tomorrowFirstNotifications !== undefined ||
    dependencies.currentTimeZone !== undefined ||
    dependencies.resolveLocalTrigger !== undefined ||
    dependencies.backupFileBridge !== undefined ||
    dependencies.productMetricPort !== undefined ||
    dependencies.productMetricClock !== undefined ||
    dependencies.productMetricSessionId !== undefined ||
    dependencies.public?.firstActivation?.enabled === true;
  const productMetricPort =
    dependencies.productMetricPort ?? new NoopProductMetricPort();
  const productMetricClock =
    dependencies.productMetricClock ?? SYSTEM_PRODUCT_METRIC_CLOCK;
  const productMetricSessionId =
    dependencies.productMetricSessionId ??
    `local-${productMetricClock.now()}-${Math.round(productMetricClock.monotonicNow())}`;
  const homeStartedAtMs = productMetricClock.monotonicNow();
  const hasCurrentTimeZone = dependencies.currentTimeZone !== undefined;
  const hasLocalTriggerResolver = dependencies.resolveLocalTrigger !== undefined;
  if (hasCurrentTimeZone !== hasLocalTriggerResolver) {
    throw new Error(TOMORROW_FIRST_TIME_SEAMS_PARTIAL);
  }
  const coordinatedBackend = createCoordinatedBackend(
    dependencies.storageBackend,
  );
  const storage = createPersistentTaskStorage(coordinatedBackend);
  const quadrantHomePreferences = createQuadrantHomePreferences(
    coordinatedBackend,
  );
  const quadrantTaskLayout = createQuadrantTaskLayoutRepository(coordinatedBackend);
  const taskDrafts = createTaskDraftStore(coordinatedBackend);
  const taskDurablePresenceProbe =
    dependencies.public?.firstActivation?.taskDurablePresenceProbe ??
    createTaskDurablePresenceProbe(storage);
  const repository = createTaskRepository(storage);
  const service = createCoreAppService({
    repository,
    now: dependencies.now,
    idGenerator: dependencies.idGenerator,
    ...(dependencies.network === undefined
      ? {}
      : {network: dependencies.network}),
  }) as WorkspaceCoreAppService;
  const taskLifecycle = createTaskLifecycleService({
    repository,
    now: dependencies.now,
    idGenerator: dependencies.idGenerator,
  }) as WorkspaceTaskLifecycleService;
  const selectedStartInFlight = new Map<string, Readonly<{
    taskId: string;
    promise: Promise<import('../domain/task').Task>;
  }>>();

  function startSelectedTask(
    taskId: string,
    operationId: string,
  ): Promise<import('../domain/task').Task> {
    const existing = selectedStartInFlight.get(operationId);
    if (existing !== undefined) {
      if (existing.taskId !== taskId) {
        return Promise.reject(new Error('OPERATION_ID_REUSED'));
      }
      return existing.promise;
    }
    const promise = repository.transaction(async transaction => {
      const task = await transaction.getById(taskId);
      if (task === null) {
        throw new Error('TASK_NOT_FOUND');
      }
      if (
        task.deletedAt !== null ||
        task.status === 'completed' ||
        task.status === 'cancelled'
      ) {
        throw new Error('TERMINAL_TASK');
      }
      if (!isTaskInQuadrants(task)) {
        throw new Error('TASK_REQUIRES_PLACEMENT');
      }
      const observedAt = dependencies.now();
      const started = startTask(task, observedAt);
      const reward = awardFirstStartReward(started, observedAt);
      const pendingNextStart = nextStartAtForTask(task);
      if (started === task && reward.points === 0 && pendingNextStart === null) {
        return task;
      }
      const {id, ...basePatch} = reward.task;
      void id;
      const patch = basePatch as typeof basePatch & {
        supportSchemaVersion?: typeof TASK_SUPPORT_SCHEMA_VERSION;
        nextStartAt?: string | null;
        growthSchemaVersion?: typeof TASK_GROWTH_SCHEMA_VERSION;
      };
      if (pendingNextStart !== null) {
        patch.supportSchemaVersion = TASK_SUPPORT_SCHEMA_VERSION;
        patch.nextStartAt = null;
      }
      return transaction.update(taskId, patch);
    });
    selectedStartInFlight.set(operationId, {taskId, promise});
    void promise.finally(() => {
      const current = selectedStartInFlight.get(operationId);
      if (current?.promise === promise) {
        selectedStartInFlight.delete(operationId);
      }
    }).catch(() => undefined);
    return promise;
  }
  let lastFocusNow: string | null = null;
  const focusNow = (): string => {
    const value = dependencies.now();
    lastFocusNow = value;
    return value;
  };
  let focusWriteTail = Promise.resolve();
  const enqueueFocusWrite = (work: () => Promise<void>): Promise<void> => {
    const result = focusWriteTail.then(work);
    focusWriteTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  const createFocusBackend = (
    writeIsCurrent: () => boolean,
  ): AsyncKeyValueBackend => {
    const backend = coordinatedBackend;
    return {
      getItem: key => backend.getItem(key),
      setItem: (key, value) =>
        enqueueFocusWrite(() => {
          if (!writeIsCurrent()) {
            throw new Error('FOCUS_SESSION_RESTORE_STALE');
          }
          return backend.setItem(key, value);
        }),
      removeItem: key =>
        enqueueFocusWrite(() => {
          if (!writeIsCurrent()) {
            throw new Error('FOCUS_SESSION_RESTORE_STALE');
          }
          return backend.removeItem(key);
        }),
    };
  };
  const createFocusService = (backend: AsyncKeyValueBackend): CurrentFocusSessionService => {
    if (!currentExperience) {
      return createFocusSessionService({
        repository: createFocusSessionRepository(
          createPersistentFocusSessionStorage(backend),
        ),
        now: focusNow,
        idGenerator: dependencies.idGenerator,
      }) as unknown as CurrentFocusSessionService;
    }
    return createCurrentFocusSessionService({
      repository: createCurrentFocusSessionRepository(
        createCurrentFocusSessionStorage(backend),
      ),
      now: focusNow,
      idGenerator: dependencies.idGenerator,
      async resolveContextSnapshot(taskId, startedAt, focusScheduleId) {
        const task = await repository.getById(taskId);
        if (task === null) return null;
        const coordinates = priorityCoordinatesForTask(task);
        const firstStepId = task.steps
          ?.filter(step => step.status === 'ACTIVE' || step.status === 'PENDING')
          .sort((left, right) => left.order - right.order)[0]?.id;
        return {
          taskId,
          quadrantAtStart: effectiveQuadrantForTask(task, startedAt),
          importanceScoreAtStart: coordinates.importanceScore,
          effectiveUrgencyAtStart: effectiveUrgencyForTask(task, startedAt),
          ...(task.dueAt === null ? {} : {dueAtAtStart: task.dueAt}),
          ...(firstStepId === undefined ? {} : {firstStepIdAtStart: firstStepId}),
          ...(focusScheduleId === undefined ? {} : {focusScheduleId}),
        };
      },
    });
  };
  const focusService = createFocusService(createFocusBackend(() => true));
  const focusScheduleTimeZone = () =>
    dependencies.currentTimeZone?.() ??
    Intl.DateTimeFormat().resolvedOptions().timeZone ??
    'UTC';
  const resolveFocusScheduleTrigger = (input: Readonly<{
    localDateKey: string;
    localTime: string;
    timeZone: string;
  }>): string => {
    if (dependencies.resolveFocusScheduleTrigger !== undefined) {
      return dependencies.resolveFocusScheduleTrigger(input);
    }
    if (dependencies.resolveLocalTrigger !== undefined) {
      return dependencies.resolveLocalTrigger({
        closureDayKey: input.localDateKey,
        wallClockTime: input.localTime,
        timeZone: input.timeZone,
        now: dependencies.now(),
      });
    }
    return new Date(`${input.localDateKey}T${input.localTime}:00`).toISOString();
  };
  const focusSchedules = createFocusScheduleService({
    repository: createFocusScheduleRepository(coordinatedBackend),
    now: dependencies.now,
    idGenerator: dependencies.idGenerator,
    currentTimeZone: focusScheduleTimeZone,
    resolveLocalTrigger: resolveFocusScheduleTrigger,
    ...(dependencies.tomorrowFirstNotifications === undefined
      ? {}
      : {notifications: dependencies.tomorrowFirstNotifications}),
  });
  const firstActivationService = createFirstActivationService({
    repository: createFirstActivationRepository(coordinatedBackend),
    tasks: taskLifecycle,
    focus: focusService,
    startSelectedTask,
    idGenerator: dependencies.idGenerator,
  });
  const postFocusReviewService = createPostFocusReviewService({
    repository: createPostFocusReviewRepository(coordinatedBackend),
    focusService,
    taskLifecycle,
    now: dependencies.now,
    currentTimeZone: focusScheduleTimeZone,
  });
  const reviewHistory = {
    listReceiptHistory: () => postFocusReviewService.listReceiptHistory(),
  };
  const dayClosureService = createDayClosureService({
    repository: createDayClosureRepository(coordinatedBackend),
    tasks: taskLifecycle,
    focus: focusService,
    history: reviewHistory,
    now: dependencies.now,
    currentTimeZone: focusScheduleTimeZone,
    startSelectedTask,
  });
  const focusRuntimeClock =
    dependencies.focusRuntimeClock ?? createDefaultFocusRuntimeClock();
  const tomorrowFirstReminder =
    dependencies.tomorrowFirstNotifications === undefined
      ? undefined
      : createTomorrowFirstReminderService({
          backend: coordinatedBackend,
          notifications: dependencies.tomorrowFirstNotifications,
          now: dependencies.now,
          settingsEnabled: hasCurrentTimeZone && hasLocalTriggerResolver,
          ...(dependencies.currentTimeZone === undefined
            ? {}
            : {currentTimeZone: dependencies.currentTimeZone}),
          ...(dependencies.resolveLocalTrigger === undefined
            ? {}
            : {resolveLocalTrigger: dependencies.resolveLocalTrigger}),
        });
  const localBackup = createLocalBackupService({
    backend: coordinatedBackend,
    tasks: createTaskBackupAdapter(coordinatedBackend.raw),
    reloadTasks: repository.reload,
    async reconcileNotifications() {
      if (tomorrowFirstReminder !== undefined) {
        await tomorrowFirstReminder.reconcile(await dayClosureService.load());
      }
      const taskSnapshot = await service.getState();
      for (const schedule of await focusSchedules.list()) {
        const target = schedule.target;
        const task = target.kind === 'TASK'
          ? taskSnapshot.tasks.find(candidate => candidate.id === target.taskId)
          : undefined;
        await focusSchedules.reconcile(schedule, task === undefined ? undefined : {
          taskId: task.id,
          title: task.title,
          firstStep: task.firstStep ?? '继续当前这一小步',
        });
      }
    },
    now: dependencies.now,
  });

  function createRestoreService(writeIsCurrent: () => boolean) {
    return createFocusService(createFocusBackend(writeIsCurrent));
  }

  function ProductRoot(): React.JSX.Element {
    return (
      <PostFocusReviewRuntimeProvider service={postFocusReviewService}>
        <FocusSessionRuntimeProvider
          clock={focusRuntimeClock}
          createRestoreService={createRestoreService}
          lastObservedNow={() => lastFocusNow}
          reviewService={postFocusReviewService}
          service={focusService}>
          <TaskWorkspaceRuntimeProvider
            lifecycle={taskLifecycle}
            reconcileReminders={async () => {
              if (tomorrowFirstReminder !== undefined) {
                await tomorrowFirstReminder.reconcile(
                  await dayClosureService.load(),
                );
              }
            }}
            reloadProjection={repository.reload}
            restoreCompletedReview={postFocusReviewService.restore}
            service={service}
            startSelectedTask={startSelectedTask}>
            <AppContent />
          </TaskWorkspaceRuntimeProvider>
        </FocusSessionRuntimeProvider>
      </PostFocusReviewRuntimeProvider>
    );
  }

  function LegacyProductRoot(): React.JSX.Element {
    return (
      <FocusSessionRuntimeProvider
        clock={focusRuntimeClock}
        createRestoreService={createRestoreService}
        lastObservedNow={() => lastFocusNow}
        reviewService={{
          async trackStartedSession() {},
          async trackRestoredSession() {},
          async captureEndedSession() {},
          async recoverTrackedSession() {},
          async recoverEligibleSessions() {},
        }}
        service={focusService}>
        <CoreFlowScreen service={service as CoreAppService} />
      </FocusSessionRuntimeProvider>
    );
  }

  type BootState = 'checking' | 'existing' | 'error';
  function AppRoot(): React.JSX.Element {
    const activationEnabled = dependencies.public?.firstActivation?.enabled === true;
    const [boot, setBoot] = React.useState<BootState>('checking');
    const [bootGeneration, setBootGeneration] = React.useState(0);

    React.useEffect(() => {
      let current = true;
      void (async () => {
        try {
          if (!currentExperience) {
            if (current) setBoot('existing');
            return;
          }
          await localBackup.recoverPendingRestore();
          if (!activationEnabled) {
            if (current) setBoot('existing');
            return;
          }
          const activation = await firstActivationService.read();
          if (activation !== null) {
            if (activation.state === 'creating' || activation.state === 'created') {
              await firstActivationService.activate(activation.title ?? '');
            }
            if (current) {
              setBoot('existing');
            }
            return;
          }
          if ((await taskDurablePresenceProbe.probe()) === 'present') {
            if (current) {
              setBoot('existing');
            }
            return;
          }
          if (await hasExistingUserData(coordinatedBackend)) {
            if (current) {
              setBoot('existing');
            }
            return;
          }
          await firstActivationService.skip();
          if (current) setBoot('existing');
        } catch {
          if (current) {
            setBoot('error');
          }
        }
      })();
      return () => {
        current = false;
      };
    }, [activationEnabled, bootGeneration]);

    if (boot === 'checking') {
      return <></>;
    }
    if (boot === 'error') {
      return (
        <FirstActivationReadError
          onRetry={() => {
            setBoot('checking');
            setBootGeneration(generation => generation + 1);
          }}
        />
      );
    }
    return currentExperience ? <ProductRoot /> : <LegacyProductRoot />;
  }

  function AppContent(): React.JSX.Element {
    return (
      <QuadrantHomeScreen
        dayClosure={dayClosureService}
        homeStartedAtMs={homeStartedAtMs}
        metricClock={productMetricClock}
        metricPort={productMetricPort}
        metricSessionId={productMetricSessionId}
        focusHistory={focusService}
        focusSchedules={focusSchedules}
        now={dependencies.now}
        preferences={quadrantHomePreferences}
        taskLayoutStore={quadrantTaskLayout}
        taskDrafts={taskDrafts}
        {...(dependencies.currentTimeZone === undefined
          ? {}
          : {currentTimeZone: dependencies.currentTimeZone})}
        {...(dependencies.resolveLocalTrigger === undefined
          ? {}
          : {resolveLocalTrigger: dependencies.resolveLocalTrigger})}
        {...(dependencies.resolveFocusScheduleTrigger === undefined
          ? {}
          : {resolveFocusScheduleTrigger: dependencies.resolveFocusScheduleTrigger})}
        reviewHistory={reviewHistory}
        service={service}
        {...(tomorrowFirstReminder === undefined
          ? {}
          : {tomorrowFirstReminder})}
        renderReviewSheet={onReturned => (
          <PostFocusReviewScreen onReturned={onReturned} />
        )}
        {...(dependencies.tomorrowFirstNotifications === undefined
          ? {}
          : {notifications: dependencies.tomorrowFirstNotifications})}
        localBackup={localBackup}
        {...(dependencies.backupFileBridge === undefined
          ? {}
          : {backupFileBridge: dependencies.backupFileBridge})}
      />
    );
  }

  const composition = {repository, service, AppRoot} as unknown as StartFiveAppComposition;
  Object.defineProperties(composition, {
    reviewHistory: {value: reviewHistory, enumerable: false},
    localBackup: {value: localBackup, enumerable: false},
    focusSchedules: {value: focusSchedules, enumerable: false},
  });
  return composition;
}
