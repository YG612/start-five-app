import type {FocusSessionTransaction} from '../../src/data/focusSessionRepository';
import {
  completedSession,
  createDeferred,
  drainMicrotasks,
  expectRejectCode,
  expectWriteBarrierBeforeSettlement,
  interruptedSession,
  loadPersistentProduction,
  makeSession,
  MemoryFocusBackend,
} from './focusSessionTestKit';

async function expectExpiredTransaction(
  transaction: FocusSessionTransaction,
): Promise<void> {
  await expectRejectCode(
    transaction.load(),
    'FOCUS_SESSION_REPOSITORY_TRANSACTION_EXPIRED',
  );
  await expectRejectCode(
    transaction.list(),
    'FOCUS_SESSION_REPOSITORY_TRANSACTION_EXPIRED',
  );
  await expectRejectCode(
    transaction.get('focus-any'),
    'FOCUS_SESSION_REPOSITORY_TRANSACTION_EXPIRED',
  );
  await expectRejectCode(
    transaction.save(completedSession({id: 'focus-late'})),
    'FOCUS_SESSION_REPOSITORY_TRANSACTION_EXPIRED',
  );
}

describe('GAP-P0-02B concrete focus-session repository persistence', () => {
  it('owns stable repository/storage keys and a current versioned envelope identity', () => {
    const production = loadPersistentProduction();

    expect(production).toMatchObject({
      defaultRepositoryKey: 'start-five.focus-sessions.v1',
      storageKey: 'start-five.focus-sessions.v1',
      schema: 'start-five.focus-sessions',
      version: 1,
    });
  });

  it('loads a missing durable snapshot as empty with one backend read and no write', async () => {
    const production = loadPersistentProduction();
    const backend = new MemoryFocusBackend();
    const repository = production.createRepository(
      production.createStorage(backend),
    );

    await expect(repository.load()).resolves.toEqual([]);
    await expect(repository.list()).resolves.toEqual([]);

    expect(backend.reads).toEqual([production.storageKey]);
    expect(backend.writes).toEqual([]);
    expect(backend.deletes).toEqual([]);
  });

  it('persists direct saves in the exact versioned envelope and supports get/list filtering', async () => {
    const production = loadPersistentProduction();
    const backend = new MemoryFocusBackend();
    const repository = production.createRepository(
      production.createStorage(backend),
    );
    const first = completedSession({id: 'focus-a', taskId: 'task-a'});
    const second = interruptedSession({id: 'focus-b', taskId: 'task-b'});

    await repository.save(first);
    await repository.save(second);

    const raw = backend.raw(production.storageKey);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw ?? '')).toEqual({
      schema: production.schema,
      version: production.version,
      sessions: [first, second],
    });
    await expect(repository.get(first.id)).resolves.toEqual(first);
    await expect(repository.get('focus-missing')).resolves.toBeNull();
    await expect(repository.list('task-b')).resolves.toEqual([second]);
    expect(backend.writes).toHaveLength(2);
  });

  it('detaches save input and every direct read result from committed state', async () => {
    const production = loadPersistentProduction();
    const backend = new MemoryFocusBackend();
    const repository = production.createRepository(
      production.createStorage(backend),
    );
    const original = completedSession();
    const callerOwned = {...original};

    const saved = await repository.save(callerOwned);
    Object.assign(callerOwned, {taskId: 'mutated-save-input'});
    Object.assign(saved, {taskId: 'mutated-save-result'});
    const loaded = await repository.load();
    Object.assign(loaded[0] ?? {}, {taskId: 'mutated-load-result'});
    Object.assign(loaded, {0: interruptedSession({id: 'injected'})});

    await expect(repository.get(original.id)).resolves.toEqual(original);
    await expect(repository.list()).resolves.toEqual([original]);
    expect(JSON.parse(backend.raw(production.storageKey) ?? '')).toMatchObject({
      sessions: [original],
    });
  });

  it.each(['direct', 'transaction'] as const)(
    'captures a fresh %s save input at its invocation boundary before caller mutation',
    async path => {
      const production = loadPersistentProduction();
      const backend = new MemoryFocusBackend();
      const repository = production.createRepository(
        production.createStorage(backend),
      );
      const original = completedSession({
        id: `focus-call-boundary-${path}`,
        taskId: 'task-at-invocation',
      });
      const callerOwned = {...original};
      const writeBarrier = backend.blockNextWrite();
      let stagedAtInvocation: readonly typeof original[] | null = null;
      let operation: Promise<typeof original>;

      if (path === 'direct') {
        operation = repository.save(callerOwned);
        Object.assign(callerOwned, {taskId: 'mutated-after-direct-call'});
      } else {
        operation = repository.transaction(async transaction => {
          const pendingSave = transaction.save(callerOwned);
          Object.assign(callerOwned, {taskId: 'mutated-after-transaction-call'});
          const returned = await pendingSave;
          stagedAtInvocation = await transaction.load();
          return returned;
        });
      }

      try {
        await expectWriteBarrierBeforeSettlement(writeBarrier, operation);
        expect(backend.raw(production.storageKey)).toBeNull();
      } finally {
        writeBarrier.release();
      }

      const returned = await operation;
      expect(returned).toEqual(original);
      if (path === 'transaction') {
        expect(stagedAtInvocation).toEqual([original]);
      }
      Object.assign(returned, {taskId: 'mutated-return-value'});
      await expect(repository.load()).resolves.toEqual([original]);
      expect(JSON.parse(backend.raw(production.storageKey) ?? '')).toEqual({
        schema: production.schema,
        version: production.version,
        sessions: [original],
      });
    },
  );

  it.each(['save', 'transaction'] as const)(
    'hydrates durable history before a first-call %s mutation on a fresh repository',
    async path => {
      const production = loadPersistentProduction();
      const backend = new MemoryFocusBackend();
      const writer = production.createRepository(
        production.createStorage(backend),
      );
      const initial = completedSession({id: 'focus-existing'});
      const next = interruptedSession({id: `focus-${path}`});
      await writer.save(initial);

      const freshBackend = backend.fork();
      const fresh = production.createRepository(
        production.createStorage(freshBackend),
      );
      if (path === 'save') {
        await fresh.save(next);
      } else {
        await fresh.transaction(transaction => transaction.save(next));
      }

      expect(freshBackend.reads).toEqual([production.storageKey]);
      await expect(fresh.load()).resolves.toEqual([initial, next]);
      expect(JSON.parse(backend.raw(production.storageKey) ?? '')).toEqual({
        schema: production.schema,
        version: production.version,
        sessions: [initial, next],
      });
      const verifier = production.createRepository(
        production.createStorage(backend.fork()),
      );
      await expect(verifier.load()).resolves.toEqual([initial, next]);
    },
  );

  it('commits multiple transaction saves in one durable write and returns detached records', async () => {
    const production = loadPersistentProduction();
    const backend = new MemoryFocusBackend();
    const repository = production.createRepository(
      production.createStorage(backend),
    );
    const first = completedSession({id: 'focus-a'});
    const second = interruptedSession({id: 'focus-b'});

    const returned = await repository.transaction(async transaction => {
      await transaction.save(first);
      return transaction.save(second);
    });

    expect(returned).toEqual(second);
    expect(backend.writes).toHaveLength(1);
    await expect(repository.load()).resolves.toEqual([first, second]);
    Object.assign(returned, {taskId: 'mutated'});
    await expect(repository.get(second.id)).resolves.toEqual(second);
  });

  it('detaches transaction read, save-input, and save-output objects from staged and committed state', async () => {
    const production = loadPersistentProduction();
    const backend = new MemoryFocusBackend();
    const repository = production.createRepository(
      production.createStorage(backend),
    );
    const initial = completedSession({id: 'focus-initial'});
    const next = interruptedSession({id: 'focus-next'});
    await repository.save(initial);

    await repository.transaction(async transaction => {
      const loaded = await transaction.load();
      const listed = await transaction.list(initial.taskId);
      const found = await transaction.get(initial.id);
      Object.assign(loaded[0] ?? {}, {taskId: 'mutated-load'});
      Object.assign(loaded, {0: interruptedSession({id: 'injected-load'})});
      Object.assign(listed[0] ?? {}, {taskId: 'mutated-list'});
      Object.assign(listed, {0: interruptedSession({id: 'injected-list'})});
      Object.assign(found ?? {}, {taskId: 'mutated-get'});

      const callerOwned = {...next};
      const saved = await transaction.save(callerOwned);
      Object.assign(callerOwned, {taskId: 'mutated-save-input'});
      Object.assign(saved, {taskId: 'mutated-save-output'});

      await expect(transaction.load()).resolves.toEqual([initial, next]);
      await expect(transaction.list(initial.taskId)).resolves.toEqual([initial]);
      await expect(transaction.get(next.id)).resolves.toEqual(next);
    });

    await expect(repository.load()).resolves.toEqual([initial, next]);
    expect(JSON.parse(backend.raw(production.storageKey) ?? '')).toMatchObject({
      sessions: [initial, next],
    });
  });

  it('performs no durable write for a read-only transaction', async () => {
    const production = loadPersistentProduction();
    const backend = new MemoryFocusBackend();
    const repository = production.createRepository(
      production.createStorage(backend),
    );

    await expect(
      repository.transaction(transaction => transaction.load()),
    ).resolves.toEqual([]);

    expect(backend.reads).toEqual([production.storageKey]);
    expect(backend.writes).toEqual([]);
  });

  it('rolls back a transaction callback failure with unchanged bytes and cache', async () => {
    const production = loadPersistentProduction();
    const backend = new MemoryFocusBackend();
    const repository = production.createRepository(
      production.createStorage(backend),
    );
    const initial = completedSession();
    await repository.save(initial);
    const before = backend.raw(production.storageKey);
    const writesBefore = backend.writes.length;
    let leaked: FocusSessionTransaction | undefined;

    await expectRejectCode(
      repository.transaction(async transaction => {
        leaked = transaction;
        await transaction.save(interruptedSession({id: 'focus-rollback'}));
        throw Object.assign(new Error('rollback'), {code: 'CALLBACK_ROLLBACK'});
      }),
      'CALLBACK_ROLLBACK',
    );

    expect(backend.raw(production.storageKey)).toBe(before);
    expect(backend.writes).toHaveLength(writesBefore);
    await expect(repository.load()).resolves.toEqual([initial]);
    expect(leaked).toBeDefined();
    if (leaked === undefined) {
      throw new Error('FAILED_TRANSACTION_SURFACE_NOT_CAPTURED');
    }
    await expectExpiredTransaction(leaked);

    const recovery = interruptedSession({id: 'focus-callback-recovery'});
    await expect(repository.save(recovery)).resolves.toEqual(recovery);
    await expect(repository.load()).resolves.toEqual([initial, recovery]);
  });

  it('rolls back backend write failure in cache and bytes, then permits retry and a fresh view', async () => {
    const production = loadPersistentProduction();
    const backend = new MemoryFocusBackend();
    const repository = production.createRepository(
      production.createStorage(backend),
    );
    const initial = completedSession();
    const next = interruptedSession({id: 'focus-next'});
    await repository.save(initial);
    const before = backend.raw(production.storageKey);
    backend.failNextWrite();

    await expectRejectCode(
      repository.save(next),
      'FOCUS_SESSION_STORAGE_WRITE_FAILED',
    );

    expect(backend.raw(production.storageKey)).toBe(before);
    await expect(repository.load()).resolves.toEqual([initial]);
    const freshRepository = production.createRepository(
      production.createStorage(backend.fork()),
    );
    await expect(freshRepository.load()).resolves.toEqual([initial]);

    await expect(repository.save(next)).resolves.toEqual(next);
    await expect(freshRepository.load()).resolves.toEqual([initial]);
    const trulyFresh = production.createRepository(
      production.createStorage(backend.fork()),
    );
    await expect(trulyFresh.load()).resolves.toEqual([initial, next]);
  });

  it('does not cache a backend read failure and succeeds on retry', async () => {
    const production = loadPersistentProduction();
    const backend = new MemoryFocusBackend();
    backend.failNextRead();
    const repository = production.createRepository(
      production.createStorage(backend),
    );

    await expectRejectCode(
      repository.load(),
      'FOCUS_SESSION_STORAGE_READ_FAILED',
    );
    await expect(repository.load()).resolves.toEqual([]);

    expect(backend.reads).toEqual([
      production.storageKey,
      production.storageKey,
    ]);
  });

  it('expires a transaction surface after callback completion', async () => {
    const production = loadPersistentProduction();
    const repository = production.createRepository(
      production.createStorage(new MemoryFocusBackend()),
    );
    let leaked:
      | Parameters<Parameters<typeof repository.transaction>[0]>[0]
      | undefined;

    await repository.transaction(async transaction => {
      leaked = transaction;
      await transaction.load();
    });
    expect(leaked).toBeDefined();
    if (leaked === undefined) {
      throw new Error('TRANSACTION_SURFACE_NOT_CAPTURED');
    }

    await expectExpiredTransaction(leaked);
  });

  it('rejects direct save and nested transaction during the callback synchronous segment and recovers its queue', async () => {
    const production = loadPersistentProduction();
    const backend = new MemoryFocusBackend();
    const repository = production.createRepository(
      production.createStorage(backend),
    );
    const first = completedSession();

    await repository.transaction(async transaction => {
      const directSave = repository.save(first);
      const nestedTransaction = repository.transaction(nested => nested.load());
      await expectRejectCode(
        directSave,
        'FOCUS_SESSION_REPOSITORY_REENTRANT_MUTATION',
      );
      await expectRejectCode(
        nestedTransaction,
        'FOCUS_SESSION_REPOSITORY_REENTRANT_MUTATION',
      );
      await expect(transaction.load()).resolves.toEqual([]);
    });
    expect(backend.writes).toEqual([]);

    await expect(repository.save(first)).resolves.toEqual(first);
    await expect(repository.load()).resolves.toEqual([first]);
  });

  it('treats a facade call issued after the callback first await as external FIFO work', async () => {
    const production = loadPersistentProduction();
    const backend = new MemoryFocusBackend();
    const repository = production.createRepository(
      production.createStorage(backend),
    );
    const queuedSession = completedSession({id: 'focus-after-await'});
    let queuedSave: Promise<ReturnType<typeof completedSession>> | undefined;

    await repository.transaction(async transaction => {
      await transaction.load();
      queuedSave = repository.save(queuedSession);
    });
    expect(queuedSave).toBeDefined();
    if (queuedSave === undefined) {
      throw new Error('POST_AWAIT_FACADE_SAVE_NOT_CAPTURED');
    }
    await expect(queuedSave).resolves.toEqual(queuedSession);

    expect(backend.writes).toHaveLength(1);
    await expect(repository.load()).resolves.toEqual([queuedSession]);
  });

  it('queues external same-facade mutation behind an active transaction and commits both in FIFO order', async () => {
    const production = loadPersistentProduction();
    const backend = new MemoryFocusBackend();
    const repository = production.createRepository(
      production.createStorage(backend),
    );
    const transactionSession = completedSession({id: 'focus-transaction'});
    const externalSession = interruptedSession({id: 'focus-external'});
    const entered = createDeferred<void>();
    const release = createDeferred<void>();

    const transactionPromise = repository.transaction(async transaction => {
      await transaction.save(transactionSession);
      entered.resolve(undefined);
      await release.promise;
    });
    await entered.promise;
    let externalSettled = false;
    const externalPromise = repository.save(externalSession).then(result => {
      externalSettled = true;
      return result;
    });
    await drainMicrotasks();
    expect(externalSettled).toBe(false);

    release.resolve(undefined);
    await transactionPromise;
    await expect(externalPromise).resolves.toEqual(externalSession);

    expect(backend.writes).toHaveLength(2);
    await expect(repository.load()).resolves.toEqual([
      transactionSession,
      externalSession,
    ]);
  });

  it('rolls back a staged valid save followed by invalid data without a durable write', async () => {
    const production = loadPersistentProduction();
    const backend = new MemoryFocusBackend();
    const repository = production.createRepository(
      production.createStorage(backend),
    );
    const initial = completedSession({id: 'focus-initial'});
    const stagedValid = interruptedSession({id: 'focus-valid'});
    const stagedInvalid = makeSession({
      id: 'focus-invalid',
      plannedEndAt: '2026-08-05T08:04:59.999Z',
    });
    await repository.save(initial);
    const rawBefore = backend.raw(production.storageKey);
    const writesBefore = backend.writes.length;
    let leaked: FocusSessionTransaction | undefined;

    await expectRejectCode(
      repository.transaction(async transaction => {
        leaked = transaction;
        await transaction.save(stagedValid);
        await transaction.save(stagedInvalid);
      }),
      'FOCUS_SESSION_SNAPSHOT_INVALID',
    );

    expect(backend.raw(production.storageKey)).toBe(rawBefore);
    expect(backend.writes).toHaveLength(writesBefore);
    await expect(repository.load()).resolves.toEqual([initial]);
    expect(leaked).toBeDefined();
    if (leaked === undefined) {
      throw new Error('INVALID_TRANSACTION_SURFACE_NOT_CAPTURED');
    }
    await expectExpiredTransaction(leaked);

    const recovery = interruptedSession({id: 'focus-validation-recovery'});
    await expect(repository.save(recovery)).resolves.toEqual(recovery);
    await expect(repository.load()).resolves.toEqual([initial, recovery]);
  });

  it('rolls back every staged save when the single transaction commit fails', async () => {
    const production = loadPersistentProduction();
    const backend = new MemoryFocusBackend();
    const repository = production.createRepository(
      production.createStorage(backend),
    );
    const initial = completedSession({id: 'focus-initial'});
    const first = completedSession({id: 'focus-first'});
    const second = interruptedSession({id: 'focus-second'});
    await repository.save(initial);
    const rawBefore = backend.raw(production.storageKey);
    const writesBefore = backend.writes.length;
    backend.failNextWrite();
    let leaked: FocusSessionTransaction | undefined;

    await expectRejectCode(
      repository.transaction(async transaction => {
        leaked = transaction;
        await transaction.save(first);
        await transaction.save(second);
      }),
      'FOCUS_SESSION_STORAGE_WRITE_FAILED',
    );

    expect(backend.raw(production.storageKey)).toBe(rawBefore);
    expect(backend.writes).toHaveLength(writesBefore + 1);
    await expect(repository.load()).resolves.toEqual([initial]);
    const fresh = production.createRepository(
      production.createStorage(backend.fork()),
    );
    await expect(fresh.load()).resolves.toEqual([initial]);
    expect(leaked).toBeDefined();
    if (leaked === undefined) {
      throw new Error('COMMIT_FAILED_TRANSACTION_SURFACE_NOT_CAPTURED');
    }
    await expectExpiredTransaction(leaked);

    const recovery = interruptedSession({id: 'focus-commit-recovery'});
    await expect(repository.save(recovery)).resolves.toEqual(recovery);
    const verifier = production.createRepository(
      production.createStorage(backend.fork()),
    );
    await expect(verifier.load()).resolves.toEqual([initial, recovery]);
  });

  it('isolates explicit repository keys over one backend', async () => {
    const production = loadPersistentProduction();
    const backend = new MemoryFocusBackend();
    const storage = production.createStorage(backend);
    const left = production.createRepository(storage, 'focus-left');
    const right = production.createRepository(storage, 'focus-right');
    const session = completedSession();

    await left.save(session);

    await expect(left.load()).resolves.toEqual([session]);
    await expect(right.load()).resolves.toEqual([]);
    expect(backend.raw('focus-left')).not.toBeNull();
    expect(backend.raw('focus-right')).toBeNull();
  });

  it('rejects a second simultaneous running record at the repository invariant boundary', async () => {
    const production = loadPersistentProduction();
    const repository = production.createRepository(
      production.createStorage(new MemoryFocusBackend()),
    );
    await repository.save(makeSession({id: 'focus-a', taskId: 'task-a'}));

    await expectRejectCode(
      repository.save(makeSession({id: 'focus-b', taskId: 'task-b'})),
      'FOCUS_SESSION_SNAPSHOT_INVALID',
    );
    await expect(repository.load()).resolves.toHaveLength(1);
  });

  it('rejects direct rewrite of a committed terminal record, including reversal to running', async () => {
    const production = loadPersistentProduction();
    const backend = new MemoryFocusBackend();
    const repository = production.createRepository(
      production.createStorage(backend),
    );
    const terminal = completedSession({id: 'focus-terminal'});
    await repository.save(terminal);
    const writesAfterFirstTerminal = backend.writes.length;
    await expect(repository.save(terminal)).resolves.toEqual(terminal);
    expect(backend.writes).toHaveLength(writesAfterFirstTerminal);
    const before = backend.raw(production.storageKey);

    await expectRejectCode(
      repository.save(makeSession({id: terminal.id})),
      'FOCUS_SESSION_SNAPSHOT_INVALID',
    );
    await expectRejectCode(
      repository.save(
        interruptedSession({
          id: terminal.id,
          endedAt: '2026-08-05T08:01:00.000Z',
          actualSeconds: 60,
          updatedAt: '2026-08-05T08:01:00.000Z',
        }),
      ),
      'FOCUS_SESSION_SNAPSHOT_INVALID',
    );

    expect(backend.raw(production.storageKey)).toBe(before);
    await expect(repository.get(terminal.id)).resolves.toEqual(terminal);
  });

  it.each([
    {path: 'save', value: Number.POSITIVE_INFINITY},
    {path: 'save', value: Number.NEGATIVE_INFINITY},
    {path: 'save', value: Number.NaN},
    {path: 'transaction', value: Number.POSITIVE_INFINITY},
    {path: 'transaction', value: Number.NEGATIVE_INFINITY},
    {path: 'transaction', value: Number.NaN},
  ])('rejects non-finite actualSeconds through real repository $path without serialization coercion', async testCase => {
    const production = loadPersistentProduction();
    const backend = new MemoryFocusBackend();
    const repository = production.createRepository(
      production.createStorage(backend),
    );
    const initial = completedSession({id: 'focus-initial'});
    await repository.save(initial);
    await expect(repository.load()).resolves.toEqual([initial]);
    const rawBefore = backend.raw(production.storageKey);
    const writesBefore = backend.writes.length;
    const invalid = completedSession({
      id: `focus-invalid-${testCase.path}`,
      actualSeconds: testCase.value,
    });
    const operation =
      testCase.path === 'save'
        ? repository.save(invalid)
        : repository.transaction(transaction => transaction.save(invalid));

    await expectRejectCode(operation, 'FOCUS_SESSION_SNAPSHOT_INVALID');

    expect(backend.raw(production.storageKey)).toBe(rawBefore);
    expect(backend.writes).toHaveLength(writesBefore);
    await expect(repository.load()).resolves.toEqual([initial]);
    const fresh = production.createRepository(
      production.createStorage(backend.fork()),
    );
    await expect(fresh.load()).resolves.toEqual([initial]);
  });
});
