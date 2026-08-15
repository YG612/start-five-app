import React from 'react';
import {act, fireEvent, render} from '@testing-library/react-native';
import type {
  CoreAppService,
  OperationOptions,
} from '../../src/application/coreAppService';
import type {Task} from '../../src/domain/task';
import {
  CoreFlowScreen,
  type CoreFlowScreenProps,
  type CoreFlowUiCommitKind,
} from '../../src/screens/CoreFlowScreen';
import {
  createAppStateSourceFixture,
  createDeferred,
  createTimerControllerFixture,
  makeReviewSubtask,
  makeReviewTask,
} from '../review1/fixtures/reviewFixtures';

type Review3CoreFlowScreenProps = CoreFlowScreenProps & {
  onUiCommitError?: (
    error: unknown,
    kind: CoreFlowUiCommitKind,
  ) => void;
};

const Review3CoreFlowScreen = CoreFlowScreen as React.ComponentType<
  Review3CoreFlowScreenProps
>;

type RenderedFlow = Awaited<ReturnType<typeof render>>;
type StartMutation = (operation: OperationOptions) => Promise<Task>;

const RECOMMEND_BUTTON = '推荐下一项';
const START_BUTTON = '开始5分钟';

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

async function reachStartButton(screen: RenderedFlow): Promise<void> {
  await flushPromises();
  await fireEvent.press(
    screen.getByRole('button', {name: RECOMMEND_BUTTON}),
  );
  await flushPromises();
  expect(screen.getByRole('button', {name: START_BUTTON})).toBeTruthy();
}

async function pressWithoutEscaping(
  screen: RenderedFlow,
): Promise<unknown | null> {
  try {
    await fireEvent.press(
      screen.getByRole('button', {name: START_BUTTON}),
    );
    return null;
  } catch (error) {
    return error;
  }
}

function makeStartPair(label: string): {
  pendingTask: Task;
  startedTask: Task;
} {
  const taskId = `review3-${label}`;
  const stepId = `${taskId}-step`;
  const step = makeReviewSubtask({
    id: stepId,
    taskId,
    title: `${label}-step`,
  });
  return {
    pendingTask: makeReviewTask({
      id: taskId,
      title: `${label}-task`,
      status: 'pending',
      startedAt: null,
      subtasks: [step],
    }),
    startedTask: makeReviewTask({
      id: taskId,
      title: `${label}-task`,
      status: 'in_progress',
      startedAt: '2026-08-04T02:00:00.000Z',
      subtasks: [step],
    }),
  };
}

function createStartService(
  pendingTask: Task,
  startedTask: Task,
  startRecommended: StartMutation,
): CoreAppService {
  return {
    createTask: jest.fn(async () => pendingTask),
    addFirstStep: jest.fn(async () => pendingTask),
    chooseRecommended: jest.fn(async () => pendingTask),
    startRecommended,
    finishStep: jest.fn(async () => startedTask),
    finishTask: jest.fn(async () => ({task: startedTask, points: 0})),
    getState: jest.fn(async () => ({tasks: [pendingTask], totalScore: 0})),
  };
}

