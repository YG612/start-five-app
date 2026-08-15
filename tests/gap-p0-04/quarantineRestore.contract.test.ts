import {
  ControlledBackend,
  CURRENT_STORAGE_KEY,
  FIXED_BACKUP_ID,
  FIXED_NOW,
  LEGACY_STORAGE_KEY,
  PENDING_RECOVERY_KEY,
  afterMicrotasks,
  backupKey,
  captureOutcome,
  createManagedStorage,
  currentEnvelope,
  defaultVersionEnvelope,
  errorView,
  inspectStorage,
  legacyRawArray,
  legacyVersionEnvelope,
  makeDependencies,
  makeExactContainerCandidate,
  makeFailIfCalledDependencies,
  makeTask,
  makeTasksWithSubtaskCount,
  pendingRecord,
  publicErrorText,
  quarantineStorage,
  recoverStorage,
  restoreStorage,
  type PendingRecoveryRecord,
} from './taskDataRecoveryTestKit';

const invalidBackupRootCases: readonly {
  name: string;
  raw: string;
  secret?: string;
}[] = [
  {name: 'null root', raw: 'null'},
  {
    name: 'string primitive root',
    raw: JSON.stringify('SECRET_RESTORE_STRING_ROOT'),
    secret: 'SECRET_RESTORE_STRING_ROOT',
  },
  {name: 'number primitive root', raw: '42'},
  {name: 'boolean primitive root', raw: 'true'},
  {
    name: 'raw array containing a non-Task primitive',
    raw: JSON.stringify(['SECRET_RESTORE_ARRAY_MEMBER']),
    secret: 'SECRET_RESTORE_ARRAY_MEMBER',
  },
  {name: 'empty object root', raw: '{}'},
  {
    name: 'otherwise shaped envelope missing tasks',
    raw: JSON.stringify({schema: 'start-five.tasks', version: 1}),
  },
];

function mutationOrder(backend: ControlledBackend): string[] {
  return backend.events
    .filter(event => event.phase === 'commit' && event.operation !== 'get')
    .map(event => `${event.operation}:${event.key}`);
}

async function waitForBarrier(
  entered: Promise<void>,
  operation: Promise<unknown>,
): Promise<'entered' | 'settled' | 'budget'> {
  return Promise.race([
    entered.then(() => 'entered' as const),
    operation.then(() => 'settled' as const),
    afterMicrotasks(256).then(() => 'budget' as const),
  ]);
}

const pendingFieldNames: readonly (keyof PendingRecoveryRecord)[] = [
  'schema',
  'version',
  'operation',
  'sourceKey',
  'backupKey',
  'category',
  'createdAt',
];

const pendingWrongTypes: readonly {
  field: keyof PendingRecoveryRecord;
  value: unknown;
}[] = [
  {field: 'schema', value: 7},
  {field: 'version', value: '1'},
  {field: 'operation', value: false},
  {field: 'sourceKey', value: []},
  {field: 'backupKey', value: {}},
  {field: 'category', value: 1},
  {field: 'createdAt', value: null},
];

function pendingWithout(
  field: keyof PendingRecoveryRecord,
): Record<string, unknown> {
  const value: Record<string, unknown> = {
    ...pendingRecord(CURRENT_STORAGE_KEY),
  };
  Reflect.deleteProperty(value, field);
  return value;
}

function pendingWithWrongType(
  field: keyof PendingRecoveryRecord,
  value: unknown,
): Record<string, unknown> {
  return {
    ...pendingRecord(CURRENT_STORAGE_KEY),
    [field]: value,
  };
}

