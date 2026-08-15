import {
  ControlledBackend,
  CURRENT_STORAGE_KEY,
  backupKey,
  createManagedStorage,
  currentEnvelope,
  expectFocusSentinelUntouched,
  inspectStorage,
  makeDependencies,
  makeTask,
  quarantineStorage,
  recoverStorage,
  restoreStorage,
  seedFocusSentinel,
} from './taskDataRecoveryTestKit';

describe('GAP-P0-04 FocusSession storage isolation', () => {
  it('inspect never reads, writes, or removes the FocusSession sentinel', async () => {
    const backend = new ControlledBackend();
    seedFocusSentinel(backend);
    backend.seed(CURRENT_STORAGE_KEY, currentEnvelope([makeTask('inspect-focus')]));
    const storage = createManagedStorage(
      backend,
      makeDependencies().dependencies,
    );

    await expect(inspectStorage(storage)).resolves.toMatchObject({
      state: 'current',
      taskCount: 1,
    });
    expectFocusSentinelUntouched(backend);
  });

  it('quarantine never reads, writes, or removes the FocusSession sentinel', async () => {
    const backend = new ControlledBackend();
    seedFocusSentinel(backend);
    backend.seed(CURRENT_STORAGE_KEY, '{quarantine focus isolation');
    const storage = createManagedStorage(
      backend,
      makeDependencies().dependencies,
    );

    await expect(quarantineStorage(storage)).resolves.toMatchObject({
      state: 'quarantined',
    });
    expectFocusSentinelUntouched(backend);
  });

  it('recover never reads, writes, or removes the FocusSession sentinel', async () => {
    const key = backupKey('recover-focus');
    const backend = new ControlledBackend(new Map([[key, 'backup proof']]));
    seedFocusSentinel(backend);
    const storage = createManagedStorage(
      backend,
      makeDependencies().dependencies,
    );

    await expect(
      recoverStorage(storage, key, [makeTask('recover-focus')]),
    ).resolves.toMatchObject({state: 'recovered'});
    expectFocusSentinelUntouched(backend);
  });

  it('restore never reads, writes, or removes the FocusSession sentinel', async () => {
    const key = backupKey('restore-focus');
    const backend = new ControlledBackend(
      new Map([[key, currentEnvelope([makeTask('restore-focus')])]]),
    );
    seedFocusSentinel(backend);
    const storage = createManagedStorage(
      backend,
      makeDependencies().dependencies,
    );

    await expect(restoreStorage(storage, key)).resolves.toMatchObject({
      state: 'restored',
    });
    expectFocusSentinelUntouched(backend);
  });
});
