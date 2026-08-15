import {fireEvent, waitFor} from '@testing-library/react-native';
import {
  BACK_TO_WORKSPACE,
  createP007Harness,
  historyRowName,
  openHistory,
  PublicMemoryBackend,
  publishRuntimeAt,
  queryReceiptHistory,
  renderHarness,
  seedTaskWithStep,
  settleProgressAndAcknowledge,
  startFocusFromWorkspace,
} from './focusHistoryTestKit';

const DAY = '2026-08-10';
const START = `${DAY}T08:00:00.000Z`;

describe('GAP-P0-08 acknowledged focus history', () => {
  it('opens the empty history from workspace and returns without changing durable bytes', async () => {
    const backend = new PublicMemoryBackend();
    const harness = createP007Harness({backend, at: START, idPrefix: 'p008-empty'});
    const screen = await renderHarness(harness);
    const before = backend.stableByteSnapshot();
    try {
      await openHistory(screen);
      expect(screen.getByText('今天还没有已确认的专注记录')).toBeTruthy();
      expect(screen.getByText(`日期：${DAY}（UTC）`)).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', {name: BACK_TO_WORKSPACE}));
      await waitFor(() => expect(screen.getByRole('button', {name: '今日记录'})).toBeTruthy());
      expect(backend.stableByteSnapshot()).toBe(before);
    } finally {
      await screen.unmount();
    }
  });

  it('lists acknowledged receipt snapshots in deterministic order, keeps date/filter across read-only detail, and survives byte restart with zero writes', async () => {
    const backend = new PublicMemoryBackend();
    const harness = createP007Harness({backend, at: START, idPrefix: 'p008-list'});
    await seedTaskWithStep(harness, {title: '较早的救火记录', stepTitle: '推进一步', important: true, urgent: true, operationPrefix: 'p008:early'});
    await seedTaskWithStep(harness, {title: '较晚的成长记录', stepTitle: '推进一步', important: true, urgent: false, operationPrefix: 'p008:late'});
    const screen = await renderHarness(harness);
    let mounted = true;
    try {
      await settleProgressAndAcknowledge(harness, screen, {title: '较早的救火记录', quadrant: 'Q1', endedAt: `${DAY}T08:02:00.000Z`, note: '先解除风险'});
      harness.clock.set(`${DAY}T09:00:00.000Z`);
      await settleProgressAndAcknowledge(harness, screen, {title: '较晚的成长记录', quadrant: 'Q2', endedAt: `${DAY}T09:03:00.000Z`, note: '形成下一步'});

      await openHistory(screen);
      const rows = screen.getAllByRole('button', {name: /专注记录：/});
      expect(rows.map(row => row.props.accessibilityLabel)).toEqual([
        historyRowName('较晚的成长记录'),
        historyRowName('较早的救火记录'),
      ]);
      expect(screen.getByText('较晚的成长记录 · 成长区 · 180秒 · 有进展 · 0分')).toBeTruthy();
      expect(screen.getByText('较早的救火记录 · 救火区 · 120秒 · 有进展 · 0分')).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', {name: historyRowName('较晚的成长记录')}));
      await waitFor(() => expect(screen.getByText('记录详情')).toBeTruthy());
      expect(screen.getByText('任务：较晚的成长记录')).toBeTruthy();
      expect(screen.getByText('象限：成长区')).toBeTruthy();
      expect(screen.getByText('专注时长：180秒')).toBeTruthy();
      expect(screen.getByText('结果：有进展')).toBeTruthy();
      expect(screen.getByText('备注：形成下一步')).toBeTruthy();
      expect(screen.getByText('积分：0')).toBeTruthy();
      expect(screen.queryByRole('textbox')).toBeNull();
      await fireEvent.press(screen.getByRole('button', {name: '返回历史列表'}));
      expect(screen.getByText(`日期：${DAY}（UTC）`)).toBeTruthy();
      expect(screen.getByText('筛选：全部')).toBeTruthy();

      const bytes = backend.stableByteSnapshot();
      await fireEvent.press(screen.getByRole('button', {name: '重新读取'}));
      await waitFor(() => expect(screen.getAllByRole('button', {name: /专注记录：/})).toHaveLength(2));
      expect(backend.stableByteSnapshot()).toBe(bytes);
      await screen.unmount();
      mounted = false;

      const restartedBackend = backend.byteRestart();
      const restarted = createP007Harness({backend: restartedBackend, at: `${DAY}T12:00:00.000Z`, idPrefix: 'p008-list-restart'});
      const restartedScreen = await renderHarness(restarted);
      try {
        await openHistory(restartedScreen);
        expect(restartedScreen.getAllByRole('button', {name: /专注记录：/}).map(row => row.props.accessibilityLabel)).toEqual([
          historyRowName('较晚的成长记录'), historyRowName('较早的救火记录'),
        ]);
        expect(restartedBackend.stableByteSnapshot()).toBe(bytes);
      } finally {
        await restartedScreen.unmount();
      }
      return;
    } finally {
      if (mounted) await screen.unmount();
    }
  });

  it('excludes running, pending-review, and unacknowledged receipts, then exposes one acknowledged receipt exactly once after restart', async () => {
    const backend = new PublicMemoryBackend();
    const harness = createP007Harness({backend, at: START, idPrefix: 'p008-state'});
    await seedTaskWithStep(harness, {title: '状态边界记录', stepTitle: '推进一步', important: false, urgent: false, operationPrefix: 'p008:state'});
    const screen = await renderHarness(harness);
    try {
      await startFocusFromWorkspace(screen, 'Q4', '状态边界记录');
      expect((await queryReceiptHistory(harness)).receipts).toHaveLength(0);
      await publishRuntimeAt(harness, `${DAY}T08:02:00.000Z`);
      await fireEvent.press(screen.getByRole('button', {name: '中断专注'}));
      await waitFor(() => expect(screen.getByText('专注复盘')).toBeTruthy());
      expect((await queryReceiptHistory(harness)).receipts).toHaveLength(0);
      await fireEvent.press(screen.getByRole('radio', {name: '有进展'}));
      await fireEvent.press(screen.getByRole('button', {name: '确认结算'}));
      await waitFor(() => expect(screen.getByText('专注回执')).toBeTruthy());
      expect((await queryReceiptHistory(harness)).receipts).toHaveLength(0);
      await fireEvent.press(screen.getByRole('button', {name: BACK_TO_WORKSPACE}));
      const acknowledged = await queryReceiptHistory(harness);
      expect(acknowledged.receipts).toHaveLength(1);
      expect(acknowledged.receipts[0]?.taskTitle).toBe('状态边界记录');
      await openHistory(screen);
      expect(screen.getAllByRole('button', {name: historyRowName('状态边界记录')})).toHaveLength(1);
    } finally {
      await screen.unmount();
    }

    const bytes = backend.stableByteSnapshot();
    const restartedBackend = backend.byteRestart();
    const restarted = createP007Harness({backend: restartedBackend, at: `${DAY}T10:00:00.000Z`, idPrefix: 'p008-state-restart'});
    const restartedScreen = await renderHarness(restarted);
    try {
      const restartedHistory = await queryReceiptHistory(restarted);
      expect(restartedHistory.receipts).toHaveLength(1);
      expect(restartedHistory.receipts[0]?.taskTitle).toBe('状态边界记录');
      await openHistory(restartedScreen);
      expect(restartedScreen.getAllByRole('button', {name: historyRowName('状态边界记录')})).toHaveLength(1);
      expect(restartedBackend.stableByteSnapshot()).toBe(bytes);
    } finally {
      await restartedScreen.unmount();
    }
  });
});
