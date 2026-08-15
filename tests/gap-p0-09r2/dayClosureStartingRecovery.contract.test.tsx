import {fireEvent, waitFor} from '@testing-library/react-native';
import {
  createDayClosureService,
  type CreateDayClosureServiceDependencies,
} from '../../src/application/dayClosureService';
import {createDayClosureRepository} from '../../src/data/dayClosureRepository';
import {createTask, type Task} from '../../src/domain/task';
import type {FocusSession} from '../../src/domain/focusSession';
import {
  createP007Harness,
  DAY_ONE_START,
  DAY_TWO_START,
  PublicMemoryBackend,
  renderHarness,
  seedTaskWithStep,
} from '../gap-p0-09/dayClosureTestKit';

const CONTINUE_DIRECTED_START = '继续开始明日第一项5分钟';

function taskReads(getTasks: () => readonly Task[]) {
  return {
    async getById(taskId: string): Promise<Task | null> {
      return getTasks().find(task => task.id === taskId) ?? null;
    },
    async list(): Promise<Task[]> {
      return [...getTasks()];
    },
  };
}

function emptyHistory() {
  return {
    async listReceiptHistory() {
      return {receipts: []};
    },
  };
}

function runningFocus(taskId: string, id: string): FocusSession {
  return {
    id,
    taskId,
    plannedMinutes: 5,
    status: 'running',
    startedAt: DAY_TWO_START,
    plannedEndAt: '2026-08-11T07:35:00.000Z',
    endedAt: null,
    actualSeconds: null,
    interruptionReason: null,
    createdAt: DAY_TWO_START,
    updatedAt: DAY_TWO_START,
  };
}

