import {createTaskRepository} from '../../src/data/taskRepository';
import {
  ControlledBackend,
  CURRENT_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  SNAPSHOT_SCHEMA,
  captureOutcome,
  createManagedStorage,
  currentEnvelope,
  defaultEnvelopeObject,
  defaultVersionEnvelope,
  errorView,
  inspectStorage,
  legacyRawArray,
  makeDependencies,
  makeTask,
  publicErrorText,
  versionEnvelopeObject,
  type IntegrityCategory,
  type TaskDataInspection,
} from './taskDataRecoveryTestKit';

type IntegrityCase = {
  name: string;
  raw: string;
  code: string;
  category: IntegrityCategory;
  secret: string;
};

const integrityCases: readonly IntegrityCase[] = [
  {
    name: 'malformed JSON',
    raw: '{"payload":"SECRET_MALFORMED"',
    code: 'TASK_SNAPSHOT_CORRUPT',
    category: 'MALFORMED_JSON',
    secret: 'SECRET_MALFORMED',
  },
  {
    name: 'wrong current-key root',
    raw: JSON.stringify(['SECRET_WRONG_ROOT']),
    code: 'TASK_SNAPSHOT_INVALID',
    category: 'WRONG_ROOT',
    secret: 'SECRET_WRONG_ROOT',
  },
  {
    name: 'foreign schema',
    raw: JSON.stringify({
      schema: 'foreign.tasks.SECRET_FOREIGN',
      version: 1,
      tasks: [],
    }),
    code: 'TASK_SNAPSHOT_UNSUPPORTED',
    category: 'UNSUPPORTED_SCHEMA',
    secret: 'SECRET_FOREIGN',
  },
  {
    name: 'semantically invalid snapshot',
    raw: JSON.stringify({
      schema: SNAPSHOT_SCHEMA,
      version: 1,
      tasks: [{id: 'SECRET_INVALID_SEMANTICS', title: 42}],
    }),
    code: 'TASK_SNAPSHOT_INVALID',
    category: 'INVALID_SNAPSHOT',
    secret: 'SECRET_INVALID_SEMANTICS',
  },
];

function expectNoSharedMutableReferences(
  first: unknown,
  second: unknown,
): void {
  if (
    typeof first !== 'object' ||
    first === null ||
    typeof second !== 'object' ||
    second === null
  ) {
    return;
  }

  expect(second).not.toBe(first);
  for (const field of Object.keys(first)) {
    if (Object.hasOwn(second, field)) {
      expectNoSharedMutableReferences(
        Reflect.get(first, field),
        Reflect.get(second, field),
      );
    }
  }
}

