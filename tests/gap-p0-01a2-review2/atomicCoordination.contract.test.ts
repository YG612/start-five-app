import {
  AtomicPhysicalStore,
  CountingClock,
  CountingIds,
  createReview2Runtime,
  expectNoSecretInError,
  ForbiddenClock,
  ForbiddenIds,
  InvalidDeclaredAtomicBackend,
  makeReviewTask,
  PersistentReviewBackend,
  reviewCreateInput,
} from './review2TestKit';

describe('GAP-P0-01A2 Review2 physical atomic coordination', () => {
  it('linearizes concurrent creates through two distinct wrappers over one physical store', async () => {
    const physical = new AtomicPhysicalStore('review2-two-wrapper-create');
    physical.seedCurrentV1([]);
    const firstBackend = physical.wrapper();
    const secondBackend = physical.wrapper();
    expect(firstBackend).not.toBe(secondBackend);
    expect(firstBackend.startFiveAtomic).not.toBe(secondBackend.startFiveAtomic);
    expect(firstBackend.startFiveAtomic.scope).toBe(
      secondBackend.startFiveAtomic.scope,
    );

    const firstClock = new CountingClock('2026-08-05T20:00:00.000Z');
    const secondClock = new CountingClock('2026-08-05T20:01:00.000Z');
    const firstIds = new CountingIds('atomic-first');
    const secondIds = new CountingIds('atomic-second');
    const first = createReview2Runtime(firstBackend, {
      now: firstClock.now,
      idGenerator: firstIds.next,
    });
    const second = createReview2Runtime(secondBackend, {
      now: secondClock.now,
      idGenerator: secondIds.next,
    });

    const barrier = firstBackend.blockNextCommittedSet();
    const firstCommand = reviewCreateInput(1, {
      title: 'Atomic first returned task',
    });
    const secondCommand = reviewCreateInput(2, {
      title: 'Atomic second returned task',
    });
    const firstPromise = first.service.create(firstCommand, {
      operationId: 'atomic-wrapper-create-0001',
    });
    await barrier.started;
    const secondActivity = secondBackend.nextActivity();
    const secondPromise = second.service.create(secondCommand, {
      operationId: 'atomic-wrapper-create-0002',
    });
    await secondActivity;
    barrier.release();

    const [firstResult, secondResult] = await Promise.all([
      firstPromise,
      secondPromise,
    ]);
    expect(firstBackend.compareExchanges.length).toBeGreaterThan(0);
    expect(secondBackend.compareExchanges.length).toBeGreaterThan(0);

    const verificationBackend = physical.wrapper();
    const forbiddenClock = new ForbiddenClock();
    const forbiddenIds = new ForbiddenIds();
    const verified = createReview2Runtime(verificationBackend, {
      now: forbiddenClock.now,
      idGenerator: forbiddenIds.next,
    });
    const stored = await verified.service.list({includeDeleted: true});
    expect(stored.map(task => task.id)).toEqual([
      firstResult.id,
      secondResult.id,
    ]);
    expect(stored).toEqual([firstResult, secondResult]);

    const bytesBeforeReplay = physical.rawSnapshot();
    await expect(
      verified.service.create(firstCommand, {
        operationId: 'atomic-wrapper-create-0001',
      }),
    ).resolves.toEqual(firstResult);
    await expect(
      verified.service.create(secondCommand, {
        operationId: 'atomic-wrapper-create-0002',
      }),
    ).resolves.toEqual(secondResult);
    expect({clock: forbiddenClock.consumed, ids: forbiddenIds.consumed}).toEqual({
      clock: 0,
      ids: 0,
    });
    expect(physical.rawSnapshot()).toEqual(bytesBeforeReplay);
  });

  it('preserves both successful disjoint updates across two wrapper barriers', async () => {
    const physical = new AtomicPhysicalStore('review2-two-wrapper-update');
    physical.seedCurrentV1([
      makeReviewTask('atomic-update-target', {
        title: 'Original title',
        description: 'Original description',
      }),
    ]);
    const firstBackend = physical.wrapper();
    const secondBackend = physical.wrapper();
    const firstClock = new CountingClock('2026-08-05T21:00:00.000Z');
    const secondClock = new CountingClock('2026-08-05T21:01:00.000Z');
    const first = createReview2Runtime(firstBackend, {
      now: firstClock.now,
      idGenerator: new CountingIds('update-first-unused').next,
    });
    const second = createReview2Runtime(secondBackend, {
      now: secondClock.now,
      idGenerator: new CountingIds('update-second-unused').next,
    });

    const barrier = firstBackend.blockNextCommittedSet();
    const firstPromise = first.service.update(
      'atomic-update-target',
      {title: 'First committed title'},
      {operationId: 'atomic-wrapper-update-0001'},
    );
    await barrier.started;
    const secondActivity = secondBackend.nextActivity();
    const secondPromise = second.service.update(
      'atomic-update-target',
      {description: 'Second committed description'},
      {operationId: 'atomic-wrapper-update-0002'},
    );
    await secondActivity;
    barrier.release();

    const [firstResult, secondResult] = await Promise.all([
      firstPromise,
      secondPromise,
    ]);
    expect(firstBackend.compareExchanges.length).toBeGreaterThan(0);
    expect(secondBackend.compareExchanges.length).toBeGreaterThan(0);
    const verificationBackend = physical.wrapper();
    const verified = createReview2Runtime(verificationBackend, {
      now: new ForbiddenClock().now,
      idGenerator: new ForbiddenIds().next,
    });
    await expect(
      verified.service.getById('atomic-update-target'),
    ).resolves.toMatchObject({
      title: 'First committed title',
      description: 'Second committed description',
    });
    expect(secondResult).toMatchObject({
      title: 'First committed title',
      description: 'Second committed description',
    });
    expect(firstResult.title).toBe('First committed title');

    const bytesBeforeReplay = physical.rawSnapshot();
    await expect(
      verified.service.update(
        'atomic-update-target',
        {title: 'First committed title'},
        {operationId: 'atomic-wrapper-update-0001'},
      ),
    ).resolves.toEqual(firstResult);
    await expect(
      verified.service.update(
        'atomic-update-target',
        {description: 'Second committed description'},
        {operationId: 'atomic-wrapper-update-0002'},
      ),
    ).resolves.toEqual(secondResult);
    expect(physical.rawSnapshot()).toEqual(bytesBeforeReplay);
  });

  it('fails closed when a backend declares shared physical scope without the V1 compare-exchange method', async () => {
    const backend = new InvalidDeclaredAtomicBackend();
    backend.seedCurrentV1([]);
    const before = Array.from(backend.values.entries());
    const clock = new CountingClock();
    const ids = new CountingIds('invalid-capability');
    const runtime = createReview2Runtime(backend, {
      now: clock.now,
      idGenerator: ids.next,
    });
    const secret = 'DECLARED-CAPABILITY-SECRET-MUST-NOT-LEAK';

    let caught: unknown;
    try {
      await runtime.service.create(
        reviewCreateInput(1, {title: secret}),
        {operationId: 'invalid-declared-atomic-capability'},
      );
    } catch (error: unknown) {
      caught = error;
    }

    expect(caught).toBeDefined();
    expectNoSecretInError(caught, [secret]);
    expect({clock: clock.consumed, ids: ids.consumed}).toEqual({
      clock: 0,
      ids: 0,
    });
    expect(backend.sets).toEqual([]);
    expect(backend.removes).toEqual([]);
    expect(Array.from(backend.values.entries())).toEqual(before);
  });

  it('keeps the accepted legacy single-facade path compatible when no shared-scope capability is declared', async () => {
    const backend = new PersistentReviewBackend();
    backend.seedCurrentV1([]);
    const runtime = createReview2Runtime(backend, {
      now: new CountingClock().now,
      idGenerator: new CountingIds('legacy-single').next,
    });

    await expect(
      runtime.service.create(reviewCreateInput(1), {
        operationId: 'legacy-single-facade-create',
      }),
    ).resolves.toMatchObject({id: 'legacy-single-0001'});
    await expect(runtime.service.list()).resolves.toHaveLength(1);
  });
});
