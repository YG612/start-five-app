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
  throwingOrdinaryGetProxy,
} from './phase4Review4Fixtures';

const INVALID_IDENTITY = {
  status: 'rejected',
  code: 'TASK_SNAPSHOT_INVALID',
  message: 'TASK_SNAPSHOT_INVALID',
} as const;

async function freshTasks(raw: string): Promise<Task[]> {
  const backend = new ControlledBackend();
  backend.seed(PHASE4_REVIEW4_STORAGE_KEY, raw);
  return createTaskRepository(
    createPersistentTaskStorage(backend),
  ).list({includeDeleted: true});
}

describe('P4-HARDENING-4 facade caller-input materialization boundary', () => {
  it('maps a create task ordinary status get failure after transparent introspection and leaves storage/queue recoverable', async () => {
    const backend = new ControlledBackend();
    const baseline = makePendingTask('facade-create-baseline');
    const durableBefore = serializeEnvelope([baseline]);
    backend.seed(PHASE4_REVIEW4_STORAGE_KEY, durableBefore);
    const repository = createTaskRepository(
      createPersistentTaskStorage(backend),
    );
    await repository.list({includeDeleted: true});

    const adversarial = throwingOrdinaryGetProxy(
      makePendingTask('facade-create-proxy'),
      'status',
    );
    const rejected = await captureOutcome(
      repository.create(adversarial.proxy),
    );

    expect(outcomeIdentity(rejected)).toEqual(INVALID_IDENTITY);
    expect(adversarial.audit.hasIntrospection()).toBe(true);
    expect(adversarial.audit.hasThrowingGet('status')).toBe(true);
    expect(backend.raw(PHASE4_REVIEW4_STORAGE_KEY)).toBe(durableBefore);
    expect(backend.setAttempts).toEqual([]);
    expect(backend.setCommits).toEqual([]);
    expect(backend.removeAttempts).toEqual([]);
    await expect(repository.list({includeDeleted: true})).resolves.toEqual([
      baseline,
    ]);
    await expect(freshTasks(durableBefore)).resolves.toEqual([baseline]);

    await expect(
      repository.create(makePendingTask('facade-create-recovery')),
    ).resolves.toMatchObject({id: 'facade-create-recovery'});
    expect(backend.setAttempts).toHaveLength(1);
    expect(backend.setCommits).toHaveLength(1);
    const durableAfter = backend.raw(PHASE4_REVIEW4_STORAGE_KEY);
    expect(durableAfter).not.toBeNull();
    await expect(freshTasks(durableAfter ?? '')).resolves.toEqual([
      baseline,
      expect.objectContaining({id: 'facade-create-recovery'}),
    ]);
  });

  it('maps an update patch value get failure after transparent introspection and preserves the old task until legal recovery', async () => {
    const backend = new ControlledBackend();
    const baseline = makePendingTask('facade-update-baseline');
    const durableBefore = serializeEnvelope([baseline]);
    backend.seed(PHASE4_REVIEW4_STORAGE_KEY, durableBefore);
    const repository = createTaskRepository(
      createPersistentTaskStorage(backend),
    );
    await repository.list({includeDeleted: true});

    const adversarial = throwingOrdinaryGetProxy(
      {
        title: 'Caller-controlled title must never escape',
        updatedAt: PHASE4_REVIEW4_UPDATED_AT,
      },
      'title',
    );
    const rejected = await captureOutcome(
      repository.update(baseline.id, adversarial.proxy),
    );

    expect(outcomeIdentity(rejected)).toEqual(INVALID_IDENTITY);
    expect(adversarial.audit.hasIntrospection()).toBe(true);
    expect(adversarial.audit.hasThrowingGet('title')).toBe(true);
    expect(backend.raw(PHASE4_REVIEW4_STORAGE_KEY)).toBe(durableBefore);
    expect(backend.setAttempts).toEqual([]);
    expect(backend.setCommits).toEqual([]);
    expect(backend.removeAttempts).toEqual([]);
    await expect(repository.list({includeDeleted: true})).resolves.toEqual([
      baseline,
    ]);
    await expect(freshTasks(durableBefore)).resolves.toEqual([baseline]);

    await expect(
      repository.update(baseline.id, {
        title: 'Recovered legal update',
        updatedAt: PHASE4_REVIEW4_RECOVERY_AT,
      }),
    ).resolves.toMatchObject({
      id: baseline.id,
      title: 'Recovered legal update',
    });
    expect(backend.setAttempts).toHaveLength(1);
    expect(backend.setCommits).toHaveLength(1);
    const durableAfter = backend.raw(PHASE4_REVIEW4_STORAGE_KEY);
    expect(durableAfter).not.toBeNull();
    await expect(freshTasks(durableAfter ?? '')).resolves.toEqual([
      expect.objectContaining({
        id: baseline.id,
        title: 'Recovered legal update',
      }),
    ]);
  });
});
