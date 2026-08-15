import React from 'react';
import {act, fireEvent, render} from '@testing-library/react-native';
import type {CoreAppService} from '../../src/application/coreAppService';
import type {Task} from '../../src/domain/task';
import {
  CoreFlowScreen,
  type CoreFlowScreenProps,
} from '../../src/screens/CoreFlowScreen';
import {
  createAppStateSourceFixture,
  createDeferred,
  createTimerControllerFixture,
  makeReviewSubtask,
  makeReviewTask,
} from '../review1/fixtures/reviewFixtures';

type CoreFlowUiCommitKind =
  | 'activeTask'
  | 'selectedStep'
  | 'error'
  | 'starting';

type AuditableCoreFlowScreenProps = CoreFlowScreenProps & {
  onUiCommit?: (kind: CoreFlowUiCommitKind) => void;
};

const AuditableCoreFlowScreen = CoreFlowScreen as React.ComponentType<
  AuditableCoreFlowScreenProps
>;

type RenderedFlow = Awaited<ReturnType<typeof render>>;

async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function reachStartButton(
  screen: RenderedFlow,
  taskTitle: string,
): Promise<void> {
  await flushPromises();
  expect(screen.getByText(`任务：${taskTitle}`)).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', {name: '推荐下一项'}),
  );
  await flushPromises();
  expect(screen.getByRole('button', {name: '开始5分钟'})).toBeTruthy();
}

function makeGenerationTask(options: {
  id: string;
  stepId: string;
  title: string;
  status: 'pending' | 'in_progress';
}): Task {
  return makeReviewTask({
    id: options.id,
    title: options.title,
    status: options.status,
    startedAt:
      options.status === 'in_progress'
        ? '2026-08-04T01:03:00.000Z'
        : null,
    subtasks: [
      makeReviewSubtask({
        id: options.stepId,
        taskId: options.id,
        title: `${options.title}第一步`,
      }),
    ],
  });
}

function createGenerationService(options: {
  pendingTask: Task;
  startedTask: Task;
  startPromise: Promise<Task>;
}): CoreAppService {
  return {
    createTask: jest.fn(async () => options.pendingTask),
    addFirstStep: jest.fn(async () => options.pendingTask),
    chooseRecommended: jest.fn(async () => options.pendingTask),
    startRecommended: jest.fn(() => options.startPromise),
    finishStep: jest.fn(async () => options.startedTask),
    finishTask: jest.fn(async () => ({task: options.startedTask, points: 0})),
    getState: jest.fn(async () => ({tasks: [options.pendingTask], totalScore: 0})),
  };
}

