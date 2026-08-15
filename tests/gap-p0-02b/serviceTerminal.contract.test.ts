import {createFocusSessionService} from '../../src/application/focusSessionService';
import {
  BASE_TIME,
  completedSession,
  createServiceHarness,
  expectRejectCode,
  interruptedSession,
  invokeFinish,
  invokeInterrupt,
  makeSession,
  ManualIsoClock,
  SequenceIdGenerator,
  TransactionalMemoryFocusRepository,
  ZERO_REPOSITORY_COUNTERS,
} from './focusSessionTestKit';

describe('GAP-P0-02B terminal state machine and authoritative time', () => {
  it('finishes a running session using one clock sample and floored elapsed seconds', async () => {
    const active = makeSession();
    const endedAt = '2026-08-05T08:02:05.999Z';
    const {service, repository, clock, ids} = createServiceHarness({
      seed: [active],
      now: endedAt,
    });

    const result = await service.finish(active.id);

    expect(result).toEqual({
      ...active,
      status: 'completed',
      endedAt,
      actualSeconds: 125,
      interruptionReason: null,
      updatedAt: endedAt,
    });
    expect(repository.snapshot()).toEqual([result]);
    expect(repository.counters).toMatchObject({
      transactions: 1,
      transactionGet: 1,
      transactionSave: 1,
      commits: 1,
    });
    expect({clock: clock.calls, ids: ids.calls}).toEqual({clock: 1, ids: 0});
  });

  it('interrupts with a trimmed first reason and exact elapsed seconds', async () => {
    const active = makeSession();
    const endedAt = '2026-08-05T08:01:30.000Z';
    const {service, repository, clock, ids} = createServiceHarness({
      seed: [active],
      now: endedAt,
    });

    const result = await service.interrupt(
      `  ${active.id}  `,
      '  urgent call  ',
    );

    expect(result).toEqual({
      ...active,
      status: 'interrupted',
      endedAt,
      actualSeconds: 90,
      interruptionReason: 'urgent call',
      updatedAt: endedAt,
    });
    expect(repository.snapshot()).toEqual([result]);
    expect({clock: clock.calls, ids: ids.calls}).toEqual({clock: 1, ids: 0});
  });

  it.each([
    completedSession(),
    interruptedSession(),
  ])('keeps a terminal session irreversible across finish and interrupt retries', async terminal => {
    const {service, repository, clock, ids} = createServiceHarness({
      seed: [terminal],
    });

    const finished = await service.finish(`  ${terminal.id}  `);
    const interrupted = await service.interrupt(terminal.id, 'new reason');

    expect(finished).toEqual(terminal);
    expect(interrupted).toEqual(terminal);
    expect(repository.snapshot()).toEqual([terminal]);
    expect(repository.counters).toMatchObject({
      transactions: 2,
      transactionGet: 2,
      transactionSave: 0,
      commits: 0,
    });
    expect({clock: clock.calls, ids: ids.calls}).toEqual({clock: 0, ids: 0});
  });

  it('preserves the first interruption reason on repeated interrupt calls', async () => {
    const active = makeSession();
    const {service, repository, clock} = createServiceHarness({
      seed: [active],
      now: '2026-08-05T08:00:30.000Z',
    });

    const first = await service.interrupt(active.id, 'first reason');
    clock.set('2026-08-05T08:01:00.000Z');
    const replay = await service.interrupt(active.id, 'second reason');

    expect(replay).toEqual(first);
    expect(replay.interruptionReason).toBe('first reason');
    expect(repository.snapshot()).toEqual([first]);
    expect(repository.counters.commits).toBe(1);
    expect(clock.calls).toBe(1);
  });

  it('linearizes finish versus interrupt so both callers observe the same first terminal record', async () => {
    const active = makeSession();
    const repository = new TransactionalMemoryFocusRepository([active]);
    const clockA = new ManualIsoClock('2026-08-05T08:01:00.000Z');
    const clockB = new ManualIsoClock('2026-08-05T08:01:01.000Z');
    const serviceA = createFocusSessionService({
      repository,
      now: clockA.now,
      idGenerator: new SequenceIdGenerator().next,
    });
    const serviceB = createFocusSessionService({
      repository,
      now: clockB.now,
      idGenerator: new SequenceIdGenerator().next,
    });

    const [finished, interrupted] = await Promise.all([
      serviceA.finish(active.id),
      serviceB.interrupt(active.id, 'race reason'),
    ]);

    expect(finished).toEqual(interrupted);
    expect(['completed', 'interrupted']).toContain(finished.status);
    expect(repository.snapshot()).toEqual([finished]);
    expect(repository.counters.commits).toBe(1);
    expect(clockA.calls + clockB.calls).toBe(1);
  });

  it('restore atomically completes an overdue session at plannedEndAt rather than late wall time', async () => {
    const active = makeSession();
    const {service, repository, clock} = createServiceHarness({
      seed: [active],
      now: '2026-08-05T08:12:00.000Z',
    });

    await expect(service.restore()).resolves.toBeNull();

    expect(repository.snapshot()).toEqual([
      {
        ...active,
        status: 'completed',
        endedAt: active.plannedEndAt,
        actualSeconds: 300,
        interruptionReason: null,
        updatedAt: active.plannedEndAt,
      },
    ]);
    expect(clock.calls).toBe(1);
    expect(repository.counters.transactionSave).toBe(1);
  });

  it('restore completes exactly at the deadline with one atomic load/save and detached persistence', async () => {
    const active = makeSession();
    const expected = {
      ...active,
      status: 'completed',
      endedAt: active.plannedEndAt,
      actualSeconds: active.plannedMinutes * 60,
      interruptionReason: null,
      updatedAt: active.plannedEndAt,
    };
    const {service, repository, clock, ids} = createServiceHarness({
      seed: [active],
      now: active.plannedEndAt,
    });

    const returned = await service.restore();

    expect(returned).toBeNull();
    expect(repository.snapshot()).toEqual([expected]);
    expect(repository.counters).toEqual({
      ...ZERO_REPOSITORY_COUNTERS,
      transactions: 1,
      transactionLoad: 1,
      transactionSave: 1,
      commits: 1,
    });
    expect({clock: clock.calls, ids: ids.calls}).toEqual({clock: 1, ids: 0});
    expect(expected).toMatchObject({
      endedAt: active.plannedEndAt,
      actualSeconds: active.plannedMinutes * 60,
      updatedAt: active.plannedEndAt,
    });

    const exposedPersistence = repository.snapshot();
    expect(exposedPersistence[0]).not.toBe(active);
    Object.assign(exposedPersistence[0] ?? {}, {
      taskId: 'caller-mutated-persisted-view',
      actualSeconds: 1,
    });
    Object.assign(active, {taskId: 'caller-mutated-seed'});
    expect(repository.snapshot()).toEqual([expected]);
  });

  it('getActive performs the same overdue reconciliation at the exact deadline', async () => {
    const active = makeSession();
    const {service, repository} = createServiceHarness({
      seed: [active],
      now: active.plannedEndAt,
    });

    await expect(service.getActive()).resolves.toBeNull();
    expect(repository.snapshot()[0]).toMatchObject({
      status: 'completed',
      endedAt: active.plannedEndAt,
      actualSeconds: 300,
    });
  });

  it('restore returns a pre-deadline active session without write or ID consumption', async () => {
    const active = makeSession();
    const {service, repository, clock, ids} = createServiceHarness({
      seed: [active],
      now: '2026-08-05T08:04:59.999Z',
    });

    await expect(service.restore()).resolves.toEqual(active);
    expect(repository.snapshot()).toEqual([active]);
    expect(repository.counters.transactionSave).toBe(0);
    expect(repository.counters.commits).toBe(0);
    expect({clock: clock.calls, ids: ids.calls}).toEqual({clock: 1, ids: 0});
  });

  it('getActive returns a detached pre-deadline record within one-load/one-clock budget', async () => {
    const active = makeSession();
    const {service, repository, clock, ids} = createServiceHarness({
      seed: [active],
      now: '2026-08-05T08:04:59.999Z',
    });

    const returned = await service.getActive();
    expect(returned).toEqual(active);
    expect(returned).not.toBe(active);
    Object.assign(returned ?? {}, {taskId: 'mutated-caller'});

    expect(repository.snapshot()).toEqual([active]);
    expect(repository.counters).toMatchObject({
      transactions: 1,
      transactionLoad: 1,
      transactionSave: 0,
      commits: 0,
    });
    expect({clock: clock.calls, ids: ids.calls}).toEqual({clock: 1, ids: 0});
  });

  it.each(['finish', 'interrupt'])(
    'gives deadline completion precedence over a late %s request',
    async method => {
      const active = makeSession();
      const {service, repository} = createServiceHarness({
        seed: [active],
        now: '2026-08-05T08:20:00.000Z',
      });

      const result =
        method === 'finish'
          ? await service.finish(active.id)
          : await service.interrupt(active.id, 'too late');

      expect(result).toMatchObject({
        status: 'completed',
        endedAt: active.plannedEndAt,
        actualSeconds: 300,
        interruptionReason: null,
      });
      expect(repository.snapshot()).toEqual([result]);
    },
  );

  it('gives deadline completion precedence when interrupt occurs exactly at the deadline', async () => {
    const active = makeSession();
    const {service, repository, clock, ids} = createServiceHarness({
      seed: [active],
      now: active.plannedEndAt,
    });

    const result = await service.interrupt(active.id, 'exactly too late');

    expect(result).toEqual({
      ...active,
      status: 'completed',
      endedAt: active.plannedEndAt,
      actualSeconds: 300,
      interruptionReason: null,
      updatedAt: active.plannedEndAt,
    });
    expect(repository.snapshot()).toEqual([result]);
    expect(repository.counters).toMatchObject({
      transactions: 1,
      transactionGet: 1,
      transactionSave: 1,
      commits: 1,
    });
    expect({clock: clock.calls, ids: ids.calls}).toEqual({clock: 1, ids: 0});
  });

  it('rejects a backward wall-clock jump without negative duration or mutation and recovers later', async () => {
    const active = makeSession();
    const {service, repository, clock} = createServiceHarness({
      seed: [active],
      now: '2026-08-05T07:59:59.999Z',
    });

    await expectRejectCode(
      service.finish(active.id),
      'FOCUS_SESSION_INVALID_CLOCK',
    );
    expect(repository.snapshot()).toEqual([active]);
    expect(repository.counters.transactionSave).toBe(0);

    clock.set('2026-08-05T08:00:10.000Z');
    await expect(service.finish(active.id)).resolves.toMatchObject({
      status: 'completed',
      actualSeconds: 10,
    });
  });

  it.each([
    {id: '', reason: 'reason', method: 'finish', code: 'FOCUS_SESSION_INVALID_ID'},
    {id: '   ', reason: 'reason', method: 'finish', code: 'FOCUS_SESSION_INVALID_ID'},
    {id: 'focus\ninvalid', reason: 'reason', method: 'finish', code: 'FOCUS_SESSION_INVALID_ID'},
    {id: null, reason: 'reason', method: 'finish', code: 'FOCUS_SESSION_INVALID_ID'},
    {id: {invalid: true}, reason: 'reason', method: 'finish', code: 'FOCUS_SESSION_INVALID_ID'},
    {id: '', reason: 'reason', method: 'interrupt', code: 'FOCUS_SESSION_INVALID_ID'},
    {id: '   ', reason: 'reason', method: 'interrupt', code: 'FOCUS_SESSION_INVALID_ID'},
    {id: 'focus\ninvalid', reason: 'reason', method: 'interrupt', code: 'FOCUS_SESSION_INVALID_ID'},
    {id: null, reason: 'reason', method: 'interrupt', code: 'FOCUS_SESSION_INVALID_ID'},
    {id: {invalid: true}, reason: 'reason', method: 'interrupt', code: 'FOCUS_SESSION_INVALID_ID'},
    {id: {invalid: true}, reason: null, method: 'interrupt', code: 'FOCUS_SESSION_INVALID_ID'},
    {id: {invalid: true}, reason: '   ', method: 'interrupt', code: 'FOCUS_SESSION_INVALID_ID'},
    {id: '   ', reason: null, method: 'interrupt', code: 'FOCUS_SESSION_INVALID_ID'},
    {id: '   ', reason: '   ', method: 'interrupt', code: 'FOCUS_SESSION_INVALID_ID'},
    {id: 'focus-001', reason: '', method: 'interrupt', code: 'FOCUS_SESSION_INVALID_REASON'},
    {id: 'focus-001', reason: '   ', method: 'interrupt', code: 'FOCUS_SESSION_INVALID_REASON'},
    {id: 'focus-001', reason: null, method: 'interrupt', code: 'FOCUS_SESSION_INVALID_REASON'},
    {id: 'focus-001', reason: {invalid: true}, method: 'interrupt', code: 'FOCUS_SESSION_INVALID_REASON'},
  ])('rejects invalid terminal input before repository or clock I/O: $method', async testCase => {
    const {service, repository, clock, ids} = createServiceHarness({
      seed: [makeSession()],
    });
    const promise =
      testCase.method === 'finish'
        ? invokeFinish(service, testCase.id)
        : invokeInterrupt(service, testCase.id, testCase.reason);

    await expectRejectCode(promise, testCase.code);
    expect(repository.counters).toEqual(ZERO_REPOSITORY_COUNTERS);
    expect({clock: clock.calls, ids: ids.calls}).toEqual({clock: 0, ids: 0});
  });

  it.each(['finish', 'interrupt'])(
    'reports a missing session for %s without consuming the clock or saving',
    async method => {
      const {service, repository, clock, ids} = createServiceHarness();
      const promise =
        method === 'finish'
          ? service.finish('focus-missing')
          : service.interrupt('focus-missing', 'reason');

      await expectRejectCode(promise, 'FOCUS_SESSION_NOT_FOUND');
      expect({clock: clock.calls, ids: ids.calls}).toEqual({clock: 0, ids: 0});
      expect(repository.counters.transactionSave).toBe(0);
    },
  );

  it('rolls back a failed terminal save and retries from the original running record', async () => {
    const active = makeSession();
    const {service, repository} = createServiceHarness({
      seed: [active],
      now: '2026-08-05T08:01:00.000Z',
    });
    repository.failNextSave();

    await expectRejectCode(
      service.finish(active.id),
      'TEST_REPOSITORY_SAVE_FAILED',
    );
    expect(repository.snapshot()).toEqual([active]);

    const retry = await service.finish(active.id);
    expect(retry).toMatchObject({status: 'completed', actualSeconds: 60});
    expect(repository.snapshot()).toEqual([retry]);
    expect(repository.counters.commits).toBe(1);
  });

  it.each(['getActive', 'restore', 'getById', 'finish', 'interrupt'])(
    'propagates %s read failure without clock/mutation and succeeds on retry',
    async method => {
      const active = makeSession();
      const {service, repository, clock} = createServiceHarness({
        seed: [active],
        now: '2026-08-05T08:01:00.000Z',
      });
      repository.failNextRead();
      const first =
        method === 'getActive'
          ? service.getActive()
          : method === 'restore'
            ? service.restore()
            : method === 'getById'
              ? service.getById(active.id)
              : method === 'finish'
                ? service.finish(active.id)
                : service.interrupt(active.id, 'retry reason');

      await expectRejectCode(first, 'TEST_REPOSITORY_READ_FAILED');
      expect(repository.snapshot()).toEqual([active]);
      expect(repository.counters.transactionSave).toBe(0);
      expect(clock.calls).toBe(0);

      const retry =
        method === 'getActive'
          ? service.getActive()
          : method === 'restore'
            ? service.restore()
            : method === 'getById'
              ? service.getById(active.id)
              : method === 'finish'
                ? service.finish(active.id)
                : service.interrupt(active.id, 'retry reason');
      await expect(retry).resolves.toMatchObject({id: active.id});
      if (method === 'finish' || method === 'interrupt') {
        expect(repository.snapshot()[0]?.status).not.toBe('running');
      } else {
        expect(repository.snapshot()).toEqual([active]);
      }
    },
  );

  it.each(['getActive', 'restore', 'finish', 'interrupt'])(
    'rejects noncanonical clock from %s without changing the running record',
    async method => {
      const active = makeSession();
      const {service, repository, clock} = createServiceHarness({
        seed: [active],
        now: '2026-08-05T08:01:00Z',
      });
      const operation =
        method === 'getActive'
          ? service.getActive()
          : method === 'restore'
            ? service.restore()
            : method === 'finish'
              ? service.finish(active.id)
              : service.interrupt(active.id, 'reason');

      await expectRejectCode(operation, 'FOCUS_SESSION_INVALID_CLOCK');

      expect(repository.snapshot()).toEqual([active]);
      expect(repository.counters.transactionSave).toBe(0);
      expect(clock.calls).toBe(1);
    },
  );
});
