import {
  createDefaultCoreFlowTimerController,
  type CoreFlowTimerSnapshot,
} from '../../src/screens/CoreFlowScreen';

const EPOCH = Date.parse('2026-08-04T04:00:00.000Z');

function finishedPublications(
  listener: {mock: {calls: Array<[CoreFlowTimerSnapshot]>}},
): number {
  return listener.mock.calls.filter(
    ([snapshot]) => snapshot.state === 'finished',
  ).length;
}

describe('R4-C replacement-safe timer lifecycle contract', () => {
  beforeEach(() => {
    jest.useFakeTimers({legacyFakeTimers: false});
    jest.setSystemTime(EPOCH);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('supports two consecutive natural sessions through the public factory with one finish publication and no work per session', () => {
    const finishCounts: number[] = [];
    const timerCounts: number[] = [];

    for (let session = 0; session < 2; session += 1) {
      const controller = createDefaultCoreFlowTimerController({
        durationMs: 2_500,
        now: () => Date.now(),
      });
      const listener = jest.fn<void, [CoreFlowTimerSnapshot]>();
      controller.subscribe(listener);

      controller.start();
      jest.advanceTimersByTime(2_500);
      finishCounts.push(finishedPublications(listener));
      timerCounts.push(jest.getTimerCount());

      controller.dispose();
      expect(jest.getTimerCount()).toBe(0);
      jest.advanceTimersByTime(5_000);
      expect(finishedPublications(listener)).toBe(1);
    }

    expect(finishCounts).toEqual([1, 1]);
    expect(timerCounts).toEqual([0, 0]);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('keeps the 3750-to-3000 visible boundary when the next session uses a fresh controller', () => {
    const firstController = createDefaultCoreFlowTimerController({
      durationMs: 1_000,
      now: () => Date.now(),
    });
    firstController.start();
    jest.advanceTimersByTime(1_000);
    expect(firstController.getSnapshot().state).toBe('finished');
    firstController.dispose();
    expect(jest.getTimerCount()).toBe(0);

    const nextController = createDefaultCoreFlowTimerController({
      durationMs: 5_000,
      now: () => Date.now(),
    });
    const listener = jest.fn<void, [CoreFlowTimerSnapshot]>();
    nextController.subscribe(listener);
    nextController.start();
    jest.advanceTimersByTime(1_250);
    nextController.pause();
    expect(listener).toHaveBeenLastCalledWith({
      state: 'paused',
      durationMs: 5_000,
      remainingMs: 3_750,
    });

    nextController.resume();
    const callsAtResume = listener.mock.calls.length;
    jest.advanceTimersByTime(749);
    expect(listener).toHaveBeenCalledTimes(callsAtResume);
    jest.advanceTimersByTime(1);
    expect(listener).toHaveBeenLastCalledWith({
      state: 'running',
      durationMs: 5_000,
      remainingMs: 3_000,
    });

    nextController.dispose();
    expect(jest.getTimerCount()).toBe(0);
  });
});
