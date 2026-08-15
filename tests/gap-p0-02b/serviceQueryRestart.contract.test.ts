import {createFocusSessionService} from '../../src/application/focusSessionService';
import type {FocusSession} from '../../src/domain/focusSession';
import {
  completedSession,
  createServiceHarness,
  expectRejectCode,
  interruptedSession,
  invokeGetById,
  invokeListForTask,
  makeSession,
  ManualIsoClock,
  SequenceIdGenerator,
  TransactionalMemoryFocusRepository,
  ZERO_REPOSITORY_COUNTERS,
} from './focusSessionTestKit';

describe('GAP-P0-02B query, isolation, and service reconstruction', () => {
  it('returns a complete task history newest-first with ID tie-break and the task active session', async () => {
    const old = completedSession({
      id: 'focus-old',
      taskId: 'task-a',
      startedAt: '2026-08-05T07:00:00.000Z',
      createdAt: '2026-08-05T07:00:00.000Z',
      plannedEndAt: '2026-08-05T07:05:00.000Z',
      endedAt: '2026-08-05T07:05:00.000Z',
      updatedAt: '2026-08-05T07:05:00.000Z',
    });
    const tieB = interruptedSession({
      id: 'focus-b',
      taskId: 'task-a',
      startedAt: '2026-08-05T07:30:00.000Z',
      createdAt: '2026-08-05T07:30:00.000Z',
      plannedEndAt: '2026-08-05T07:35:00.000Z',
      endedAt: '2026-08-05T07:31:00.000Z',
      actualSeconds: 60,
      updatedAt: '2026-08-05T07:31:00.000Z',
    });
    const tieA = completedSession({
      id: 'focus-a',
      taskId: 'task-a',
      startedAt: tieB.startedAt,
      createdAt: tieB.createdAt,
      plannedEndAt: tieB.plannedEndAt,
      endedAt: '2026-08-05T07:35:00.000Z',
      updatedAt: '2026-08-05T07:35:00.000Z',
    });
    const active = makeSession({id: 'focus-active', taskId: 'task-a'});
    const other = completedSession({id: 'focus-other', taskId: 'task-b'});
    const {service, repository, clock, ids} = createServiceHarness({
      seed: [old, tieB, other, active, tieA],
    });

    const result = await service.listForTask('  task-a  ');

    expect(result.taskId).toBe('task-a');
    expect(result.sessions.map(session => session.id)).toEqual([
      'focus-active',
      'focus-a',
      'focus-b',
      'focus-old',
    ]);
    expect(result.activeSession).toEqual(active);
    expect(repository.counters).toMatchObject({
      facadeList: 1,
      facadeLoad: 0,
      facadeGet: 0,
      transactions: 0,
    });
    expect({clock: clock.calls, ids: ids.calls}).toEqual({clock: 0, ids: 0});
  });

  it('returns the full unpaginated history rather than truncating ordinary task sessions', async () => {
    const sessions: FocusSession[] = Array.from({length: 40}, (_, index) =>
      completedSession({
        id: `focus-${String(index).padStart(2, '0')}`,
        taskId: 'task-many',
        startedAt: new Date(
          Date.parse('2026-08-01T00:00:00.000Z') + index * 600_000,
        ).toISOString(),
        createdAt: new Date(
          Date.parse('2026-08-01T00:00:00.000Z') + index * 600_000,
        ).toISOString(),
        plannedEndAt: new Date(
          Date.parse('2026-08-01T00:05:00.000Z') + index * 600_000,
        ).toISOString(),
        endedAt: new Date(
          Date.parse('2026-08-01T00:05:00.000Z') + index * 600_000,
        ).toISOString(),
        updatedAt: new Date(
          Date.parse('2026-08-01T00:05:00.000Z') + index * 600_000,
        ).toISOString(),
      }),
    );
    const {service} = createServiceHarness({seed: sessions});

    const result = await service.listForTask('task-many');

    expect(result.sessions).toHaveLength(40);
    expect(result.sessions[0]?.id).toBe('focus-39');
    expect(result.sessions[39]?.id).toBe('focus-00');
  });

  it('normalizes getById and returns null for a syntactically valid missing ID', async () => {
    const session = completedSession();
    const {service, repository, clock, ids} = createServiceHarness({
      seed: [session],
    });

    await expect(service.getById(`  ${session.id}  `)).resolves.toEqual(session);
    await expect(service.getById('focus-missing')).resolves.toBeNull();

    expect(repository.counters.facadeGet).toBe(2);
    expect(repository.counters.transactions).toBe(0);
    expect({clock: clock.calls, ids: ids.calls}).toEqual({clock: 0, ids: 0});
  });

  it.each([
    {method: 'getById', value: '   ', code: 'FOCUS_SESSION_INVALID_ID'},
    {method: 'getById', value: 'focus\ninvalid', code: 'FOCUS_SESSION_INVALID_ID'},
    {method: 'getById', value: null, code: 'FOCUS_SESSION_INVALID_ID'},
    {method: 'getById', value: {invalid: true}, code: 'FOCUS_SESSION_INVALID_ID'},
    {method: 'listForTask', value: '   ', code: 'FOCUS_SESSION_INVALID_TASK_ID'},
    {method: 'listForTask', value: 'task\tinvalid', code: 'FOCUS_SESSION_INVALID_TASK_ID'},
    {method: 'listForTask', value: null, code: 'FOCUS_SESSION_INVALID_TASK_ID'},
    {method: 'listForTask', value: {invalid: true}, code: 'FOCUS_SESSION_INVALID_TASK_ID'},
  ])(
    'rejects invalid $method input before repository access',
    async testCase => {
      const {service, repository, clock, ids} = createServiceHarness();
      const promise =
        testCase.method === 'getById'
          ? invokeGetById(service, testCase.value)
          : invokeListForTask(service, testCase.value);

      await expectRejectCode(promise, testCase.code);
      expect(repository.counters).toEqual(ZERO_REPOSITORY_COUNTERS);
      expect({clock: clock.calls, ids: ids.calls}).toEqual({clock: 0, ids: 0});
    },
  );

  it('detaches returned records and query arrays from repository state and from later calls', async () => {
    const active = makeSession();
    const terminal = completedSession({id: 'focus-terminal'});
    const {service, repository} = createServiceHarness({seed: [terminal, active]});

    const first = await service.listForTask('task-001');
    Object.assign(first.sessions[0] ?? {}, {taskId: 'mutated-task'});
    Object.assign(first.activeSession ?? {}, {status: 'completed'});
    Object.assign(first.sessions, {0: makeSession({id: 'injected'})});

    const second = await service.listForTask('task-001');
    expect(second.sessions.map(session => session.id)).toEqual([
      'focus-001',
      'focus-terminal',
    ]);
    expect(second.activeSession).toEqual(active);
    expect(repository.snapshot()).toEqual([terminal, active]);
    expect(second).not.toBe(first);
    expect(second.sessions).not.toBe(first.sessions);
  });

  it('reconstructs a fresh service over the same repository without losing the active record', async () => {
    const repository = new TransactionalMemoryFocusRepository();
    const firstService = createFocusSessionService({
      repository,
      now: new ManualIsoClock().now,
      idGenerator: new SequenceIdGenerator(['focus-restart']).next,
    });
    const started = await firstService.start({
      taskId: 'task-restart',
      plannedMinutes: 25,
    });

    const reconstructed = createFocusSessionService({
      repository,
      now: new ManualIsoClock('2026-08-05T08:10:00.000Z').now,
      idGenerator: new SequenceIdGenerator(['must-not-consume']).next,
    });

    await expect(reconstructed.restore()).resolves.toEqual(started);
    await expect(reconstructed.getById(started.id)).resolves.toEqual(started);
    await expect(reconstructed.listForTask(started.taskId)).resolves.toMatchObject({
      activeSession: started,
      sessions: [started],
    });
  });

  it('returns null from getActive and restore without clock, write, or ID calls when history is terminal-only', async () => {
    const terminal = completedSession();
    const {service, repository, clock, ids} = createServiceHarness({
      seed: [terminal],
    });

    await expect(service.getActive()).resolves.toBeNull();
    await expect(service.restore()).resolves.toBeNull();

    expect(repository.counters).toMatchObject({
      transactions: 2,
      transactionLoad: 2,
      transactionSave: 0,
      commits: 0,
    });
    expect({clock: clock.calls, ids: ids.calls}).toEqual({clock: 0, ids: 0});
  });

  it('propagates query read failure without substituting empty history and recovers on retry', async () => {
    const terminal = completedSession();
    const {service, repository, clock, ids} = createServiceHarness({
      seed: [terminal],
    });
    repository.failNextRead();

    await expectRejectCode(
      service.listForTask('task-001'),
      'TEST_REPOSITORY_READ_FAILED',
    );
    expect({clock: clock.calls, ids: ids.calls}).toEqual({clock: 0, ids: 0});
    await expect(service.listForTask('task-001')).resolves.toMatchObject({
      sessions: [terminal],
    });
    expect({clock: clock.calls, ids: ids.calls}).toEqual({clock: 0, ids: 0});
  });
});