describe('R3-A render-independent start single-flight', () => {
  it('does not unlock or duplicate a deferred start when only onUiCommit changes', async () => {
    const {pendingTask, startedTask} = makeStartPair('observer-swap');
    const deferred = createDeferred<Task>();
    const startRecommended = jest.fn<Promise<Task>, [OperationOptions]>(
      () => deferred.promise,
    );
    const service = createStartService(
      pendingTask,
      startedTask,
      startRecommended,
    );
    const timer = createTimerControllerFixture();
    const appState = createAppStateSourceFixture();
    const firstObserver = jest.fn<void, [CoreFlowUiCommitKind]>();
    const secondObserver = jest.fn<void, [CoreFlowUiCommitKind]>();

    const screen = await render(
      <Review3CoreFlowScreen
        appStateSource={appState.source}
        onUiCommit={firstObserver}
        service={service}
        timerController={timer.controller}
      />,
    );
    await reachStartButton(screen);
    await fireEvent.press(
      screen.getByRole('button', {name: START_BUTTON}),
    );

    await screen.rerender(
      <Review3CoreFlowScreen
        appStateSource={appState.source}
        onUiCommit={secondObserver}
        service={service}
        timerController={timer.controller}
      />,
    );
    await flushPromises();
    const disabledAfterObserverSwap = isDisabled(
      screen.getByRole('button', {name: START_BUTTON}),
    );
    await fireEvent.press(
      screen.getByRole('button', {name: START_BUTTON}),
    );
    const callsBeforeSettlement = startRecommended.mock.calls.length;
    const operationIdsBeforeSettlement = startRecommended.mock.calls.map(
      ([operation]) => operation.operationId,
    );

    await act(async () => {
      deferred.resolve(startedTask);
      await deferred.promise;
      await Promise.resolve();
    });
    const timerStarts = jest.mocked(timer.controller.start).mock.calls.length;
    await screen.unmount();

    expect(disabledAfterObserverSwap).toBe(true);
    expect(callsBeforeSettlement).toBe(1);
    expect(operationIdsBeforeSettlement).toHaveLength(1);
    expect(timerStarts).toBe(1);
  });

  it('keeps the original business continuation single-flight when only AppState source changes', async () => {
    const {pendingTask, startedTask} = makeStartPair('appstate-swap');
    const deferred = createDeferred<Task>();
    const startRecommended = jest.fn<Promise<Task>, [OperationOptions]>(
      () => deferred.promise,
    );
    const service = createStartService(
      pendingTask,
      startedTask,
      startRecommended,
    );
    const timer = createTimerControllerFixture();
    const oldAppState = createAppStateSourceFixture();
    const newAppState = createAppStateSourceFixture();
    const observer = jest.fn<void, [CoreFlowUiCommitKind]>();

    const screen = await render(
      <Review3CoreFlowScreen
        appStateSource={oldAppState.source}
        onUiCommit={observer}
        service={service}
        timerController={timer.controller}
      />,
    );
    await reachStartButton(screen);
    await fireEvent.press(
      screen.getByRole('button', {name: START_BUTTON}),
    );

    await screen.rerender(
      <Review3CoreFlowScreen
        appStateSource={newAppState.source}
        onUiCommit={observer}
        service={service}
        timerController={timer.controller}
      />,
    );
    await flushPromises();
    const disabledAfterAppStateSwap = isDisabled(
      screen.getByRole('button', {name: START_BUTTON}),
    );
    await fireEvent.press(
      screen.getByRole('button', {name: START_BUTTON}),
    );
    const callsBeforeSettlement = startRecommended.mock.calls.length;

    await act(async () => {
      deferred.resolve(startedTask);
      await deferred.promise;
      await Promise.resolve();
    });
    const timerStarts = jest.mocked(timer.controller.start).mock.calls.length;
    await screen.unmount();

    expect(disabledAfterAppStateSwap).toBe(true);
    expect(callsBeforeSettlement).toBe(1);
    expect(timerStarts).toBe(1);
  });

  it('does not duplicate a pending mutation across timer replacement and allows retry only after settlement', async () => {
    const {pendingTask, startedTask} = makeStartPair('timer-swap');
    const firstStart = createDeferred<Task>();
    const startRecommended = jest
      .fn<Promise<Task>, [OperationOptions]>()
      .mockImplementationOnce(() => firstStart.promise)
      .mockResolvedValueOnce(startedTask);
    const service = createStartService(
      pendingTask,
      startedTask,
      startRecommended,
    );
    const oldTimer = createTimerControllerFixture();
    const newTimer = createTimerControllerFixture();
    const appState = createAppStateSourceFixture();

    const screen = await render(
      <CoreFlowScreen
        appStateSource={appState.source}
        service={service}
        timerController={oldTimer.controller}
      />,
    );
    await reachStartButton(screen);
    await fireEvent.press(
      screen.getByRole('button', {name: START_BUTTON}),
    );

    await screen.rerender(
      <CoreFlowScreen
        appStateSource={appState.source}
        service={service}
        timerController={newTimer.controller}
      />,
    );
    await flushPromises();
    const disabledWhileOldStartPending = isDisabled(
      screen.getByRole('button', {name: START_BUTTON}),
    );
    await fireEvent.press(
      screen.getByRole('button', {name: START_BUTTON}),
    );
    const callsBeforeOldSettlement = startRecommended.mock.calls.length;
    const replacementStartsBeforeSettlement =
      jest.mocked(newTimer.controller.start).mock.calls.length;

    await act(async () => {
      firstStart.resolve(startedTask);
      await firstStart.promise;
      await Promise.resolve();
    });
    const startsAfterStaleSettlement =
      jest.mocked(oldTimer.controller.start).mock.calls.length +
      jest.mocked(newTimer.controller.start).mock.calls.length;

    await fireEvent.press(
      screen.getByRole('button', {name: START_BUTTON}),
    );
    await flushPromises();
    const callsAfterRetry = startRecommended.mock.calls.length;
    const replacementStartsAfterRetry =
      jest.mocked(newTimer.controller.start).mock.calls.length;
    const acceptedOperationIds = startRecommended.mock.calls.map(
      ([operation]) => operation.operationId,
    );
    await screen.unmount();

    expect(disabledWhileOldStartPending).toBe(true);
    expect(callsBeforeOldSettlement).toBe(1);
    expect(replacementStartsBeforeSettlement).toBe(0);
    expect(startsAfterStaleSettlement).toBe(0);
    expect(callsAfterRetry).toBe(2);
    expect(replacementStartsAfterRetry).toBe(1);
    expect(new Set(acceptedOperationIds).size).toBe(2);
  });
});