describe('R2-B unmount-safe deferred start', () => {
  it('does not commit or start a timer when success settles after unmount', async () => {
    const deferred = createDeferred<Task>();
    const pendingTask = makeGenerationTask({
      id: 'unmount-success',
      stepId: 'unmount-success-step',
      title: '卸载成功边界',
      status: 'pending',
    });
    const startedTask = makeGenerationTask({
      id: 'unmount-success',
      stepId: 'unmount-success-step',
      title: '卸载成功边界',
      status: 'in_progress',
    });
    const service = createGenerationService({
      pendingTask,
      startedTask,
      startPromise: deferred.promise,
    });
    const timerFixture = createTimerControllerFixture();
    const appStateFixture = createAppStateSourceFixture();
    const onUiCommit = jest.fn<void, [CoreFlowUiCommitKind]>();
    const screen = await render(
      <AuditableCoreFlowScreen
        appStateSource={appStateFixture.source}
        onUiCommit={onUiCommit}
        service={service}
        timerController={timerFixture.controller}
      />,
    );
    await reachStartButton(screen, pendingTask.title);
    await fireEvent.press(
      screen.getByRole('button', {name: '开始5分钟'}),
    );
    expect(service.startRecommended).toHaveBeenCalledTimes(1);
    const commitsAtUnmount = onUiCommit.mock.calls.length;

    await screen.unmount();
    expect(timerFixture.controller.dispose).toHaveBeenCalledTimes(1);
    expect(timerFixture.unsubscribe).toHaveBeenCalledTimes(1);
    expect(appStateFixture.remove).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferred.resolve(startedTask);
      await deferred.promise;
      await Promise.resolve();
    });

    expect(onUiCommit).toHaveBeenCalledTimes(commitsAtUnmount);
    expect(timerFixture.controller.start).not.toHaveBeenCalled();
  });

  it('does not commit an error when rejection settles after unmount', async () => {
    const deferred = createDeferred<Task>();
    const pendingTask = makeGenerationTask({
      id: 'unmount-failure',
      stepId: 'unmount-failure-step',
      title: '卸载失败边界',
      status: 'pending',
    });
    const startedTask = makeGenerationTask({
      id: 'unmount-failure',
      stepId: 'unmount-failure-step',
      title: '卸载失败边界',
      status: 'in_progress',
    });
    const service = createGenerationService({
      pendingTask,
      startedTask,
      startPromise: deferred.promise,
    });
    const timerFixture = createTimerControllerFixture();
    const appStateFixture = createAppStateSourceFixture();
    const onUiCommit = jest.fn<void, [CoreFlowUiCommitKind]>();
    const failure = new Error('LATE_START_FAILURE');
    const observedSettlement = deferred.promise.catch(error => error);
    const screen = await render(
      <AuditableCoreFlowScreen
        appStateSource={appStateFixture.source}
        onUiCommit={onUiCommit}
        service={service}
        timerController={timerFixture.controller}
      />,
    );
    await reachStartButton(screen, pendingTask.title);
    await fireEvent.press(
      screen.getByRole('button', {name: '开始5分钟'}),
    );
    expect(service.startRecommended).toHaveBeenCalledTimes(1);
    const commitsAtUnmount = onUiCommit.mock.calls.length;

    await screen.unmount();
    expect(timerFixture.controller.dispose).toHaveBeenCalledTimes(1);
    expect(timerFixture.unsubscribe).toHaveBeenCalledTimes(1);
    expect(appStateFixture.remove).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferred.reject(failure);
      await observedSettlement;
      await Promise.resolve();
    });

    await expect(observedSettlement).resolves.toBe(failure);
    expect(onUiCommit).toHaveBeenCalledTimes(commitsAtUnmount);
    expect(timerFixture.controller.start).not.toHaveBeenCalled();
  });
});

