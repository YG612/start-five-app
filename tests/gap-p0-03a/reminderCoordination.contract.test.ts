import {
  makeCancelledTask,
  makeCompletedTask,
  makeDeletedTask,
  makeTask,
} from '../gap-p0-01a2/a2Fixtures';
import {
  AtomicReminderScheduler,
  ByteReminderRepository,
  ManualBarrier,
  PhysicalReminderBackend,
  PhysicalSchedulerBackend,
  expectCode,
  loadReminderModule,
  type ReminderPermission,
  type ReminderReconcileInput,
  type ReminderRule,
  type ReminderScheduleSnapshot,
  type ReminderSchedulingService,
} from './testKit';

const START_RULE: ReminderRule = {
  id: 'start-now',
  kind: 'start',
  anchor: 'scheduled_start',
  offsetMinutes: 0,
  progressBelow: null,
};

const EXPECTED_START_SNAPSHOT: ReminderScheduleSnapshot = {
  taskId: 'task-reminder',
  generation: 1,
  permission: 'granted',
  intents: [
    {
      taskId: 'task-reminder',
      ruleId: 'start-now',
      kind: 'start',
      triggerAt: '2026-08-05T10:00:00.000Z',
    },
  ],
  scheduled: true,
};

const EXPECTED_RESCHEDULED_SNAPSHOT: ReminderScheduleSnapshot = {
  taskId: 'task-reminder',
  generation: 2,
  permission: 'granted',
  intents: [
    {
      taskId: 'task-reminder',
      ruleId: 'start-now',
      kind: 'start',
      triggerAt: '2026-08-05T11:00:00.000Z',
    },
  ],
  scheduled: true,
};

const STALE_PLATFORM_SNAPSHOT: ReminderScheduleSnapshot = {
  taskId: 'task-reminder',
  generation: 0,
  permission: 'granted',
  intents: [
    {
      taskId: 'task-reminder',
      ruleId: 'stale-platform-rule',
      kind: 'start',
      triggerAt: '2026-08-05T08:00:00.000Z',
    },
  ],
  scheduled: true,
};

const UNRELATED_PLATFORM_SNAPSHOT: ReminderScheduleSnapshot = {
  taskId: 'unrelated-platform-task',
  generation: 7,
  permission: 'granted',
  intents: [
    {
      taskId: 'unrelated-platform-task',
      ruleId: 'unrelated-platform-rule',
      kind: 'planning',
      triggerAt: '2026-08-05T13:00:00.000Z',
    },
  ],
  scheduled: true,
};

function reconcileInput(
  scheduledStartAt: string,
  operationId: string,
  overrides: Partial<ReminderReconcileInput> = {},
): ReminderReconcileInput {
  return {
    task: makeTask('task-reminder', {
      startAt: scheduledStartAt,
      scheduledStartAt,
      dueAt: '2026-08-05T14:00:00.000Z',
    }),
    now: '2026-08-05T09:00:00.000Z',
    timeZone: 'Asia/Shanghai',
    progressRatio: 0,
    rules: [START_RULE],
    permission: 'granted',
    operationId,
    ...overrides,
  };
}

function createHarness(options: {
  reminderBackend?: PhysicalReminderBackend;
  schedulerBackend?: PhysicalSchedulerBackend;
  barrier?: ManualBarrier;
} = {}): {
  service: ReminderSchedulingService;
  reminderBackend: PhysicalReminderBackend;
  schedulerBackend: PhysicalSchedulerBackend;
  scheduler: AtomicReminderScheduler;
} {
  const reminderBackend =
    options.reminderBackend ?? new PhysicalReminderBackend();
  const schedulerBackend =
    options.schedulerBackend ?? new PhysicalSchedulerBackend();
  const scheduler = new AtomicReminderScheduler(
    schedulerBackend,
    options.barrier ?? null,
  );
  const service = loadReminderModule().createReminderSchedulingService({
    repository: new ByteReminderRepository(reminderBackend),
    scheduler,
  });
  return {service, reminderBackend, schedulerBackend, scheduler};
}

