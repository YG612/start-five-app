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
  P0_06_AT,
  startTaskAndFocus,
  WorkspaceBackend,
  WorkspaceClock,
  WorkspaceIds,
  type WorkspaceHarness,
} from './gapP006TestKit';

type Screen = Awaited<ReturnType<typeof render>>;

const QUADRANT_CARD = {
  Q1: (title: string) => `救火区任务：${title}`,
  Q2: (title: string) => `成长区任务：${title}`,
  Q3: (title: string) => `干扰区任务：${title}`,
  Q4: (title: string) => `清理区任务：${title}`,
} as const;

async function flushUi(turns = 40): Promise<void> {
  await act(async () => {
    await flushUiWork(turns);
  });
}

async function renderApp(
  harness: WorkspaceHarness,
): Promise<Screen> {
  const screen = await render(
    React.createElement(harness.composition.AppRoot),
  );
  await waitFor(() =>
    expect(screen.getAllByRole('header').length).toBeGreaterThan(0),
  );
  return screen;
}

async function openTask(
  screen: Screen,
  quadrant: keyof typeof QUADRANT_CARD,
  title: string,
): Promise<void> {
  await fireEvent.press(
    screen.getByRole('button', {name: QUADRANT_CARD[quadrant](title)}),
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
    description: `${title} 的公开工作台验收数据`,
    important,
    urgent,
    scheduledStartAt: null,
    dueAt: null,
    estimatedMinutes: 5,
    firstStep: null,
  };
}

