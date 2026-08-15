import {
  ControlledBackend,
  CURRENT_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  afterMicrotasks,
  backupKey,
  captureOutcome,
  createManagedStorage,
  currentEnvelope,
  defaultVersionEnvelope,
  errorView,
  legacyRawArray,
  legacyVersionEnvelope,
  makeDependencies,
  makeFailIfCalledDependencies,
  makeTask,
  restoreStorage,
} from './taskDataRecoveryTestKit';

async function barrierSignal(
  entered: Promise<void>,
  settled: Promise<unknown>,
): Promise<'entered' | 'settled' | 'budget'> {
  return Promise.race([
    entered.then(() => 'entered' as const),
    settled.then(() => 'settled' as const),
    afterMicrotasks(256).then(() => 'budget' as const),
  ]);
}

describe('GAP-P0-04 migration atomicity, retry, and shared coordination', () => {
  it('preserves an in-place predecessor and exact cause when its canonical set fails, then retries', async () => {
    const task = makeTask('in-place-set-retry');
    const source = legacyVersionEnvelope([task]);
    const backend = new ControlledBackend();
    backend.seed(CURRENT_STORAGE_KEY, source);
    const failure = new Error('IN_PLACE_SET_FAILED');
    backend.failNext('set', CURRENT_STORAGE_KEY, failure);
    const storage = createManagedStorage(
      backend,
      makeDependencies().dependencies,
    );

    const failed = await captureOutcome(storage.getItem(CURRENT_STORAGE_KEY));
    expect(failed.status).toBe('rejected');
    expect(errorView(failed.status === 'rejected' ? failed.error : undefined)).toEqual({
      code: 'TASK_STORAGE_WRITE_FAILED',
      message: 'TASK_STORAGE_WRITE_FAILED',
      category: undefined,
      cause: failure,
    });
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(source);
    expect(backend.removeAttempts).toEqual([]);

    await expect(storage.getItem(CURRENT_STORAGE_KEY)).resolves.toBe(
      legacyRawArray([task]),
    );
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(currentEnvelope([task]));
    expect(backend.setAttempts).toHaveLength(2);
    expect(backend.setCommits).toHaveLength(1);
  });

  it('never removes the historical source when the new-key set fails and permits retry', async () => {
    const task = makeTask('historical-set-retry');
    const source = legacyRawArray([task]);
    const backend = new ControlledBackend();
    backend.seed(LEGACY_STORAGE_KEY, source);
    const failure = new Error('HISTORICAL_SET_FAILED');
    backend.failNext('set', CURRENT_STORAGE_KEY, failure);
    const storage = createManagedStorage(
      backend,
      makeDependencies().dependencies,
    );

    await expect(storage.getItem(CURRENT_STORAGE_KEY)).rejects.toMatchObject({
      code: 'TASK_STORAGE_WRITE_FAILED',
      cause: failure,
    });
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBeNull();
    expect(backend.raw(LEGACY_STORAGE_KEY)).toBe(source);
    expect(backend.removeAttempts).toEqual([]);

    await expect(storage.getItem(CURRENT_STORAGE_KEY)).resolves.toBe(source);
    expect(backend.raw(LEGACY_STORAGE_KEY)).toBeNull();
  });

  it('keeps both copies after cleanup failure and retries only the missing remove', async () => {
    const task = makeTask('cleanup-retry');
    const source = legacyRawArray([task]);
    const canonical = currentEnvelope([task]);
    const durable = new Map<string, string>([
      [LEGACY_STORAGE_KEY, source],
    ]);
    const backend = new ControlledBackend(durable);
    const failure = new Error('CLEANUP_REMOVE_FAILED');
    backend.failNext('remove', LEGACY_STORAGE_KEY, failure);
    const initialDependencies = makeDependencies();
    const storage = createManagedStorage(
      backend,
      initialDependencies.dependencies,
    );

    await expect(storage.getItem(CURRENT_STORAGE_KEY)).rejects.toMatchObject({
      code: 'TASK_STORAGE_REMOVE_FAILED',
      cause: failure,
    });
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(canonical);
    expect(backend.raw(LEGACY_STORAGE_KEY)).toBe(source);
    expect(backend.setCommits).toHaveLength(1);
    expect(initialDependencies.now).not.toHaveBeenCalled();
    expect(initialDependencies.idGenerator).not.toHaveBeenCalled();

    const restartBackend = new ControlledBackend(durable);
    const restartDependencies = makeFailIfCalledDependencies();
    let restarted: ReturnType<typeof createManagedStorage> | undefined;
    jest.isolateModules(() => {
      restarted = createManagedStorage(
        restartBackend,
        restartDependencies.dependencies,
      );
    });
    if (restarted === undefined) {
      throw new Error('P0_04_COLD_RESTART_STORAGE_REQUIRED');
    }

    await expect(restarted.getItem(CURRENT_STORAGE_KEY)).resolves.toBe(source);
    expect(restartBackend.getAttempts).toEqual([
      CURRENT_STORAGE_KEY,
      LEGACY_STORAGE_KEY,
    ]);
    expect(restartBackend.setAttempts).toEqual([]);
    expect(restartBackend.removeAttempts).toEqual([LEGACY_STORAGE_KEY]);
    expect(restartBackend.removeCommits).toEqual([LEGACY_STORAGE_KEY]);
    expect(restartBackend.raw(CURRENT_STORAGE_KEY)).toBe(canonical);
    expect(restartBackend.raw(LEGACY_STORAGE_KEY)).toBeNull();
    expect(restartDependencies.now).not.toHaveBeenCalled();
    expect(restartDependencies.idGenerator).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'V1 current envelope',
      currentRaw: currentEnvelope([makeTask('current-v1-history')]),
      legacyRaw: legacyRawArray([makeTask('legacy-v1-history')]),
    },
    {
      name: 'V0 current envelope',
      currentRaw: legacyVersionEnvelope([makeTask('current-v0-history')]),
      legacyRaw: legacyRawArray([makeTask('legacy-v0-history')]),
    },
    {
      name: 'default current envelope',
      currentRaw: defaultVersionEnvelope([makeTask('current-default-history')]),
      legacyRaw: legacyRawArray([makeTask('legacy-default-history')]),
    },
  ])(
    'rejects divergent legal $name and historical raw array without mutation',
    async ({currentRaw, legacyRaw}) => {
      const backend = new ControlledBackend(
        new Map([
          [CURRENT_STORAGE_KEY, currentRaw],
          [LEGACY_STORAGE_KEY, legacyRaw],
        ]),
      );
      const dependencies = makeDependencies();
      const storage = createManagedStorage(backend, dependencies.dependencies);

      await expect(storage.getItem(CURRENT_STORAGE_KEY)).rejects.toMatchObject({
        code: 'TASK_MIGRATION_CONFLICT',
        message: 'TASK_MIGRATION_CONFLICT',
      });
      expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(currentRaw);
      expect(backend.raw(LEGACY_STORAGE_KEY)).toBe(legacyRaw);
      expect(backend.getAttempts).toEqual([
        CURRENT_STORAGE_KEY,
        LEGACY_STORAGE_KEY,
      ]);
      expect(backend.setAttempts).toEqual([]);
      expect(backend.removeAttempts).toEqual([]);
      expect(dependencies.now).not.toHaveBeenCalled();
      expect(dependencies.idGenerator).not.toHaveBeenCalled();
    },
  );

  it('linearizes concurrent migration through two facades to one set and one remove', async () => {
    const task = makeTask('shared-migration');
    const source = legacyRawArray([task]);
    const backend = new ControlledBackend();
    backend.seed(LEGACY_STORAGE_KEY, source);
    const first = createManagedStorage(backend, makeDependencies().dependencies);
    const second = createManagedStorage(backend, makeDependencies().dependencies);
    const hold = backend.holdNext('set', CURRENT_STORAGE_KEY);

    const firstRead = captureOutcome(first.getItem(CURRENT_STORAGE_KEY));
    const secondRead = captureOutcome(second.getItem(CURRENT_STORAGE_KEY));
    const both = Promise.all([firstRead, secondRead]);
    const signal = await barrierSignal(hold.entered, both);
    expect(signal).toBe('entered');
    if (signal !== 'entered') {
      hold.release();
      return;
    }
    hold.release();

    await expect(both).resolves.toEqual([
      {status: 'fulfilled', value: source},
      {status: 'fulfilled', value: source},
    ]);
    expect(backend.setCommits).toEqual([
      {key: CURRENT_STORAGE_KEY, value: currentEnvelope([task])},
    ]);
    expect(backend.removeCommits).toEqual([LEGACY_STORAGE_KEY]);
    expect(backend.getAttempts).toEqual([
      CURRENT_STORAGE_KEY,
      LEGACY_STORAGE_KEY,
      CURRENT_STORAGE_KEY,
      LEGACY_STORAGE_KEY,
    ]);
  });

  it('linearizes migration before restore so the later operation observes an occupied target', async () => {
    const migratedTask = makeTask('migration-wins');
    const restoredTask = makeTask('restore-loses');
    const key = backupKey('migration-vs-restore');
    const backend = new ControlledBackend(
      new Map([
        [LEGACY_STORAGE_KEY, legacyRawArray([migratedTask])],
        [key, currentEnvelope([restoredTask])],
      ]),
    );
    const migrationFacade = createManagedStorage(
      backend,
      makeDependencies().dependencies,
    );
    const restoreFacade = createManagedStorage(
      backend,
      makeDependencies().dependencies,
    );
    const hold = backend.holdNext('set', CURRENT_STORAGE_KEY);

    const migration = captureOutcome(
      migrationFacade.getItem(CURRENT_STORAGE_KEY),
    );
    const signal = await barrierSignal(hold.entered, migration);
    expect(signal).toBe('entered');
    if (signal !== 'entered') {
      hold.release();
      return;
    }
    const restore = captureOutcome(
      Promise.resolve().then(() => restoreStorage(restoreFacade, key)),
    );
    hold.release();

    const [migrationOutcome, restoreOutcome] = await Promise.all([
      migration,
      restore,
    ]);
    expect(migrationOutcome).toEqual({
      status: 'fulfilled',
      value: legacyRawArray([migratedTask]),
    });
    expect(restoreOutcome.status).toBe('rejected');
    expect(
      errorView(
        restoreOutcome.status === 'rejected' ? restoreOutcome.error : undefined,
      ),
    ).toMatchObject({
      code: 'TASK_RECOVERY_TARGET_OCCUPIED',
      message: 'TASK_RECOVERY_TARGET_OCCUPIED',
    });
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(currentEnvelope([migratedTask]));
    expect(backend.raw(key)).toBe(currentEnvelope([restoredTask]));
  });

  it('does not poison the shared operation queue after a failed mutation', async () => {
    const task = makeTask('queue-retry');
    const source = legacyRawArray([task]);
    const backend = new ControlledBackend(
      new Map([[LEGACY_STORAGE_KEY, source]]),
    );
    const failure = new Error('FIRST_QUEUE_WRITE_FAILED');
    backend.failNext('set', CURRENT_STORAGE_KEY, failure);
    const first = createManagedStorage(backend, makeDependencies().dependencies);
    const second = createManagedStorage(backend, makeDependencies().dependencies);

    await expect(first.getItem(CURRENT_STORAGE_KEY)).rejects.toMatchObject({
      code: 'TASK_STORAGE_WRITE_FAILED',
      cause: failure,
    });
    await expect(second.getItem(CURRENT_STORAGE_KEY)).resolves.toBe(source);
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(currentEnvelope([task]));
    expect(backend.raw(LEGACY_STORAGE_KEY)).toBeNull();
  });

  it('retains backend read failure identity and performs no mutation', async () => {
    const source = legacyVersionEnvelope([makeTask('read-cause')]);
    const backend = new ControlledBackend(
      new Map([[CURRENT_STORAGE_KEY, source]]),
    );
    const failure = new Error('BACKEND_GET_FAILED');
    backend.failNext('get', CURRENT_STORAGE_KEY, failure);
    const storage = createManagedStorage(
      backend,
      makeDependencies().dependencies,
    );

    const outcome = await captureOutcome(storage.getItem(CURRENT_STORAGE_KEY));
    expect(outcome.status).toBe('rejected');
    expect(errorView(outcome.status === 'rejected' ? outcome.error : undefined)).toEqual({
      code: 'TASK_STORAGE_READ_FAILED',
      message: 'TASK_STORAGE_READ_FAILED',
      category: undefined,
      cause: failure,
    });
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(source);
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeAttempts).toEqual([]);
  });

});
