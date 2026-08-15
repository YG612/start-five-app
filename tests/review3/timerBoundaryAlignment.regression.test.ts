import {
  createDefaultCoreFlowTimerController,
  type CoreFlowTimerSnapshot,
} from '../../src/screens/CoreFlowScreen';

function lastSnapshot(
  listener: {mock: {calls: Array<[CoreFlowTimerSnapshot]>}},
): CoreFlowTimerSnapshot {
  const lastCall = listener.mock.calls[listener.mock.calls.length - 1];
  if (lastCall === undefined) {
    throw new Error('EXPECTED_TIMER_PUBLICATION');
  }
  return lastCall[0];
}

describe('R3-B visible-second boundary scheduling', () => {
  beforeEach(() => {
    jest.useFakeTimers({legacyFakeTimers: false});
  });

  afterEach(() => {
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });

  it('publishes a 3750 ms start at the next 750 ms visible boundary', () => {
    let nowMs = 0;
    const controller = createDefaultCoreFlowTimerController({
      durationMs: 3_750,
      now: () => nowMs,
    });
    const listener = jest.fn<void, [CoreFlowTimerSnapshot]>();
    controller.subscribe(listener);
    controller.start();
    const callsAtStart = listener.mock.calls.length;

    nowMs = 749;
    jest.advanceTimersByTime(749);
    const callsBeforeBoundary = listener.mock.calls.length;

    nowMs = 750;
    jest.advanceTimersByTime(1);
    const snapshotAtBoundary = lastSnapshot(listener);
    const callsAtBoundary = listener.mock.calls.length;
    const scheduledAfterBoundary = jest.getTimerCount();

    controller.dispose();
    const callsAtDispose = listener.mock.calls.length;
    const scheduledAfterDispose = jest.getTimerCount();
    nowMs = 20_000;
    jest.advanceTimersByTime(20_000);
    const callsAfterDispose = listener.mock.calls.length;

    expect(callsBeforeBoundary).toBe(callsAtStart);
    expect(callsAtBoundary).toBe(callsAtStart + 1);
    expect(snapshotAtBoundary).toEqual({
      state: 'running',
      durationMs: 3_750,
      remainingMs: 3_000,
    });
    expect(scheduledAfterBoundary).toBe(2);
    expect(scheduledAfterDispose).toBe(0);
    expect(callsAfterDispose).toBe(callsAtDispose);
  });

  it('restarts a 3750 ms remainder at its next 750 ms boundary', () => {
    let nowMs = 0;
    const controller = createDefaultCoreFlowTimerController({
      durationMs: 5_000,
      now: () => nowMs,
    });
    const listener = jest.fn<void, [CoreFlowTimerSnapshot]>();
    controller.subscribe(listener);
    controller.start();

    nowMs = 1_250;
    controller.pause();
    const pausedSnapshot = lastSnapshot(listener);
    const scheduledAtPause = jest.getTimerCount();

    nowMs = 10_000;
    controller.resume();
    const resumedSnapshot = lastSnapshot(listener);
    const callsAtResume = listener.mock.calls.length;
    const scheduledAtResume = jest.getTimerCount();

    nowMs = 10_749;
    jest.advanceTimersByTime(749);
    const callsBeforeBoundary = listener.mock.calls.length;

    nowMs = 10_750;
    jest.advanceTimersByTime(1);
    const snapshotAtBoundary = lastSnapshot(listener);
    const callsAtBoundary = listener.mock.calls.length;

    controller.dispose();

    expect(pausedSnapshot).toEqual({
      state: 'paused',
      durationMs: 5_000,
      remainingMs: 3_750,
    });
    expect(scheduledAtPause).toBe(0);
    expect(resumedSnapshot).toEqual({
      state: 'running',
      durationMs: 5_000,
      remainingMs: 3_750,
    });
    expect(scheduledAtResume).toBe(2);
    expect(callsBeforeBoundary).toBe(callsAtResume);
    expect(callsAtBoundary).toBe(callsAtResume + 1);
    expect(snapshotAtBoundary).toEqual({
      state: 'running',
      durationMs: 5_000,
      remainingMs: 3_000,
    });
  });

  it('recalibrates a late callback instead of chaining another fixed second', () => {
    let nowMs = 0;
    const controller = createDefaultCoreFlowTimerController({
      durationMs: 5_000,
      now: () => nowMs,
    });
    const listener = jest.fn<void, [CoreFlowTimerSnapshot]>();
    controller.subscribe(listener);
    controller.start();
    const scheduledAtStart = jest.getTimerCount();

    nowMs = 2_300;
    jest.advanceTimersByTime(1_000);
    const lateSnapshot = lastSnapshot(listener);
    const callsAfterLateCallback = listener.mock.calls.length;
    const scheduledAfterLateCallback = jest.getTimerCount();

    nowMs = 2_999;
    jest.advanceTimersByTime(699);
    const callsBeforeRecalibratedBoundary = listener.mock.calls.length;

    nowMs = 3_000;
    jest.advanceTimersByTime(1);
    const recalibratedSnapshot = lastSnapshot(listener);
    const callsAtRecalibratedBoundary = listener.mock.calls.length;
    const scheduledAfterRecalibratedBoundary = jest.getTimerCount();

    controller.dispose();

    expect(scheduledAtStart).toBe(2);
    expect(lateSnapshot).toEqual({
      state: 'running',
      durationMs: 5_000,
      remainingMs: 2_700,
    });
    expect(scheduledAfterLateCallback).toBe(2);
    expect(callsBeforeRecalibratedBoundary).toBe(callsAfterLateCallback);
    expect(callsAtRecalibratedBoundary).toBe(
      callsAfterLateCallback + 1,
    );
    expect(recalibratedSnapshot).toEqual({
      state: 'running',
      durationMs: 5_000,
      remainingMs: 2_000,
    });
    expect(scheduledAfterRecalibratedBoundary).toBe(2);
  });

  it('publishes natural finish once and leaves no refresh work', () => {
    let nowMs = 0;
    const controller = createDefaultCoreFlowTimerController({
      durationMs: 3_200,
      now: () => nowMs,
    });
    const listener = jest.fn<void, [CoreFlowTimerSnapshot]>();
    controller.subscribe(listener);
    controller.start();

    nowMs = 200;
    jest.advanceTimersByTime(200);
    nowMs = 3_200;
    jest.advanceTimersByTime(3_000);
    const finishedCalls = listener.mock.calls.filter(
      ([snapshot]) => snapshot.state === 'finished',
    ).length;
    const finalSnapshot = controller.getSnapshot();
    const callsAtFinish = listener.mock.calls.length;
    const scheduledAtFinish = jest.getTimerCount();

    nowMs = 20_000;
    jest.advanceTimersByTime(20_000);
    const callsLongAfterFinish = listener.mock.calls.length;
    controller.dispose();

    expect(finishedCalls).toBe(1);
    expect(finalSnapshot).toEqual({
      state: 'finished',
      durationMs: 3_200,
      remainingMs: 0,
    });
    expect(scheduledAtFinish).toBe(0);
    expect(callsLongAfterFinish).toBe(callsAtFinish);
  });

  it('dispose removes the sole refresh and finish work without later publication', () => {
    let nowMs = 0;
    const controller = createDefaultCoreFlowTimerController({
      durationMs: 3_750,
      now: () => nowMs,
    });
    const listener = jest.fn<void, [CoreFlowTimerSnapshot]>();
    controller.subscribe(listener);
    controller.start();
    const scheduledWhileRunning = jest.getTimerCount();
    const callsBeforeDispose = listener.mock.calls.length;

    controller.dispose();
    const scheduledAfterDispose = jest.getTimerCount();
    nowMs = 100_000;
    jest.advanceTimersByTime(100_000);
    const callsAfterDispose = listener.mock.calls.length;

    expect(scheduledWhileRunning).toBe(2);
    expect(scheduledAfterDispose).toBe(0);
    expect(callsAfterDispose).toBe(callsBeforeDispose);
  });
});
