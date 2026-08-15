import React from 'react';
import {AppState, type AppStateStatus} from 'react-native';
import {
  act,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react-native';
import {
  CoreFlowScreen,
  createDefaultCoreFlowTimerController,
  type CoreFlowScreenProps,
} from '../../src/screens/CoreFlowScreen';
import type {Task} from '../../src/domain/task';
import {FiveMinuteTimer} from '../../src/services/fiveMinuteTimer';
import {
  createAppStateSourceFixture,
  createCoreServiceFixture,
  createDeferred,
  createTimerControllerFixture,
  type ReviewAppStateSource,
  type ReviewTimerController,
  type ReviewTimerSnapshot,
} from './fixtures/reviewFixtures';

jest.setTimeout(15_000);

type ReviewableCoreFlowScreenProps = CoreFlowScreenProps & {
  timerController: ReviewTimerController;
  appStateSource: ReviewAppStateSource;
};

const ReviewableCoreFlowScreen = CoreFlowScreen as React.ComponentType<
  ReviewableCoreFlowScreenProps
>;

type RenderedFlow = Awaited<ReturnType<typeof render>>;

function isUnavailable(
  element: {
    props: {
      accessibilityState?: {disabled?: boolean};
      disabled?: boolean;
      editable?: boolean;
    };
  } | null,
): boolean {
  return (
    element === null ||
    element.props.accessibilityState?.disabled === true ||
    element.props.disabled === true ||
    element.props.editable === false
  );
}

async function reachStartButton(
  screen: RenderedFlow,
): Promise<void> {
  await waitFor(() =>
    expect(screen.getByText('任务：写项目周报')).toBeTruthy(),
  );
  await fireEvent.press(screen.getByRole('button', {name: '推荐下一项'}));
  await waitFor(() =>
    expect(screen.getByRole('button', {name: '开始5分钟'})).toBeTruthy(),
  );
}

describe('R1-A five-minute timer product integration', () => {
  it('starts an observable timer and exposes remaining time plus pause/resume controls', async () => {
    const serviceFixture = createCoreServiceFixture();
    const timerFixture = createTimerControllerFixture();
    const appStateFixture = createAppStateSourceFixture();
    const screen = await render(
      <ReviewableCoreFlowScreen
        appStateSource={appStateFixture.source}
        service={serviceFixture.service}
        timerController={timerFixture.controller}
      />,
    );
    await reachStartButton(screen);

    await fireEvent.press(screen.getByRole('button', {name: '开始5分钟'}));

    await waitFor(() => {
      expect(serviceFixture.service.startRecommended).toHaveBeenCalledTimes(1);
      expect(timerFixture.controller.start).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText('5分钟计时状态')).toBeTruthy();
      expect(screen.getByText('计时状态：进行中')).toBeTruthy();
      expect(screen.getByLabelText('5分钟剩余时间')).toBeTruthy();
      expect(screen.getByText('剩余时间：05:00')).toBeTruthy();
    });

    await fireEvent.press(screen.getByRole('button', {name: '暂停计时'}));
    await waitFor(() => {
      expect(timerFixture.controller.pause).toHaveBeenCalledTimes(1);
      expect(screen.getByText('计时状态：已暂停')).toBeTruthy();
      expect(screen.getByText('剩余时间：04:00')).toBeTruthy();
    });

    await fireEvent.press(screen.getByRole('button', {name: '继续计时'}));
    await waitFor(() => {
      expect(timerFixture.controller.resume).toHaveBeenCalledTimes(1);
      expect(screen.getByText('计时状态：进行中')).toBeTruthy();
    });

    await screen.unmount();
  });

  it('renders accessible natural-completion feedback exactly once', async () => {
    const serviceFixture = createCoreServiceFixture();
    const timerFixture = createTimerControllerFixture();
    const appStateFixture = createAppStateSourceFixture();
    const screen = await render(
      <ReviewableCoreFlowScreen
        appStateSource={appStateFixture.source}
        service={serviceFixture.service}
        timerController={timerFixture.controller}
      />,
    );
    await reachStartButton(screen);
    await fireEvent.press(screen.getByRole('button', {name: '开始5分钟'}));
    await waitFor(() =>
      expect(timerFixture.controller.start).toHaveBeenCalledTimes(1),
    );

    await act(async () => {
      timerFixture.emit({
        state: 'finished',
        durationMs: 300_000,
        remainingMs: 0,
      });
    });

    await waitFor(() => {
      expect(screen.getByText('计时状态：已结束')).toBeTruthy();
      expect(screen.getByText('剩余时间：00:00')).toBeTruthy();
      expect(
        screen.getByText('5分钟已结束，可以继续下一小步。'),
      ).toBeTruthy();
      expect(
        screen.getAllByText('5分钟已结束，可以继续下一小步。'),
      ).toHaveLength(1);
    });

    await screen.unmount();
  });

  it('forwards every AppState transition and releases all resources on unmount', async () => {
    const serviceFixture = createCoreServiceFixture();
    const timerFixture = createTimerControllerFixture();
    const appStateFixture = createAppStateSourceFixture();
    const screen = await render(
      <ReviewableCoreFlowScreen
        appStateSource={appStateFixture.source}
        service={serviceFixture.service}
        timerController={timerFixture.controller}
      />,
    );
    await reachStartButton(screen);
    await fireEvent.press(screen.getByRole('button', {name: '开始5分钟'}));
    await waitFor(() =>
      expect(timerFixture.controller.start).toHaveBeenCalledTimes(1),
    );

    await act(async () => {
      appStateFixture.emit('background');
      appStateFixture.emit('inactive');
      appStateFixture.emit('active');
    });

    expect(timerFixture.controller.handleAppState).toHaveBeenNthCalledWith(
      1,
      'background',
    );
    expect(timerFixture.controller.handleAppState).toHaveBeenNthCalledWith(
      2,
      'inactive',
    );
    expect(timerFixture.controller.handleAppState).toHaveBeenNthCalledWith(
      3,
      'active',
    );

    await screen.unmount();
    expect(appStateFixture.remove).toHaveBeenCalledTimes(1);
    expect(timerFixture.unsubscribe).toHaveBeenCalledTimes(1);
    expect(timerFixture.controller.dispose).toHaveBeenCalledTimes(1);
  });

  it('coalesces rapid starts and makes the active session unavailable to restart', async () => {
    const deferredStart = createDeferred<Task>();
    const serviceFixture = createCoreServiceFixture({
      startPromise: deferredStart.promise,
    });
    const timerFixture = createTimerControllerFixture();
    const appStateFixture = createAppStateSourceFixture();
    const screen = await render(
      <ReviewableCoreFlowScreen
        appStateSource={appStateFixture.source}
        service={serviceFixture.service}
        timerController={timerFixture.controller}
      />,
    );
    await reachStartButton(screen);
    const start = screen.getByRole('button', {name: '开始5分钟'});

    await fireEvent.press(start);
    await fireEvent.press(start);
    expect(serviceFixture.service.startRecommended).toHaveBeenCalledTimes(1);
    expect(timerFixture.controller.start).not.toHaveBeenCalled();

    await act(async () => {
      deferredStart.resolve(serviceFixture.startedTask);
      await deferredStart.promise;
    });
    await waitFor(() =>
      expect(timerFixture.controller.start).toHaveBeenCalledTimes(1),
    );

    const laterStart = screen.queryByRole('button', {name: '开始5分钟'});
    expect(isUnavailable(laterStart)).toBe(true);
    expect(serviceFixture.service.startRecommended).toHaveBeenCalledTimes(1);
    expect(timerFixture.controller.start).toHaveBeenCalledTimes(1);

    await screen.unmount();
  });

  it('adapts a real FiveMinuteTimer with observable deterministic completion', () => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-08-04T01:02:03.000Z'));
    const startSpy = jest.spyOn(FiveMinuteTimer.prototype, 'start');
    const appStateSpy = jest.spyOn(
      FiveMinuteTimer.prototype,
      'handleAppState',
    );
    const disposeSpy = jest.spyOn(FiveMinuteTimer.prototype, 'dispose');
    let controller: ReviewTimerController | null = null;

    try {
      const createdController = createDefaultCoreFlowTimerController({
        durationMs: 1_000,
        now: () => Date.now(),
      });
      controller = createdController;
      const listener = jest.fn<void, [ReviewTimerSnapshot]>();
      const unsubscribe = createdController.subscribe(listener);

      createdController.start();
      expect(startSpy).toHaveBeenCalledTimes(1);
      expect(createdController.getSnapshot()).toMatchObject({
        state: 'running',
        durationMs: 1_000,
        remainingMs: 1_000,
      });
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({state: 'running'}),
      );

      jest.advanceTimersByTime(400);
      expect(createdController.getSnapshot()).toMatchObject({
        state: 'running',
        remainingMs: 600,
      });
      createdController.handleAppState('background');
      expect(appStateSpy).toHaveBeenCalledWith('background');

      jest.advanceTimersByTime(600);
      expect(createdController.getSnapshot()).toMatchObject({
        state: 'finished',
        remainingMs: 0,
      });
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({state: 'finished', remainingMs: 0}),
      );

      unsubscribe();
      createdController.dispose();
      expect(disposeSpy).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);
      controller = null;
    } finally {
      controller?.dispose();
      jest.useRealTimers();
    }
  });

  it('uses the real default timer and React Native AppState when no seams are supplied', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-08-04T01:02:03.000Z'));
    const startSpy = jest.spyOn(FiveMinuteTimer.prototype, 'start');
    const appStateSpy = jest.spyOn(
      FiveMinuteTimer.prototype,
      'handleAppState',
    );
    const disposeSpy = jest.spyOn(FiveMinuteTimer.prototype, 'dispose');
    const remove = jest.fn();
    let appStateListener: ((state: AppStateStatus) => void) | null = null;
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, listener) => {
        appStateListener = listener;
        return {remove};
      });
    const serviceFixture = createCoreServiceFixture();
    let screen: RenderedFlow | null = null;

    try {
      screen = await render(<CoreFlowScreen service={serviceFixture.service} />);
      await reachStartButton(screen);
      await fireEvent.press(
        screen.getByRole('button', {name: '开始5分钟'}),
      );

      await waitFor(() => {
        expect(startSpy).toHaveBeenCalledTimes(1);
        expect(screen?.getByText('计时状态：进行中')).toBeTruthy();
        expect(screen?.getByText('剩余时间：05:00')).toBeTruthy();
      });
      expect(AppState.addEventListener).toHaveBeenCalledTimes(1);
      const appStateSubscriptionCall = jest.mocked(AppState.addEventListener)
        .mock.calls[0];
      expect(appStateSubscriptionCall?.[0]).toBe('change');
      expect(typeof appStateSubscriptionCall?.[1]).toBe('function');

      await act(async () => {
        const listener = appStateListener;
        if (listener === null) {
          throw new Error('default AppState listener was not installed');
        }
        listener('background');
      });
      expect(appStateSpy).toHaveBeenCalledWith('background');

      await screen.unmount();
      screen = null;
      expect(remove).toHaveBeenCalledTimes(1);
      expect(disposeSpy).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      if (screen !== null) {
        await screen.unmount();
      }
      jest.useRealTimers();
    }
  });

  it('does not start on service rejection and allows a later successful retry', async () => {
    const serviceFixture = createCoreServiceFixture();
    jest
      .mocked(serviceFixture.service.startRecommended)
      .mockRejectedValueOnce(new Error('START_REJECTED'))
      .mockResolvedValueOnce(serviceFixture.startedTask);
    const timerFixture = createTimerControllerFixture();
    const appStateFixture = createAppStateSourceFixture();
    const screen = await render(
      <ReviewableCoreFlowScreen
        appStateSource={appStateFixture.source}
        service={serviceFixture.service}
        timerController={timerFixture.controller}
      />,
    );
    await reachStartButton(screen);

    await fireEvent.press(screen.getByRole('button', {name: '开始5分钟'}));
    await waitFor(() => {
      expect(screen.getByText('START_REJECTED')).toBeTruthy();
      expect(screen.getByText('计时状态：未开始')).toBeTruthy();
    });
    expect(serviceFixture.service.startRecommended).toHaveBeenCalledTimes(1);
    expect(timerFixture.controller.start).not.toHaveBeenCalled();
    expect(screen.queryByText('计时状态：进行中')).toBeNull();

    await fireEvent.press(screen.getByRole('button', {name: '开始5分钟'}));
    await waitFor(() => {
      expect(serviceFixture.service.startRecommended).toHaveBeenCalledTimes(2);
      expect(timerFixture.controller.start).toHaveBeenCalledTimes(1);
      expect(screen.getByText('计时状态：进行中')).toBeTruthy();
    });

    await screen.unmount();
  });

  it('rounds every positive partial second upward in the accessible display', async () => {
    const serviceFixture = createCoreServiceFixture();
    const timerFixture = createTimerControllerFixture();
    const appStateFixture = createAppStateSourceFixture();
    const screen = await render(
      <ReviewableCoreFlowScreen
        appStateSource={appStateFixture.source}
        service={serviceFixture.service}
        timerController={timerFixture.controller}
      />,
    );
    await reachStartButton(screen);
    await fireEvent.press(screen.getByRole('button', {name: '开始5分钟'}));
    await waitFor(() =>
      expect(timerFixture.controller.start).toHaveBeenCalledTimes(1),
    );

    await act(async () => {
      timerFixture.emit({
        state: 'running',
        durationMs: 300_000,
        remainingMs: 60_001,
      });
    });
    await waitFor(() =>
      expect(screen.getByText('剩余时间：01:01')).toBeTruthy(),
    );

    await act(async () => {
      timerFixture.emit({
        state: 'running',
        durationMs: 300_000,
        remainingMs: 1,
      });
    });
    await waitFor(() =>
      expect(screen.getByText('剩余时间：00:01')).toBeTruthy(),
    );

    await screen.unmount();
  });
});
