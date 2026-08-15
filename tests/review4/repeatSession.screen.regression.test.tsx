import React from 'react';
import {act, fireEvent, render} from '@testing-library/react-native';
import type {OperationOptions} from '../../src/application/coreAppService';
import type {Task} from '../../src/domain/task';
import {
  CoreFlowScreen,
  type CoreFlowTimerSnapshot,
  type CoreFlowUiCommitKind,
} from '../../src/screens/CoreFlowScreen';
import {
  createAppStateSourceFixture,
  createDeferred,
} from '../review1/fixtures/reviewFixtures';
import {
  createMultiSessionTimerControllerAdapter,
  createRepeatService,
  createRepeatTimerControllerFixture,
  makeRepeatSessionPair,
} from './fixtures/repeatSessionFixtures';

type RenderedFlow = Awaited<ReturnType<typeof render>>;

const EPOCH = Date.parse('2026-08-04T04:00:00.000Z');
const RECOMMEND_BUTTON = '推荐下一项';
const START_BUTTON = '开始5分钟';
const FINISH_STEP_BUTTON = '完成小步';
const FINISH_TASK_BUTTON = '完成任务';

async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function isDisabled(element: {
  props: {
    accessibilityState?: {disabled?: boolean};
    disabled?: boolean;
  };
}): boolean {
  return (
    element.props.disabled === true ||
    element.props.accessibilityState?.disabled === true
  );
}

function startIsAvailable(screen: RenderedFlow): boolean {
  const button = screen.queryByRole('button', {name: START_BUTTON});
  return button !== null && !isDisabled(button);
}

async function reachStartButton(screen: RenderedFlow): Promise<void> {
  await flushPromises();
  await fireEvent.press(
    screen.getByRole('button', {name: RECOMMEND_BUTTON}),
  );
  await flushPromises();
}

async function pressStart(screen: RenderedFlow): Promise<void> {
  const button = screen.queryByRole('button', {name: START_BUTTON});
  if (button !== null) {
    await fireEvent.press(button);
  }
  await flushPromises();
}

async function advance(milliseconds: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(milliseconds);
    await Promise.resolve();
  });
}

async function finishNaturally(timer: {
  finishNaturally(): void;
}): Promise<void> {
  await act(async () => {
    timer.finishNaturally();
    await Promise.resolve();
  });
}

