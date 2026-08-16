import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import type {
  TomorrowFirstNotifications,
  TomorrowFirstTap,
} from '../../src/application/tomorrowFirstNotifications';
import type {
  ReminderReplaceRequest,
  ReminderScheduleSnapshot,
} from '../../src/application/reminderScheduling';
import {
  totalGrowthScore,
  type TaskWithGrowth,
} from '../../src/domain/growth';
import type {TaskWithSupport} from '../../src/domain/taskSupport';
import {
  createLifecycleTask,
  createWorkspaceHarness,
  flushUiWork,
  WorkspaceBackend,
  WorkspaceClock,
  WorkspaceIds,
} from '../gap-p0-06r1/gapP006TestKit';

const NOW = '2026-08-14T08:00:00.000Z';
const DAY_KEY = '2026-08-14';

const input = {
  title: '成长区报告',
  description: '',
  important: true,
  urgent: false,
  dueAt: '2026-08-14T18:00:00.000Z',
  estimatedMinutes: 15,
  firstStep: '写三条结论',
};

async function flushUi(): Promise<void> {
  await act(async () => { await flushUiWork(60); });
}

class FakeNotifications implements TomorrowFirstNotifications {
  private initialTap: TomorrowFirstTap | null;
  private listener: ((tap: TomorrowFirstTap) => void) | null = null;
  readonly snapshots = new Map<string, ReminderScheduleSnapshot>();
  permissionRequests = 0;

  constructor(initialTap: TomorrowFirstTap | null = null) {
    this.initialTap = initialTap;
  }

  async getPermission() {
    return 'granted' as const;
  }

  async requestPermission() {
    this.permissionRequests += 1;
    return 'granted' as const;
  }

  async get(taskId: string): Promise<ReminderScheduleSnapshot | null> {
    return this.snapshots.get(taskId) ?? null;
  }

  async replace(request: ReminderReplaceRequest): Promise<void> {
    if (request.next.scheduled) this.snapshots.set(request.next.taskId, request.next);
    else this.snapshots.delete(request.next.taskId);
  }

  async getInitialTap(): Promise<TomorrowFirstTap | null> {
    const tap = this.initialTap;
    this.initialTap = null;
    return tap;
  }

  subscribeTap(listener: (tap: TomorrowFirstTap) => void): () => void {
    this.listener = listener;
    return () => {
      if (this.listener === listener) this.listener = null;
    };
  }

  emit(tap: TomorrowFirstTap): void {
    this.listener?.(tap);
  }

  setInitialTap(tap: TomorrowFirstTap): void {
    this.initialTap = tap;
  }
}

function createNotificationHarness(
  backend: WorkspaceBackend,
  clock: WorkspaceClock,
  ids: WorkspaceIds,
  notifications: FakeNotifications,
) {
  return createWorkspaceHarness(
    backend,
    clock,
    ids,
    {tomorrowFirstNotifications: notifications} as never,
  );
}

