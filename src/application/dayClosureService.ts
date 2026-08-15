import type {
  ReceiptHistorySnapshot,
} from './postFocusReviewService';
import type {
  TaskLifecycleService,
} from './coreAppService';
import type {FocusSessionService} from './focusSessionService';
import type {DayClosureRepository} from '../data/dayClosureRepository';
import {
  createDayClosureRecord,
  dayKeyAt,
  transitionDayClosure,
  type DayClosureRecord,
} from '../domain/dayClosure';
import type {FocusSession} from '../domain/focusSession';
import {recommendNextTask} from '../domain/recommendation';
import type {Task} from '../domain/task';

export type DayClosureSnapshot = Readonly<{
  currentDay: string;
  record: DayClosureRecord | null;
  target: Task | null;
  candidates: readonly Task[];
  recommendation: Task | null;
  completedToday: number;
  focusCountToday: number;
  focusMinutesToday: number;
}>;

export type DayClosureService = Readonly<{
  load(): Promise<DayClosureSnapshot>;
  choose(taskId: string): Promise<DayClosureSnapshot>;
  startAndConsume(
    startFocus: (taskId: string) => Promise<FocusSession>,
  ): Promise<DayClosureSnapshot>;
  startCurrentRecommendation(
    startFocus: (taskId: string) => Promise<FocusSession>,
  ): Promise<DayClosureSnapshot>;
}>;

export type CreateDayClosureServiceDependencies = Readonly<{
  repository: DayClosureRepository;
  tasks: Pick<
    TaskLifecycleService,
    'getById' | 'list'
  >;
  focus: Pick<FocusSessionService, 'getActive'>;
  history: Readonly<{
    listReceiptHistory(): Promise<ReceiptHistorySnapshot>;
  }>;
  now(): string;
  startSelectedTask(taskId: string, operationId: string): Promise<Task>;
}>;

function active(task: Task): boolean {
  return (
    task.deletedAt === null &&
    (task.status === 'pending' || task.status === 'in_progress')
  );
}