describe('GAP-P0-04 crash-restart quarantine protocol', () => {
  it('persists pending metadata, copies exact bytes, removes source, and clears pending in order', async () => {
    const source = '{"secret":"QUARANTINE_EXACT_BYTES"';
    const key = backupKey();
    const backend = new ControlledBackend(
      new Map([[CURRENT_STORAGE_KEY, source]]),
    );
    const dependencies = makeDependencies();
    const storage = createManagedStorage(backend, dependencies.dependencies);

    const receipt = await quarantineStorage(storage);

    expect(receipt).toEqual({
      state: 'quarantined',
      backupKey: key,
      category: 'MALFORMED_JSON',
      createdAt: FIXED_NOW,
    });
    expect(dependencies.now).toHaveBeenCalledTimes(1);
    expect(dependencies.idGenerator).toHaveBeenCalledTimes(1);
    expect(backend.raw(key)).toBe(source);
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBeNull();
    expect(backend.raw(PENDING_RECOVERY_KEY)).toBeNull();
    expect(mutationOrder(backend)).toEqual([
      `set:${PENDING_RECOVERY_KEY}`,
      `set:${key}`,
      `remove:${CURRENT_STORAGE_KEY}`,
      `remove:${PENDING_RECOVERY_KEY}`,
    ]);
    expect(backend.setCommits[0]).toEqual({
      key: PENDING_RECOVERY_KEY,
      value: JSON.stringify(
        pendingRecord(CURRENT_STORAGE_KEY, key, 'MALFORMED_JSON'),
      ),
    });
  });

  it('does not rewrite an equal pre-existing generated backup and remains complete after restart', async () => {
    const source = '{equal pre-existing quarantine backup bytes';
    const key = backupKey();
    const durable = new Map<string, string>([
      [CURRENT_STORAGE_KEY, source],
      [key, source],
    ]);
    const backend = new ControlledBackend(durable);
    const dependencies = makeDependencies();
    const storage = createManagedStorage(backend, dependencies.dependencies);

    await expect(quarantineStorage(storage)).resolves.toEqual({
      state: 'quarantined',
      backupKey: key,
      category: 'MALFORMED_JSON',
      createdAt: FIXED_NOW,
    });

    expect(dependencies.now).toHaveBeenCalledTimes(1);
    expect(dependencies.idGenerator).toHaveBeenCalledTimes(1);
    expect(backend.setAttempts).toEqual([
      {
        key: PENDING_RECOVERY_KEY,
        value: JSON.stringify(pendingRecord(CURRENT_STORAGE_KEY)),
      },
    ]);
    expect(backend.setCommits).toEqual(backend.setAttempts);
    expect(mutationOrder(backend)).toEqual([
      `set:${PENDING_RECOVERY_KEY}`,
      `remove:${CURRENT_STORAGE_KEY}`,
      `remove:${PENDING_RECOVERY_KEY}`,
    ]);
    expect(backend.raw(key)).toBe(source);
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBeNull();
    expect(backend.raw(PENDING_RECOVERY_KEY)).toBeNull();

    const restartBackend = new ControlledBackend(durable);
    const restartDependencies = makeFailIfCalledDependencies();
    const restarted = createManagedStorage(
      restartBackend,
      restartDependencies.dependencies,
    );
    await expect(quarantineStorage(restarted)).rejects.toMatchObject({
      code: 'TASK_RECOVERY_NOT_REQUIRED',
      message: 'TASK_RECOVERY_NOT_REQUIRED',
    });
    expect(restartDependencies.now).not.toHaveBeenCalled();
    expect(restartDependencies.idGenerator).not.toHaveBeenCalled();
    expect(restartBackend.raw(key)).toBe(source);
    expect(restartBackend.setAttempts).toEqual([]);
    expect(restartBackend.removeAttempts).toEqual([]);
  });

  it.each([
    {
      name: 'wrong root',
      raw: JSON.stringify([]),
      category: 'WRONG_ROOT',
      id: 'category-wrong-root',
    },
    {
      name: 'foreign schema',
      raw: JSON.stringify({schema: 'foreign.tasks', version: 1, tasks: []}),
      category: 'UNSUPPORTED_SCHEMA',
      id: 'category-foreign-schema',
    },
    {
      name: 'unsupported version',
      raw: JSON.stringify({schema: 'start-five.tasks', version: 2, tasks: []}),
      category: 'UNSUPPORTED_VERSION',
      id: 'category-version',
    },
    {
      name: 'invalid Task snapshot',
      raw: JSON.stringify({
        schema: 'start-five.tasks',
        version: 1,
        tasks: [{id: 'invalid-quarantine-task', title: 42}],
      }),
      category: 'INVALID_SNAPSHOT',
      id: 'category-invalid-snapshot',
    },
  ])('quarantines $name with its stable category and exact source bytes', async ({raw, category, id}) => {
    const key = backupKey(id);
    const backend = new ControlledBackend(
      new Map([[CURRENT_STORAGE_KEY, raw]]),
    );
    const dependencies = makeDependencies(FIXED_NOW, id);
    const storage = createManagedStorage(backend, dependencies.dependencies);

    await expect(quarantineStorage(storage)).resolves.toEqual({
      state: 'quarantined',
      backupKey: key,
      category,
      createdAt: FIXED_NOW,
    });
    expect(backend.raw(key)).toBe(raw);
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBeNull();
    expect(backend.raw(PENDING_RECOVERY_KEY)).toBeNull();
    expect(dependencies.now).toHaveBeenCalledTimes(1);
    expect(dependencies.idGenerator).toHaveBeenCalledTimes(1);
  });

  it('retains pending and source after backup-set failure, then restart reuses identity without generators', async () => {
    const source = '{bad current bytes';
    const key = backupKey();
    const durable = new Map<string, string>([[CURRENT_STORAGE_KEY, source]]);
    const firstBackend = new ControlledBackend(durable);
    const failure = new Error('QUARANTINE_BACKUP_SET_FAILED');
    firstBackend.failNext('set', key, failure);
    const firstDependencies = makeDependencies();
    const first = createManagedStorage(
      firstBackend,
      firstDependencies.dependencies,
    );

    await expect(quarantineStorage(first)).rejects.toMatchObject({
      code: 'TASK_STORAGE_WRITE_FAILED',
      message: 'TASK_STORAGE_WRITE_FAILED',
      cause: failure,
    });
    expect(durable.get(PENDING_RECOVERY_KEY)).toBe(
      JSON.stringify(pendingRecord(CURRENT_STORAGE_KEY)),
    );
    expect(durable.get(CURRENT_STORAGE_KEY)).toBe(source);
    expect(durable.has(key)).toBe(false);

    const restartBackend = new ControlledBackend(durable);
    const restartDependencies = makeFailIfCalledDependencies();
    const restarted = createManagedStorage(
      restartBackend,
      restartDependencies.dependencies,
    );
    await expect(quarantineStorage(restarted)).resolves.toEqual({
      state: 'quarantined',
      backupKey: key,
      category: 'MALFORMED_JSON',
      createdAt: FIXED_NOW,
    });
    expect(restartDependencies.now).not.toHaveBeenCalled();
    expect(restartDependencies.idGenerator).not.toHaveBeenCalled();
    expect(durable.get(key)).toBe(source);
    expect(durable.has(CURRENT_STORAGE_KEY)).toBe(false);
    expect(durable.has(PENDING_RECOVERY_KEY)).toBe(false);
  });

  it('preserves source and exact cause if the initial pending-record commit fails', async () => {
    const source = '{pending commit failure';
    const backend = new ControlledBackend(
      new Map([[CURRENT_STORAGE_KEY, source]]),
    );
    const failure = new Error('PENDING_RECORD_SET_FAILED');
    backend.failNext('set', PENDING_RECOVERY_KEY, failure);
    const dependencies = makeDependencies();
    const storage = createManagedStorage(backend, dependencies.dependencies);

    await expect(quarantineStorage(storage)).rejects.toMatchObject({
      code: 'TASK_STORAGE_WRITE_FAILED',
      message: 'TASK_STORAGE_WRITE_FAILED',
      cause: failure,
    });
    expect(dependencies.now).toHaveBeenCalledTimes(1);
    expect(dependencies.idGenerator).toHaveBeenCalledTimes(1);
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(source);
    expect(backend.raw(PENDING_RECOVERY_KEY)).toBeNull();
    expect(backend.raw(backupKey())).toBeNull();
    expect(backend.setCommits).toEqual([]);
    expect(backend.removeAttempts).toEqual([]);
  });

  it('retains pending plus both copies after source-remove failure and restart does not rewrite backup', async () => {
    const source = '{remove retry bytes';
    const key = backupKey();
    const durable = new Map<string, string>([[CURRENT_STORAGE_KEY, source]]);
    const firstBackend = new ControlledBackend(durable);
    const failure = new Error('QUARANTINE_SOURCE_REMOVE_FAILED');
    firstBackend.failNext('remove', CURRENT_STORAGE_KEY, failure);
    const first = createManagedStorage(
      firstBackend,
      makeDependencies().dependencies,
    );

    await expect(quarantineStorage(first)).rejects.toMatchObject({
      code: 'TASK_STORAGE_REMOVE_FAILED',
      cause: failure,
    });
    expect(durable.get(PENDING_RECOVERY_KEY)).toBe(
      JSON.stringify(pendingRecord(CURRENT_STORAGE_KEY)),
    );
    expect(durable.get(key)).toBe(source);
    expect(durable.get(CURRENT_STORAGE_KEY)).toBe(source);

    const restartBackend = new ControlledBackend(durable);
    const restartDependencies = makeFailIfCalledDependencies();
    const restarted = createManagedStorage(
      restartBackend,
      restartDependencies.dependencies,
    );
    await expect(quarantineStorage(restarted)).resolves.toMatchObject({
      state: 'quarantined',
      backupKey: key,
    });
    expect(restartBackend.setAttempts).toEqual([]);
    expect(restartBackend.removeCommits).toEqual([
      CURRENT_STORAGE_KEY,
      PENDING_RECOVERY_KEY,
    ]);
    expect(restartDependencies.now).not.toHaveBeenCalled();
    expect(restartDependencies.idGenerator).not.toHaveBeenCalled();
  });

  it('retains pending after final cleanup failure and restart only clears pending', async () => {
    const source = '{cleanup retry bytes';
    const key = backupKey();
    const durable = new Map<string, string>([[CURRENT_STORAGE_KEY, source]]);
    const firstBackend = new ControlledBackend(durable);
    const failure = new Error('PENDING_CLEANUP_FAILED');
    firstBackend.failNext('remove', PENDING_RECOVERY_KEY, failure);
    const first = createManagedStorage(
      firstBackend,
      makeDependencies().dependencies,
    );

    await expect(quarantineStorage(first)).rejects.toMatchObject({
      code: 'TASK_STORAGE_REMOVE_FAILED',
      cause: failure,
    });
    expect(durable.has(CURRENT_STORAGE_KEY)).toBe(false);
    expect(durable.get(key)).toBe(source);
    expect(durable.get(PENDING_RECOVERY_KEY)).toBe(
      JSON.stringify(pendingRecord(CURRENT_STORAGE_KEY)),
    );

    const restartBackend = new ControlledBackend(durable);
    const restartDependencies = makeFailIfCalledDependencies();
    const restarted = createManagedStorage(
      restartBackend,
      restartDependencies.dependencies,
    );
    await expect(quarantineStorage(restarted)).resolves.toMatchObject({
      state: 'quarantined',
      backupKey: key,
    });
    expect(restartBackend.setAttempts).toEqual([]);
    expect(restartBackend.removeCommits).toEqual([PENDING_RECOVERY_KEY]);
    expect(restartDependencies.now).not.toHaveBeenCalled();
    expect(restartDependencies.idGenerator).not.toHaveBeenCalled();
  });

  it('reuses a historical-key pending record across restart', async () => {
    const source = '[{"secret":"historical invalid task"}]';
    const key = backupKey();
    const durable = new Map<string, string>([[LEGACY_STORAGE_KEY, source]]);
    const firstBackend = new ControlledBackend(durable);
    firstBackend.failNext(
      'remove',
      LEGACY_STORAGE_KEY,
      new Error('HISTORICAL_REMOVE_FAILED'),
    );
    const first = createManagedStorage(
      firstBackend,
      makeDependencies().dependencies,
    );
    await expect(quarantineStorage(first)).rejects.toMatchObject({
      code: 'TASK_STORAGE_REMOVE_FAILED',
    });
    expect(durable.get(PENDING_RECOVERY_KEY)).toBe(
      JSON.stringify(
        pendingRecord(LEGACY_STORAGE_KEY, key, 'INVALID_SNAPSHOT'),
      ),
    );

    const restartBackend = new ControlledBackend(durable);
    const restartDependencies = makeFailIfCalledDependencies();
    await expect(
      quarantineStorage(
        createManagedStorage(
          restartBackend,
          restartDependencies.dependencies,
        ),
      ),
    ).resolves.toMatchObject({backupKey: key, category: 'INVALID_SNAPSHOT'});
    expect(restartBackend.setAttempts).toEqual([]);
    expect(durable.has(LEGACY_STORAGE_KEY)).toBe(false);
    expect(durable.get(key)).toBe(source);
    expect(durable.has(PENDING_RECOVERY_KEY)).toBe(false);
  });

  it('retains pending and exact cause if the generated backup read fails, then performs no destructive mutation', async () => {
    const source = '{backup read failure';
    const key = backupKey();
    const backend = new ControlledBackend(
      new Map([[CURRENT_STORAGE_KEY, source]]),
    );
    const failure = new Error('QUARANTINE_BACKUP_READ_FAILED');
    backend.failNext('get', key, failure);
    const storage = createManagedStorage(
      backend,
      makeDependencies().dependencies,
    );

    await expect(quarantineStorage(storage)).rejects.toMatchObject({
      code: 'TASK_STORAGE_READ_FAILED',
      message: 'TASK_STORAGE_READ_FAILED',
      cause: failure,
    });
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(source);
    expect(backend.raw(PENDING_RECOVERY_KEY)).toBe(
      JSON.stringify(pendingRecord(CURRENT_STORAGE_KEY)),
    );
    expect(backend.raw(key)).toBeNull();
    expect(backend.setCommits).toEqual([
      {
        key: PENDING_RECOVERY_KEY,
        value: JSON.stringify(pendingRecord(CURRENT_STORAGE_KEY)),
      },
    ]);
    expect(backend.removeAttempts).toEqual([]);
  });

  const invalidPendingCases: readonly {
    name: string;
    raw: string;
    secret?: string;
  }[] = [
    {
      name: 'malformed JSON',
      raw: '{"secret":"SECRET_PENDING_MALFORMED"',
      secret: 'SECRET_PENDING_MALFORMED',
    },
    {
      name: 'foreign schema',
      raw: JSON.stringify({
        schema: 'SECRET_PENDING_FOREIGN',
        version: 1,
        operation: 'quarantine',
        sourceKey: CURRENT_STORAGE_KEY,
        backupKey: backupKey(),
        category: 'MALFORMED_JSON',
        createdAt: FIXED_NOW,
      }),
      secret: 'SECRET_PENDING_FOREIGN',
    },
    {
      name: 'non-task source key',
      raw: JSON.stringify({
        ...pendingRecord(CURRENT_STORAGE_KEY),
        sourceKey: 'start-five.focus-sessions.SECRET_PENDING_SOURCE',
      }),
      secret: 'SECRET_PENDING_SOURCE',
    },
    {
      name: 'invalid backup suffix',
      raw: JSON.stringify({
        ...pendingRecord(CURRENT_STORAGE_KEY),
        backupKey:
          'start-five.tasks.quarantine.SECRET_PENDING_SUFFIX\nkey',
      }),
      secret: 'SECRET_PENDING_SUFFIX',
    },
    {
      name: 'noncanonical createdAt',
      raw: JSON.stringify({
        ...pendingRecord(CURRENT_STORAGE_KEY),
        createdAt: '2026-08-05T16:00:00+08:00',
      }),
      secret: '16:00:00+08:00',
    },
    {
      name: 'extra metadata key',
      raw: JSON.stringify({
        ...pendingRecord(CURRENT_STORAGE_KEY),
        extra: 'SECRET_PENDING_EXTRA',
      }),
      secret: 'SECRET_PENDING_EXTRA',
    },
    {
      name: 'unsupported version value',
      raw: JSON.stringify({
        ...pendingRecord(CURRENT_STORAGE_KEY),
        version: 2,
      }),
    },
    {
      name: 'unsupported operation value',
      raw: JSON.stringify({
        ...pendingRecord(CURRENT_STORAGE_KEY),
        operation: 'SECRET_PENDING_OPERATION',
      }),
      secret: 'SECRET_PENDING_OPERATION',
    },
    {
      name: 'unsupported category value',
      raw: JSON.stringify({
        ...pendingRecord(CURRENT_STORAGE_KEY),
        category: 'SECRET_PENDING_CATEGORY',
      }),
      secret: 'SECRET_PENDING_CATEGORY',
    },
    ...pendingFieldNames.map(field => ({
      name: `missing ${field}`,
      raw: JSON.stringify(pendingWithout(field)),
    })),
    ...pendingWrongTypes.map(({field, value}) => ({
      name: `${field} with wrong runtime type`,
      raw: JSON.stringify(pendingWithWrongType(field, value)),
    })),
  ];

  it.each(invalidPendingCases)(
    'fails closed on $name in fixed pending metadata without generators or mutation',
    async ({raw, secret}) => {
      const source = '{source remains SECRET_PENDING_SOURCE_BYTES';
      const backend = new ControlledBackend(
        new Map([
          [CURRENT_STORAGE_KEY, source],
          [PENDING_RECOVERY_KEY, raw],
        ]),
      );
      const dependencies = makeDependencies();
      const storage = createManagedStorage(backend, dependencies.dependencies);

      const outcome = await captureOutcome(
        Promise.resolve().then(() => quarantineStorage(storage)),
      );
      expect(outcome.status).toBe('rejected');
      const error = outcome.status === 'rejected' ? outcome.error : undefined;
      expect(errorView(error)).toEqual({
        code: 'TASK_RECOVERY_PENDING_INVALID',
        message: 'TASK_RECOVERY_PENDING_INVALID',
        category: undefined,
        cause: undefined,
      });
      expect(publicErrorText(error)).not.toContain(
        'SECRET_PENDING_SOURCE_BYTES',
      );
      if (secret !== undefined) {
        expect(publicErrorText(error)).not.toContain(secret);
      }
      expect(dependencies.now).not.toHaveBeenCalled();
      expect(dependencies.idGenerator).not.toHaveBeenCalled();
      expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(source);
      expect(backend.raw(PENDING_RECOVERY_KEY)).toBe(raw);
      expect(backend.setAttempts).toEqual([]);
      expect(backend.removeAttempts).toEqual([]);
    },
  );

  it('rejects a conflicting existing backup and preserves source, backup, and pending', async () => {
    const source = '{source bytes';
    const key = backupKey();
    const conflicting = 'different backup bytes';
    const backend = new ControlledBackend(
      new Map([
        [CURRENT_STORAGE_KEY, source],
        [key, conflicting],
      ]),
    );
    const storage = createManagedStorage(
      backend,
      makeDependencies().dependencies,
    );

    await expect(quarantineStorage(storage)).rejects.toMatchObject({
      code: 'TASK_RECOVERY_BACKUP_CONFLICT',
      message: 'TASK_RECOVERY_BACKUP_CONFLICT',
    });
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(source);
    expect(backend.raw(key)).toBe(conflicting);
    expect(backend.raw(PENDING_RECOVERY_KEY)).toBe(
      JSON.stringify(pendingRecord(CURRENT_STORAGE_KEY)),
    );
    expect(backend.removeAttempts).toEqual([]);
  });

  it('rejects a noncanonical but parseable clock before ID generation or storage mutation', async () => {
    const backend = new ControlledBackend(
      new Map([[CURRENT_STORAGE_KEY, '{clock invalid']]),
    );
    const dependencies = makeDependencies('2026-08-05T16:00:00+08:00');
    const storage = createManagedStorage(backend, dependencies.dependencies);

    await expect(quarantineStorage(storage)).rejects.toMatchObject({
      code: 'TASK_RECOVERY_CLOCK_INVALID',
      message: 'TASK_RECOVERY_CLOCK_INVALID',
    });
    expect(dependencies.now).toHaveBeenCalledTimes(1);
    expect(dependencies.idGenerator).not.toHaveBeenCalled();
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeAttempts).toEqual([]);
  });

  it.each(['', '   ', 'bad\nidentifier', 'bad\u0000identifier'])(
    'rejects generated ID %p containing no valid suffix before storage mutation',
    async invalidId => {
      const backend = new ControlledBackend(
        new Map([[CURRENT_STORAGE_KEY, '{id invalid']]),
      );
      const dependencies = makeDependencies(FIXED_NOW, invalidId);
      const storage = createManagedStorage(backend, dependencies.dependencies);

      await expect(quarantineStorage(storage)).rejects.toMatchObject({
        code: 'TASK_RECOVERY_ID_INVALID',
        message: 'TASK_RECOVERY_ID_INVALID',
      });
      expect(dependencies.now).toHaveBeenCalledTimes(1);
      expect(dependencies.idGenerator).toHaveBeenCalledTimes(1);
      expect(backend.setAttempts).toEqual([]);
      expect(backend.removeAttempts).toEqual([]);
    },
  );

  const notRequiredCases: readonly {
    name: string;
    entries: readonly (readonly [string, string])[];
  }[] = [
    {name: 'empty', entries: []},
    {
      name: 'healthy current',
      entries: [[CURRENT_STORAGE_KEY, currentEnvelope([makeTask('healthy')])]],
    },
    {
      name: 'legal predecessor',
      entries: [[CURRENT_STORAGE_KEY, legacyVersionEnvelope([makeTask('legacy')])]],
    },
  ];

  it.each(notRequiredCases)('rejects $name state as not requiring quarantine without generators', async ({entries}) => {
    const backend = new ControlledBackend(new Map(entries));
    const dependencies = makeDependencies();
    const storage = createManagedStorage(backend, dependencies.dependencies);

    await expect(quarantineStorage(storage)).rejects.toMatchObject({
      code: 'TASK_RECOVERY_NOT_REQUIRED',
      message: 'TASK_RECOVERY_NOT_REQUIRED',
    });
    expect(dependencies.now).not.toHaveBeenCalled();
    expect(dependencies.idGenerator).not.toHaveBeenCalled();
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeAttempts).toEqual([]);
  });

  it('rejects divergent current/historical history without generating recovery identity', async () => {
    const currentRaw = currentEnvelope([makeTask('conflict-current')]);
    const legacyRaw = legacyRawArray([makeTask('conflict-legacy')]);
    const backend = new ControlledBackend(
      new Map([
        [CURRENT_STORAGE_KEY, currentRaw],
        [LEGACY_STORAGE_KEY, legacyRaw],
      ]),
    );
    const dependencies = makeDependencies();
    const storage = createManagedStorage(backend, dependencies.dependencies);

    await expect(quarantineStorage(storage)).rejects.toMatchObject({
      code: 'TASK_MIGRATION_CONFLICT',
      message: 'TASK_MIGRATION_CONFLICT',
    });
    expect(dependencies.now).not.toHaveBeenCalled();
    expect(dependencies.idGenerator).not.toHaveBeenCalled();
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeAttempts).toEqual([]);
  });
});

