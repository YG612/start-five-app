import type {Task} from '../../src/domain/task';
import {
  CasOnlyBackendWrapper,
  CasOnlyPhysicalStore,
  CountingClock,
  CountingIds,
  createReview3Runtime,
  DeclaredCapabilityBackend,
  expectNoSecretInError,
  ForbiddenClock,
  ForbiddenIds,
  makeReviewTask,
  PersistentReviewBackend,
  reviewCreateInput,
} from './review3TestKit';

type Settlement = 'public-cas' | 'operation-settled';

async function expectPublicCasBeforeSettlement(
  operation: Promise<unknown>,
  publicCasObserved: Promise<void>,
): Promise<void> {
  const settlement = await Promise.race<Settlement>([
    publicCasObserved.then(() => 'public-cas'),
    operation.then(
      () => 'operation-settled',
      () => 'operation-settled',
    ),
  ]);
  expect(settlement).toBe('public-cas');
}

function expectNoOrdinaryMutation(
  ...backends: readonly CasOnlyBackendWrapper[]
): void {
  for (const backend of backends) {
    expect(backend.ordinarySetAttempts).toEqual([]);
    expect(backend.ordinaryRemoveAttempts).toEqual([]);
  }
}

function taskFields(task: Task): {
  readonly id: string;
  readonly title: string;
  readonly description: string;
} {
  return {id: task.id, title: task.title, description: task.description};
}