describe('GAP-P0-04 fail-closed corruption classification', () => {
  it.each(integrityCases)(
    'classifies $name without exposing or mutating source bytes',
    async ({raw, code, category, secret}) => {
      const backend = new ControlledBackend();
      backend.seed(CURRENT_STORAGE_KEY, raw);
      const dependencies = makeDependencies();
      const storage = createManagedStorage(backend, dependencies.dependencies);

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const readOffset = backend.getAttempts.length;
        const outcome = await captureOutcome(
          storage.getItem(CURRENT_STORAGE_KEY),
        );

        expect(outcome.status).toBe('rejected');
        const error = outcome.status === 'rejected' ? outcome.error : undefined;
        expect(errorView(error)).toEqual({
          code,
          message: code,
          category,
          cause: undefined,
        });
        expect(publicErrorText(error)).not.toContain(secret);
        expect(backend.getAttempts.slice(readOffset)).toEqual([
          CURRENT_STORAGE_KEY,
          LEGACY_STORAGE_KEY,
        ]);
      }
      expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(raw);
      expect(backend.setAttempts).toEqual([]);
      expect(backend.removeAttempts).toEqual([]);
      expect(dependencies.now).not.toHaveBeenCalled();
      expect(dependencies.idGenerator).not.toHaveBeenCalled();

      const inspectionOffset = backend.getAttempts.length;
      const inspection = await inspectStorage(storage);
      expect(inspection).toEqual({
        state: 'unreadable',
        sourceKey: CURRENT_STORAGE_KEY,
        category,
      });
      expect(JSON.stringify(inspection)).not.toContain(secret);
      expect(backend.getAttempts.slice(inspectionOffset)).toEqual([
        CURRENT_STORAGE_KEY,
        LEGACY_STORAGE_KEY,
      ]);
      expect(dependencies.now).toHaveBeenCalledTimes(0);
      expect(dependencies.idGenerator).toHaveBeenCalledTimes(0);
    },
  );

  it.each([
    {
      name: 'negative',
      version: -1,
      secret: 'SECRET_UNSUPPORTED_CURRENT_NEGATIVE',
    },
    {
      name: 'string',
      version: '1',
      secret: 'SECRET_UNSUPPORTED_CURRENT_STRING',
    },
    {
      name: 'null',
      version: null,
      secret: 'SECRET_UNSUPPORTED_CURRENT_NULL',
    },
    {
      name: 'fractional',
      version: 0.5,
      secret: 'SECRET_UNSUPPORTED_CURRENT_FRACTIONAL',
    },
    {
      name: 'future',
      version: 2,
      secret: 'SECRET_UNSUPPORTED_CURRENT_FUTURE',
    },
  ])(
    'classifies an exact envelope with $name version as unsupported and preserves bytes',
    async ({version, secret}) => {
      const raw = JSON.stringify(
        versionEnvelopeObject([makeTask(secret)], version),
      );
      const backend = new ControlledBackend(
        new Map([[CURRENT_STORAGE_KEY, raw]]),
      );
      const dependencies = makeDependencies();
      const storage = createManagedStorage(backend, dependencies.dependencies);

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const readOffset = backend.getAttempts.length;
        const outcome = await captureOutcome(
          storage.getItem(CURRENT_STORAGE_KEY),
        );
        expect(outcome.status).toBe('rejected');
        const error =
          outcome.status === 'rejected' ? outcome.error : undefined;
        expect(errorView(error)).toEqual({
          code: 'TASK_SNAPSHOT_UNSUPPORTED',
          message: 'TASK_SNAPSHOT_UNSUPPORTED',
          category: 'UNSUPPORTED_VERSION',
          cause: undefined,
        });
        expect(publicErrorText(error)).not.toContain(secret);
        expect(String(error)).not.toContain(secret);
        expect(backend.getAttempts.slice(readOffset)).toEqual([
          CURRENT_STORAGE_KEY,
          LEGACY_STORAGE_KEY,
        ]);
      }
      expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(raw);
      expect(backend.setAttempts).toEqual([]);
      expect(backend.removeAttempts).toEqual([]);

      const inspectionOffset = backend.getAttempts.length;
      const inspection = await inspectStorage(storage);
      expect(inspection).toEqual({
        state: 'unreadable',
        sourceKey: CURRENT_STORAGE_KEY,
        category: 'UNSUPPORTED_VERSION',
      });
      expect(JSON.stringify(inspection)).not.toContain(secret);
      expect(backend.getAttempts.slice(inspectionOffset)).toEqual([
        CURRENT_STORAGE_KEY,
        LEGACY_STORAGE_KEY,
      ]);
      expect(dependencies.now).toHaveBeenCalledTimes(0);
      expect(dependencies.idGenerator).toHaveBeenCalledTimes(0);
    },
  );

  it.each([
    {
      name: 'current',
      secret: 'SECRET_EXTRA_CURRENT',
      envelope: {
        ...versionEnvelopeObject([makeTask('SECRET_EXTRA_CURRENT')], 1),
        extra: 'SECRET_EXTRA_CURRENT',
      },
    },
    {
      name: 'V0',
      secret: 'SECRET_EXTRA_V0',
      envelope: {
        ...versionEnvelopeObject([makeTask('SECRET_EXTRA_V0')], 0),
        extra: 'SECRET_EXTRA_V0',
      },
    },
    {
      name: 'default',
      secret: 'SECRET_EXTRA_DEFAULT',
      envelope: {
        ...defaultEnvelopeObject([makeTask('SECRET_EXTRA_DEFAULT')]),
        extra: 'SECRET_EXTRA_DEFAULT',
      },
    },
  ])('rejects an otherwise legal $name envelope with an extra key', async ({envelope, secret}) => {
    const raw = JSON.stringify(envelope);
    const backend = new ControlledBackend(
      new Map([[CURRENT_STORAGE_KEY, raw]]),
    );
    const dependencies = makeDependencies();
    const storage = createManagedStorage(backend, dependencies.dependencies);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const readOffset = backend.getAttempts.length;
      const outcome = await captureOutcome(
        storage.getItem(CURRENT_STORAGE_KEY),
      );
      expect(outcome.status).toBe('rejected');
      const error =
        outcome.status === 'rejected' ? outcome.error : undefined;
      expect(errorView(error)).toEqual({
        code: 'TASK_SNAPSHOT_INVALID',
        message: 'TASK_SNAPSHOT_INVALID',
        category: 'INVALID_SNAPSHOT',
        cause: undefined,
      });
      expect(publicErrorText(error)).not.toContain(secret);
      expect(String(error)).not.toContain(secret);
      expect(backend.getAttempts.slice(readOffset)).toEqual([
        CURRENT_STORAGE_KEY,
        LEGACY_STORAGE_KEY,
      ]);
    }
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(raw);
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeAttempts).toEqual([]);

    const inspectionOffset = backend.getAttempts.length;
    const inspection = await inspectStorage(storage);
    expect(inspection).toEqual({
      state: 'unreadable',
      sourceKey: CURRENT_STORAGE_KEY,
      category: 'INVALID_SNAPSHOT',
    });
    expect(JSON.stringify(inspection)).not.toContain(secret);
    expect(backend.getAttempts.slice(inspectionOffset)).toEqual([
      CURRENT_STORAGE_KEY,
      LEGACY_STORAGE_KEY,
    ]);
    expect(dependencies.now).toHaveBeenCalledTimes(0);
    expect(dependencies.idGenerator).toHaveBeenCalledTimes(0);
  });

  it('rejects valid JSON with invalid Task semantics under the historical key without writing either key', async () => {
    const invalidTask = makeTask('SECRET_HISTORICAL_INVALID');
    invalidTask.updatedAt = '2026-08-05T06:59:59.000Z';
    const raw = legacyRawArray([invalidTask]);
    const backend = new ControlledBackend(
      new Map([[LEGACY_STORAGE_KEY, raw]]),
    );
    const storage = createManagedStorage(
      backend,
      makeDependencies().dependencies,
    );

    const outcome = await captureOutcome(storage.getItem(CURRENT_STORAGE_KEY));
    expect(outcome.status).toBe('rejected');
    const error = outcome.status === 'rejected' ? outcome.error : undefined;
    expect(errorView(error)).toEqual({
      code: 'TASK_SNAPSHOT_INVALID',
      message: 'TASK_SNAPSHOT_INVALID',
      category: 'INVALID_SNAPSHOT',
      cause: undefined,
    });
    expect(publicErrorText(error)).not.toContain('SECRET_HISTORICAL_INVALID');
    expect(backend.raw(LEGACY_STORAGE_KEY)).toBe(raw);
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBeNull();
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeAttempts).toEqual([]);
  });

  it('classifies malformed historical bytes at their source after reading both task keys', async () => {
    const raw = '{"payload":"SECRET_HISTORICAL_MALFORMED"';
    const backend = new ControlledBackend(
      new Map([[LEGACY_STORAGE_KEY, raw]]),
    );
    const dependencies = makeDependencies();
    const storage = createManagedStorage(backend, dependencies.dependencies);

    const outcome = await captureOutcome(storage.getItem(CURRENT_STORAGE_KEY));
    expect(outcome.status).toBe('rejected');
    const error = outcome.status === 'rejected' ? outcome.error : undefined;
    expect(errorView(error)).toEqual({
      code: 'TASK_SNAPSHOT_CORRUPT',
      message: 'TASK_SNAPSHOT_CORRUPT',
      category: 'MALFORMED_JSON',
      cause: undefined,
    });
    expect(publicErrorText(error)).not.toContain(
      'SECRET_HISTORICAL_MALFORMED',
    );
    expect(backend.getAttempts).toEqual([
      CURRENT_STORAGE_KEY,
      LEGACY_STORAGE_KEY,
    ]);

    backend.clearAudit();
    await expect(inspectStorage(storage)).resolves.toEqual({
      state: 'unreadable',
      sourceKey: LEGACY_STORAGE_KEY,
      category: 'MALFORMED_JSON',
    });
    expect(backend.getAttempts).toEqual([
      CURRENT_STORAGE_KEY,
      LEGACY_STORAGE_KEY,
    ]);
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBeNull();
    expect(backend.raw(LEGACY_STORAGE_KEY)).toBe(raw);
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeAttempts).toEqual([]);
    expect(dependencies.now).not.toHaveBeenCalled();
    expect(dependencies.idGenerator).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'current envelope',
      secret: 'SECRET_HISTORICAL_CURRENT_ENVELOPE',
      raw: currentEnvelope([
        makeTask('SECRET_HISTORICAL_CURRENT_ENVELOPE'),
      ]),
    },
    {
      name: 'V0 envelope',
      secret: 'SECRET_HISTORICAL_V0_ENVELOPE',
      raw: JSON.stringify(
        versionEnvelopeObject(
          [makeTask('SECRET_HISTORICAL_V0_ENVELOPE')],
          0,
        ),
      ),
    },
    {
      name: 'default envelope',
      secret: 'SECRET_HISTORICAL_DEFAULT_ENVELOPE',
      raw: defaultVersionEnvelope([
        makeTask('SECRET_HISTORICAL_DEFAULT_ENVELOPE'),
      ]),
    },
  ])(
    'rejects a $name under the historical key because only a raw Task array is legal there',
    async ({raw, secret}) => {
      const backend = new ControlledBackend(
        new Map([[LEGACY_STORAGE_KEY, raw]]),
      );
      const dependencies = makeDependencies();
      const storage = createManagedStorage(backend, dependencies.dependencies);

      const outcome = await captureOutcome(
        storage.getItem(CURRENT_STORAGE_KEY),
      );

      expect(outcome.status).toBe('rejected');
      const error = outcome.status === 'rejected' ? outcome.error : undefined;
      expect(errorView(error)).toEqual({
        code: 'TASK_SNAPSHOT_INVALID',
        message: 'TASK_SNAPSHOT_INVALID',
        category: 'WRONG_ROOT',
        cause: undefined,
      });
      expect(publicErrorText(error)).not.toContain(secret);
      expect(backend.raw(CURRENT_STORAGE_KEY)).toBeNull();
      expect(backend.raw(LEGACY_STORAGE_KEY)).toBe(raw);
      expect(backend.setAttempts).toEqual([]);
      expect(backend.removeAttempts).toEqual([]);
      expect(dependencies.now).not.toHaveBeenCalled();
      expect(dependencies.idGenerator).not.toHaveBeenCalled();
    },
  );

  it('does not let the repository reinterpret malformed durable bytes as an empty list', async () => {
    const raw = '{"secret":"SECRET_REPOSITORY"';
    const backend = new ControlledBackend(
      new Map([[CURRENT_STORAGE_KEY, raw]]),
    );
    const repository = createTaskRepository(
      createManagedStorage(backend, makeDependencies().dependencies),
    );

    const outcome = await captureOutcome(
      repository.list({includeDeleted: true}),
    );
    expect(outcome.status).toBe('rejected');
    expect(
      errorView(outcome.status === 'rejected' ? outcome.error : undefined),
    ).toEqual({
      code: 'TASK_SNAPSHOT_CORRUPT',
      message: 'TASK_SNAPSHOT_CORRUPT',
      category: 'MALFORMED_JSON',
      cause: undefined,
    });
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(raw);
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeAttempts).toEqual([]);
  });
});