describe('GAP-P0-04 validated restore', () => {
  it.each([
    'not-a-quarantine-key',
    'start-five.tasks.quarantine.',
    'start-five.tasks.quarantine.   ',
    'start-five.tasks.quarantine.bad\nkey',
  ])('rejects invalid backup key %p before backend I/O', async invalidKey => {
    const backend = new ControlledBackend();
    const dependencies = makeDependencies();
    const storage = createManagedStorage(backend, dependencies.dependencies);

    const outcome = await captureOutcome(
      Promise.resolve().then(() => restoreStorage(storage, invalidKey)),
    );
    expect(outcome.status).toBe('rejected');
    expect(
      errorView(outcome.status === 'rejected' ? outcome.error : undefined),
    ).toMatchObject({
      code: 'TASK_RECOVERY_BACKUP_KEY_INVALID',
      message: 'TASK_RECOVERY_BACKUP_KEY_INVALID',
    });
    expect(backend.events).toEqual([]);
    expect(dependencies.now).not.toHaveBeenCalled();
    expect(dependencies.idGenerator).not.toHaveBeenCalled();
  });

  it.each(invalidBackupRootCases)(
    'rejects $name instead of restoring a default empty snapshot',
    async ({raw, secret}) => {
      const key = backupKey('invalid-root-backup');
      const backend = new ControlledBackend(new Map([[key, raw]]));
      const dependencies = makeDependencies();
      const storage = createManagedStorage(backend, dependencies.dependencies);

      const outcome = await captureOutcome(
        Promise.resolve().then(() => restoreStorage(storage, key)),
      );

      expect(outcome.status).toBe('rejected');
      const error =
        outcome.status === 'rejected' ? outcome.error : undefined;
      expect(errorView(error)).toEqual({
        code: 'TASK_RECOVERY_BACKUP_INVALID',
        message: 'TASK_RECOVERY_BACKUP_INVALID',
        category: undefined,
        cause: undefined,
      });
      if (secret !== undefined) {
        expect(publicErrorText(error)).not.toContain(secret);
        expect(String(error)).not.toContain(secret);
      }
      expect(backend.getAttempts).toEqual([key]);
      expect(backend.raw(key)).toBe(raw);
      expect(backend.raw(CURRENT_STORAGE_KEY)).toBeNull();
      expect(backend.setAttempts).toEqual([]);
      expect(backend.removeAttempts).toEqual([]);
      expect(dependencies.now).toHaveBeenCalledTimes(0);
      expect(dependencies.idGenerator).toHaveBeenCalledTimes(0);
    },
  );

  it('restores a legal raw empty Task-array backup once and then treats its canonical empty target as occupied', async () => {
    const key = backupKey('restore-empty-array');
    const originalBackup = '[]';
    const canonicalEmpty = currentEnvelope([]);
    const backend = new ControlledBackend(
      new Map([[key, originalBackup]]),
    );
    const dependencies = makeDependencies();
    const storage = createManagedStorage(backend, dependencies.dependencies);

    expect(backend.raw(CURRENT_STORAGE_KEY)).toBeNull();
    const receipt = await restoreStorage(storage, key);

    expect(receipt).toEqual({
      state: 'restored',
      backupKey: key,
      version: 1,
      taskCount: 0,
    });
    expect(Object.keys(receipt).sort()).toEqual([
      'backupKey',
      'state',
      'taskCount',
      'version',
    ]);
    expect(backend.getAttempts).toEqual([key, CURRENT_STORAGE_KEY]);
    expect(backend.callsFor(LEGACY_STORAGE_KEY)).toEqual([]);
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(canonicalEmpty);
    expect(backend.raw(key)).toBe(originalBackup);
    expect(backend.setAttempts).toEqual([
      {key: CURRENT_STORAGE_KEY, value: canonicalEmpty},
    ]);
    expect(backend.setCommits).toEqual(backend.setAttempts);
    expect(backend.removeAttempts).toEqual([]);
    expect(dependencies.now).toHaveBeenCalledTimes(0);
    expect(dependencies.idGenerator).toHaveBeenCalledTimes(0);

    const eventsBeforeReceiptMutation = backend.events.length;
    for (const field of Object.keys(receipt)) {
      expect(Reflect.set(receipt, field, `MUTATED_${field}`)).toBe(true);
    }
    expect(backend.events).toHaveLength(eventsBeforeReceiptMutation);
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(canonicalEmpty);
    expect(backend.raw(key)).toBe(originalBackup);

    const readOffset = backend.getAttempts.length;
    const repeated = await captureOutcome(
      Promise.resolve().then(() => restoreStorage(storage, key)),
    );
    expect(repeated.status).toBe('rejected');
    expect(
      errorView(
        repeated.status === 'rejected' ? repeated.error : undefined,
      ),
    ).toEqual({
      code: 'TASK_RECOVERY_TARGET_OCCUPIED',
      message: 'TASK_RECOVERY_TARGET_OCCUPIED',
      category: undefined,
      cause: undefined,
    });
    expect(backend.getAttempts.slice(readOffset)).toEqual([
      key,
      CURRENT_STORAGE_KEY,
    ]);
    expect(backend.callsFor(LEGACY_STORAGE_KEY)).toEqual([]);
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(canonicalEmpty);
    expect(backend.raw(key)).toBe(originalBackup);
    expect(backend.setAttempts).toEqual([
      {key: CURRENT_STORAGE_KEY, value: canonicalEmpty},
    ]);
    expect(backend.setCommits).toEqual(backend.setAttempts);
    expect(backend.removeAttempts).toEqual([]);
    expect(dependencies.now).toHaveBeenCalledTimes(0);
    expect(dependencies.idGenerator).toHaveBeenCalledTimes(0);
  });

  it.each([
    {
      name: 'current envelope',
      raw(task: ReturnType<typeof makeTask>): string {
        return currentEnvelope([task]);
      },
    },
    {
      name: 'V0 envelope',
      raw(task: ReturnType<typeof makeTask>): string {
        return legacyVersionEnvelope([task]);
      },
    },
    {
      name: 'default envelope',
      raw(task: ReturnType<typeof makeTask>): string {
        return defaultVersionEnvelope([task]);
      },
    },
    {
      name: 'legacy array',
      raw(task: ReturnType<typeof makeTask>): string {
        return legacyRawArray([task]);
      },
    },
  ])('parses and canonicalizes a legal $name backup while permanently retaining it', async ({name, raw}) => {
    const task = makeTask(`restore-${name.replaceAll(' ', '-')}`);
    const key = backupKey(`restore-${name.replaceAll(' ', '-')}`);
    const backupRaw = raw(task);
    const backend = new ControlledBackend(new Map([[key, backupRaw]]));
    const dependencies = makeDependencies();
    const storage = createManagedStorage(backend, dependencies.dependencies);

    await expect(restoreStorage(storage, key)).resolves.toEqual({
      state: 'restored',
      backupKey: key,
      version: 1,
      taskCount: 1,
    });
    const canonical = currentEnvelope([task]);
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(canonical);
    expect(backend.raw(key)).toBe(backupRaw);
    expect(backend.setAttempts).toEqual([
      {key: CURRENT_STORAGE_KEY, value: canonical},
    ]);
    expect(backend.setCommits).toEqual(backend.setAttempts);
    expect(backend.removeAttempts).toEqual([]);
    expect(dependencies.now).not.toHaveBeenCalled();
    expect(dependencies.idGenerator).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'malformed',
      raw: '{"secret":"RESTORE_SECRET_MALFORMED"',
      secret: 'RESTORE_SECRET_MALFORMED',
    },
    {
      name: 'foreign schema',
      raw: JSON.stringify({schema: 'RESTORE_SECRET_FOREIGN', version: 1, tasks: []}),
      secret: 'RESTORE_SECRET_FOREIGN',
    },
    {
      name: 'negative version',
      raw: JSON.stringify({
        schema: 'start-five.tasks',
        version: -1,
        tasks: [makeTask('RESTORE_SECRET_VERSION_NEGATIVE')],
      }),
      secret: 'RESTORE_SECRET_VERSION_NEGATIVE',
    },
    {
      name: 'string version',
      raw: JSON.stringify({
        schema: 'start-five.tasks',
        version: '1',
        tasks: [makeTask('RESTORE_SECRET_VERSION_STRING')],
      }),
      secret: 'RESTORE_SECRET_VERSION_STRING',
    },
    {
      name: 'null version',
      raw: JSON.stringify({
        schema: 'start-five.tasks',
        version: null,
        tasks: [makeTask('RESTORE_SECRET_VERSION_NULL')],
      }),
      secret: 'RESTORE_SECRET_VERSION_NULL',
    },
    {
      name: 'fractional version',
      raw: JSON.stringify({
        schema: 'start-five.tasks',
        version: 0.5,
        tasks: [makeTask('RESTORE_SECRET_VERSION_FRACTIONAL')],
      }),
      secret: 'RESTORE_SECRET_VERSION_FRACTIONAL',
    },
    {
      name: 'future version',
      raw: JSON.stringify({
        schema: 'start-five.tasks',
        version: 2,
        tasks: [makeTask('RESTORE_SECRET_VERSION_FUTURE')],
      }),
      secret: 'RESTORE_SECRET_VERSION_FUTURE',
    },
    {
      name: 'extra current-envelope key',
      raw: JSON.stringify({
        schema: 'start-five.tasks',
        version: 1,
        tasks: [makeTask('RESTORE_SECRET_EXTRA_CURRENT')],
        extra: 'RESTORE_SECRET_EXTRA_CURRENT',
      }),
      secret: 'RESTORE_SECRET_EXTRA_CURRENT',
    },
    {
      name: 'extra V0-envelope key',
      raw: JSON.stringify({
        schema: 'start-five.tasks',
        version: 0,
        tasks: [makeTask('RESTORE_SECRET_EXTRA_V0')],
        extra: 'RESTORE_SECRET_EXTRA_V0',
      }),
      secret: 'RESTORE_SECRET_EXTRA_V0',
    },
    {
      name: 'extra default-envelope key',
      raw: JSON.stringify({
        schema: 'start-five.tasks',
        tasks: [makeTask('RESTORE_SECRET_EXTRA_DEFAULT')],
        extra: 'RESTORE_SECRET_EXTRA_DEFAULT',
      }),
      secret: 'RESTORE_SECRET_EXTRA_DEFAULT',
    },
    {
      name: 'invalid task semantics',
      raw: JSON.stringify({
        schema: 'start-five.tasks',
        version: 1,
        tasks: [{id: 'RESTORE_SECRET_SEMANTICS', title: 42}],
      }),
      secret: 'RESTORE_SECRET_SEMANTICS',
    },
    {
      name: 'inconsistent scheduled planning time',
      raw: currentEnvelope([
        makeTask('RESTORE_SECRET_PLANNING_TIME', {
          scheduledStartAt: '2026-08-05T10:00:00.000Z',
        }),
      ]),
      secret: 'RESTORE_SECRET_PLANNING_TIME',
    },
    {
      name: 'nonpositive planning estimate',
      raw: currentEnvelope([
        makeTask('RESTORE_SECRET_PLANNING_ESTIMATE', {estimatedMinutes: 0}),
      ]),
      secret: 'RESTORE_SECRET_PLANNING_ESTIMATE',
    },
    {
      name: 'blank planning first step',
      raw: currentEnvelope([
        makeTask('RESTORE_SECRET_PLANNING_STEP', {firstStep: '   '}),
      ]),
      secret: 'RESTORE_SECRET_PLANNING_STEP',
    },
  ])('rejects $name backup without dependency use, disclosure, or online mutation', async ({raw, secret}) => {
    const key = backupKey('invalid-restore');
    const backend = new ControlledBackend(new Map([[key, raw]]));
    const dependencies = makeDependencies();
    const storage = createManagedStorage(backend, dependencies.dependencies);

    const outcome = await captureOutcome(
      Promise.resolve().then(() => restoreStorage(storage, key)),
    );
    expect(outcome.status).toBe('rejected');
    const error = outcome.status === 'rejected' ? outcome.error : undefined;
    expect(errorView(error)).toEqual({
      code: 'TASK_RECOVERY_BACKUP_INVALID',
      message: 'TASK_RECOVERY_BACKUP_INVALID',
      category: undefined,
      cause: undefined,
    });
    expect(publicErrorText(error)).not.toContain(secret);
    expect(String(error)).not.toContain(secret);
    expect(backend.getAttempts).toEqual([key]);
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBeNull();
    expect(backend.raw(key)).toBe(raw);
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeAttempts).toEqual([]);
    expect(dependencies.now).toHaveBeenCalledTimes(0);
    expect(dependencies.idGenerator).toHaveBeenCalledTimes(0);

    const inspectionOffset = backend.getAttempts.length;
    const inspection = await inspectStorage(storage);
    expect(inspection).toEqual({state: 'empty'});
    expect(JSON.stringify(inspection)).not.toContain(secret);
    expect(backend.getAttempts.slice(inspectionOffset)).toEqual([
      CURRENT_STORAGE_KEY,
      LEGACY_STORAGE_KEY,
    ]);
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBeNull();
    expect(backend.raw(key)).toBe(raw);
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeAttempts).toEqual([]);
    expect(dependencies.now).toHaveBeenCalledTimes(0);
    expect(dependencies.idGenerator).toHaveBeenCalledTimes(0);
  });

  it('rejects a missing backup after exactly one backup read and no dependency use', async () => {
    const missingKey = backupKey('restore-missing');
    const missingBackend = new ControlledBackend();
    const missingDependencies = makeDependencies();
    const missingStorage = createManagedStorage(
      missingBackend,
      missingDependencies.dependencies,
    );
    const outcome = await captureOutcome(
      Promise.resolve().then(() => restoreStorage(missingStorage, missingKey)),
    );
    expect(outcome.status).toBe('rejected');
    expect(
      errorView(outcome.status === 'rejected' ? outcome.error : undefined),
    ).toEqual({
      code: 'TASK_RECOVERY_BACKUP_NOT_FOUND',
      message: 'TASK_RECOVERY_BACKUP_NOT_FOUND',
      category: undefined,
      cause: undefined,
    });
    expect(missingBackend.getAttempts).toEqual([missingKey]);
    expect(missingBackend.setAttempts).toEqual([]);
    expect(missingBackend.removeAttempts).toEqual([]);
    expect(missingDependencies.now).toHaveBeenCalledTimes(0);
    expect(missingDependencies.idGenerator).toHaveBeenCalledTimes(0);
  });

  it.each([
    {
      name: 'legal canonical envelope',
      existing: currentEnvelope([makeTask('SECRET_RESTORE_OCCUPIED_CURRENT')]),
      secret: 'SECRET_RESTORE_OCCUPIED_CURRENT',
      expectedInspection: {
        state: 'current',
        schema: 'start-five.tasks',
        version: 1,
        taskCount: 1,
      },
    },
    {
      name: 'malformed JSON',
      existing: '{"secret":"SECRET_RESTORE_OCCUPIED_MALFORMED"',
      secret: 'SECRET_RESTORE_OCCUPIED_MALFORMED',
      expectedInspection: {
        state: 'unreadable',
        sourceKey: CURRENT_STORAGE_KEY,
        category: 'MALFORMED_JSON',
      },
    },
    {
      name: 'unsupported version envelope',
      existing: JSON.stringify({
        schema: 'start-five.tasks',
        version: 2,
        tasks: [makeTask('SECRET_RESTORE_OCCUPIED_UNSUPPORTED')],
      }),
      secret: 'SECRET_RESTORE_OCCUPIED_UNSUPPORTED',
      expectedInspection: {
        state: 'unreadable',
        sourceKey: CURRENT_STORAGE_KEY,
        category: 'UNSUPPORTED_VERSION',
      },
    },
    {
      name: 'wrong-root raw array',
      existing: JSON.stringify(['SECRET_RESTORE_OCCUPIED_WRONG_ROOT']),
      secret: 'SECRET_RESTORE_OCCUPIED_WRONG_ROOT',
      expectedInspection: {
        state: 'unreadable',
        sourceKey: CURRENT_STORAGE_KEY,
        category: 'WRONG_ROOT',
      },
    },
  ])(
    'gives occupied-target priority over $name and preserves every byte',
    async ({existing, secret, expectedInspection}) => {
      const occupiedKey = backupKey('restore-occupied');
      const backupRaw = currentEnvelope([makeTask('restore-replacement')]);
      const backend = new ControlledBackend(
        new Map([
          [occupiedKey, backupRaw],
          [CURRENT_STORAGE_KEY, existing],
        ]),
      );
      const dependencies = makeDependencies();
      const storage = createManagedStorage(backend, dependencies.dependencies);

      const outcome = await captureOutcome(
        Promise.resolve().then(() => restoreStorage(storage, occupiedKey)),
      );
      expect(outcome.status).toBe('rejected');
      const error =
        outcome.status === 'rejected' ? outcome.error : undefined;
      expect(errorView(error)).toEqual({
        code: 'TASK_RECOVERY_TARGET_OCCUPIED',
        message: 'TASK_RECOVERY_TARGET_OCCUPIED',
        category: undefined,
        cause: undefined,
      });
      expect(publicErrorText(error)).not.toContain(secret);
      expect(String(error)).not.toContain(secret);
      expect(backend.getAttempts).toEqual([
        occupiedKey,
        CURRENT_STORAGE_KEY,
      ]);
      expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(existing);
      expect(backend.raw(occupiedKey)).toBe(backupRaw);
      expect(backend.setAttempts).toEqual([]);
      expect(backend.removeAttempts).toEqual([]);
      expect(dependencies.now).toHaveBeenCalledTimes(0);
      expect(dependencies.idGenerator).toHaveBeenCalledTimes(0);

      const inspectionOffset = backend.getAttempts.length;
      const inspection = await inspectStorage(storage);
      expect(inspection).toEqual(expectedInspection);
      expect(JSON.stringify(inspection)).not.toContain(secret);
      expect(backend.getAttempts.slice(inspectionOffset)).toEqual([
        CURRENT_STORAGE_KEY,
        LEGACY_STORAGE_KEY,
      ]);
      expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(existing);
      expect(backend.raw(occupiedKey)).toBe(backupRaw);
      expect(backend.setAttempts).toEqual([]);
      expect(backend.removeAttempts).toEqual([]);
      expect(dependencies.now).toHaveBeenCalledTimes(0);
      expect(dependencies.idGenerator).toHaveBeenCalledTimes(0);
    },
  );

  it('preserves all legal A2 planning fields while canonicalizing restored backup data', async () => {
    const task = makeTask('restore-planning-fields', {
      scheduledStartAt: '2026-08-05T09:00:00.000Z',
      estimatedMinutes: 30,
      firstStep: 'Resume from the preserved plan',
    });
    const key = backupKey('restore-planning-fields');
    const backupRaw = legacyRawArray([task]);
    const backend = new ControlledBackend(new Map([[key, backupRaw]]));
    const storage = createManagedStorage(
      backend,
      makeDependencies().dependencies,
    );

    await expect(restoreStorage(storage, key)).resolves.toEqual({
      state: 'restored',
      backupKey: key,
      version: 1,
      taskCount: 1,
    });
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(currentEnvelope([task]));
    expect(backend.raw(key)).toBe(backupRaw);
  });

  it('accepts exactly 256 restored Subtasks and rejects 257 without an online write', async () => {
    const legalTasks = makeTasksWithSubtaskCount(256);
    const legalKey = backupKey('restore-array-256');
    const legalRaw = legacyRawArray(legalTasks);
    const legalBackend = new ControlledBackend(new Map([[legalKey, legalRaw]]));
    const legalStorage = createManagedStorage(
      legalBackend,
      makeDependencies().dependencies,
    );

    await expect(restoreStorage(legalStorage, legalKey)).resolves.toMatchObject({
      state: 'restored',
      taskCount: 1,
    });
    expect(legalBackend.raw(CURRENT_STORAGE_KEY)).toBe(currentEnvelope(legalTasks));
    expect(legalBackend.raw(legalKey)).toBe(legalRaw);

    const invalidTasks = makeTasksWithSubtaskCount(257);
    const invalidKey = backupKey('restore-array-257');
    const invalidRaw = legacyRawArray(invalidTasks);
    const invalidBackend = new ControlledBackend(
      new Map([[invalidKey, invalidRaw]]),
    );
    const invalidStorage = createManagedStorage(
      invalidBackend,
      makeDependencies().dependencies,
    );
    await expect(restoreStorage(invalidStorage, invalidKey)).rejects.toMatchObject({
      code: 'TASK_RECOVERY_BACKUP_INVALID',
    });
    expect(invalidBackend.raw(CURRENT_STORAGE_KEY)).toBeNull();
    expect(invalidBackend.raw(invalidKey)).toBe(invalidRaw);
    expect(invalidBackend.setAttempts).toEqual([]);
    expect(invalidBackend.removeAttempts).toEqual([]);
  });

  it('accepts exactly 512 restored containers and rejects 513 without an online write', async () => {
    const legalTasks = makeExactContainerCandidate(512);
    const legalKey = backupKey('restore-containers-512');
    const legalRaw = legacyRawArray(legalTasks);
    const legalBackend = new ControlledBackend(new Map([[legalKey, legalRaw]]));
    const legalStorage = createManagedStorage(
      legalBackend,
      makeDependencies().dependencies,
    );
    await expect(restoreStorage(legalStorage, legalKey)).resolves.toMatchObject({
      state: 'restored',
      taskCount: 255,
    });
    expect(legalBackend.raw(CURRENT_STORAGE_KEY)).toBe(currentEnvelope(legalTasks));
    expect(legalBackend.raw(legalKey)).toBe(legalRaw);

    const invalidTasks = makeExactContainerCandidate(513);
    const invalidKey = backupKey('restore-containers-513');
    const invalidRaw = legacyRawArray(invalidTasks);
    const invalidBackend = new ControlledBackend(
      new Map([[invalidKey, invalidRaw]]),
    );
    const invalidStorage = createManagedStorage(
      invalidBackend,
      makeDependencies().dependencies,
    );
    await expect(restoreStorage(invalidStorage, invalidKey)).rejects.toMatchObject({
      code: 'TASK_RECOVERY_BACKUP_INVALID',
    });
    expect(invalidBackend.raw(CURRENT_STORAGE_KEY)).toBeNull();
    expect(invalidBackend.raw(invalidKey)).toBe(invalidRaw);
    expect(invalidBackend.setAttempts).toEqual([]);
    expect(invalidBackend.removeAttempts).toEqual([]);
  });

  it('retains backup read and canonical write failure identities without deletion', async () => {
    const readKey = backupKey('restore-read-failure');
    const readBackend = new ControlledBackend(
      new Map([[readKey, currentEnvelope([makeTask('restore-read')])]]),
    );
    const readFailure = new Error('RESTORE_READ_FAILED');
    readBackend.failNext('get', readKey, readFailure);
    const readStorage = createManagedStorage(
      readBackend,
      makeDependencies().dependencies,
    );
    await expect(restoreStorage(readStorage, readKey)).rejects.toMatchObject({
      code: 'TASK_STORAGE_READ_FAILED',
      cause: readFailure,
    });
    expect(readBackend.setAttempts).toEqual([]);
    expect(readBackend.removeAttempts).toEqual([]);

    const writeKey = backupKey('restore-write-failure');
    const backupRaw = legacyRawArray([makeTask('restore-write')]);
    const writeBackend = new ControlledBackend(new Map([[writeKey, backupRaw]]));
    const writeFailure = new Error('RESTORE_WRITE_FAILED');
    writeBackend.failNext('set', CURRENT_STORAGE_KEY, writeFailure);
    const writeStorage = createManagedStorage(
      writeBackend,
      makeDependencies().dependencies,
    );
    await expect(restoreStorage(writeStorage, writeKey)).rejects.toMatchObject({
      code: 'TASK_STORAGE_WRITE_FAILED',
      cause: writeFailure,
    });
    expect(writeBackend.raw(CURRENT_STORAGE_KEY)).toBeNull();
    expect(writeBackend.raw(writeKey)).toBe(backupRaw);
    expect(writeBackend.removeAttempts).toEqual([]);
  });
});

