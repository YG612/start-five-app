import {createPersistentTaskStorage} from '../../src/data/persistentTaskStorage';
import {createTaskRepository} from '../../src/data/taskRepository';
import type {Task} from '../../src/domain/task';
import {
  captureOutcome,
  InspectableBackend,
  makePendingTask,
  outcomeIdentity,
  PHASE4_REVIEW3_DELETED_AT,
  PHASE4_REVIEW3_STARTED_AT,
  PHASE4_REVIEW3_STORAGE_KEY,
  serializeEnvelope,
  type TransactionSurface,
} from './phase4Review3Fixtures';

const EXPIRED_ERROR = 'TASK_REPOSITORY_TRANSACTION_EXPIRED';
const ROLLBACK_ERROR = 'PHASE4_REVIEW3_ROLLBACK';

async function freshTasks(raw: string): Promise<Task[]> {
  const backend = new InspectableBackend();
  backend.seed(PHASE4_REVIEW3_STORAGE_KEY, raw);
  return createTaskRepository(
    createPersistentTaskStorage(backend),
  ).list({includeDeleted: true});
}

function invokeLeakedSurface(
  surface: TransactionSurface,
  baseline: Task,
  suffix: string,
): Array<Promise<unknown>> {
  return [
    surface.create(makePendingTask(`leaked-create-${suffix}`)),
    surface.update(baseline.id, {
      title: `Leaked update ${suffix}`,
      updatedAt: PHASE4_REVIEW3_STARTED_AT,
    }),
    surface.softDelete(baseline.id, PHASE4_REVIEW3_DELETED_AT),
  ];
}

function expectExpired(
  outcomes: ReadonlyArray<Awaited<ReturnType<typeof captureOutcome>>>,
): void {
  expect(outcomes.map(outcomeIdentity)).toEqual([
    {status: 'rejected', code: EXPIRED_ERROR, message: EXPIRED_ERROR},
    {status: 'rejected', code: EXPIRED_ERROR, message: EXPIRED_ERROR},
    {status: 'rejected', code: EXPIRED_ERROR, message: EXPIRED_ERROR},
  ]);
}