describe('R2-B dependency-generation isolation', () => {
  it('ignores old success when only the service reference changes', async () => {
    const oldDeferred = createDeferred<Task>();
    const oldPending = makeGenerationTask({
      id: 'service-old-task',
      stepId: 'service-old-step',
      title: '服务旧代任务',
      status: 'pending',
    });
    const oldStarted = makeGenerationTask({
      id: 'service-old-task',
      stepId: 'service-old-step',
      title: '服务旧代任务',
      status: 'in_progress',
    });
    const oldService = createGenerationService({
      pendingTask: oldPending,
      startedTask: oldStarted,
      startPromise: oldDeferred.promise,
    });
    const newPending = makeGenerationTask({
      id: 'service-new-task',
      stepId: 'service-new-step',
      title: '服务新代任务',
      status: 'pending',
    });
    const newStarted = makeGenerationTask({
      id: 'service-new-task',
      stepId: 'service-new-step',
      title: '服务新代任务',
      status: 'in_progress',
    });
    const newService = createGenerationService({
      pendingTask: newPending,
      startedTask: newStarted,
      startPromise: Promise.resolve(newStarted),
    });
    const sharedTimer = createTimerControllerFixture();
    const sharedAppState = createAppStateSourceFixture();

    const screen = await render(
      <CoreFlowScreen
        appStateSource={sharedAppState.source}
        service={oldService}
        timerController={sharedTimer.controller}
      />,
    );
    await reachStartButton(screen, oldPending.title);
    await fireEvent.press(
      screen.getByRole('button', {name: '开始5分钟'}),
    );
    expect(oldService.startRecommended).toHaveBeenCalledTimes(1);

    await screen.rerender(
      <CoreFlowScreen
        appStateSource={sharedAppState.source}
        service={newService}
        timerController={sharedTimer.controller}
      />,
    );
    await flushPromises();
    expect(screen.getByText('任务：服务新代任务')).toBeTruthy();
    await fireEvent.press(
      screen.getByRole('button', {name: '推荐下一项'}),
    );
    await flushPromises();
    expect(screen.getByText('推荐：服务新代任务')).toBeTruthy();

    await act(async () => {
      oldDeferred.resolve(oldStarted);
      await oldDeferred.promise;
      await Promise.resolve();
    });

    expect(screen.getByText('任务：服务新代任务')).toBeTruthy();
    expect(screen.queryByText('任务：服务旧代任务')).toBeNull();
    expect(screen.getByText('推荐：服务新代任务')).toBeTruthy();
    expect(screen.queryByText('当前小步：服务旧代任务第一步')).toBeNull();
    expect(sharedTimer.controller.start).not.toHaveBeenCalled();

    await screen.unmount();
  });

  it('ignores old rejection when only the service reference changes', async () => {
    const oldDeferred = createDeferred<Task>();
    const oldFailure = new Error('SERVICE_OLD_FAILURE');
    const observedSettlement = oldDeferred.promise.catch(error => error);
    const oldPending = makeGenerationTask({
      id: 'service-reject-old-task',
      stepId: 'service-reject-old-step',
      title: '服务旧代失败任务',
      status: 'pending',
    });
    const oldStarted = makeGenerationTask({
      id: 'service-reject-old-task',
      stepId: 'service-reject-old-step',
      title: '服务旧代失败任务',
      status: 'in_progress',
    });
    const oldService = createGenerationService({
      pendingTask: oldPending,
      startedTask: oldStarted,
      startPromise: oldDeferred.promise,
    });
    const newPending = makeGenerationTask({
      id: 'service-reject-new-task',
      stepId: 'service-reject-new-step',
      title: '服务拒绝后的新代任务',
      status: 'pending',
    });
    const newStarted = makeGenerationTask({
      id: 'service-reject-new-task',
      stepId: 'service-reject-new-step',
      title: '服务拒绝后的新代任务',
      status: 'in_progress',
    });
    const newService = createGenerationService({
      pendingTask: newPending,
      startedTask: newStarted,
      startPromise: Promise.resolve(newStarted),
    });
    const sharedTimer = createTimerControllerFixture();
    const sharedAppState = createAppStateSourceFixture();

    const screen = await render(
      <CoreFlowScreen
        appStateSource={sharedAppState.source}
        service={oldService}
        timerController={sharedTimer.controller}
      />,
    );
    await reachStartButton(screen, oldPending.title);
    await fireEvent.press(
      screen.getByRole('button', {name: '开始5分钟'}),
    );
    expect(oldService.startRecommended).toHaveBeenCalledTimes(1);

    await screen.rerender(
      <CoreFlowScreen
        appStateSource={sharedAppState.source}
        service={newService}
        timerController={sharedTimer.controller}
      />,
    );
    await flushPromises();
    expect(screen.getByText('任务：服务拒绝后的新代任务')).toBeTruthy();
    await fireEvent.press(
      screen.getByRole('button', {name: '推荐下一项'}),
    );
    await flushPromises();

    await act(async () => {
      oldDeferred.reject(oldFailure);
      await observedSettlement;
      await Promise.resolve();
    });

    await expect(observedSettlement).resolves.toBe(oldFailure);
    expect(screen.queryByText('SERVICE_OLD_FAILURE')).toBeNull();
    expect(screen.getByText('任务：服务拒绝后的新代任务')).toBeTruthy();
    expect(screen.getByText('推荐：服务拒绝后的新代任务')).toBeTruthy();
    expect(screen.queryByText('任务：服务旧代失败任务')).toBeNull();
    expect(sharedTimer.controller.start).not.toHaveBeenCalled();

    await screen.unmount();
  });

  it('ignores old success when only the timerController reference changes', async () => {
    const deferred = createDeferred<Task>();
    const pendingTask = makeGenerationTask({
      id: 'timer-generation-task',
      stepId: 'timer-generation-step',
      title: '仅计时器换代任务',
      status: 'pending',
    });
    const startedTask = makeGenerationTask({
      id: 'timer-generation-task',
      stepId: 'timer-generation-step',
      title: '仅计时器换代任务',
      status: 'in_progress',
    });
    const sharedService = createGenerationService({
      pendingTask,
      startedTask,
      startPromise: deferred.promise,
    });
    const oldTimer = createTimerControllerFixture();
    const newTimer = createTimerControllerFixture();
    const sharedAppState = createAppStateSourceFixture();

    const screen = await render(
      <CoreFlowScreen
        appStateSource={sharedAppState.source}
        service={sharedService}
        timerController={oldTimer.controller}
      />,
    );
    await reachStartButton(screen, pendingTask.title);
    await fireEvent.press(
      screen.getByRole('button', {name: '开始5分钟'}),
    );
    expect(sharedService.startRecommended).toHaveBeenCalledTimes(1);

    await screen.rerender(
      <CoreFlowScreen
        appStateSource={sharedAppState.source}
        service={sharedService}
        timerController={newTimer.controller}
      />,
    );
    await flushPromises();
    expect(screen.getByText('计时状态：未开始')).toBeTruthy();

    await act(async () => {
      deferred.resolve(startedTask);
      await deferred.promise;
      await Promise.resolve();
    });

    expect(screen.getByText('任务：仅计时器换代任务')).toBeTruthy();
    expect(screen.getByText('推荐：仅计时器换代任务')).toBeTruthy();
    expect(screen.queryByText('当前小步：仅计时器换代任务第一步')).toBeNull();
    expect(screen.getByText('计时状态：未开始')).toBeTruthy();
    expect(oldTimer.controller.start).not.toHaveBeenCalled();
    expect(newTimer.controller.start).not.toHaveBeenCalled();

    await screen.unmount();
  });
});

