import {
  completedSession,
  expectRejectCode,
  interruptedSession,
  loadPersistentProduction,
  makeSession,
  MemoryFocusBackend,
} from './focusSessionTestKit';

function envelope(
  schema: unknown,
  version: unknown,
  sessions: readonly unknown[],
): string {
  return JSON.stringify({schema, version, sessions});
}

async function expectRejectedSnapshotRoot(
  value: unknown,
  code:
    | 'FOCUS_SESSION_SNAPSHOT_UNSUPPORTED'
    | 'FOCUS_SESSION_SNAPSHOT_INVALID',
): Promise<void> {
  const production = loadPersistentProduction();
  const backend = new MemoryFocusBackend();
  const raw = JSON.stringify(value);
  if (raw === undefined) {
    throw new Error('FOCUS_SESSION_TEST_ROOT_NOT_SERIALIZABLE');
  }
  backend.putRaw(production.storageKey, raw);
  const repository = production.createRepository(
    production.createStorage(backend),
  );

  await expectRejectCode(repository.load(), code);
  expect(backend.raw(production.storageKey)).toBe(raw);
  expect(backend.writes).toEqual([]);
  expect(backend.deletes).toEqual([]);

  backend.putRaw(
    production.storageKey,
    envelope(production.schema, production.version, []),
  );
  await expect(repository.load()).resolves.toEqual([]);
  expect(backend.writes).toEqual([]);
  expect(backend.deletes).toEqual([]);
}

function withoutSessionField(field: string): object {
  return Object.fromEntries(
    Object.entries(makeSession()).filter(([key]) => key !== field),
  );
}

const REQUIRED_SESSION_FIELDS = [
  'id',
  'taskId',
  'plannedMinutes',
  'status',
  'startedAt',
  'plannedEndAt',
  'endedAt',
  'actualSeconds',
  'interruptionReason',
  'createdAt',
  'updatedAt',
] as const;

