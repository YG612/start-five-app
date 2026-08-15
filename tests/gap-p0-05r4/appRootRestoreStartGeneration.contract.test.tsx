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
  R3IntegrationBackend,
} from '../gap-p0-05r3/gapP005R3TestKit';

const RECOMMEND_BUTTON = '推荐下一项';
const START_BUTTON = '开始5分钟';
const RETRY_RESTORE_BUTTON = '重试恢复专注';
const RUNNING_TEXT = '计时状态：进行中';

type Screen = Awaited<ReturnType<typeof render>>;
type FocusClockDependencies = StartFiveAppDependencies &
  Readonly<{focusRuntimeClock: FocusRuntimeClock}>;

async function flushUi(turns = 160): Promise<void> {
  await act(async () => {
    await flushMicrotasks(turns);
  });
}

async function renderReadyApp(
  backend: R3IntegrationBackend,
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

async function chooseRecommendation(screen: Screen): Promise<void> {
  await fireEvent.press(
    screen.getByRole('button', {name: RECOMMEND_BUTTON}),
  );
  await waitFor(() =>
    expect(screen.getByText(`推荐：${P0_05_TASK_TITLE}`)).toBeTruthy(),
  );
}

function compactHistory(
  sessions: Awaited<ReturnType<typeof readTaskFocusHistory>>,
) {
  return sessions.map(session => ({
    id: session.id,
    taskId: session.taskId,
    status: session.status,
    startedAt: session.startedAt,
    plannedEndAt: session.plannedEndAt,
    endedAt: session.endedAt,
  }));
}

describe('GAP-P0-05R4 restore generation invalidation', () => {
  it('invalidates a deferred old restore before public start I/O so its late bytes cannot overwrite the new durable session', async () => {
    const backend = new R3IntegrationBackend();
    seedAppTask(
      backend,
      makeAppTask({
        status: 'in_progress',
        startedAt: P0_05_STARTED_AT,
      }),
    );
    const oldSession = await seedRunningFocus(backend, {
      sessionId: 'gap-p0-05r4-expired-old',
    });
    const capturedOldBytes = backend.raw(FOCUS_SESSION_STORAGE_KEY);
    if (capturedOldBytes === null) {
      throw new Error('GAP_P0_05R4_FIXTURE_FOCUS_BYTES_MISSING');
    }
    backend.clearTrace();

    const clock = new ManualIsoClock(oldSession.plannedEndAt);
    const ids = new SequenceIds(['gap-p0-05r4-new-running']);
    const runtimeClock = new ManualFocusRuntimeClock(oldSession.plannedEndAt);
    const oldRestoreGate = backend.delayNextGetFor(
      FOCUS_SESSION_STORAGE_KEY,
      capturedOldBytes,
    );
    const app = await renderReadyApp(backend, clock, ids, runtimeClock);
    let mainGetGate: ReturnType<
      R3IntegrationBackend['delayNextGetFor']
    > | null = null;

    try {
      await flushUi(240);
      const baselineFocusWrites = backend.setAttempts.filter(
        call => call.key === FOCUS_SESSION_STORAGE_KEY,
      ).length;
      const baselineFocusRemoves = backend.removeAttempts.filter(
        key => key === FOCUS_SESSION_STORAGE_KEY,
      ).length;
      const pendingBeforeStart = {
        oldRestoreEntered: oldRestoreGate.entered,
        restoreRetryVisible:
          app.screen.queryByRole('button', {
            name: RETRY_RESTORE_BUTTON,
          }) !== null,
        focusWrites: baselineFocusWrites,
        focusRemoves: baselineFocusRemoves,
      };

      await chooseRecommendation(app.screen);
      mainGetGate = backend.delayNextGetFor(
        FOCUS_SESSION_STORAGE_KEY,
        capturedOldBytes,
      );
      await fireEvent.press(
        app.screen.getByRole('button', {name: START_BUTTON}),
      );
      await waitFor(() =>
        expect(mainGetGate?.entered).toBe(1),
      );
      await flushUi(240);

      oldRestoreGate.release();
      await flushUi(320);
      await waitFor(() =>
        expect(
          app.screen.queryByRole('button', {
            name: RETRY_RESTORE_BUTTON,
          }),
        ).toBeNull(),
      );
      await flushUi(160);

      const staleRestoreSettledBeforeMainRelease = {
        mainFocusGetEntered: mainGetGate.entered,
        restoreRetryVisible:
          app.screen.queryByRole('button', {
            name: RETRY_RESTORE_BUTTON,
          }) !== null,
        focusWritesDelta:
          backend.setAttempts.filter(
            call => call.key === FOCUS_SESSION_STORAGE_KEY,
          ).length - baselineFocusWrites,
        focusRemovesDelta:
          backend.removeAttempts.filter(
            key => key === FOCUS_SESSION_STORAGE_KEY,
          ).length - baselineFocusRemoves,
        runningVisible: app.screen.queryByText(RUNNING_TEXT) !== null,
      };

      mainGetGate.release();
      await waitFor(() =>
        expect(app.screen.getByText(RUNNING_TEXT)).toBeTruthy(),
      );
      await flushUi(240);

      const finalBytes = backend.raw(FOCUS_SESSION_STORAGE_KEY);
      const finalHistory = compactHistory(
        await readTaskFocusHistory(backend),
      );
      const restarted = backend.byteRestartR2();
      const restartHistory = compactHistory(
        await readTaskFocusHistory(restarted),
      );
      const restartedAgain = restarted.byteRestartR2();
      const secondRestartHistory = compactHistory(
        await readTaskFocusHistory(restartedAgain),
      );
      const afterMainRelease = {
        bytesPresent: finalBytes !== null,
        history: finalHistory,
        restartHistory,
        secondRestartHistory,
        runningVisible: app.screen.queryByText(RUNNING_TEXT) !== null,
        ids: ids.calls,
        focusWrites: backend.setAttempts.filter(
          call => call.key === FOCUS_SESSION_STORAGE_KEY,
        ).length,
        focusRemoves: backend.removeAttempts.filter(
          key => key === FOCUS_SESSION_STORAGE_KEY,
        ).length,
      };

      const expectedHistory = [
        {
          id: 'gap-p0-05r4-new-running',
          taskId: P0_05_TASK_ID,
          status: 'running',
          startedAt: oldSession.plannedEndAt,
          plannedEndAt: '2026-08-09T08:10:00.000Z',
          endedAt: null,
        },
        {
          id: oldSession.id,
          taskId: P0_05_TASK_ID,
          status: 'completed',
          startedAt: oldSession.startedAt,
          plannedEndAt: oldSession.plannedEndAt,
          endedAt: oldSession.plannedEndAt,
        },
      ];

      expect({
        pendingBeforeStart,
        staleRestoreSettledBeforeMainRelease,
        afterMainRelease,
      }).toEqual({
        pendingBeforeStart: {
          oldRestoreEntered: 1,
          restoreRetryVisible: true,
          focusWrites: 0,
          focusRemoves: 0,
        },
        staleRestoreSettledBeforeMainRelease: {
          mainFocusGetEntered: 1,
          restoreRetryVisible: false,
          focusWritesDelta: 0,
          focusRemovesDelta: 0,
          runningVisible: false,
        },
        afterMainRelease: {
          bytesPresent: true,
          history: expectedHistory,
          restartHistory: expectedHistory,
          secondRestartHistory: expectedHistory,
          runningVisible: true,
          ids: 1,
          focusWrites: baselineFocusWrites + 1,
          focusRemoves: baselineFocusRemoves,
        },
      });
    } finally {
      oldRestoreGate.release();
      mainGetGate?.release();
      await flushUi(160);
      await app.screen.unmount();
    }
  });
});