describe('P4-HARDENING-3 transaction surface callback lifetime', () => {
  it('expires a leaked surface after commit and preserves durable/cache/fresh agreement', async () => {
    const backend = new InspectableBackend();
    const baseline = makePendingTask('surface-after-commit');
    backend.seed(
      PHASE4_REVIEW3_STORAGE_KEY,
      serializeEnvelope([baseline]),
    );
    const repository = createTaskRepository(
      createPersistentTaskStorage(backend),
    );
    await repository.list({includeDeleted: true});

    let leaked: TransactionSurface | null = null;
    await expect(
      repository.transaction(async transaction => {
        leaked = transaction;
        return transaction.update(baseline.id, {
          title: 'Committed transaction value',
          updatedAt: PHASE4_REVIEW3_STARTED_AT,
        });
      }),
    ).resolves.toMatchObject({title: 'Committed transaction value'});
    const committedRaw = backend.raw(PHASE4_REVIEW3_STORAGE_KEY);
    expect(committedRaw).not.toBeNull();
    expect(backend.setAttempts).toHaveLength(1);

    const escapedSurface = leaked;
    if (escapedSurface === null) {
      throw new Error('PHASE4_REVIEW3_SURFACE_NOT_CAPTURED');
    }
    const outcomes = await Promise.all(
      invokeLeakedSurface(escapedSurface, baseline, 'after-commit').map(
        captureOutcome,
      ),
    );
    expectExpired(outcomes);
    expect(backend.raw(PHASE4_REVIEW3_STORAGE_KEY)).toBe(committedRaw);
    expect(backend.setAttempts).toHaveLength(1);
    expect(backend.removeCalls).toEqual([]);

    const expected = [
      expect.objectContaining({
        id: baseline.id,
        title: 'Committed transaction value',
        deletedAt: null,
      }),
    ];
    await expect(repository.list({includeDeleted: true})).resolves.toEqual(
      expected,
    );
    await expect(freshTasks(committedRaw ?? '')).resolves.toEqual(expected);
  });

  it('expires a leaked surface after rollback and leaves all three views at the pre-transaction snapshot', async () => {
    const backend = new InspectableBackend();
    const baseline = makePendingTask('surface-after-rollback');
    const durableBefore = serializeEnvelope([baseline]);
    backend.seed(PHASE4_REVIEW3_STORAGE_KEY, durableBefore);
    const repository = createTaskRepository(
      createPersistentTaskStorage(backend),
    );
    await repository.list({includeDeleted: true});

    let leaked: TransactionSurface | null = null;
    const rolledBack = await captureOutcome(
      repository.transaction(async transaction => {
        leaked = transaction;
        await transaction.update(baseline.id, {
          title: 'Rolled-back staged value',
          updatedAt: PHASE4_REVIEW3_STARTED_AT,
        });
        throw new Error(ROLLBACK_ERROR);
      }),
    );
    expect(
      rolledBack.status === 'rejected'
        ? (rolledBack.error as {message?: unknown}).message
        : rolledBack.status,
    ).toBe(ROLLBACK_ERROR);

    const escapedSurface = leaked;
    if (escapedSurface === null) {
      throw new Error('PHASE4_REVIEW3_SURFACE_NOT_CAPTURED');
    }
    const outcomes = await Promise.all(
      invokeLeakedSurface(escapedSurface, baseline, 'after-rollback').map(
        captureOutcome,
      ),
    );
    expectExpired(outcomes);
    expect(backend.raw(PHASE4_REVIEW3_STORAGE_KEY)).toBe(durableBefore);
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeCalls).toEqual([]);
    await expect(repository.list({includeDeleted: true})).resolves.toEqual([
      baseline,
    ]);
    await expect(freshTasks(durableBefore)).resolves.toEqual([baseline]);
  });

  it('expires the surface as soon as the callback returns, including while commit storage.setItem is still deferred', async () => {
    const backend = new InspectableBackend();
    const baseline = makePendingTask('surface-during-commit');
    const durableBefore = serializeEnvelope([baseline]);
    backend.seed(PHASE4_REVIEW3_STORAGE_KEY, durableBefore);
    const repository = createTaskRepository(
      createPersistentTaskStorage(backend),
    );
    await repository.list({includeDeleted: true});

    const writeGate = backend.deferNextWrite();
    let leaked: TransactionSurface | null = null;
    const committing = repository.transaction(async transaction => {
      leaked = transaction;
      await transaction.update(baseline.id, {
        title: 'Serialized commit value',
        updatedAt: PHASE4_REVIEW3_STARTED_AT,
      });
      return 'callback-returned';
    });
    const committingOutcome = captureOutcome(committing);
    await writeGate.entered;
    expect(backend.raw(PHASE4_REVIEW3_STORAGE_KEY)).toBe(durableBefore);
    expect(backend.setAttempts).toHaveLength(1);

    const escapedSurface = leaked;
    if (escapedSurface === null) {
      writeGate.release();
      throw new Error('PHASE4_REVIEW3_SURFACE_NOT_CAPTURED');
    }
    let outcomes;
    try {
      outcomes = await Promise.all(
        invokeLeakedSurface(escapedSurface, baseline, 'during-commit').map(
          captureOutcome,
        ),
      );
    } finally {
      writeGate.release();
    }
    expectExpired(outcomes);
    expect(await committingOutcome).toEqual({
      status: 'fulfilled',
      value: 'callback-returned',
    });
    expect(backend.setAttempts).toHaveLength(1);
    expect(backend.removeCalls).toEqual([]);

    const committedRaw = backend.raw(PHASE4_REVIEW3_STORAGE_KEY);
    expect(committedRaw).not.toBeNull();
    const expected = [
      expect.objectContaining({
        id: baseline.id,
        title: 'Serialized commit value',
        deletedAt: null,
      }),
    ];
    await expect(repository.list({includeDeleted: true})).resolves.toEqual(
      expected,
    );
    await expect(freshTasks(committedRaw ?? '')).resolves.toEqual(expected);
  });
});