describe('P10 direct product experience', () => {
  it('shows the first-start reward once and starts a five-minute focus', async () => {
    const harness = createWorkspaceHarness(
      new WorkspaceBackend(),
      new WorkspaceClock(NOW),
      new WorkspaceIds(['p10-ui-start-task', 'p10-ui-start-focus']),
    );
    const task = await createLifecycleTask(harness, input, 'p10:ui:start:create');
    const screen = await render(React.createElement(harness.composition.AppRoot));
    try {
      await waitFor(() => expect(screen.getByRole('button', {name: `成长区任务：${task.title}`})).toBeTruthy());
      await fireEvent.press(screen.getByRole('button', {name: `先做5分钟：${task.title}`}));
      await flushUi();
      await waitFor(() => expect(screen.getByText('正在先做 5 分钟')).toBeTruthy());
      expect(screen.getByText('第一次真正开始，行动已经计入成长。')).toBeTruthy();
      const saved = await harness.composition.repository.getById(task.id) as TaskWithGrowth;
      expect(saved.growthRewards).toEqual([
        expect.objectContaining({businessKey: `task-first-start:${task.id}`, points: 3}),
      ]);
      expect(
        totalGrowthScore((await harness.composition.service.getState()).tasks),
      ).toBe(3);
      await fireEvent.press(screen.getByRole('button', {name: '关闭成长提示'}));
      await flushUi();
    } finally {
      await screen.unmount();
    }
  });

  it('records an optional next step without completing the task and supports undo', async () => {
    const harness = createWorkspaceHarness(
      new WorkspaceBackend(),
      new WorkspaceClock(NOW),
      new WorkspaceIds(['p10-ui-step-task']),
    );
    const task = await createLifecycleTask(harness, input, 'p10:ui:step:create');
    const screen = await render(React.createElement(harness.composition.AppRoot));
    try {
      await waitFor(() => expect(screen.getByRole('button', {name: `成长区任务：${task.title}`})).toBeTruthy());
      await fireEvent.press(screen.getByRole('button', {name: `成长区任务：${task.title}`}));
      await flushUi();
      await waitFor(() => expect(screen.getByLabelText('完成后下一步')).toBeTruthy());
      await fireEvent.changeText(screen.getByLabelText('完成后下一步'), '整理成一页');
      await fireEvent.press(screen.getByRole('button', {name: '完成这一步'}));
      await flushUi();
      await waitFor(() => expect(screen.getByRole('button', {name: '撤销第一小步完成'})).toBeTruthy());
      const completed = await harness.composition.repository.getById(task.id) as TaskWithGrowth;
      expect(completed).toMatchObject({
        status: 'pending',
        completedAt: null,
        firstStep: '整理成一页',
        firstStepCompletion: {completedStep: '写三条结论'},
      });
      expect((completed.growthRewards ?? []).map(reward => reward.businessKey)).toContain(
        `task-first-step:${task.id}`,
      );

      await fireEvent.press(screen.getByRole('button', {name: '撤销第一小步完成'}));
      await flushUi();
      await waitFor(() => expect(screen.getByRole('button', {name: '完成这一步'})).toBeTruthy());
      expect(await harness.composition.repository.getById(task.id)).toMatchObject({
        status: 'pending',
        firstStep: '写三条结论',
        firstStepCompletion: null,
        growthRewards: [],
      });
    } finally {
      await screen.unmount();
    }
  });

  it('renders the current plant, next stage, growth-zone contribution and recent reward', async () => {
    const harness = createWorkspaceHarness(
      new WorkspaceBackend(),
      new WorkspaceClock(NOW),
      new WorkspaceIds(['p10-ui-growth-task']),
    );
    const task = await createLifecycleTask(harness, input, 'p10:ui:growth:create');
    await harness.composition.service.completeFirstStep!(
      task.id,
      {},
      {operationId: 'p10:ui:growth:step'},
    );
    const screen = await render(React.createElement(harness.composition.AppRoot));
    try {
      await waitFor(() => expect(screen.getByRole('tab', {name: '成长'})).toBeTruthy());
      await fireEvent.press(screen.getByRole('tab', {name: '成长'}));
      await flushUi();
      expect(screen.getByLabelText('成长阶段：发芽')).toBeTruthy();
      expect(screen.getByText('再获得 5 分到两片叶')).toBeTruthy();
      expect(screen.getByText('成长区贡献')).toBeTruthy();
      expect(screen.getByText(`+5 · ${task.title} · 第一小步`)).toBeTruthy();
      expect(screen.getByLabelText('给你的一个建议')).toBeTruthy();
    } finally {
      await screen.unmount();
    }
  });

  it('cold-start notification action starts the exact task and never prompts permission', async () => {
    const backend = new WorkspaceBackend();
    const clock = new WorkspaceClock(NOW);
    const notifications = new FakeNotifications();
    const harness = createNotificationHarness(
      backend,
      clock,
      new WorkspaceIds(['p10-other-task', 'p10-exact-task', 'p10-exact-focus']),
      notifications,
    );
    const other = await createLifecycleTask(harness, {
      ...input,
      title: '更紧急但不应开始',
      important: true,
      urgent: true,
    }, 'p10:notification:other');
    const exact = await createLifecycleTask(harness, input, 'p10:notification:exact');
    notifications.setInitialTap({
      kind: 'start_five',
      dayKey: DAY_KEY,
      taskId: exact.id,
    });
    const screen = await render(React.createElement(harness.composition.AppRoot));
    try {
      await waitFor(() => expect(screen.getByText('正在先做 5 分钟')).toBeTruthy());
      expect(await harness.composition.repository.getById(other.id)).toMatchObject({status: 'pending'});
      expect(await harness.composition.repository.getById(exact.id)).toMatchObject({
        status: 'in_progress',
        growthRewards: [expect.objectContaining({businessKey: `task-first-start:${exact.id}`})],
      });
      expect(notifications.permissionRequests).toBe(0);
      await fireEvent.press(screen.getByRole('button', {name: '关闭成长提示'}));
      await flushUi();
    } finally {
      await screen.unmount();
    }
  });

  it('handles hot delay and reschedule actions without changing the deadline', async () => {
    const notifications = new FakeNotifications();
    const harness = createNotificationHarness(
      new WorkspaceBackend(),
      new WorkspaceClock(NOW),
      new WorkspaceIds(['p10-hot-task']),
      notifications,
    );
    const task = await createLifecycleTask(harness, input, 'p10:hot:create');
    const screen = await render(React.createElement(harness.composition.AppRoot));
    try {
      await waitFor(() => expect(screen.getByRole('button', {name: `成长区任务：${task.title}`})).toBeTruthy());
      await act(async () => {
        notifications.emit({kind: 'delay_ten', dayKey: DAY_KEY, taskId: task.id});
        await flushUiWork(20);
      });
      await flushUi();
      await waitFor(() => expect(screen.getByText('已延后 10 分钟，最终截止时间没有改变。')).toBeTruthy());
      expect(await harness.composition.repository.getById(task.id) as TaskWithSupport).toMatchObject({
        dueAt: input.dueAt,
        nextStartAt: '2026-08-14T08:10:00.000Z',
        postponedCount: 1,
      });

      await act(async () => {
        notifications.emit({kind: 'reschedule', dayKey: DAY_KEY, taskId: task.id});
        await flushUiWork(20);
      });
      await flushUi();
      await waitFor(() => expect(screen.getByRole('header', {name: '重新安排'})).toBeTruthy());
    } finally {
      await screen.unmount();
    }
  });

  it('opens shared text for confirmation without automatically saving a task', async () => {
    const notifications = new FakeNotifications({
      kind: 'share_text',
      entryId: 'share:1',
      text: '写周报',
      truncated: true,
    });
    const harness = createNotificationHarness(
      new WorkspaceBackend(),
      new WorkspaceClock(NOW),
      new WorkspaceIds(['unused']),
      notifications,
    );
    const screen = await render(React.createElement(harness.composition.AppRoot));
    try {
      await waitFor(() => expect(screen.getByLabelText('任务标题')).toBeTruthy());
      expect(screen.getByLabelText('任务标题').props.value).toBe('写周报');
      expect(screen.getByText('分享内容已限制为 500 字，请确认后再保存。')).toBeTruthy();
      expect(await harness.lifecycle.list()).toEqual([]);
    } finally {
      await screen.unmount();
    }
  });

  it('rejects terminal notification targets without issuing a reward', async () => {
    const notifications = new FakeNotifications();
    const harness = createNotificationHarness(
      new WorkspaceBackend(),
      new WorkspaceClock(NOW),
      new WorkspaceIds(['p10-terminal-task']),
      notifications,
    );
    const task = await createLifecycleTask(harness, input, 'p10:terminal:create');
    await harness.lifecycle.complete(task.id, {operationId: 'p10:terminal:complete'});
    notifications.setInitialTap({
      kind: 'start_five',
      dayKey: DAY_KEY,
      taskId: task.id,
    });
    const screen = await render(React.createElement(harness.composition.AppRoot));
    try {
      await waitFor(() => expect(screen.getByText('提醒对应的任务已完成、已删除或不可用。')).toBeTruthy());
      const saved = await harness.composition.repository.getById(task.id) as TaskWithGrowth;
      expect(saved.status).toBe('completed');
      expect(saved.growthRewards ?? []).toEqual([]);
    } finally {
      await screen.unmount();
    }
  });
});
