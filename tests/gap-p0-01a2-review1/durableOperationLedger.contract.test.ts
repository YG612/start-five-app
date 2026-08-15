import type {TaskLifecycleService} from '../../src/application/coreAppService';
import {materializePlainJsonData} from '../../src/data/taskSnapshotValidation';
import type {Task} from '../../src/domain/task';
import {
  CountingClock,
  CountingIds,
  createIsolatedPersistentReviewRuntimeFromRawBytes,
  createPersistentReviewRuntime,
  expectBarrierBeforeSettlement,
  expectErrorCode,
  ForbiddenClock,
  ForbiddenIds,
  makeReviewTask,
  PersistentReviewBackend,
  REVIEW_NOW,
  ReviewBackendFault,
  reviewCreateInput,
} from './review1TestKit';

type ForwardMutation = 'create' | 'delay';
type ExistingTaskMutation =
  | 'update'
  | 'softDelete'
  | 'complete'
  | 'reschedule'
  | 'delay';

const EXISTING_TASK_MUTATIONS: readonly ExistingTaskMutation[] = [
  'update',
  'softDelete',
  'complete',
  'reschedule',
  'delay',
];

function makeForwardDelayTarget(): Task {
  return makeReviewTask('atomic-delay-target', {
    startAt: '2026-08-05T10:00:00.000Z',
    scheduledStartAt: '2026-08-05T10:00:00.000Z',
    dueAt: '2026-08-06T18:00:00.000Z',
  });
}

function forwardBaseline(mutation: ForwardMutation): Task[] {
  return mutation === 'create' ? [] : [makeForwardDelayTarget()];
}

function invokeForwardMutation(
  service: TaskLifecycleService,
  mutation: ForwardMutation,
  operationId: string,
): Promise<Task> {
  return mutation === 'create'
    ? service.create(reviewCreateInput(1), {operationId})
    : service.delay(
        'atomic-delay-target',
        {minutes: 30},
        {operationId},
      );
}

function makePhysicalRestartTarget(mutation: ExistingTaskMutation): Task {
  const id = `physical-${mutation}-target`;
  if (mutation === 'delay') {
    return makeReviewTask(id, {
      startAt: '2026-08-05T10:00:00.000Z',
      scheduledStartAt: '2026-08-05T10:00:00.000Z',
      dueAt: '2026-08-06T18:00:00.000Z',
    });
  }
  if (mutation === 'reschedule') {
    return makeReviewTask(id, {
      dueAt: '2026-08-06T18:00:00.000Z',
    });
  }
  return makeReviewTask(id);
}

function invokeExistingTaskMutation(
  service: TaskLifecycleService,
  mutation: ExistingTaskMutation,
  operationId: string,
  conflicting: boolean,
): Promise<unknown> {
  const targetId = `physical-${mutation}-target`;
  switch (mutation) {
    case 'update':
      return service.update(
        targetId,
        {
          title: conflicting
            ? 'Conflicting physical update'
            : 'Physical update',
        },
        {operationId},
      );
    case 'softDelete':
      return service.softDelete(
        conflicting ? `${targetId}-conflict` : targetId,
        {operationId},
      );
    case 'complete':
      return service.complete(
        conflicting ? `${targetId}-conflict` : targetId,
        {operationId},
      );
    case 'reschedule':
      return service.reschedule(
        targetId,
        {
          scheduledStartAt: conflicting
            ? '2026-08-07T12:00:00.000Z'
            : '2026-08-06T12:00:00.000Z',
        },
        {operationId},
      );
    case 'delay':
      return service.delay(
        targetId,
        {minutes: conflicting ? 45 : 30},
        {operationId},
      );
  }
  throw new Error(`A2_REVIEW1_UNKNOWN_EXISTING_MUTATION:${mutation}`);
}

function expectExactCause(error: unknown, cause: unknown): void {
  if (typeof error !== 'object' || error === null || !('cause' in error)) {
    throw new Error('A2_REVIEW1_ERROR_CAUSE_MISSING');
  }
  expect(error.cause).toBe(cause);
}