describe('R4-A repeat focus sessions in one mounted CoreFlowScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers({legacyFakeTimers: false});
    jest.setSystemTime(EPOCH);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('publishes exactly two running-to-finished transitions across two screen sessions without leaked work', async () => {
    const pair = makeRepeatSessionPair('observable-transitions');
    const service = createRepeatService(pair);
    const timer = createMultiSessionTimerControllerAdapter({
      durationMs: 2_500,
    });
    const appState = createAppStateSourceFixture();
    const screen = await render(
      <CoreFlowScreen
        appStateSource={appState.source}
        service={service}
        timerController={timer.controller}
      />,
    );
    let publicationsAtSecondFinish = -1;
    let transitionsAtSecondFinish = -1;

    try {
      await reachStartButton(screen);
      await pressStart(screen);
      await advance(2_500);
      expect(screen.getByText('计时状态：已结束')).toBeTruthy();
      expect(screen.getByText('剩余时间：00:00')).toBeTruthy();

      await pressStart(screen);
      expect(screen.getByText('计时状态：进行中')).toBeTruthy();
      await advance(2_500);
      expect(screen.getByText('计时状态：已结束')).toBeTruthy();
      expect(screen.getByText('剩余时间：00:00')).toBeTruthy();

      publicationsAtSecondFinish = timer.publishedSnapshots.length;
      transitionsAtSecondFinish = timer.transitions.length;
      expect(
        timer.transitions.filter(
          transition =>
            transition.from === 'running' &&
            transition.to === 'finished',
        ),
      ).toHaveLength(2);
      expect(jest.getTimerCount()).toBe(0);

      await advance(60_000);
      expect(timer.publishedSnapshots).toHaveLength(
        publicationsAtSecondFinish,
      );
      expect(timer.transitions).toHaveLength(transitionsAtSecondFinish);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      await screen.unmount();
    }

    expect(jest.mocked(service.startRecommended)).toHaveBeenCalledTimes(2);
    expect(jest.mocked(service.finishStep)).not.toHaveBeenCalled();
    expect(jest.mocked(service.finishTask)).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('pauses and resumes the real default second round at the 3750-to-3000 boundary before natural finish', async () => {
    const pair = makeRepeatSessionPair('default-pause-resume');
    const service = createRepeatService(pair);
    const appState = createAppStateSourceFixture();
    const screen = await render(
      <CoreFlowScreen
        appStateSource={appState.source}
        service={service}
      />,
    );

    try {
      await reachStartButton(screen);
      await pressStart(screen);
      await advance(300_000);
      expect(screen.getByText('计时状态：已结束')).toBeTruthy();
      expect(screen.getByText('剩余时间：00:00')).toBeTruthy();
      expect(
        screen.getByRole('button', {name: FINISH_STEP_BUTTON}),
      ).toBeTruthy();
      expect(startIsAvailable(screen)).toBe(true);
      expect(jest.getTimerCount()).toBe(0);

      await pressStart(screen);
      expect(screen.getByText('计时状态：进行中')).toBeTruthy();
      expect(screen.getByText('剩余时间：05:00')).toBeTruthy();

      await advance(296_250);
      expect(screen.getByText('剩余时间：00:04')).toBeTruthy();
      await fireEvent.press(
        screen.getByRole('button', {name: '暂停计时'}),
      );
      await flushPromises();
      expect(screen.getByText('计时状态：已暂停')).toBeTruthy();
      expect(screen.getByText('剩余时间：00:04')).toBeTruthy();
      expect(jest.getTimerCount()).toBe(0);

      await advance(60_000);
      expect(screen.getByText('计时状态：已暂停')).toBeTruthy();
      expect(screen.getByText('剩余时间：00:04')).toBeTruthy();
      expect(jest.getTimerCount()).toBe(0);

      await fireEvent.press(
        screen.getByRole('button', {name: '继续计时'}),
      );
      await flushPromises();
      expect(screen.getByText('计时状态：进行中')).toBeTruthy();
      expect(screen.getByText('剩余时间：00:04')).toBeTruthy();
      expect(jest.getTimerCount()).toBeGreaterThan(0);

      await advance(749);
      expect(screen.getByText('剩余时间：00:04')).toBeTruthy();
      await advance(1);
      expect(screen.getByText('剩余时间：00:03')).toBeTruthy();
      await advance(3_000);
      expect(screen.getByText('计时状态：已结束')).toBeTruthy();
      expect(screen.getByText('剩余时间：00:00')).toBeTruthy();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      await screen.unmount();
    }

    expect(jest.mocked(service.startRecommended)).toHaveBeenCalledTimes(2);
    expect(jest.mocked(service.finishStep)).not.toHaveBeenCalled();
    expect(jest.mocked(service.finishTask)).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('keeps the second start single-flight across rapid presses, observer/AppState rerenders, and a timer publication', async () => {
    const pair = makeRepeatSessionPair('second-single-flight');
    const secondStart = createDeferred<Task>();
    const startRecommended = jest
      .fn<Promise<Task>, [OperationOptions]>()
      .mockResolvedValueOnce(pair.startedTask)
      .mockImplementationOnce(() => secondStart.promise);
    const service = createRepeatService(pair, {startRecommended});
    const timer = createRepeatTimerControllerFixture();
    const firstAppState = createAppStateSourceFixture();
    const secondAppState = createAppStateSourceFixture();
    const firstObserver = jest.fn<void, [CoreFlowUiCommitKind]>();
    const secondObserver = jest.fn<void, [CoreFlowUiCommitKind]>();
    const screen = await render(
      <CoreFlowScreen
        appStateSource={firstAppState.source}
        onUiCommit={firstObserver}
        service={service}
        timerController={timer.controller}
      />,
    );
    let repeatWasAvailable = false;
    let disabledWhilePending = false;
    let callsBeforeSettlement = -1;
    let timerStartsAfterSettlement = -1;
    let secondRunningFull = false;
    let operationIds: string[] = [];

    try {
      await reachStartButton(screen);
      await pressStart(screen);
      await finishNaturally(timer);
      await flushPromises();
      repeatWasAvailable = startIsAvailable(screen);

      const repeatButton = screen.queryByRole('button', {name: START_BUTTON});
      if (repeatButton !== null) {
        await fireEvent.press(repeatButton);
        await fireEvent.press(repeatButton);
      }
      await screen.rerender(
        <CoreFlowScreen
          appStateSource={secondAppState.source}
          onUiCommit={secondObserver}
          service={service}
          timerController={timer.controller}
        />,
      );
      await act(async () => {
        timer.publishCurrent();
        await Promise.resolve();
      });
      await pressStart(screen);

      const pendingButton = screen.queryByRole('button', {
        name: START_BUTTON,
      });
      disabledWhilePending =
        pendingButton !== null && isDisabled(pendingButton);
      callsBeforeSettlement = startRecommended.mock.calls.length;
      operationIds = startRecommended.mock.calls.map(
        ([operation]) => operation.operationId,
      );

      await act(async () => {
        secondStart.resolve(pair.startedTask);
        await secondStart.promise;
        await Promise.resolve();
      });
      timerStartsAfterSettlement = jest.mocked(
        timer.controller.start,
      ).mock.calls.length;
      secondRunningFull =
        screen.queryByText('计时状态：进行中') !== null &&
        screen.queryByText('剩余时间：05:00') !== null;
    } finally {
      await screen.unmount();
    }

    expect(repeatWasAvailable).toBe(true);
    expect(disabledWhilePending).toBe(true);
    expect(callsBeforeSettlement).toBe(2);
    expect(operationIds).toHaveLength(2);
    expect(new Set(operationIds).size).toBe(2);
    expect(timerStartsAfterSettlement).toBe(2);
    expect(secondRunningFull).toBe(true);
    expect(firstAppState.remove).toHaveBeenCalledTimes(1);
  });

  it('disposes all live work when unmounted during the second default-controller round', async () => {
    const pair = makeRepeatSessionPair('second-unmount');
    const service = createRepeatService(pair);
    const appState = createAppStateSourceFixture();
    const screen = await render(
      <CoreFlowScreen
        appStateSource={appState.source}
        service={service}
      />,
    );
    let secondWasRunning = false;
    let timersBeforeUnmount = -1;

    await reachStartButton(screen);
    await pressStart(screen);
    await advance(300_000);
    await pressStart(screen);
    secondWasRunning =
      screen.queryByText('计时状态：进行中') !== null &&
      screen.queryByText('剩余时间：05:00') !== null;
    timersBeforeUnmount = jest.getTimerCount();

    await screen.unmount();
    const timersImmediatelyAfterUnmount = jest.getTimerCount();
    await advance(600_000);

    expect(secondWasRunning).toBe(true);
    expect(jest.mocked(service.startRecommended)).toHaveBeenCalledTimes(2);
    expect(timersBeforeUnmount).toBeGreaterThan(0);
    expect(timersImmediatelyAfterUnmount).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('R4-B repeat-session generation and terminal guards', () => {
  beforeEach(() => {
    jest.useFakeTimers({legacyFakeTimers: false});
    jest.setSystemTime(EPOCH);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('ignores a captured callback from round one after a replacement controller has started round two', async () => {
    const pair = makeRepeatSessionPair('stale-timer');
    const service = createRepeatService(pair);
    const oldTimer = createRepeatTimerControllerFixture();
    const newTimer = createRepeatTimerControllerFixture();
    const appState = createAppStateSourceFixture();
    const screen = await render(
      <CoreFlowScreen
        appStateSource={appState.source}
        service={service}
        timerController={oldTimer.controller}
      />,
    );
    let secondStillRunning = false;

    try {
      await reachStartButton(screen);
      await pressStart(screen);
      await finishNaturally(oldTimer);
      await screen.rerender(
        <CoreFlowScreen
          appStateSource={appState.source}
          service={service}
          timerController={newTimer.controller}
        />,
      );
      await flushPromises();
      await pressStart(screen);

      const staleFinished: CoreFlowTimerSnapshot = {
        state: 'finished',
        durationMs: 300_000,
        remainingMs: 0,
      };
      await act(async () => {
        oldTimer.invokeCaptured(staleFinished);
        await Promise.resolve();
      });
      secondStillRunning =
        screen.queryByText('计时状态：进行中') !== null &&
        screen.queryByText('剩余时间：05:00') !== null;
    } finally {
      await screen.unmount();
    }

    expect(secondStillRunning).toBe(true);
    expect(jest.mocked(service.startRecommended)).toHaveBeenCalledTimes(2);
    expect(jest.mocked(oldTimer.controller.dispose)).toHaveBeenCalledTimes(1);
    expect(jest.mocked(newTimer.controller.start)).toHaveBeenCalledTimes(1);
  });

  it('drops a late old-service start result before accepting a replacement-generation round', async () => {
    const oldPair = makeRepeatSessionPair('old-generation');
    const stalePair = makeRepeatSessionPair('stale-result');
    const newPair = makeRepeatSessionPair('new-generation');
    const staleStart = createDeferred<Task>();
    const oldStartRecommended = jest
      .fn<Promise<Task>, [OperationOptions]>()
      .mockResolvedValueOnce(oldPair.startedTask)
      .mockImplementationOnce(() => staleStart.promise);
    const newStartRecommended = jest.fn<Promise<Task>, [OperationOptions]>(
      async () => newPair.startedTask,
    );
    const oldService = createRepeatService(oldPair, {
      startRecommended: oldStartRecommended,
    });
    const newService = createRepeatService(newPair, {
      startRecommended: newStartRecommended,
    });
    const firstTimer = createRepeatTimerControllerFixture();
    const pendingTimer = createRepeatTimerControllerFixture();
    const replacementTimer = createRepeatTimerControllerFixture();
    const appState = createAppStateSourceFixture();
    const screen = await render(
      <CoreFlowScreen
        appStateSource={appState.source}
        service={oldService}
        timerController={firstTimer.controller}
      />,
    );
    let replacementVisible = false;
    let staleVisible = false;

    try {
      await reachStartButton(screen);
      await pressStart(screen);
      await finishNaturally(firstTimer);
      await screen.rerender(
        <CoreFlowScreen
          appStateSource={appState.source}
          service={oldService}
          timerController={pendingTimer.controller}
        />,
      );
      await flushPromises();
      await pressStart(screen);

      await screen.rerender(
        <CoreFlowScreen
          appStateSource={appState.source}
          service={newService}
          timerController={replacementTimer.controller}
        />,
      );
      await flushPromises();
      await act(async () => {
        staleStart.resolve(stalePair.startedTask);
        await staleStart.promise;
        await Promise.resolve();
      });

      await fireEvent.press(
        screen.getByRole('button', {name: RECOMMEND_BUTTON}),
      );
      await flushPromises();
      await pressStart(screen);
      replacementVisible =
        screen.queryAllByText(new RegExp(newPair.startedTask.title)).length >
          0 &&
        screen.queryByText('计时状态：进行中') !== null;
      staleVisible =
        screen.queryAllByText(new RegExp(stalePair.startedTask.title)).length >
        0;
    } finally {
      await screen.unmount();
    }

    expect(oldStartRecommended).toHaveBeenCalledTimes(2);
    expect(newStartRecommended).toHaveBeenCalledTimes(1);
    expect(jest.mocked(pendingTimer.controller.start)).not.toHaveBeenCalled();
    expect(jest.mocked(replacementTimer.controller.start)).toHaveBeenCalledTimes(
      1,
    );
    expect(replacementVisible).toBe(true);
    expect(staleVisible).toBe(false);
  });

  it('does not expose an enabled repeat start after manual completion leaves no pending step', async () => {
    const pair = makeRepeatSessionPair('step-terminal');
    const service = createRepeatService(pair);
    const timer = createRepeatTimerControllerFixture();
    const appState = createAppStateSourceFixture();
    const screen = await render(
      <CoreFlowScreen
        appStateSource={appState.source}
        service={service}
        timerController={timer.controller}
      />,
    );
    let repeatAvailable = true;

    try {
      await reachStartButton(screen);
      await pressStart(screen);
      await fireEvent.press(
        screen.getByRole('button', {name: FINISH_STEP_BUTTON}),
      );
      await flushPromises();
      await finishNaturally(timer);
      await flushPromises();
      repeatAvailable = startIsAvailable(screen);
      await pressStart(screen);
    } finally {
      await screen.unmount();
    }

    expect(repeatAvailable).toBe(false);
    expect(jest.mocked(service.startRecommended)).toHaveBeenCalledTimes(1);
    expect(jest.mocked(service.finishStep)).toHaveBeenCalledTimes(1);
  });

  it('does not expose repeat focus after manual task completion reaches a terminal task', async () => {
    const pair = makeRepeatSessionPair('task-terminal');
    const service = createRepeatService(pair);
    const timer = createRepeatTimerControllerFixture();
    const appState = createAppStateSourceFixture();
    const screen = await render(
      <CoreFlowScreen
        appStateSource={appState.source}
        service={service}
        timerController={timer.controller}
      />,
    );
    let startButtonExists = true;

    try {
      await reachStartButton(screen);
      await pressStart(screen);
      await fireEvent.press(
        screen.getByRole('button', {name: FINISH_STEP_BUTTON}),
      );
      await flushPromises();
      await fireEvent.press(
        screen.getByRole('button', {name: FINISH_TASK_BUTTON}),
      );
      await flushPromises();
      await finishNaturally(timer);
      await flushPromises();
      startButtonExists =
        screen.queryByRole('button', {name: START_BUTTON}) !== null;
    } finally {
      await screen.unmount();
    }

    expect(startButtonExists).toBe(false);
    expect(jest.mocked(service.startRecommended)).toHaveBeenCalledTimes(1);
    expect(jest.mocked(service.finishTask)).toHaveBeenCalledTimes(1);
  });
});
