import {
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import {
  createP007Harness,
  P0_07_EARLY_END_AT,
  P0_07_STARTED_AT,
  PublicMemoryBackend,
  publishRuntimeAt,
  renderHarness,
  seedTaskWithStep,
  startFocusFromWorkspace,
} from '../gap-p0-07/gapP007AppRootTestKit';

describe('GAP-P0-07R2 refresh and durable receipt acknowledgement consistency', () => {
  it('keeps the settled receipt through a failed workspace read, then durably acknowledges it once before byte restart', async () => {
    const primaryTitle = '完成后移出成长区的主任务';
    const fallbackTitle = '回到工作台后的下一推荐';
    const backend = new PublicMemoryBackend();
    const harness = createP007Harness({
      backend,
      at: P0_07_STARTED_AT,
      idPrefix: 'p007r2-refresh-ack',
    });
    const primary = await seedTaskWithStep(harness, {
      title: primaryTitle,
      stepTitle: '交付主任务的最后小步',
      important: true,
      urgent: false,
      operationPrefix: 'p007r2:primary',
    });
    const fallback = await seedTaskWithStep(harness, {
      title: fallbackTitle,
      stepTitle: '准备下一轮行动',
      important: false,
      urgent: false,
      operationPrefix: 'p007r2:fallback',
    });
    const screen = await renderHarness(harness);
    let settledBytes = '';

    try {
      await startFocusFromWorkspace(screen, 'Q2', primaryTitle);
      await fireEvent.press(screen.getByRole('button', {name: '完成小步'}));
      await waitFor(() =>
        expect(screen.getByText('小步状态：已完成')).toBeTruthy(),
      );
      await publishRuntimeAt(harness, P0_07_EARLY_END_AT);
      await fireEvent.press(
        screen.getByRole('button', {name: '中断专注'}),
      );
      await waitFor(() =>
        expect(screen.getByText('专注复盘')).toBeTruthy(),
      );
      expect(screen.getByText(`复盘任务：${primaryTitle}`)).toBeTruthy();
      expect(screen.getByText('实际专注：120秒')).toBeTruthy();
      expect(screen.getByText('结束状态：提前结束')).toBeTruthy();

      await fireEvent.press(
        screen.getByRole('radio', {name: '完成任务'}),
      );
      await fireEvent.press(
        screen.getByRole('button', {name: '确认结算'}),
      );
      await waitFor(() =>
        expect(screen.getByText('专注回执')).toBeTruthy(),
      );
      expect(screen.getByText(`回执任务：${primaryTitle}`)).toBeTruthy();
      expect(screen.getByText('本次积分：45')).toBeTruthy();
      expect(screen.getByText('今日专注：1次 / 2分钟')).toBeTruthy();
      settledBytes = backend.stableByteSnapshot();

      backend.failNextRead(new Error('GAP_P0_07R2_WORKSPACE_READ_FAILED'));
      await fireEvent.press(
        screen.getByRole('button', {name: '返回任务工作台'}),
      );
      await waitFor(() =>
        expect(screen.getByText('工作台刷新失败')).toBeTruthy(),
      );
      expect(screen.getByText('专注回执')).toBeTruthy();
      expect(screen.getByText(`回执任务：${primaryTitle}`)).toBeTruthy();
      expect(screen.getByText('本次积分：45')).toBeTruthy();
      expect(screen.getByText('今日专注：1次 / 2分钟')).toBeTruthy();
      expect(
        screen.getByRole('button', {name: '重试刷新工作台'}),
      ).toBeTruthy();
      expect(backend.stableByteSnapshot()).toBe(settledBytes);

      const afterFailedRefresh = await harness.composition.service.getState();
      expect(
        afterFailedRefresh.tasks.find(task => task.id === primary.id)?.status,
      ).toBe('completed');
      expect(
        afterFailedRefresh.tasks.find(task => task.id === fallback.id)?.status,
      ).toBe('pending');
      expect(afterFailedRefresh.totalScore).toBe(45);

      await fireEvent.press(
        screen.getByRole('button', {name: '重试刷新工作台'}),
      );
      await waitFor(() =>
        expect(screen.getByText(`今日推荐：${fallbackTitle}`)).toBeTruthy(),
      );
      expect(screen.queryByText('专注复盘')).toBeNull();
      expect(screen.queryByText('专注回执')).toBeNull();
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

      const afterSuccessfulAck = await harness.composition.service.getState();
      expect(
        afterSuccessfulAck.tasks.find(task => task.id === primary.id)?.status,
      ).toBe('completed');
      expect(
        afterSuccessfulAck.tasks.find(task => task.id === fallback.id)?.status,
      ).toBe('pending');
      expect(afterSuccessfulAck.totalScore).toBe(45);
    } finally {
      await screen.unmount();
    }

    const acknowledgedBytes = backend.stableByteSnapshot();
    expect(acknowledgedBytes).not.toBe(settledBytes);
    const restartedBackend = backend.byteRestart();
    const restarted = createP007Harness({
      backend: restartedBackend,
      at: P0_07_EARLY_END_AT,
      idPrefix: 'p007r2-restart',
    });
    const restartedScreen = await renderHarness(restarted);
    try {
      await waitFor(() =>
        expect(
          restartedScreen.getByText(`今日推荐：${fallbackTitle}`),
        ).toBeTruthy(),
      );
      expect(restartedScreen.queryByText('专注复盘')).toBeNull();
      expect(restartedScreen.queryByText('专注回执')).toBeNull();
      expect(
        restartedScreen.queryByRole('button', {
          name: `成长区任务：${primaryTitle}`,
        }),
      ).toBeNull();
      expect(
        restartedScreen.getByRole('button', {
          name: `清理区任务：${fallbackTitle}`,
        }),
      ).toBeTruthy();
      expect(
        restartedScreen.getByText('今日专注：1次 / 2分钟'),
      ).toBeTruthy();

      const restartedState = await restarted.composition.service.getState();
      expect(
        restartedState.tasks.find(task => task.id === primary.id)?.status,
      ).toBe('completed');
      expect(
        restartedState.tasks.find(task => task.id === fallback.id)?.status,
      ).toBe('pending');
      expect(restartedState.totalScore).toBe(45);
      expect(restartedBackend.stableByteSnapshot()).toBe(acknowledgedBytes);
    } finally {
      await restartedScreen.unmount();
    }
  });
});
