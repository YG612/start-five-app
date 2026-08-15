import {
  CountingClock,
  CountingIds,
  createReview4Runtime,
  expectNoOrdinaryMutation,
  expectPublicCasBeforeSettlement,
  Review4PhysicalCasStore,
  review4CreateInput,
} from './review4TestKit';
import type {Task} from '../../src/domain/task';

describe('GAP-P0-01A2 Review4 cross-wrapper cache coherence', () => {
  it('refreshes both prehydrated wrappers after unilateral create and update in either direction', async () => {
    const physical = new Review4PhysicalCasStore('review4-cache-bidirectional');
    physical.seedCurrentV1([]);
    const firstBackend = physical.wrapper('cache-first-wrapper');
    const secondBackend = physical.wrapper('cache-second-wrapper');
    const first = createReview4Runtime(firstBackend, {
      now: new CountingClock('2026-08-06T06:01:00.000Z').now,
      idGenerator: new CountingIds('review4-cache-first').next,
    });
    const second = createReview4Runtime(secondBackend, {
      now: new CountingClock('2026-08-06T06:02:00.000Z').now,
      idGenerator: new CountingIds('review4-cache-second').next,
    });
    await Promise.all([first.service.list(), second.service.list()]);

    const created = await first.service.create(review4CreateInput(10), {
      operationId: 'review4-cache-create-0001',
    });
    await expect(second.service.list()).resolves.toEqual([created]);
    await expect(second.service.getById(created.id)).resolves.toEqual(created);

    const firstUpdate = await first.service.update(
      created.id,
      {title: 'Review4 title from first wrapper'},
      {operationId: 'review4-cache-update-0001'},
    );
    await expect(second.service.list()).resolves.toEqual([firstUpdate]);
    await expect(second.service.getById(created.id)).resolves.toEqual(
      firstUpdate,
    );

    const secondUpdate = await second.service.update(
      created.id,
      {description: 'Review4 description from second wrapper'},
      {operationId: 'review4-cache-update-0002'},
    );
    await expect(first.service.list()).resolves.toEqual([secondUpdate]);
    await expect(first.service.getById(created.id)).resolves.toEqual(
      secondUpdate,
    );

    const fresh = createReview4Runtime(
      physical.wrapper('cache-fresh-wrapper'),
      {
        now: new CountingClock('2026-08-06T06:03:00.000Z').now,
        idGenerator: new CountingIds('review4-cache-fresh').next,
      },
    );
    await expect(fresh.service.list()).resolves.toEqual([secondUpdate]);
    expectNoOrdinaryMutation(firstBackend, secondBackend);
  });

  it('keeps clean same-wrapper reads cached instead of reloading primary task bytes', async () => {
    const physical = new Review4PhysicalCasStore('review4-cache-clean-reads');
    physical.seedCurrentV1([]);
    const backend = physical.wrapper('cache-clean-wrapper');
    const runtime = createReview4Runtime(backend, {
      now: new CountingClock('2026-08-06T06:04:00.000Z').now,
      idGenerator: new CountingIds('review4-cache-clean').next,
    });
    await expect(runtime.service.list()).resolves.toEqual([]);
    const primaryReadsAfterHydration = backend.primaryReadCount();
    expect(primaryReadsAfterHydration).toBeGreaterThan(0);

    await expect(runtime.service.list()).resolves.toEqual([]);
    await expect(runtime.service.getById('review4-cache-missing')).resolves.toBeNull();
    await expect(runtime.service.getQueryResult()).resolves.toMatchObject({
      tasks: [],
      recommendation: null,
    });
    expect(backend.primaryReadCount()).toBe(primaryReadsAfterHydration);
    expectNoOrdinaryMutation(backend);
  });

  it('deeply isolates nested caller results across wrappers in both directions', async () => {
    const seeded: Task = {
      id: 'review4-clone-task',
      title: 'Review4 clone title',
      description: 'Review4 clone description',
      important: true,
      urgent: false,
      status: 'pending',
      startAt: null,
      scheduledStartAt: null,
      dueAt: null,
      estimatedMinutes: 5,
      firstStep: 'Review4 clone first step',
      createdAt: '2026-08-06T06:04:30.000Z',
      updatedAt: '2026-08-06T06:04:30.000Z',
      startedAt: null,
      completedAt: null,
      deletedAt: null,
      score: null,
      scoreAwardedAt: null,
      subtasks: [
        {
          id: 'review4-clone-subtask',
          taskId: 'review4-clone-task',
          title: 'Review4 nested original',
          status: 'pending',
          createdAt: '2026-08-06T06:04:30.000Z',
          updatedAt: '2026-08-06T06:04:30.000Z',
          completedAt: null,
        },
      ],
    };
    const physical = new Review4PhysicalCasStore('review4-cache-clone');
    physical.seedCurrentV1([seeded]);
    const expectedBytes = physical.rawSnapshot();
    const firstBackend = physical.wrapper('cache-clone-first');
    const secondBackend = physical.wrapper('cache-clone-second');
    const first = createReview4Runtime(firstBackend, {
      now: new CountingClock('2026-08-06T06:04:31.000Z').now,
      idGenerator: new CountingIds('review4-cache-clone-first').next,
    });
    const second = createReview4Runtime(secondBackend, {
      now: new CountingClock('2026-08-06T06:04:32.000Z').now,
      idGenerator: new CountingIds('review4-cache-clone-second').next,
    });

    const [firstList, secondList] = await Promise.all([
      first.service.list({includeDeleted: true}),
      second.service.list({includeDeleted: true}),
    ]);
    const firstResult = firstList[0];
    const secondResult = secondList[0];
    if (firstResult === undefined || secondResult === undefined) {
      throw new Error('A2_REVIEW4_CLONE_FIXTURE_MISSING');
    }
    const firstSubtask = firstResult.subtasks[0];
    const secondSubtask = secondResult.subtasks[0];
    if (firstSubtask === undefined || secondSubtask === undefined) {
      throw new Error('A2_REVIEW4_CLONE_SUBTASK_MISSING');
    }

    firstResult.title = 'mutated through first wrapper result';
    firstSubtask.title = 'mutated nested through first wrapper result';
    expect(secondResult).toEqual(seeded);
    await expect(first.service.list({includeDeleted: true})).resolves.toEqual([
      seeded,
    ]);
    await expect(second.service.list({includeDeleted: true})).resolves.toEqual([
      seeded,
    ]);
    expect(physical.rawSnapshot()).toEqual(expectedBytes);

    secondResult.description = 'mutated through second wrapper result';
    secondSubtask.title = 'mutated nested through second wrapper result';
    await expect(first.service.list({includeDeleted: true})).resolves.toEqual([
      seeded,
    ]);
    await expect(second.service.list({includeDeleted: true})).resolves.toEqual([
      seeded,
    ]);
    expect(physical.rawSnapshot()).toEqual(expectedBytes);
    expectNoOrdinaryMutation(firstBackend, secondBackend);
  });

  it('converges both prehydrated wrappers and a fresh restart after concurrent commits', async () => {
    const physical = new Review4PhysicalCasStore('review4-cache-concurrent');
    physical.seedCurrentV1([]);
    const firstBackend = physical.wrapper('cache-concurrent-first');
    const secondBackend = physical.wrapper('cache-concurrent-second');
    const first = createReview4Runtime(firstBackend, {
      now: new CountingClock('2026-08-06T06:05:00.000Z').now,
      idGenerator: new CountingIds('review4-cache-concurrent-first').next,
    });
    const second = createReview4Runtime(secondBackend, {
      now: new CountingClock('2026-08-06T06:06:00.000Z').now,
      idGenerator: new CountingIds('review4-cache-concurrent-second').next,
    });
    await Promise.all([first.service.list(), second.service.list()]);

    const gate = firstBackend.pauseNextPublicCas();
    const firstOperation = first.service.create(review4CreateInput(11), {
      operationId: 'review4-cache-concurrent-create-0001',
    });
    await expectPublicCasBeforeSettlement(firstOperation, gate.entered);
    const secondCas = secondBackend.observeNextPublicCas();
    const secondOperation = second.service.create(review4CreateInput(12), {
      operationId: 'review4-cache-concurrent-create-0002',
    });
    try {
      await expectPublicCasBeforeSettlement(secondOperation, secondCas);
    } finally {
      gate.release();
    }
    const [firstResult, secondResult] = await Promise.all([
      firstOperation,
      secondOperation,
    ]);

    const fresh = createReview4Runtime(
      physical.wrapper('cache-concurrent-fresh'),
      {
        now: new CountingClock('2026-08-06T06:07:00.000Z').now,
        idGenerator: new CountingIds('review4-cache-concurrent-fresh').next,
      },
    );
    const freshTasks = await fresh.service.list({includeDeleted: true});
    expect(freshTasks).toHaveLength(2);
    expect(freshTasks).toEqual(
      expect.arrayContaining([firstResult, secondResult]),
    );
    await expect(first.service.list({includeDeleted: true})).resolves.toEqual(
      freshTasks,
    );
    await expect(second.service.list({includeDeleted: true})).resolves.toEqual(
      freshTasks,
    );
    expectNoOrdinaryMutation(firstBackend, secondBackend);
  });
});
