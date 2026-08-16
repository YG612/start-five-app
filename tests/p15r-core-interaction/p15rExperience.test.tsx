import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {
  createLifecycleTask,
  createWorkspaceHarness,
  WorkspaceBackend,
  WorkspaceClock,
  WorkspaceIds,
} from '../gap-p0-06r1/gapP006TestKit';

const NOW = '2026-08-16T08:00:00.000Z';

describe('P15R visible core interaction', () => {
  it('closes an empty global draft without creating a task', async () => {
    const harness = createWorkspaceHarness(
      new WorkspaceBackend(),
      new WorkspaceClock(NOW),
      new WorkspaceIds(['p15r-empty-unused']),
    );
    const screen = await render(<harness.composition.AppRoot />);
    try {
      await waitFor(() => expect(screen.getByRole('button', {name: '添加任务'})).toBeTruthy());
      await fireEvent.press(screen.getByRole('button', {name: '添加任务'}));
      await fireEvent.press(screen.getByRole('button', {name: '关闭'}));
      await waitFor(() => expect(screen.queryByRole('header', {name: '快速添加任务'})).toBeNull());
      await expect(harness.composition.repository.list()).resolves.toEqual([]);
    } finally {
      await screen.unmount();
    }
  });

  it('hides navigation, exposes a fixed add action and safely saves a global draft to unsorted once', async () => {
    const harness = createWorkspaceHarness(
      new WorkspaceBackend(),
      new WorkspaceClock(NOW),
      new WorkspaceIds(['p15r-global-draft']),
    );
    const screen = await render(<harness.composition.AppRoot />);
    try {
      await waitFor(() => expect(screen.getByRole('button', {name: '添加任务'})).toBeTruthy());
      await fireEvent.press(screen.getByRole('button', {name: '添加任务'}));
      expect(screen.queryByLabelText('底部导航')).toBeNull();
      expect(screen.getByRole('button', {name: '添加任务'})).toBeDisabled();
      await fireEvent.changeText(screen.getByLabelText('任务标题'), '周五交课程报告');
      await fireEvent.press(screen.getByRole('button', {name: '关闭'}));
      await waitFor(() => expect(screen.queryByRole('header', {name: '快速添加任务'})).toBeNull());
      const tasks = await harness.composition.repository.list();
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toMatchObject({title: '交课程报告', placementState: 'UNSORTED'});
    } finally {
      await screen.unmount();
    }
  });

  it('shows one primary start action, correct empty first-step state and low-frequency actions only under more', async () => {
    const harness = createWorkspaceHarness(
      new WorkspaceBackend(),
      new WorkspaceClock(NOW),
      new WorkspaceIds(['p15r-task']),
    );
    const task = await createLifecycleTask(harness, {
      title: '完成很长的课程研究报告初稿',
      description: '',
      important: true,
      urgent: false,
      scheduledStartAt: null,
      dueAt: null,
      estimatedMinutes: 25,
      firstStep: null,
    }, 'p15r:create');
    const screen = await render(<harness.composition.AppRoot />);
    try {
      await waitFor(
        () => expect(screen.getByRole('button', {name: `成长区任务：${task.title}`})).toBeTruthy(),
        {timeout: 5000},
      );
      await fireEvent.press(screen.getByRole('button', {name: `成长区任务：${task.title}`}));
      expect(screen.getByRole('button', {name: '先做 5 分钟'})).toBeTruthy();
      expect(screen.getByRole('button', {name: '添加第一小步'})).toBeDisabled();
      expect(screen.queryByRole('button', {name: '完成这一步'})).toBeNull();
      expect(screen.queryByRole('radio', {name: '更新进度为 100%'})).toBeNull();
      expect(screen.getByRole('radio', {name: '更新进度为 0%'})).toBeTruthy();
      expect(screen.getByRole('radio', {name: '更新进度为 25%'})).toBeTruthy();
      expect(screen.getByRole('radio', {name: '更新进度为 50%'})).toBeTruthy();
      expect(screen.getByRole('radio', {name: '更新进度为 75%'})).toBeTruthy();
      expect(screen.queryByText(/当前位置由重要度|手动紧急度/)).toBeNull();
      expect(screen.queryByText('移动到哪个象限？')).toBeNull();
      expect(screen.queryByRole('button', {name: '复制任务'})).toBeNull();
      await fireEvent.press(screen.getByRole('button', {name: '更多'}));
      expect(screen.getByRole('button', {name: '复制任务'})).toBeTruthy();
      expect(screen.getByRole('button', {name: '长期任务计划'})).toBeTruthy();
      expect(screen.getByText('移动到其他象限')).toBeTruthy();
      expect(screen.getByRole('button', {name: '删除任务'})).toBeTruthy();
    } finally {
      await screen.unmount();
    }
  });

  it('coalesces repeated explicit saves and keeps a failed draft visible for retry', async () => {
    const backend = new WorkspaceBackend();
    const harness = createWorkspaceHarness(
      backend,
      new WorkspaceClock(NOW),
      new WorkspaceIds(['p15r-explicit-once']),
    );
    const screen = await render(<harness.composition.AppRoot />);
    try {
      await waitFor(() => expect(screen.getByRole('button', {name: '添加任务'})).toBeTruthy());
      await fireEvent.press(screen.getByRole('button', {name: '添加任务'}));
      await fireEvent.changeText(screen.getByLabelText('任务标题'), '完成提交材料');
      backend.failNextSet(new Error('P15R_CREATE_FAILED'));
      await fireEvent.press(screen.getByRole('button', {name: '关闭'}));
      await waitFor(() =>
        expect(screen.getByText('任务没有保存成功，内容还在，请重试。')).toBeTruthy(),
      );
      expect(screen.getByLabelText('任务标题').props.value).toBe('完成提交材料');

      const save = screen.getByRole('button', {name: '添加任务'});
      await fireEvent.press(save);
      await fireEvent.press(save);
      await waitFor(async () => expect(await harness.composition.repository.list()).toHaveLength(1));
      await waitFor(() => expect(screen.queryByRole('header', {name: '快速添加任务'})).toBeNull());
      await expect(harness.composition.repository.list()).resolves.toHaveLength(1);
    } finally {
      await screen.unmount();
    }
  });
});
