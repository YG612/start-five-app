import React from 'react';
import {
  act,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react-native';
import type {TaskLifecycleTaskInput} from '../../src/application/coreAppService';
import {
  addTaskStep,
  createLifecycleTask,
  createWorkspaceHarness,
  flushUiWork,
  WorkspaceBackend,
  WorkspaceClock,
  WorkspaceIds,
  type WorkspaceHarness,
} from '../gap-p0-06r1/gapP006TestKit';
import {
  PostCommitRefreshFailureBackend,
  RefreshFailureClock,
} from './gapP006R2TestKit';

type Screen = Awaited<ReturnType<typeof render>>;

const CARD = {
  Q1: (title: string) => `救火区任务：${title}`,
  Q2: (title: string) => `成长区任务：${title}`,
} as const;

async function flushUi(turns = 40): Promise<void> {
  await act(async () => {
    await flushUiWork(turns);
  });
}

async function renderApp(harness: WorkspaceHarness): Promise<Screen> {
  const screen = await render(
    React.createElement(harness.composition.AppRoot),
  );
  await waitFor(() =>
    expect(screen.getByText('任务工作台')).toBeTruthy(),
  );
  return screen;
}

async function openTask(
  screen: Screen,
  quadrant: keyof typeof CARD,
  title: string,
): Promise<void> {
  await fireEvent.press(
    screen.getByRole('button', {name: CARD[quadrant](title)}),
  );
  await waitFor(() =>
    expect(screen.getByText(`任务详情：${title}`)).toBeTruthy(),
  );
}

function taskInput(
  title: string,
  important: boolean,
  urgent: boolean,
): TaskLifecycleTaskInput {
  return {
    title,
    description: `${title} 的06R2公开验收数据`,
    important,
    urgent,
    scheduledStartAt: null,
    dueAt: null,
    estimatedMinutes: 5,
    firstStep: null,
  };
}

describe('GAP-P0-06R2 workspace projection and selected-task integrity', () => {
  it('keeps durable create single-flight through a failing projection refresh and restarts with exactly one task', async () => {
    const clock = new RefreshFailureClock();
    const backend = new PostCommitRefreshFailureBackend(clock);
    const ids = new WorkspaceIds(['p006r2-created-once']);
    const harness = createWorkspaceHarness(backend, clock, ids);
    const screen = await renderApp(harness);
    const title = '只创建一次的发布清单';

    try {
      await waitFor(() =>
        expect(
          screen.getByText('还没有活动任务，先新建一项吧。'),
        ).toBeTruthy(),
      );
      await fireEvent.press(
        screen.getByRole('button', {name: '新建任务'}),
      );
      await fireEvent.changeText(screen.getByLabelText('任务名称'), title);
      await fireEvent.press(
        screen.getByRole('checkbox', {name: '重要'}),
      );
      await fireEvent.press(
        screen.getByRole('button', {name: '保存任务'}),
      );
      await flushUi();
      await waitFor(() =>
        expect(
          screen.getByText('GAP_P0_06R2_REFRESH_NOW_FAILED'),
        ).toBeTruthy(),
      );

      const retryRefresh = screen.getByRole('button', {
        name: '重试刷新工作台',
      });
      await act(async () => {
        fireEvent.press(retryRefresh);
        fireEvent.press(retryRefresh);
        await flushUiWork();
      });
      await waitFor(() =>
        expect(screen.getByRole('button', {name: CARD.Q2(title)})).toBeTruthy(),
      );
      expect(backend.committedSets).toHaveLength(1);
      expect(ids.calls).toBe(1);
    } finally {
      await screen.unmount();
    }

    const restartIds = new WorkspaceIds([
      'p006r2-restart-id-must-not-be-used',
    ]);
    const restarted = createWorkspaceHarness(
      backend.byteRestart(),
      new WorkspaceClock(),
      restartIds,
    );
    const restartedScreen = await renderApp(restarted);
    try {
      await waitFor(() =>
        expect(
          restartedScreen.getAllByRole('button', {name: CARD.Q2(title)}),
        ).toHaveLength(1),
      );
      const query = await restarted.lifecycle.getQueryResult();
      expect(query.tasks.map(task => task.title)).toEqual([title]);
      expect(restartIds.calls).toBe(0);
    } finally {
      await restartedScreen.unmount();
    }
  });

  it('keeps global creation and recommendation switching out of selected A detail and binds its public actions to A, not recommended B', async () => {
    const backend = new WorkspaceBackend();
    const seed = createWorkspaceHarness(
      backend,
      new WorkspaceClock(),
      new WorkspaceIds(['p006r2-recommended-b', 'p006r2-selected-a']),
    );
    const taskB = await createLifecycleTask(
      seed,
      taskInput('处理最高优先级告警B', true, true),
      'p006r2:isolation:create-b',
    );
    const taskA = await createLifecycleTask(
      seed,
      taskInput('推进选中的成长任务A', true, false),
      'p006r2:isolation:create-a',
    );

    const uiBackend = backend.byteRestart();
    const ui = createWorkspaceHarness(
      uiBackend,
      new WorkspaceClock(),
      new WorkspaceIds(['p006r2-a-step', 'p006r2-a-focus']),
    );
    const screen = await renderApp(ui);
    try {
      await waitFor(() =>
        expect(screen.getByText(`今日推荐：${taskB.title}`)).toBeTruthy(),
      );
      await openTask(screen, 'Q2', taskA.title);

      await fireEvent.press(
        screen.getByRole('button', {name: '添加第一小步'}),
      );
      await fireEvent.changeText(
        screen.getByLabelText('第一小步'),
        '打开任务A的执行文档',
      );
      await fireEvent.press(
        screen.getByRole('button', {name: '保存小步'}),
      );
      await waitFor(() =>
        expect(screen.getByText('小步：打开任务A的执行文档')).toBeTruthy(),
      );

      await fireEvent.press(
        screen.getByRole('button', {name: '推荐下一项'}),
      );
      await waitFor(() =>
        expect(screen.getByText(`推荐：${taskA.title}`)).toBeTruthy(),
      );
      await fireEvent.press(
        screen.getByRole('button', {name: '开始5分钟'}),
      );
      await flushUi();
      await waitFor(() =>
        expect(screen.getByText(`专注任务：${taskA.title}`)).toBeTruthy(),
      );
      expect(screen.queryByText(`专注任务：${taskB.title}`)).toBeNull();

      expect(screen.queryByRole('button', {name: '新建任务'})).toBeNull();
      expect(
        screen.queryByRole('button', {
          name: `打开今日推荐：${taskB.title}`,
        }),
      ).toBeNull();
      expect(screen.queryByText(`今日推荐：${taskB.title}`)).toBeNull();
    } finally {
      await screen.unmount();
    }

    const restarted = createWorkspaceHarness(
      uiBackend.byteRestart(),
      new WorkspaceClock(),
      new WorkspaceIds(['p006r2-isolation-restart-unused']),
    );
    const state = await restarted.composition.service.getState();
    const restoredA = state.tasks.find(task => task.id === taskA.id);
    const restoredB = state.tasks.find(task => task.id === taskB.id);
    expect(restoredA?.status).toBe('in_progress');
    expect(restoredA?.subtasks.map(step => step.title)).toEqual([
      '打开任务A的执行文档',
    ]);
    expect(restoredB?.status).toBe('pending');
    expect(restoredB?.subtasks).toHaveLength(0);
  });

  it('removes completed selected A immediately on return and recomputes the workspace recommendation to fallback B', async () => {
    const backend = new WorkspaceBackend();
    const seed = createWorkspaceHarness(
      backend,
      new WorkspaceClock(),
      new WorkspaceIds([
        'p006r2-completable-a',
        'p006r2-fallback-b',
        'p006r2-completable-a-step',
      ]),
    );
    const taskA = await createLifecycleTask(
      seed,
      taskInput('完成后立即离开工作台的任务A', true, true),
      'p006r2:complete:create-a',
    );
    const taskB = await createLifecycleTask(
      seed,
      taskInput('完成A后的推荐任务B', true, false),
      'p006r2:complete:create-b',
    );
    const withStep = await addTaskStep(
      seed,
      taskA.id,
      '提交任务A的最终结果',
      'p006r2:complete:add-step',
    );
    const started = await seed.composition.service.startRecommended({
      operationId: 'p006r2:complete:start-a',
    });
    expect(started.id).toBe(taskA.id);
    const completableStep = withStep.subtasks[0];
    if (completableStep === undefined) {
      throw new Error('GAP_P0_06R2_FIXTURE_STEP_MISSING');
    }
    await seed.composition.service.finishStep(
      taskA.id,
      completableStep.id,
      {operationId: 'p006r2:complete:finish-step-a'},
    );

    const uiBackend = backend.byteRestart();
    const ui = createWorkspaceHarness(
      uiBackend,
      new WorkspaceClock(),
      new WorkspaceIds(['p006r2-complete-ui-unused']),
    );
    const screen = await renderApp(ui);
    try {
      await waitFor(() =>
        expect(screen.getByText(`任务详情：${taskA.title}`)).toBeTruthy(),
      );
      await fireEvent.press(
        screen.getByRole('button', {name: '完成任务'}),
      );
      await waitFor(() =>
        expect(
          screen.queryByRole('button', {name: '完成任务'}),
        ).toBeNull(),
      );
      await fireEvent.press(
        screen.getByRole('button', {name: '返回任务工作台'}),
      );

      await waitFor(() =>
        expect(screen.getByText(`今日推荐：${taskB.title}`)).toBeTruthy(),
      );
      expect(
        screen.queryByRole('button', {name: CARD.Q1(taskA.title)}),
      ).toBeNull();
      expect(screen.queryByText(`今日推荐：${taskA.title}`)).toBeNull();
      expect(
        screen.getByRole('button', {name: CARD.Q2(taskB.title)}),
      ).toBeTruthy();
    } finally {
      await screen.unmount();
    }

    const restarted = createWorkspaceHarness(
      uiBackend.byteRestart(),
      new WorkspaceClock(),
      new WorkspaceIds(['p006r2-complete-restart-unused']),
    );
    const query = await restarted.lifecycle.getQueryResult();
    expect(query.tasks.map(task => task.id)).toEqual([taskB.id]);
    expect(query.recommendation?.id).toBe(taskB.id);
  });
});
