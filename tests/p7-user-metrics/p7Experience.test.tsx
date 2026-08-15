import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {InMemoryProductMetricPort, type ProductMetricPort} from '../../src/application/productMetrics';
import {FOCUS_SESSION_STORAGE_KEY} from '../../src/data/persistentFocusSessionStorage';
import {
  createLifecycleTask,
  createWorkspaceHarness,
  flushUiWork,
  startTaskAndFocus,
  WorkspaceBackend,
  WorkspaceClock,
  WorkspaceIds,
} from '../gap-p0-06r1/gapP006TestKit';

const NOW = '2026-08-14T08:00:00.000Z';

async function flushUi(): Promise<void> {
  await act(async () => {
    await flushUiWork(50);
  });
}

const taskInput = {
  title: '推进 P7 用户任务',
  description: '',
  important: true,
  urgent: false,
  scheduledStartAt: null,
  dueAt: null,
  estimatedMinutes: 5,
  firstStep: '先完成最小一步',
  progress: 0 as const,
};

describe('P7 direct product experience', () => {
  it('opens the action layer and persists progress shortcuts without losing the original on failure', async () => {
    const backend = new WorkspaceBackend();
    const harness = createWorkspaceHarness(
      backend,
      new WorkspaceClock(NOW),
      new WorkspaceIds(['p7-progress-task']),
    );
    const task = await createLifecycleTask(harness, taskInput, 'p7:progress:create');
    const screen = await render(React.createElement(harness.composition.AppRoot));

    try {
      await waitFor(() => expect(screen.getByRole('button', {name: `成长区任务：${task.title}`})).toBeTruthy());
      await fireEvent.press(screen.getByRole('button', {name: `成长区任务：${task.title}`}));
      expect(screen.getByText('快速编辑任务')).toBeTruthy();
      expect(screen.queryByLabelText('任务标题')).toBeNull();
      expect(screen.getByRole('button', {name: '先做5分钟'})).toBeTruthy();
      expect(screen.getByRole('button', {name: '完成任务'})).toBeTruthy();
      expect(screen.getByRole('button', {name: '重新安排'})).toBeTruthy();
      expect(screen.getByRole('button', {name: '我卡住了'})).toBeTruthy();

      await fireEvent.press(screen.getByRole('radio', {name: '更新进度为 50%'}));
      await waitFor(() =>
        expect(harness.composition.repository.getById(task.id)).resolves.toMatchObject({progress: 50}),
      );
      expect(screen.getByRole('radio', {name: '更新进度为 50%'}).props.accessibilityState)
        .toMatchObject({selected: true});

      backend.failNextSet(new Error('P7_PROGRESS_WRITE_FAILED'));
      await fireEvent.press(screen.getByRole('radio', {name: '更新进度为 75%'}));
      await waitFor(() => expect(screen.getByText('进度没有保存成功，原来的进度仍然保留，请重试。')).toBeTruthy());
      await expect(harness.composition.repository.getById(task.id)).resolves.toMatchObject({progress: 50});
      expect(screen.getByText('快速编辑任务')).toBeTruthy();
    } finally {
      await screen.unmount();
    }
  });

  it('records task_sheet_open before focus_started with injected time and no task content', async () => {
    const backend = new WorkspaceBackend();
    const port = new InMemoryProductMetricPort();
    let monotonic = 10;
    const harness = createWorkspaceHarness(
      backend,
      new WorkspaceClock(NOW),
      new WorkspaceIds(['p7-metric-task', 'p7-metric-focus']),
      {
        productMetricPort: port,
        productMetricClock: {now: () => NOW, monotonicNow: () => monotonic},
        productMetricSessionId: 'p7-session',
      },
    );
    const task = await createLifecycleTask(harness, taskInput, 'p7:metric:create');
    const screen = await render(React.createElement(harness.composition.AppRoot));

    try {
      await waitFor(() => expect(screen.getByRole('button', {name: `成长区任务：${task.title}`})).toBeTruthy());
      monotonic = 20;
      await fireEvent.press(screen.getByRole('button', {name: `成长区任务：${task.title}`}));
      await waitFor(() => expect(port.snapshot().some(event => event.name === 'task_sheet_open')).toBe(true));
      monotonic = 80;
      await fireEvent.press(screen.getByRole('button', {name: '先做5分钟'}));
      await flushUi();
      await waitFor(() => expect(port.snapshot().some(event => event.name === 'focus_started')).toBe(true));

      const relevant = port.snapshot().filter(event =>
        event.name === 'task_sheet_open' || event.name === 'focus_started',
      );
      expect(relevant.map(event => event.name)).toEqual(['task_sheet_open', 'focus_started']);
      expect(relevant[1]).toMatchObject({
        durationMs: 60,
        source: 'task_sheet',
        taskRef: task.id,
        success: true,
      });
      expect(JSON.stringify(relevant)).not.toContain(task.title);
      expect(JSON.stringify(relevant)).not.toContain(task.firstStep);
    } finally {
      await screen.unmount();
    }
  });

  it('keeps task creation usable when the metric port throws', async () => {
    const failingPort: ProductMetricPort = {
      record: () => {
        throw new Error('P7_METRIC_FAILURE');
      },
    };
    const harness = createWorkspaceHarness(
      new WorkspaceBackend(),
      new WorkspaceClock(NOW),
      new WorkspaceIds(['p7-metric-failure-task']),
      {productMetricPort: failingPort},
    );
    const screen = await render(React.createElement(harness.composition.AppRoot));
    try {
      await waitFor(() => expect(screen.getByRole('button', {name: '在成长区添加任务'})).toBeTruthy());
      await fireEvent.press(screen.getByRole('button', {name: '在成长区添加任务'}));
      await fireEvent.changeText(screen.getByLabelText('任务标题'), '指标失败也能保存');
      await fireEvent.press(screen.getByRole('button', {name: '保存任务'}));
      await waitFor(() => expect(screen.getByRole('button', {name: '成长区任务：指标失败也能保存'})).toBeTruthy());
    } finally {
      await screen.unmount();
    }
  });

  it('resumes an active focus without creating a second session', async () => {
    const backend = new WorkspaceBackend();
    const clock = new WorkspaceClock(NOW);
    const seed = createWorkspaceHarness(backend, clock, new WorkspaceIds(['p7-resume-task']));
    const task = await createLifecycleTask(seed, taskInput, 'p7:resume:create');
    await startTaskAndFocus(seed, backend, clock, new WorkspaceIds(['p7-existing-focus']), task.id);

    const restartedBackend = backend.byteRestart();
    const port = new InMemoryProductMetricPort();
    const restarted = createWorkspaceHarness(
      restartedBackend,
      clock,
      new WorkspaceIds(['p7-focus-must-not-be-created']),
      {
        productMetricPort: port,
        productMetricClock: {now: () => NOW, monotonicNow: () => 100},
        productMetricSessionId: 'p7-resume-session',
      },
    );
    const before = await restartedBackend.getItem(FOCUS_SESSION_STORAGE_KEY);
    const screen = await render(React.createElement(restarted.composition.AppRoot));
    try {
      await waitFor(() => expect(screen.getByRole('button', {name: `返回正在进行的专注：${task.title}`})).toBeTruthy());
      await fireEvent.press(screen.getByRole('button', {name: `返回正在进行的专注：${task.title}`}));
      await flushUi();
      await waitFor(() => expect(screen.getByText('正在先做 5 分钟')).toBeTruthy());
      expect(port.snapshot().filter(event => event.name === 'focus_resumed')).toHaveLength(1);
      expect(port.snapshot().filter(event => event.name === 'focus_started')).toHaveLength(0);
      expect(await restartedBackend.getItem(FOCUS_SESSION_STORAGE_KEY)).toBe(before);
    } finally {
      await screen.unmount();
    }
  });
});
