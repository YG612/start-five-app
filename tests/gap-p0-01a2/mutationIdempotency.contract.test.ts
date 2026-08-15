import type {TaskLifecycleService} from '../../src/application/coreAppService';
import {
  A2_LATER,
  A2_NOW,
  SequenceClock,
  SequenceIds,
  createA2Harness,
  expectErrorCode,
  makeCancelledTask,
  makeDeletedTask,
  makeInProgressTask,
  makeSubtask,
  makeTask,
  operation,
} from './a2Fixtures';

function makeCompletedNestedFixture() {
  return makeInProgressTask('complete-nested-done', {
    updatedAt: '2026-08-05T09:00:00.000Z',
    subtasks: [
      makeSubtask('complete-nested-done', 'complete-nested-done-step', {
        status: 'completed',
        updatedAt: '2026-08-05T09:00:00.000Z',
        completedAt: '2026-08-05T09:00:00.000Z',
      }),
    ],
  });
}

describe('GAP-P0-01A2 mutation, idempotency, deletion, and completion contract', () => {
  it('returns TASK_NOT_FOUND with zero durable writes for every existing-task mutation', async () => {
    const invocations: Array<{
      name: string;
      invoke(service: TaskLifecycleService): Promise<unknown>;
    }> = [
      {
        name: 'update',
        invoke: service =>
          service.update(
            'missing',
            {title: 'missing'},
            operation('missing:update'),
          ),
      },
      {
        name: 'softDelete',
        invoke: service =>
          service.softDelete('missing', operation('missing:soft-delete')),
      },
      {
        name: 'complete',
        invoke: service =>
          service.complete('missing', operation('missing:complete')),
      },
      {
        name: 'reschedule',
        invoke: service =>
          service.reschedule(
            'missing',
            {scheduledStartAt: A2_LATER},
            operation('missing:reschedule'),
          ),
      },
      {
        name: 'delay',
        invoke: service =>
          service.delay(
            'missing',
            {minutes: 5},
            operation('missing:delay'),
          ),
      },
    ];

    for (const scenario of invocations) {
      const {service, storage} = createA2Harness();
      const rawBefore = storage.raw();
      await expectErrorCode(() => scenario.invoke(service), 'TASK_NOT_FOUND');
      expect(storage.raw()).toBe(rawBefore);
      expect(storage.setCommits).toEqual([]);
    }
  });

  it('replays create by operation ID without consuming another ID, clock instant, or write', async () => {
    const clock = new SequenceClock([A2_NOW]);
    const ids = new SequenceIds(['idempotent-create']);
    const {service, storage} = createA2Harness({
      now: clock.now,
      idGenerator: ids.next,
    });
    const command = {
      title: '  Idempotent create  ',
      important: true,
      urgent: true,
      startAt: '2026-08-06T09:30:00+08:00',
    };
    const op = operation('idempotent:create');

    const first = await service.create(command, op);
    const replay = await service.create(
      {
        title: 'Idempotent create',
        important: true,
        urgent: true,
        scheduledStartAt: '2026-08-06T01:30:00.000Z',
      },
      {...op},
    );

    expect(replay).toEqual(first);
    expect(replay).not.toBe(first);
    expect(clock.consumed).toBe(1);
    expect(ids.consumed).toBe(1);
    expect(storage.setCommits).toHaveLength(1);
    expect(first.startAt).toBe('2026-08-06T01:30:00.000Z');
    expect(first.scheduledStartAt).toBe('2026-08-06T01:30:00.000Z');
  });

  it('replays a semantically equal trimmed update across planned-time aliases and offsets without observable work', async () => {
    const baseline = makeTask('semantic-update', {
      startAt: '2026-08-06T09:00:00.000Z',
      scheduledStartAt: '2026-08-06T09:00:00.000Z',
      dueAt: '2026-08-06T12:00:00.000Z',
      subtasks: [makeSubtask('semantic-update', 'semantic-update-step')],
    });
    const clock = new SequenceClock([A2_NOW]);
    const ids = new SequenceIds(['update-must-not-generate-id']);
    const {service, storage} = createA2Harness({
      tasks: [baseline],
      now: clock.now,
      idGenerator: ids.next,
    });
    const op = operation('semantic-replay:update');

    const first = await service.update(
      baseline.id,
      {
        title: '  Semantically equal update  ',
        startAt: '2026-08-06T18:30:00+08:00',
      },
      op,
    );
    const observableAfterFirst = {
      clock: clock.consumed,
      ids: ids.consumed,
      reads: storage.getCalls.length,
      writeAttempts: storage.setAttempts.length,
      writeCommits: storage.setCommits.length,
      raw: storage.raw(),
    };
    const replay = await service.update(
      baseline.id,
      {
        title: 'Semantically equal update',
        scheduledStartAt: '2026-08-06T10:30:00.000Z',
      },
      {...op},
    );

    expect(replay).toEqual(first);
    expect(replay).not.toBe(first);
    expect(replay.subtasks).not.toBe(first.subtasks);
    expect(replay.subtasks[0]).not.toBe(first.subtasks[0]);
    expect(replay).toMatchObject({
      title: 'Semantically equal update',
      startAt: '2026-08-06T10:30:00.000Z',
      scheduledStartAt: '2026-08-06T10:30:00.000Z',
    });
    expect({
      clock: clock.consumed,
      ids: ids.consumed,
      reads: storage.getCalls.length,
      writeAttempts: storage.setAttempts.length,
      writeCommits: storage.setCommits.length,
      raw: storage.raw(),
    }).toEqual(observableAfterFirst);
    expect(observableAfterFirst).toMatchObject({clock: 1, ids: 0});

    first.subtasks[0]!.title = 'Mutated first update result';
    expect(replay.subtasks[0]!.title).toBe('Step for semantic-update');
    replay.subtasks[0]!.title = 'Mutated replay update result';
    expect(first.subtasks[0]!.title).toBe('Mutated first update result');
    await expect(
      service.getById(baseline.id, {includeDeleted: true}),
    ).resolves.toMatchObject({
      title: 'Semantically equal update',
      subtasks: [{title: 'Step for semantic-update'}],
    });
  });

  it('replays a semantically equal reschedule across timezone offsets with deep-separated results and zero observable work', async () => {
    const baseline = makeTask('semantic-reschedule', {
      startAt: '2026-08-06T09:00:00.000Z',
      scheduledStartAt: '2026-08-06T09:00:00.000Z',
      dueAt: '2026-08-06T13:00:00.000Z',
      subtasks: [makeSubtask('semantic-reschedule', 'semantic-reschedule-step')],
    });
    const clock = new SequenceClock([A2_NOW]);
    const ids = new SequenceIds(['reschedule-must-not-generate-id']);
    const {service, storage} = createA2Harness({
      tasks: [baseline],
      now: clock.now,
      idGenerator: ids.next,
    });
    const op = operation('semantic-replay:reschedule');

    const first = await service.reschedule(
      baseline.id,
      {
        scheduledStartAt: '2026-08-06T18:30:00+08:00',
        dueAt: '2026-08-06T21:00:00+08:00',
      },
      op,
    );
    const observableAfterFirst = {
      clock: clock.consumed,
      ids: ids.consumed,
      reads: storage.getCalls.length,
      writeAttempts: storage.setAttempts.length,
      writeCommits: storage.setCommits.length,
      raw: storage.raw(),
    };
    const replay = await service.reschedule(
      baseline.id,
      {
        scheduledStartAt: '2026-08-06T10:30:00.000Z',
        dueAt: '2026-08-06T13:00:00.000Z',
      },
      {...op},
    );

    expect(replay).toEqual(first);
    expect(replay).not.toBe(first);
    expect(replay.subtasks).not.toBe(first.subtasks);
    expect(replay.subtasks[0]).not.toBe(first.subtasks[0]);
    expect(replay).toMatchObject({
      startAt: '2026-08-06T10:30:00.000Z',
      scheduledStartAt: '2026-08-06T10:30:00.000Z',
      dueAt: '2026-08-06T13:00:00.000Z',
    });
    expect({
      clock: clock.consumed,
      ids: ids.consumed,
      reads: storage.getCalls.length,
      writeAttempts: storage.setAttempts.length,
      writeCommits: storage.setCommits.length,
      raw: storage.raw(),
    }).toEqual(observableAfterFirst);
    expect(observableAfterFirst).toMatchObject({clock: 1, ids: 0});

    first.subtasks[0]!.title = 'Mutated first reschedule result';
    expect(replay.subtasks[0]!.title).toBe('Step for semantic-reschedule');
    replay.subtasks[0]!.title = 'Mutated replay reschedule result';
    expect(first.subtasks[0]!.title).toBe('Mutated first reschedule result');
    await expect(
      service.getById(baseline.id, {includeDeleted: true}),
    ).resolves.toMatchObject({
      startAt: '2026-08-06T10:30:00.000Z',
      scheduledStartAt: '2026-08-06T10:30:00.000Z',
      subtasks: [{title: 'Step for semantic-reschedule'}],
    });
  });

  it('requires a non-blank operation ID for every mutation without reading or writing storage', async () => {
    const baseline = makeInProgressTask('operation-id-required');
    const invocations: Array<
      (service: TaskLifecycleService) => Promise<unknown>
    > = [
      service =>
        service.create(
          {title: 'Missing operation', important: false, urgent: false},
          operation('   '),
        ),
      service =>
        service.update(
          baseline.id,
          {title: 'Missing operation'},
          operation(''),
        ),
      service => service.softDelete(baseline.id, operation('   ')),
      service => service.complete(baseline.id, operation('')),
      service =>
        service.reschedule(
          baseline.id,
          {scheduledStartAt: A2_LATER},
          operation('   '),
        ),
      service =>
        service.delay(baseline.id, {minutes: 5}, operation('')),
    ];

    for (const invoke of invocations) {
      const {service, storage} = createA2Harness({tasks: [baseline]});
      const rawBefore = storage.raw();
      await expectErrorCode(() => invoke(service), 'OPERATION_ID_REQUIRED');
      expect(storage.raw()).toBe(rawBefore);
      expect(storage.getCalls).toEqual([]);
      expect(storage.setAttempts).toEqual([]);
    }
  });

  it('replays all existing-task mutations without recomputing timestamps, score, or writes', async () => {
    const scenarios: Array<{
      task: ReturnType<typeof makeTask>;
      invoke(service: TaskLifecycleService): Promise<unknown>;
    }> = [
      {
        task: makeTask('replay-update'),
        invoke: service =>
          service.update(
            'replay-update',
            {title: 'Updated once'},
            operation('replay:update'),
          ),
      },
      {
        task: makeTask('replay-delete'),
        invoke: service =>
          service.softDelete('replay-delete', operation('replay:delete')),
      },
      {
        task: makeInProgressTask('replay-complete'),
        invoke: service =>
          service.complete('replay-complete', operation('replay:complete')),
      },
      {
        task: makeTask('replay-reschedule'),
        invoke: service =>
          service.reschedule(
            'replay-reschedule',
            {scheduledStartAt: '2026-08-06T10:00:00.000Z'},
            operation('replay:reschedule'),
          ),
      },
      {
        task: makeTask('replay-delay'),
        invoke: service =>
          service.delay(
            'replay-delay',
            {minutes: 5},
            operation('replay:delay'),
          ),
      },
    ];

    for (const scenario of scenarios) {
      const clock = new SequenceClock([A2_NOW]);
      const {service, storage} = createA2Harness({
        tasks: [scenario.task],
        now: clock.now,
      });
      const first = await scenario.invoke(service);
      const replay = await scenario.invoke(service);
      expect(replay).toEqual(first);
      expect(replay).not.toBe(first);
      expect(clock.consumed).toBe(1);
      expect(storage.setCommits).toHaveLength(1);
    }
  });

  it('rejects reusing an operation ID across mutation methods without a second write', async () => {
    const baseline = makeTask('cross-method');
    const {service, storage} = createA2Harness({tasks: [baseline]});

    await service.update(
      baseline.id,
      {title: 'First binding'},
      operation('conflict:cross-method'),
    );
    const writesAfterFirst = storage.setCommits.length;
    const rawBeforeConflict = storage.raw();
    const cacheBeforeConflict = await service.getById(baseline.id, {
      includeDeleted: true,
    });
    await expectErrorCode(
      () =>
        service.reschedule(
          baseline.id,
          {scheduledStartAt: A2_LATER},
          operation('conflict:cross-method'),
        ),
      'OPERATION_ID_CONFLICT',
    );
    expect(storage.setCommits).toHaveLength(writesAfterFirst);
    expect(storage.raw()).toBe(rawBeforeConflict);
    await expect(
      service.getById(baseline.id, {includeDeleted: true}),
    ).resolves.toEqual(cacheBeforeConflict);
  });

  it('binds an operation ID to its target and normalized payload', async () => {
    const first = makeTask('conflict-target-a');
    const second = makeTask('conflict-target-b');
    const {service, storage} = createA2Harness({tasks: [first, second]});

    await service.update(
      first.id,
      {title: 'Bound title'},
      operation('conflict:target'),
    );
    const writesBeforeTargetConflict = storage.setCommits.length;
    const rawBeforeTargetConflict = storage.raw();
    const cacheBeforeTargetConflict = await service.list({includeDeleted: true});
    await expectErrorCode(
      () =>
        service.update(
          second.id,
          {title: 'Bound title'},
          operation('conflict:target'),
        ),
      'OPERATION_ID_CONFLICT',
    );
    expect(storage.setCommits).toHaveLength(writesBeforeTargetConflict);
    expect(storage.raw()).toBe(rawBeforeTargetConflict);
    await expect(service.list({includeDeleted: true})).resolves.toEqual(
      cacheBeforeTargetConflict,
    );
    await service.update(
      first.id,
      {description: 'First payload'},
      operation('conflict:payload'),
    );
    const writesBeforePayloadConflict = storage.setCommits.length;
    const rawBeforePayloadConflict = storage.raw();
    const cacheBeforePayloadConflict = await service.list({includeDeleted: true});
    await expectErrorCode(
      () =>
        service.update(
          first.id,
          {description: 'Different payload'},
          operation('conflict:payload'),
        ),
      'OPERATION_ID_CONFLICT',
    );
    expect(storage.setCommits).toHaveLength(writesBeforePayloadConflict);
    expect(storage.raw()).toBe(rawBeforePayloadConflict);
    await expect(service.list({includeDeleted: true})).resolves.toEqual(
      cacheBeforePayloadConflict,
    );
  });

  it('soft-deletes once, advances updatedAt, and applies read visibility immediately', async () => {
    const baseline = makeTask('soft-delete');
    const clock = new SequenceClock([A2_NOW]);
    const {service, storage} = createA2Harness({tasks: [baseline], now: clock.now});

    const deleted = await service.softDelete(
      baseline.id,
      operation('delete:first'),
    );

    expect(deleted).toMatchObject({
      id: baseline.id,
      deletedAt: A2_NOW,
      updatedAt: A2_NOW,
    });
    await expect(service.getById(baseline.id)).resolves.toBeNull();
    await expect(service.list()).resolves.toEqual([]);
    await expect(
      service.getById(baseline.id, {includeDeleted: true}),
    ).resolves.toEqual(deleted);
    expect(storage.setCommits).toHaveLength(1);
  });

  it('keeps a second delete with a new operation ID a timestamp-preserving no-op', async () => {
    const baseline = makeTask('delete-idempotent');
    const clock = new SequenceClock([A2_NOW]);
    const {service, storage} = createA2Harness({tasks: [baseline], now: clock.now});
    const first = await service.softDelete(
      baseline.id,
      operation('delete:idempotent:first'),
    );

    const second = await service.softDelete(
      baseline.id,
      operation('delete:idempotent:second'),
    );

    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second.deletedAt).toBe(A2_NOW);
    expect(clock.consumed).toBe(1);
    expect(storage.setCommits).toHaveLength(1);
  });

  it('completes and scores all four quadrants exactly once', async () => {
    const cases = [
      {id: 'complete-q1', important: true, urgent: true, points: 35},
      {id: 'complete-q2', important: true, urgent: false, points: 45},
      {id: 'complete-q3', important: false, urgent: true, points: 15},
      {id: 'complete-q4', important: false, urgent: false, points: 5},
    ];

    for (const entry of cases) {
      const baseline = makeTask(entry.id, {
        important: entry.important,
        urgent: entry.urgent,
      });
      const {service} = createA2Harness({tasks: [baseline]});
      const result = await service.complete(
        baseline.id,
        operation(`complete:${entry.id}`),
      );
      expect(result.points).toBe(entry.points);
      expect(result.task).toMatchObject({
        status: 'completed',
        startedAt: A2_NOW,
        completedAt: A2_NOW,
        score: entry.points,
        scoreAwardedAt: A2_NOW,
        updatedAt: A2_NOW,
      });
    }
  });

  it('distinguishes same-operation completion replay from a new-operation completed no-op', async () => {
    const baseline = makeInProgressTask('complete-idempotent', {
      important: true,
      urgent: false,
    });
    const clock = new SequenceClock([A2_NOW]);
    const {service, storage} = createA2Harness({tasks: [baseline], now: clock.now});
    const op = operation('complete:idempotent:first');

    const first = await service.complete(baseline.id, op);
    const replay = await service.complete(baseline.id, {...op});
    const laterOperation = await service.complete(
      baseline.id,
      operation('complete:idempotent:later-operation'),
    );

    expect(first.points).toBe(45);
    expect(first.task.startedAt).toBe(baseline.startedAt);
    expect(replay).toEqual(first);
    expect(replay).not.toBe(first);
    expect(replay.task.startedAt).toBe(baseline.startedAt);
    expect(laterOperation).toEqual({task: first.task, points: 0});
    expect(laterOperation.task).not.toBe(first.task);
    expect(clock.consumed).toBe(1);
    expect(storage.setCommits).toHaveLength(1);
  });

  it('rejects completion of a cancelled task without publishing a write', async () => {
    const cancelled = makeCancelledTask('complete-cancelled');
    const {service, storage} = createA2Harness({tasks: [cancelled]});
    const rawBefore = storage.raw();

    await expectErrorCode(
      () =>
        service.complete(
          cancelled.id,
          operation('complete:cancelled:rejected'),
        ),
      'TERMINAL_TASK',
    );

    expect(storage.raw()).toBe(rawBefore);
    expect(storage.setAttempts).toEqual([]);
    expect(storage.setCommits).toEqual([]);
  });

  it('accepts the completed-subtask parent fixture through real repository validation', async () => {
    const fixture = makeCompletedNestedFixture();
    const {repository, storage} = createA2Harness({tasks: [fixture]});

    await expect(repository.list({includeDeleted: true})).resolves.toEqual([
      fixture,
    ]);
    expect(storage.getCalls).toHaveLength(1);
  });

  it('refuses incomplete subtasks and completes when every nested step is done', async () => {
    const pendingStepTask = makeInProgressTask('complete-nested-pending', {
      subtasks: [makeSubtask('complete-nested-pending')],
    });
    const pendingHarness = createA2Harness({tasks: [pendingStepTask]});
    const rawBefore = pendingHarness.storage.raw();
    await expectErrorCode(
      () =>
        pendingHarness.service.complete(
          pendingStepTask.id,
          operation('complete:nested:pending'),
        ),
      'UNFINISHED_SUBTASKS',
    );
    expect(pendingHarness.storage.raw()).toBe(rawBefore);
    expect(pendingHarness.storage.setAttempts).toEqual([]);

    const completedStepTask = makeCompletedNestedFixture();
    const completedHarness = createA2Harness({tasks: [completedStepTask]});
    await expect(
      completedHarness.service.complete(
        completedStepTask.id,
        operation('complete:nested:done'),
      ),
    ).resolves.toMatchObject({
      task: {status: 'completed'},
      points: 5,
    });
  });

  it('rejects non-delete mutations of a tombstone without publishing changes', async () => {
    const tombstone = makeDeletedTask('tombstone-mutations');
    const invocations: Array<(service: TaskLifecycleService) => Promise<unknown>> = [
      service =>
        service.update(
          tombstone.id,
          {title: 'No resurrection'},
          operation('tombstone:update'),
        ),
      service =>
        service.complete(tombstone.id, operation('tombstone:complete')),
      service =>
        service.reschedule(
          tombstone.id,
          {scheduledStartAt: A2_LATER},
          operation('tombstone:reschedule'),
        ),
      service =>
        service.delay(
          tombstone.id,
          {minutes: 5},
          operation('tombstone:delay'),
        ),
    ];

    for (const invoke of invocations) {
      const {service, storage} = createA2Harness({tasks: [tombstone]});
      const rawBefore = storage.raw();
      await expectErrorCode(() => invoke(service), 'TASK_DELETED');
      expect(storage.raw()).toBe(rawBefore);
      expect(storage.setCommits).toEqual([]);
    }
  });
});
