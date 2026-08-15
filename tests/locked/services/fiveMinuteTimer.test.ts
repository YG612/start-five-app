import {
  DEFAULT_DURATION_MS,
  FiveMinuteTimer,
} from '../../../src/services/fiveMinuteTimer';

const EPOCH = Date.parse('2026-01-02T03:04:05.000Z');

describe('SF-007 five-minute timer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(EPOCH);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('locks the production default to exactly five minutes', () => {
    expect(DEFAULT_DURATION_MS).toBe(300_000);
    const timer = new FiveMinuteTimer({now: () => Date.now()});

    expect(timer.getSnapshot()).toEqual({
      state: 'idle',
      durationMs: 300_000,
      remainingMs: 300_000,
      startedAtMs: null,
      finishedAtMs: null,
    });
    timer.dispose();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects non-positive or non-finite duration %p',
    durationMs => {
      expect(
        () => new FiveMinuteTimer({durationMs, now: () => Date.now()}),
      ).toThrow(expect.objectContaining({code: 'INVALID_TIMER_DURATION'}));
    },
  );

  it('uses the injected duration and fake clock to expire naturally once', () => {
    const onFinish = jest.fn();
    const timer = new FiveMinuteTimer({
      durationMs: 1_000,
      now: () => Date.now(),
      onFinish,
    });

    timer.start();
    expect(timer.getSnapshot()).toMatchObject({
      state: 'running',
      durationMs: 1_000,
      remainingMs: 1_000,
      startedAtMs: EPOCH,
    });

    jest.advanceTimersByTime(400);
    expect(timer.getSnapshot()).toMatchObject({
      state: 'running',
      remainingMs: 600,
    });

    jest.advanceTimersByTime(600);
    expect(timer.getSnapshot()).toEqual({
      state: 'finished',
      durationMs: 1_000,
      remainingMs: 0,
      startedAtMs: EPOCH,
      finishedAtMs: EPOCH + 1_000,
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
    timer.dispose();
  });

  it('excludes paused wall-clock time and resumes from the exact remainder', () => {
    const onFinish = jest.fn();
    const timer = new FiveMinuteTimer({
      durationMs: 1_000,
      now: () => Date.now(),
      onFinish,
    });
    timer.start();
    jest.advanceTimersByTime(250);

    timer.pause();
    expect(timer.getSnapshot()).toMatchObject({state: 'paused', remainingMs: 750});
    jest.advanceTimersByTime(5_000);
    expect(timer.getSnapshot()).toMatchObject({state: 'paused', remainingMs: 750});
    expect(onFinish).not.toHaveBeenCalled();

    timer.resume();
    jest.advanceTimersByTime(749);
    expect(timer.getSnapshot()).toMatchObject({state: 'running', remainingMs: 1});
    jest.advanceTimersByTime(1);
    expect(timer.getSnapshot()).toMatchObject({state: 'finished', remainingMs: 0});
    expect(onFinish).toHaveBeenCalledTimes(1);
    timer.dispose();
  });

  it('counts background time while running and does not duplicate scheduled expiry', () => {
    const onFinish = jest.fn();
    const timer = new FiveMinuteTimer({
      durationMs: 1_000,
      now: () => Date.now(),
      onFinish,
    });
    timer.start();
    jest.advanceTimersByTime(200);

    timer.handleAppState('background');
    timer.handleAppState('background');
    jest.advanceTimersByTime(500);
    timer.handleAppState('active');
    timer.handleAppState('active');

    expect(timer.getSnapshot()).toMatchObject({state: 'running', remainingMs: 300});
    jest.advanceTimersByTime(300);
    expect(timer.getSnapshot()).toMatchObject({state: 'finished', remainingMs: 0});
    expect(onFinish).toHaveBeenCalledTimes(1);
    jest.runOnlyPendingTimers();
    expect(onFinish).toHaveBeenCalledTimes(1);
    timer.dispose();
  });

  it('keeps an explicitly paused timer paused across background/active changes', () => {
    const timer = new FiveMinuteTimer({
      durationMs: 1_000,
      now: () => Date.now(),
    });
    timer.start();
    jest.advanceTimersByTime(100);
    timer.pause();

    timer.handleAppState('background');
    jest.advanceTimersByTime(2_000);
    timer.handleAppState('active');

    expect(timer.getSnapshot()).toMatchObject({state: 'paused', remainingMs: 900});
    timer.dispose();
  });

  it('treats inactive as elapsed running time without auto-pausing or duplicating expiry', () => {
    const onFinish = jest.fn();
    const timer = new FiveMinuteTimer({
      durationMs: 1_000,
      now: () => Date.now(),
      onFinish,
    });
    timer.start();
    jest.advanceTimersByTime(150);

    timer.handleAppState('inactive');
    timer.handleAppState('inactive');
    jest.advanceTimersByTime(600);
    timer.handleAppState('active');

    expect(timer.getSnapshot()).toMatchObject({
      state: 'running',
      remainingMs: 250,
    });
    jest.advanceTimersByTime(250);
    expect(timer.getSnapshot()).toMatchObject({state: 'finished', remainingMs: 0});
    expect(onFinish).toHaveBeenCalledTimes(1);
    jest.runOnlyPendingTimers();
    expect(onFinish).toHaveBeenCalledTimes(1);
    timer.dispose();
  });

  it('makes manual finish and repeated lifecycle calls idempotent', () => {
    const onFinish = jest.fn();
    const timer = new FiveMinuteTimer({
      durationMs: 1_000,
      now: () => Date.now(),
      onFinish,
    });
    timer.start();
    jest.advanceTimersByTime(123);

    timer.finish();
    const firstFinishedSnapshot = timer.getSnapshot();
    timer.finish();
    timer.start();
    timer.resume();
    timer.handleAppState('background');
    timer.handleAppState('active');
    jest.advanceTimersByTime(5_000);

    expect(timer.getSnapshot()).toEqual(firstFinishedSnapshot);
    expect(firstFinishedSnapshot).toMatchObject({
      state: 'finished',
      remainingMs: 0,
      finishedAtMs: EPOCH + 123,
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
    timer.dispose();
  });

  it('clears scheduled work on dispose without completing the session', () => {
    const onFinish = jest.fn();
    const timer = new FiveMinuteTimer({
      durationMs: 1_000,
      now: () => Date.now(),
      onFinish,
    });
    timer.start();
    expect(jest.getTimerCount()).toBeGreaterThan(0);

    timer.dispose();
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(2_000);
    expect(onFinish).not.toHaveBeenCalled();
  });
});
