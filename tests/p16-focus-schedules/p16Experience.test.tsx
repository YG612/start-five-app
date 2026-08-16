import React from 'react';
import {AppState, type AppStateStatus} from 'react-native';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {
  createLifecycleTask,
  createWorkspaceHarness,
  flushUiWork,
  WorkspaceBackend,
  WorkspaceClock,
  WorkspaceIds,
} from '../gap-p0-06r1/gapP006TestKit';

const NOW = '2026-08-16T08:00:00.000Z';
const TASK_INPUT = {
  title: '修改论文第二章',
  description: '',
  important: true,
  urgent: false,
  scheduledStartAt: null,
  dueAt: null,
  estimatedMinutes: 25,
  firstStep: '打开文档，找到 2.1 节',
} as const;

describe('P16 focus schedule experience', () => {
  it('creates a daily growth-zone schedule with the 25-minute first-use default and backup v2', async () => {
    const harness = createWorkspaceHarness(
      new WorkspaceBackend(),
      new WorkspaceClock(NOW),
      new WorkspaceIds(['p16-schedule']),
    );
    const screen = await render(<harness.composition.AppRoot />);
    try {
      await waitFor(() => expect(screen.getByRole('tab', {name: '专注'})).toBeTruthy());
      await fireEvent.press(screen.getByRole('tab', {name: '专注'}));
      await fireEvent.press(screen.getAllByRole('button', {name: '安排一段专注'})[0]!);
      expect(screen.getByRole('tab', {name: '25 分钟'}).props.accessibilityState).toMatchObject({selected: true});
      expect(screen.getByRole('tab', {name: '成长区的一项任务'}).props.accessibilityState).toMatchObject({selected: true});
      await fireEvent.press(screen.getByRole('tab', {name: '每天 20:30'}));
      await fireEvent.press(screen.getByRole('button', {name: '保存专注时段'}));
      await flushUiWork();
      await waitFor(() => expect(screen.getAllByText('成长区的一项任务').length).toBeGreaterThan(0));
      await expect(harness.composition.focusSchedules.list()).resolves.toEqual([
        expect.objectContaining({
          durationMinutes: 25,
          target: {kind: 'QUADRANT', quadrant: 'Q2'},
          recurrence: {kind: 'DAILY', localTime: '20:30', timezone: expect.any(String)},
        }),
      ]);
      const backup = await harness.composition.localBackup.exportBackup();
      expect(backup.preview.schemaVersion).toBe(2);
      expect(backup.preview.stores).toContainEqual({alias: 'focusSchedules', recordCount: 1});
    } finally {
      await screen.unmount();
    }
  });

  it('opens from a task panel with that task selected by default', async () => {
    const harness = createWorkspaceHarness(
      new WorkspaceBackend(),
      new WorkspaceClock(NOW),
      new WorkspaceIds(['p16-task', 'p16-unused']),
    );
    const task = await createLifecycleTask(harness, TASK_INPUT, 'p16:task:create');
    const screen = await render(<harness.composition.AppRoot />);
    try {
      await waitFor(() => expect(screen.getByRole('button', {name: `成长区任务：${task.title}`})).toBeTruthy());
      await fireEvent.press(screen.getByRole('button', {name: `成长区任务：${task.title}`}));
      await fireEvent.press(screen.getByRole('button', {name: '安排专注时段'}));
      expect(screen.getByRole('tab', {name: '当前任务'}).props.accessibilityState).toMatchObject({selected: true});
      await fireEvent.press(screen.getByRole('button', {name: '保存专注时段'}));
      await flushUiWork();
      await expect(harness.composition.focusSchedules.list()).resolves.toEqual([
        expect.objectContaining({target: {kind: 'TASK', taskId: task.id}}),
      ]);
    } finally {
      await screen.unmount();
    }
  });

  it('runs reduce-distractions quietly, deduplicates a background interruption, and offers the phone-exit rescue', async () => {
    const backend = new WorkspaceBackend();
    const clock = new WorkspaceClock(NOW);
    const harness = createWorkspaceHarness(
      backend,
      clock,
      new WorkspaceIds(['p16-focus-task', 'p16-reduce-schedule', 'p16-focus-session']),
    );
    const task = await createLifecycleTask(harness, TASK_INPUT, 'p16:focus:create');
    await harness.composition.focusSchedules.create({
      target: {kind: 'TASK', taskId: task.id},
      durationMinutes: 25,
      recurrence: {kind: 'ONCE', startsAt: '2026-08-16T12:30:00.000Z'},
      protectionLevel: 'REDUCE_DISTRACTIONS',
    });
    const listeners: Array<(state: AppStateStatus) => void> = [];
    const appStateSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      let active = true;
      listeners.push(state => {
        if (active) listener(state);
      });
      return {remove: () => { active = false; }} as never;
    });
    const screen = await render(<harness.composition.AppRoot />);
    try {
      await waitFor(() => expect(screen.getByRole('tab', {name: '专注'})).toBeTruthy());
      await fireEvent.press(screen.getByRole('tab', {name: '专注'}));
      await waitFor(() => expect(screen.getAllByText('修改论文第二章').length).toBeGreaterThan(0));
      await fireEvent.press(screen.getByRole('button', {name: '现在开始'}));
      await flushUiWork();
      await waitFor(() => expect(screen.getByText('现在先做')).toBeTruthy());
      expect(screen.queryByLabelText('底部导航')).toBeNull();
      expect(screen.queryByRole('button', {name: '最近专注'})).toBeNull();
      expect(screen.getByText('暂停')).toBeTruthy();
      expect(screen.getByRole('button', {name: '这一步完成了'})).toBeTruthy();

      await act(async () => {
        listeners.forEach(listener => listener('background'));
        clock.set('2026-08-16T08:00:06.000Z');
        listeners.forEach(listener => listener('active'));
      });
      await waitFor(() => expect(screen.getByText('刚才离开了一会儿，继续这一小步就可以。')).toBeTruthy());
      expect(screen.getAllByText('刚才离开了一会儿，继续这一小步就可以。')).toHaveLength(1);

      await fireEvent.press(screen.getByRole('button', {name: '需要提前结束'}));
      await fireEvent.press(screen.getByRole('button', {name: '只是想刷手机'}));
      expect(screen.getByText('要不要再坚持 2 分钟后再决定？')).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', {name: '再做 2 分钟'}));
      expect(screen.getByText('现在先做')).toBeTruthy();
    } finally {
      appStateSpy.mockRestore();
      await screen.unmount();
    }
  });
});
