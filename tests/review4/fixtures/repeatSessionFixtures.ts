import type {
  CoreAppService,
  OperationOptions,
} from '../../../src/application/coreAppService';
import type {Task} from '../../../src/domain/task';
import type {
  CoreFlowAppState,
  CoreFlowTimerController,
  CoreFlowTimerSnapshot,
} from '../../../src/screens/CoreFlowScreen';
import {createDefaultCoreFlowTimerController} from '../../../src/screens/CoreFlowScreen';
import {
  makeReviewSubtask,
  makeReviewTask,
  REVIEW_NOW,
} from '../../review1/fixtures/reviewFixtures';

export type RepeatSessionPair = {
  pendingTask: Task;
  startedTask: Task;
  stepCompletedTask: Task;
  completedTask: Task;
};

export function makeRepeatSessionPair(label: string): RepeatSessionPair {
  const taskId = `review4-${label}`;
  const stepId = `${taskId}-step`;
  const pendingStep = makeReviewSubtask({
    id: stepId,
    taskId,
    title: `${label}-step`,
  });
  const completedStep = makeReviewSubtask({
    ...pendingStep,
    status: 'completed',
    completedAt: REVIEW_NOW,
  });
  const common = {
    id: taskId,
    title: `${label}-task`,
  };

  return {
    pendingTask: makeReviewTask({
      ...common,
      status: 'pending',
      startedAt: null,
      subtasks: [pendingStep],
    }),
    startedTask: makeReviewTask({
      ...common,
      status: 'in_progress',
      startedAt: REVIEW_NOW,
      subtasks: [pendingStep],
    }),
    stepCompletedTask: makeReviewTask({
      ...common,
      status: 'in_progress',
      startedAt: REVIEW_NOW,
      subtasks: [completedStep],
    }),
    completedTask: makeReviewTask({
      ...common,
      status: 'completed',
      startedAt: REVIEW_NOW,
      completedAt: REVIEW_NOW,
      subtasks: [completedStep],
    }),
  };
}

type StartMutation = (operation: OperationOptions) => Promise<Task>;
type FinishStepMutation = CoreAppService['finishStep'];
type FinishTaskMutation = CoreAppService['finishTask'];

export function createRepeatService(
  pair: RepeatSessionPair,
  options: {
    startRecommended?: StartMutation;
    finishStep?: FinishStepMutation;
    finishTask?: FinishTaskMutation;
  } = {},
): CoreAppService {
  return {
    createTask: jest.fn(async () => pair.pendingTask),
    addFirstStep: jest.fn(async () => pair.pendingTask),
    chooseRecommended: jest.fn(async () => pair.pendingTask),
    startRecommended:
      options.startRecommended ?? jest.fn(async () => pair.startedTask),
    finishStep:
      options.finishStep ?? jest.fn(async () => pair.stepCompletedTask),
    finishTask:
      options.finishTask ??
      jest.fn(async () => ({task: pair.completedTask, points: 0})),
    getState: jest.fn(async () => ({tasks: [pair.pendingTask], totalScore: 0})),
  };
}

