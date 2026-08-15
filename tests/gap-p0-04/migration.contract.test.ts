import {createStartFiveApp} from '../../src/app/startFiveApp';
import {createTaskLifecycleService} from '../../src/application/coreAppService';
import {
  ControlledBackend,
  CURRENT_SCHEMA_VERSION,
  CURRENT_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  SNAPSHOT_SCHEMA,
  createManagedRuntime,
  createManagedStorage,
  currentEnvelope,
  defaultVersionEnvelope,
  legacyRawArray,
  legacyVersionEnvelope,
  makeCompletedTask,
  makeDependencies,
  makeTask,
} from './taskDataRecoveryTestKit';

describe('GAP-P0-04 deterministic task-data migration', () => {
  it('keeps a legal current V1 envelope byte-stable with no write or dependency consumption', async () => {
    const task = makeCompletedTask('already-current');
    const raw = currentEnvelope([task]);
    const backend = new ControlledBackend();
    backend.seed(CURRENT_STORAGE_KEY, raw);
    const dependencies = makeDependencies();
    const storage = createManagedStorage(backend, dependencies.dependencies);

    await expect(storage.getItem(CURRENT_STORAGE_KEY)).resolves.toBe(
      legacyRawArray([task]),
    );

    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(raw);
    expect(backend.getAttempts).toEqual([
      CURRENT_STORAGE_KEY,
      LEGACY_STORAGE_KEY,
    ]);
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeAttempts).toEqual([]);
    expect(dependencies.now).not.toHaveBeenCalled();
    expect(dependencies.idGenerator).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'V0',
      source(task: ReturnType<typeof makeTask>): string {
        return legacyVersionEnvelope([task]);
      },
    },
    {
      name: 'documented default',
      source(task: ReturnType<typeof makeTask>): string {
        return defaultVersionEnvelope([task]);
      },
    },
  ])('migrates a legal $name envelope in place to exact canonical V1', async ({source}) => {
    const task = makeTask('in-place-predecessor');
    const backend = new ControlledBackend();
    backend.seed(CURRENT_STORAGE_KEY, source(task));
    const dependencies = makeDependencies();
    const storage = createManagedStorage(backend, dependencies.dependencies);

    await expect(storage.getItem(CURRENT_STORAGE_KEY)).resolves.toBe(
      legacyRawArray([task]),
    );
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(currentEnvelope([task]));
    expect(backend.getAttempts).toEqual([
      CURRENT_STORAGE_KEY,
      LEGACY_STORAGE_KEY,
    ]);
    expect(backend.setCommits).toEqual([
      {key: CURRENT_STORAGE_KEY, value: currentEnvelope([task])},
    ]);
    expect(backend.removeAttempts).toEqual([]);
    expect(dependencies.now).not.toHaveBeenCalled();
    expect(dependencies.idGenerator).not.toHaveBeenCalled();
  });

  it('migrates the historical raw array by committing current before removing legacy', async () => {
    const task = makeTask('historical-array');
    const source = legacyRawArray([task]);
    const backend = new ControlledBackend();
    backend.seed(LEGACY_STORAGE_KEY, source);
    const storage = createManagedStorage(
      backend,
      makeDependencies().dependencies,
    );

    await expect(storage.getItem(CURRENT_STORAGE_KEY)).resolves.toBe(source);

    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(currentEnvelope([task]));
    expect(backend.raw(LEGACY_STORAGE_KEY)).toBeNull();
    expect(backend.getAttempts).toEqual([
      CURRENT_STORAGE_KEY,
      LEGACY_STORAGE_KEY,
    ]);
    const mutationOrder = backend.events
      .filter(event => event.phase === 'commit' && event.operation !== 'get')
      .map(event => `${event.operation}:${event.key}`);
    expect(mutationOrder).toEqual([
      `set:${CURRENT_STORAGE_KEY}`,
      `remove:${LEGACY_STORAGE_KEY}`,
    ]);
  });

  it('preserves every legal Task/Subtask field and does not invent optional additive fields', async () => {
    const task = makeTask('field-preservation', {
      description: 'Preserve exact description',
      important: false,
      urgent: true,
      subtasks: [],
    });
    const backend = new ControlledBackend();
    backend.seed(CURRENT_STORAGE_KEY, legacyVersionEnvelope([task]));
    const storage = createManagedStorage(
      backend,
      makeDependencies().dependencies,
    );

    const repositoryRaw = await storage.getItem(CURRENT_STORAGE_KEY);

    expect(JSON.parse(repositoryRaw ?? 'null')).toEqual([task]);
    expect(JSON.parse(backend.raw(CURRENT_STORAGE_KEY) ?? 'null')).toEqual({
      schema: SNAPSHOT_SCHEMA,
      version: CURRENT_SCHEMA_VERSION,
      tasks: [task],
    });
    expect(backend.getAttempts).toEqual([
      CURRENT_STORAGE_KEY,
      LEGACY_STORAGE_KEY,
    ]);
    expect(Object.hasOwn(task, 'scheduledStartAt')).toBe(false);
    expect(Object.hasOwn(task, 'estimatedMinutes')).toBe(false);
    expect(Object.hasOwn(task, 'firstStep')).toBe(false);
  });

  it('preserves every supplied legal A2 planning field through predecessor migration', async () => {
    const task = makeTask('planning-field-preservation', {
      scheduledStartAt: '2026-08-05T09:00:00.000Z',
      estimatedMinutes: 25,
      firstStep: 'Open the planning document',
    });
    const source = legacyVersionEnvelope([task]);
    const backend = new ControlledBackend(
      new Map([[CURRENT_STORAGE_KEY, source]]),
    );
    const storage = createManagedStorage(
      backend,
      makeDependencies().dependencies,
    );

    await expect(storage.getItem(CURRENT_STORAGE_KEY)).resolves.toBe(
      legacyRawArray([task]),
    );
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(currentEnvelope([task]));
    expect(backend.getAttempts).toEqual([
      CURRENT_STORAGE_KEY,
      LEGACY_STORAGE_KEY,
    ]);
    expect(JSON.parse(backend.raw(CURRENT_STORAGE_KEY) ?? 'null')).toMatchObject({
      tasks: [
        expect.objectContaining({
          scheduledStartAt: task.scheduledStartAt,
          estimatedMinutes: 25,
          firstStep: 'Open the planning document',
        }),
      ],
    });
  });

  it('is idempotent across a fresh backend facade over the same durable map', async () => {
    const task = makeTask('restart-idempotence');
    const durable = new Map<string, string>([
      [LEGACY_STORAGE_KEY, legacyRawArray([task])],
    ]);
    const firstBackend = new ControlledBackend(durable);
    await createManagedStorage(
      firstBackend,
      makeDependencies().dependencies,
    ).getItem(CURRENT_STORAGE_KEY);

    const restartBackend = new ControlledBackend(durable);
    const restartDependencies = makeDependencies();
    const restarted = createManagedStorage(
      restartBackend,
      restartDependencies.dependencies,
    );

    await expect(restarted.getItem(CURRENT_STORAGE_KEY)).resolves.toBe(
      legacyRawArray([task]),
    );
    expect(restartBackend.getAttempts).toEqual([
      CURRENT_STORAGE_KEY,
      LEGACY_STORAGE_KEY,
    ]);
    expect(restartBackend.setAttempts).toEqual([]);
    expect(restartBackend.removeAttempts).toEqual([]);
    expect(restartDependencies.now).not.toHaveBeenCalled();
    expect(restartDependencies.idGenerator).not.toHaveBeenCalled();
  });

  it('returns null for a new user after probing only the two task keys', async () => {
    const backend = new ControlledBackend();
    const dependencies = makeDependencies();
    const storage = createManagedStorage(backend, dependencies.dependencies);

    await expect(storage.getItem(CURRENT_STORAGE_KEY)).resolves.toBeNull();

    expect(backend.getAttempts).toEqual([
      CURRENT_STORAGE_KEY,
      LEGACY_STORAGE_KEY,
    ]);
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeAttempts).toEqual([]);
    expect(dependencies.now).not.toHaveBeenCalled();
    expect(dependencies.idGenerator).not.toHaveBeenCalled();
  });

  it('exposes recovery through an independent managed-runtime controller without changing app composition shape', async () => {
    const task = makeTask('managed-runtime');
    const backend = new ControlledBackend();
    backend.seed(LEGACY_STORAGE_KEY, legacyRawArray([task]));
    const dependencies = makeDependencies();

    const runtime = createManagedRuntime(backend, dependencies.dependencies);

    expect(Object.keys(runtime).sort()).toEqual(['app', 'recovery']);
    expect(Object.keys(runtime.app).sort()).toEqual([
      'AppRoot',
      'repository',
      'service',
    ]);
    expect(Object.keys(runtime.recovery).sort()).toEqual([
      'inspect',
      'quarantine',
      'recover',
      'restore',
    ]);
    expect(Object.keys(runtime.app.service).sort()).toEqual([
      'addFirstStep',
      'chooseRecommended',
      'createTask',
      'finishStep',
      'finishTask',
      'getState',
      'startRecommended',
    ]);
    expect(runtime.recovery).not.toBe(runtime.app.service);
    const lifecycle = createTaskLifecycleService({
      repository: runtime.app.repository,
      now: dependencies.now,
      idGenerator: dependencies.idGenerator,
    });
    expect(Object.keys(lifecycle).sort()).toEqual([
      'complete',
      'create',
      'delay',
      'getById',
      'getQuadrantProjection',
      'getQueryResult',
      'getRecommendation',
      'list',
      'reschedule',
      'softDelete',
      'update',
    ]);
    await expect(runtime.app.repository.list({includeDeleted: true})).resolves.toEqual([
      task,
    ]);
    expect(backend.getAttempts).toEqual([
      CURRENT_STORAGE_KEY,
      LEGACY_STORAGE_KEY,
    ]);
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(currentEnvelope([task]));
    expect(dependencies.now).not.toHaveBeenCalled();
    expect(dependencies.idGenerator).not.toHaveBeenCalled();
  });

  it('keeps the shipped createStartFiveApp result exact while routing hydration through managed migration', async () => {
    const task = makeTask('existing-composition');
    const backend = new ControlledBackend();
    backend.seed(LEGACY_STORAGE_KEY, legacyRawArray([task]));
    const dependencies = makeDependencies();

    const app = createStartFiveApp({
      storageBackend: backend,
      now: dependencies.now,
      idGenerator: dependencies.idGenerator,
    });

    expect(Object.keys(app).sort()).toEqual([
      'AppRoot',
      'repository',
      'service',
    ]);
    await expect(app.repository.list({includeDeleted: true})).resolves.toEqual([
      task,
    ]);
    expect(backend.getAttempts).toEqual([
      CURRENT_STORAGE_KEY,
      LEGACY_STORAGE_KEY,
    ]);
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(currentEnvelope([task]));
    expect(backend.raw(LEGACY_STORAGE_KEY)).toBeNull();
    expect(dependencies.now).not.toHaveBeenCalled();
    expect(dependencies.idGenerator).not.toHaveBeenCalled();
  });

  it('wires the real managed-runtime recovery controller to the caller clock and ID exactly once', async () => {
    const source = '{runtime quarantine source';
    const backend = new ControlledBackend(
      new Map([[CURRENT_STORAGE_KEY, source]]),
    );
    const dependencies = makeDependencies();
    const runtime = createManagedRuntime(backend, dependencies.dependencies);

    await expect(runtime.recovery.quarantine()).resolves.toEqual({
      state: 'quarantined',
      backupKey: 'start-five.tasks.quarantine.backup-001',
      category: 'MALFORMED_JSON',
      createdAt: '2026-08-05T08:00:00.000Z',
    });
    expect(dependencies.now).toHaveBeenCalledTimes(1);
    expect(dependencies.idGenerator).toHaveBeenCalledTimes(1);
    expect(backend.raw('start-five.tasks.quarantine.backup-001')).toBe(source);
  });
});
