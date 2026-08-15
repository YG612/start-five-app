import {materializePlainJsonData} from '../../src/data/taskSnapshotValidation';
import {
  CountingClock,
  CountingIds,
  createPersistentReviewRuntime,
  expectErrorCode,
  makeReviewDeletedTask,
  makeReviewTask,
  PersistentReviewBackend,
  reviewCreateInput,
} from './review1TestKit';

function expectEveryDurableJsonUnitWithinGenericBudget(
  backend: PersistentReviewBackend,
): void {
  for (const [, raw] of backend.rawSnapshot()) {
    const parsed: unknown = JSON.parse(raw);
    expect(() => materializePlainJsonData(parsed)).not.toThrow();
  }
}

describe('GAP-P0-01A2 Review1 scalable product task collection', () => {
  it('reads a legal V1 collection and creates the 256th then 257th task without a hidden product cap', async () => {
    const backend = new PersistentReviewBackend();
    const legacy = Array.from({length: 255}, (_, index) =>
      makeReviewTask(`legacy-${String(index + 1).padStart(3, '0')}`),
    );
    backend.seedCurrentV1(legacy);
    const clock = new CountingClock();
    const ids = new CountingIds('boundary-created');
    const runtime = createPersistentReviewRuntime(backend, {
      now: clock.now,
      idGenerator: ids.next,
    });

    await expect(runtime.service.list({includeDeleted: true})).resolves.toEqual(
      legacy,
    );
    expect(backend.nonPrimaryKeys()).toEqual([]);
    expect(backend.setAttempts).toEqual([]);
    const firstInput = reviewCreateInput(256, {title: '  Boundary 256  '});
    const firstPromise = runtime.service.create(firstInput, {
      operationId: 'large-create-256',
    });
    Object.assign(firstInput, {title: 'mutated after invocation'});
    const task256 = await firstPromise;
    const task257 = await runtime.service.create(reviewCreateInput(257), {
      operationId: 'large-create-257',
    });

    expect(task256).toMatchObject({
      id: 'boundary-created-0001',
      title: 'Boundary 256',
    });
    expect(task257.id).toBe('boundary-created-0002');
    const complete = await runtime.service.list({includeDeleted: true});
    expect(complete).toHaveLength(257);
    expect(complete.slice(-2).map(task => task.id)).toEqual([
      task256.id,
      task257.id,
    ]);
    expect({clock: clock.consumed, ids: ids.consumed}).toEqual({
      clock: 2,
      ids: 2,
    });

    Object.assign(task256, {title: 'mutated returned 256'});
    Object.assign(complete[0] ?? {}, {title: 'mutated returned legacy'});
    const restarted = createPersistentReviewRuntime(backend.fork(), {
      now: new CountingClock('2026-08-05T13:00:00.000Z').now,
      idGenerator: new CountingIds('restart-unused').next,
    });
    const restartedTasks = await restarted.service.list({includeDeleted: true});
    expect(restartedTasks).toHaveLength(257);
    expect(restartedTasks[0]).toEqual(legacy[0]);
    expect(restartedTasks[255]).toMatchObject({
      id: 'boundary-created-0001',
      title: 'Boundary 256',
    });

    await restarted.service.update(
      'boundary-created-0001',
      {description: 'updated after physical restart'},
      {operationId: 'large-update-after-restart'},
    );
    await restarted.service.softDelete('boundary-created-0002', {
      operationId: 'large-delete-after-restart',
    });
    const verified = createPersistentReviewRuntime(backend.fork(), {
      now: new CountingClock('2026-08-05T14:00:00.000Z').now,
      idGenerator: new CountingIds('verify-unused').next,
    });
    await expect(
      verified.service.getById('boundary-created-0001'),
    ).resolves.toMatchObject({description: 'updated after physical restart'});
    await expect(
      verified.service.getById('boundary-created-0002'),
    ).resolves.toBeNull();
    await expect(
      verified.service.getById('boundary-created-0002', {
        includeDeleted: true,
      }),
    ).resolves.toMatchObject({deletedAt: '2026-08-05T13:00:01.000Z'});
    expectEveryDurableJsonUnitWithinGenericBudget(backend);
  });

  it('continues beyond 512 total records despite many tombstones and keeps list, projection, query, restart, and isolation coherent', async () => {
    const backend = new PersistentReviewBackend();
    const tombstones = Array.from({length: 255}, (_, index) =>
      makeReviewDeletedTask(
        `deleted-${String(index + 1).padStart(3, '0')}`,
      ),
    );
    backend.seedCurrentV1(tombstones);
    const runtime = createPersistentReviewRuntime(backend, {
      now: new CountingClock().now,
      idGenerator: new CountingIds('lifecycle-created').next,
    });

    await expect(runtime.service.list()).resolves.toEqual([]);
    const bulkQ4 = Array.from({length: 254}, (_, index) =>
      makeReviewTask(`active-${String(index + 1).padStart(3, '0')}`),
    );
    const lateQuadrantTasks = [
      makeReviewTask('late-q2', {important: true, urgent: false}),
      makeReviewTask('late-q3', {important: false, urgent: true}),
      makeReviewTask('late-q4-first', {
        startAt: '2026-08-05T07:00:00.000Z',
        scheduledStartAt: '2026-08-05T07:00:00.000Z',
      }),
      makeReviewTask('late-q4-second', {
        startAt: '2026-08-05T07:30:00.000Z',
        scheduledStartAt: '2026-08-05T07:30:00.000Z',
      }),
    ];
    for (const task of [...bulkQ4, ...lateQuadrantTasks]) {
      await runtime.repository.create(task);
    }
    await expect(runtime.service.list({includeDeleted: true})).resolves.toHaveLength(
      513,
    );

    const createInput = reviewCreateInput(514, {
      title: '  Unique post-512 recommendation  ',
      important: true,
      urgent: true,
    });
    const createPromise = runtime.service.create(createInput, {
      operationId: 'large-create-after-513',
    });
    Object.assign(createInput, {title: 'caller mutation must detach'});
    const created = await createPromise;
    const visible = await runtime.service.list();
    const all = await runtime.service.list({includeDeleted: true});
    const projection = await runtime.service.getQuadrantProjection();
    const query = await runtime.service.getQueryResult();
    const q1 = projection[0];
    const q2 = projection[1];
    const q3 = projection[2];
    const q4 = projection[3];

    expect(created.title).toBe('Unique post-512 recommendation');
    expect(all).toHaveLength(514);
    expect(visible).toHaveLength(259);
    expect(all.slice(-5).map(task => task.id)).toEqual([
      'late-q2',
      'late-q3',
      'late-q4-first',
      'late-q4-second',
      created.id,
    ]);
    expect(projection.map(bucket => bucket.totalCount)).toEqual([
      1,
      1,
      1,
      256,
    ]);
    expect(q1.allTasks.map(task => task.id)).toEqual([created.id]);
    expect(q2.allTasks.map(task => task.id)).toEqual(['late-q2']);
    expect(q3.allTasks.map(task => task.id)).toEqual(['late-q3']);
    expect(q4.preview.map(task => task.id)).toEqual([
      'late-q4-first',
      'late-q4-second',
      'active-001',
    ]);
    expect(q4.allTasks.slice(0, 5).map(task => task.id)).toEqual([
      'late-q4-first',
      'late-q4-second',
      'active-001',
      'active-002',
      'active-003',
    ]);
    expect(q4.allTasks[q4.allTasks.length - 1]?.id).toBe('active-254');
    expect(query.tasks).toHaveLength(259);
    expect(query.tasks.slice(-5).map(task => task.id)).toEqual([
      'late-q2',
      'late-q3',
      'late-q4-first',
      'late-q4-second',
      created.id,
    ]);
    expect(query.recommendation?.id).toBe(created.id);
    expect(query.quadrants.map(bucket => bucket.totalCount)).toEqual([
      1,
      1,
      1,
      256,
    ]);
    expect(query.quadrants[3].preview.map(task => task.id)).toEqual([
      'late-q4-first',
      'late-q4-second',
      'active-001',
    ]);

    Object.assign(created, {title: 'mutated create result'});
    Object.assign(visible[0] ?? {}, {title: 'mutated list result'});
    Object.assign(query.tasks[0] ?? {}, {title: 'mutated query result'});
    Object.assign(q1.allTasks[0] ?? {}, {title: 'mutated Q1 result'});
    Object.assign(q4.allTasks[0] ?? {}, {title: 'mutated Q4 result'});

    const restartedClock = new CountingClock('2026-08-05T15:00:00.000Z');
    const restarted = createPersistentReviewRuntime(backend.fork(), {
      now: restartedClock.now,
      idGenerator: new CountingIds('restart-unused').next,
    });
    const restartedAll = await restarted.service.list({includeDeleted: true});
    expect(restartedAll).toHaveLength(514);
    expect(restartedAll[0]).toEqual(tombstones[0]);
    expect(restartedAll.find(task => task.id === 'active-001')).toEqual(
      makeReviewTask('active-001'),
    );
    expect(restartedAll.find(task => task.id === 'late-q3')).toEqual(
      makeReviewTask('late-q3', {important: false, urgent: true}),
    );
    expect(restartedAll.find(task => task.id === created.id)).toMatchObject({
      title: 'Unique post-512 recommendation',
    });

    const rawBeforeDuplicate = backend.rawSnapshot();
    const duplicateBackend = backend.fork();
    const duplicate = createPersistentReviewRuntime(duplicateBackend, {
      now: new CountingClock('2026-08-05T15:30:00.000Z').now,
      idGenerator: new CountingIds('duplicate-unused').next,
    });
    await expectErrorCode(
      duplicate.repository.create(
        makeReviewTask('active-001', {title: 'Cross-shard duplicate'}),
      ),
      'TASK_ALREADY_EXISTS',
    );
    expect(duplicateBackend.setAttempts).toEqual([]);
    expect(duplicateBackend.removeAttempts).toEqual([]);
    expect(backend.rawSnapshot()).toEqual(rawBeforeDuplicate);

    await restarted.service.update(
      created.id,
      {title: 'Updated beyond 512'},
      {operationId: 'large-514-update'},
    );
    await restarted.service.softDelete(created.id, {
      operationId: 'large-514-delete',
    });

    const verified = createPersistentReviewRuntime(backend.fork(), {
      now: new CountingClock('2026-08-05T16:00:00.000Z').now,
      idGenerator: new CountingIds('verify-unused').next,
    });
    await expect(verified.service.list()).resolves.toHaveLength(258);
    await expect(
      verified.service.list({includeDeleted: true}),
    ).resolves.toHaveLength(514);
    await expect(
      verified.service.getById(created.id, {includeDeleted: true}),
    ).resolves.toMatchObject({
      title: 'Updated beyond 512',
      deletedAt: '2026-08-05T15:00:01.000Z',
    });
    expectEveryDurableJsonUnitWithinGenericBudget(backend);
  });
});