describe('GAP-P0-06 public AppRoot four-quadrant task workspace', () => {
  it('cold-starts every active task in the correct quadrant while completed and soft-deleted tasks stay out', async () => {
    const backend = new WorkspaceBackend();
    const seed = createWorkspaceHarness(
      backend,
      new WorkspaceClock(),
      new WorkspaceIds([
        'p006-q1',
        'p006-q2',
        'p006-q3',
        'p006-q4',
        'p006-completed',
        'p006-deleted',
      ]),
    );
    const q1 = await createLifecycleTask(
      seed,
      taskInput('处理线上故障', true, true),
      'p006:seed:q1',
    );
    const q2 = await createLifecycleTask(
      seed,
      taskInput('准备成长计划', true, false),
      'p006:seed:q2',
    );
    const q3 = await createLifecycleTask(
      seed,
      taskInput('回复临时消息', false, true),
      'p006:seed:q3',
    );
    const q4 = await createLifecycleTask(
      seed,
      taskInput('整理下载目录', false, false),
      'p006:seed:q4',
    );
    const completed = await createLifecycleTask(
      seed,
      taskInput('已经完成的任务', true, true),
      'p006:seed:completed',
    );
    await seed.lifecycle.complete(completed.id, {
      operationId: 'p006:seed:complete',
    });
    const deleted = await createLifecycleTask(
      seed,
      taskInput('已经删除的任务', true, true),
      'p006:seed:deleted',
    );
    await seed.lifecycle.softDelete(deleted.id, {
      operationId: 'p006:seed:delete',
    });

    const restartedBackend = backend.byteRestart();
    const restarted = createWorkspaceHarness(
      restartedBackend,
      new WorkspaceClock(),
      new WorkspaceIds(['p006-cold-start-id-must-not-be-used']),
    );
    const screen = await renderApp(restarted);
    try {
      await waitFor(() =>
        expect(screen.getByText('任务工作台')).toBeTruthy(),
      );
      expect(
        screen.getByRole('button', {name: QUADRANT_CARD.Q1(q1.title)}),
      ).toBeTruthy();
      expect(
        screen.getByRole('button', {name: QUADRANT_CARD.Q2(q2.title)}),
      ).toBeTruthy();
      expect(
        screen.getByRole('button', {name: QUADRANT_CARD.Q3(q3.title)}),
      ).toBeTruthy();
      expect(
        screen.getByRole('button', {name: QUADRANT_CARD.Q4(q4.title)}),
      ).toBeTruthy();
      expect(screen.queryByText(completed.title)).toBeNull();
      expect(screen.queryByText(deleted.title)).toBeNull();
      expect(screen.queryByText(`今日推荐：${completed.title}`)).toBeNull();
      expect(screen.queryByText(`今日推荐：${deleted.title}`)).toBeNull();
    } finally {
      await screen.unmount();
    }
  });

  it('creates a task through the UI, places it immediately in Q2, and restores it from copied backend bytes', async () => {
    const backend = new WorkspaceBackend();
    const ids = new WorkspaceIds(['p006-ui-created-task']);
    const first = createWorkspaceHarness(
      backend,
      new WorkspaceClock(),
      ids,
    );
    const screen = await renderApp(first);
    const title = '制定季度学习计划';
    try {
      await waitFor(() =>
        expect(screen.getByText('任务工作台')).toBeTruthy(),
      );
      await fireEvent.press(
        screen.getByRole('button', {name: '新建任务'}),
      );
      fireEvent.changeText(screen.getByLabelText('任务名称'), title);
      await fireEvent.press(
        screen.getByRole('checkbox', {name: '重要'}),
      );
      expect(
        screen.getByRole('checkbox', {name: '重要'}).props.accessibilityState,
      ).toMatchObject({checked: true});
      expect(
        screen.getByRole('checkbox', {name: '紧急'}).props.accessibilityState,
      ).toMatchObject({checked: false});
      await fireEvent.press(
        screen.getByRole('button', {name: '保存任务'}),
      );
      await waitFor(() =>
        expect(
          screen.getByRole('button', {name: QUADRANT_CARD.Q2(title)}),
        ).toBeTruthy(),
      );
      expect(screen.queryByRole('button', {name: QUADRANT_CARD.Q1(title)})).toBeNull();
      expect(screen.queryByRole('button', {name: QUADRANT_CARD.Q3(title)})).toBeNull();
      expect(screen.queryByRole('button', {name: QUADRANT_CARD.Q4(title)})).toBeNull();
      expect(ids.calls).toBe(1);
    } finally {
      await screen.unmount();
    }

    const restartIds = new WorkspaceIds(['p006-restart-id-must-not-be-used']);
    const restarted = createWorkspaceHarness(
      backend.byteRestart(),
      new WorkspaceClock(),
      restartIds,
    );
    const restartedScreen = await renderApp(restarted);
    try {
      await waitFor(() =>
        expect(
          restartedScreen.getByRole('button', {
            name: QUADRANT_CARD.Q2(title),
          }),
        ).toBeTruthy(),
      );
      expect(restartIds.calls).toBe(0);
    } finally {
      await restartedScreen.unmount();
    }
  });

  it('opens any task card with isolated detail, step, score, and task-bound focus context', async () => {
    const backend = new WorkspaceBackend();
    const clock = new WorkspaceClock();
    const seed = createWorkspaceHarness(
      backend,
      clock,
      new WorkspaceIds([
        'p006-detail-a',
        'p006-detail-a-step',
        'p006-detail-b',
        'p006-detail-b-step',
        'p006-score-source',
      ]),
    );
    const taskA = await createLifecycleTask(
      seed,
      taskInput('修复支付告警', true, true),
      'p006:detail:create-a',
    );
    const taskB = await createLifecycleTask(
      seed,
      taskInput('完成课程练习', true, false),
      'p006:detail:create-b',
    );
    const scored = await createLifecycleTask(
      seed,
      taskInput('已完成的成长任务', true, false),
      'p006:detail:create-score',
    );
    await seed.lifecycle.complete(scored.id, {
      operationId: 'p006:detail:complete-score',
    });
    // Finish all lifecycle-ledger seed mutations before legacy core-service
    // controls mutate substeps; this keeps fixture setup within the accepted
    // public coordination contract instead of manufacturing a stale ledger.
    await addTaskStep(
      seed,
      taskA.id,
      '核对支付日志',
      'p006:detail:step-a',
    );
    await addTaskStep(
      seed,
      taskB.id,
      '打开练习页面',
      'p006:detail:step-b',
    );
    await startTaskAndFocus(
      seed,
      backend,
      clock,
      new WorkspaceIds(['p006-detail-focus-a']),
      taskA.id,
    );

    const restarted = createWorkspaceHarness(
      backend.byteRestart(),
      new WorkspaceClock(),
      new WorkspaceIds(['p006-detail-restart-id-must-not-be-used']),
    );
    const screen = await renderApp(restarted);
    try {
      await openTask(screen, 'Q1', taskA.title);
      expect(screen.getByText('小步：核对支付日志')).toBeTruthy();
      expect(screen.queryByText('小步：打开练习页面')).toBeNull();
      expect(screen.getByText('总积分：45')).toBeTruthy();
      await waitFor(() =>
        expect(screen.getByText(`专注任务：${taskA.title}`)).toBeTruthy(),
      );

      await openTask(screen, 'Q2', taskB.title);
      expect(screen.getByText('小步：打开练习页面')).toBeTruthy();
      expect(screen.queryByText('小步：核对支付日志')).toBeNull();
      expect(screen.getByText('总积分：45')).toBeTruthy();
      expect(screen.getByText(`专注任务：${taskA.title}`)).toBeTruthy();
      expect(screen.queryByText(`专注任务：${taskB.title}`)).toBeNull();
    } finally {
      await screen.unmount();
    }
  });

  it('moves an edited task only after one durable commit and keeps a failed edit retryable without false UI', async () => {
    const backend = new WorkspaceBackend();
    const seed = createWorkspaceHarness(
      backend,
      new WorkspaceClock(),
      new WorkspaceIds(['p006-edit-task']),
    );
    const original = await createLifecycleTask(
      seed,
      taskInput('立即处理旧标题', true, true),
      'p006:edit:seed',
    );
    const uiBackend = backend.byteRestart();
    const ui = createWorkspaceHarness(
      uiBackend,
      new WorkspaceClock(),
      new WorkspaceIds(['p006-edit-ui-id-must-not-be-used']),
    );
    const screen = await renderApp(ui);
    const revisedTitle = '稍后跟进新标题';
    try {
      await openTask(screen, 'Q1', original.title);
      await fireEvent.press(
        screen.getByRole('button', {name: '编辑任务'}),
      );
      fireEvent.changeText(
        screen.getByLabelText('编辑任务名称'),
        revisedTitle,
      );
      const important = screen.getByRole('checkbox', {name: '编辑重要'});
      expect(important.props.accessibilityState).toMatchObject({checked: true});
      await fireEvent.press(important);
      uiBackend.clearTrace();
      uiBackend.failNextSet(new Error('GAP_P0_06_EDIT_WRITE_FAILED'));

      await fireEvent.press(
        screen.getByRole('button', {name: '保存修改'}),
      );
      await waitFor(() => expect(uiBackend.failedSets).toHaveLength(1));
      expect(screen.getByText('任务详情：立即处理旧标题')).toBeTruthy();
      expect(
        screen.getByRole('button', {name: QUADRANT_CARD.Q1(original.title)}),
      ).toBeTruthy();
      expect(
        screen.queryByRole('button', {name: QUADRANT_CARD.Q3(revisedTitle)}),
      ).toBeNull();
      expect(screen.getByLabelText('编辑任务名称').props.value).toBe(
        revisedTitle,
      );
      expect(screen.getByText('TASK_STORAGE_WRITE_FAILED')).toBeTruthy();
      expect(uiBackend.committedSets).toHaveLength(0);

      await fireEvent.press(
        screen.getByRole('button', {name: '重试保存修改'}),
      );
      await waitFor(() =>
        expect(
          screen.getByRole('button', {name: QUADRANT_CARD.Q3(revisedTitle)}),
        ).toBeTruthy(),
      );
      expect(uiBackend.setAttempts).toHaveLength(2);
      expect(uiBackend.failedSets).toHaveLength(1);
      expect(uiBackend.committedSets).toHaveLength(1);
      expect(
        screen.queryByRole('button', {name: QUADRANT_CARD.Q1(original.title)}),
      ).toBeNull();
    } finally {
      await screen.unmount();
    }

    const restarted = createWorkspaceHarness(
      uiBackend.byteRestart(),
      new WorkspaceClock(),
      new WorkspaceIds(['p006-edit-restart-id-must-not-be-used']),
    );
    const restartedScreen = await renderApp(restarted);
    try {
      await waitFor(() =>
        expect(
          restartedScreen.getByRole('button', {
            name: QUADRANT_CARD.Q3(revisedTitle),
          }),
        ).toBeTruthy(),
      );
      expect(restartedScreen.queryByText(original.title)).toBeNull();
    } finally {
      await restartedScreen.unmount();
    }
  });

  it('requires delete confirmation, keeps cancel read-only, and soft-deletes from workspace and recommendation across restart', async () => {
    const backend = new WorkspaceBackend();
    const seed = createWorkspaceHarness(
      backend,
      new WorkspaceClock(),
      new WorkspaceIds(['p006-delete-target', 'p006-delete-fallback']),
    );
    const target = await createLifecycleTask(
      seed,
      taskInput('必须先处理的故障', true, true),
      'p006:delete:target',
    );
    const fallback = await createLifecycleTask(
      seed,
      taskInput('稍后整理资料', false, false),
      'p006:delete:fallback',
    );
    const uiBackend = backend.byteRestart();
    const ui = createWorkspaceHarness(
      uiBackend,
      new WorkspaceClock(),
      new WorkspaceIds(['p006-delete-id-must-not-be-used']),
    );
    const screen = await renderApp(ui);
    try {
      await waitFor(() =>
        expect(screen.getByText(`今日推荐：${target.title}`)).toBeTruthy(),
      );
      await openTask(screen, 'Q1', target.title);
      uiBackend.clearTrace();
      await fireEvent.press(
        screen.getByRole('button', {name: '删除任务'}),
      );
      expect(screen.getByText(`确认删除“${target.title}”？`)).toBeTruthy();
      await fireEvent.press(
        screen.getByRole('button', {name: '取消删除'}),
      );
      expect(uiBackend.setAttempts).toHaveLength(0);
      expect(
        screen.getByRole('button', {name: QUADRANT_CARD.Q1(target.title)}),
      ).toBeTruthy();
      expect(screen.getByText(`今日推荐：${target.title}`)).toBeTruthy();

      await fireEvent.press(
        screen.getByRole('button', {name: '删除任务'}),
      );
      await fireEvent.press(
        screen.getByRole('button', {name: '确认删除'}),
      );
      await waitFor(() =>
        expect(screen.getByText(`今日推荐：${fallback.title}`)).toBeTruthy(),
      );
      expect(
        screen.queryByRole('button', {name: QUADRANT_CARD.Q1(target.title)}),
      ).toBeNull();
      expect(screen.queryByText(`今日推荐：${target.title}`)).toBeNull();
      expect(uiBackend.committedSets).toHaveLength(1);
    } finally {
      await screen.unmount();
    }

    const restarted = createWorkspaceHarness(
      uiBackend.byteRestart(),
      new WorkspaceClock(),
      new WorkspaceIds(['p006-delete-restart-id-must-not-be-used']),
    );
    const restartedScreen = await renderApp(restarted);
    try {
      await waitFor(() =>
        expect(
          restartedScreen.getByText(`今日推荐：${fallback.title}`),
        ).toBeTruthy(),
      );
      expect(restartedScreen.queryByText(target.title)).toBeNull();
      expect(
        restartedScreen.queryByRole('button', {
          name: QUADRANT_CARD.Q1(target.title),
        }),
      ).toBeNull();
    } finally {
      await restartedScreen.unmount();
    }
  });

  it('uses the existing recommendation winner and enters then byte-restores its existing five-minute focus', async () => {
    const backend = new WorkspaceBackend();
    const seed = createWorkspaceHarness(
      backend,
      new WorkspaceClock(P0_06_AT),
      new WorkspaceIds([
        'p006-recommend-winner',
        'p006-recommend-winner-step',
        'p006-recommend-other',
        'p006-recommend-other-step',
      ]),
    );
    const winner = await createLifecycleTask(
      seed,
      taskInput('处理生产事故', true, true),
      'p006:recommend:winner',
    );
    const other = await createLifecycleTask(
      seed,
      taskInput('整理学习笔记', true, false),
      'p006:recommend:other',
    );
    // See the fixture-order control above: all lifecycle mutations precede
    // legacy substep mutations on the shared durable repository.
    await addTaskStep(
      seed,
      winner.id,
      '打开事故面板',
      'p006:recommend:winner-step',
    );
    await addTaskStep(
      seed,
      other.id,
      '打开笔记',
      'p006:recommend:other-step',
    );

    const uiBackend = backend.byteRestart();
    const uiClock = new WorkspaceClock(P0_06_AT);
    const uiIds = new WorkspaceIds(['p006-workspace-focus-session']);
    const ui = createWorkspaceHarness(uiBackend, uiClock, uiIds);
    const screen = await renderApp(ui);
    try {
      await waitFor(() =>
        expect(screen.getByText(`今日推荐：${winner.title}`)).toBeTruthy(),
      );
      expect(screen.queryByText(`今日推荐：${other.title}`)).toBeNull();
      await fireEvent.press(
        screen.getByRole('button', {
          name: `打开今日推荐：${winner.title}`,
        }),
      );
      await waitFor(() =>
        expect(screen.getByText(`任务详情：${winner.title}`)).toBeTruthy(),
      );
      await fireEvent.press(
        screen.getByRole('button', {name: '开始5分钟'}),
      );
      await flushUi();
      await waitFor(() =>
        expect(screen.getByText('计时状态：进行中')).toBeTruthy(),
      );
      expect(screen.getByText(`专注任务：${winner.title}`)).toBeTruthy();
      expect(screen.queryByText(`专注任务：${other.title}`)).toBeNull();
      expect(uiIds.calls).toBe(1);
    } finally {
      await screen.unmount();
    }

    const restartIds = new WorkspaceIds([
      'p006-focus-restart-id-must-not-be-used',
    ]);
    const restarted = createWorkspaceHarness(
      uiBackend.byteRestart(),
      new WorkspaceClock('2026-08-09T08:02:00.000Z'),
      restartIds,
    );
    const restartedScreen = await renderApp(restarted);
    try {
      await waitFor(() =>
        expect(restartedScreen.getByText('计时状态：进行中')).toBeTruthy(),
      );
      expect(
        restartedScreen.getByText(`专注任务：${winner.title}`),
      ).toBeTruthy();
      expect(restartIds.calls).toBe(0);
    } finally {
      await restartedScreen.unmount();
    }
  });
});
