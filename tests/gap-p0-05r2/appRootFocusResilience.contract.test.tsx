import React from 'react';
import {
  act,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react-native';
import {
  createStartFiveApp,
  type StartFiveAppDependencies,
} from '../../src/app/startFiveApp';
import {
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
} from '../gap-p0-05r1/gapP005TestKit';
import {
  type FocusRuntimeClock,
  ManualFocusRuntimeClock,
  R2IntegrationBackend,
} from './gapP005R2TestKit';

const FINISH_TASK_BUTTON = '完成任务';
const INTERRUPT_BUTTON = '中断专注';
const RETRY_RESTORE_BUTTON = '重试恢复专注';
const RETRY_FINISH_BUTTON = '重试结束专注';
const RUNNING_TEXT = '计时状态：进行中';
const FINISHED_TEXT = '计时状态：已结束';

type Screen = Awaited<ReturnType<typeof render>>;
type FocusClockDependencies = StartFiveAppDependencies &
  Readonly<{focusRuntimeClock: FocusRuntimeClock}>;

async function flushUi(turns = 100): Promise<void> {
  await act(async () => {
    await flushMicrotasks(turns);
  });
}

async function renderReadyApp(
  backend: R2IntegrationBackend,
  clock: ManualIsoClock,
  ids: SequenceIds,
  focusRuntimeClock: ManualFocusRuntimeClock,
): Promise<{
  readonly screen: Screen;
  readonly composition: ReturnType<typeof createStartFiveApp>;
}> {
  const dependencies: FocusClockDependencies = {
    storageBackend: backend,
    now: clock.now,
    idGenerator: ids.next,
    focusRuntimeClock,
  };
  const composition = createStartFiveApp(dependencies);
  const screen = await render(React.createElement(composition.AppRoot));
  await waitFor(() =>
    expect(screen.getByText(`任务：${P0_05_TASK_TITLE}`)).toBeTruthy(),
  );
  return {screen, composition};
}

function enabledButton(screen: Screen, name: string): boolean {
  const button = screen.queryByRole('button', {name});
  return (
    button !== null &&
    button.props.disabled !== true &&
    button.props.accessibilityState?.disabled !== true
  );
}

describe('GAP-P0-05R2 real AppRoot focus resilience', () => {
  it('recovers read and corrupt restore failures while a newer public retry wins over a late old restore', async () => {
    const healthySeed = new R2IntegrationBackend();
    seedAppTask(
      healthySeed,
      makeAppTask({
        status: 'in_progress',
        startedAt: P0_05_STARTED_AT,
      }),
    );
    await seedRunningFocus(healthySeed, {
      sessionId: 'gap-p0-05r2-latest-restore',
    });
    const healthyFocusBytes = healthySeed.raw(FOCUS_SESSION_STORAGE_KEY);

    const staleSeed = new R2IntegrationBackend();
    await seedRunningFocus(staleSeed, {
      sessionId: 'gap-p0-05r2-stale-restore',
      startedAt: '2026-08-09T07:59:00.000Z',
    });
    const staleFocusBytes = staleSeed.raw(FOCUS_SESSION_STORAGE_KEY);
    if (healthyFocusBytes === null || staleFocusBytes === null) {
      throw new Error('GAP_P0_05R2_FIXTURE_FOCUS_BYTES_MISSING');
    }

    const staleBackend = healthySeed.byteRestartR2();
    const staleGate = staleBackend.delayNextGetFor(
      FOCUS_SESSION_STORAGE_KEY,
      staleFocusBytes,
    );
    const staleClock = new ManualIsoClock('2026-08-09T08:02:00.000Z');
    const staleIds = new SequenceIds(['restore-must-not-consume-id']);
    const staleRuntimeClock = new ManualFocusRuntimeClock(
      '2026-08-09T08:02:00.000Z',
    );
    const staleApp = await renderReadyApp(
      staleBackend,
      staleClock,
      staleIds,
      staleRuntimeClock,
    );
    let beforeOldRelease: unknown;
    let afterOldRelease: unknown;
    try {
      await flushUi(160);
      const retry = staleApp.screen.queryByRole('button', {
        name: RETRY_RESTORE_BUTTON,
      });
      const retryEnabledWhilePending = enabledButton(
        staleApp.screen,
        RETRY_RESTORE_BUTTON,
      );
      if (retry !== null) {
        await fireEvent.press(retry);
      }
      await flushUi(240);
      beforeOldRelease = {
        oldReadEntered: staleGate.entered,
        retryEnabledWhilePending,
        focusReadAttempts: staleBackend.getCalls.filter(
          key => key === FOCUS_SESSION_STORAGE_KEY,
        ).length,
        runningVisible:
          staleApp.screen.queryByText(RUNNING_TEXT) !== null,
        healthyRemainingVisible:
          staleApp.screen.queryByText('剩余时间：03:00') !== null,
        staleRemainingVisible:
          staleApp.screen.queryByText('剩余时间：02:00') !== null,
      };

      staleGate.release();
      await flushUi(240);
      afterOldRelease = {
        runningVisible:
          staleApp.screen.queryByText(RUNNING_TEXT) !== null,
        healthyRemainingVisible:
          staleApp.screen.queryByText('剩余时间：03:00') !== null,
        staleRemainingVisible:
          staleApp.screen.queryByText('剩余时间：02:00') !== null,
        restoreErrorVisible:
          staleApp.screen.queryByText('FOCUS_SESSION_SNAPSHOT_CORRUPT') !==
          null,
        focusBytesUnchanged:
          staleBackend.raw(FOCUS_SESSION_STORAGE_KEY) === healthyFocusBytes,
        ids: staleIds.calls,
      };
    } finally {
      staleGate.release();
      await flushUi(160);
      await staleApp.screen.unmount();
    }

    const exerciseFailure = async (kind: 'read' | 'corrupt') => {
      const seeded = new R2IntegrationBackend();
      seedAppTask(
        seeded,
        makeAppTask({
          status: 'in_progress',
          startedAt: P0_05_STARTED_AT,
        }),
      );
      const running = await seedRunningFocus(seeded, {
        sessionId: `gap-p0-05r2-${kind}-restore`,
      });
      const healthyBytes = seeded.raw(FOCUS_SESSION_STORAGE_KEY);
      if (healthyBytes === null) {
        throw new Error('GAP_P0_05R2_FIXTURE_FOCUS_BYTES_MISSING');
      }
      const backend = seeded.byteRestartR2();
      const expectedError =
        kind === 'read'
          ? 'FOCUS_SESSION_STORAGE_READ_FAILED'
          : 'FOCUS_SESSION_SNAPSHOT_CORRUPT';
      if (kind === 'read') {
        backend.failNextGetFor(
          FOCUS_SESSION_STORAGE_KEY,
          new Error('GAP_P0_05R2_FOCUS_GET_FAILED'),
        );
      } else {
        backend.seed(FOCUS_SESSION_STORAGE_KEY, '{"schema":');
      }
      const clock = new ManualIsoClock('2026-08-09T08:02:00.000Z');
      const ids = new SequenceIds(['restore-must-not-consume-id']);
      const runtimeClock = new ManualFocusRuntimeClock(
        '2026-08-09T08:02:00.000Z',
      );
      const app = await renderReadyApp(backend, clock, ids, runtimeClock);
      try {
        await flushUi(160);
        const afterFailure = {
          errorVisible: app.screen.queryByText(expectedError) !== null,
          retryEnabled: enabledButton(app.screen, RETRY_RESTORE_BUTTON),
          runningVisible: app.screen.queryByText(RUNNING_TEXT) !== null,
          failedGets: [...backend.failedGets],
        };
        backend.seed(FOCUS_SESSION_STORAGE_KEY, healthyBytes);
        const retry = app.screen.queryByRole('button', {
          name: RETRY_RESTORE_BUTTON,
        });
        if (retry !== null) {
          await fireEvent.press(retry);
        }
        await flushUi(240);
        return {
          afterFailure,
          recovered: {
            runningVisible: app.screen.queryByText(RUNNING_TEXT) !== null,
            healthyRemainingVisible:
              app.screen.queryByText('剩余时间：03:00') !== null,
            errorCleared: app.screen.queryByText(expectedError) === null,
            sessions: (await readTaskFocusHistory(backend)).map(session => ({
              id: session.id,
              status: session.status,
            })),
            ids: ids.calls,
          },
          expectedSessionId: running.id,
        };
      } finally {
        await app.screen.unmount();
      }
    };

    const read = await exerciseFailure('read');
    const corrupt = await exerciseFailure('corrupt');

    expect({beforeOldRelease, afterOldRelease}).toEqual({
      beforeOldRelease: {
        oldReadEntered: 1,
        retryEnabledWhilePending: true,
        focusReadAttempts: 2,
        runningVisible: true,
        healthyRemainingVisible: true,
        staleRemainingVisible: false,
      },
      afterOldRelease: {
        runningVisible: true,
        healthyRemainingVisible: true,
        staleRemainingVisible: false,
        restoreErrorVisible: false,
        focusBytesUnchanged: true,
        ids: 0,
      },
    });
    for (const observation of [read, corrupt]) {
      expect(observation.afterFailure).toEqual({
        errorVisible: true,
        retryEnabled: true,
        runningVisible: false,
        failedGets:
          observation === read ? [FOCUS_SESSION_STORAGE_KEY] : [],
      });
      expect(observation.recovered).toEqual({
        runningVisible: true,
        healthyRemainingVisible: true,
        errorCleared: true,
        sessions: [
          {id: observation.expectedSessionId, status: 'running'},
        ],
        ids: 0,
      });
    }
  });

  it('keeps a failed deadline finish durable-running and explicitly retries exactly one completion', async () => {
    const seeded = new R2IntegrationBackend();
    seedAppTask(
      seeded,
      makeAppTask({
        status: 'in_progress',
        startedAt: P0_05_STARTED_AT,
      }),
    );
    const running = await seedRunningFocus(seeded, {
      sessionId: 'gap-p0-05r2-deadline-retry',
    });
    const backend = seeded.byteRestartR2();
    const beforeDeadline = '2026-08-09T08:04:59.000Z';
    const clock = new ManualIsoClock(beforeDeadline);
    const ids = new SequenceIds(['deadline-must-not-consume-id']);
    const runtimeClock = new ManualFocusRuntimeClock(beforeDeadline);
    const {screen} = await renderReadyApp(
      backend,
      clock,
      ids,
      runtimeClock,
    );

    try {
      await waitFor(() => expect(screen.getByText(RUNNING_TEXT)).toBeTruthy());
      const bytesBeforeFailure = backend.raw(FOCUS_SESSION_STORAGE_KEY);
      backend.failNextSetFor(
        FOCUS_SESSION_STORAGE_KEY,
        new Error('GAP_P0_05R2_DEADLINE_WRITE_FAILED'),
      );

      clock.set(running.plannedEndAt);
      await act(async () => {
        runtimeClock.publishAt(running.plannedEndAt);
        await flushMicrotasks(160);
      });

      const afterFailure = {
        subscribers: runtimeClock.subscriberCount,
        failedKeys: backend.failedSets.map(call => call.key),
        committedWrites: backend.committedSetCount(
          FOCUS_SESSION_STORAGE_KEY,
        ),
        bytesUnchanged:
          backend.raw(FOCUS_SESSION_STORAGE_KEY) === bytesBeforeFailure,
        runningVisible: screen.queryByText(RUNNING_TEXT) !== null,
        finishedVisible: screen.queryByText(FINISHED_TEXT) !== null,
        errorVisible:
          screen.queryByText('FOCUS_SESSION_STORAGE_WRITE_FAILED') !== null,
        retryEnabled: enabledButton(screen, RETRY_FINISH_BUTTON),
      };

      const retry = screen.queryByRole('button', {name: RETRY_FINISH_BUTTON});
      if (retry !== null) {
        await fireEvent.press(retry);
      }
      await flushUi(160);
      const afterRetry = {
        committedWrites: backend.committedSetCount(
          FOCUS_SESSION_STORAGE_KEY,
        ),
        sessions: (await readTaskFocusHistory(backend)).map(session => ({
          id: session.id,
          status: session.status,
          endedAt: session.endedAt,
          actualSeconds: session.actualSeconds,
        })),
        finishedVisible: screen.queryByText(FINISHED_TEXT) !== null,
        runningVisible: screen.queryByText(RUNNING_TEXT) !== null,
        errorCleared:
          screen.queryByText('FOCUS_SESSION_STORAGE_WRITE_FAILED') === null,
        ids: ids.calls,
      };

      await act(async () => {
        runtimeClock.publish();
        runtimeClock.publish();
        await flushMicrotasks(160);
      });
      const afterRepeatedDeadline = {
        committedWrites: backend.committedSetCount(
          FOCUS_SESSION_STORAGE_KEY,
        ),
        completedCount: (await readTaskFocusHistory(backend)).filter(
          session => session.status === 'completed',
        ).length,
      };

      expect({afterFailure, afterRetry, afterRepeatedDeadline}).toEqual({
        afterFailure: {
          subscribers: 1,
          failedKeys: [FOCUS_SESSION_STORAGE_KEY],
          committedWrites: 0,
          bytesUnchanged: true,
          runningVisible: true,
          finishedVisible: false,
          errorVisible: true,
          retryEnabled: true,
        },
        afterRetry: {
          committedWrites: 1,
          sessions: [
            {
              id: running.id,
              status: 'completed',
              endedAt: running.plannedEndAt,
              actualSeconds: 300,
            },
          ],
          finishedVisible: true,
          runningVisible: false,
          errorCleared: true,
          ids: 0,
        },
        afterRepeatedDeadline: {
          committedWrites: 1,
          completedCount: 1,
        },
      });
    } finally {
      await screen.unmount();
    }
  });

  it('rejects a pre-running captured completion action after focus becomes active and permits it after interruption', async () => {
    const seeded = new R2IntegrationBackend();
    const task = makeAppTask({
      status: 'in_progress',
      startedAt: P0_05_STARTED_AT,
    });
    seedAppTask(seeded, {
      ...task,
      subtasks: task.subtasks.map(step => ({
        ...step,
        status: 'completed' as const,
        completedAt: P0_05_STARTED_AT,
        updatedAt: P0_05_STARTED_AT,
      })),
    });
    await seedRunningFocus(seeded, {
      sessionId: 'gap-p0-05r2-active-focus',
    });
    const focusBytes = seeded.raw(FOCUS_SESSION_STORAGE_KEY);
    if (focusBytes === null) {
      throw new Error('GAP_P0_05R2_FIXTURE_FOCUS_BYTES_MISSING');
    }

    const backend = seeded.byteRestartR2();
    const restoreGate = backend.delayNextGetFor(
      FOCUS_SESSION_STORAGE_KEY,
      focusBytes,
    );
    const clock = new ManualIsoClock();
    const ids = new SequenceIds(['focus-restore-must-not-consume-id']);
    const runtimeClock = new ManualFocusRuntimeClock(P0_05_STARTED_AT);
    const {screen, composition} = await renderReadyApp(
      backend,
      clock,
      ids,
      runtimeClock,
    );

    try {
      await flushUi(160);
      const completionBeforeRunning = screen.getByRole('button', {
        name: FINISH_TASK_BUTTON,
      });
      const beforeRunning = {
        restoreEntered: restoreGate.entered,
        runningVisible: screen.queryByText(RUNNING_TEXT) !== null,
        taskStatus:
          (await composition.service.getState()).tasks[0]?.status ?? null,
      };

      restoreGate.release();
      await flushUi(240);
      const afterRunning = {
        runningVisible: screen.queryByText(RUNNING_TEXT) !== null,
        completionRendered:
          screen.queryByRole('button', {name: FINISH_TASK_BUTTON}) !== null,
      };

      await fireEvent.press(completionBeforeRunning);
      await flushUi(240);
      const afterCapturedAction = {
        taskStatus:
          (await composition.service.getState()).tasks[0]?.status ?? null,
        completionRendered:
          screen.queryByRole('button', {name: FINISH_TASK_BUTTON}) !== null,
        focusStatuses: (await readTaskFocusHistory(backend)).map(
          session => session.status,
        ),
      };

      clock.set('2026-08-09T08:01:00.000Z');
      await fireEvent.press(
        screen.getByRole('button', {name: INTERRUPT_BUTTON}),
      );
      await flushUi(240);
      const completionAfterInterrupt = screen.queryByRole('button', {
        name: FINISH_TASK_BUTTON,
      });
      const afterInterrupt = {
        completionEnabled: enabledButton(screen, FINISH_TASK_BUTTON),
        runningVisible: screen.queryByText(RUNNING_TEXT) !== null,
        focusStatuses: (await readTaskFocusHistory(backend)).map(
          session => session.status,
        ),
      };

      if (completionAfterInterrupt !== null) {
        await fireEvent.press(completionAfterInterrupt);
      }
      await flushUi(240);
      const final = {
        taskStatus:
          (await composition.service.getState()).tasks[0]?.status ?? null,
        focusHistory: (await readTaskFocusHistory(backend)).map(session => ({
          id: session.id,
          taskId: session.taskId,
          status: session.status,
        })),
      };

      expect({
        beforeRunning,
        afterRunning,
        afterCapturedAction,
        afterInterrupt,
        final,
      }).toEqual({
        beforeRunning: {
          restoreEntered: 1,
          runningVisible: false,
          taskStatus: 'in_progress',
        },
        afterRunning: {
          runningVisible: true,
          completionRendered: false,
        },
        afterCapturedAction: {
          taskStatus: 'in_progress',
          completionRendered: false,
          focusStatuses: ['running'],
        },
        afterInterrupt: {
          completionEnabled: true,
          runningVisible: false,
          focusStatuses: ['interrupted'],
        },
        final: {
          taskStatus: 'completed',
          focusHistory: [
            {
              id: 'gap-p0-05r2-active-focus',
              taskId: P0_05_TASK_ID,
              status: 'interrupted',
            },
          ],
        },
      });
    } finally {
      restoreGate.release();
      await flushUi(160);
      await screen.unmount();
    }
  });
});