function expectVersionedBoundedSidecars(
  backend: PersistentReviewBackend,
): void {
  const keys = backend.nonPrimaryKeys();
  expect(keys.length).toBeGreaterThan(0);
  for (const key of keys) {
    const raw = backend.raw(key);
    expect(raw).not.toBeNull();
    const parsed: unknown = JSON.parse(raw ?? '');
    expect(() => materializePlainJsonData(parsed)).not.toThrow();
    expect(parsed).toEqual(
      expect.objectContaining({version: expect.any(Number)}),
    );
  }
}

describe('GAP-P0-01A2 Review1 durable operation ledger', () => {
  it('reconstructs restart storage solely from serialized raw bytes without sharing backend state', () => {
    const source = new PersistentReviewBackend();
    source.seedCurrentV1([makeReviewTask('serialized-restart-source')]);
    source.putRaw(
      'review-control-record',
      JSON.stringify({version: 1, marker: 'serialized-only'}),
    );
    const serialized = source.serializedRawBytes();

    const restored = PersistentReviewBackend.fromSerializedRawBytes(serialized);

    expect(restored).not.toBe(source);
    expect(restored.rawSnapshot()).toEqual(source.rawSnapshot());
    source.putRaw('source-only-record', 'source');
    restored.putRaw('restored-only-record', 'restored');
    expect(restored.raw('source-only-record')).toBeNull();
    expect(source.raw('restored-only-record')).toBeNull();
  });

  it('releases settled in-flight state and consults durable ledger for same-service replay', async () => {
    const backend = new PersistentReviewBackend();
    backend.seedCurrentV1([]);
    const clock = new CountingClock();
    const ids = new CountingIds('durable-release');
    const runtime = createPersistentReviewRuntime(backend, {
      now: clock.now,
      idGenerator: ids.next,
    });
    const command = reviewCreateInput(1, {title: '  Durable release  '});
    const created = await runtime.service.create(command, {
      operationId: 'durable-release-operation',
    });
    const rawAfterCreate = backend.serializedRawBytes();
    backend.resetMutationObservations();
    const cause = new ReviewBackendFault(
      'A2_REVIEW1_CALLER_SPECIFIED_SIDECAR_READ_SENTINEL',
    );
    backend.failNextSidecarRead(cause);

    const error = await expectErrorCode(
      runtime.service.create(
        reviewCreateInput(1, {title: 'Durable release'}),
        {operationId: 'durable-release-operation'},
      ),
      'TASK_STORAGE_READ_FAILED',
    );

    expectExactCause(error, cause);
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeAttempts).toEqual([]);
    expect(backend.forwardMutations).toEqual([]);
    expect(backend.serializedRawBytes()).toBe(rawAfterCreate);
    expect({clock: clock.consumed, ids: ids.consumed}).toEqual({
      clock: 1,
      ids: 1,
    });
    await expect(
      runtime.service.create(
        reviewCreateInput(1, {title: 'Durable release'}),
        {operationId: 'durable-release-operation'},
      ),
    ).resolves.toEqual(created);
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeAttempts).toEqual([]);
    expect(backend.forwardMutations).toEqual([]);
    expect(backend.serializedRawBytes()).toBe(rawAfterCreate);
    expect({clock: clock.consumed, ids: ids.consumed}).toEqual({
      clock: 1,
      ids: 1,
    });
    expectVersionedBoundedSidecars(backend);
  });

  it('replays normalized create after a physical facade restart and keeps conflict side-effect free', async () => {
    const backend = new PersistentReviewBackend();
    backend.seedCurrentV1([]);
    const firstClock = new CountingClock();
    const firstIds = new CountingIds('persistent-create');
    const first = createPersistentReviewRuntime(backend, {
      now: firstClock.now,
      idGenerator: firstIds.next,
    });
    const created = await first.service.create(
      reviewCreateInput(1, {title: '  Persistent create  '}),
      {operationId: 'persistent-create-operation'},
    );
    const durableAfterCreate = backend.serializedRawBytes();

    const restartClock = new ForbiddenClock();
    const restartIds = new ForbiddenIds();
    const restarted =
      await createIsolatedPersistentReviewRuntimeFromRawBytes(
        backend.serializedRawBytes(),
        {now: restartClock.now, idGenerator: restartIds.next},
      );
    const restartBackend = restarted.backend;
    const replay = await restarted.service.create(
      reviewCreateInput(1, {title: 'Persistent create'}),
      {operationId: 'persistent-create-operation'},
    );

    expect(replay).toEqual(created);
    expect(replay).not.toBe(created);
    expect({clock: restartClock.consumed, ids: restartIds.consumed}).toEqual({
      clock: 0,
      ids: 0,
    });
    expect(restartBackend.setAttempts).toEqual([]);
    expect(restartBackend.removeAttempts).toEqual([]);
    expect(restartBackend.forwardMutations).toEqual([]);
    expect(restartBackend.serializedRawBytes()).toBe(durableAfterCreate);
    Object.assign(replay, {title: 'mutated replay'});
    await expectErrorCode(
      restarted.service.create(
        reviewCreateInput(1, {title: 'Different command'}),
        {operationId: 'persistent-create-operation'},
      ),
      'OPERATION_ID_CONFLICT',
    );
    expect({clock: restartClock.consumed, ids: restartIds.consumed}).toEqual({
      clock: 0,
      ids: 0,
    });
    expect(restartBackend.setAttempts).toEqual([]);
    expect(restartBackend.removeAttempts).toEqual([]);
    expect(restartBackend.forwardMutations).toEqual([]);
    expect(restartBackend.serializedRawBytes()).toBe(durableAfterCreate);
    expect(backend.serializedRawBytes()).toBe(durableAfterCreate);

    const verifier =
      await createIsolatedPersistentReviewRuntimeFromRawBytes(
        durableAfterCreate,
        {
          now: new ForbiddenClock().now,
          idGenerator: new ForbiddenIds().next,
        },
      );
    await expect(
      verifier.service.create(
        reviewCreateInput(1, {title: 'Persistent create'}),
        {operationId: 'persistent-create-operation'},
      ),
    ).resolves.toEqual(created);
    expectVersionedBoundedSidecars(backend);
  });

  it.each(EXISTING_TASK_MUTATIONS)(
    'physically replays one-record %s and rejects its conflicting binding without restart side effects',
    async mutation => {
      const backend = new PersistentReviewBackend();
      backend.seedCurrentV1([makePhysicalRestartTarget(mutation)]);
      const first = createPersistentReviewRuntime(backend, {
        now: new CountingClock().now,
        idGenerator: new CountingIds(`physical-${mutation}-unused`).next,
      });
      const operationId = `physical-${mutation}-operation`;
      const original = await invokeExistingTaskMutation(
        first.service,
        mutation,
        operationId,
        false,
      );
      const durableBytes = backend.serializedRawBytes();

      const restartClock = new ForbiddenClock();
      const restartIds = new ForbiddenIds();
      const restarted =
        await createIsolatedPersistentReviewRuntimeFromRawBytes(durableBytes, {
          now: restartClock.now,
          idGenerator: restartIds.next,
        });
      const replay = await invokeExistingTaskMutation(
        restarted.service,
        mutation,
        operationId,
        false,
      );

      expect(replay).toEqual(original);
      expect(replay).not.toBe(original);
      expect({clock: restartClock.consumed, ids: restartIds.consumed}).toEqual({
        clock: 0,
        ids: 0,
      });
      expect(restarted.backend.setAttempts).toEqual([]);
      expect(restarted.backend.removeAttempts).toEqual([]);
      expect(restarted.backend.forwardMutations).toEqual([]);
      expect(restarted.backend.serializedRawBytes()).toBe(durableBytes);
      await expectErrorCode(
        invokeExistingTaskMutation(
          restarted.service,
          mutation,
          operationId,
          true,
        ),
        'OPERATION_ID_CONFLICT',
      );
      expect({clock: restartClock.consumed, ids: restartIds.consumed}).toEqual({
        clock: 0,
        ids: 0,
      });
      expect(restarted.backend.setAttempts).toEqual([]);
      expect(restarted.backend.removeAttempts).toEqual([]);
      expect(restarted.backend.forwardMutations).toEqual([]);
      expect(restarted.backend.serializedRawBytes()).toBe(durableBytes);
      expect(backend.serializedRawBytes()).toBe(durableBytes);
    },
  );

  it('recovers the same operation through a facade started after a committed write but before the original caller settles', async () => {
    const backend = new PersistentReviewBackend();
    backend.seedCurrentV1([]);
    const first = createPersistentReviewRuntime(backend, {
      now: new CountingClock().now,
      idGenerator: new CountingIds('crash-window').next,
    });
    const barrier = backend.blockNextCommittedWrite();
    const firstPromise = first.service.create(reviewCreateInput(1), {
      operationId: 'crash-window-operation',
    });
    let originalSettled = false;
    void firstPromise.then(
      () => {
        originalSettled = true;
      },
      () => {
        originalSettled = true;
      },
    );
    await expectBarrierBeforeSettlement(barrier, firstPromise);

    const restartClock = new ForbiddenClock();
    const restartIds = new ForbiddenIds();
    const restarted =
      await createIsolatedPersistentReviewRuntimeFromRawBytes(
        backend.serializedRawBytes(),
        {now: restartClock.now, idGenerator: restartIds.next},
      );
    let recovered: Task | undefined;
    let durableWhileOriginalBlocked: Task[] | undefined;
    let secondReplay: Task | undefined;
    let secondBackend: PersistentReviewBackend | undefined;
    const secondClock = new ForbiddenClock();
    const secondIds = new ForbiddenIds();
    try {
      recovered = await restarted.service.create(reviewCreateInput(1), {
        operationId: 'crash-window-operation',
      });
      durableWhileOriginalBlocked = await restarted.service.list({
        includeDeleted: true,
      });
      const secondRestart =
        await createIsolatedPersistentReviewRuntimeFromRawBytes(
          restarted.backend.serializedRawBytes(),
          {now: secondClock.now, idGenerator: secondIds.next},
        );
      secondBackend = secondRestart.backend;
      secondReplay = await secondRestart.service.create(reviewCreateInput(1), {
        operationId: 'crash-window-operation',
      });
      expect(originalSettled).toBe(false);
    } finally {
      barrier.release();
    }
    const original = await firstPromise;
    if (
      recovered === undefined ||
      durableWhileOriginalBlocked === undefined ||
      secondReplay === undefined ||
      secondBackend === undefined
    ) {
      throw new Error('A2_REVIEW1_CRASH_WINDOW_RECOVERY_MISSING');
    }

    expect(recovered).toEqual(original);
    expect(durableWhileOriginalBlocked).toEqual([recovered]);
    expect(secondReplay).toEqual(recovered);
    expect(secondReplay).not.toBe(recovered);
    expect({clock: restartClock.consumed, ids: restartIds.consumed}).toEqual({
      clock: 0,
      ids: 0,
    });
    expect({clock: secondClock.consumed, ids: secondIds.consumed}).toEqual({
      clock: 0,
      ids: 0,
    });
    expect(secondBackend.setAttempts).toEqual([]);
    expect(secondBackend.removeAttempts).toEqual([]);
  });

  it.each([{mutation: 'create'}, {mutation: 'delay'}] as const)(
    'rolls back every dynamically observed $mutation set/remove stage including remove fail-after and retries exactly once',
    async ({mutation}) => {
      const probeBackend = new PersistentReviewBackend();
      probeBackend.seedCurrentV1(forwardBaseline(mutation));
      const probe = createPersistentReviewRuntime(probeBackend, {
        now: new CountingClock().now,
        idGenerator: new CountingIds(`probe-${mutation}`).next,
      });
      await invokeForwardMutation(
        probe.service,
        mutation,
        `probe-${mutation}-operation`,
      );
      const successfulForwardStages = probeBackend.forwardMutations.map(
        stage => ({...stage}),
      );
      expect(successfulForwardStages.length).toBeGreaterThan(0);
      expect(
        successfulForwardStages.some(stage => stage.kind === 'removeItem'),
      ).toBe(true);
      const failurePoints = [
        ...successfulForwardStages.map(stage => ({
          stage,
          timing: 'before' as const,
        })),
        ...successfulForwardStages
          .filter(stage => stage.kind === 'removeItem')
          .map(stage => ({stage, timing: 'after' as const})),
      ];

      for (const {stage, timing} of failurePoints) {
        const ordinal = stage.ordinal;
        const baseline = forwardBaseline(mutation);
        const backend = new PersistentReviewBackend();
        backend.seedCurrentV1(baseline);
        const rawBefore = backend.rawSnapshot();
        const clock = new CountingClock();
        const ids = new CountingIds(`stage-${mutation}-${String(ordinal)}`);
        const runtime = createPersistentReviewRuntime(backend, {
          now: clock.now,
          idGenerator: ids.next,
        });
        const cause = new ReviewBackendFault(
          `A2_REVIEW1_FORWARD_${stage.kind}_${String(ordinal)}_${timing}_SENTINEL`,
        );
        if (timing === 'before') {
          backend.failNthForwardMutationBefore(ordinal, cause);
        } else {
          backend.failNthForwardMutationAfter(ordinal, cause);
        }
        const operationId =
          `atomic-${mutation}-${stage.kind}-${String(ordinal)}-${timing}`;

        const error = await expectErrorCode(
          invokeForwardMutation(runtime.service, mutation, operationId),
          'TASK_STORAGE_WRITE_FAILED',
        );

        expectExactCause(error, cause);
        expect(backend.forwardMutations.slice(0, ordinal)).toEqual(
          successfulForwardStages.slice(0, ordinal),
        );
        if (timing === 'after') {
          expect(stage.kind).toBe('removeItem');
          expect(backend.removeCommits.length).toBeGreaterThan(0);
        }
        expect(backend.rawSnapshot()).toEqual(rawBefore);
        await expect(
          runtime.service.list({includeDeleted: true}),
        ).resolves.toEqual(baseline);

        const recovered = await invokeForwardMutation(
          runtime.service,
          mutation,
          operationId,
        );
        if (mutation === 'create') {
          expect(recovered).toMatchObject({
            id: `stage-create-${String(ordinal)}-0002`,
            createdAt: '2026-08-05T12:00:01.000Z',
          });
        } else {
          expect(recovered).toMatchObject({
            id: 'atomic-delay-target',
            scheduledStartAt: '2026-08-05T12:30:01.000Z',
          });
        }
        await expect(
          runtime.service.list({includeDeleted: true}),
        ).resolves.toEqual([recovered]);
        const bytesAfterRetry = backend.serializedRawBytes();

        const replayClock = new ForbiddenClock();
        const replayIds = new ForbiddenIds();
        const replay =
          await createIsolatedPersistentReviewRuntimeFromRawBytes(
            bytesAfterRetry,
            {now: replayClock.now, idGenerator: replayIds.next},
          );
        const replayBackend = replay.backend;
        await expect(
          invokeForwardMutation(replay.service, mutation, operationId),
        ).resolves.toEqual(recovered);
        expect({clock: replayClock.consumed, ids: replayIds.consumed}).toEqual({
          clock: 0,
          ids: 0,
        });
        expect(replayBackend.setAttempts).toEqual([]);
        expect(replayBackend.removeAttempts).toEqual([]);
        expect(replayBackend.forwardMutations).toEqual([]);
        expect(replayBackend.serializedRawBytes()).toBe(bytesAfterRetry);
      }
    },
  );

  it('keeps 515 mixed bindings including 513 same-target updates exact after a byte-only module-isolated restart', async () => {
    const backend = new PersistentReviewBackend();
    const delayTarget = makeReviewTask('mixed-delay-target', {
      startAt: '2026-08-05T10:00:00.000Z',
      scheduledStartAt: '2026-08-05T10:00:00.000Z',
      dueAt: '2026-08-06T18:00:00.000Z',
    });
    backend.seedCurrentV1([
      delayTarget,
      makeReviewTask('mixed-update-target'),
    ]);
    const clock = new CountingClock(REVIEW_NOW, 0);
    const ids = new CountingIds('mixed-created');
    const first = createPersistentReviewRuntime(backend, {
      now: clock.now,
      idGenerator: ids.next,
    });
    const results: Task[] = [
      await first.service.create(
        reviewCreateInput(1, {title: 'Mixed durable create'}),
        {operationId: 'mixed-binding-001'},
      ),
      await first.service.delay(
        delayTarget.id,
        {minutes: 30},
        {operationId: 'mixed-binding-002'},
      ),
    ];
    for (let position = 3; position <= 515; position += 1) {
      results.push(
        await first.service.update(
          'mixed-update-target',
          {description: `mixed durable version ${String(position).padStart(3, '0')}`},
          {
            operationId:
              `mixed-binding-${String(position).padStart(3, '0')}`,
          },
        ),
      );
    }
    expect(clock.consumed).toBe(515);
    expect(ids.consumed).toBe(1);
    expect(results).toHaveLength(515);
    expectVersionedBoundedSidecars(backend);
    for (const [, raw] of backend.rawSnapshot()) {
      const parsed: unknown = JSON.parse(raw);
      expect(() => materializePlainJsonData(parsed)).not.toThrow();
    }

    const restartClock = new ForbiddenClock();
    const restartIds = new ForbiddenIds();
    const restarted =
      await createIsolatedPersistentReviewRuntimeFromRawBytes(
        backend.serializedRawBytes(),
        {now: restartClock.now, idGenerator: restartIds.next},
      );
    const restartBackend = restarted.backend;
    for (const position of [1, 2, 3, 256, 257, 513, 514, 515]) {
      const replay =
        position === 1
          ? restarted.service.create(
              reviewCreateInput(1, {title: 'Mixed durable create'}),
              {operationId: 'mixed-binding-001'},
            )
          : position === 2
            ? restarted.service.delay(
                delayTarget.id,
                {minutes: 30},
                {operationId: 'mixed-binding-002'},
              )
            : restarted.service.update(
                'mixed-update-target',
                {
                  description:
                    `mixed durable version ${String(position).padStart(3, '0')}`,
                },
                {
                  operationId:
                    `mixed-binding-${String(position).padStart(3, '0')}`,
                },
              );
      await expect(replay).resolves.toEqual(results[position - 1]);
    }
    await expectErrorCode(
      restarted.service.create(
        reviewCreateInput(1, {title: 'Conflicting old create'}),
        {operationId: 'mixed-binding-001'},
      ),
      'OPERATION_ID_CONFLICT',
    );
    expect({clock: restartClock.consumed, ids: restartIds.consumed}).toEqual({
      clock: 0,
      ids: 0,
    });
    expect(restartBackend.setAttempts).toEqual([]);
    expect(restartBackend.removeAttempts).toEqual([]);
    expect(restartBackend.forwardMutations).toEqual([]);
  });

  it('fails closed on corrupt durable operation metadata and succeeds after exact byte restoration', async () => {
    const backend = new PersistentReviewBackend();
    backend.seedCurrentV1([]);
    const first = createPersistentReviewRuntime(backend, {
      now: new CountingClock().now,
      idGenerator: new CountingIds('corrupt-ledger').next,
    });
    const command = reviewCreateInput(1);
    const created = await first.service.create(command, {
      operationId: 'corrupt-ledger-operation',
    });
    const sidecarKeys = backend.nonPrimaryKeys();
    expect(sidecarKeys.length).toBeGreaterThan(0);
    const preserved = sidecarKeys.map(key => [key, backend.raw(key)] as const);
    for (const key of sidecarKeys) {
      backend.putRaw(key, '{corrupt-operation-metadata');
    }
    const corruptBytes = backend.rawSnapshot();

    const restartClock = new ForbiddenClock();
    const restartIds = new ForbiddenIds();
    const restarted =
      await createIsolatedPersistentReviewRuntimeFromRawBytes(
        backend.serializedRawBytes(),
        {now: restartClock.now, idGenerator: restartIds.next},
      );
    const restartBackend = restarted.backend;
    await expectErrorCode(
      restarted.service.create(command, {
        operationId: 'corrupt-ledger-operation',
      }),
      'TASK_OPERATION_LEDGER_CORRUPT',
    );
    expect(restartBackend.setAttempts).toEqual([]);
    expect(restartBackend.removeAttempts).toEqual([]);
    expect(restartBackend.rawSnapshot()).toEqual(corruptBytes);
    await expectErrorCode(
      restarted.service.create(reviewCreateInput(2), {
        operationId: 'corrupt-ledger-new-operation',
      }),
      'TASK_OPERATION_LEDGER_CORRUPT',
    );
    expect({clock: restartClock.consumed, ids: restartIds.consumed}).toEqual({
      clock: 0,
      ids: 0,
    });
    expect(restartBackend.setAttempts).toEqual([]);
    expect(restartBackend.removeAttempts).toEqual([]);
    expect(restartBackend.rawSnapshot()).toEqual(corruptBytes);

    for (const [key, raw] of preserved) {
      if (raw === null) {
        backend.deleteRaw(key);
      } else {
        backend.putRaw(key, raw);
      }
    }
    const recovered =
      await createIsolatedPersistentReviewRuntimeFromRawBytes(
        backend.serializedRawBytes(),
        {
          now: new ForbiddenClock().now,
          idGenerator: new ForbiddenIds().next,
        },
      );
    await expect(
      recovered.service.create(command, {
        operationId: 'corrupt-ledger-operation',
      }),
    ).resolves.toEqual(created);
  });

  it('rejects stale ledger replay after an external valid V1 recovery changes task bytes', async () => {
    const backend = new PersistentReviewBackend();
    backend.seedCurrentV1([]);
    const first = createPersistentReviewRuntime(backend, {
      now: new CountingClock().now,
      idGenerator: new CountingIds('state-bound').next,
    });
    await first.service.create(reviewCreateInput(1), {
      operationId: 'state-bound-operation',
    });
    const recoveredTask = makeReviewTask('externally-recovered-task');
    backend.seedCurrentV1([recoveredTask]);
    const bytesAfterRecovery = backend.rawSnapshot();

    const restartClock = new ForbiddenClock();
    const restartIds = new ForbiddenIds();
    const restarted =
      await createIsolatedPersistentReviewRuntimeFromRawBytes(
        backend.serializedRawBytes(),
        {now: restartClock.now, idGenerator: restartIds.next},
      );
    const restartBackend = restarted.backend;
    await expectErrorCode(
      restarted.service.create(reviewCreateInput(1), {
        operationId: 'state-bound-operation',
      }),
      'TASK_OPERATION_LEDGER_STATE_MISMATCH',
    );
    expect(restartBackend.setAttempts).toEqual([]);
    expect(restartBackend.removeAttempts).toEqual([]);
    expect(restartBackend.rawSnapshot()).toEqual(bytesAfterRecovery);
    await expectErrorCode(
      restarted.service.create(reviewCreateInput(2), {
        operationId: 'state-bound-new-operation',
      }),
      'TASK_OPERATION_LEDGER_STATE_MISMATCH',
    );

    expect({clock: restartClock.consumed, ids: restartIds.consumed}).toEqual({
      clock: 0,
      ids: 0,
    });
    expect(restartBackend.setAttempts).toEqual([]);
    expect(restartBackend.removeAttempts).toEqual([]);
    expect(restartBackend.rawSnapshot()).toEqual(bytesAfterRecovery);
    await expect(restarted.service.list({includeDeleted: true})).resolves.toEqual([
      recoveredTask,
    ]);
  });
});
