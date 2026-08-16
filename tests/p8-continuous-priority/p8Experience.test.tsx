import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import type {TaskWithPriority} from '../../src/domain/taskPriority';
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
  await act(async () => { await flushUiWork(50); });
}

describe('P8 direct product experience', () => {
  it('creates structured local data from one sentence and shows the compact action pointer', async () => {
    const harness = createWorkspaceHarness(
      new WorkspaceBackend(),
      new WorkspaceClock(NOW),
      new WorkspaceIds(['p8-quick-task']),
    );
    const screen = await render(React.createElement(harness.composition.AppRoot));
    try {
      await waitFor(() => expect(screen.getByRole('button', {name: '添加任务'})).toBeTruthy());
      await fireEvent.press(screen.getByRole('button', {name: '添加任务'}));
      await fireEvent.changeText(
        screen.getByLabelText('任务标题'),
        '明天晚上8点写周报 30分钟 每天',
      );
      expect(screen.getByText('预计 30 分钟')).toBeTruthy();
      expect(screen.getByText('每天重复')).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', {name: '添加任务'}));
      await flushUi();
      await waitFor(async () => {
        const tasks = await harness.lifecycle.list();
        expect(tasks).toHaveLength(1);
        const created = tasks[0] as TaskWithPriority;
        expect(created).toMatchObject({
          title: '写周报',
          estimatedMinutes: 30,
          prioritySchemaVersion: 1,
          urgencyMode: 'hybrid',
          repeatRule: {frequency: 'daily'},
        });
        expect(created.dueAt).not.toBeNull();
      });
      expect(screen.getByLabelText('首页主行动')).toBeTruthy();
      expect(screen.queryByText(/AI/i)).toBeNull();
    } finally {
      await screen.unmount();
    }
  });

  it('collapses the action pointer whenever the continuation strip is present', async () => {
    const backend = new WorkspaceBackend();
    const clock = new WorkspaceClock(NOW);
    const harness = createWorkspaceHarness(
      backend,
      clock,
      new WorkspaceIds(['p8-continuation-task']),
    );
    const task = await createLifecycleTask(harness, {
      title: '继续任务',
      important: true,
      urgent: false,
      dueAt: null,
      estimatedMinutes: 5,
      firstStep: '继续一步',
    }, 'p8:continuation:create');
    await startTaskAndFocus(
      harness,
      backend,
      clock,
      new WorkspaceIds(['p8-focus-session']),
      task.id,
    );
    const screen = await render(React.createElement(harness.composition.AppRoot));
    try {
      await waitFor(() => expect(screen.getByLabelText('首页主行动')).toBeTruthy());
      expect(screen.getByRole('button', {name: `返回正在进行的专注：${task.title}`})).toBeTruthy();
    } finally {
      await screen.unmount();
    }
  });
});
