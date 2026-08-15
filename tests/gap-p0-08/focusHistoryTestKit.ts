import {fireEvent, waitFor} from '@testing-library/react-native';
import type {StartFiveAppComposition} from '../../src/app/startFiveApp';
import {
  createP007Harness,
  flushUiWork,
  PublicMemoryBackend,
  publishRuntimeAt,
  renderHarness,
  seedTaskWithStep,
  startFocusFromWorkspace,
  type AppScreen,
  type P007Harness,
} from '../gap-p0-07/gapP007AppRootTestKit';

export {
  createP007Harness,
  flushUiWork,
  PublicMemoryBackend,
  publishRuntimeAt,
  renderHarness,
  seedTaskWithStep,
  startFocusFromWorkspace,
};
export type {AppScreen, P007Harness};

export type ReceiptHistorySnapshot = Readonly<{
  receipts: readonly Readonly<{
    receiptId: string;
    taskTitle: string;
  }>[];
}>;

export async function queryReceiptHistory(
  harness: P007Harness,
): Promise<ReceiptHistorySnapshot> {
  const capability = (
    harness.composition as StartFiveAppComposition & {
      reviewHistory?: {
        listReceiptHistory(): Promise<ReceiptHistorySnapshot>;
      };
    }
  ).reviewHistory;
  if (capability === undefined) {
    throw new Error('HISTORY_QUERY_UNAVAILABLE');
  }
  return capability.listReceiptHistory();
}

export const HISTORY_TITLE = '专注历史';
export const OPEN_HISTORY = '今日记录';
export const BACK_TO_WORKSPACE = '返回任务工作台';

export async function openHistory(screen: AppScreen): Promise<void> {
  await fireEvent.press(screen.getByRole('button', {name: OPEN_HISTORY}));
  await waitFor(() => expect(screen.getByText(HISTORY_TITLE)).toBeTruthy());
}

export async function settleProgressAndAcknowledge(
  harness: P007Harness,
  screen: AppScreen,
  input: Readonly<{
    title: string;
    quadrant: 'Q1' | 'Q2' | 'Q3' | 'Q4';
    endedAt: string;
    note: string;
  }>,
): Promise<void> {
  await startFocusFromWorkspace(screen, input.quadrant, input.title);
  await publishRuntimeAt(harness, input.endedAt);
  if (screen.queryByText('专注复盘') === null) {
    await fireEvent.press(screen.getByRole('button', {name: '中断专注'}));
  }
  await waitFor(() => expect(screen.getByText('专注复盘')).toBeTruthy());
  await fireEvent.press(screen.getByRole('radio', {name: '有进展'}));
  await fireEvent.changeText(screen.getByLabelText('复盘备注'), input.note);
  await fireEvent.press(screen.getByRole('button', {name: '确认结算'}));
  await waitFor(() => expect(screen.getByText('专注回执')).toBeTruthy());
  await fireEvent.press(
    screen.getByRole('button', {name: BACK_TO_WORKSPACE}),
  );
  await waitFor(() => expect(screen.queryByText('专注回执')).toBeNull());
}

export function historyRowName(title: string): string {
  return `专注记录：${title}`;
}