describe('GAP-P0-03A reminder coordination, recovery, and persistence', () => {
  it.each<ReminderPermission>(['denied', 'not_determined', 'granted'])(
    'records the %s permission state and schedules only when granted',
    async permission => {
      const {service, reminderBackend, schedulerBackend} = createHarness();
      const result = await service.reconcile(
        reconcileInput('2026-08-05T10:00:00.000Z', `permission-${permission}`, {
          permission,
        }),
      );
      expect(result).toEqual({
        taskId: 'task-reminder',
        generation: 1,
        permission,
        intents: [
          {
            taskId: 'task-reminder',
            ruleId: 'start-now',
            kind: 'start',
            triggerAt: '2026-08-05T10:00:00.000Z',
          },
        ],
        scheduled: permission === 'granted',
      });
      expect(schedulerBackend.calls).toHaveLength(
        permission === 'granted' ? 1 : 0,
      );
      expect(reminderBackend.commitCount).toBe(1);
    },
  );

  it('keeps exactly one latest generation across reschedule and delay snapshots', async () => {
    const {service, schedulerBackend, scheduler} = createHarness();
    const first = await service.reconcile(
      reconcileInput('2026-08-05T10:00:00.000Z', 'generation-1'),
    );
    const rescheduled = await service.reconcile(
      reconcileInput('2026-08-05T11:00:00.000Z', 'generation-2'),
    );
    const delayed = await service.reconcile(
      reconcileInput('2026-08-05T12:00:00.000Z', 'generation-3'),
    );

    expect(first.generation).toBe(1);
    expect(rescheduled.generation).toBe(2);
    expect(delayed).toMatchObject({
      taskId: 'task-reminder',
      generation: 3,
      scheduled: true,
    });
    expect(delayed.intents[0]?.triggerAt).toBe(
      '2026-08-05T12:00:00.000Z',
    );
    expect(schedulerBackend.calls).toHaveLength(3);
    expect(schedulerBackend.calls[1]?.previous?.generation).toBe(1);
    expect(schedulerBackend.calls[1]?.next.generation).toBe(2);
    expect(schedulerBackend.calls[2]?.previous?.generation).toBe(2);
    expect(await scheduler.get('task-reminder')).toEqual(delayed);
  });

  it('does not churn scheduler or durable state for unrelated task edits or an absolute-time timezone change', async () => {
    const {service, reminderBackend, schedulerBackend} = createHarness();
    const first = await service.reconcile(
      reconcileInput('2026-08-05T10:00:00.000Z', 'no-churn-1'),
    );
    const rawBefore = reminderBackend.raw;
    const commitsBefore = reminderBackend.commitCount;
    const callsBefore = schedulerBackend.calls.length;
    const unrelated = reconcileInput(
      '2026-08-05T10:00:00.000Z',
      'no-churn-2',
      {
        task: makeTask('task-reminder', {
          title: 'Only the title changed',
          important: true,
          startAt: '2026-08-05T10:00:00.000Z',
          scheduledStartAt: '2026-08-05T10:00:00.000Z',
          dueAt: '2026-08-05T14:00:00.000Z',
        }),
        timeZone: 'America/New_York',
      },
    );
    const second = await service.reconcile(unrelated);
    expect(second).toEqual(first);
    expect(reminderBackend.raw).toBe(rawBefore);
    expect(reminderBackend.commitCount).toBe(commitsBefore);
    expect(schedulerBackend.calls).toHaveLength(callsBefore);
  });

  it('reconciles denied to granted to denied without a permission prompt loop', async () => {
    const {service, schedulerBackend} = createHarness();
    const denied = await service.reconcile(
      reconcileInput('2026-08-05T10:00:00.000Z', 'transition-1', {
        permission: 'denied',
      }),
    );
    const granted = await service.reconcile(
      reconcileInput('2026-08-05T10:00:00.000Z', 'transition-2', {
        permission: 'granted',
      }),
    );
    const revoked = await service.reconcile(
      reconcileInput('2026-08-05T10:00:00.000Z', 'transition-3', {
        permission: 'denied',
      }),
    );
    expect(denied).toMatchObject({generation: 1, scheduled: false});
    expect(granted).toMatchObject({generation: 2, scheduled: true});
    expect(revoked).toMatchObject({generation: 3, scheduled: false});
    expect(schedulerBackend.calls).toHaveLength(2);
    expect(schedulerBackend.calls[0]?.next.scheduled).toBe(true);
    expect(schedulerBackend.calls[1]?.next.scheduled).toBe(false);
  });

  it.each([
    ['completed', makeCompletedTask('task-reminder', {
      startAt: '2026-08-05T10:00:00.000Z',
      scheduledStartAt: '2026-08-05T10:00:00.000Z',
      dueAt: '2026-08-05T14:00:00.000Z',
    })],
    ['cancelled', makeCancelledTask('task-reminder', {
      startAt: '2026-08-05T10:00:00.000Z',
      scheduledStartAt: '2026-08-05T10:00:00.000Z',
      dueAt: '2026-08-05T14:00:00.000Z',
    })],
    ['deleted', makeDeletedTask('task-reminder', {
      startAt: '2026-08-05T10:00:00.000Z',
      scheduledStartAt: '2026-08-05T10:00:00.000Z',
      dueAt: '2026-08-05T14:00:00.000Z',
    })],
  ])('cancels and never rebuilds a %s task generation', async (_label, task) => {
    const {service, reminderBackend, schedulerBackend} = createHarness();
    await service.reconcile(
      reconcileInput('2026-08-05T10:00:00.000Z', `terminal-${_label}-1`),
    );
    const terminal = await service.reconcile(
      reconcileInput('2026-08-05T10:00:00.000Z', `terminal-${_label}-2`, {
        task,
      }),
    );
    expect(terminal).toEqual({
      taskId: 'task-reminder',
      generation: 2,
      permission: 'granted',
      intents: [],
      scheduled: false,
    });
    const terminalRaw = reminderBackend.raw;
    if (terminalRaw === null) {
      throw new Error('EXPECTED_TERMINAL_REMINDER_BYTES');
    }
    const restartedReminderBackend = new PhysicalReminderBackend();
    restartedReminderBackend.raw = `${terminalRaw}`;
    const restartedSchedulerBackend = new PhysicalSchedulerBackend();
    restartedSchedulerBackend.raw = JSON.stringify([STALE_PLATFORM_SNAPSHOT]);
    const restarted = createHarness({
      reminderBackend: restartedReminderBackend,
      schedulerBackend: restartedSchedulerBackend,
    });
    const replay = await restarted.service.reconcile(
      reconcileInput('2026-08-05T10:00:00.000Z', `terminal-${_label}-2`, {
        task,
      }),
    );
    expect(replay).toEqual(terminal);
    expect(schedulerBackend.calls).toHaveLength(2);
    expect(restartedReminderBackend.raw).toBe(terminalRaw);
    expect(restartedReminderBackend.commitCount).toBe(0);
    expect(restartedSchedulerBackend.calls).toEqual([
      {previous: STALE_PLATFORM_SNAPSHOT, next: terminal},
    ]);
    expect(await restarted.scheduler.get('task-reminder')).toBeNull();
  });

  it('durably replays and conflicts its own current-generation operation after byte-only restart', async () => {
    const first = createHarness();
    const input = reconcileInput(
      '2026-08-05T10:00:00.000Z',
      'reminder-own-operation',
    );
    expect(await first.service.reconcile(input)).toEqual(
      EXPECTED_START_SNAPSHOT,
    );
    const repositoryRaw = first.reminderBackend.raw;
    const platformRaw = first.schedulerBackend.raw;
    if (repositoryRaw === null || platformRaw === null) {
      throw new Error('EXPECTED_REMINDER_AND_PLATFORM_BYTES');
    }

    const restartedReminderBackend = new PhysicalReminderBackend();
    restartedReminderBackend.raw = `${repositoryRaw}`;
    const restartedSchedulerBackend = new PhysicalSchedulerBackend();
    restartedSchedulerBackend.raw = `${platformRaw}`;
    const restarted = createHarness({
      reminderBackend: restartedReminderBackend,
      schedulerBackend: restartedSchedulerBackend,
    });
    expect(await restarted.service.reconcile(input)).toEqual(
      EXPECTED_START_SNAPSHOT,
    );
    expect(restartedReminderBackend.raw).toBe(repositoryRaw);
    expect(restartedReminderBackend.commitCount).toBe(0);
    expect(restartedSchedulerBackend.calls).toEqual([]);

    const error = await expectCode(
      () =>
        restarted.service.reconcile(
          reconcileInput(
            '2026-08-05T11:00:00.000Z',
            'reminder-own-operation',
          ),
        ),
      'REMINDER_OPERATION_CONFLICT',
    );
    expect(error).toBeDefined();
    expect(restartedReminderBackend.raw).toBe(repositoryRaw);
    expect(restartedReminderBackend.commitCount).toBe(0);
    expect(restartedSchedulerBackend.calls).toEqual([]);
    expect(await restarted.scheduler.get('task-reminder')).toEqual(
      EXPECTED_START_SNAPSHOT,
    );
  });

  it('preserves state on an atomic scheduler failure and permits the same operation retry', async () => {
    const {service, reminderBackend, schedulerBackend, scheduler} =
      createHarness();
    const before = await service.reconcile(
      reconcileInput('2026-08-05T10:00:00.000Z', 'scheduler-fault-1'),
    );
    const rawBefore = reminderBackend.raw;
    const fault = new Error('SCHEDULER_FAULT_EXACT');
    schedulerBackend.failNext = fault;
    await expect(
      service.reconcile(
        reconcileInput('2026-08-05T11:00:00.000Z', 'scheduler-fault-2'),
      ),
    ).rejects.toBe(fault);
    expect(reminderBackend.raw).toBe(rawBefore);
    expect(await scheduler.get('task-reminder')).toEqual(before);
    const retry = await service.reconcile(
      reconcileInput('2026-08-05T11:00:00.000Z', 'scheduler-fault-2'),
    );
    expect(retry).toMatchObject({generation: 2, scheduled: true});
  });

  it('compensates a repository commit failure back to the exact logical generation and retries cleanly', async () => {
    const {service, reminderBackend, schedulerBackend, scheduler} =
      createHarness();
    const before = await service.reconcile(
      reconcileInput('2026-08-05T10:00:00.000Z', 'commit-fault-1'),
    );
    expect(before).toEqual(EXPECTED_START_SNAPSHOT);
    const rawBefore = reminderBackend.raw;
    const platformRawBefore = schedulerBackend.raw;
    const fault = new Error('REMINDER_COMMIT_FAULT_EXACT');
    reminderBackend.failNextCommit = fault;
    const callsBefore = schedulerBackend.calls.length;
    await expect(
      service.reconcile(
        reconcileInput('2026-08-05T11:00:00.000Z', 'commit-fault-2'),
      ),
    ).rejects.toBe(fault);
    expect(reminderBackend.raw).toBe(rawBefore);
    expect(schedulerBackend.calls).toHaveLength(callsBefore + 2);
    expect(schedulerBackend.calls.slice(callsBefore)).toEqual([
      {
        previous: EXPECTED_START_SNAPSHOT,
        next: EXPECTED_RESCHEDULED_SNAPSHOT,
      },
      {
        previous: EXPECTED_RESCHEDULED_SNAPSHOT,
        next: EXPECTED_START_SNAPSHOT,
      },
    ]);
    expect(schedulerBackend.raw).toBe(platformRawBefore);
    expect(await scheduler.get('task-reminder')).toEqual(
      EXPECTED_START_SNAPSHOT,
    );
    const retry = await service.reconcile(
      reconcileInput('2026-08-05T11:00:00.000Z', 'commit-fault-2'),
    );
    expect(retry.generation).toBe(2);
  });

  it('restores a missing platform schedule from repository bytes and returns detached state', async () => {
    const first = createHarness();
    expect(
      await first.service.reconcile(
        reconcileInput('2026-08-05T10:00:00.000Z', 'restart-empty-platform'),
      ),
    ).toEqual(EXPECTED_START_SNAPSHOT);
    const repositoryRaw = first.reminderBackend.raw;
    if (repositoryRaw === null) {
      throw new Error('EXPECTED_REMINDER_BYTES');
    }

    const restartedReminderBackend = new PhysicalReminderBackend();
    restartedReminderBackend.raw = `${repositoryRaw}`;
    const emptySchedulerBackend = new PhysicalSchedulerBackend();
    const restarted = createHarness({
      reminderBackend: restartedReminderBackend,
      schedulerBackend: emptySchedulerBackend,
    });
    const replay = await restarted.service.reconcile(
      reconcileInput('2026-08-05T10:00:00.000Z', 'restart-empty-platform'),
    );
    expect(replay).toEqual(EXPECTED_START_SNAPSHOT);
    expect(restartedReminderBackend.raw).toBe(repositoryRaw);
    expect(restartedReminderBackend.commitCount).toBe(0);
    expect(emptySchedulerBackend.queryCount).toBe(1);
    expect(emptySchedulerBackend.calls).toEqual([
      {previous: null, next: EXPECTED_START_SNAPSHOT},
    ]);
    expect(await restarted.scheduler.get('task-reminder')).toEqual(
      EXPECTED_START_SNAPSHOT,
    );

    const intent = replay.intents[0];
    if (intent === undefined) {
      throw new Error('EXPECTED_REMINDER_INTENT');
    }
    Object.defineProperty(intent, 'triggerAt', {
      value: '2099-01-01T00:00:00.000Z',
      configurable: true,
    });
    expect((await restarted.service.getState('task-reminder'))?.intents[0])
      .toEqual(EXPECTED_START_SNAPSHOT.intents[0]);
  });

  it('repairs a target missing from an independent platform view without deleting unrelated bytes', async () => {
    const first = createHarness();
    expect(
      await first.service.reconcile(
        reconcileInput('2026-08-05T10:00:00.000Z', 'restart-missing-target'),
      ),
    ).toEqual(EXPECTED_START_SNAPSHOT);
    const repositoryRaw = first.reminderBackend.raw;
    if (repositoryRaw === null) {
      throw new Error('EXPECTED_REMINDER_BYTES');
    }

    const restartedReminderBackend = new PhysicalReminderBackend();
    restartedReminderBackend.raw = `${repositoryRaw}`;
    const missingTargetBackend = new PhysicalSchedulerBackend();
    missingTargetBackend.raw = JSON.stringify([UNRELATED_PLATFORM_SNAPSHOT]);
    const restarted = createHarness({
      reminderBackend: restartedReminderBackend,
      schedulerBackend: missingTargetBackend,
    });
    expect(
      await restarted.service.reconcile(
        reconcileInput('2026-08-05T10:00:00.000Z', 'restart-missing-target'),
      ),
    ).toEqual(EXPECTED_START_SNAPSHOT);
    expect(restartedReminderBackend.raw).toBe(repositoryRaw);
    expect(restartedReminderBackend.commitCount).toBe(0);
    expect(missingTargetBackend.queryCount).toBe(1);
    expect(missingTargetBackend.calls).toEqual([
      {previous: null, next: EXPECTED_START_SNAPSHOT},
    ]);
    expect(await restarted.scheduler.get('task-reminder')).toEqual(
      EXPECTED_START_SNAPSHOT,
    );
    expect(await restarted.scheduler.get('unrelated-platform-task')).toEqual(
      UNRELATED_PLATFORM_SNAPSHOT,
    );
  });

  it('replaces a stale independent platform generation with the durable generation', async () => {
    const first = createHarness();
    expect(
      await first.service.reconcile(
        reconcileInput('2026-08-05T10:00:00.000Z', 'restart-stale-platform'),
      ),
    ).toEqual(EXPECTED_START_SNAPSHOT);
    const repositoryRaw = first.reminderBackend.raw;
    if (repositoryRaw === null) {
      throw new Error('EXPECTED_REMINDER_BYTES');
    }

    const restartedReminderBackend = new PhysicalReminderBackend();
    restartedReminderBackend.raw = `${repositoryRaw}`;
    const staleSchedulerBackend = new PhysicalSchedulerBackend();
    staleSchedulerBackend.raw = JSON.stringify([STALE_PLATFORM_SNAPSHOT]);
    const restarted = createHarness({
      reminderBackend: restartedReminderBackend,
      schedulerBackend: staleSchedulerBackend,
    });
    expect(
      await restarted.service.reconcile(
        reconcileInput('2026-08-05T10:00:00.000Z', 'restart-stale-platform'),
      ),
    ).toEqual(EXPECTED_START_SNAPSHOT);
    expect(restartedReminderBackend.raw).toBe(repositoryRaw);
    expect(restartedReminderBackend.commitCount).toBe(0);
    expect(staleSchedulerBackend.queryCount).toBe(1);
    expect(staleSchedulerBackend.calls).toEqual([
      {
        previous: STALE_PLATFORM_SNAPSHOT,
        next: EXPECTED_START_SNAPSHOT,
      },
    ]);
    expect(await restarted.scheduler.get('task-reminder')).toEqual(
      EXPECTED_START_SNAPSHOT,
    );
    expect(staleSchedulerBackend.raw).not.toContain('stale-platform-rule');
  });

  it('linearizes two facades with an explicit barrier and converges to the second committed intent', async () => {
    const reminderBackend = new PhysicalReminderBackend();
    const schedulerBackend = new PhysicalSchedulerBackend();
    const barrier = new ManualBarrier();
    const first = createHarness({reminderBackend, schedulerBackend, barrier});
    const second = createHarness({reminderBackend, schedulerBackend, barrier});
    const firstPending = first.service.reconcile(
      reconcileInput('2026-08-05T10:00:00.000Z', 'race-first'),
    );
    await barrier.entered;
    const secondPending = second.service.reconcile(
      reconcileInput('2026-08-05T11:00:00.000Z', 'race-second'),
    );
    barrier.release();
    const [firstResult, secondResult] = await Promise.all([
      firstPending,
      secondPending,
    ]);
    expect(firstResult.generation).toBe(1);
    expect(secondResult.generation).toBe(2);
    expect(secondResult.intents[0]?.triggerAt).toBe(
      '2026-08-05T11:00:00.000Z',
    );
    expect((await first.service.getState('task-reminder'))).toEqual(
      secondResult,
    );
    const platform = new AtomicReminderScheduler(schedulerBackend);
    expect(await platform.get('task-reminder')).toEqual(secondResult);
  });
});