describe('GAP-P0-02B persistent snapshot validation and version boundary', () => {
  it('round-trips valid running, completed, and interrupted records across a fresh backend facade', async () => {
    const production = loadPersistentProduction();
    const backend = new MemoryFocusBackend();
    const sessions = [
      completedSession({id: 'focus-completed'}),
      interruptedSession({id: 'focus-interrupted'}),
      makeSession({id: 'focus-running'}),
    ];
    const writer = production.createRepository(
      production.createStorage(backend),
    );
    await writer.transaction(async transaction => {
      for (const session of sessions) {
        await transaction.save(session);
      }
    });

    const reader = production.createRepository(
      production.createStorage(backend.fork()),
    );
    await expect(reader.load()).resolves.toEqual(sessions);
  });

  it('classifies malformed JSON as corrupt without rewriting or deleting it', async () => {
    const production = loadPersistentProduction();
    const backend = new MemoryFocusBackend();
    backend.putRaw(production.storageKey, '{not-json');
    const repository = production.createRepository(
      production.createStorage(backend),
    );

    await expectRejectCode(
      repository.load(),
      'FOCUS_SESSION_SNAPSHOT_CORRUPT',
    );

    expect(backend.raw(production.storageKey)).toBe('{not-json');
    expect(backend.writes).toEqual([]);
    expect(backend.deletes).toEqual([]);
  });

  it.each([
    {name: 'null', value: null},
    {name: 'array', value: []},
    {name: 'number', value: 7},
    {name: 'string', value: 'snapshot'},
    {name: 'boolean', value: true},
  ])('rejects non-object snapshot root $name as unsupported', async testCase => {
    await expectRejectedSnapshotRoot(
      testCase.value,
      'FOCUS_SESSION_SNAPSHOT_UNSUPPORTED',
    );
  });

  it.each([
    {name: 'different schema', value: {schema: 'other.schema', version: 1, sessions: []}},
    {name: 'version zero', value: {schema: 'start-five.focus-sessions', version: 0, sessions: []}},
    {name: 'future version', value: {schema: 'start-five.focus-sessions', version: 2, sessions: []}},
    {name: 'missing schema', value: {version: 1, sessions: []}},
    {name: 'missing version', value: {schema: 'start-five.focus-sessions', sessions: []}},
    {name: 'numeric schema', value: {schema: 1, version: 1, sessions: []}},
    {name: 'string version', value: {schema: 'start-five.focus-sessions', version: '1', sessions: []}},
    {name: 'null version', value: {schema: 'start-five.focus-sessions', version: null, sessions: []}},
    {name: 'boolean version', value: {schema: 'start-five.focus-sessions', version: true, sessions: []}},
    {name: 'fractional version', value: {schema: 'start-five.focus-sessions', version: 1.5, sessions: []}},
  ])('rejects unsupported snapshot identity: $name', async testCase => {
    await expectRejectedSnapshotRoot(
      testCase.value,
      'FOCUS_SESSION_SNAPSHOT_UNSUPPORTED',
    );
  });

  it.each([
    {name: 'extra envelope key', value: {schema: 'start-five.focus-sessions', version: 1, sessions: [], extra: true}},
    {name: 'missing sessions', value: {schema: 'start-five.focus-sessions', version: 1}},
    {name: 'null sessions', value: {schema: 'start-five.focus-sessions', version: 1, sessions: null}},
    {name: 'string sessions', value: {schema: 'start-five.focus-sessions', version: 1, sessions: 'sessions'}},
    {name: 'number sessions', value: {schema: 'start-five.focus-sessions', version: 1, sessions: 7}},
    {name: 'boolean sessions', value: {schema: 'start-five.focus-sessions', version: 1, sessions: false}},
    {name: 'object sessions', value: {schema: 'start-five.focus-sessions', version: 1, sessions: {}}},
  ])('rejects invalid envelope shape: $name', async testCase => {
    await expectRejectedSnapshotRoot(
      testCase.value,
      'FOCUS_SESSION_SNAPSHOT_INVALID',
    );
  });

  it.each([
    {name: 'null', value: null},
    {name: 'array', value: []},
    {name: 'string', value: 'session'},
    {name: 'number', value: 7},
  ])('rejects a non-object session entry: $name', async testCase => {
    const production = loadPersistentProduction();
    const backend = new MemoryFocusBackend();
    backend.putRaw(
      production.storageKey,
      envelope(production.schema, production.version, [testCase.value]),
    );
    const repository = production.createRepository(
      production.createStorage(backend),
    );

    await expectRejectCode(
      repository.load(),
      'FOCUS_SESSION_SNAPSHOT_INVALID',
    );
    expect(backend.writes).toEqual([]);
  });

  it.each(REQUIRED_SESSION_FIELDS)(
    'rejects an otherwise-valid running record missing %s',
    async field => {
      const production = loadPersistentProduction();
      const backend = new MemoryFocusBackend();
      backend.putRaw(
        production.storageKey,
        envelope(production.schema, production.version, [
          withoutSessionField(field),
        ]),
      );
      const repository = production.createRepository(
        production.createStorage(backend),
      );

      await expectRejectCode(
        repository.load(),
        'FOCUS_SESSION_SNAPSHOT_INVALID',
      );
      expect(backend.writes).toEqual([]);
    },
  );

  it.each([
    {name: 'blank ID', mutate: {id: '   '}},
    {name: 'ID has surrounding whitespace', mutate: {id: ' focus-001 '}},
    {name: 'control character in ID', mutate: {id: 'focus\ninvalid'}},
    {name: 'blank task ID', mutate: {taskId: ''}},
    {name: 'task ID has surrounding whitespace', mutate: {taskId: ' task-001 '}},
    {name: 'control character in task ID', mutate: {taskId: 'task\tinvalid'}},
    {name: 'unsupported duration', mutate: {plannedMinutes: 10}},
    {name: 'ID has wrong type', mutate: {id: 7}},
    {name: 'task ID has wrong type', mutate: {taskId: false}},
    {name: 'duration has wrong type', mutate: {plannedMinutes: '5'}},
    {name: 'status is illegal', mutate: {status: 'paused'}},
    {name: 'startedAt has wrong type', mutate: {startedAt: 1}},
    {name: 'plannedEndAt has wrong type', mutate: {plannedEndAt: null}},
    {name: 'createdAt has wrong type', mutate: {createdAt: false}},
    {name: 'updatedAt has wrong type', mutate: {updatedAt: {}}},
    {name: 'noncanonical startedAt', mutate: {startedAt: '2026-08-05T08:00:00Z'}},
    {name: 'noncanonical plannedEndAt', mutate: {plannedEndAt: '2026-08-05T08:05:00Z'}},
    {name: 'noncanonical createdAt', mutate: {createdAt: '2026-08-05T08:00:00Z'}},
    {name: 'noncanonical running updatedAt', mutate: {updatedAt: '2026-08-05T08:00:00Z'}},
    {name: 'incorrect planned end', mutate: {plannedEndAt: '2026-08-05T08:04:59.999Z'}},
    {name: 'running terminal timestamp', mutate: {endedAt: '2026-08-05T08:01:00.000Z'}},
    {name: 'running measured seconds', mutate: {actualSeconds: 60}},
    {name: 'running reason', mutate: {interruptionReason: 'reason'}},
    {name: 'createdAt differs from start', mutate: {createdAt: '2026-08-05T07:59:59.000Z'}},
    {name: 'running updatedAt differs from start', mutate: {updatedAt: '2026-08-05T08:00:01.000Z'}},
    {name: 'unknown property', mutate: {extra: true}},
  ])('rejects invalid running record: $name', async testCase => {
    const production = loadPersistentProduction();
    const backend = new MemoryFocusBackend();
    const invalid = {...makeSession(), ...testCase.mutate};
    backend.putRaw(
      production.storageKey,
      envelope(production.schema, production.version, [invalid]),
    );
    const repository = production.createRepository(
      production.createStorage(backend),
    );

    await expectRejectCode(
      repository.load(),
      'FOCUS_SESSION_SNAPSHOT_INVALID',
    );
  });

  it.each([
    {name: 'completed missing end', mutate: {endedAt: null}},
    {name: 'completed missing seconds', mutate: {actualSeconds: null}},
    {name: 'completed negative seconds', mutate: {actualSeconds: -1}},
    {name: 'completed fractional seconds', mutate: {actualSeconds: 1.5}},
    {name: 'completed exceeds plan', mutate: {actualSeconds: 301}},
    {name: 'completed seconds disagree with elapsed time', mutate: {actualSeconds: 299}},
    {name: 'completed reason', mutate: {interruptionReason: 'not allowed'}},
    {name: 'completed endedAt has wrong type', mutate: {endedAt: 5}},
    {name: 'completed seconds have wrong type', mutate: {actualSeconds: '300'}},
    {name: 'completed noncanonical endedAt', mutate: {endedAt: '2026-08-05T08:05:00Z', updatedAt: '2026-08-05T08:05:00Z'}},
    {name: 'completed noncanonical updatedAt', mutate: {updatedAt: '2026-08-05T08:05:00Z'}},
    {name: 'completed end precedes start with negative elapsed seconds', mutate: {endedAt: '2026-08-05T07:59:59.000Z', actualSeconds: -1, updatedAt: '2026-08-05T07:59:59.000Z'}},
    {name: 'completed update differs from end', mutate: {updatedAt: '2026-08-05T08:04:59.000Z'}},
    {name: 'completed end after plan', mutate: {endedAt: '2026-08-05T08:05:00.001Z', updatedAt: '2026-08-05T08:05:00.001Z'}},
  ])('rejects invalid completed record: $name', async testCase => {
    const production = loadPersistentProduction();
    const backend = new MemoryFocusBackend();
    const invalid = {...completedSession(), ...testCase.mutate};
    backend.putRaw(
      production.storageKey,
      envelope(production.schema, production.version, [invalid]),
    );
    const repository = production.createRepository(
      production.createStorage(backend),
    );

    await expectRejectCode(
      repository.load(),
      'FOCUS_SESSION_SNAPSHOT_INVALID',
    );
  });

  it.each([
    {name: 'interrupted missing reason', mutate: {interruptionReason: null}},
    {name: 'interrupted blank reason', mutate: {interruptionReason: '   '}},
    {name: 'interrupted reason has surrounding whitespace', mutate: {interruptionReason: ' reason '}},
    {name: 'interrupted reason has wrong type', mutate: {interruptionReason: 3}},
    {name: 'interrupted missing end', mutate: {endedAt: null}},
    {name: 'interrupted missing seconds', mutate: {actualSeconds: null}},
    {name: 'interrupted end precedes start', mutate: {endedAt: '2026-08-05T07:59:59.000Z', actualSeconds: 0, updatedAt: '2026-08-05T07:59:59.000Z'}},
    {name: 'interrupted noncanonical endedAt', mutate: {endedAt: '2026-08-05T08:01:30Z'}},
    {name: 'interrupted noncanonical updatedAt', mutate: {updatedAt: '2026-08-05T08:01:30Z'}},
    {name: 'interrupted negative seconds', mutate: {actualSeconds: -1}},
    {name: 'interrupted fractional seconds', mutate: {actualSeconds: 90.5}},
    {name: 'interrupted seconds have wrong type', mutate: {actualSeconds: '90'}},
    {name: 'interrupted seconds disagree with elapsed time', mutate: {actualSeconds: 89}},
    {name: 'interrupted at deadline', mutate: {endedAt: '2026-08-05T08:05:00.000Z', actualSeconds: 300, updatedAt: '2026-08-05T08:05:00.000Z'}},
  ])('rejects invalid interrupted record: $name', async testCase => {
    const production = loadPersistentProduction();
    const backend = new MemoryFocusBackend();
    const invalid = {...interruptedSession(), ...testCase.mutate};
    backend.putRaw(
      production.storageKey,
      envelope(production.schema, production.version, [invalid]),
    );
    const repository = production.createRepository(
      production.createStorage(backend),
    );

    await expectRejectCode(
      repository.load(),
      'FOCUS_SESSION_SNAPSHOT_INVALID',
    );
  });

  it.each([
    {
      name: 'duplicate IDs',
      sessions: [
        completedSession({id: 'duplicate'}),
        interruptedSession({id: 'duplicate'}),
      ],
    },
    {
      name: 'two running sessions',
      sessions: [
        makeSession({id: 'focus-a', taskId: 'task-a'}),
        makeSession({id: 'focus-b', taskId: 'task-b'}),
      ],
    },
  ])('rejects invalid cross-record invariant: $name', async testCase => {
    const production = loadPersistentProduction();
    const backend = new MemoryFocusBackend();
    backend.putRaw(
      production.storageKey,
      envelope(production.schema, production.version, testCase.sessions),
    );
    const repository = production.createRepository(
      production.createStorage(backend),
    );

    await expectRejectCode(
      repository.load(),
      'FOCUS_SESSION_SNAPSHOT_INVALID',
    );
  });

  it('wraps backend read and write failures with stable public codes and preserves the cause', async () => {
    const production = loadPersistentProduction();
    const readBackend = new MemoryFocusBackend();
    readBackend.failNextRead();
    const reader = production.createRepository(
      production.createStorage(readBackend),
    );
    const readError = await expectRejectCode(
      reader.load(),
      'FOCUS_SESSION_STORAGE_READ_FAILED',
    );
    expect(readError).toMatchObject({cause: {code: 'BACKEND_READ_SENTINEL'}});

    const writeBackend = new MemoryFocusBackend();
    writeBackend.failNextWrite();
    const writer = production.createRepository(
      production.createStorage(writeBackend),
    );
    const writeError = await expectRejectCode(
      writer.save(completedSession()),
      'FOCUS_SESSION_STORAGE_WRITE_FAILED',
    );
    expect(writeError).toMatchObject({cause: {code: 'BACKEND_WRITE_SENTINEL'}});
    expect(writeBackend.raw(production.storageKey)).toBeNull();
  });
});
