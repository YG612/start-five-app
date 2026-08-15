import type {TaskLifecycleTaskPatch} from '../../src/application/coreAppService';
import {
  A2_LATER,
  A2_NOW,
  SequenceClock,
  createA2Harness,
  expectErrorCode,
  makeCancelledTask,
  makeCompletedTask,
  makeTask,
  operation,
} from './a2Fixtures';

describe('GAP-P0-01A2 scheduling, reschedule, delay, and duration contract', () => {
  it('reschedules canonically, synchronizes the legacy alias, and preserves omitted dueAt', async () => {
    const baseline = makeTask('reschedule-preserve-due', {
      startAt: '2026-08-06T09:00:00.000Z',
      dueAt: '2026-08-07T09:00:00.000Z',
    });
    const {service} = createA2Harness({tasks: [baseline]});

    const result = await service.reschedule(
      baseline.id,
      {scheduledStartAt: '2026-08-06T20:30:00+08:00'},
      operation('schedule:reschedule:preserve-due'),
    );

    expect(result).toMatchObject({
      startAt: '2026-08-06T12:30:00.000Z',
      scheduledStartAt: '2026-08-06T12:30:00.000Z',
      dueAt: baseline.dueAt,
      startedAt: null,
      updatedAt: A2_NOW,
    });
  });

  it('distinguishes omitted fields from explicit null clearing for schedule and due time', async () => {
    const baseline = makeTask('reschedule-clear', {
      startAt: '2026-08-06T09:00:00.000Z',
      dueAt: '2026-08-07T09:00:00.000Z',
    });
    const {service} = createA2Harness({tasks: [baseline]});

    const scheduleCleared = await service.reschedule(
      baseline.id,
      {scheduledStartAt: null},
      operation('schedule:clear:start'),
    );
    expect(scheduleCleared).toMatchObject({
      startAt: null,
      scheduledStartAt: null,
      dueAt: baseline.dueAt,
    });
    const dueCleared = await service.reschedule(
      baseline.id,
      {scheduledStartAt: null, dueAt: null},
      operation('schedule:clear:due'),
    );
    expect(dueCleared).toMatchObject({
      startAt: null,
      scheduledStartAt: null,
      dueAt: null,
    });
  });

  it('rejects malformed reschedules and inverted ranges without a write', async () => {
    const cases = [
      {
        id: 'bad-start',
        input: {scheduledStartAt: 'not-a-time'},
        code: 'INVALID_TIMESTAMP',
      },
      {
        id: 'bad-due',
        input: {scheduledStartAt: A2_LATER, dueAt: 'not-a-time'},
        code: 'INVALID_TIMESTAMP',
      },
      {
        id: 'inverted',
        input: {
          scheduledStartAt: '2026-08-07T10:00:00.000Z',
          dueAt: '2026-08-07T09:59:59.999Z',
        },
        code: 'INVALID_TIME_RANGE',
      },
    ];

    for (const entry of cases) {
      const baseline = makeTask(`reschedule-${entry.id}`);
      const {service, storage} = createA2Harness({tasks: [baseline]});
      const rawBefore = storage.raw();
      await expectErrorCode(
        () =>
          service.reschedule(
            baseline.id,
            entry.input,
            operation(`schedule:invalid:${entry.id}`),
          ),
        entry.code,
      );
      expect(storage.raw()).toBe(rawBefore);
      expect(storage.setCommits).toEqual([]);
    }
  });

  it('validates update time ranges against the final merged state when only one endpoint changes', async () => {
    const cases: Array<{
      id: string;
      patch: TaskLifecycleTaskPatch;
    }> = [
      {
        id: 'start-only',
        patch: {scheduledStartAt: '2026-08-06T12:00:00.001Z'},
      },
      {
        id: 'due-only',
        patch: {dueAt: '2026-08-06T08:59:59.999Z'},
      },
    ];

    for (const entry of cases) {
      const baseline = makeTask(`update-merged-range-${entry.id}`, {
        startAt: '2026-08-06T09:00:00.000Z',
        scheduledStartAt: '2026-08-06T09:00:00.000Z',
        dueAt: '2026-08-06T12:00:00.000Z',
      });
      const {service, storage} = createA2Harness({tasks: [baseline]});
      const rawBefore = storage.raw();

      await expectErrorCode(
        () =>
          service.update(
            baseline.id,
            entry.patch,
            operation(`schedule:update:merged-range:${entry.id}`),
          ),
        'INVALID_TIME_RANGE',
      );

      expect(storage.raw()).toBe(rawBefore);
      expect(storage.setAttempts).toEqual([]);
      expect(storage.setCommits).toEqual([]);
    }
  });

  it('validates an omitted reschedule dueAt against the current durable due time', async () => {
    const baseline = makeTask('reschedule-merged-due', {
      startAt: '2026-08-06T09:00:00.000Z',
      scheduledStartAt: '2026-08-06T09:00:00.000Z',
      dueAt: '2026-08-06T10:00:00.000Z',
    });
    const {service, storage} = createA2Harness({tasks: [baseline]});
    const rawBefore = storage.raw();

    await expectErrorCode(
      () =>
        service.reschedule(
          baseline.id,
          {scheduledStartAt: '2026-08-06T10:00:00.001Z'},
          operation('schedule:reschedule:merged-due'),
        ),
      'INVALID_TIME_RANGE',
    );

    expect(storage.raw()).toBe(rawBefore);
    expect(storage.setAttempts).toEqual([]);
    expect(storage.setCommits).toEqual([]);
  });

  it('delays from now when the existing planned time is absent or already past', async () => {
    const cases = [
      makeTask('delay-null', {startAt: null}),
      makeTask('delay-past', {startAt: '2026-08-05T09:00:00.000Z'}),
    ];

    for (const baseline of cases) {
      const {service} = createA2Harness({tasks: [baseline]});
      const delayed = await service.delay(
        baseline.id,
        {minutes: 15},
        operation(`schedule:delay:${baseline.id}`),
      );
      expect(delayed).toMatchObject({
        startAt: '2026-08-05T10:15:00.000Z',
        scheduledStartAt: '2026-08-05T10:15:00.000Z',
        startedAt: null,
        updatedAt: A2_NOW,
      });
    }
  });

  it('delays from a future planned time and never shifts the due date implicitly', async () => {
    const baseline = makeTask('delay-future', {
      startAt: '2026-08-05T11:00:00.000Z',
      dueAt: '2026-08-06T11:00:00.000Z',
    });
    const {service} = createA2Harness({tasks: [baseline]});

    const delayed = await service.delay(
      baseline.id,
      {minutes: 90},
      operation('schedule:delay:future'),
    );

    expect(delayed).toMatchObject({
      startAt: '2026-08-05T12:30:00.000Z',
      scheduledStartAt: '2026-08-05T12:30:00.000Z',
      dueAt: baseline.dueAt,
      updatedAt: A2_NOW,
    });
  });

  it('rejects a delay whose final planned time crosses the durable dueAt', async () => {
    const baseline = makeTask('delay-crosses-due', {
      startAt: A2_NOW,
      scheduledStartAt: A2_NOW,
      dueAt: '2026-08-05T10:05:00.000Z',
    });
    const clock = new SequenceClock([A2_NOW]);
    const {service, storage} = createA2Harness({
      tasks: [baseline],
      now: clock.now,
    });
    const rawBefore = storage.raw();

    await expectErrorCode(
      () =>
        service.delay(
          baseline.id,
          {minutes: 6},
          operation('schedule:delay:crosses-due'),
        ),
      'INVALID_TIME_RANGE',
    );

    expect(storage.raw()).toBe(rawBefore);
    expect(storage.setAttempts).toEqual([]);
    expect(storage.setCommits).toEqual([]);
  });

  it('accepts the exact JavaScript date ceiling and rejects representable-input delay overflow atomically', async () => {
    const exactCeiling = '+275760-09-13T00:00:00.000Z';
    const safeBaseline = makeTask('delay-js-ceiling-safe', {
      startAt: '+275760-09-12T23:59:00.000Z',
      scheduledStartAt: '+275760-09-12T23:59:00.000Z',
    });
    const safeHarness = createA2Harness({tasks: [safeBaseline]});

    await expect(
      safeHarness.service.delay(
        safeBaseline.id,
        {minutes: 1},
        operation('schedule:delay:exact-js-ceiling'),
      ),
    ).resolves.toMatchObject({
      startAt: exactCeiling,
      scheduledStartAt: exactCeiling,
    });
    expect(safeHarness.storage.setCommits).toHaveLength(1);

    const overflowCases = [
      {
        id: 'near-ceiling',
        startAt: '+275760-09-12T23:59:30.000Z',
        minutes: 1,
      },
      {
        id: 'max-safe-minutes',
        startAt: A2_NOW,
        minutes: Number.MAX_SAFE_INTEGER,
      },
    ];
    for (const entry of overflowCases) {
      const baseline = makeTask(`delay-overflow-${entry.id}`, {
        startAt: entry.startAt,
        scheduledStartAt: entry.startAt,
      });
      const clock = new SequenceClock([A2_NOW]);
      const {service, storage} = createA2Harness({
        tasks: [baseline],
        now: clock.now,
      });
      const rawBefore = storage.raw();

      await expectErrorCode(
        () =>
          service.delay(
            baseline.id,
            {minutes: entry.minutes},
            operation(`schedule:delay:overflow:${entry.id}`),
          ),
        'INVALID_TIME_RANGE',
      );

      expect(storage.raw()).toBe(rawBefore);
      expect(storage.setAttempts).toEqual([]);
      expect(storage.setCommits).toEqual([]);
    }
  });

  it('rejects every non-positive, non-finite, fractional, and unsafe delay', async () => {
    const invalidValues = [
      0,
      -0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ];

    for (const [index, minutes] of invalidValues.entries()) {
      const baseline = makeTask(`invalid-delay-${index}`);
      const {service, storage} = createA2Harness({tasks: [baseline]});
      const rawBefore = storage.raw();
      await expectErrorCode(
        () =>
          service.delay(
            baseline.id,
            {minutes},
            operation(`schedule:delay:invalid:${index}`),
          ),
        'INVALID_DELAY_MINUTES',
      );
      expect(storage.raw()).toBe(rawBefore);
      expect(storage.setCommits).toEqual([]);
    }
  });

  it('accepts null or positive safe estimates and rejects all other duration boundaries', async () => {
    const valid = [null, 1, 1440, Number.MAX_SAFE_INTEGER];
    for (const [index, estimatedMinutes] of valid.entries()) {
      const {service} = createA2Harness();
      await expect(
        service.create(
          {
            title: `valid estimate ${index}`,
            important: false,
            urgent: false,
            estimatedMinutes,
          },
          operation(`schedule:estimate:valid:${index}`),
        ),
      ).resolves.toMatchObject({estimatedMinutes});
    }

    const invalid = [
      0,
      -0,
      -1,
      0.5,
      Number.NaN,
      Number.NEGATIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ];
    for (const [index, estimatedMinutes] of invalid.entries()) {
      const {service, storage} = createA2Harness();
      await expectErrorCode(
        () =>
          service.create(
            {
              title: `invalid estimate ${index}`,
              important: false,
              urgent: false,
              estimatedMinutes,
            },
            operation(`schedule:estimate:invalid:${index}`),
          ),
        'INVALID_ESTIMATED_MINUTES',
      );
      expect(storage.setCommits).toEqual([]);
    }
  });

  it('never copies planned time into actual startedAt and records implicit start at completion time', async () => {
    const baseline = makeTask('planned-versus-actual');
    const clock = new SequenceClock([A2_NOW, A2_LATER]);
    const {service} = createA2Harness({tasks: [baseline], now: clock.now});
    const scheduled = await service.reschedule(
      baseline.id,
      {scheduledStartAt: '2026-08-05T12:00:00.000Z'},
      operation('schedule:not-actual:reschedule'),
    );
    expect(scheduled.startedAt).toBeNull();

    const completed = await service.complete(
      baseline.id,
      operation('schedule:not-actual:complete'),
    );
    expect(completed.task.startAt).toBe('2026-08-05T12:00:00.000Z');
    expect(completed.task.scheduledStartAt).toBe(
      '2026-08-05T12:00:00.000Z',
    );
    expect(completed.task.startedAt).toBe(A2_LATER);
    expect(completed.task.completedAt).toBe(A2_LATER);
  });

  it.each([
    {
      label: 'completed',
      task: makeCompletedTask('schedule-terminal-completed'),
    },
    {
      label: 'cancelled',
      task: makeCancelledTask('schedule-terminal-cancelled'),
    },
  ])(
    'rejects reschedule and delay for a non-deleted $label task',
    async ({label, task}) => {
      const terminalHarness = createA2Harness({tasks: [task]});
      const rawBefore = terminalHarness.storage.raw();
      await expectErrorCode(
        () =>
          terminalHarness.service.reschedule(
            task.id,
            {scheduledStartAt: null},
            operation(`schedule:terminal:reschedule:${label}`),
          ),
        'TERMINAL_TASK',
      );
      await expectErrorCode(
        () =>
          terminalHarness.service.delay(
            task.id,
            {minutes: 5},
            operation(`schedule:terminal:delay:${label}`),
          ),
        'TERMINAL_TASK',
      );
      expect(terminalHarness.storage.raw()).toBe(rawBefore);
      expect(terminalHarness.storage.setAttempts).toEqual([]);
    },
  );
});
