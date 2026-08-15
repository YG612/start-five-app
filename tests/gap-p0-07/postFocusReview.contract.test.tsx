import {
  act,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import {
  createP007Harness,
  flushUiWork,
  P0_07_EARLY_END_AT,
  P0_07_NATURAL_END_AT,
  P0_07_STARTED_AT,
  PublicMemoryBackend,
  publishRuntimeAt,
  renderHarness,
  seedTaskWithStep,
  startFocusFromWorkspace,
  type AppScreen,
  type P007Harness,
} from './gapP007AppRootTestKit';

const REVIEW_TITLE = '专注复盘';
const RECEIPT_TITLE = '这几分钟推进得怎么样？';
const CONFIRM_SETTLEMENT = '确认结算';
const RETURN_WORKSPACE = '回到象限';
const RETRY_WORKSPACE = '重试刷新象限';

async function waitForReview(
  screen: AppScreen,
  expectation: Readonly<{
    title: string;
    seconds: number;
    status: '自然完成' | '提前结束';
  }>,
): Promise<void> {
  await waitFor(() => expect(screen.getByText(REVIEW_TITLE)).toBeTruthy());
  expect(screen.getByText(`复盘任务：${expectation.title}`)).toBeTruthy();
  expect(
    screen.getByText(`实际专注：${expectation.seconds}秒`),
  ).toBeTruthy();
  expect(
    screen.getByText(`结束状态：${expectation.status}`),
  ).toBeTruthy();
}

async function chooseOutcomeAndSettle(
  screen: AppScreen,
  outcome: '有进展' | '完成任务',
  note?: string,
): Promise<void> {
  await fireEvent.press(screen.getByRole('radio', {name: outcome}));
  if (note !== undefined) {
    await fireEvent.changeText(screen.getByLabelText('复盘备注'), note);
  }
  await fireEvent.press(
    screen.getByRole('button', {name: CONFIRM_SETTLEMENT}),
  );
  await waitFor(() => expect(screen.getByText(RECEIPT_TITLE)).toBeTruthy());
}

async function startCompletableFocus(
  harness: P007Harness,
  screen: AppScreen,
  options: Readonly<{
    title: string;
    stepTitle: string;
    quadrant: 'Q2';
  }>,
): Promise<void> {
  await startFocusFromWorkspace(screen, options.quadrant, options.title);
  const state = await harness.composition.service.getState();
  const task = state.tasks.find(candidate => candidate.title === options.title);
  const step = task?.subtasks[0];
  if (task === undefined || step === undefined) {
    throw new Error('TEST_TASK_STEP_REQUIRED');
  }
  await harness.composition.service.finishStep(task.id, step.id, {
    operationId: `p007:new-home:finish-step:${task.id}`,
  });
}

describe('GAP-P0-07 post-focus review and trustworthy receipt', () => {
  it('restores a natural-finish pending review before settlement and persists a zero-point progress receipt without completing the task', async () => {
    const title = '整理五分钟产品复盘';
    const backend = new PublicMemoryBackend();
    const first = createP007Harness({
      backend,
      at: P0_07_STARTED_AT,
      idPrefix: 'p007-natural',
    });
    const task = await seedTaskWithStep(first, {
      title,
      stepTitle: '写下本轮观察',
      important: true,
      urgent: true,
      operationPrefix: 'p007:natural',
    });
    const firstScreen = await renderHarness(first);

    try {
      await startFocusFromWorkspace(firstScreen, 'Q1', title);
      await publishRuntimeAt(first, P0_07_NATURAL_END_AT);
      await waitForReview(firstScreen, {
        title,
        seconds: 300,
        status: '自然完成',
      });
    } finally {
      await firstScreen.unmount();
    }

    const pendingBackend = backend.byteRestart();
    const pending = createP007Harness({
      backend: pendingBackend,
      at: P0_07_NATURAL_END_AT,
      idPrefix: 'p007-natural-pending-restart',
    });
    const pendingScreen = await renderHarness(pending);
    try {
      await waitForReview(pendingScreen, {
        title,
        seconds: 300,
        status: '自然完成',
      });
      await chooseOutcomeAndSettle(
        pendingScreen,
        '有进展',
        '已经找到下一步，任务继续保留。',
      );
    expect(pendingScreen.getByText(`本次任务：${title}`)).toBeTruthy();
      expect(pendingScreen.getByText('本次积分：0')).toBeTruthy();
      expect(
        pendingScreen.getByText('积分原因：记录专注进展（任务未完成）'),
      ).toBeTruthy();
      expect(pendingScreen.getByText('今日专注：1次 / 5分钟')).toBeTruthy();
      const state = await pending.composition.service.getState();
      expect(state.tasks.find(candidate => candidate.id === task.id)?.status).toBe(
        'in_progress',
      );
      expect(state.totalScore).toBe(0);
    } finally {
      await pendingScreen.unmount();
    }

    const receiptBytes = pendingBackend.stableByteSnapshot();
    const receiptBackend = pendingBackend.byteRestart();
    const receiptRestart = createP007Harness({
      backend: receiptBackend,
      at: P0_07_NATURAL_END_AT,
      idPrefix: 'p007-natural-receipt-restart',
    });
    const receiptScreen = await renderHarness(receiptRestart);
    try {
      await waitFor(() =>
        expect(receiptScreen.getByText(RECEIPT_TITLE)).toBeTruthy(),
      );
      expect(receiptScreen.getByText(`本次任务：${title}`)).toBeTruthy();
      expect(receiptScreen.getByText('本次积分：0')).toBeTruthy();
      expect(receiptScreen.getByText('今日专注：1次 / 5分钟')).toBeTruthy();
      expect(receiptBackend.stableByteSnapshot()).toBe(receiptBytes);
    } finally {
      await receiptScreen.unmount();
    }
  });

  it('settles an explicitly completed Q2 task once under a double submit and restores the same 45-point receipt after byte restart', async () => {
    const title = '推进长期能力建设';
    const backend = new PublicMemoryBackend();
    const harness = createP007Harness({
      backend,
      at: P0_07_STARTED_AT,
      idPrefix: 'p007-complete',
    });
    const task = await seedTaskWithStep(harness, {
      title,
      stepTitle: '完成本轮可交付小步',
      important: true,
      urgent: false,
      operationPrefix: 'p007:complete',
    });
    const screen = await renderHarness(harness);

    try {
      await startCompletableFocus(harness, screen, {
        title,
        stepTitle: '完成本轮可交付小步',
        quadrant: 'Q2',
      });
      await publishRuntimeAt(harness, P0_07_EARLY_END_AT);
      await fireEvent.press(
        screen.getByRole('button', {name: '结束本次专注'}),
      );
      await waitForReview(screen, {
        title,
        seconds: 120,
        status: '提前结束',
      });
      expect(
        (await harness.composition.service.getState()).tasks.find(
          candidate => candidate.id === task.id,
        )?.status,
      ).toBe('in_progress');

      await fireEvent.press(screen.getByRole('radio', {name: '完成任务'}));
      const confirm = screen.getByRole('button', {
        name: CONFIRM_SETTLEMENT,
      });
      await act(async () => {
        fireEvent.press(confirm);
        fireEvent.press(confirm);
        await flushUiWork(200);
      });
      await waitFor(() => expect(screen.getByText(RECEIPT_TITLE)).toBeTruthy());
      expect(screen.getByText(`本次任务：${title}`)).toBeTruthy();
      expect(screen.getByText('本次积分：45')).toBeTruthy();
      expect(screen.getByText('积分原因：完成成长区任务')).toBeTruthy();
      const state = await harness.composition.service.getState();
      expect(state.tasks.find(candidate => candidate.id === task.id)?.status).toBe(
        'completed',
      );
      expect(state.totalScore).toBe(45);
    } finally {
      await screen.unmount();
    }

    const settledBytes = backend.stableByteSnapshot();
    const restartedBackend = backend.byteRestart();
    const restarted = createP007Harness({
      backend: restartedBackend,
      at: P0_07_EARLY_END_AT,
      idPrefix: 'p007-complete-restart',
    });
    const restartedScreen = await renderHarness(restarted);
    try {
      await waitFor(() =>
        expect(restartedScreen.getByText(RECEIPT_TITLE)).toBeTruthy(),
      );
      expect(restartedScreen.getByText(`本次任务：${title}`)).toBeTruthy();
      expect(restartedScreen.getByText('本次积分：45')).toBeTruthy();
      const state = await restarted.composition.service.getState();
      expect(state.tasks.find(candidate => candidate.id === task.id)?.status).toBe(
        'completed',
      );
      expect(state.totalScore).toBe(45);
      expect(restartedBackend.stableByteSnapshot()).toBe(settledBytes);
    } finally {
      await restartedScreen.unmount();
    }
  });

  it('retries only the workspace projection after a return read failure and never replays the settled completion', async () => {
    const primaryTitle = '完成后移出成长区的主任务';
    const fallbackTitle = '回到工作台后的下一推荐';
    const backend = new PublicMemoryBackend();
    const harness = createP007Harness({
      backend,
      at: P0_07_STARTED_AT,
      idPrefix: 'p007-refresh',
    });
    const primary = await seedTaskWithStep(harness, {
      title: primaryTitle,
      stepTitle: '交付主任务的最后小步',
      important: true,
      urgent: false,
      operationPrefix: 'p007:refresh:primary',
    });
    const fallback = await seedTaskWithStep(harness, {
      title: fallbackTitle,
      stepTitle: '准备下一轮行动',
      important: false,
      urgent: false,
      operationPrefix: 'p007:refresh:fallback',
    });
    const screen = await renderHarness(harness);

    try {
      await startCompletableFocus(harness, screen, {
        title: primaryTitle,
        stepTitle: '交付主任务的最后小步',
        quadrant: 'Q2',
      });
      await publishRuntimeAt(harness, P0_07_EARLY_END_AT);
      await fireEvent.press(
        screen.getByRole('button', {name: '结束本次专注'}),
      );
      await waitForReview(screen, {
        title: primaryTitle,
        seconds: 120,
        status: '提前结束',
      });
      await chooseOutcomeAndSettle(screen, '完成任务');
      expect(screen.getByText('本次积分：45')).toBeTruthy();
      const settledBytes = backend.stableByteSnapshot();

      backend.failNextRead(new Error('GAP_P0_07_WORKSPACE_READ_FAILED'));
      await fireEvent.press(
        screen.getByRole('button', {name: RETURN_WORKSPACE}),
      );
      await waitFor(() =>
        expect(screen.getByText('象限暂时没有刷新；可以重试，专注记录仍在本机。')).toBeTruthy(),
      );
      expect(screen.getByRole('button', {name: RETRY_WORKSPACE})).toBeTruthy();
      expect(backend.stableByteSnapshot()).toBe(settledBytes);

      await fireEvent.press(
        screen.getByRole('button', {name: RETRY_WORKSPACE}),
      );
      await waitFor(() =>
        expect(screen.getByRole('button', {name: `清理区任务：${fallbackTitle}`})).toBeTruthy(),
      );
      expect(
        screen.queryByRole('button', {
          name: `成长区任务：${primaryTitle}`,
        }),
      ).toBeNull();
      expect(
        screen.getByRole('button', {
          name: `清理区任务：${fallbackTitle}`,
        }),
      ).toBeTruthy();
      const returnedBytes = backend.stableByteSnapshot();
      expect(returnedBytes).not.toBe(settledBytes);

      const state = await harness.composition.service.getState();
      expect(state.tasks.find(task => task.id === primary.id)?.status).toBe(
        'completed',
      );
      expect(state.tasks.find(task => task.id === fallback.id)?.status).toBe(
        'pending',
      );
      expect(state.totalScore).toBe(45);
      expect(backend.stableByteSnapshot()).toBe(returnedBytes);
    } finally {
      await screen.unmount();
    }
  });
});