describe('R2-B auditable replacement happy path', () => {
  it('publishes mounted UI commits and starts only the active dependencies', async () => {
    const oldPending = makeGenerationTask({
      id: 'unused-old-task',
      stepId: 'unused-old-step',
      title: '不应调用的旧代任务',
      status: 'pending',
    });
    const oldStarted = makeGenerationTask({
      id: 'unused-old-task',
      stepId: 'unused-old-step',
      title: '不应调用的旧代任务',
      status: 'in_progress',
    });
    const oldService = createGenerationService({
      pendingTask: oldPending,
      startedTask: oldStarted,
      startPromise: Promise.resolve(oldStarted),
    });
    const oldTimer = createTimerControllerFixture();

    const newPending = makeGenerationTask({
      id: 'replacement-task',
      stepId: 'replacement-step',
      title: '替代代次任务',
      status: 'pending',
    });
    const newStarted = makeGenerationTask({
      id: 'replacement-task',
      stepId: 'replacement-step',
      title: '替代代次任务',
      status: 'in_progress',
    });
    const newService = createGenerationService({
      pendingTask: newPending,
      startedTask: newStarted,
      startPromise: Promise.resolve(newStarted),
    });
    const newTimer = createTimerControllerFixture();
    const newAppState = createAppStateSourceFixture();
    const onUiCommit = jest.fn<void, [CoreFlowUiCommitKind]>();

    const screen = await render(
      <AuditableCoreFlowScreen
        appStateSource={newAppState.source}
        onUiCommit={onUiCommit}
        service={newService}
        timerController={newTimer.controller}
      />,
    );
    await reachStartButton(screen, newPending.title);
    await fireEvent.press(
      screen.getByRole('button', {name: '开始5分钟'}),
    );
    await flushPromises();

    expect(newService.startRecommended).toHaveBeenCalledTimes(1);
    expect(newTimer.controller.start).toHaveBeenCalledTimes(1);
    expect(screen.getByText('任务：替代代次任务')).toBeTruthy();
    expect(screen.getByText('当前小步：替代代次任务第一步')).toBeTruthy();
    expect(screen.getByText('计时状态：进行中')).toBeTruthy();
    expect(oldService.getState).not.toHaveBeenCalled();
    expect(oldService.chooseRecommended).not.toHaveBeenCalled();
    expect(oldService.startRecommended).not.toHaveBeenCalled();
    expect(oldTimer.controller.start).not.toHaveBeenCalled();
    expect(onUiCommit.mock.calls.map(([kind]) => kind)).toEqual([
      'starting',
      'activeTask',
      'selectedStep',
    ]);

    await screen.unmount();
  });
});