describe('GAP-P0-04 cross-facade recovery linearization', () => {
  it('linearizes quarantine before recover so both succeed without overwriting either backup', async () => {
    const corrupt = '{quarantine race source';
    const generatedKey = backupKey(FIXED_BACKUP_ID);
    const recoveryKey = backupKey('race-recover');
    const recoveredTask = makeTask('race-recovered');
    const backend = new ControlledBackend(
      new Map([
        [CURRENT_STORAGE_KEY, corrupt],
        [recoveryKey, 'recovery proof backup'],
      ]),
    );
    const quarantineFacade = createManagedStorage(
      backend,
      makeDependencies().dependencies,
    );
    const recoverFacade = createManagedStorage(
      backend,
      makeDependencies().dependencies,
    );
    const hold = backend.holdNext('set', generatedKey);

    const quarantine = captureOutcome(
      Promise.resolve().then(() => quarantineStorage(quarantineFacade)),
    );
    const signal = await waitForBarrier(hold.entered, quarantine);
    expect(signal).toBe('entered');
    if (signal !== 'entered') {
      hold.release();
      return;
    }
    const recovery = captureOutcome(
      Promise.resolve().then(() =>
        recoverStorage(recoverFacade, recoveryKey, [recoveredTask]),
      ),
    );
    hold.release();

    await expect(Promise.all([quarantine, recovery])).resolves.toEqual([
      {
        status: 'fulfilled',
        value: {
          state: 'quarantined',
          backupKey: generatedKey,
          category: 'MALFORMED_JSON',
          createdAt: FIXED_NOW,
        },
      },
      {
        status: 'fulfilled',
        value: {
          state: 'recovered',
          backupKey: recoveryKey,
          version: 1,
          taskCount: 1,
        },
      },
    ]);
    expect(backend.raw(generatedKey)).toBe(corrupt);
    expect(backend.raw(recoveryKey)).toBe('recovery proof backup');
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(currentEnvelope([recoveredTask]));
  });

  it('linearizes recover before restore so the latter observes the occupied target', async () => {
    const recoverKey = backupKey('recover-first');
    const restoreKey = backupKey('restore-second');
    const recoveredTask = makeTask('recovered-first');
    const restoredTask = makeTask('restored-second');
    const backend = new ControlledBackend(
      new Map([
        [recoverKey, 'recover proof'],
        [restoreKey, currentEnvelope([restoredTask])],
      ]),
    );
    const recoverFacade = createManagedStorage(
      backend,
      makeDependencies().dependencies,
    );
    const restoreFacade = createManagedStorage(
      backend,
      makeDependencies().dependencies,
    );
    const hold = backend.holdNext('set', CURRENT_STORAGE_KEY);

    const recovery = captureOutcome(
      Promise.resolve().then(() =>
        recoverStorage(recoverFacade, recoverKey, [recoveredTask]),
      ),
    );
    const signal = await waitForBarrier(hold.entered, recovery);
    expect(signal).toBe('entered');
    if (signal !== 'entered') {
      hold.release();
      return;
    }
    const restore = captureOutcome(
      Promise.resolve().then(() => restoreStorage(restoreFacade, restoreKey)),
    );
    hold.release();

    const [recoverOutcome, restoreOutcome] = await Promise.all([
      recovery,
      restore,
    ]);
    expect(recoverOutcome.status).toBe('fulfilled');
    expect(restoreOutcome.status).toBe('rejected');
    expect(
      errorView(
        restoreOutcome.status === 'rejected' ? restoreOutcome.error : undefined,
      ),
    ).toMatchObject({code: 'TASK_RECOVERY_TARGET_OCCUPIED'});
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(currentEnvelope([recoveredTask]));
    expect(backend.raw(recoverKey)).toBe('recover proof');
    expect(backend.raw(restoreKey)).toBe(currentEnvelope([restoredTask]));
  });
});
