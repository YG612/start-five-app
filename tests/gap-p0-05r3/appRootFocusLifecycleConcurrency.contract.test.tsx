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
  BackendSetGate,
  createFocusRuntime,
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
} from './gapP005R3TestKit';

const RECOMMEND_BUTTON = '推荐下一项';
const START_BUTTON = '开始5分钟';
const FINISH_TASK_BUTTON = '完成任务';
const INTERRUPT_BUTTON = '中断专注';
const RETRY_RESTORE_BUTTON = '重试恢复专注';
const RUNNING_TEXT = '计时状态：进行中';
const FINISHED_TEXT = '计时状态：已结束';
const IDLE_TEXT = '计时状态：未开始';

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
  const rendered = await render(React.createElement(composition.AppRoot));
  await waitFor(() =>
    expect(rendered.getByText(`任务：${P0_05_TASK_TITLE}`)).toBeTruthy(),
  );
  return {screen: rendered, composition};
}

async function chooseRecommendation(screen: Screen): Promise<void> {
  await fireEvent.press(
    screen.getByRole('button', {name: RECOMMEND_BUTTON}),
  );
  await waitFor(() =>
    expect(screen.getByText(`推荐：${P0_05_TASK_TITLE}`)).toBeTruthy(),
  );
}

function enabledButton(screen: Screen, name: string): boolean {
  const button = screen.queryByRole('button', {name});
  return (
    button !== null &&
    button.props.disabled !== true &&
    button.props.accessibilityState?.disabled !== true
  );
}

function completedStepTask() {
  const task = makeAppTask({
    status: 'in_progress',
    startedAt: P0_05_STARTED_AT,
  });
  return {
    ...task,
    subtasks: task.subtasks.map(step => ({
      ...step,
      status: 'completed' as const,
      completedAt: P0_05_STARTED_AT,
      updatedAt: P0_05_STARTED_AT,
    })),
  };
}

