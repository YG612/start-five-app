import {
  CountingClock,
  CountingIds,
  createReview4Runtime,
  expectNoOrdinaryMutation,
  Review4LegacyBackend,
  Review4PhysicalCasStore,
  review4CreateInput,
} from './review4TestKit';

describe('GAP-P0-01A2 Review4 compatibility and physical isolation controls', () => {
  it('preserves the ordinary single-facade path when no atomic capability exists', async () => {
    const backend = new Review4LegacyBackend();
    backend.seedCurrentV1([]);
    const runtime = createReview4Runtime(backend, {
      now: new CountingClock('2026-08-06T07:01:00.000Z').now,
      idGenerator: new CountingIds('review4-legacy').next,
    });
    const created = await runtime.service.create(review4CreateInput(20), {
      operationId: 'review4-legacy-create-0001',
    });
    const updated = await runtime.service.update(
      created.id,
      {title: 'Review4 legacy updated'},
      {operationId: 'review4-legacy-update-0001'},
    );
    await expect(runtime.service.list()).resolves.toEqual([updated]);
    expect(backend.writes.length).toBeGreaterThan(0);
  });

  it('does not couple unrelated physical stores that publish one diagnostic scope', async () => {
    const diagnosticScope = 'review4-equal-diagnostic-scope';
    const firstPhysical = new Review4PhysicalCasStore(diagnosticScope);
    const secondPhysical = new Review4PhysicalCasStore(diagnosticScope);
    firstPhysical.seedCurrentV1([]);
    secondPhysical.seedCurrentV1([]);
    const firstBackend = firstPhysical.wrapper('isolation-first-wrapper');
    const secondBackend = secondPhysical.wrapper('isolation-second-wrapper');
    const first = createReview4Runtime(firstBackend, {
      now: new CountingClock('2026-08-06T07:02:00.000Z').now,
      idGenerator: new CountingIds('review4-isolation-first').next,
    });
    const second = createReview4Runtime(secondBackend, {
      now: new CountingClock('2026-08-06T07:03:00.000Z').now,
      idGenerator: new CountingIds('review4-isolation-second').next,
    });
    await Promise.all([first.service.list(), second.service.list()]);

    const firstGate = firstBackend.pauseNextPublicCas();
    const firstOperation = first.service.create(review4CreateInput(21), {
      operationId: 'review4-isolation-create-0001',
    });
    await firstGate.entered;
    let secondResult;
    try {
      secondResult = await second.service.create(review4CreateInput(22), {
        operationId: 'review4-isolation-create-0002',
      });
    } finally {
      firstGate.release();
    }
    const firstResult = await firstOperation;

    const firstFresh = createReview4Runtime(
      firstPhysical.wrapper('isolation-first-fresh'),
      {
        now: new CountingClock('2026-08-06T07:04:00.000Z').now,
        idGenerator: new CountingIds('review4-isolation-first-fresh').next,
      },
    );
    const secondFresh = createReview4Runtime(
      secondPhysical.wrapper('isolation-second-fresh'),
      {
        now: new CountingClock('2026-08-06T07:05:00.000Z').now,
        idGenerator: new CountingIds('review4-isolation-second-fresh').next,
      },
    );
    await expect(firstFresh.service.list()).resolves.toEqual([firstResult]);
    await expect(secondFresh.service.list()).resolves.toEqual([secondResult]);
    expectNoOrdinaryMutation(firstBackend, secondBackend);
  });
});
