import React, {useState} from 'react';
import {
  act,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react-native';
import {Text} from 'react-native';
import type {ReceiptHistorySnapshot} from '../../src/application/postFocusReviewService';
import type {FocusReviewReceipt} from '../../src/domain/postFocusReview';
import {FocusHistoryScreen} from '../../src/screens/FocusHistoryScreen';

const DAY = '2026-08-10';

function deferred<T>(): Readonly<{
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return {promise, resolve, reject};
}

function receipt(
  receiptId: string,
  taskTitle: string,
): FocusReviewReceipt {
  return {
    kind: 'receipt',
    receiptId,
    reviewId: `review:${receiptId}`,
    sessionId: `session:${receiptId}`,
    taskId: `task:${receiptId}`,
    taskTitle,
    quadrant: 'Q2',
    startedAt: `${DAY}T08:00:00.000Z`,
    endedAt: `${DAY}T08:05:00.000Z`,
    actualSeconds: 300,
    endKind: 'natural',
    outcome: 'progress',
    note: '公开历史快照',
    awardedPoints: 0,
    reason: '记录专注进展（任务未完成）',
    settledAt: `${DAY}T08:05:01.000Z`,
    statsDay: DAY,
    todayFocusCount: 1,
    todayFocusMinutes: 5,
    acknowledgedAt: `${DAY}T08:05:02.000Z`,
  };
}

describe('GAP-P0-08R2 history reload ordering', () => {
  it('keeps the newest public history result and ignores completions after returning to the workspace', async () => {
    const initial = deferred<ReceiptHistorySnapshot>();
    const afterBack = deferred<ReceiptHistorySnapshot>();
    const newest = receipt('receipt:newest', '最新已确认记录');
    const stale = receipt('receipt:stale', '离页后的旧记录');
    const listReceiptHistory = jest
      .fn<Promise<ReceiptHistorySnapshot>, []>()
      .mockImplementationOnce(() => initial.promise)
      .mockResolvedValueOnce({receipts: [newest]})
      .mockImplementationOnce(() => afterBack.promise);
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    function PublicHistoryJourney(): React.JSX.Element {
      const [visible, setVisible] = useState(true);
      return visible ? (
        <FocusHistoryScreen
          day={DAY}
          history={{listReceiptHistory}}
          onBack={() => setVisible(false)}
        />
      ) : (
        <Text>任务工作台</Text>
      );
    }

    const screen = await render(<PublicHistoryJourney />);
    try {
      await waitFor(() => expect(listReceiptHistory).toHaveBeenCalledTimes(1));

      await fireEvent.press(
        screen.getByRole('button', {name: '重新读取'}),
      );
      await waitFor(() =>
        expect(
          screen.getByRole('button', {name: '专注记录：最新已确认记录'}),
        ).toBeTruthy(),
      );

      await act(async () => {
        initial.reject(new Error('OLD_HISTORY_QUERY_FAILED'));
        await initial.promise.catch(() => undefined);
      });
      expect(screen.queryByText('OLD_HISTORY_QUERY_FAILED')).toBeNull();
      expect(
        screen.getByRole('button', {name: '专注记录：最新已确认记录'}),
      ).toBeTruthy();

      const backButton = screen.getByRole('button', {
        name: '返回任务工作台',
      });
      await fireEvent.press(
        screen.getByRole('button', {name: '重新读取'}),
      );
      await waitFor(() => expect(listReceiptHistory).toHaveBeenCalledTimes(3));
      await fireEvent.press(backButton);
      await waitFor(() => expect(screen.getByText('任务工作台')).toBeTruthy());

      await act(async () => {
        afterBack.resolve({receipts: [stale]});
        await afterBack.promise;
      });
      expect(screen.getByText('任务工作台')).toBeTruthy();
      expect(screen.queryByText('离页后的旧记录')).toBeNull();
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
      screen.unmount();
    }
  });
});
