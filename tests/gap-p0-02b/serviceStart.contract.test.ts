import {createFocusSessionService} from '../../src/application/focusSessionService';
import type {FocusDurationMinutes} from '../../src/domain/focusSession';
import {
  BASE_TIME,
  createServiceHarness,
  expectRejectCode,
  input,
  invokeStart,
  makeSession,
  ManualIsoClock,
  SequenceIdGenerator,
  TransactionalMemoryFocusRepository,
  ZERO_REPOSITORY_COUNTERS,
} from './focusSessionTestKit';

const SUPPORTED_DURATIONS: readonly FocusDurationMinutes[] = [
  2,
  5,
  15,
  25,
  50,
];

describe('GAP-P0-02B focus-session start behavior', () => {
  it.each(SUPPORTED_DURATIONS)(
    'starts a canonical immutable running record for %i minutes with one atomic commit',
    async plannedMinutes => {
      const id = `focus-${String(plannedMinutes)}`;
      const {repository, clock, ids, service} = createServiceHarness({
        ids: [id],
      });

      const result = await service.start(input('task-001', plannedMinutes));

      expect(result).toEqual({
        id,
        taskId: 'task-001',
        plannedMinutes,
        status: 'running',
        startedAt: BASE_TIME,
        plannedEndAt: new Date(
          Date.parse(BASE_TIME) + plannedMinutes * 60_000,
        ).toISOString(),
        endedAt: null,
        actualSeconds: null,
        interruptionReason: null,
        createdAt: BASE_TIME,
        updatedAt: BASE_TIME,
      });
      expect(repository.snapshot()).toEqual([result]);
      expect(repository.counters).toMatchObject({
        facadeLoad: 0,
        facadeSave: 0,
        transactions: 1,
        transactionLoad: 1,
        transactionSave: 1,
        commits: 1,
      });
      expect({clock: clock.calls, ids: ids.calls}).toEqual({clock: 1, ids: 1});
    },
  );

  it('trims task and generated IDs once before persistence', async () => {
    const {service, repository} = createServiceHarness({
      ids: ['  focus-normalized  '],
    });

    const result = await service.start(input('  task-normalized  ', 5));

    expect(result).toMatchObject({
      id: 'focus-normalized',
      taskId: 'task-normalized',
    });
    expect(repository.snapshot()).toEqual([result]);
  });

  it.each(['task-missing', 'task-deleted', 'task-completed'])(
    'treats %s as an opaque stable association without hidden task-repository I/O',
    async taskId => {
      const {service} = createServiceHarness({ids: [`focus-${taskId}`]});
      await expect(service.start(input(taskId, 5))).resolves.toMatchObject({
        taskId,
        status: 'running',
      });
    },
  );

  it('replays a matching non-overdue active start without ID, save, or second record', async () => {
    const active = makeSession();
    const {service, repository, clock, ids} = createServiceHarness({
      seed: [active],
    });

    const replay = await service.start(input('  task-001  ', 5));

    expect(replay).toEqual(active);
    expect(repository.snapshot()).toEqual([active]);
    expect(repository.counters).toMatchObject({
      transactions: 1,
      transactionLoad: 1,
      transactionSave: 0,
      commits: 0,
    });
    expect({clock: clock.calls, ids: ids.calls}).toEqual({clock: 1, ids: 0});
  });

  it.each([
    input('task-other', 5),
    input('task-001', 25),
  ])('rejects a non-matching start while any active session exists', async next => {
    const active = makeSession();
    const {service, repository, clock, ids} = createServiceHarness({
      seed: [active],
    });

    await expectRejectCode(
      service.start(next),
      'FOCUS_SESSION_ACTIVE_CONFLICT',
    );

    expect(repository.snapshot()).toEqual([active]);
    expect(repository.counters.transactionSave).toBe(0);
    expect({clock: clock.calls, ids: ids.calls}).toEqual({clock: 1, ids: 0});
  });

  it('atomically completes an overdue active record and starts its replacement with one clock sample', async () => {
    const stale = makeSession();
    const now = '2026-08-05T08:10:00.000Z';
    const {service, repository, clock, ids} = createServiceHarness({
      seed: [stale],
      now,
      ids: ['focus-replacement'],
    });

    const replacement = await service.start(input('task-001', 5));

    expect(replacement).toMatchObject({
      id: 'focus-replacement',
      taskId: 'task-001',
      status: 'running',
      startedAt: now,
      plannedEndAt: '2026-08-05T08:15:00.000Z',
    });
    expect(repository.snapshot()).toEqual([
      {
        ...stale,
        status: 'completed',
        endedAt: stale.plannedEndAt,
        actualSeconds: 300,
        interruptionReason: null,
        updatedAt: stale.plannedEndAt,
      },
      replacement,
    ]);
    expect(repository.counters).toMatchObject({
      transactions: 1,
      transactionLoad: 1,
      transactionSave: 2,
      commits: 1,
    });
    expect({clock: clock.calls, ids: ids.calls}).toEqual({clock: 1, ids: 1});
  });

  it('atomically replaces an active record when start occurs exactly at its deadline', async () => {
    const stale = makeSession();
    const {service, repository, clock, ids} = createServiceHarness({
      seed: [stale],
      now: stale.plannedEndAt,
      ids: ['focus-at-deadline'],
    });

    const replacement = await service.start(
      input(stale.taskId, stale.plannedMinutes),
    );

    expect(repository.snapshot()).toEqual([
      {
        ...stale,
        status: 'completed',
        endedAt: stale.plannedEndAt,
        actualSeconds: 300,
        interruptionReason: null,
        updatedAt: stale.plannedEndAt,
      },
      replacement,
    ]);
    expect(replacement).toMatchObject({
      id: 'focus-at-deadline',
      taskId: stale.taskId,
      plannedMinutes: stale.plannedMinutes,
      startedAt: stale.plannedEndAt,
      plannedEndAt: '2026-08-05T08:10:00.000Z',
      status: 'running',
    });
    expect(repository.counters).toMatchObject({
      transactions: 1,
      transactionLoad: 1,
      transactionSave: 2,
      commits: 1,
    });
    expect({clock: clock.calls, ids: ids.calls}).toEqual({clock: 1, ids: 1});
  });

  it('starts a fresh session for the same task and duration after terminal history', async () => {
    const terminal = makeSession({
      status: 'completed',
      endedAt: '2026-08-05T08:05:00.000Z',
      actualSeconds: 300,
      updatedAt: '2026-08-05T08:05:00.000Z',
    });
    const now = '2026-08-05T09:00:00.000Z';
    const {service, repository, clock, ids} = createServiceHarness({
      seed: [terminal],
      now,
      ids: ['focus-fresh-after-terminal'],
    });

    const fresh = await service.start(
      input(terminal.taskId, terminal.plannedMinutes),
    );

    expect(fresh).toMatchObject({
      id: 'focus-fresh-after-terminal',
      taskId: terminal.taskId,
      plannedMinutes: terminal.plannedMinutes,
      status: 'running',
      startedAt: now,
      plannedEndAt: '2026-08-05T09:05:00.000Z',
    });
    expect(repository.snapshot()).toEqual([terminal, fresh]);
    expect(repository.counters).toMatchObject({
      transactions: 1,
      transactionLoad: 1,
      transactionSave: 1,
      commits: 1,
    });
    expect({clock: clock.calls, ids: ids.calls}).toEqual({clock: 1, ids: 1});
  });

  it('does not overwrite stale history when the replacement generator reuses the active ID', async () => {
    const stale = makeSession();
    const {service, repository, clock, ids} = createServiceHarness({
      seed: [stale],
      now: '2026-08-05T08:10:00.000Z',
      ids: [stale.id],
    });

    await expectRejectCode(
      service.start(input('task-replacement', 5)),
      'FOCUS_SESSION_ID_CONFLICT',
    );

    expect(repository.snapshot()).toEqual([stale]);
    expect(repository.counters.commits).toBe(0);
    expect({clock: clock.calls, ids: ids.calls}).toEqual({clock: 1, ids: 1});
  });

  it('linearizes concurrent matching starts from two service facades into one durable session', async () => {
    const repository = new TransactionalMemoryFocusRepository();
    const clockA = new ManualIsoClock();
    const clockB = new ManualIsoClock();
    const idsA = new SequenceIdGenerator(['focus-a']);
    const idsB = new SequenceIdGenerator(['focus-b']);
    const serviceA = createFocusSessionService({
      repository,
      now: clockA.now,
      idGenerator: idsA.next,
    });
    const serviceB = createFocusSessionService({
      repository,
      now: clockB.now,
      idGenerator: idsB.next,
    });

    const [left, right] = await Promise.all([
      serviceA.start(input('task-shared', 15)),
      serviceB.start(input('task-shared', 15)),
    ]);

    expect(left).toEqual(right);
    expect(repository.snapshot()).toEqual([left]);
    expect(repository.counters).toMatchObject({
      transactions: 2,
      transactionLoad: 2,
      transactionSave: 1,
      commits: 1,
    });
    expect(clockA.calls + clockB.calls).toBe(2);
    expect(idsA.calls + idsB.calls).toBe(1);
  });

  it('linearizes concurrent different starts into one winner and one typed conflict', async () => {
    const repository = new TransactionalMemoryFocusRepository();
    const serviceA = createFocusSessionService({
      repository,
      now: new ManualIsoClock().now,
      idGenerator: new SequenceIdGenerator(['focus-a']).next,
    });
    const serviceB = createFocusSessionService({
      repository,
      now: new ManualIsoClock().now,
      idGenerator: new SequenceIdGenerator(['focus-b']).next,
    });

    const outcomes = await Promise.allSettled([
      serviceA.start(input('task-a', 5)),
      serviceB.start(input('task-b', 25)),
    ]);
    const fulfilled = outcomes.filter(outcome => outcome.status === 'fulfilled');
    const rejected = outcomes.filter(outcome => outcome.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      reason: {code: 'FOCUS_SESSION_ACTIVE_CONFLICT'},
    });
    expect(repository.snapshot()).toHaveLength(1);
    expect(repository.counters.commits).toBe(1);
  });

  it.each([
    {value: null, code: 'FOCUS_SESSION_INVALID_INPUT'},
    {value: 'not-an-object', code: 'FOCUS_SESSION_INVALID_INPUT'},
    {value: 5, code: 'FOCUS_SESSION_INVALID_INPUT'},
    {value: false, code: 'FOCUS_SESSION_INVALID_INPUT'},
    {value: undefined, code: 'FOCUS_SESSION_INVALID_INPUT'},
    {value: {}, code: 'FOCUS_SESSION_INVALID_TASK_ID'},
    {value: {taskId: '   ', plannedMinutes: 5}, code: 'FOCUS_SESSION_INVALID_TASK_ID'},
    {value: {taskId: 'task\ninvalid', plannedMinutes: 5}, code: 'FOCUS_SESSION_INVALID_TASK_ID'},
    {value: {taskId: 'task', plannedMinutes: 1}, code: 'FOCUS_SESSION_INVALID_DURATION'},
    {value: {taskId: 'task', plannedMinutes: 10}, code: 'FOCUS_SESSION_INVALID_DURATION'},
    {value: {taskId: 'task', plannedMinutes: 60}, code: 'FOCUS_SESSION_INVALID_DURATION'},
    {value: {taskId: 'task', plannedMinutes: '5'}, code: 'FOCUS_SESSION_INVALID_DURATION'},
    {value: {taskId: 'task', plannedMinutes: 5, extra: true}, code: 'FOCUS_SESSION_INVALID_INPUT'},
  ])('rejects invalid start input before dependency consumption: $code', async testCase => {
    const {service, repository, clock, ids} = createServiceHarness();

    await expectRejectCode(
      invokeStart(service, testCase.value),
      testCase.code,
    );

    expect(repository.counters).toEqual(ZERO_REPOSITORY_COUNTERS);
    expect(repository.snapshot()).toEqual([]);
    expect({clock: clock.calls, ids: ids.calls}).toEqual({clock: 0, ids: 0});
  });

  it.each([
    '2026-08-05',
    '2026-08-05T08:00:00Z',
    '2026-08-05T16:00:00.000+08:00',
    ' 2026-08-05T08:00:00.000Z',
    'not-a-date',
  ])('rejects non-canonical injected clock value %s without generating or saving', async now => {
    const {service, repository, clock, ids} = createServiceHarness({now});

    await expectRejectCode(
      service.start(input('task-001', 5)),
      'FOCUS_SESSION_INVALID_CLOCK',
    );

    expect(clock.calls).toBe(1);
    expect(ids.calls).toBe(0);
    expect(repository.counters.transactionSave).toBe(0);
    expect(repository.snapshot()).toEqual([]);
  });

  it.each(['', '   ', 'focus\ninvalid', 'focus\tinvalid'])(
    'rejects invalid generated ID %j without persistence',
    async generatedId => {
      const {service, repository, clock, ids} = createServiceHarness({
        ids: [generatedId],
      });

      await expectRejectCode(
        service.start(input('task-001', 5)),
        'FOCUS_SESSION_INVALID_ID',
      );

      expect({clock: clock.calls, ids: ids.calls}).toEqual({clock: 1, ids: 1});
      expect(repository.counters.transactionSave).toBe(0);
      expect(repository.snapshot()).toEqual([]);
    },
  );

  it('rejects a generated ID already present in terminal history without overwriting it', async () => {
    const terminal = makeSession({
      id: 'focus-duplicate',
      status: 'completed',
      endedAt: '2026-08-05T08:05:00.000Z',
      actualSeconds: 300,
      updatedAt: '2026-08-05T08:05:00.000Z',
    });
    const {service, repository} = createServiceHarness({
      seed: [terminal],
      now: '2026-08-05T09:00:00.000Z',
      ids: ['focus-duplicate'],
    });

    await expectRejectCode(
      service.start(input('task-new', 2)),
      'FOCUS_SESSION_ID_CONFLICT',
    );

    expect(repository.snapshot()).toEqual([terminal]);
    expect(repository.counters.transactionSave).toBe(0);
  });

  it('rolls back a failed save and permits a clean retry without a ghost active session', async () => {
    const {service, repository} = createServiceHarness({
      ids: ['focus-failed', 'focus-retry'],
    });
    repository.failNextSave();

    await expectRejectCode(
      service.start(input('task-001', 5)),
      'TEST_REPOSITORY_SAVE_FAILED',
    );
    expect(repository.snapshot()).toEqual([]);

    const retry = await service.start(input('task-001', 5));
    expect(retry.id).toBe('focus-retry');
    expect(repository.snapshot()).toEqual([retry]);
    expect(repository.counters.commits).toBe(1);
  });

  it('propagates a read failure without consuming clock or ID and recovers on retry', async () => {
    const {service, repository, clock, ids} = createServiceHarness();
    repository.failNextRead();

    await expectRejectCode(
      service.start(input('task-001', 5)),
      'TEST_REPOSITORY_READ_FAILED',
    );
    expect({clock: clock.calls, ids: ids.calls}).toEqual({clock: 0, ids: 0});
    expect(repository.snapshot()).toEqual([]);

    await expect(service.start(input('task-001', 5))).resolves.toMatchObject({
      status: 'running',
    });
  });
});
