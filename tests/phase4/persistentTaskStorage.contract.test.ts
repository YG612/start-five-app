import {createTaskRepository} from '../../src/data/taskRepository';
import {getQuadrant} from '../../src/domain/quadrant';
import {
  InspectableAsyncKeyValueBackend,
  makePhase4Task,
  makeQuadrantAndStatusTasks,
  PHASE4_SNAPSHOT_SCHEMA,
  PHASE4_SNAPSHOT_VERSION,
  PHASE4_STORAGE_KEY,
  requirePhase4Module,
  serializePhase4Envelope,
  type PersistentTaskStorageModule,
} from './phase4Fixtures';

function loadPersistentStorageModule(): PersistentTaskStorageModule {
  return requirePhase4Module<PersistentTaskStorageModule>(
    '../../src/data/persistentTaskStorage',
    'src/data/persistentTaskStorage.ts#createPersistentTaskStorage',
  );
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error: unknown) {
    return error;
  }
  throw new Error('EXPECTED_REJECTION');
}

describe('P4-PERSIST versioned local task persistence contract', () => {
  it('recovers every quadrant, task status, timestamp, score, and step across adapter and repository instances', async () => {
    const {createPersistentTaskStorage} = loadPersistentStorageModule();
    const backend = new InspectableAsyncKeyValueBackend();
    const firstRepository = createTaskRepository(
      createPersistentTaskStorage(backend),
    );
    const expected = makeQuadrantAndStatusTasks();

    for (const task of expected) {
      await firstRepository.create(task);
    }

    const durableRaw = backend.raw(PHASE4_STORAGE_KEY);
    expect(durableRaw).not.toBeNull();
    const envelope = JSON.parse(durableRaw ?? '{}') as Record<string, unknown>;
    expect(Object.keys(envelope).sort()).toEqual(['schema', 'tasks', 'version']);
    expect(envelope).toMatchObject({
      schema: PHASE4_SNAPSHOT_SCHEMA,
      version: PHASE4_SNAPSHOT_VERSION,
      tasks: expected,
    });

    const reloadedRepository = createTaskRepository(
      createPersistentTaskStorage(backend),
    );
    const reloaded = await reloadedRepository.list({includeDeleted: true});

    expect(reloaded).toEqual(expected);
    expect(
      reloaded.map(task => getQuadrant(task.important, task.urgent)),
    ).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    expect(reloaded.map(task => task.status)).toEqual([
      'pending',
      'in_progress',
      'completed',
      'cancelled',
    ]);
    expect(reloaded[3]?.deletedAt).toBe('2026-08-04T10:20:00.000Z');
    expect(reloaded[1]?.subtasks.map(step => step.status)).toEqual([
      'completed',
      'pending',
    ]);
  });

  it('treats an absent backend value as an empty task list without writing during hydration', async () => {
    const {createPersistentTaskStorage} = loadPersistentStorageModule();
    const backend = new InspectableAsyncKeyValueBackend();
    const repository = createTaskRepository(createPersistentTaskStorage(backend));

    await expect(repository.list()).resolves.toEqual([]);

    expect(backend.getCalls).toEqual([PHASE4_STORAGE_KEY]);
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeCalls).toEqual([]);
  });

  it('rejects malformed JSON with a stable code, exposes no invented task, and permits a clean retry', async () => {
    const {createPersistentTaskStorage} = loadPersistentStorageModule();
    const backend = new InspectableAsyncKeyValueBackend();
    const malformedRaw = '{not valid JSON';
    backend.seed(PHASE4_STORAGE_KEY, malformedRaw);
    const repository = createTaskRepository(createPersistentTaskStorage(backend));

    await expect(repository.list()).rejects.toMatchObject({
      code: 'TASK_SNAPSHOT_CORRUPT',
    });
    expect(backend.raw(PHASE4_STORAGE_KEY)).toBe(malformedRaw);
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeCalls).toEqual([]);

    const recoveredTask = makePhase4Task('recovered-after-corruption');
    backend.seed(
      PHASE4_STORAGE_KEY,
      serializePhase4Envelope([recoveredTask]),
    );
    await expect(repository.list()).resolves.toEqual([recoveredTask]);
    expect(backend.getCalls).toEqual([
      PHASE4_STORAGE_KEY,
      PHASE4_STORAGE_KEY,
    ]);
  });

  it('rejects an unsupported schema instead of treating it as current task data', async () => {
    const {createPersistentTaskStorage} = loadPersistentStorageModule();
    const backend = new InspectableAsyncKeyValueBackend();
    const foreignRaw = JSON.stringify({
      schema: 'another-product.tasks',
      version: PHASE4_SNAPSHOT_VERSION,
      tasks: [makePhase4Task('foreign-schema')],
    });
    backend.seed(PHASE4_STORAGE_KEY, foreignRaw);
    const repository = createTaskRepository(createPersistentTaskStorage(backend));

    await expect(repository.list()).rejects.toMatchObject({
      code: 'TASK_SNAPSHOT_UNSUPPORTED',
    });
    expect(backend.raw(PHASE4_STORAGE_KEY)).toBe(foreignRaw);
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeCalls).toEqual([]);
  });

  it('rejects a future snapshot version without mutating or downgrading it', async () => {
    const {createPersistentTaskStorage} = loadPersistentStorageModule();
    const backend = new InspectableAsyncKeyValueBackend();
    const futureRaw = JSON.stringify({
      schema: PHASE4_SNAPSHOT_SCHEMA,
      version: PHASE4_SNAPSHOT_VERSION + 1,
      tasks: [makePhase4Task('future-version')],
    });
    backend.seed(PHASE4_STORAGE_KEY, futureRaw);
    const repository = createTaskRepository(createPersistentTaskStorage(backend));

    await expect(repository.list()).rejects.toMatchObject({
      code: 'TASK_SNAPSHOT_UNSUPPORTED',
    });
    expect(backend.raw(PHASE4_STORAGE_KEY)).toBe(futureRaw);
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeCalls).toEqual([]);
  });

  it('rejects structurally invalid task data before it can enter repository state', async () => {
    const {createPersistentTaskStorage} = loadPersistentStorageModule();
    const backend = new InspectableAsyncKeyValueBackend();
    const invalidTaskRaw = JSON.stringify({
      schema: PHASE4_SNAPSHOT_SCHEMA,
      version: PHASE4_SNAPSHOT_VERSION,
      tasks: [{id: 'missing-required-fields', title: 42}],
    });
    backend.seed(PHASE4_STORAGE_KEY, invalidTaskRaw);
    const repository = createTaskRepository(createPersistentTaskStorage(backend));

    await expect(repository.list()).rejects.toMatchObject({
      code: 'TASK_SNAPSHOT_INVALID',
    });
    expect(backend.raw(PHASE4_STORAGE_KEY)).toBe(invalidTaskRaw);
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeCalls).toEqual([]);
  });

  it('maps backend read failures to a stable error while retaining the original cause', async () => {
    const {createPersistentTaskStorage} = loadPersistentStorageModule();
    const backend = new InspectableAsyncKeyValueBackend();
    const existingRaw = serializePhase4Envelope([
      makePhase4Task('existing-before-read-failure'),
    ]);
    backend.seed(PHASE4_STORAGE_KEY, existingRaw);
    const backendError = new Error('secure storage unavailable');
    backend.failNextGetWith = backendError;
    const repository = createTaskRepository(createPersistentTaskStorage(backend));

    const observed = await rejectionOf(repository.list());
    expect(observed).toMatchObject({
      code: 'TASK_STORAGE_READ_FAILED',
      message: 'TASK_STORAGE_READ_FAILED',
    });
    expect((observed as {cause?: unknown}).cause).toBe(backendError);
    expect(backend.raw(PHASE4_STORAGE_KEY)).toBe(existingRaw);
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeCalls).toEqual([]);
  });

  it('maps backend write failures and preserves both durable and already-visible state atomically', async () => {
    const {createPersistentTaskStorage} = loadPersistentStorageModule();
    const backend = new InspectableAsyncKeyValueBackend();
    const repository = createTaskRepository(createPersistentTaskStorage(backend));
    const original = makePhase4Task('atomic-task');
    await repository.create(original);
    const durableBeforeFailure = backend.raw(PHASE4_STORAGE_KEY);
    const commitsBeforeFailure = backend.committedSetCalls.length;
    const backendError = new Error('disk full');
    backend.failNextSetWith = backendError;

    const observed = await rejectionOf(
      repository.update(original.id, {
        title: 'must not become partially visible',
        updatedAt: '2026-08-04T10:15:00.000Z',
      }),
    );
    expect(observed).toMatchObject({
      code: 'TASK_STORAGE_WRITE_FAILED',
      message: 'TASK_STORAGE_WRITE_FAILED',
    });
    expect((observed as {cause?: unknown}).cause).toBe(backendError);

    expect(backend.raw(PHASE4_STORAGE_KEY)).toBe(durableBeforeFailure);
    expect(backend.committedSetCalls).toHaveLength(commitsBeforeFailure);
    expect(backend.setAttempts).toHaveLength(commitsBeforeFailure + 1);
    expect(backend.setAttempts.at(-1)?.key).toBe(PHASE4_STORAGE_KEY);
    expect(backend.removeCalls).toEqual([]);
    await expect(repository.getById(original.id)).resolves.toEqual(original);

    const newInstance = createTaskRepository(createPersistentTaskStorage(backend));
    await expect(newInstance.getById(original.id)).resolves.toEqual(original);
  });

  it('commits a valid mutation through exactly one target-key set and never delete-then-replace', async () => {
    const {createPersistentTaskStorage} = loadPersistentStorageModule();
    const backend = new InspectableAsyncKeyValueBackend();
    const repository = createTaskRepository(createPersistentTaskStorage(backend));
    const task = makePhase4Task('single-write-task');

    await repository.create(task);

    expect(backend.setAttempts).toHaveLength(1);
    expect(backend.setAttempts[0]?.key).toBe(PHASE4_STORAGE_KEY);
    expect(backend.committedSetCalls).toEqual(backend.setAttempts);
    expect(backend.removeCalls).toEqual([]);
    expect(JSON.parse(backend.setAttempts[0]?.value ?? '{}')).toEqual({
      schema: PHASE4_SNAPSHOT_SCHEMA,
      version: PHASE4_SNAPSHOT_VERSION,
      tasks: [task],
    });
  });

  it('refuses invalid outbound snapshots before any backend write is attempted', async () => {
    const {createPersistentTaskStorage} = loadPersistentStorageModule();
    const backend = new InspectableAsyncKeyValueBackend();
    const storage = createPersistentTaskStorage(backend);
    const oldSnapshot = serializePhase4Envelope([
      makePhase4Task('preserved-before-invalid-outbound'),
    ]);
    backend.seed(PHASE4_STORAGE_KEY, oldSnapshot);

    await expect(
      storage.setItem(PHASE4_STORAGE_KEY, JSON.stringify([{id: 'invalid'}])),
    ).rejects.toMatchObject({code: 'TASK_SNAPSHOT_INVALID'});
    expect(backend.raw(PHASE4_STORAGE_KEY)).toBe(oldSnapshot);
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeCalls).toEqual([]);

    await expect(
      storage.setItem(PHASE4_STORAGE_KEY, '{invalid outbound JSON'),
    ).rejects.toMatchObject({code: 'TASK_SNAPSHOT_INVALID'});

    expect(backend.raw(PHASE4_STORAGE_KEY)).toBe(oldSnapshot);
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeCalls).toEqual([]);
  });
});

describe('P4-PERSIST test backend invariant', () => {
  it('models a failed single-key write without changing the previously committed value', async () => {
    const backend = new InspectableAsyncKeyValueBackend();
    backend.seed(PHASE4_STORAGE_KEY, 'before');
    backend.failNextSetWith = new Error('fixture failure');

    await expect(
      backend.setItem(PHASE4_STORAGE_KEY, 'after'),
    ).rejects.toThrow('fixture failure');

    expect(backend.raw(PHASE4_STORAGE_KEY)).toBe('before');
    expect(backend.setAttempts).toEqual([
      {key: PHASE4_STORAGE_KEY, value: 'after'},
    ]);
    expect(backend.committedSetCalls).toEqual([]);
  });
});
