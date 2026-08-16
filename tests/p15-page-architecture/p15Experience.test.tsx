import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {
  createLifecycleTask,
  createWorkspaceHarness,
  flushUiWork,
  startTaskAndFocus,
  WorkspaceBackend,
  WorkspaceClock,
  WorkspaceIds,
} from '../gap-p0-06r1/gapP006TestKit';

const NOW = '2026-08-16T08:00:00.000Z';
const TASK_INPUT = {
  title: '整理研究报告',
  description: '',
  important: true,
  urgent: false,
  scheduledStartAt: null,
  dueAt: null,
  estimatedMinutes: 25,
  firstStep: '打开文档并找到第二章',
} as const;

describe('P15 four-page architecture', () => {
  it('keeps quadrants action-first and gives focus, growth, and mine distinct empty shells', async () => {
    const harness = createWorkspaceHarness(
      new WorkspaceBackend(),
      new WorkspaceClock(NOW),
      new WorkspaceIds(['p15-empty-unused']),
    );
    const screen = await render(<harness.composition.AppRoot />);
    try {
      await waitFor(() => expect(screen.getByRole('header', {name: '今天先开始一次'})).toBeTruthy());
      expect(screen.queryByText('种子 · 0/3')).toBeNull();
      expect(screen.queryByRole('button', {name: '今天轻一点'})).toBeNull();
      expect(screen.getByLabelText('首页主行动')).toBeTruthy();

      await fireEvent.press(screen.getByRole('tab', {name: '专注'}));
      expect(screen.getByRole('header', {name: '专注'})).toBeTruthy();
      expect(screen.getByText('给重要任务留一小段时间')).toBeTruthy();
      expect(screen.queryByRole('button', {name: '先做 50 分钟'})).toBeNull();

      await fireEvent.press(screen.getByRole('tab', {name: '成长'}));
      expect(screen.getByText('当前 0 成长值')).toBeTruthy();
      expect(screen.getByText('再使用几天，我们会在这里显示你的变化。')).toBeTruthy();
      expect(screen.getByRole('button', {name: '最近成长'})).toBeTruthy();

      await fireEvent.press(screen.getByRole('tab', {name: '我的'}));
      const headers = screen.getAllByRole('header').map(item => item.props.children);
      expect(headers).toEqual(expect.arrayContaining([
        '我的',
        '我的节奏',
        '任务与象限',
        '提醒与专注保护',
        '外观与无障碍',
        '数据与隐私',
        '帮助与关于',
      ]));
      expect(screen.getByRole('switch', {name: '减少动态'})).toBeTruthy();
      expect(screen.getByText(/默认只保存在这台设备上/)).toBeTruthy();
    } finally {
      await screen.unmount();
    }
  });

  it('keeps 50 minutes behind more durations and hides navigation during an active focus', async () => {
    const backend = new WorkspaceBackend();
    const clock = new WorkspaceClock(NOW);
    const seed = createWorkspaceHarness(backend, clock, new WorkspaceIds(['p15-task']));
    const task = await createLifecycleTask(seed, TASK_INPUT, 'p15:create');

    const firstScreen = await render(<seed.composition.AppRoot />);
    try {
      await waitFor(() => expect(firstScreen.getByRole('tab', {name: '专注'})).toBeTruthy());
      await fireEvent.press(firstScreen.getByRole('tab', {name: '专注'}));
      expect(firstScreen.getByRole('button', {name: '先做 2 分钟'})).toBeTruthy();
      expect(firstScreen.getByRole('button', {name: '先做 25 分钟'})).toBeTruthy();
      expect(firstScreen.queryByRole('button', {name: '先做 50 分钟'})).toBeNull();
      await fireEvent.press(firstScreen.getByRole('button', {name: '更多时长'}));
      expect(firstScreen.getByRole('button', {name: '先做 50 分钟'})).toBeTruthy();
    } finally {
      await firstScreen.unmount();
    }

    await startTaskAndFocus(seed, backend, clock, new WorkspaceIds(['p15-focus']), task.id);
    const restarted = createWorkspaceHarness(
      backend.byteRestart(),
      clock,
      new WorkspaceIds(['p15-focus-unused']),
    );
    const activeScreen = await render(<restarted.composition.AppRoot />);
    try {
      await waitFor(() => expect(activeScreen.getByRole('button', {name: `返回正在进行的专注：${task.title}`})).toBeTruthy());
      await fireEvent.press(activeScreen.getByRole('button', {name: `返回正在进行的专注：${task.title}`}));
      await flushUiWork();
      await waitFor(() => expect(activeScreen.getByText('正在专注')).toBeTruthy());
      expect(activeScreen.queryByLabelText('底部导航')).toBeNull();
      expect(activeScreen.getByText(task.title)).toBeTruthy();
    } finally {
      await activeScreen.unmount();
    }
  });
});