export function createRepeatTimerControllerFixture(options?: {
  durationMs?: number;
}) {
  const durationMs = options?.durationMs ?? 300_000;
  let snapshot: CoreFlowTimerSnapshot = {
    state: 'idle',
    durationMs,
    remainingMs: durationMs,
  };
  let disposed = false;
  const listeners = new Set<
    (nextSnapshot: CoreFlowTimerSnapshot) => void
  >();
  const capturedListeners: Array<
    (nextSnapshot: CoreFlowTimerSnapshot) => void
  > = [];
  const publishedSnapshots: CoreFlowTimerSnapshot[] = [];
  const unsubscribe = jest.fn();

  function publish(nextSnapshot: CoreFlowTimerSnapshot): void {
    if (disposed) {
      return;
    }
    snapshot = nextSnapshot;
    publishedSnapshots.push(nextSnapshot);
    for (const listener of listeners) {
      listener(nextSnapshot);
    }
  }

  const controller: CoreFlowTimerController = {
    getSnapshot: jest.fn(() => snapshot),
    subscribe: jest.fn(listener => {
      if (disposed) {
        return () => undefined;
      }
      listeners.add(listener);
      capturedListeners.push(listener);
      return () => {
        listeners.delete(listener);
        unsubscribe();
      };
    }),
    start: jest.fn(() => {
      if (
        !disposed &&
        (snapshot.state === 'idle' || snapshot.state === 'finished')
      ) {
        publish({state: 'running', durationMs, remainingMs: durationMs});
      }
    }),
    pause: jest.fn(() => {
      if (!disposed && snapshot.state === 'running') {
        publish({...snapshot, state: 'paused'});
      }
    }),
    resume: jest.fn(() => {
      if (!disposed && snapshot.state === 'paused') {
        publish({...snapshot, state: 'running'});
      }
    }),
    handleAppState: jest.fn((_state: CoreFlowAppState) => undefined),
    dispose: jest.fn(() => {
      if (disposed) {
        return;
      }
      disposed = true;
      listeners.clear();
    }),
  };

  return {
    controller,
    publishedSnapshots,
    unsubscribe,
    finishNaturally(): void {
      if (!disposed && snapshot.state === 'running') {
        publish({state: 'finished', durationMs, remainingMs: 0});
      }
    },
    publishCurrent(): void {
      if (!disposed) {
        publish({...snapshot});
      }
    },
    invokeCaptured(nextSnapshot: CoreFlowTimerSnapshot): void {
      for (const listener of capturedListeners) {
        listener(nextSnapshot);
      }
    },
  };
}

/**
 * A stable screen-facing adapter that provisions a fresh public default
 * controller for every accepted session. It intentionally exposes no reset
 * method and does not require production to reuse or replace controllers.
 */
export function createMultiSessionTimerControllerAdapter(options?: {
  durationMs?: number;
}) {
  const durationMs = options?.durationMs ?? 2_500;
  let snapshot: CoreFlowTimerSnapshot = {
    state: 'idle',
    durationMs,
    remainingMs: durationMs,
  };
  let disposed = false;
  let activeController: CoreFlowTimerController | null = null;
  let unsubscribeActive: (() => void) | null = null;
  const listeners = new Set<
    (nextSnapshot: CoreFlowTimerSnapshot) => void
  >();
  const publishedSnapshots: CoreFlowTimerSnapshot[] = [];
  const transitions: Array<{
    from: CoreFlowTimerSnapshot['state'];
    to: CoreFlowTimerSnapshot['state'];
  }> = [];

  function publish(nextSnapshot: CoreFlowTimerSnapshot): void {
    if (disposed) {
      return;
    }
    const previousState = snapshot.state;
    snapshot = nextSnapshot;
    publishedSnapshots.push(nextSnapshot);
    if (previousState !== nextSnapshot.state) {
      transitions.push({from: previousState, to: nextSnapshot.state});
    }
    for (const listener of listeners) {
      listener(nextSnapshot);
    }
  }

  function releaseActiveController(): void {
    unsubscribeActive?.();
    unsubscribeActive = null;
    activeController?.dispose();
    activeController = null;
  }

  const controller: CoreFlowTimerController = {
    getSnapshot: jest.fn(() => snapshot),
    subscribe: jest.fn(listener => {
      if (disposed) {
        return () => undefined;
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }),
    start: jest.fn(() => {
      if (
        disposed ||
        snapshot.state === 'running' ||
        snapshot.state === 'paused'
      ) {
        return;
      }

      releaseActiveController();
      const sessionController = createDefaultCoreFlowTimerController({
        durationMs,
        now: () => Date.now(),
      });
      activeController = sessionController;
      unsubscribeActive = sessionController.subscribe(nextSnapshot => {
        if (activeController === sessionController) {
          publish(nextSnapshot);
        }
      });
      sessionController.start();
    }),
    pause: jest.fn(() => {
      activeController?.pause();
    }),
    resume: jest.fn(() => {
      activeController?.resume();
    }),
    handleAppState: jest.fn((state: CoreFlowAppState) => {
      activeController?.handleAppState(state);
    }),
    dispose: jest.fn(() => {
      if (disposed) {
        return;
      }
      disposed = true;
      listeners.clear();
      releaseActiveController();
    }),
  };

  return {
    controller,
    publishedSnapshots,
    transitions,
  };
}
