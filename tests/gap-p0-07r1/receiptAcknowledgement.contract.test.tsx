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

class FailNextSetBackend extends PublicMemoryBackend {
  private setFailureArmed = false;
  private setFailure: unknown = null;

  failNextSet(reason: unknown): void {
    if (this.setFailureArmed) {
      throw new Error('GAP_P0_07R1_SET_FAILURE_ALREADY_ARMED');
    }
    this.setFailureArmed = true;
    this.setFailure = reason;
  }

  override async setItem(key: string, value: string): Promise<void> {
    if (this.setFailureArmed) {
      this.setFailureArmed = false;
      const failure = this.setFailure;
      this.setFailure = null;
      throw failure;
    }
    await super.setItem(key, value);
  }
}

describe('GAP-P0-07R1 durable receipt acknowledgement', () => {
  it('keeps a settled receipt retryable when its durable acknowledgement fails, then dismisses it once across byte restart', async () => {
    const primaryTitle = '确认回执后归档的成长任务';
    const fallbackTitle = '回执确认后的下一项';
    const backend = new FailNextSetBackend();
    const harness = createP007Harness({
      backend,
      at: P0_07_STARTED_AT,
      idPrefix: 'p007r1-ack',
    });
    const primary = await seedTaskWithStep(harness, {
      title: primaryTitle,
      stepTitle: '完成唯一交付小步',
      important: true,
      urgent: false,
      operationPrefix: 'p007r1:ack:primary',
    });
    const fallback = await seedTaskWithStep(harness, {
      title: fallbackTitle,
      stepTitle: '准备下一轮五分钟行动',
      important: false,
      urgent: false,
      operationPrefix: 'p007r1:ack:fallback',
    });
    const screen = await renderHarness(harness);

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

      backend.failNextSet(new Error('GAP_P0_07R1_RECEIPT_ACK_FAILED'));
      await fireEvent.press(
        screen.getByRole('button', {name: '返回任务工作台'}),
      );

      await waitFor(() =>
        expect(screen.getByText('回执确认失败')).toBeTruthy(),
      );
      expect(screen.getByText('专注回执')).toBeTruthy();
      expect(screen.getByText(`回执任务：${primaryTitle}`)).toBeTruthy();
      expect(screen.getByText('本次积分：45')).toBeTruthy();
      expect(screen.getByText('今日专注：1次 / 2分钟')).toBeTruthy();
      expect(
        screen.getByRole('button', {name: '重试确认并返回工作台'}),
      ).toBeTruthy();
      expect(screen.queryByText('工作台刷新失败')).toBeNull();

      const afterFailedAck = await harness.composition.service.getState();
      expect(
        afterFailedAck.tasks.find(task => task.id === primary.id)?.status,
      ).toBe('completed');
      expect(
        afterFailedAck.tasks.find(task => task.id === fallback.id)?.status,
      ).toBe('pending');
      expect(afterFailedAck.totalScore).toBe(45);

      await fireEvent.press(
        screen.getByRole('button', {
          name: '重试确认并返回工作台',
        }),
      );
      await waitFor(() =>
        expect(screen.getByText(`今日推荐：${fallbackTitle}`)).toBeTruthy(),
      );
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
      expect(afterSuccessfulAck.totalScore).toBe(45);
    } finally {
      await screen.unmount();
    }

    const acknowledgedBytes = backend.stableByteSnapshot();
    const restartedBackend = backend.byteRestart();
    const restarted = createP007Harness({
      backend: restartedBackend,
      at: P0_07_EARLY_END_AT,
      idPrefix: 'p007r1-ack-restart',
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
