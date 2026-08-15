import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {InMemoryProductMetricPort} from '../../src/application/productMetrics';
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

async function flushUi(): Promise<void> {
  await act(async () => { await flushUiWork(50); });
}

const input = {
  title: '准备临近截止的报告',
  description: '',
  important: true,
  urgent: true,
  dueAt: '2026-08-14T18:00:00.000Z',
  estimatedMinutes: 15,
  firstStep: '打开报告',
  progress: 0 as const,
};

describe('P9 direct product experience', () => {
  it('saves a private too-large repair and starts the exact task for five minutes', async () => {
    const port = new InMemoryProductMetricPort();
    const harness = createWorkspaceHarness(
      new WorkspaceBackend(),
      new WorkspaceClock(NOW),
      new WorkspaceIds(['p9-stuck-task', 'p9-stuck-focus']),
      {productMetricPort: port},
    );
    const task = await createLifecycleTask(harness, {...input, dueAt: null}, 'p9:stuck:create');
    const screen = await render(React.createElement(harness.composition.AppRoot));
    try {
      await waitFor(() => expect(screen.getByRole('button', {name: `救火区任务：${task.title}`})).toBeTruthy());
      await fireEvent.press(screen.getByRole('button', {name: `救火区任务：${task.title}`}));
      await fireEvent.press(screen.getByRole('button', {name: '我卡住了'}));
      await fireEvent.press(screen.getByRole('button', {name: '任务太大'}));
      await fireEvent.changeText(screen.getByLabelText('2到10分钟动作'), '先写三条结论');
      await fireEvent.press(screen.getByRole('button', {name: '保存并先做5分钟'}));
      await flushUi();
      await waitFor(() => expect(screen.getByText('正在先做 5 分钟')).toBeTruthy());
      const saved = await harness.composition.repository.getById(task.id) as TaskWithSupport;
      expect(saved).toMatchObject({
        status: 'in_progress',
        firstStep: '先写三条结论',
        stuckRepair: {reason: 'TOO_LARGE', focusMinutes: 5},
      });
      const metrics = JSON.stringify(port.snapshot());
      expect(metrics).not.toContain('先写三条结论');
      expect(metrics).toContain('stuck_flow_open');
    } finally {
      await screen.unmount();
    }
  });

  it('enables low energy mode in two taps without changing any task field', async () => {
    const backend = new WorkspaceBackend();
    const harness = createWorkspaceHarness(
      backend,
      new WorkspaceClock(NOW),
      new WorkspaceIds(['p9-low-task']),
    );
    const task = await createLifecycleTask(harness, {...input, dueAt: null}, 'p9:low:create');
    const before = await harness.composition.repository.getById(task.id);
    const screen = await render(React.createElement(harness.composition.AppRoot));
    try {
      await waitFor(() => expect(screen.getByRole('button', {name: '今天轻一点'})).toBeTruthy());
      await fireEvent.press(screen.getByRole('button', {name: '今天轻一点'}));
      await fireEvent.press(screen.getByRole('button', {name: '今天默认先做 2 分钟'}));
      expect(screen.getByLabelText('今天轻一点已开启')).toBeTruthy();
      expect(await harness.composition.repository.getById(task.id)).toEqual(before);
    } finally {
      await screen.unmount();
    }
  });

  it('attaches one rescue plan to the original task and starts 15 minutes without completion', async () => {
    const harness = createWorkspaceHarness(
      new WorkspaceBackend(),
      new WorkspaceClock(NOW),
      new WorkspaceIds(['p9-rescue-task', 'p9-rescue-focus']),
    );
    const task = await createLifecycleTask(harness, input, 'p9:rescue:create');
    const screen = await render(React.createElement(harness.composition.AppRoot));
    try {
      await waitFor(() => expect(screen.getByRole('button', {name: `救火区任务：${task.title}`})).toBeTruthy());
      await fireEvent.press(screen.getByRole('button', {name: `救火区任务：${task.title}`}));
      await fireEvent.press(screen.getByRole('button', {name: '制定最低版本'}));
      await fireEvent.changeText(screen.getByLabelText('最低必须交出什么'), '一页摘要');
      await fireEvent.changeText(screen.getByLabelText('现在必须做哪一步'), '写三条结论');
      await fireEvent.press(screen.getByRole('tab', {name: '15 分钟'}));
      await fireEvent.press(screen.getByRole('button', {name: '保存最低版本并开始15分钟'}));
      await flushUi();
      await waitFor(() => expect(screen.getByText('正在先做 15 分钟')).toBeTruthy());
      const tasks = await harness.lifecycle.list();
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toMatchObject({
        id: task.id,
        status: 'in_progress',
        completedAt: null,
        firstStep: '写三条结论',
        rescuePlan: {taskId: task.id, minimumDeliverable: '一页摘要', focusMinutes: 15},
      });
    } finally {
      await screen.unmount();
    }
  });

  it('reschedules nextStartAt twice without changing deadline and then shows gentle repair', async () => {
    const harness = createWorkspaceHarness(
      new WorkspaceBackend(),
      new WorkspaceClock(NOW),
      new WorkspaceIds(['p9-postpone-task']),
    );
    const task = await createLifecycleTask(harness, input, 'p9:postpone:create');
    const screen = await render(React.createElement(harness.composition.AppRoot));
    try {
      for (const label of ['10 分钟后', '10 分钟后']) {
        await waitFor(() => expect(screen.getByRole('button', {name: `救火区任务：${task.title}`})).toBeTruthy());
        await fireEvent.press(screen.getByRole('button', {name: `救火区任务：${task.title}`}));
        await fireEvent.press(screen.getByRole('button', {name: '重新安排'}));
        await fireEvent.press(screen.getByRole('tab', {name: label}));
        await flushUi();
      }
      await fireEvent.press(screen.getByRole('button', {name: `救火区任务：${task.title}`}));
      expect(screen.getByText('这项任务已经重新安排了几次，要不要把下一步再缩小一点？')).toBeTruthy();
      const saved = await harness.composition.repository.getById(task.id) as TaskWithSupport & {postponedCount?: number};
      expect(saved).toMatchObject({
        dueAt: input.dueAt,
        postponedCount: 2,
        nextStartAt: '2026-08-14T08:10:00.000Z',
      });
    } finally {
      await screen.unmount();
    }
  });
});
