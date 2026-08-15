import {
  CountingClock,
  CountingIds,
  createReview4Runtime,
  ForbiddenClock,
  ForbiddenIds,
  expectNoOrdinaryMutation,
  Review4PhysicalCasStore,
  review4CreateInput,
} from './review4TestKit';

function ignoreUnreachableSettlement(operation: Promise<unknown>): void {
  void operation.catch(() => undefined);
}

describe('GAP-P0-01A2 Review4 recoverable physical CAS ownership', () => {
  it('helps the same operation after a committed CAS acknowledgement is permanently lost', async () => {
    const physical = new Review4PhysicalCasStore('review4-lost-same-operation');
    physical.seedCurrentV1([]);
    const crashedBackend = physical.wrapper('crashed-wrapper');
    const firstClock = new CountingClock('2026-08-06T05:01:00.000Z');
    const firstIds = new CountingIds('review4-lost-same-first');
    const crashed = createReview4Runtime(crashedBackend, {
      now: firstClock.now,
      idGenerator: firstIds.next,
    });
    const command = review4CreateInput(1);
    const operationId = 'review4-lost-same-operation-0001';
    const beforeFault = physical.rawSnapshot();
    const fault = crashedBackend.loseAcknowledgementAfterNextSuccessfulMutation();
    const unreachable = crashed.service.create(command, {operationId});
    ignoreUnreachableSettlement(unreachable);

    const orphanedCas = await fault.committed;
    expect(physical.rawSnapshot()).not.toEqual(beforeFault);
    expect(physical.valueObservedAt(orphanedCas.key)).toBe(
      orphanedCas.desiredValue,
    );

    const helperBackend = physical.wrapper('same-operation-helper');
    const helperClock = new CountingClock('2026-08-06T05:02:00.000Z');
    const helperIds = new CountingIds('review4-lost-same-helper');
    const helper = createReview4Runtime(helperBackend, {
      now: helperClock.now,
      idGenerator: helperIds.next,
    });
    const recovered = await helper.service.create(command, {operationId});

    expect(firstClock.consumed + helperClock.consumed).toBe(1);
    expect(firstIds.consumed + helperIds.consumed).toBe(1);
    await expect(helper.service.list({includeDeleted: true})).resolves.toEqual([
      recovered,
    ]);
    expect(physical.valueObservedAt(orphanedCas.key)).not.toBe(
      orphanedCas.desiredValue,
    );

    const completedBytes = physical.rawSnapshot();
    const restartPhysical = new Review4PhysicalCasStore(
      'review4-lost-same-operation',
      completedBytes,
    );
    const restartClock = new ForbiddenClock();
    const restartIds = new ForbiddenIds();
    const restartBackend = restartPhysical.wrapper('same-operation-restart');
    const restart = createReview4Runtime(restartBackend, {
      now: restartClock.now,
      idGenerator: restartIds.next,
    });
    await expect(
      restart.service.create(command, {operationId}),
    ).resolves.toEqual(recovered);
    await expect(restart.service.list({includeDeleted: true})).resolves.toEqual([
      recovered,
    ]);
    expect({clock: restartClock.consumed, ids: restartIds.consumed}).toEqual({
      clock: 0,
      ids: 0,
    });
    expect(restartPhysical.rawSnapshot()).toEqual(completedBytes);
    expectNoOrdinaryMutation(crashedBackend, helperBackend, restartBackend);
  });

  it('helps an orphaned operation before committing a different operation', async () => {
    const physical = new Review4PhysicalCasStore('review4-lost-next-operation');
    physical.seedCurrentV1([]);
    const crashedBackend = physical.wrapper('lost-next-crashed-wrapper');
    const firstClock = new CountingClock('2026-08-06T05:03:00.000Z');
    const firstIds = new CountingIds('review4-lost-next-first');
    const crashed = createReview4Runtime(crashedBackend, {
      now: firstClock.now,
      idGenerator: firstIds.next,
    });
    const firstCommand = review4CreateInput(2);
    const firstOperationId = 'review4-lost-next-operation-0001';
    const fault = crashedBackend.loseAcknowledgementAfterNextSuccessfulMutation();
    const unreachable = crashed.service.create(firstCommand, {
      operationId: firstOperationId,
    });
    ignoreUnreachableSettlement(unreachable);
    const orphanedCas = await fault.committed;

    const helperBackend = physical.wrapper('lost-next-helper-wrapper');
    const helperClock = new CountingClock('2026-08-06T05:04:00.000Z');
    const helperIds = new CountingIds('review4-lost-next-helper');
    const helper = createReview4Runtime(helperBackend, {
      now: helperClock.now,
      idGenerator: helperIds.next,
    });
    const secondCommand = review4CreateInput(3);
    const secondOperationId = 'review4-lost-next-operation-0002';
    const secondResult = await helper.service.create(secondCommand, {
      operationId: secondOperationId,
    });

    expect(physical.valueObservedAt(orphanedCas.key)).not.toBe(
      orphanedCas.desiredValue,
    );
    expect(firstClock.consumed + helperClock.consumed).toBe(2);
    expect(firstIds.consumed + helperIds.consumed).toBe(2);

    const completedBytes = physical.rawSnapshot();
    const restartPhysical = new Review4PhysicalCasStore(
      'review4-lost-next-operation',
      completedBytes,
    );
    const restartClock = new ForbiddenClock();
    const restartIds = new ForbiddenIds();
    const restartBackend = restartPhysical.wrapper('lost-next-restart');
    const restart = createReview4Runtime(restartBackend, {
      now: restartClock.now,
      idGenerator: restartIds.next,
    });
    const firstResult = await restart.service.create(firstCommand, {
      operationId: firstOperationId,
    });
    await expect(
      restart.service.create(secondCommand, {operationId: secondOperationId}),
    ).resolves.toEqual(secondResult);
    const tasks = await restart.service.list({includeDeleted: true});
    expect(tasks).toHaveLength(2);
    expect(tasks).toEqual(expect.arrayContaining([firstResult, secondResult]));
    expect(firstResult.id).not.toBe(secondResult.id);
    expect({clock: restartClock.consumed, ids: restartIds.consumed}).toEqual({
      clock: 0,
      ids: 0,
    });
    expect(restartPhysical.rawSnapshot()).toEqual(completedBytes);
    expectNoOrdinaryMutation(crashedBackend, helperBackend, restartBackend);
  });

  it('fences a delayed prior owner after another wrapper safely helps and advances', async () => {
    const physical = new Review4PhysicalCasStore('review4-delayed-owner-fencing');
    physical.seedCurrentV1([]);
    const firstBackend = physical.wrapper('delayed-first-wrapper');
    const firstClock = new CountingClock('2026-08-06T05:05:00.000Z');
    const firstIds = new CountingIds('review4-delayed-first');
    const first = createReview4Runtime(firstBackend, {
      now: firstClock.now,
      idGenerator: firstIds.next,
    });
    const firstCommand = review4CreateInput(4);
    const firstOperationId = 'review4-delayed-operation-0001';
    const gate = firstBackend.delayAcknowledgementAfterNextSuccessfulMutation();
    const firstOperation = first.service.create(firstCommand, {
      operationId: firstOperationId,
    });
    ignoreUnreachableSettlement(firstOperation);
    const delayedCas = await gate.committed;

    const secondBackend = physical.wrapper('delayed-second-wrapper');
    const secondClock = new CountingClock('2026-08-06T05:06:00.000Z');
    const secondIds = new CountingIds('review4-delayed-second');
    const second = createReview4Runtime(secondBackend, {
      now: secondClock.now,
      idGenerator: secondIds.next,
    });
    const secondCommand = review4CreateInput(5);
    const secondOperationId = 'review4-delayed-operation-0002';

    let secondResult;
    try {
      secondResult = await second.service.create(secondCommand, {
        operationId: secondOperationId,
      });
    } finally {
      gate.release();
    }
    const firstResult = await firstOperation;

    expect(physical.valueObservedAt(delayedCas.key)).not.toBe(
      delayedCas.desiredValue,
    );
    expect(firstClock.consumed + secondClock.consumed).toBe(2);
    expect(firstIds.consumed + secondIds.consumed).toBe(2);
    const verificationBackend = physical.wrapper('delayed-verification');
    const verificationClock = new ForbiddenClock();
    const verificationIds = new ForbiddenIds();
    const verification = createReview4Runtime(verificationBackend, {
      now: verificationClock.now,
      idGenerator: verificationIds.next,
    });
    const stored = await verification.service.list({includeDeleted: true});
    expect(stored).toHaveLength(2);
    expect(stored).toEqual(expect.arrayContaining([firstResult, secondResult]));
    await expect(
      verification.service.create(firstCommand, {
        operationId: firstOperationId,
      }),
    ).resolves.toEqual(firstResult);
    await expect(
      verification.service.create(secondCommand, {
        operationId: secondOperationId,
      }),
    ).resolves.toEqual(secondResult);
    expect({clock: verificationClock.consumed, ids: verificationIds.consumed}).toEqual({
      clock: 0,
      ids: 0,
    });
    expectNoOrdinaryMutation(firstBackend, secondBackend, verificationBackend);
  });
});
