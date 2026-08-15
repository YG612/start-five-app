import {createPersistentTaskStorage} from '../../src/data/persistentTaskStorage';
import {
  createTaskRepository,
  type TaskRepository,
} from '../../src/data/taskRepository';
import type {Task} from '../../src/domain/task';
import {
  captureOutcome,
  createDeferred,
  InspectableBackend,
  makePendingTask,
  outcomeIdentity,
  PHASE4_REVIEW3_DELETED_AT,
  PHASE4_REVIEW3_RECOVERY_AT,
  PHASE4_REVIEW3_STARTED_AT,
  PHASE4_REVIEW3_STEP_COMPLETED_AT,
  PHASE4_REVIEW3_STORAGE_KEY,
  serializeEnvelope,
  settleWithinMicrotasks,
} from './phase4Review3Fixtures';

const REENTRANT_ERROR = 'TASK_REPOSITORY_REENTRANT_MUTATION';
const TEST_ESCAPE = 'PHASE4_REVIEW3_TEST_ESCAPE';

async function freshTasks(raw: string): Promise<Task[]> {
  const backend = new InspectableBackend();
  backend.seed(PHASE4_REVIEW3_STORAGE_KEY, raw);
  return createTaskRepository(
    createPersistentTaskStorage(backend),
  ).list({includeDeleted: true});
}

const REENTRANT_IDENTITY = {
  status: 'rejected',
  code: REENTRANT_ERROR,
  message: REENTRANT_ERROR,
} as const;