describe('GAP-P0-01A2 Review3 physical atomic coordination', () => {
  it('linearizes two CAS-only wrapper creates and accepts either legal serial order', async () => {
    const physical = new CasOnlyPhysicalStore('review3-shared-create-scope');
    physical.seedCurrentV1([]);
    const firstBackend = physical.wrapper('create-first-wrapper');
    const secondBackend = physical.wrapper('create-second-wrapper');
    expect(firstBackend).not.toBe(secondBackend);
    expect(firstBackend.startFiveAtomic).not.toBe(secondBackend.startFiveAtomic);
    expect(firstBackend.startFiveAtomic.scope).toBe(
      secondBackend.startFiveAtomic.scope,
    );

    const firstClock = new CountingClock('2026-08-06T02:00:00.000Z');
    const secondClock = new CountingClock('2026-08-06T02:01:00.000Z');
    const firstIds = new CountingIds('review3-create-first');
    const secondIds = new CountingIds('review3-create-second');
    const first = createReview3Runtime(firstBackend, {
      now: firstClock.now,
      idGenerator: firstIds.next,
    });
    const second = createReview3Runtime(secondBackend, {
      now: secondClock.now,
      idGenerator: secondIds.next,
    });
    const firstCommand = reviewCreateInput(1, {
      title: 'Review3 first concurrent task',
    });
    const secondCommand = reviewCreateInput(2, {
      title: 'Review3 second concurrent task',
    });

    const gate = firstBackend.pauseNextCompareExchange();
    const firstOperation = first.service.create(firstCommand, {
      operationId: 'review3-concurrent-create-0001',
    });
    await expectPublicCasBeforeSettlement(firstOperation, gate.entered);
    const secondCas = secondBackend.observeNextCompareExchange();
    const secondOperation = second.service.create(secondCommand, {
      operationId: 'review3-concurrent-create-0002',
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
    expect(firstBackend.compareExchanges.length).toBeGreaterThan(0);
    expect(secondBackend.compareExchanges.length).toBeGreaterThan(0);
    expectNoOrdinaryMutation(firstBackend, secondBackend);

    const verificationBackend = physical.wrapper('create-verification-wrapper');
    const forbiddenClock = new ForbiddenClock();
    const forbiddenIds = new ForbiddenIds();
    const verification = createReview3Runtime(verificationBackend, {
      now: forbiddenClock.now,
      idGenerator: forbiddenIds.next,
    });
    const stored = await verification.service.list({includeDeleted: true});
    expect(stored).toHaveLength(2);
    expect(stored).toEqual(expect.arrayContaining([firstResult, secondResult]));
    expect(firstResult.id).not.toBe(secondResult.id);

    const bytesBeforeReplay = physical.rawSnapshot();
    await expect(
      verification.service.create(firstCommand, {
        operationId: 'review3-concurrent-create-0001',
      }),
    ).resolves.toEqual(firstResult);
    await expect(
      verification.service.create(secondCommand, {
        operationId: 'review3-concurrent-create-0002',
      }),
    ).resolves.toEqual(secondResult);
    expect({clock: forbiddenClock.consumed, ids: forbiddenIds.consumed}).toEqual({
      clock: 0,
      ids: 0,
    });
    expect(physical.rawSnapshot()).toEqual(bytesBeforeReplay);
    expectNoOrdinaryMutation(verificationBackend);
  });

  it('preserves disjoint CAS-only updates under either complete linearization history', async () => {
    const physical = new CasOnlyPhysicalStore('review3-shared-update-scope');
    physical.seedCurrentV1([
      makeReviewTask('review3-update-target', {
        title: 'Original title',
        description: 'Original description',
      }),
    ]);
    const firstBackend = physical.wrapper('update-first-wrapper');
    const secondBackend = physical.wrapper('update-second-wrapper');
    const first = createReview3Runtime(firstBackend, {
      now: new CountingClock('2026-08-06T03:00:00.000Z').now,
      idGenerator: new CountingIds('review3-update-first-unused').next,
    });
    const second = createReview3Runtime(secondBackend, {
      now: new CountingClock('2026-08-06T03:00:00.000Z').now,
      idGenerator: new CountingIds('review3-update-second-unused').next,
    });

    const gate = firstBackend.pauseNextCompareExchange();
    const firstOperation = first.service.update(
      'review3-update-target',
      {title: 'First title'},
      {operationId: 'review3-concurrent-update-0001'},
    );
    await expectPublicCasBeforeSettlement(firstOperation, gate.entered);
    const secondCas = secondBackend.observeNextCompareExchange();
    const secondOperation = second.service.update(
      'review3-update-target',
      {description: 'Second description'},
      {operationId: 'review3-concurrent-update-0002'},
    );
    try {
      await expectPublicCasBeforeSettlement(secondOperation, secondCas);
    } finally {
      gate.release();
    }

    const [firstResult, secondResult] = await Promise.all([
      firstOperation,
      secondOperation,
    ]);
    const verificationBackend = physical.wrapper('update-verification-wrapper');
    const verification = createReview3Runtime(verificationBackend, {
      now: new ForbiddenClock().now,
      idGenerator: new ForbiddenIds().next,
    });
    const finalTask = await verification.service.getById('review3-update-target');
    expect(finalTask).not.toBeNull();
    if (finalTask === null) {
      throw new Error('A2_REVIEW3_FINAL_UPDATE_TASK_MISSING');
    }

    const observed = {
      first: taskFields(firstResult),
      second: taskFields(secondResult),
      final: taskFields(finalTask),
    };
    expect([
      {
        first: {
          id: 'review3-update-target',
          title: 'First title',
          description: 'Original description',
        },
        second: {
          id: 'review3-update-target',
          title: 'First title',
          description: 'Second description',
        },
        final: {
          id: 'review3-update-target',
          title: 'First title',
          description: 'Second description',
        },
      },
      {
        first: {
          id: 'review3-update-target',
          title: 'First title',
          description: 'Second description',
        },
        second: {
          id: 'review3-update-target',
          title: 'Original title',
          description: 'Second description',
        },
        final: {
          id: 'review3-update-target',
          title: 'First title',
          description: 'Second description',
        },
      },
    ]).toContainEqual(observed);

    const bytesBeforeReplay = physical.rawSnapshot();
    await expect(
      verification.service.update(
        'review3-update-target',
        {title: 'First title'},
        {operationId: 'review3-concurrent-update-0001'},
      ),
    ).resolves.toEqual(firstResult);
    await expect(
      verification.service.update(
        'review3-update-target',
        {description: 'Second description'},
        {operationId: 'review3-concurrent-update-0002'},
      ),
    ).resolves.toEqual(secondResult);
    expect(physical.rawSnapshot()).toEqual(bytesBeforeReplay);
    expectNoOrdinaryMutation(
      firstBackend,
      secondBackend,
      verificationBackend,
    );
  });

  it('does not globally serialize unrelated physical stores that publish the same diagnostic scope', async () => {
    const sharedDiagnosticScope = 'review3-diagnostic-scope-is-not-identity';
    const firstPhysical = new CasOnlyPhysicalStore(sharedDiagnosticScope);
    const secondPhysical = new CasOnlyPhysicalStore(sharedDiagnosticScope);
    firstPhysical.seedCurrentV1([]);
    secondPhysical.seedCurrentV1([]);
    const firstBackend = firstPhysical.wrapper('unrelated-first-wrapper');
    const secondBackend = secondPhysical.wrapper('unrelated-second-wrapper');
    const first = createReview3Runtime(firstBackend, {
      now: new CountingClock('2026-08-06T04:00:00.000Z').now,
      idGenerator: new CountingIds('review3-unrelated-first').next,
    });
    const second = createReview3Runtime(secondBackend, {
      now: new CountingClock('2026-08-06T04:01:00.000Z').now,
      idGenerator: new CountingIds('review3-unrelated-second').next,
    });

    const firstGate = firstBackend.pauseNextCompareExchange();
    let firstSettled = false;
    const firstOperation = first.service.create(reviewCreateInput(1), {
      operationId: 'review3-unrelated-store-create-0001',
    });
    void firstOperation.then(
      () => {
        firstSettled = true;
      },
      () => {
        firstSettled = true;
      },
    );
    await expectPublicCasBeforeSettlement(firstOperation, firstGate.entered);

    let secondResult: Task;
    try {
      secondResult = await second.service.create(reviewCreateInput(2), {
        operationId: 'review3-unrelated-store-create-0002',
      });
      expect(firstSettled).toBe(false);
      expect(secondBackend.compareExchanges.length).toBeGreaterThan(0);
    } finally {
      firstGate.release();
    }
    const firstResult = await firstOperation;

    const firstVerification = createReview3Runtime(
      firstPhysical.wrapper('unrelated-first-verification'),
      {now: new ForbiddenClock().now, idGenerator: new ForbiddenIds().next},
    );
    const secondVerification = createReview3Runtime(
      secondPhysical.wrapper('unrelated-second-verification'),
      {now: new ForbiddenClock().now, idGenerator: new ForbiddenIds().next},
    );
    await expect(firstVerification.service.list()).resolves.toEqual([
      firstResult,
    ]);
    await expect(secondVerification.service.list()).resolves.toEqual([
      secondResult,
    ]);
    expectNoOrdinaryMutation(firstBackend, secondBackend);
  });

  type CapabilityCase = {
    readonly label: string;
    makeCapability(): object;
  };

  const capabilityCases: readonly CapabilityCase[] = [
    {
      label: 'missing compareExchangeItem',
      makeCapability: () => ({version: 1, scope: 'review3-missing-method'}),
    },
    {
      label: 'unsupported numeric version',
      makeCapability: () => ({
        version: 2,
        scope: 'review3-wrong-version',
        compareExchangeItem: async () => true,
      }),
    },
    {
      label: 'non-numeric version',
      makeCapability: () => ({
        version: '1',
        scope: 'review3-string-version',
        compareExchangeItem: async () => true,
      }),
    },
    {
      label: 'empty scope',
      makeCapability: () => ({
        version: 1,
        scope: '',
        compareExchangeItem: async () => true,
      }),
    },
    {
      label: 'whitespace-only scope',
      makeCapability: () => ({
        version: 1,
        scope: '   ',
        compareExchangeItem: async () => true,
      }),
    },
    {
      label: 'non-string scope',
      makeCapability: () => ({
        version: 1,
        scope: 7,
        compareExchangeItem: async () => true,
      }),
    },
    {
      label: 'non-boolean resolved CAS value',
      makeCapability: () => ({
        version: 1,
        scope: 'review3-invalid-return',
        compareExchangeItem: async () => 1,
      }),
    },
    {
      label: 'synchronous CAS throw',
      makeCapability: () => ({
        version: 1,
        scope: 'review3-sync-throw',
        compareExchangeItem: (): Promise<boolean> => {
          throw new Error('A2_REVIEW3_SYNC_CAS_FAULT');
        },
      }),
    },
    {
      label: 'rejected CAS promise',
      makeCapability: () => ({
        version: 1,
        scope: 'review3-rejected-promise',
        compareExchangeItem: (): Promise<boolean> =>
          Promise.reject(new Error('A2_REVIEW3_REJECTED_CAS_FAULT')),
      }),
    },
  ];

  it.each(capabilityCases)(
    'fails closed for $label without dependency or non-atomic mutation',
    async ({makeCapability}) => {
      const backend = new DeclaredCapabilityBackend(makeCapability());
      backend.seedCurrentV1([]);
      const before = Array.from(backend.values.entries());
      const clock = new CountingClock('2026-08-06T05:00:00.000Z');
      const ids = new CountingIds('review3-invalid-capability');
      const runtime = createReview3Runtime(backend, {
        now: clock.now,
        idGenerator: ids.next,
      });
      const secret = 'REVIEW3-INVALID-CAPABILITY-PRIVATE-COMMAND';

      let error: unknown;
      try {
        await runtime.service.create(
          reviewCreateInput(1, {title: secret}),
          {operationId: 'review3-invalid-capability-operation'},
        );
      } catch (caught: unknown) {
        error = caught;
      }

      expect(error).toBeDefined();
      expectNoSecretInError(error, [secret]);
      expect({clock: clock.consumed, ids: ids.consumed}).toEqual({
        clock: 0,
        ids: 0,
      });
      expect(backend.setAttempts).toEqual([]);
      expect(backend.removeAttempts).toEqual([]);
      expect(Array.from(backend.values.entries())).toEqual(before);
    },
  );

  it('treats boolean false as a retryable CAS miss and still completes without ordinary writes', async () => {
    const physical = new CasOnlyPhysicalStore('review3-retryable-cas-miss');
    physical.seedCurrentV1([]);
    const backend = physical.wrapper('retryable-false-wrapper');
    backend.forceNextCompareExchangeMiss();
    const runtime = createReview3Runtime(backend, {
      now: new CountingClock('2026-08-06T06:00:00.000Z').now,
      idGenerator: new CountingIds('review3-cas-retry').next,
    });

    await expect(
      runtime.service.create(reviewCreateInput(1), {
        operationId: 'review3-retryable-cas-miss-operation',
      }),
    ).resolves.toMatchObject({id: 'review3-cas-retry-0001'});
    expect(backend.compareExchanges.length).toBeGreaterThan(1);
    expectNoOrdinaryMutation(backend);
  });

  it('preserves the accepted legacy single-facade path when no capability is declared', async () => {
    const backend = new PersistentReviewBackend();
    backend.seedCurrentV1([]);
    const runtime = createReview3Runtime(backend, {
      now: new CountingClock().now,
      idGenerator: new CountingIds('review3-legacy-single').next,
    });

    await expect(
      runtime.service.create(reviewCreateInput(1), {
        operationId: 'review3-legacy-single-facade-create',
      }),
    ).resolves.toMatchObject({id: 'review3-legacy-single-0001'});
    await expect(runtime.service.list()).resolves.toHaveLength(1);
  });
});
