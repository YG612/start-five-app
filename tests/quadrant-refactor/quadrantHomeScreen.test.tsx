import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
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
  await act(async () => {
    await flushUiWork(50);
  });
}

describe('quadrant home vertical slice', () => {
  it('opens as the guest default, creates in an empty quadrant, edits directly, and starts exact five minutes', async () => {
    const backend = new WorkspaceBackend();
    const clock = new WorkspaceClock(NOW);
    const ids = new WorkspaceIds(['created-growth-task', 'focus-created-growth-task']);
    const harness = createWorkspaceHarness(backend, clock, ids);
    const screen = await render(React.createElement(harness.composition.AppRoot));

    try {
      await waitFor(() => expect(screen.getByText('今天先开始一次')).toBeTruthy());
      expect(screen.getByRole('tab', {name: '象限'}).props.accessibilityState).toMatchObject({
        selected: true,
      });
      expect(screen.getByLabelText('四象限任务地图')).toBeTruthy();
      expect(screen.queryByText('开始我的第一项')).toBeNull();

      await fireEvent.press(screen.getByRole('button', {name: '在成长区添加任务'}));
      await fireEvent.changeText(screen.getByLabelText('任务标题'), '准备下周答辩');
      await fireEvent.changeText(screen.getByLabelText('第一小步'), '打开要求并列出目录');
      expect(screen.getByRole('radio', {name: '选择成长区'}).props.accessibilityState).toMatchObject({
        selected: true,
      });
      await fireEvent.press(screen.getByRole('button', {name: '添加任务'}));
      await waitFor(() =>
        expect(screen.getByRole('button', {name: '成长区任务：准备下周答辩'})).toBeTruthy(),
      );

      await fireEvent.press(screen.getByRole('button', {name: '成长区任务：准备下周答辩'}));
      await waitFor(() => expect(screen.getByRole('header', {name: '准备下周答辩'})).toBeTruthy());
      await fireEvent.press(screen.getByRole('button', {name: '编辑更多'}));
      await fireEvent.changeText(screen.getByLabelText('任务标题'), '准备周五答辩');
      await fireEvent.press(screen.getByRole('button', {name: '保存修改'}));
      await waitFor(() =>
        expect(screen.getByRole('button', {name: '成长区任务：准备周五答辩'})).toBeTruthy(),
      );

      await fireEvent.press(screen.getByRole('button', {name: '成长区任务：准备周五答辩'}));
      await fireEvent.press(screen.getByRole('button', {name: '先做 5 分钟'}));
      await flushUi();
      await waitFor(() => expect(screen.getByText('正在专注')).toBeTruthy());
      expect(screen.getByText('准备周五答辩')).toBeTruthy();
      expect(screen.getByLabelText('5分钟剩余时间')).toHaveTextContent('5:00');

      const state = await harness.composition.service.getState();
      expect(state.tasks).toHaveLength(1);
      expect(state.tasks[0]).toMatchObject({
        title: '准备周五答辩',
        important: true,
        urgent: false,
        firstStep: '打开要求并列出目录',
        status: 'in_progress',
      });
    } finally {
      await screen.unmount();
    }
  });

  it('completes through the existing idempotent lifecycle and shows immediate growth feedback', async () => {
    const backend = new WorkspaceBackend();
    const clock = new WorkspaceClock(NOW);
    const seed = createWorkspaceHarness(
      backend,
      clock,
      new WorkspaceIds(['growth-complete-task']),
    );
    const task = await createLifecycleTask(
      seed,
      {
        title: '完成作品集首页',
        description: '',
        important: true,
        urgent: false,
        scheduledStartAt: null,
        dueAt: null,
        estimatedMinutes: 5,
        firstStep: null,
      },
      'quadrant-refactor:seed:create',
    );
    const screen = await render(React.createElement(seed.composition.AppRoot));

    try {
      await waitFor(() =>
        expect(screen.getByRole('button', {name: `成长区任务：${task.title}`})).toBeTruthy(),
      );
      await fireEvent.press(screen.getByRole('button', {name: `成长区任务：${task.title}`}));
      await fireEvent.press(screen.getByRole('button', {name: '完成任务'}));
      await waitFor(() => expect(screen.getByText('+45')).toBeTruthy());
      expect(screen.getByText('任务已完成')).toBeTruthy();
      expect(screen.getByText('完成成长区任务，行动已计入成长。')).toBeTruthy();
      expect(screen.getByText('当前累计 45 成长值')).toBeTruthy();
      expect(screen.queryByRole('button', {name: `成长区任务：${task.title}`})).toBeNull();

      const completed = await seed.composition.repository.getById(task.id);
      expect(completed).toMatchObject({status: 'completed', score: 45});
      const replay = await seed.lifecycle.complete(task.id, {
        operationId: 'quadrant-refactor:complete:replay',
      });
      expect(replay.points).toBe(0);
      await expect(seed.composition.service.getState()).resolves.toMatchObject({totalScore: 45});
    } finally {
      await screen.unmount();
    }
  });

  it('persists the map/list preference outside the task schema and restores it after restart', async () => {
    const backend = new WorkspaceBackend();
    const first = createWorkspaceHarness(
      backend,
      new WorkspaceClock(NOW),
      new WorkspaceIds(['view-preference-unused']),
    );
    const screen = await render(React.createElement(first.composition.AppRoot));
    try {
      await waitFor(() => expect(screen.getByLabelText('四象限任务地图')).toBeTruthy());
      await fireEvent.press(screen.getByRole('tab', {name: '清单'}));
      await waitFor(() => expect(screen.getAllByText('这里还没有任务')).toHaveLength(4));
    } finally {
      await screen.unmount();
    }

    const restarted = createWorkspaceHarness(
      backend.byteRestart(),
      new WorkspaceClock(NOW),
      new WorkspaceIds(['view-preference-restart-unused']),
    );
    const restartedScreen = await render(
      React.createElement(restarted.composition.AppRoot),
    );
    try {
      await waitFor(() =>
        expect(restartedScreen.getByRole('tab', {name: '清单'}).props.accessibilityState).toMatchObject({
          selected: true,
        }),
      );
      expect(restartedScreen.queryByLabelText('四象限任务地图')).toBeNull();
      await expect(restarted.composition.repository.list()).resolves.toEqual([]);
    } finally {
      await restartedScreen.unmount();
    }
  });

  it('moves a real task once, keeps both views in sync, and restores the original quadrant on undo', async () => {
    const backend = new WorkspaceBackend();
    const clock = new WorkspaceClock(NOW);
    const harness = createWorkspaceHarness(
      backend,
      clock,
      new WorkspaceIds(['move-and-undo-task']),
    );
    const task = await createLifecycleTask(
      harness,
      {
        title: '调整发布计划',
        description: '',
        important: true,
        urgent: false,
        scheduledStartAt: null,
        dueAt: null,
        estimatedMinutes: 5,
        firstStep: null,
      },
      'quadrant-refactor:move:create',
    );
    const screen = await render(React.createElement(harness.composition.AppRoot));
    try {
      await waitFor(() =>
        expect(screen.getByRole('button', {name: `成长区任务：${task.title}`})).toBeTruthy(),
      );
      await fireEvent.press(screen.getByRole('button', {name: `成长区任务：${task.title}`}));
      await fireEvent.press(screen.getByRole('button', {name: '更多'}));
      await fireEvent.press(screen.getByRole('button', {name: '移动到救火区'}));
      await waitFor(() => expect(screen.getByRole('button', {name: '撤销移动'})).toBeTruthy());
      await expect(harness.composition.repository.getById(task.id)).resolves.toMatchObject({
        important: true,
        urgent: true,
      });
      expect(screen.getByRole('button', {name: `救火区任务：${task.title}`})).toBeTruthy();

      await fireEvent.press(screen.getByRole('button', {name: '撤销移动'}));
      await waitFor(() =>
        expect(screen.getByRole('button', {name: `成长区任务：${task.title}`})).toBeTruthy(),
      );
      expect(screen.queryByRole('button', {name: '撤销移动'})).toBeNull();
      await expect(harness.composition.repository.getById(task.id)).resolves.toMatchObject({
        important: true,
        urgent: false,
      });
    } finally {
      await screen.unmount();
    }

    const restarted = createWorkspaceHarness(
      backend.byteRestart(),
      new WorkspaceClock(NOW),
      new WorkspaceIds(['move-and-undo-restart-unused']),
    );
    const restartedScreen = await render(
      React.createElement(restarted.composition.AppRoot),
    );
    try {
      await waitFor(() =>
        expect(restartedScreen.getByRole('button', {name: `成长区任务：${task.title}`})).toBeTruthy(),
      );
      expect(restartedScreen.queryByRole('button', {name: `救火区任务：${task.title}`})).toBeNull();
    } finally {
      await restartedScreen.unmount();
    }
  });

  it('supports explicit move and completion undo through durable lifecycle operations', async () => {
    const backend = new WorkspaceBackend();
    const harness = createWorkspaceHarness(
      backend,
      new WorkspaceClock(NOW),
      new WorkspaceIds(['long-press-complete-undo-task']),
    );
    const task = await createLifecycleTask(
      harness,
      {
        title: '长按移动并撤销完成',
        description: '',
        important: true,
        urgent: false,
        scheduledStartAt: null,
        dueAt: null,
        estimatedMinutes: 5,
        firstStep: null,
      },
      'quadrant-refactor:long-press:create',
    );
    const screen = await render(React.createElement(harness.composition.AppRoot));
    try {
      await waitFor(() =>
        expect(screen.getByRole('button', {name: `成长区任务：${task.title}`})).toBeTruthy(),
      );
      await fireEvent.press(screen.getByRole('button', {name: `成长区任务：${task.title}`}));
      await fireEvent.press(screen.getByRole('button', {name: '更多'}));
      await fireEvent.press(screen.getByRole('button', {name: '移动到救火区'}));
      await waitFor(() =>
        expect(screen.getByRole('button', {name: `救火区任务：${task.title}`})).toBeTruthy(),
      );

      await fireEvent.press(screen.getByRole('button', {name: `救火区任务：${task.title}`}));
      await fireEvent.press(screen.getByRole('button', {name: '完成任务'}));
      await waitFor(() => expect(screen.getByRole('button', {name: '撤销完成'})).toBeTruthy());
      expect(screen.getByText('+35')).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', {name: '撤销完成'}));
      await waitFor(() =>
        expect(screen.getByRole('button', {name: `救火区任务：${task.title}`})).toBeTruthy(),
      );
      await expect(harness.composition.repository.getById(task.id)).resolves.toMatchObject({
        status: 'pending',
        score: null,
        scoreAwardedAt: null,
      });
      await expect(harness.composition.service.getState()).resolves.toMatchObject({totalScore: 0});
    } finally {
      await screen.unmount();
    }
  });

  it('persists dark and reduce-motion accessibility preferences without changing task bytes', async () => {
    const backend = new WorkspaceBackend();
    const first = createWorkspaceHarness(
      backend,
      new WorkspaceClock(NOW),
      new WorkspaceIds(['accessibility-preference-unused']),
    );
    const screen = await render(React.createElement(first.composition.AppRoot));
    try {
      await waitFor(() => expect(screen.getByText('今天先开始一次')).toBeTruthy());
      await fireEvent.press(screen.getByRole('tab', {name: '我的'}));
      await fireEvent.press(screen.getByRole('button', {name: '外观'}));
      await fireEvent.press(screen.getByRole('button', {name: '深色'}));
      await waitFor(() =>
        expect(screen.getByLabelText('先做5分钟应用')).toHaveStyle({
          backgroundColor: '#0F1F1C',
        }),
      );
      await fireEvent.press(screen.getByRole('switch', {name: '减少动态'}));
      expect(
        screen.getByRole('switch', {name: '减少动态'}).props.accessibilityState,
      ).toMatchObject({checked: true});
    } finally {
      await screen.unmount();
    }

    const restarted = createWorkspaceHarness(
      backend.byteRestart(),
      new WorkspaceClock(NOW),
      new WorkspaceIds(['accessibility-preference-restart-unused']),
    );
    const restartedScreen = await render(
      React.createElement(restarted.composition.AppRoot),
    );
    try {
      await waitFor(() =>
        expect(restartedScreen.getByLabelText('先做5分钟应用')).toHaveStyle({
          backgroundColor: '#0F1F1C',
        }),
      );
      await fireEvent.press(restartedScreen.getByRole('tab', {name: '我的'}));
      expect(
        restartedScreen.getByRole('switch', {name: '减少动态'}).props
          .accessibilityState,
      ).toMatchObject({checked: true});
      await expect(restarted.composition.repository.list()).resolves.toEqual([]);
    } finally {
      await restartedScreen.unmount();
    }
  });

  it('deletes from quick edit only after explicit confirmation', async () => {
    const backend = new WorkspaceBackend();
    const harness = createWorkspaceHarness(
      backend,
      new WorkspaceClock(NOW),
      new WorkspaceIds(['quick-delete-task']),
    );
    const task = await createLifecycleTask(
      harness,
      {
        title: '删除不再需要的任务',
        description: '',
        important: false,
        urgent: false,
        scheduledStartAt: null,
        dueAt: null,
        estimatedMinutes: 5,
        firstStep: null,
      },
      'quadrant-refactor:delete:create',
    );
    const screen = await render(React.createElement(harness.composition.AppRoot));
    try {
      await waitFor(() =>
        expect(screen.getByRole('button', {name: `清理区任务：${task.title}`})).toBeTruthy(),
      );
      await fireEvent.press(screen.getByRole('button', {name: `清理区任务：${task.title}`}));
      await fireEvent.press(screen.getByRole('button', {name: '更多'}));
      await fireEvent.press(screen.getByRole('button', {name: '删除任务'}));
      expect(screen.getByRole('button', {name: '确认删除'})).toBeTruthy();
      expect(screen.getByRole('button', {name: '取消删除'})).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', {name: '确认删除'}));
      await waitFor(() =>
        expect(screen.queryByRole('button', {name: `清理区任务：${task.title}`})).toBeNull(),
      );
      await expect(harness.composition.repository.getById(task.id)).resolves.toBeNull();
    } finally {
      await screen.unmount();
    }
  });
});
