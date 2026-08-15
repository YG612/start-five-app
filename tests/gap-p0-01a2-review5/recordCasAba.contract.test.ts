import type {Task} from '../../src/domain/task';
import {
  capture,
  CountingClock,
  CountingIds,
  createReview5Runtime,
  expectNoOrdinaryMutation,
  ForbiddenClock,
  ForbiddenIds,
  Review5PhysicalCasStore,
  review5SeedTask,
} from './review5AbaTestKit';

const A_TIMESTAMP = '2026-08-09T06:01:00.000Z';
const A_SCHEDULED_START = '2026-08-09T07:00:00.000Z';
const OPERATION_A = 'review5-record-cas-aba-operation-a-0001';
const OPERATION_B = 'review5-record-cas-aba-operation-b-0002';

function expectedA(seed: Task): Task {
  return {
    ...seed,
    startAt: A_SCHEDULED_START,
    scheduledStartAt: A_SCHEDULED_START,
    updatedAt: A_TIMESTAMP,
  };
}

describe('GAP-P0-01A2 Review5 record-level CAS ABA fencing', () => {
  it('rejects delayed A after helper release and byte-exact logical B restoration', async () => {
    const seed = review5SeedTask();
    const physical = new Review5PhysicalCasStore();
    physical.seedTask(seed);

    const aBackend = physical.wrapper('review5-delayed-a');
    const aClock = new CountingClock(A_TIMESTAMP);
    const aIds = new CountingIds();
    const a = createReview5Runtime(aBackend, {
      now: aClock.now,
      idGenerator: aIds.next,
    });
    const boundary = aBackend.delayNextPrimaryRecordCasAfterOwnerFence();
    const operationA = a.service.reschedule(
      seed.id,
      {scheduledStartAt: A_SCHEDULED_START},
      {operationId: OPERATION_A},
    );
    const entered = await boundary.entered;

    const helperBackend = physical.wrapper('review5-helper-a');
    const helperClock = new ForbiddenClock();
    const helperIds = new ForbiddenIds();
    const helper = createReview5Runtime(helperBackend, {
      now: helperClock.now,
      idGenerator: helperIds.next,
    });
    await expect(helper.service.list({includeDeleted: true})).resolves.toEqual([
      expectedA(seed),
    ]);

    const bBackend = physical.wrapper('review5-winner-b');
    const bClock = new CountingClock(seed.updatedAt);
    const bIds = new CountingIds();
    const b = createReview5Runtime(bBackend, {
      now: bClock.now,
      idGenerator: bIds.next,
    });
    const resultB = await b.service.reschedule(
      seed.id,
      {scheduledStartAt: null},
      {operationId: OPERATION_B},
    );
    expect(JSON.stringify(resultB)).toBe(JSON.stringify(seed));
    const bytesAfterB = physical.rawSnapshot();

    boundary.release();
    await operationA;
    const delayedCasApplied = await boundary.applied;

    const aView = await a.service.list({includeDeleted: true});
    const bView = await b.service.list({includeDeleted: true});
    const completedBytes = physical.rawSnapshot();
    const restartPhysical = new Review5PhysicalCasStore(
      'start-five-review5-record-cas-aba',
      completedBytes,
    );
    const restartBackend = restartPhysical.wrapper('review5-byte-restart');
    const restartClock = new ForbiddenClock();
    const restartIds = new ForbiddenIds();
    const restart = createReview5Runtime(restartBackend, {
      now: restartClock.now,
      idGenerator: restartIds.next,
    });
    const restartView = await restart.service.list({includeDeleted: true});
    const replayB = await capture(
      restart.service.reschedule(
        seed.id,
        {scheduledStartAt: null},
        {operationId: OPERATION_B},
      ),
    );

    expect({
      ownerFenceRead: entered.exactOwnerFenceReadBeforeEntry,
      delayedCasApplied,
      aView,
      bView,
      restartView,
      replayB,
      rawBytesStableAfterReplay: restartPhysical.rawSnapshot(),
      dependencies: {
        operationClocks: aClock.consumed + bClock.consumed,
        operationIds: aIds.consumed + bIds.consumed,
        helperClock: helperClock.consumed,
        helperIds: helperIds.consumed,
        restartClock: restartClock.consumed,
        restartIds: restartIds.consumed,
      },
    }).toEqual({
      ownerFenceRead: true,
      delayedCasApplied: false,
      aView: [resultB],
      bView: [resultB],
      restartView: [resultB],
      replayB: {status: 'fulfilled', value: resultB},
      rawBytesStableAfterReplay: bytesAfterB,
      dependencies: {
        operationClocks: 2,
        operationIds: 0,
        helperClock: 0,
        helperIds: 0,
        restartClock: 0,
        restartIds: 0,
      },
    });
    expectNoOrdinaryMutation(
      aBackend,
      helperBackend,
      bBackend,
      restartBackend,
    );
  });

  it('preserves normal A then byte-exact B commit and durable replay without delay', async () => {
    const seed = review5SeedTask();
    const physical = new Review5PhysicalCasStore(
      'start-five-review5-record-cas-control',
    );
    physical.seedTask(seed);

    const aBackend = physical.wrapper('review5-control-a');
    const aClock = new CountingClock(A_TIMESTAMP);
    const aIds = new CountingIds();
    const a = createReview5Runtime(aBackend, {
      now: aClock.now,
      idGenerator: aIds.next,
    });
    await expect(
      a.service.reschedule(
        seed.id,
        {scheduledStartAt: A_SCHEDULED_START},
        {operationId: OPERATION_A},
      ),
    ).resolves.toEqual(expectedA(seed));

    const bBackend = physical.wrapper('review5-control-b');
    const bClock = new CountingClock(seed.updatedAt);
    const bIds = new CountingIds();
    const b = createReview5Runtime(bBackend, {
      now: bClock.now,
      idGenerator: bIds.next,
    });
    const resultB = await b.service.reschedule(
      seed.id,
      {scheduledStartAt: null},
      {operationId: OPERATION_B},
    );
    expect(JSON.stringify(resultB)).toBe(JSON.stringify(seed));
    await expect(a.service.list({includeDeleted: true})).resolves.toEqual([
      resultB,
    ]);
    await expect(b.service.list({includeDeleted: true})).resolves.toEqual([
      resultB,
    ]);

    const completedBytes = physical.rawSnapshot();
    const restartPhysical = new Review5PhysicalCasStore(
      'start-five-review5-record-cas-control',
      completedBytes,
    );
    const restartBackend = restartPhysical.wrapper('review5-control-restart');
    const restartClock = new ForbiddenClock();
    const restartIds = new ForbiddenIds();
    const restart = createReview5Runtime(restartBackend, {
      now: restartClock.now,
      idGenerator: restartIds.next,
    });
    await expect(restart.service.list({includeDeleted: true})).resolves.toEqual([
      resultB,
    ]);
    await expect(
      restart.service.reschedule(
        seed.id,
        {scheduledStartAt: A_SCHEDULED_START},
        {operationId: OPERATION_A},
      ),
    ).resolves.toEqual(expectedA(seed));
    await expect(
      restart.service.reschedule(
        seed.id,
        {scheduledStartAt: null},
        {operationId: OPERATION_B},
      ),
    ).resolves.toEqual(resultB);

    expect({
      operationClocks: aClock.consumed + bClock.consumed,
      operationIds: aIds.consumed + bIds.consumed,
      replayClock: restartClock.consumed,
      replayIds: restartIds.consumed,
      replayBytes: restartPhysical.rawSnapshot(),
    }).toEqual({
      operationClocks: 2,
      operationIds: 0,
      replayClock: 0,
      replayIds: 0,
      replayBytes: completedBytes,
    });
    expectNoOrdinaryMutation(aBackend, bBackend, restartBackend);
  });
});

