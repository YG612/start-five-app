import {fireEvent, waitFor} from '@testing-library/react-native';
import {
  createP007Harness,
  openHistory,
  PublicMemoryBackend,
  publishRuntimeAt,
  queryReceiptHistory,
  renderHarness,
  seedTaskWithStep,
  startFocusFromWorkspace,
  type AppScreen,
  type P007Harness,
} from '../gap-p0-08/focusHistoryTestKit';

export {
  createP007Harness,
  PublicMemoryBackend,
  queryReceiptHistory,
  renderHarness,
  seedTaskWithStep,
};
export type {AppScreen, P007Harness};

export const DAY_ONE = '2026-08-10';
export const DAY_TWO = '2026-08-11';
export const DAY_ONE_START = `${DAY_ONE}T08:00:00.000Z`;
export const DAY_ONE_REVIEW_END = `${DAY_ONE}T08:02:00.000Z`;
export const DAY_TWO_START = `${DAY_TWO}T07:30:00.000Z`;

export const END_TODAY = '结束今天';
export const DAY_CLOSURE_TITLE = '今日收尾';
export const CONFIRM_TOMORROW_FIRST = '确认明日第一项';
export const START_TOMORROW_FIRST = '开始明日第一项5分钟';
export const START_CURRENT_RECOMMENDATION = '开始当前推荐5分钟';

export function chooseTomorrowLabel(title: string): string {
  return `选择明日第一项：${title}`;
}

export async function finishAndAcknowledgeThroughUi(
  harness: P007Harness,
  screen: AppScreen,
  input: Readonly<{
    title: string;
    quadrant: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  }>,
): Promise<void> {
  await startFocusFromWorkspace(screen, input.quadrant, input.title);
  await fireEvent.press(screen.getByRole('button', {name: '完成小步'}));
  await waitFor(() =>
    expect(screen.getByText('小步状态：已完成')).toBeTruthy(),
  );
  await publishRuntimeAt(harness, DAY_ONE_REVIEW_END);
  await fireEvent.press(screen.getByRole('button', {name: '中断专注'}));
  await waitFor(() => expect(screen.getByText('专注复盘')).toBeTruthy());
  await fireEvent.press(screen.getByRole('radio', {name: '完成任务'}));
  await fireEvent.press(
    screen.getByRole('button', {name: '确认结算'}),
  );
  await waitFor(() => expect(screen.getByText('专注回执')).toBeTruthy());
  await fireEvent.press(
    screen.getByRole('button', {name: '返回任务工作台'}),
  );
  await waitFor(() => expect(screen.queryByText('专注回执')).toBeNull());
}

export async function openDayClosureFromHistory(
  screen: AppScreen,
): Promise<void> {
  await openHistory(screen);
  await fireEvent.press(screen.getByRole('button', {name: END_TODAY}));
  await waitFor(() => expect(screen.getByText(DAY_CLOSURE_TITLE)).toBeTruthy());
}

export async function openDayClosureFromWorkspace(
  screen: AppScreen,
): Promise<void> {
  await fireEvent.press(screen.getByRole('button', {name: END_TODAY}));
  await waitFor(() => expect(screen.getByText(DAY_CLOSURE_TITLE)).toBeTruthy());
}

export async function selectTomorrowFirst(
  screen: AppScreen,
  title: string,
): Promise<void> {
  await fireEvent.press(
    screen.getByRole('button', {name: chooseTomorrowLabel(title)}),
  );
  await fireEvent.press(
    screen.getByRole('button', {name: CONFIRM_TOMORROW_FIRST}),
  );
  await waitFor(() =>
    expect(screen.getByText(`明日第一项已设定：${title}`)).toBeTruthy(),
  );
}

export async function deleteTaskThroughWorkspace(
  screen: AppScreen,
  quadrant: 'Q1' | 'Q2' | 'Q3' | 'Q4',
  title: string,
): Promise<void> {
  const quadrantLabels = {
    Q1: '救火区任务',
    Q2: '成长区任务',
    Q3: '干扰区任务',
    Q4: '清理区任务',
  } as const;
  await fireEvent.press(
    screen.getByRole('button', {
      name: `${quadrantLabels[quadrant]}：${title}`,
    }),
  );
  await waitFor(() =>
    expect(
      screen.queryByText(`任务详情：${title}`) ??
        screen.queryByRole('header', {name: '快速编辑任务'}),
    ).toBeTruthy(),
  );
  const editMore = screen.queryByRole('button', {name: '编辑更多'});
  if (editMore !== null) {
    await fireEvent.press(editMore);
  }
  await fireEvent.press(screen.getByRole('button', {name: '删除任务'}));
  await fireEvent.press(screen.getByRole('button', {name: '确认删除'}));
  await waitFor(() =>
    expect(
      screen.queryByRole('button', {
        name: `${quadrantLabels[quadrant]}：${title}`,
      }),
    ).toBeNull(),
  );
}
