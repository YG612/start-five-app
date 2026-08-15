import React from 'react';
import {act, fireEvent, render} from '@testing-library/react-native';
import {
  CoreFlowScreen,
  createDefaultCoreFlowTimerController,
  type CoreFlowTimerSnapshot,
} from '../../src/screens/CoreFlowScreen';
import {
  createAppStateSourceFixture,
  createCoreServiceFixture,
} from '../review1/fixtures/reviewFixtures';

const EPOCH = Date.parse('2026-08-04T01:02:03.000Z');

async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('R2-A default timer publication cadence', () => {
  beforeEach(() => {
    jest.useFakeTimers({legacyFakeTimers: false});
    jest.setSystemTime(EPOCH);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('publishes each running second without consumer polling', () => {
    const controller = createDefaultCoreFlowTimerController({
      durationMs: 5_000,
      now: () => Date.now(),
    });
    const listener = jest.fn<void, [CoreFlowTimerSnapshot]>();
    const unsubscribe = controller.subscribe(listener);

    controller.start();
    expect(listener).toHaveBeenLastCalledWith({
      state: 'running',
      durationMs: 5_000,
      remainingMs: 5_000,
    });

    jest.advanceTimersByTime(1_000);
    expect(listener).toHaveBeenLastCalledWith({
      state: 'running',
      durationMs: 5_000,
      remainingMs: 4_000,
    });

    jest.advanceTimersByTime(1_000);
    expect(listener).toHaveBeenLastCalledWith({
      state: 'running',
      durationMs: 5_000,
      remainingMs: 3_000,
    });

    unsubscribe();
    controller.dispose();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('calibrates pause, stops refresh, and resumes per-second publication', () => {
    const controller = createDefaultCoreFlowTimerController({
      durationMs: 5_000,
      now: () => Date.now(),
    });
    const listener = jest.fn<void, [CoreFlowTimerSnapshot]>();
    const unsubscribe = controller.subscribe(listener);

    controller.start();
    jest.advanceTimersByTime(1_250);
    controller.pause();
    expect(listener).toHaveBeenLastCalledWith({
      state: 'paused',
      durationMs: 5_000,
      remainingMs: 3_750,
    });
    expect(jest.getTimerCount()).toBe(0);
    const callsAtPause = listener.mock.calls.length;

    jest.advanceTimersByTime(20_000);
    expect(controller.getSnapshot()).toEqual({
      state: 'paused',
      durationMs: 5_000,
      remainingMs: 3_750,
    });
    expect(listener).toHaveBeenCalledTimes(callsAtPause);

    controller.resume();
    expect(listener).toHaveBeenLastCalledWith({
      state: 'running',
      durationMs: 5_000,
      remainingMs: 3_750,
    });
    expect(jest.getTimerCount()).toBeGreaterThan(0);
    const callsAtResume = listener.mock.calls.length;

    jest.advanceTimersByTime(749);
    expect(listener).toHaveBeenCalledTimes(callsAtResume);

    jest.advanceTimersByTime(1);
    expect(listener).toHaveBeenCalledTimes(callsAtResume + 1);
    expect(listener).toHaveBeenLastCalledWith({
      state: 'running',
      durationMs: 5_000,
      remainingMs: 3_000,
    });

    unsubscribe();
    controller.dispose();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('publishes natural completion once and never recreates refresh work', () => {
    const controller = createDefaultCoreFlowTimerController({
      durationMs: 2_500,
      now: () => Date.now(),
    });
    const listener = jest.fn<void, [CoreFlowTimerSnapshot]>();
    controller.subscribe(listener);
    controller.start();

    jest.advanceTimersByTime(2_500);

    expect(controller.getSnapshot()).toEqual({
      state: 'finished',
      durationMs: 2_500,
      remainingMs: 0,
    });
    expect(
      listener.mock.calls.filter(([snapshot]) => snapshot.state === 'finished'),
    ).toHaveLength(1);
    expect(jest.getTimerCount()).toBe(0);

    const callsAtFinish = listener.mock.calls.length;
    jest.advanceTimersByTime(20_000);
    expect(listener).toHaveBeenCalledTimes(callsAtFinish);
    expect(jest.getTimerCount()).toBe(0);

    controller.dispose();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('dispose cancels a live refresh and prevents later publication', () => {
    const controller = createDefaultCoreFlowTimerController({
      durationMs: 5_000,
      now: () => Date.now(),
    });
    const listener = jest.fn<void, [CoreFlowTimerSnapshot]>();
    controller.subscribe(listener);
    controller.start();

    jest.advanceTimersByTime(1_000);
    const callsBeforeDispose = listener.mock.calls.length;
    controller.dispose();

    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(20_000);
    expect(listener).toHaveBeenCalledTimes(callsBeforeDispose);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('updates the production CoreFlowScreen default path from 05:00 to 04:59', async () => {
    const serviceFixture = createCoreServiceFixture();
    const appStateFixture = createAppStateSourceFixture();
    const screen = await render(
      <CoreFlowScreen
        appStateSource={appStateFixture.source}
        service={serviceFixture.service}
      />,
    );
    await flushPromises();
    expect(screen.getByText('任务：写项目周报')).toBeTruthy();

    await fireEvent.press(
      screen.getByRole('button', {name: '推荐下一项'}),
    );
    await flushPromises();
    expect(screen.getByRole('button', {name: '开始5分钟'})).toBeTruthy();

    await fireEvent.press(
      screen.getByRole('button', {name: '开始5分钟'}),
    );
    await flushPromises();
    expect(screen.getByText('计时状态：进行中')).toBeTruthy();
    expect(screen.getByText('剩余时间：05:00')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(1_000);
      await Promise.resolve();
    });
    expect(screen.getByText('剩余时间：04:59')).toBeTruthy();

    await screen.unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});