describe('GAP-P0-04 read-only inspection', () => {
  const inspectionCases: readonly {
    name: string;
    entries: readonly (readonly [string, string])[];
    expected: TaskDataInspection;
  }[] = [
    {
      name: 'empty',
      entries: [],
      expected: {state: 'empty'},
    },
    {
      name: 'current',
      entries: [[CURRENT_STORAGE_KEY, currentEnvelope([makeTask('inspect-current')])]],
      expected: {
        state: 'current',
        schema: SNAPSHOT_SCHEMA,
        version: 1,
        taskCount: 1,
      },
    },
    {
      name: 'V0',
      entries: [[CURRENT_STORAGE_KEY, JSON.stringify(versionEnvelopeObject([makeTask('inspect-v0')], 0))]],
      expected: {
        state: 'legacy',
        sourceKey: CURRENT_STORAGE_KEY,
        fromVersion: 0,
        taskCount: 1,
      },
    },
    {
      name: 'default envelope',
      entries: [[CURRENT_STORAGE_KEY, defaultVersionEnvelope([makeTask('inspect-default')])]],
      expected: {
        state: 'legacy',
        sourceKey: CURRENT_STORAGE_KEY,
        fromVersion: 'default',
        taskCount: 1,
      },
    },
    {
      name: 'historical raw array',
      entries: [[LEGACY_STORAGE_KEY, legacyRawArray([makeTask('inspect-old-key')])]],
      expected: {
        state: 'legacy',
        sourceKey: LEGACY_STORAGE_KEY,
        fromVersion: 'default',
        taskCount: 1,
      },
    },
  ];

  it.each(inspectionCases)('returns two detached $name inspection records with exact read budgets', async ({entries, expected}) => {
    const backend = new ControlledBackend(new Map(entries));
    const dependencies = makeDependencies();
    const storage = createManagedStorage(backend, dependencies.dependencies);
    const durableBefore = [...backend.values.entries()];

    const first = await inspectStorage(storage);
    expect(first).toEqual(expected);
    expect(backend.getAttempts).toEqual([
      CURRENT_STORAGE_KEY,
      LEGACY_STORAGE_KEY,
    ]);
    const eventsBeforeMutation = backend.events.length;
    for (const field of Object.keys(first)) {
      expect(Reflect.set(first, field, `MUTATED_${field}`)).toBe(true);
    }
    expect(backend.events).toHaveLength(eventsBeforeMutation);
    expect([...backend.values.entries()]).toEqual(durableBefore);

    const second = await inspectStorage(storage);
    expect(second).toEqual(expected);
    expectNoSharedMutableReferences(first, second);
    expect(backend.getAttempts).toEqual([
      CURRENT_STORAGE_KEY,
      LEGACY_STORAGE_KEY,
      CURRENT_STORAGE_KEY,
      LEGACY_STORAGE_KEY,
    ]);
    expect([...backend.values.entries()]).toEqual(durableBefore);
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeAttempts).toEqual([]);
    expect(dependencies.now).toHaveBeenCalledTimes(0);
    expect(dependencies.idGenerator).toHaveBeenCalledTimes(0);
  });

  it('returns two detached unreadable records with exact reads and no payload disclosure', async () => {
    const raw = '{"secret":"SECRET_INSPECTION"';
    const backend = new ControlledBackend(
      new Map([[CURRENT_STORAGE_KEY, raw]]),
    );
    const dependencies = makeDependencies();
    const storage = createManagedStorage(backend, dependencies.dependencies);
    const durableBefore = [...backend.values.entries()];

    const first = await inspectStorage(storage);
    expect(first).toEqual({
      state: 'unreadable',
      sourceKey: CURRENT_STORAGE_KEY,
      category: 'MALFORMED_JSON',
    });
    expect(JSON.stringify(first)).not.toContain('SECRET_INSPECTION');
    expect(backend.getAttempts).toEqual([
      CURRENT_STORAGE_KEY,
      LEGACY_STORAGE_KEY,
    ]);
    const eventsBeforeMutation = backend.events.length;
    for (const field of Object.keys(first)) {
      expect(Reflect.set(first, field, `MUTATED_${field}`)).toBe(true);
    }
    expect(backend.events).toHaveLength(eventsBeforeMutation);
    expect([...backend.values.entries()]).toEqual(durableBefore);

    const second = await inspectStorage(storage);
    expect(second).toEqual({
      state: 'unreadable',
      sourceKey: CURRENT_STORAGE_KEY,
      category: 'MALFORMED_JSON',
    });
    expectNoSharedMutableReferences(first, second);
    expect(JSON.stringify(second)).not.toContain('SECRET_INSPECTION');
    expect(backend.getAttempts).toEqual([
      CURRENT_STORAGE_KEY,
      LEGACY_STORAGE_KEY,
      CURRENT_STORAGE_KEY,
      LEGACY_STORAGE_KEY,
    ]);
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(raw);
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeAttempts).toEqual([]);
    expect(dependencies.now).toHaveBeenCalledTimes(0);
    expect(dependencies.idGenerator).toHaveBeenCalledTimes(0);
  });

  it('returns two detached conflict records and preserves both secret-bearing byte strings', async () => {
    const currentSecret = 'SECRET_INSPECT_CONFLICT_CURRENT';
    const legacySecret = 'SECRET_INSPECT_CONFLICT_LEGACY';
    const currentRaw = currentEnvelope([makeTask(currentSecret)]);
    const legacyRaw = legacyRawArray([makeTask(legacySecret)]);
    const backend = new ControlledBackend(
      new Map([
        [CURRENT_STORAGE_KEY, currentRaw],
        [LEGACY_STORAGE_KEY, legacyRaw],
      ]),
    );
    const dependencies = makeDependencies();
    const storage = createManagedStorage(backend, dependencies.dependencies);
    const durableBefore = [...backend.values.entries()];

    const first = await inspectStorage(storage);
    expect(first).toEqual({
      state: 'conflict',
      currentKey: CURRENT_STORAGE_KEY,
      legacyKey: LEGACY_STORAGE_KEY,
    });
    expect(JSON.stringify(first)).not.toContain(currentSecret);
    expect(JSON.stringify(first)).not.toContain(legacySecret);
    expect(backend.getAttempts).toEqual([
      CURRENT_STORAGE_KEY,
      LEGACY_STORAGE_KEY,
    ]);
    const eventsBeforeMutation = backend.events.length;
    for (const field of Object.keys(first)) {
      expect(Reflect.set(first, field, `MUTATED_${field}`)).toBe(true);
    }
    expect(backend.events).toHaveLength(eventsBeforeMutation);
    expect([...backend.values.entries()]).toEqual(durableBefore);

    const second = await inspectStorage(storage);
    expect(second).toEqual({
      state: 'conflict',
      currentKey: CURRENT_STORAGE_KEY,
      legacyKey: LEGACY_STORAGE_KEY,
    });
    expectNoSharedMutableReferences(first, second);
    expect(JSON.stringify(second)).not.toContain(currentSecret);
    expect(JSON.stringify(second)).not.toContain(legacySecret);
    expect(backend.getAttempts).toEqual([
      CURRENT_STORAGE_KEY,
      LEGACY_STORAGE_KEY,
      CURRENT_STORAGE_KEY,
      LEGACY_STORAGE_KEY,
    ]);
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(currentRaw);
    expect(backend.raw(LEGACY_STORAGE_KEY)).toBe(legacyRaw);
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeAttempts).toEqual([]);
    expect(dependencies.now).toHaveBeenCalledTimes(0);
    expect(dependencies.idGenerator).toHaveBeenCalledTimes(0);
  });

  it('retains an inspection backend read failure as the exact cause', async () => {
    const backend = new ControlledBackend();
    const failure = new Error('INSPECT_READ_FAILED');
    backend.failNext('get', CURRENT_STORAGE_KEY, failure);
    const storage = createManagedStorage(
      backend,
      makeDependencies().dependencies,
    );

    await expect(inspectStorage(storage)).rejects.toMatchObject({
      code: 'TASK_STORAGE_READ_FAILED',
      message: 'TASK_STORAGE_READ_FAILED',
      cause: failure,
    });
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeAttempts).toEqual([]);
  });
});