describe('R3-A diagnostic observer failure isolation', () => {
  it('reports a starting observer failure, settles rejection, and permits one successful retry', async () => {
    const {pendingTask, startedTask} = makeStartPair('starting-audit');
    const serviceFailure = new Error('FIRST_START_REJECTED');
    const observerFailure = new Error('STARTING_AUDIT_FAILED');
    const startRecommended = jest
      .fn<Promise<Task>, [OperationOptions]>()
      .mockRejectedValueOnce(serviceFailure)
      .mockResolvedValueOnce(startedTask);
    const service = createStartService(
      pendingTask,
      startedTask,
      startRecommended,
    );
    const timer = createTimerControllerFixture();
    const appState = createAppStateSourceFixture();
    const onUiCommit = jest.fn<void, [CoreFlowUiCommitKind]>(kind => {
      if (kind === 'starting') {
        throw observerFailure;
      }
    });
    const onUiCommitError = jest.fn<
      void,
      [unknown, CoreFlowUiCommitKind]
    >();

    const screen = await render(
      <Review3CoreFlowScreen
        appStateSource={appState.source}
        onUiCommit={onUiCommit}
        onUiCommitError={onUiCommitError}
        service={service}
        timerController={timer.controller}
      />,
    );
    await reachStartButton(screen);

    const firstEscapedError = await pressWithoutEscaping(screen);
    await flushPromises();
    const secondEscapedError = await pressWithoutEscaping(screen);
    await flushPromises();
    const serviceCalls = startRecommended.mock.calls.length;
    const timerStarts = jest.mocked(timer.controller.start).mock.calls.length;
    const reportedFailures = [...onUiCommitError.mock.calls];
    await screen.unmount();

    expect(firstEscapedError).toBeNull();
    expect(secondEscapedError).toBeNull();
    expect(serviceCalls).toBe(2);
    expect(timerStarts).toBe(1);
    expect(reportedFailures).toEqual([
      [observerFailure, 'starting'],
      [observerFailure, 'starting'],
    ]);
  });

  const laterCommitKinds = ['activeTask', 'selectedStep'] as const;

  it.each(laterCommitKinds)(
    'continues state and timer work when the %s observer throws',
    async failingKind => {
      const {pendingTask, startedTask} = makeStartPair(
        `later-${failingKind}`,
      );
      const observerFailure = new Error(`${failingKind}-AUDIT_FAILED`);
      const startRecommended = jest.fn<Promise<Task>, [OperationOptions]>(
        async () => startedTask,
      );
      const service = createStartService(
        pendingTask,
        startedTask,
        startRecommended,
      );
      const timer = createTimerControllerFixture();
      const appState = createAppStateSourceFixture();
      const onUiCommit = jest.fn<void, [CoreFlowUiCommitKind]>(kind => {
        if (kind === failingKind) {
          throw observerFailure;
        }
      });
      const onUiCommitError = jest.fn<
        void,
        [unknown, CoreFlowUiCommitKind]
      >();

      const screen = await render(
        <Review3CoreFlowScreen
          appStateSource={appState.source}
          onUiCommit={onUiCommit}
          onUiCommitError={onUiCommitError}
          service={service}
          timerController={timer.controller}
        />,
      );
      await reachStartButton(screen);
      await fireEvent.press(
        screen.getByRole('button', {name: START_BUTTON}),
      );
      await flushPromises();

      const timerStarts = jest.mocked(timer.controller.start).mock.calls.length;
      const taskIsVisible =
        screen.queryAllByText(new RegExp(startedTask.title)).length > 0;
      const observerFailureIsVisible =
        screen.queryByText(observerFailure.message) !== null;
      const reportedFailures = [...onUiCommitError.mock.calls];
      await screen.unmount();

      expect(startRecommended).toHaveBeenCalledTimes(1);
      expect(timerStarts).toBe(1);
      expect(taskIsVisible).toBe(true);
      expect(observerFailureIsVisible).toBe(false);
      expect(reportedFailures).toEqual([[observerFailure, failingKind]]);
    },
  );
});
