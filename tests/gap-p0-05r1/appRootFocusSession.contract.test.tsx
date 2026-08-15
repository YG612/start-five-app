import React from 'react';
import {
  act,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react-native';
import {createStartFiveApp} from '../../src/app/startFiveApp';
import {
  AppIntegrationBackend,
  FOCUS_SESSION_STORAGE_KEY,
  flushMicrotasks,
  makeAppTask,
  ManualIsoClock,
  P0_05_STARTED_AT,
  P0_05_TASK_ID,
  P0_05_TASK_TITLE,
  readTaskFocusHistory,
  seedAppTask,
  seedRunningFocus,
  SequenceIds,
  TASK_STORAGE_KEY,
} from './gapP005TestKit';

const RECOMMEND_BUTTON = '推荐下一项';
const START_BUTTON = '开始5分钟';
const INTERRUPT_BUTTON = '中断专注';
const RUNNING_TEXT = '计时状态：进行中';

type Screen = Awaited<ReturnType<typeof render>>;

async function flushUi(turns = 60): Promise<void> {
  await act(async () => {
    await flushMicrotasks(turns);
  });
}

async function renderReadyApp(
  backend: AppIntegrationBackend,
  clock: ManualIsoClock,
  ids: SequenceIds,
): Promise<{
  readonly screen: Screen;
  readonly composition: ReturnType<typeof createStartFiveApp>;
}> {
  const composition = createStartFiveApp({
    storageBackend: backend,
    now: clock.now,
    idGenerator: ids.next,
  });
  const screen = await render(React.createElement(composition.AppRoot));
  await waitFor(() =>
    expect(screen.getByText(`任务：${P0_05_TASK_TITLE}`)).toBeTruthy(),
  );
  return {screen, composition};
}

async function chooseRecommendation(screen: Screen): Promise<void> {
  await fireEvent.press(
    screen.getByRole('button', {name: RECOMMEND_BUTTON}),
  );
  await waitFor(() =>
    expect(screen.getByText(`推荐：${P0_05_TASK_TITLE}`)).toBeTruthy(),
  );
}

describe('GAP-P0-05 real AppRoot focus-session integration', () => {
  it('constructs one app composition and root element with zero backend or dependency I/O', () => {
    const backend = new AppIntegrationBackend();
    const clock = new ManualIsoClock();
    const ids = new SequenceIds(['must-not-consume']);

    const composition = createStartFiveApp({
      storageBackend: backend,
      now: clock.now,
      idGenerator: ids.next,
    });
    const root = React.createElement(composition.AppRoot);

    expect(React.isValidElement(root)).toBe(true);
    expect({
      reads: backend.getCalls,
      writes: backend.setAttempts,
      removes: backend.removeAttempts,
      clock: clock.calls,
      ids: ids.calls,
    }).toEqual({reads: [], writes: [], removes: [], clock: 0, ids: 0});
  });

  it('persists exactly one task-bound five-minute session on the injected backend before showing running', async () => {
    const backend = new AppIntegrationBackend();
    seedAppTask(backend);
    const clock = new ManualIsoClock();
    const ids = new SequenceIds(['gap-p0-05-focus-start']);
    const {screen} = await renderReadyApp(backend, clock, ids);

    try {
      await chooseRecommendation(screen);
      const gate = backend.delayNextSetFor(FOCUS_SESSION_STORAGE_KEY);
      const start = screen.getByRole('button', {name: START_BUTTON});
      await fireEvent.press(start);
      await fireEvent.press(start);
      await flushMicrotasks();

      const enteredBeforeRelease = gate.entered;
      const runningBeforeCommit = screen.queryByText(RUNNING_TEXT);
      gate.release();
      await flushUi();

      expect(enteredBeforeRelease).toBe(1);
      expect(runningBeforeCommit).toBeNull();

      const sessions = await readTaskFocusHistory(backend);
      expect(sessions).toEqual([
        expect.objectContaining({
          id: 'gap-p0-05-focus-start',
          taskId: P0_05_TASK_ID,
          plannedMinutes: 5,
          status: 'running',
          startedAt: P0_05_STARTED_AT,
          plannedEndAt: '2026-08-09T08:05:00.000Z',
        }),
      ]);
      expect(screen.getByText(RUNNING_TEXT)).toBeTruthy();
      expect(backend.getCalls).toContain(TASK_STORAGE_KEY);
      expect(backend.setAttempts.map(call => call.key)).toContain(
        FOCUS_SESSION_STORAGE_KEY,
      );
      expect(backend.committedSetCount(FOCUS_SESSION_STORAGE_KEY)).toBe(1);
      expect(ids.calls).toBe(1);
    } finally {
      await screen.unmount();
    }
  });

  it('restores the same byte-persisted session and derives three minutes remaining after restart', async () => {
    const seeded = new AppIntegrationBackend();
    seedAppTask(
      seeded,
      makeAppTask({
        status: 'in_progress',
        startedAt: P0_05_STARTED_AT,
      }),
    );
    const session = await seedRunningFocus(seeded, {
      sessionId: 'gap-p0-05-focus-restart',
    });
    const persistedFocusBytes = seeded.raw(FOCUS_SESSION_STORAGE_KEY);
    const restarted = seeded.byteRestart();
    const clock = new ManualIsoClock('2026-08-09T08:02:00.000Z');
    const ids = new SequenceIds(['restart-id-must-not-consume']);
    const {screen} = await renderReadyApp(restarted, clock, ids);

    try {
      await waitFor(() => expect(screen.getByText(RUNNING_TEXT)).toBeTruthy());
      expect(screen.getByText('剩余时间：03:00')).toBeTruthy();
      const sessions = await readTaskFocusHistory(restarted);
      expect(sessions).toEqual([session]);
      expect(restarted.raw(FOCUS_SESSION_STORAGE_KEY)).toBe(persistedFocusBytes);
      expect(ids.calls).toBe(0);
      expect(clock.calls).toBe(1);
    } finally {
      await screen.unmount();
    }
  });

  it('completes an expired durable session exactly once across repeated AppRoot hydration', async () => {
    const seeded = new AppIntegrationBackend();
    seedAppTask(
      seeded,
      makeAppTask({
        status: 'in_progress',
        startedAt: P0_05_STARTED_AT,
      }),
    );
    const running = await seedRunningFocus(seeded, {
      sessionId: 'gap-p0-05-focus-expiry',
    });
    const backend = seeded.byteRestart();
    const clock = new ManualIsoClock(running.plannedEndAt);
    const ids = new SequenceIds(['expiry-id-must-not-consume']);

    const first = await renderReadyApp(backend, clock, ids);
    try {
      await flushUi(100);
      const afterFirstHydration = await readTaskFocusHistory(backend);
      expect(afterFirstHydration).toEqual([
        {
          ...running,
          status: 'completed',
          endedAt: running.plannedEndAt,
          actualSeconds: 300,
          updatedAt: running.plannedEndAt,
        },
      ]);
      expect(backend.committedSetCount(FOCUS_SESSION_STORAGE_KEY)).toBe(1);
    } finally {
      await first.screen.unmount();
    }

    const second = await renderReadyApp(backend, clock, ids);
    try {
      await flushUi(100);
      expect(await readTaskFocusHistory(backend)).toEqual([
        expect.objectContaining({
          id: running.id,
          status: 'completed',
          endedAt: running.plannedEndAt,
          actualSeconds: 300,
        }),
      ]);
      expect(backend.committedSetCount(FOCUS_SESSION_STORAGE_KEY)).toBe(1);
      expect(ids.calls).toBe(0);
    } finally {
      await second.screen.unmount();
    }
  });

  it('persists interruption and permits one later session without reviving the old record', async () => {
    const seeded = new AppIntegrationBackend();
    seedAppTask(
      seeded,
      makeAppTask({
        status: 'in_progress',
        startedAt: P0_05_STARTED_AT,
      }),
    );
    const original = await seedRunningFocus(seeded, {
      sessionId: 'gap-p0-05-focus-interrupted',
    });
    const backend = seeded.byteRestart();
    const clock = new ManualIsoClock('2026-08-09T08:01:00.000Z');
    const ids = new SequenceIds(['gap-p0-05-focus-reopened']);
    const {screen} = await renderReadyApp(backend, clock, ids);

    try {
      await waitFor(() => expect(screen.getByText(RUNNING_TEXT)).toBeTruthy());
      await fireEvent.press(
        screen.getByRole('button', {name: INTERRUPT_BUTTON}),
      );
      await flushUi();

      const afterInterrupt = await readTaskFocusHistory(backend);
      expect(afterInterrupt).toEqual([
        expect.objectContaining({
          id: original.id,
          status: 'interrupted',
          endedAt: '2026-08-09T08:01:00.000Z',
          interruptionReason: expect.any(String),
        }),
      ]);

      await chooseRecommendation(screen);
      clock.set('2026-08-09T08:02:00.000Z');
      await fireEvent.press(
        screen.getByRole('button', {name: START_BUTTON}),
      );
      await flushUi();

      const finalSessions = await readTaskFocusHistory(backend);
      expect(finalSessions).toHaveLength(2);
      expect(finalSessions).toEqual(
        expect.arrayContaining([
          afterInterrupt[0],
          expect.objectContaining({
            id: 'gap-p0-05-focus-reopened',
            taskId: P0_05_TASK_ID,
            plannedMinutes: 5,
            status: 'running',
          }),
        ]),
      );
      expect(finalSessions.filter(session => session.status === 'running')).toHaveLength(1);
      expect(screen.getByText(RUNNING_TEXT)).toBeTruthy();
      expect(ids.calls).toBe(1);
    } finally {
      await screen.unmount();
    }
  });

  it('keeps task-first and focus-persist failures non-running and retryable on fresh backends', async () => {
    const summarize = async (backend: AppIntegrationBackend) =>
      (await readTaskFocusHistory(backend)).map(session => ({
        id: session.id,
        taskId: session.taskId,
        plannedMinutes: session.plannedMinutes,
        status: session.status,
      }));
    const retryIsEnabled = (screen: Screen): boolean => {
      const retry = screen.queryByRole('button', {name: START_BUTTON});
      return (
        retry !== null &&
        retry.props.disabled !== true &&
        retry.props.accessibilityState?.disabled !== true
      );
    };

    const taskFailureBackend = new AppIntegrationBackend();
    seedAppTask(taskFailureBackend);
    const taskBytesBeforeFailure = taskFailureBackend.raw(TASK_STORAGE_KEY);
    const taskFailureClock = new ManualIsoClock();
    const taskFailureIds = new SequenceIds([
      'gap-p0-05-task-failure-retry-focus',
    ]);
    const taskFailureApp = await renderReadyApp(
      taskFailureBackend,
      taskFailureClock,
      taskFailureIds,
    );
    let taskFailureObservation: unknown;
    try {
      await chooseRecommendation(taskFailureApp.screen);
      taskFailureBackend.failNextSetFor(
        TASK_STORAGE_KEY,
        new Error('GAP_P0_05_TASK_WRITE_FAILED'),
      );
      await fireEvent.press(
        taskFailureApp.screen.getByRole('button', {name: START_BUTTON}),
      );
      await flushUi(100);

      const afterFailure = {
        failedKeys: taskFailureBackend.failedSets.map(call => call.key),
        taskBytesUnchanged:
          taskFailureBackend.raw(TASK_STORAGE_KEY) === taskBytesBeforeFailure,
        taskStatus:
          (await taskFailureApp.composition.service.getState()).tasks[0]
            ?.status ?? null,
        focusRawAbsent:
          taskFailureBackend.raw(FOCUS_SESSION_STORAGE_KEY) === null,
        focusSessions: await summarize(taskFailureBackend),
        runningVisible:
          taskFailureApp.screen.queryByText(RUNNING_TEXT) !== null,
        errorVisible:
          taskFailureApp.screen.queryByText('TASK_STORAGE_WRITE_FAILED') !==
          null,
        retryEnabled: retryIsEnabled(taskFailureApp.screen),
      };

      const retry = taskFailureApp.screen.queryByRole('button', {
        name: START_BUTTON,
      });
      if (retry !== null) {
        await fireEvent.press(retry);
      }
      await flushUi(100);
      taskFailureObservation = {
        afterFailure,
        afterRetry: {
          taskStatus:
            (await taskFailureApp.composition.service.getState()).tasks[0]
              ?.status ?? null,
          taskCommittedWrites:
            taskFailureBackend.committedSetCount(TASK_STORAGE_KEY),
          focusCommittedWrites: taskFailureBackend.committedSetCount(
            FOCUS_SESSION_STORAGE_KEY,
          ),
          focusSessions: await summarize(taskFailureBackend),
          focusIdCalls: taskFailureIds.calls,
          runningVisible:
            taskFailureApp.screen.queryByText(RUNNING_TEXT) !== null,
        },
      };
    } finally {
      await taskFailureApp.screen.unmount();
    }

    const focusFailureBackend = new AppIntegrationBackend();
    seedAppTask(focusFailureBackend);
    const focusTaskBytesBeforeFailure = focusFailureBackend.raw(TASK_STORAGE_KEY);
    const focusFailureClock = new ManualIsoClock();
    const focusFailureIds = new SequenceIds([
      'gap-p0-05-focus-failed-attempt',
      'gap-p0-05-focus-retry',
    ]);
    const focusFailureApp = await renderReadyApp(
      focusFailureBackend,
      focusFailureClock,
      focusFailureIds,
    );
    let focusFailureObservation: unknown;
    try {
      await chooseRecommendation(focusFailureApp.screen);
      focusFailureBackend.failNextSetFor(
        FOCUS_SESSION_STORAGE_KEY,
        new Error('GAP_P0_05_FOCUS_WRITE_FAILED'),
      );
      await fireEvent.press(
        focusFailureApp.screen.getByRole('button', {name: START_BUTTON}),
      );
      await flushUi(100);

      const taskBytesAfterFailure = focusFailureBackend.raw(TASK_STORAGE_KEY);
      const afterFailure = {
        failedKeys: focusFailureBackend.failedSets.map(call => call.key),
        taskBytesChanged:
          taskBytesAfterFailure !== focusTaskBytesBeforeFailure,
        taskStatus:
          (await focusFailureApp.composition.service.getState()).tasks[0]
            ?.status ?? null,
        taskCommittedWrites:
          focusFailureBackend.committedSetCount(TASK_STORAGE_KEY),
        focusRawAbsent:
          focusFailureBackend.raw(FOCUS_SESSION_STORAGE_KEY) === null,
        focusSessions: await summarize(focusFailureBackend),
        runningVisible:
          focusFailureApp.screen.queryByText(RUNNING_TEXT) !== null,
        errorVisible:
          focusFailureApp.screen.queryByText(
            'FOCUS_SESSION_STORAGE_WRITE_FAILED',
          ) !== null,
        retryEnabled: retryIsEnabled(focusFailureApp.screen),
      };

      const retry = focusFailureApp.screen.queryByRole('button', {
        name: START_BUTTON,
      });
      if (retry !== null) {
        await fireEvent.press(retry);
      }
      await flushUi(100);
      focusFailureObservation = {
        afterFailure,
        afterRetry: {
          taskBytesUnchanged:
            focusFailureBackend.raw(TASK_STORAGE_KEY) ===
            taskBytesAfterFailure,
          taskStatus:
            (await focusFailureApp.composition.service.getState()).tasks[0]
              ?.status ?? null,
          taskCommittedWrites:
            focusFailureBackend.committedSetCount(TASK_STORAGE_KEY),
          focusCommittedWrites: focusFailureBackend.committedSetCount(
            FOCUS_SESSION_STORAGE_KEY,
          ),
          focusSessions: await summarize(focusFailureBackend),
          focusIdCalls: focusFailureIds.calls,
          runningVisible:
            focusFailureApp.screen.queryByText(RUNNING_TEXT) !== null,
        },
      };
    } finally {
      await focusFailureApp.screen.unmount();
    }

    expect({taskFailureObservation, focusFailureObservation}).toEqual({
      taskFailureObservation: {
        afterFailure: {
          failedKeys: [TASK_STORAGE_KEY],
          taskBytesUnchanged: true,
          taskStatus: 'pending',
          focusRawAbsent: true,
          focusSessions: [],
          runningVisible: false,
          errorVisible: true,
          retryEnabled: true,
        },
        afterRetry: {
          taskStatus: 'in_progress',
          taskCommittedWrites: 1,
          focusCommittedWrites: 1,
          focusSessions: [
            {
              id: 'gap-p0-05-task-failure-retry-focus',
              taskId: P0_05_TASK_ID,
              plannedMinutes: 5,
              status: 'running',
            },
          ],
          focusIdCalls: 1,
          runningVisible: true,
        },
      },
      focusFailureObservation: {
        afterFailure: {
          failedKeys: [FOCUS_SESSION_STORAGE_KEY],
          taskBytesChanged: true,
          taskStatus: 'in_progress',
          taskCommittedWrites: 1,
          focusRawAbsent: true,
          focusSessions: [],
          runningVisible: false,
          errorVisible: true,
          retryEnabled: true,
        },
        afterRetry: {
          taskBytesUnchanged: true,
          taskStatus: 'in_progress',
          taskCommittedWrites: 1,
          focusCommittedWrites: 1,
          focusSessions: [
            {
              id: 'gap-p0-05-focus-retry',
              taskId: P0_05_TASK_ID,
              plannedMinutes: 5,
              status: 'running',
            },
          ],
          focusIdCalls: 2,
          runningVisible: true,
        },
      },
    });
  });
});
