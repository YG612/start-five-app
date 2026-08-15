import {createPersistentTaskStorage} from '../../src/data/persistentTaskStorage';
import {createTaskRepository} from '../../src/data/taskRepository';
import type {Task} from '../../src/domain/task';
import {
  captureOutcome,
  ControlledBackend,
  makePendingTask,
  outcomeIdentity,
  PHASE4_REVIEW4_RECOVERY_AT,
  PHASE4_REVIEW4_STORAGE_KEY,
  PHASE4_REVIEW4_UPDATED_AT,
  serializeEnvelope,
  transparentProxy,
} from './phase4Review4Fixtures';

async function freshTasks(raw: string): Promise<Task[]> {
  const backend = new ControlledBackend();
  backend.seed(PHASE4_REVIEW4_STORAGE_KEY, raw);
  return createTaskRepository(
    createPersistentTaskStorage(backend),
  ).list({includeDeleted: true});
}

describe('P4-HARDENING-4 narrow error mapping and legal input controls', () => {
  it('preserves TASK_STORAGE_READ_FAILED for a backend read exception and keeps retryable hydration', async () => {
    const backend = new ControlledBackend();
    const baseline = makePendingTask('backend-read-baseline');
    const durable = serializeEnvelope([baseline]);
    backend.seed(PHASE4_REVIEW4_STORAGE_KEY, durable);
    backend.failNextGetWith = new Error('BACKEND_READ_FAILURE');
    const repository = createTaskRepository(
      createPersistentTaskStorage(backend),
    );

    const failed = await captureOutcome(
      repository.list({includeDeleted: true}),
    );
    expect(outcomeIdentity(failed)).toEqual({
      status: 'rejected',
      code: 'TASK_STORAGE_READ_FAILED',
      message: 'TASK_STORAGE_READ_FAILED',
    });
    expect(backend.raw(PHASE4_REVIEW4_STORAGE_KEY)).toBe(durable);
    expect(backend.setAttempts).toEqual([]);
    expect(backend.setCommits).toEqual([]);
    expect(backend.removeAttempts).toEqual([]);

    await expect(
      repository.list({includeDeleted: true}),
    ).resolves.toEqual([baseline]);
    expect(backend.getAttempts).toHaveLength(2);
  });

  it('preserves TASK_STORAGE_WRITE_FAILED for a backend write exception without cache divergence and then recovers', async () => {
    const backend = new ControlledBackend();
    const baseline = makePendingTask('backend-write-baseline');
    const durableBefore = serializeEnvelope([baseline]);
    backend.seed(PHASE4_REVIEW4_STORAGE_KEY, durableBefore);
    const repository = createTaskRepository(
      createPersistentTaskStorage(backend),
    );
    await repository.list({includeDeleted: true});
    backend.failNextSetWith = new Error('BACKEND_WRITE_FAILURE');

    const failed = await captureOutcome(
      repository.update(baseline.id, {
        title: 'Failed backend write must not publish',
        updatedAt: PHASE4_REVIEW4_UPDATED_AT,
      }),
    );
    expect(outcomeIdentity(failed)).toEqual({
      status: 'rejected',
      code: 'TASK_STORAGE_WRITE_FAILED',
      message: 'TASK_STORAGE_WRITE_FAILED',
    });
    expect(backend.raw(PHASE4_REVIEW4_STORAGE_KEY)).toBe(durableBefore);
    expect(backend.setAttempts).toHaveLength(1);
    expect(backend.setCommits).toEqual([]);
    expect(backend.removeAttempts).toEqual([]);
    await expect(repository.list({includeDeleted: true})).resolves.toEqual([
      baseline,
    ]);
    await expect(freshTasks(durableBefore)).resolves.toEqual([baseline]);

    await expect(
      repository.update(baseline.id, {
        title: 'Recovered after backend write failure',
        updatedAt: PHASE4_REVIEW4_RECOVERY_AT,
      }),
    ).resolves.toMatchObject({
      id: baseline.id,
      title: 'Recovered after backend write failure',
    });
    expect(backend.setAttempts).toHaveLength(2);
    expect(backend.setCommits).toHaveLength(1);
  });

  it('keeps a one-shot ordinary create object and a non-throwing transparent update Proxy usable', async () => {
    const backend = new ControlledBackend();
    backend.seed(PHASE4_REVIEW4_STORAGE_KEY, serializeEnvelope([]));
    const repository = createTaskRepository(
      createPersistentTaskStorage(backend),
    );
    const ordinary = makePendingTask('legal-ordinary-input');

    await expect(repository.create(ordinary)).resolves.toEqual(ordinary);
    const normalProxy = transparentProxy({
      title: 'Legal transparent Proxy update',
      updatedAt: PHASE4_REVIEW4_UPDATED_AT,
    });
    await expect(
      repository.update(ordinary.id, normalProxy),
    ).resolves.toMatchObject({
      id: ordinary.id,
      title: 'Legal transparent Proxy update',
    });

    expect(Object.getPrototypeOf(ordinary)).toBe(Object.prototype);
    expect(ordinary.title).toBe(`Phase 4 review 4 task ${ordinary.id}`);
    expect(backend.setAttempts).toHaveLength(2);
    expect(backend.setCommits).toHaveLength(2);
    expect(backend.removeAttempts).toEqual([]);
    const raw = backend.raw(PHASE4_REVIEW4_STORAGE_KEY);
    expect(raw).not.toBeNull();
    await expect(freshTasks(raw ?? '')).resolves.toEqual([
      expect.objectContaining({
        id: ordinary.id,
        title: 'Legal transparent Proxy update',
      }),
    ]);
  });
});