describe('GAP-P0-05R3 shared focus lifecycle concurrency', () => {
  it('linearizes a public start after an older restore reconcile write entered the backend', async () => {
    const backend = new R3IntegrationBackend();
    seedAppTask(
      backend,
      makeAppTask({
        status: 'in_progress',
        startedAt: P0_05_STARTED_AT,
      }),
    );
    const oldSession = await seedRunningFocus(backend, {
      sessionId: 'gap-p0-05r3-expired-old',
    });
    backend.clearTrace();

    const clock = new ManualIsoClock(oldSession.plannedEndAt);
    const ids = new SequenceIds(['gap-p0-05r3-new-running']);
    const runtimeClock = new ManualFocusRuntimeClock(oldSession.plannedEndAt);
    const oldRestoreGate = backend.delayNextSetFor(
      FOCUS_SESSION_STORAGE_KEY,
    );
    const app = await renderReadyApp(backend, clock, ids, runtimeClock);

    try {
      await flushUi(240);
      const gateEnteredBeforeStart = oldRestoreGate.entered;
      await chooseRecommendation(app.screen);
      await fireEvent.press(
        app.screen.getByRole('button', {name: START_BUTTON}),
      );
      await flushUi(240);
      const startWasIssued = {
        gateEntered: oldRestoreGate.entered,
        focusSetAttempts: backend.setAttempts.filter(
          call => call.key === FOCUS_SESSION_STORAGE_KEY,
        ).length,
      };

      oldRestoreGate.release();
      await waitFor(() =>
        expect(app.screen.getByText(RUNNING_TEXT)).toBeTruthy(),
      );
      await flushUi(240);

      const finalBytes = backend.raw(FOCUS_SESSION_STORAGE_KEY);
      const restarted = backend.byteRestartR2();
      const finalHistory = (await readTaskFocusHistory(restarted)).map(
        session => ({
          id: session.id,
          status: session.status,
          startedAt: session.startedAt,
          plannedEndAt: session.plannedEndAt,
          endedAt: session.endedAt,
        }),
      );
      const restartedAgain = restarted.byteRestartR2();
      const secondRestartHistory = (
        await readTaskFocusHistory(restartedAgain)
      ).map(session => ({
        id: session.id,
        status: session.status,
        plannedEndAt: session.plannedEndAt,
      }));

      expect({
        gateEnteredBeforeStart,
        startWasIssued,
        finalBytesPresent: finalBytes !== null,
        finalHistory,
        secondRestartHistory,
        runningVisible: app.screen.queryByText(RUNNING_TEXT) !== null,
        ids: ids.calls,
      }).toEqual({
        gateEnteredBeforeStart: 1,
        startWasIssued: {
          gateEntered: 1,
          focusSetAttempts: expect.any(Number),
        },
        finalBytesPresent: true,
        finalHistory: [
          {
            id: 'gap-p0-05r3-new-running',
            status: 'running',
            startedAt: oldSession.plannedEndAt,
            plannedEndAt: '2026-08-09T08:10:00.000Z',
            endedAt: null,
          },
          {
            id: oldSession.id,
            status: 'completed',
            startedAt: oldSession.startedAt,
            plannedEndAt: oldSession.plannedEndAt,
            endedAt: oldSession.plannedEndAt,
          },
        ],
        secondRestartHistory: [
          {
            id: 'gap-p0-05r3-new-running',
            status: 'running',
            plannedEndAt: '2026-08-09T08:10:00.000Z',
          },
          {
            id: oldSession.id,
            status: 'completed',
            plannedEndAt: oldSession.plannedEndAt,
          },
        ],
        runningVisible: true,
        ids: 1,
      });
    } finally {
      oldRestoreGate.release();
      await flushUi(160);
      await app.screen.unmount();
    }
  });

  it('blocks completion throughout restore pending and error until retry confirms no active focus', async () => {
    const backend = new R3IntegrationBackend();
    seedAppTask(backend, completedStepTask());
    const running = await seedRunningFocus(backend, {
      sessionId: 'gap-p0-05r3-restore-authority',
    });
    const restoreGate = backend.delayNextGetFor(
      FOCUS_SESSION_STORAGE_KEY,
      '{"schema":',
    );
    const clock = new ManualIsoClock('2026-08-09T08:02:00.000Z');
    const ids = new SequenceIds(['restore-must-not-consume-id']);
    const runtimeClock = new ManualFocusRuntimeClock(
      '2026-08-09T08:02:00.000Z',
    );
    const app = await renderReadyApp(backend, clock, ids, runtimeClock);

    try {
      await flushUi(320);
      const pending = {
        gateEntered: restoreGate.entered,
        completionRendered:
          app.screen.queryByRole('button', {name: FINISH_TASK_BUTTON}) !==
          null,
        retryEnabled: enabledButton(app.screen, RETRY_RESTORE_BUTTON),
      };

      restoreGate.release();
      await waitFor(() =>
        expect(
          app.screen.getByText('FOCUS_SESSION_SNAPSHOT_CORRUPT'),
        ).toBeTruthy(),
      );
      const error = {
        errorVisible:
          app.screen.queryByText('FOCUS_SESSION_SNAPSHOT_CORRUPT') !== null,
        completionRendered:
          app.screen.queryByRole('button', {name: FINISH_TASK_BUTTON}) !==
          null,
        retryEnabled: enabledButton(app.screen, RETRY_RESTORE_BUTTON),
        focusStatuses: (
          await readTaskFocusHistory(backend.byteRestartR2())
        ).map(session => session.status),
      };

      const transitionClock = new ManualIsoClock(
        '2026-08-09T08:02:00.000Z',
      );
      const transitionIds = new SequenceIds([
        'interrupt-must-not-consume-id',
      ]);
      await createFocusRuntime(
        backend,
        transitionClock,
        transitionIds,
      ).service.interrupt(running.id, 'R3 confirm no active focus');

      const retry = app.screen.queryByRole('button', {
        name: RETRY_RESTORE_BUTTON,
      });
      if (retry !== null) {
        await fireEvent.press(retry);
      }
      await waitFor(() =>
        expect(
          app.screen.getByRole('button', {name: FINISH_TASK_BUTTON}),
        ).toBeTruthy(),
      );
      const afterRetry = {
        runningVisible: app.screen.queryByText(RUNNING_TEXT) !== null,
        completionEnabled: enabledButton(app.screen, FINISH_TASK_BUTTON),
        focusStatuses: (
          await readTaskFocusHistory(backend.byteRestartR2())
        ).map(session => session.status),
      };

      await fireEvent.press(
        app.screen.getByRole('button', {name: FINISH_TASK_BUTTON}),
      );
      await flushUi(240);
      const final = {
        taskStatus:
          (await app.composition.service.getState()).tasks[0]?.status ?? null,
        focusHistory: (
          await readTaskFocusHistory(backend.byteRestartR2())
        ).map(session => ({
          id: session.id,
          status: session.status,
        })),
        appIds: ids.calls,
        transitionIds: transitionIds.calls,
      };

      expect({
        pending,
        error,
        afterRetry,
        final,
      }).toEqual({
        pending: {
          gateEntered: 1,
          completionRendered: false,
          retryEnabled: true,
        },
        error: {
          errorVisible: true,
          completionRendered: false,
          retryEnabled: true,
          focusStatuses: ['running'],
        },
        afterRetry: {
          runningVisible: false,
          completionEnabled: true,
          focusStatuses: ['interrupted'],
        },
        final: {
          taskStatus: 'completed',
          focusHistory: [
            {id: running.id, status: 'interrupted'},
          ],
          appIds: 0,
          transitionIds: 0,
        },
      });
    } finally {
      restoreGate.release();
      await flushUi(160);
      await app.screen.unmount();
    }
  });

  it('gives a gated deadline finish lifecycle ownership over one previously captured interrupt action', async () => {
    const backend = new R3IntegrationBackend();
    seedAppTask(
      backend,
      makeAppTask({
        status: 'in_progress',
        startedAt: P0_05_STARTED_AT,
      }),
    );
    const running = await seedRunningFocus(backend, {
      sessionId: 'gap-p0-05r3-deadline-owner',
    });
    backend.clearTrace();

    const beforeDeadline = '2026-08-09T08:04:59.000Z';
    const clock = new ManualIsoClock(beforeDeadline);
    const ids = new SequenceIds(['deadline-must-not-consume-id']);
    const runtimeClock = new ManualFocusRuntimeClock(beforeDeadline);
    const app = await renderReadyApp(backend, clock, ids, runtimeClock);
    let finishGate: BackendSetGate | null = null;

    try {
      await waitFor(() =>
        expect(app.screen.getByText(RUNNING_TEXT)).toBeTruthy(),
      );
      const capturedInterrupt = app.screen.getByRole('button', {
        name: INTERRUPT_BUTTON,
      });
      finishGate = backend.delayNextSetFor(
        FOCUS_SESSION_STORAGE_KEY,
      );
      clock.set(running.plannedEndAt);
      await act(async () => {
        runtimeClock.publishAt(running.plannedEndAt);
        await flushMicrotasks(240);
      });

      const gateEntered = finishGate.entered;
      if (gateEntered === 1) {
        await fireEvent.press(capturedInterrupt);
      }
      await flushUi(240);
      const whileFinishPending = {
        gateEntered: finishGate.entered,
        focusSetAttempts: backend.setAttempts.filter(
          call => call.key === FOCUS_SESSION_STORAGE_KEY,
        ).length,
        interruptRendered:
          app.screen.queryByRole('button', {name: INTERRUPT_BUTTON}) !== null,
        runningVisible: app.screen.queryByText(RUNNING_TEXT) !== null,
      };

      finishGate.release();
      await flushUi(320);
      const afterFinish = {
        committedWrites: backend.committedSetCount(
          FOCUS_SESSION_STORAGE_KEY,
        ),
        finishedVisible: app.screen.queryByText(FINISHED_TEXT) !== null,
        idleVisible: app.screen.queryByText(IDLE_TEXT) !== null,
        history: (await readTaskFocusHistory(backend.byteRestartR2())).map(
          session => ({
            id: session.id,
            status: session.status,
            endedAt: session.endedAt,
          }),
        ),
        ids: ids.calls,
      };

      await act(async () => {
        runtimeClock.publish();
        runtimeClock.publish();
        await flushMicrotasks(240);
      });
      const afterRepeatedClock = {
        committedWrites: backend.committedSetCount(
          FOCUS_SESSION_STORAGE_KEY,
        ),
        completedCount: (
          await readTaskFocusHistory(backend.byteRestartR2())
        ).filter(session => session.status === 'completed').length,
      };

      expect({whileFinishPending, afterFinish, afterRepeatedClock}).toEqual({
        whileFinishPending: {
          gateEntered: 1,
          focusSetAttempts: 1,
          interruptRendered: false,
          runningVisible: true,
        },
        afterFinish: {
          committedWrites: 1,
          finishedVisible: true,
          idleVisible: false,
          history: [
            {
              id: running.id,
              status: 'completed',
              endedAt: running.plannedEndAt,
            },
          ],
          ids: 0,
        },
        afterRepeatedClock: {
          committedWrites: 1,
          completedCount: 1,
        },
      });
    } finally {
      finishGate?.release();
      await flushUi(160);
      await app.screen.unmount();
    }
  });
});