describe('GAP-P0-09R2 durable starting recovery', () => {
  it('retains exact A across a rejected directed start and byte restart, then exposes a public continue CTA that consumes once', async () => {
    const selectedTitle = '明早继续写恢复方案';
    const otherTitle = '当前普通推荐任务';
    const backend = new PublicMemoryBackend();
    const dayOne = createP007Harness({
      backend,
      at: DAY_ONE_START,
      idPrefix: 'p009r2-directed-day-one',
    });
    const selected = await seedTaskWithStep(dayOne, {
      title: selectedTitle,
      stepTitle: '列出恢复验收点',
      important: true,
      urgent: false,
      operationPrefix: 'p009r2:selected',
    });
    const other = await seedTaskWithStep(dayOne, {
      title: otherTitle,
      stepTitle: '处理当前阻塞',
      important: true,
      urgent: true,
      operationPrefix: 'p009r2:other',
    });
    let now = DAY_ONE_START;
    const publicTasks = taskReads(
      () => dayOne.composition.service.getState() as never,
    );
    const taskAdapter = {
      async getById(taskId: string): Promise<Task | null> {
        const state = await dayOne.composition.service.getState();
        return state.tasks.find(task => task.id === taskId) ?? null;
      },
      async list(): Promise<Task[]> {
        return (await dayOne.composition.service.getState()).tasks;
      },
    };
    void publicTasks;
    let rejectedOperation: string | null = null;
    const failing = createDayClosureService({
      repository: createDayClosureRepository(backend),
      tasks: taskAdapter,
      focus: {getActive: async () => null},
      history: emptyHistory(),
      now: () => now,
      async startSelectedTask(taskId, operationId) {
        expect(taskId).toBe(selected.id);
        rejectedOperation = operationId;
        throw new Error('DIRECTED_START_IO_FAILED_ONCE');
      },
    });
    const chosen = await failing.choose(selected.id);
    expect(chosen.record?.state).toBe('pending');
    now = DAY_TWO_START;
    await expect(
      failing.startAndConsume(async () => {
        throw new Error('FOCUS_MUST_NOT_START_AFTER_TASK_FAILURE');
      }),
    ).rejects.toThrow('DIRECTED_START_IO_FAILED_ONCE');

    const restartedBackend = backend.byteRestart();
    const afterCrash = createDayClosureService({
      repository: createDayClosureRepository(restartedBackend),
      tasks: taskAdapter,
      focus: {getActive: async () => null},
      history: emptyHistory(),
      now: () => now,
      async startSelectedTask() {
        throw new Error('INSPECTION_ONLY');
      },
    });
    const retained = await afterCrash.load();
    expect(retained.record).toMatchObject({
      dayKey: chosen.record?.dayKey,
      targetTaskId: selected.id,
      operationId: rejectedOperation,
      state: 'starting',
    });

    const retry = createP007Harness({
      backend: restartedBackend,
      at: DAY_TWO_START,
      idPrefix: 'p009r2-directed-retry',
    });
    const screen = await renderHarness(retry);
    try {
      await waitFor(() =>
        expect(screen.getByText(`继续明日第一项：${selectedTitle}`)).toBeTruthy(),
      );
      await fireEvent.press(
        screen.getByRole('button', {name: CONTINUE_DIRECTED_START}),
      );
      await waitFor(() =>
        expect(screen.getByText(`专注任务：${selectedTitle}`)).toBeTruthy(),
      );
      expect(screen.queryByText(`专注任务：${otherTitle}`)).toBeNull();
      expect(
        screen.queryByRole('button', {name: CONTINUE_DIRECTED_START}),
      ).toBeNull();
      const state = await retry.composition.service.getState();
      expect(state.tasks.find(task => task.id === selected.id)?.status).toBe(
        'in_progress',
      );
      expect(state.tasks.find(task => task.id === other.id)?.status).toBe(
        'pending',
      );
    } finally {
      await screen.unmount();
    }

    const consumed = await createDayClosureService({
      repository: createDayClosureRepository(restartedBackend),
      tasks: {
        async getById(taskId: string) {
          const state = await retry.composition.service.getState();
          return state.tasks.find(task => task.id === taskId) ?? null;
        },
        async list() {
          return (await retry.composition.service.getState()).tasks;
        },
      },
      focus: {getActive: async () => null},
      history: emptyHistory(),
      now: () => DAY_TWO_START,
      async startSelectedTask() {
        throw new Error('INSPECTION_ONLY');
      },
    }).load();
    expect(consumed.record).toMatchObject({
      targetTaskId: selected.id,
      operationId: rejectedOperation,
      state: 'consumed',
    });

    const finalRestart = createP007Harness({
      backend: restartedBackend.byteRestart(),
      at: DAY_TWO_START,
      idPrefix: 'p009r2-directed-final',
    });
    const finalScreen = await renderHarness(finalRestart);
    try {
      await waitFor(() =>
        expect(finalScreen.getByText(`专注任务：${selectedTitle}`)).toBeTruthy(),
      );
      expect(
        finalScreen.queryByRole('button', {name: CONTINUE_DIRECTED_START}),
      ).toBeNull();
      expect(finalScreen.queryByText(`专注任务：${otherTitle}`)).toBeNull();
    } finally {
      await finalScreen.unmount();
    }
  });

  it('retains the original day and exact fallback B operation after one rejected start, then retries B without an implicit focus', async () => {
    const original = createTask(
      {title: '已经终止的明日第一项', important: false, urgent: false},
      {id: 'terminal-a', now: DAY_ONE_START},
    );
    const fallback = createTask(
      {title: '仍待开始的当前推荐', important: true, urgent: true},
      {id: 'fallback-b', now: DAY_ONE_START},
    );
    let tasks: Task[] = [original, fallback];
    let activeFocus: FocusSession | null = null;
    let now = DAY_ONE_START;
    const backend = new PublicMemoryBackend();
    const dependencies = (
      storage: PublicMemoryBackend,
      startSelectedTask: CreateDayClosureServiceDependencies['startSelectedTask'],
    ): CreateDayClosureServiceDependencies => ({
      repository: createDayClosureRepository(storage),
      tasks: taskReads(() => tasks),
      focus: {getActive: async () => activeFocus},
      history: emptyHistory(),
      now: () => now,
      startSelectedTask,
    });
    let rejectedTask: string | null = null;
    let rejectedOperation: string | null = null;
    const failing = createDayClosureService(
      dependencies(backend, async (taskId, operationId) => {
        rejectedTask = taskId;
        rejectedOperation = operationId;
        throw new Error('FALLBACK_START_IO_FAILED_ONCE');
      }),
    );
    const selected = await failing.choose(original.id);
    tasks = tasks.map(task =>
      task.id === original.id
        ? {
            ...task,
            status: 'completed',
            completedAt: DAY_ONE_START,
            updatedAt: DAY_ONE_START,
          }
        : task,
    );
    now = DAY_TWO_START;
    expect((await failing.load()).record?.state).toBe('resolved_completed');
    await expect(
      failing.startCurrentRecommendation(async () => {
        throw new Error('FOCUS_MUST_NOT_START_AFTER_TASK_FAILURE');
      }),
    ).rejects.toThrow('FALLBACK_START_IO_FAILED_ONCE');
    expect(rejectedTask).toBe(fallback.id);
    expect(tasks.find(task => task.id === fallback.id)?.status).toBe('pending');
    expect(activeFocus).toBeNull();

    const restartedBackend = backend.byteRestart();
    const retryCalls: Array<Readonly<{taskId: string; operationId: string}>> = [];
    const retry = createDayClosureService(
      dependencies(restartedBackend, async (taskId, operationId) => {
        retryCalls.push({taskId, operationId});
        tasks = tasks.map(task =>
          task.id === taskId
            ? {
                ...task,
                status: 'in_progress',
                startedAt: DAY_TWO_START,
                updatedAt: DAY_TWO_START,
              }
            : task,
        );
        return tasks.find(task => task.id === taskId)!;
      }),
    );
    const retained = await retry.load();
    expect(retained.record).toMatchObject({
      dayKey: selected.record?.dayKey,
      targetTaskId: fallback.id,
      operationId: rejectedOperation,
      state: 'starting',
    });
    expect(tasks.find(task => task.id === fallback.id)?.status).toBe('pending');
    expect(activeFocus).toBeNull();

    const consumed = await retry.startAndConsume(async taskId => {
      activeFocus = runningFocus(taskId, 'fallback-focus');
      return activeFocus;
    });
    expect(retryCalls).toEqual([
      {taskId: fallback.id, operationId: rejectedOperation},
    ]);
    expect(consumed.record).toMatchObject({
      dayKey: selected.record?.dayKey,
      targetTaskId: fallback.id,
      operationId: rejectedOperation,
      state: 'consumed',
    });
    expect(tasks.find(task => task.id === fallback.id)?.status).toBe(
      'in_progress',
    );
    expect(activeFocus).toMatchObject({taskId: fallback.id, status: 'running'});
  });
});