export function createDayClosureService(
  dependencies: CreateDayClosureServiceDependencies,
): DayClosureService {
  const {repository, tasks, focus, history, now, startSelectedTask} = dependencies;
  let startInFlight: Promise<DayClosureSnapshot> | null = null;

  async function reconcile(): Promise<DayClosureRecord | null> {
    const record = await repository.read();
    if (
      record === null ||
      record.state === 'consumed' ||
      record.state === 'resolved_completed' ||
      record.state === 'resolved_deleted'
    ) {
      return record;
    }
    const task = await tasks.getById(record.targetTaskId, {includeDeleted: true});
    let terminal: 'resolved_completed' | 'resolved_deleted' | null = null;
    if (task === null || task.deletedAt !== null || task.status === 'cancelled') {
      terminal = 'resolved_deleted';
    } else if (task.status === 'completed') {
      terminal = 'resolved_completed';
    }
    if (terminal !== null) {
      return repository.update(current => {
        if (
          current === null ||
          current.operationId !== record.operationId ||
          current.state === 'consumed' ||
          current.state === 'resolved_completed' ||
          current.state === 'resolved_deleted'
        ) {
          return {next: current, result: current};
        }
        const next = transitionDayClosure(current, terminal, now());
        return {next, result: next};
      });
    }
    if (record.state === 'starting' && task !== null) {
      const activeFocus = await focus.getActive();
      if (
        task.status === 'in_progress' &&
        activeFocus?.status === 'running' &&
        activeFocus.taskId === task.id
      ) {
        return repository.update(current => {
          if (current?.operationId !== record.operationId) {
            return {next: current, result: current};
          }
          const next = transitionDayClosure(current, 'consumed', now());
          return {next, result: next};
        });
      }
    }
    return record;
  }

  async function snapshot(): Promise<DayClosureSnapshot> {
    const currentDay = dayKeyAt(now());
    const [record, allTasks, receiptHistory] = await Promise.all([
      reconcile(),
      tasks.list({includeDeleted: true}),
      history.listReceiptHistory(),
    ]);
    const candidates = allTasks.filter(active);
    const target = record === null
      ? null
      : allTasks.find(task => task.id === record.targetTaskId) ?? null;
    const receipts = receiptHistory.receipts.filter(
      receipt => receipt.statsDay === currentDay,
    );
    return {
      currentDay,
      record,
      target,
      candidates,
      recommendation: recommendNextTask(candidates),
      completedToday: allTasks.filter(
        task => task.completedAt?.slice(0, 10) === currentDay,
      ).length,
      focusCountToday: receipts.length,
      focusMinutesToday: Math.floor(
        receipts.reduce((total, receipt) => total + receipt.actualSeconds, 0) /
          60,
      ),
    };
  }

  async function choose(taskId: string): Promise<DayClosureSnapshot> {
    const task = await tasks.getById(taskId, {includeDeleted: true});
    if (task === null || !active(task)) {
      throw new Error('DAY_CLOSURE_TARGET_UNAVAILABLE');
    }
    const timestamp = now();
    const next = createDayClosureRecord(dayKeyAt(timestamp), task.id, timestamp);
    await repository.update(() => ({next, result: undefined}));
    return snapshot();
  }

  async function consume(
    startFocus: (taskId: string) => Promise<FocusSession>,
  ): Promise<DayClosureSnapshot> {
    const existing = startInFlight;
    if (existing !== null) {
      return existing;
    }
    let pending: Promise<DayClosureSnapshot>;
    pending = (async () => {
      const reconciled = await reconcile();
      if (reconciled === null) {
        throw new Error('DAY_CLOSURE_SELECTION_REQUIRED');
      }
      if (reconciled.state === 'consumed') {
        return snapshot();
      }
      if (
        reconciled.state === 'resolved_completed' ||
        reconciled.state === 'resolved_deleted'
      ) {
        throw new Error('DAY_CLOSURE_TARGET_UNAVAILABLE');
      }
      const target = await tasks.getById(reconciled.targetTaskId, {
        includeDeleted: true,
      });
      if (target === null || !active(target)) {
        await reconcile();
        throw new Error('DAY_CLOSURE_TARGET_UNAVAILABLE');
      }
      const starting = await repository.update(current => {
        if (current?.operationId !== reconciled.operationId) {
          throw new Error('DAY_CLOSURE_SELECTION_CHANGED');
        }
        const next = current.state === 'starting'
          ? current
          : transitionDayClosure(current, 'starting', now());
        return {next, result: next};
      });
      await startSelectedTask(starting.targetTaskId, starting.operationId);
      const startedFocus = await startFocus(starting.targetTaskId);
      const [confirmedTask, confirmedFocus] = await Promise.all([
        tasks.getById(starting.targetTaskId, {includeDeleted: true}),
        focus.getActive(),
      ]);
      if (
        confirmedTask?.status !== 'in_progress' ||
        startedFocus.taskId !== starting.targetTaskId ||
        startedFocus.status !== 'running' ||
        confirmedFocus?.taskId !== starting.targetTaskId ||
        confirmedFocus.status !== 'running'
      ) {
        throw new Error('DAY_CLOSURE_START_NOT_CONFIRMED');
      }
      await repository.update(current => {
        if (current?.operationId !== starting.operationId) {
          throw new Error('DAY_CLOSURE_SELECTION_CHANGED');
        }
        const next = current.state === 'consumed'
          ? current
          : transitionDayClosure(current, 'consumed', now());
        return {next, result: undefined};
      });
      return snapshot();
    })().finally(() => {
      if (startInFlight === pending) {
        startInFlight = null;
      }
    });
    startInFlight = pending;
    return pending;
  }

  return {
    load: snapshot,
    choose,
    startAndConsume: consume,
    async startCurrentRecommendation(startFocus) {
      const [record, allTasks] = await Promise.all([
        reconcile(),
        tasks.list({includeDeleted: true}),
      ]);
      const recommendation = recommendNextTask(allTasks.filter(active));
      if (recommendation === null) {
        throw new Error('NO_RECOMMENDED_TASK');
      }
      if (
        record === null ||
        (record.state !== 'resolved_completed' &&
          record.state !== 'resolved_deleted')
      ) {
        throw new Error('DAY_CLOSURE_RECOVERY_NOT_REQUIRED');
      }
      const timestamp = now();
      const next = createDayClosureRecord(
        record.dayKey,
        recommendation.id,
        timestamp,
      );
      await repository.update(current => {
        if (
          current?.operationId !== record.operationId ||
          (current.state !== 'resolved_completed' &&
            current.state !== 'resolved_deleted')
        ) {
          throw new Error('DAY_CLOSURE_SELECTION_CHANGED');
        }
        return {next, result: undefined};
      });
      return consume(startFocus);
    },
  };
}