describe('P4-HARDENING-3 portable transaction activity boundary', () => {
  it('fail-fast rejects every facade mutation while a same-facade transaction callback is active, then restores normal mutations', async () => {
    const backend = new InspectableBackend();
    const baseline = makePendingTask('same-facade-active-baseline');
    backend.seed(
      PHASE4_REVIEW3_STORAGE_KEY,
      serializeEnvelope([baseline]),
    );
    const repository = createTaskRepository(
      createPersistentTaskStorage(backend),
    );
    await repository.list({includeDeleted: true});

    const entered = createDeferred<void>();
    const release = createDeferred<void>();
    const outer = repository.transaction(async transaction => {
      await transaction.create(makePendingTask('same-facade-outer-task'));
      entered.resolve(undefined);
      await release.promise;
      return 'outer-committed';
    });
    const outerOutcome = captureOutcome(outer);
    await entered.promise;

    const calls: Array<Promise<unknown>> = [
      repository.create(makePendingTask('active-external-create')),
      repository.update(baseline.id, {
        title: 'Active external update must reject',
        updatedAt: PHASE4_REVIEW3_STARTED_AT,
      }),
      repository.softDelete(baseline.id, PHASE4_REVIEW3_DELETED_AT),
      repository.transaction(transaction =>
        transaction.create(makePendingTask('active-external-transaction')),
      ),
    ];
    const eventual = calls.map(call => captureOutcome(call));
    let bounded;
    try {
      bounded = await Promise.all(
        calls.map(call => settleWithinMicrotasks(call)),
      );
    } finally {
      release.resolve(undefined);
    }

    expect(bounded.map(outcomeIdentity)).toEqual([
      REENTRANT_IDENTITY,
      REENTRANT_IDENTITY,
      REENTRANT_IDENTITY,
      REENTRANT_IDENTITY,
    ]);
    expect((await Promise.all(eventual)).map(outcomeIdentity)).toEqual([
      REENTRANT_IDENTITY,
      REENTRANT_IDENTITY,
      REENTRANT_IDENTITY,
      REENTRANT_IDENTITY,
    ]);
    expect(await outerOutcome).toEqual({
      status: 'fulfilled',
      value: 'outer-committed',
    });
    expect(backend.setAttempts).toHaveLength(1);
    expect(backend.removeCalls).toEqual([]);

    await expect(
      repository.update(baseline.id, {
        title: 'Recovered after active callback',
        updatedAt: PHASE4_REVIEW3_RECOVERY_AT,
      }),
    ).resolves.toMatchObject({title: 'Recovered after active callback'});
    expect(backend.setAttempts).toHaveLength(2);
    const raw = backend.raw(PHASE4_REVIEW3_STORAGE_KEY);
    expect(raw).not.toBeNull();
    await expect(freshTasks(raw ?? '')).resolves.toEqual([
      expect.objectContaining({
        id: baseline.id,
        title: 'Recovered after active callback',
        deletedAt: null,
      }),
      expect.objectContaining({id: 'same-facade-outer-task'}),
    ]);
  });

  const CROSS_FACADE_REENTRANT_CASES: ReadonlyArray<{
    label: string;
    invoke(repository: TaskRepository, baseline: Task): Promise<unknown>;
  }> = [
    {
      label: 'update',
      invoke: (repository, baseline) =>
        repository.update(baseline.id, {
          title: 'Cross-facade callback update must reject',
          updatedAt: PHASE4_REVIEW3_STARTED_AT,
        }),
    },
    {
      label: 'nested transaction',
      invoke: repository =>
        repository.transaction(transaction =>
          transaction.create(makePendingTask('cross-facade-nested-create')),
        ),
    },
  ];

  it.each(CROSS_FACADE_REENTRANT_CASES)(
    'fail-fast rejects callback-awaited repoB $label across facades sharing one backend/key and restores the queue',
    async scenario => {
      const backend = new InspectableBackend();
      const baseline = makePendingTask(`cross-facade-${scenario.label}`);
      const durableBefore = serializeEnvelope([baseline]);
      backend.seed(PHASE4_REVIEW3_STORAGE_KEY, durableBefore);
      const repositoryA = createTaskRepository(
        createPersistentTaskStorage(backend),
      );
      const repositoryB = createTaskRepository(
        createPersistentTaskStorage(backend),
      );
      await repositoryA.list({includeDeleted: true});

      const invoked = createDeferred<void>();
      const escape = createDeferred<void>();
      let reentrantPromise: Promise<unknown> | null = null;
      const outer = repositoryA.transaction(async () => {
        reentrantPromise = scenario.invoke(repositoryB, baseline);
        invoked.resolve(undefined);
        return Promise.race([
          reentrantPromise,
          escape.promise.then((): never => {
            throw new Error(TEST_ESCAPE);
          }),
        ]);
      });
      const finalOuter = captureOutcome(outer);
      await invoked.promise;

      let boundedOuter;
      try {
        boundedOuter = await settleWithinMicrotasks(outer);
      } finally {
        // Only unwinds a defective cyclic wait; it cannot produce the
        // conforming reentrant result.
        escape.resolve(undefined);
      }
      const capturedReentrant = reentrantPromise;
      if (capturedReentrant === null) {
        throw new Error('PHASE4_REVIEW3_REENTRANT_CALL_NOT_PUBLISHED');
      }
      const [outerResult, reentrantResult] = await Promise.all([
        finalOuter,
        captureOutcome(capturedReentrant),
      ]);

      expect(outcomeIdentity(boundedOuter)).toEqual(REENTRANT_IDENTITY);
      expect(outcomeIdentity(outerResult)).toEqual(REENTRANT_IDENTITY);
      expect(outcomeIdentity(reentrantResult)).toEqual(REENTRANT_IDENTITY);
      expect(backend.raw(PHASE4_REVIEW3_STORAGE_KEY)).toBe(durableBefore);
      expect(backend.setAttempts).toEqual([]);
      expect(backend.removeCalls).toEqual([]);

      await expect(
        repositoryB.update(baseline.id, {
          title: `Recovered after cross-facade ${scenario.label}`,
          updatedAt: PHASE4_REVIEW3_RECOVERY_AT,
        }),
      ).resolves.toMatchObject({
        title: `Recovered after cross-facade ${scenario.label}`,
      });
      expect(backend.setAttempts).toHaveLength(1);
      const durableAfter = backend.raw(PHASE4_REVIEW3_STORAGE_KEY);
      expect(durableAfter).not.toBeNull();
      await expect(freshTasks(durableAfter ?? '')).resolves.toEqual([
        expect.objectContaining({
          id: baseline.id,
          title: `Recovered after cross-facade ${scenario.label}`,
        }),
      ]);
    },
  );

  it('fail-fast rejects a test-initiated repoB mutation while repoA callback is active on the shared backend/key', async () => {
    const backend = new InspectableBackend();
    const baseline = makePendingTask('cross-facade-active-external');
    backend.seed(
      PHASE4_REVIEW3_STORAGE_KEY,
      serializeEnvelope([baseline]),
    );
    const repositoryA = createTaskRepository(
      createPersistentTaskStorage(backend),
    );
    const repositoryB = createTaskRepository(
      createPersistentTaskStorage(backend),
    );
    await repositoryA.list({includeDeleted: true});

    const entered = createDeferred<void>();
    const release = createDeferred<void>();
    const outer = repositoryA.transaction(async transaction => {
      await transaction.create(makePendingTask('cross-facade-active-outer'));
      entered.resolve(undefined);
      await release.promise;
      return 'outer-done';
    });
    const outerOutcome = captureOutcome(outer);
    await entered.promise;

    const activeExternal = repositoryB.update(baseline.id, {
      title: 'Must fail during shared active callback',
      updatedAt: PHASE4_REVIEW3_STARTED_AT,
    });
    const eventual = captureOutcome(activeExternal);
    let bounded;
    try {
      bounded = await settleWithinMicrotasks(activeExternal);
    } finally {
      release.resolve(undefined);
    }

    expect(outcomeIdentity(bounded)).toEqual(REENTRANT_IDENTITY);
    expect(outcomeIdentity(await eventual)).toEqual(REENTRANT_IDENTITY);
    expect(await outerOutcome).toEqual({status: 'fulfilled', value: 'outer-done'});
    expect(backend.setAttempts).toHaveLength(1);
    expect(backend.removeCalls).toEqual([]);
    await expect(repositoryA.getById(baseline.id)).resolves.toEqual(baseline);
  });

  it('queues a cross-facade external mutation after the callback returns while its commit write is pending', async () => {
    const backend = new InspectableBackend();
    const baseline = makePendingTask('cross-facade-commit-pending');
    const durableBefore = serializeEnvelope([baseline]);
    backend.seed(PHASE4_REVIEW3_STORAGE_KEY, durableBefore);
    const repositoryA = createTaskRepository(
      createPersistentTaskStorage(backend),
    );
    const repositoryB = createTaskRepository(
      createPersistentTaskStorage(backend),
    );
    await repositoryA.list({includeDeleted: true});

    const writeGate = backend.deferNextWrite();
    const committing = repositoryA.transaction(transaction =>
      transaction.update(baseline.id, {
        title: 'Transaction commit payload',
        updatedAt: PHASE4_REVIEW3_STARTED_AT,
      }),
    );
    const committingOutcome = captureOutcome(committing);
    await writeGate.entered;
    expect(backend.raw(PHASE4_REVIEW3_STORAGE_KEY)).toBe(durableBefore);

    const queued = repositoryB.update(baseline.id, {
      title: 'Queued after callback return',
      updatedAt: PHASE4_REVIEW3_STEP_COMPLETED_AT,
    });
    const queuedOutcome = captureOutcome(queued);
    let bounded;
    try {
      bounded = await settleWithinMicrotasks(queued);
    } finally {
      writeGate.release();
    }

    expect(outcomeIdentity(bounded)).toEqual({
      status: 'microtask-budget-exceeded',
    });
    expect(outcomeIdentity(await committingOutcome)).toEqual({
      status: 'fulfilled',
    });
    expect(outcomeIdentity(await queuedOutcome)).toEqual({status: 'fulfilled'});
    expect(backend.setAttempts).toHaveLength(2);
    expect(backend.removeCalls).toEqual([]);
    const raw = backend.raw(PHASE4_REVIEW3_STORAGE_KEY);
    expect(raw).not.toBeNull();
    await expect(freshTasks(raw ?? '')).resolves.toEqual([
      expect.objectContaining({
        id: baseline.id,
        title: 'Queued after callback return',
      }),
    ]);
  });
});
