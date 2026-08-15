import React from 'react';
import {act, fireEvent, waitFor} from '@testing-library/react-native';
import {
  createStartFiveApp,
  type StartFiveAppComposition,
  type StartFiveAppDependencies,
} from '../../src/app/startFiveApp';
import type {
  ReminderPermission,
  ReminderReplaceRequest,
  ReminderScheduleSnapshot,
} from '../../src/application/reminderScheduling';
import type {
  TomorrowFirstNotifications,
  TomorrowFirstTap,
} from '../../src/application/tomorrowFirstNotifications';
import {
  flushUiWork,
  ManualFocusRuntimeClock,
  MutableIsoClock,
  PublicMemoryBackend,
  renderHarness as renderP007Harness,
  SequenceIds,
  type AppScreen,
} from '../gap-p0-07/gapP007AppRootTestKit';
import {
  DAY_ONE_REVIEW_END,
  DAY_ONE_START,
} from '../gap-p0-09/dayClosureTestKit';

export const FIRST_ACTIVATION_TITLE = '开始我的第一项';
export const FIRST_TASK_INPUT = '第一项任务标题';
export const START_FIRST_FOCUS = '开始5分钟';
export const SKIP_FIRST_ACTIVATION = '暂时跳过';
export const FIRST_ACTIVATION_READ_ERROR = '启动状态读取失败';

type PublicFirstActivationOptions = Readonly<{
  enabled: true;
}>;

type ExtendedStartFiveDependencies = StartFiveAppDependencies &
  Readonly<{
    public?: Readonly<{
      firstActivation?: PublicFirstActivationOptions;
    }>;
  }>;

const createExtendedStartFiveApp = createStartFiveApp as unknown as (
  dependencies: ExtendedStartFiveDependencies,
) => StartFiveAppComposition;

export class FirstActivationNotificationFake
  implements TomorrowFirstNotifications
{
  readonly permissionRequests: ReminderPermission[] = [];

  async getPermission(): Promise<ReminderPermission> {
    return 'not_determined';
  }

  async requestPermission(): Promise<ReminderPermission> {
    this.permissionRequests.push('not_determined');
    return 'denied';
  }

  async getInitialTap(): Promise<TomorrowFirstTap | null> {
    return null;
  }

  subscribeTap(_listener: (tap: TomorrowFirstTap) => void): () => void {
    return () => undefined;
  }

  async get(_taskId: string): Promise<ReminderScheduleSnapshot | null> {
    return null;
  }

  async replace(_request: ReminderReplaceRequest): Promise<void> {
    throw new Error('FIRST_ACTIVATION_MUST_NOT_SCHEDULE_NOTIFICATION');
  }
}

export type P011Harness = Readonly<{
  backend: PublicMemoryBackend;
  clock: MutableIsoClock;
  runtimeClock: ManualFocusRuntimeClock;
  notifications: FirstActivationNotificationFake;
  composition: StartFiveAppComposition;
}>;

export function createP011Harness(options: Readonly<{
  backend?: PublicMemoryBackend;
  at?: string;
  idPrefix: string;
  notifications?: FirstActivationNotificationFake;
}>): P011Harness {
  const backend = options.backend ?? new PublicMemoryBackend();
  const at = options.at ?? DAY_ONE_START;
  const clock = new MutableIsoClock(at);
  const runtimeClock = new ManualFocusRuntimeClock(at);
  const ids = new SequenceIds(options.idPrefix);
  const notifications =
    options.notifications ?? new FirstActivationNotificationFake();
  const composition = createExtendedStartFiveApp({
    storageBackend: backend,
    now: clock.now,
    idGenerator: ids.next,
    focusRuntimeClock: runtimeClock,
    tomorrowFirstNotifications: notifications,
    public: {firstActivation: {enabled: true}},
  });
  return {backend, clock, runtimeClock, notifications, composition};
}

export async function renderHarness(
  harness: P011Harness,
): Promise<AppScreen> {
  return renderP007Harness(harness);
}

export async function submitFirstTask(
  screen: AppScreen,
  title: string,
): Promise<void> {
  await fireEvent.changeText(screen.getByLabelText(FIRST_TASK_INPUT), title);
  await fireEvent.press(
    screen.getByRole('button', {name: START_FIRST_FOCUS}),
  );
  await waitFor(() =>
    expect(screen.getByText(`专注任务：${title}`)).toBeTruthy(),
  );
}

export async function seedAcknowledgedLifecycle(
  backend: PublicMemoryBackend,
  title: string,
): Promise<void> {
  const seed = createExtendedStartFiveApp({
    storageBackend: backend,
    now: () => DAY_ONE_START,
    idGenerator: new SequenceIds('p011-upgrade-seed').next,
    focusRuntimeClock: new ManualFocusRuntimeClock(DAY_ONE_START),
  });
  const task = await seed.service.createTask(
    {title, important: true, urgent: true},
    {operationId: 'p011:upgrade:create'},
  );
  await seed.service.addFirstStep(
    task.id,
    {title: '保留既有第一步'},
    {operationId: 'p011:upgrade:step'},
  );

  const lifecycle = {
    backend,
    clock: new MutableIsoClock(DAY_ONE_START),
    runtimeClock: new ManualFocusRuntimeClock(DAY_ONE_START),
    composition: seed,
  };
  const screen = await renderP007Harness(lifecycle);
  try {
    await fireEvent.press(
      screen.getByRole('button', {name: `救火区任务：${title}`}),
    );
    await waitFor(() => expect(screen.getByText(`任务详情：${title}`)).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', {name: '推荐下一项'}));
    await fireEvent.press(screen.getByRole('button', {name: '开始5分钟'}));
    lifecycle.clock.set(DAY_ONE_REVIEW_END);
    await act(async () => {
      lifecycle.runtimeClock.publishAt(DAY_ONE_REVIEW_END);
      await flushUiWork(160);
    });
    await fireEvent.press(screen.getByRole('button', {name: '中断专注'}));
    await waitFor(() => expect(screen.getByText('专注复盘')).toBeTruthy());
    await fireEvent.press(screen.getByRole('radio', {name: '有进展'}));
    await fireEvent.press(screen.getByRole('button', {name: '确认结算'}));
    await waitFor(() => expect(screen.getByText('专注回执')).toBeTruthy());
    await fireEvent.press(
      screen.getByRole('button', {name: '返回任务工作台'}),
    );
    await waitFor(() => expect(screen.queryByText('专注回执')).toBeNull());
  } finally {
    await screen.unmount();
  }
}

export {DAY_ONE_START, PublicMemoryBackend};
export type {AppScreen};
