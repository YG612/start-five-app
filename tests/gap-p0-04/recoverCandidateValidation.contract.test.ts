import type {Task} from '../../src/domain/task';
import {assertValidTaskSnapshot} from '../../src/data/taskSnapshotValidation';
import {
  ControlledBackend,
  CURRENT_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  SNAPSHOT_SCHEMA,
  afterMicrotasks,
  backupKey,
  captureOutcome,
  cloneTask,
  createManagedStorage,
  currentEnvelope,
  currentEnvelopeObject,
  defaultEnvelopeObject,
  errorView,
  inspectStorage,
  legacyRawArray,
  makeAccessorCandidate,
  makeBehavioralCycleCandidate,
  makeCompletedTask,
  makeDeepBehavioralCandidate,
  makeDependencies,
  makeExactContainerCandidate,
  makeSparseCandidate,
  makeSubtask,
  makeSymbolCandidate,
  makeTask,
  makeTasksWithSubtaskCount,
  publicErrorText,
  recoverStorage,
  versionEnvelopeObject,
} from './taskDataRecoveryTestKit';

type InvalidCandidate = {
  name: string;
  build(): unknown;
  assertAfter?(): void;
  secret?: string;
};

function revokedCandidate(): unknown {
  const revocable = Proxy.revocable(
    currentEnvelopeObject([makeTask('revoked-proxy')]),
    {},
  );
  revocable.revoke();
  return revocable.proxy;
}

function throwingProxyCandidate(): unknown {
  return new Proxy(currentEnvelopeObject([makeTask('throwing-proxy')]), {
    getPrototypeOf() {
      throw new Error('SECRET_THROWING_PROXY_TRAP');
    },
  });
}

const accessorAudit = {calls: 0};

const invalidRootCandidates: readonly {
  name: string;
  candidate: unknown;
  secret?: string;
}[] = [
  {name: 'null root', candidate: null},
  {
    name: 'string primitive root',
    candidate: 'SECRET_RECOVER_STRING_ROOT',
    secret: 'SECRET_RECOVER_STRING_ROOT',
  },
  {name: 'number primitive root', candidate: 42},
  {name: 'boolean primitive root', candidate: true},
  {
    name: 'raw array containing a non-Task primitive',
    candidate: ['SECRET_RECOVER_ARRAY_MEMBER'],
    secret: 'SECRET_RECOVER_ARRAY_MEMBER',
  },
  {name: 'empty object root', candidate: {}},
  {
    name: 'otherwise shaped envelope missing tasks',
    candidate: {schema: SNAPSHOT_SCHEMA, version: 1},
  },
];

function invalidTaskEnvelope(
  id: string,
  mutate: (task: Task) => void,
): object {
  const task = makeTask(id);
  mutate(task);
  return currentEnvelopeObject([task]);
}

const invalidCandidates: readonly InvalidCandidate[] = [
  {
    name: 'an accessor on an otherwise legal Task',
    build() {
      accessorAudit.calls = 0;
      return makeAccessorCandidate(accessorAudit);
    },
    assertAfter() {
      expect(accessorAudit.calls).toBe(0);
    },
  },
  {name: 'a symbol key on an otherwise legal Task', build: makeSymbolCandidate},
  {name: 'a sparse but otherwise legal subtask array', build: makeSparseCandidate},
  {
    name: 'a behavioral cycle reached through a legal Task field',
    build() {
      return makeBehavioralCycleCandidate().candidate;
    },
  },
  {
    name: 'a legal Task whose behavioral field exceeds depth 256',
    build() {
      return makeDeepBehavioralCandidate(260);
    },
  },
  {name: 'a revoked Proxy', build: revokedCandidate},
  {
    name: 'a throwing Proxy',
    build: throwingProxyCandidate,
    secret: 'SECRET_THROWING_PROXY_TRAP',
  },
  {
    name: 'duplicate Task IDs',
    build() {
      const first = makeTask('SECRET_DUPLICATE_TASK');
      return currentEnvelopeObject([first, cloneTask(first)]);
    },
    secret: 'SECRET_DUPLICATE_TASK',
  },
  {
    name: 'duplicate Subtask IDs',
    build() {
      const task = makeTask('duplicate-subtask');
      const subtask = makeSubtask(task.id, 0);
      task.subtasks = [subtask, {...subtask}];
      return currentEnvelopeObject([task]);
    },
  },
  {
    name: 'updatedAt before createdAt',
    build() {
      return invalidTaskEnvelope('bad-timestamp', task => {
        task.updatedAt = '2026-08-05T06:59:59.000Z';
      });
    },
  },
  {
    name: 'pending lifecycle with startedAt',
    build() {
      return invalidTaskEnvelope('bad-lifecycle', task => {
        task.startedAt = task.createdAt;
      });
    },
  },
  {
    name: 'completed lifecycle without score',
    build() {
      const task = makeCompletedTask('scoreless-completion');
      task.score = null;
      task.scoreAwardedAt = null;
      return currentEnvelopeObject([task]);
    },
  },
  {
    name: 'fractional completion score',
    build() {
      const task = makeCompletedTask('fractional-score');
      task.score = 1.5;
      return currentEnvelopeObject([task]);
    },
  },
  {
    name: 'an otherwise legal pending caller candidate with NaN score',
    build() {
      const task = makeTask('SECRET_RECOVERY_NAN_SCORE');
      task.score = Number.NaN;
      task.scoreAwardedAt = null;
      return currentEnvelopeObject([task]);
    },
    secret: 'SECRET_RECOVERY_NAN_SCORE',
  },
  {
    name: 'an otherwise legal pending caller candidate with positive-infinity score',
    build() {
      const task = makeTask('SECRET_RECOVERY_POSITIVE_INFINITY_SCORE');
      task.score = Number.POSITIVE_INFINITY;
      task.scoreAwardedAt = null;
      return currentEnvelopeObject([task]);
    },
    secret: 'SECRET_RECOVERY_POSITIVE_INFINITY_SCORE',
  },
  {
    name: 'an otherwise legal pending caller candidate with negative-infinity score',
    build() {
      const task = makeTask('SECRET_RECOVERY_NEGATIVE_INFINITY_SCORE');
      task.score = Number.NEGATIVE_INFINITY;
      task.scoreAwardedAt = null;
      return currentEnvelopeObject([task]);
    },
    secret: 'SECRET_RECOVERY_NEGATIVE_INFINITY_SCORE',
  },
  {
    name: 'score timestamp mismatch',
    build() {
      const task = makeCompletedTask('score-time');
      task.scoreAwardedAt = '2026-08-05T07:09:00.000Z';
      return currentEnvelopeObject([task]);
    },
  },
  {
    name: 'scheduledStartAt inconsistent with startAt',
    build() {
      return currentEnvelopeObject([
        makeTask('planning-time-mismatch', {
          scheduledStartAt: '2026-08-05T10:00:00.000Z',
        }),
      ]);
    },
  },
  {
    name: 'nonpositive estimatedMinutes',
    build() {
      return currentEnvelopeObject([
        makeTask('planning-estimate-invalid', {estimatedMinutes: 0}),
      ]);
    },
  },
  {
    name: 'blank firstStep',
    build() {
      return currentEnvelopeObject([
        makeTask('planning-first-step-invalid', {firstStep: '   '}),
      ]);
    },
  },
  {
    name: 'Subtask created before parent',
    build() {
      const task = makeTask('child-before-parent');
      task.subtasks = [
        makeSubtask(task.id, 0, {createdAt: '2026-08-05T06:59:59.000Z'}),
      ];
      return currentEnvelopeObject([task]);
    },
  },
  {
    name: 'Subtask updated after parent',
    build() {
      const task = makeTask('child-after-parent');
      task.subtasks = [
        makeSubtask(task.id, 0, {updatedAt: '2026-08-05T07:00:01.000Z'}),
      ];
      return currentEnvelopeObject([task]);
    },
  },
  {
    name: 'foreign schema',
    build() {
      return {schema: 'SECRET_FOREIGN_SCHEMA', version: 1, tasks: []};
    },
    secret: 'SECRET_FOREIGN_SCHEMA',
  },
  {
    name: 'negative version',
    build() {
      return versionEnvelopeObject([makeTask('negative-version')], -1);
    },
  },
  {
    name: 'string version',
    build() {
      return versionEnvelopeObject([makeTask('string-version')], '1');
    },
  },
  {
    name: 'null version',
    build() {
      return versionEnvelopeObject([makeTask('null-version')], null);
    },
  },
  {
    name: 'fractional version',
    build() {
      return versionEnvelopeObject([makeTask('fractional-version')], 0.5);
    },
  },
  {
    name: 'future version',
    build() {
      return versionEnvelopeObject([makeTask('future-version')], 2);
    },
  },
  {
    name: 'extra current-envelope key',
    build() {
      return {...currentEnvelopeObject([makeTask('extra-key')]), extra: true};
    },
  },
  {
    name: 'extra V0-envelope key',
    build() {
      return {
        ...versionEnvelopeObject([makeTask('extra-v0-key')], 0),
        extra: true,
      };
    },
  },
  {
    name: 'extra default-envelope key',
    build() {
      return {
        ...defaultEnvelopeObject([makeTask('extra-default-key')]),
        extra: true,
      };
    },
  },
];

describe('GAP-P0-04 bounded recovery candidate validation', () => {
  it.each(invalidRootCandidates)(
    'rejects $name instead of treating it as an empty snapshot',
    async ({candidate, secret}) => {
      const key = backupKey('invalid-root-candidate');
      const backupRaw = 'SECRET_RECOVER_INVALID_ROOT_BACKUP';
      const backend = new ControlledBackend(new Map([[key, backupRaw]]));
      const dependencies = makeDependencies();
      const storage = createManagedStorage(backend, dependencies.dependencies);

      const outcome = await captureOutcome(
        Promise.resolve().then(() =>
          recoverStorage(storage, key, candidate),
        ),
      );

      expect(outcome.status).toBe('rejected');
      const error =
        outcome.status === 'rejected' ? outcome.error : undefined;
      expect(errorView(error)).toEqual({
        code: 'TASK_RECOVERY_CANDIDATE_INVALID',
        message: 'TASK_RECOVERY_CANDIDATE_INVALID',
        category: 'INVALID_SNAPSHOT',
        cause: undefined,
      });
      if (secret !== undefined) {
        expect(publicErrorText(error)).not.toContain(secret);
        expect(String(error)).not.toContain(secret);
      }
      expect(backend.events).toEqual([]);
      expect(backend.raw(CURRENT_STORAGE_KEY)).toBeNull();
      expect(backend.raw(key)).toBe(backupRaw);
      expect(backend.setAttempts).toEqual([]);
      expect(backend.removeAttempts).toEqual([]);
      expect(dependencies.now).toHaveBeenCalledTimes(0);
      expect(dependencies.idGenerator).toHaveBeenCalledTimes(0);
    },
  );

  it.each([
    {name: 'NaN', score: Number.NaN},
    {name: 'positive infinity', score: Number.POSITIVE_INFINITY},
    {name: 'negative infinity', score: Number.NEGATIVE_INFINITY},
  ])(
    'proves the $name fixture becomes a legal pending snapshot only after JSON null coercion',
    ({name, score}) => {
      const task = makeTask(`round-trip-${name.replaceAll(' ', '-')}`);
      task.score = score;
      task.scoreAwardedAt = null;
      const roundTripped: unknown = JSON.parse(JSON.stringify([task]));

      assertValidTaskSnapshot(roundTripped);

      expect(roundTripped).toHaveLength(1);
      expect(roundTripped[0]?.status).toBe('pending');
      expect(roundTripped[0]?.score).toBeNull();
      expect(roundTripped[0]?.scoreAwardedAt).toBeNull();
    },
  );

  it.each(invalidCandidates)(
    'rejects $name before all backend and recovery-dependency I/O',
    async ({build, assertAfter, secret}) => {
      const key = backupKey('invalid-candidate');
      const backend = new ControlledBackend(new Map([[key, 'backup bytes']]));
      const dependencies = makeDependencies();
      const storage = createManagedStorage(backend, dependencies.dependencies);
      const candidate = build();

      const outcome = await captureOutcome(
        Promise.resolve().then(() => recoverStorage(storage, key, candidate)),
      );

      expect(outcome.status).toBe('rejected');
      const error = outcome.status === 'rejected' ? outcome.error : undefined;
      expect(errorView(error)).toEqual({
        code: 'TASK_RECOVERY_CANDIDATE_INVALID',
        message: 'TASK_RECOVERY_CANDIDATE_INVALID',
        category: 'INVALID_SNAPSHOT',
        cause: undefined,
      });
      if (secret !== undefined) {
        expect(publicErrorText(error)).not.toContain(secret);
      }
      assertAfter?.();
      expect(backend.events).toEqual([]);
      expect(dependencies.now).not.toHaveBeenCalled();
      expect(dependencies.idGenerator).not.toHaveBeenCalled();
    },
  );

  it.each([
    'not-a-quarantine-key',
    'start-five.tasks.quarantine.',
    'start-five.tasks.quarantine.   ',
    'start-five.tasks.quarantine.bad\nkey',
  ])('rejects invalid backup key %p before candidate or backend I/O', async invalidKey => {
    const backend = new ControlledBackend();
    const dependencies = makeDependencies();
    const storage = createManagedStorage(backend, dependencies.dependencies);

    const outcome = await captureOutcome(
      Promise.resolve().then(() =>
        recoverStorage(
          storage,
          invalidKey,
          currentEnvelopeObject([makeTask('valid-key-check-candidate')]),
        ),
      ),
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

  it('accepts exactly 256 Subtasks and rejects 257 without backend I/O', async () => {
    const successKey = backupKey('array-256');
    const successBackend = new ControlledBackend(
      new Map([[successKey, 'backup-256']]),
    );
    const success = createManagedStorage(
      successBackend,
      makeDependencies().dependencies,
    );
    const legalTasks = makeTasksWithSubtaskCount(256);

    await expect(recoverStorage(success, successKey, legalTasks)).resolves.toEqual({
      state: 'recovered',
      backupKey: successKey,
      version: 1,
      taskCount: 1,
    });
    expect(successBackend.raw(CURRENT_STORAGE_KEY)).toBe(
      currentEnvelope(legalTasks),
    );
    expect(successBackend.raw(successKey)).toBe('backup-256');

    const failureKey = backupKey('array-257');
    const failureBackend = new ControlledBackend(
      new Map([[failureKey, 'backup-257']]),
    );
    const failure = createManagedStorage(
      failureBackend,
      makeDependencies().dependencies,
    );
    await expect(
      recoverStorage(failure, failureKey, makeTasksWithSubtaskCount(257)),
    ).rejects.toMatchObject({
      code: 'TASK_RECOVERY_CANDIDATE_INVALID',
      category: 'INVALID_SNAPSHOT',
    });
    expect(failureBackend.events).toEqual([]);
    expect(failureBackend.raw(failureKey)).toBe('backup-257');
  });

  it('accepts exactly 512 plain-data containers and rejects 513 before backend I/O', async () => {
    const atLimit = makeExactContainerCandidate(512);
    const successKey = backupKey('containers-512');
    const successBackend = new ControlledBackend(
      new Map([[successKey, 'backup-512']]),
    );
    const success = createManagedStorage(
      successBackend,
      makeDependencies().dependencies,
    );

    await expect(recoverStorage(success, successKey, atLimit)).resolves.toEqual({
      state: 'recovered',
      backupKey: successKey,
      version: 1,
      taskCount: 255,
    });
    expect(successBackend.raw(CURRENT_STORAGE_KEY)).toBe(currentEnvelope(atLimit));
    expect(successBackend.raw(successKey)).toBe('backup-512');

    const overLimit = makeExactContainerCandidate(513);
    const failureKey = backupKey('containers-513');
    const failureBackend = new ControlledBackend(
      new Map([[failureKey, 'backup-513']]),
    );
    const failure = createManagedStorage(
      failureBackend,
      makeDependencies().dependencies,
    );

    await expect(recoverStorage(failure, failureKey, overLimit)).rejects.toMatchObject({
      code: 'TASK_RECOVERY_CANDIDATE_INVALID',
      category: 'INVALID_SNAPSHOT',
    });
    expect(failureBackend.events).toEqual([]);
    expect(failureBackend.raw(failureKey)).toBe('backup-513');
  });
});

describe('GAP-P0-04 validated recover', () => {
  it('recovers a legal raw empty Task array once and then treats its canonical empty target as occupied', async () => {
    const key = backupKey('recover-empty-array');
    const originalBackup = 'ORIGINAL_RECOVER_EMPTY_ARRAY_BACKUP';
    const canonicalEmpty = currentEnvelope([]);
    const backend = new ControlledBackend(
      new Map([[key, originalBackup]]),
    );
    const dependencies = makeDependencies();
    const storage = createManagedStorage(backend, dependencies.dependencies);

    expect(backend.raw(CURRENT_STORAGE_KEY)).toBeNull();
    const receipt = await recoverStorage(storage, key, []);

    expect(receipt).toEqual({
      state: 'recovered',
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
      Promise.resolve().then(() => recoverStorage(storage, key, [])),
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
      candidate(task: Task): unknown {
        return currentEnvelopeObject([task]);
      },
    },
    {
      name: 'V0 envelope',
      candidate(task: Task): unknown {
        return versionEnvelopeObject([task], 0);
      },
    },
    {
      name: 'default envelope',
      candidate(task: Task): unknown {
        return defaultEnvelopeObject([task]);
      },
    },
    {
      name: 'legacy array',
      candidate(task: Task): unknown {
        return [task];
      },
    },
  ])('canonicalizes a legal $name and permanently retains its backup', async ({name, candidate}) => {
    const task = makeTask(`recover-${name.replaceAll(' ', '-')}`);
    const key = backupKey(`recover-${name.replaceAll(' ', '-')}`);
    const originalBackup = `original bytes for ${name}`;
    const backend = new ControlledBackend(
      new Map([[key, originalBackup]]),
    );
    const dependencies = makeDependencies();
    const storage = createManagedStorage(backend, dependencies.dependencies);

    await expect(recoverStorage(storage, key, candidate(task))).resolves.toEqual({
      state: 'recovered',
      backupKey: key,
      version: 1,
      taskCount: 1,
    });
    const canonical = currentEnvelope([task]);
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(canonical);
    expect(backend.raw(key)).toBe(originalBackup);
    expect(backend.setAttempts).toEqual([
      {key: CURRENT_STORAGE_KEY, value: canonical},
    ]);
    expect(backend.setCommits).toEqual(backend.setAttempts);
    expect(backend.removeAttempts).toEqual([]);
    expect(dependencies.now).not.toHaveBeenCalled();
    expect(dependencies.idGenerator).not.toHaveBeenCalled();
  });

  it('deep-captures the candidate before its first backend I/O', async () => {
    const key = backupKey('capture-before-io');
    const task = makeTask('capture-before-io', {
      subtasks: [makeSubtask('capture-before-io', 0)],
    });
    const expected = cloneTask(task);
    const candidate = currentEnvelopeObject([task]);
    const backend = new ControlledBackend(new Map([[key, 'backup bytes']]));
    const storage = createManagedStorage(
      backend,
      makeDependencies().dependencies,
    );
    const hold = backend.holdNext('get', key);

    const recovery = captureOutcome(
      Promise.resolve().then(() => recoverStorage(storage, key, candidate)),
    );
    const signal = await Promise.race([
      hold.entered.then(() => 'entered' as const),
      recovery.then(() => 'settled' as const),
      afterMicrotasks(256).then(() => 'budget' as const),
    ]);
    expect(signal).toBe('entered');
    if (signal !== 'entered') {
      hold.release();
      return;
    }

    task.title = 'MUTATED_AFTER_FIRST_IO';
    const firstSubtask = task.subtasks[0];
    if (firstSubtask !== undefined) {
      firstSubtask.title = 'MUTATED_CHILD_AFTER_FIRST_IO';
    }
    task.subtasks.push(makeSubtask(task.id, 1));
    hold.release();

    await expect(recovery).resolves.toMatchObject({status: 'fulfilled'});
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(currentEnvelope([expected]));
    expect(backend.raw(CURRENT_STORAGE_KEY)).not.toContain(
      'MUTATED_AFTER_FIRST_IO',
    );
  });

  it('requires an existing backup and leaves an empty target untouched', async () => {
    const key = backupKey('missing');
    const backend = new ControlledBackend();
    const storage = createManagedStorage(
      backend,
      makeDependencies().dependencies,
    );

    await expect(
      recoverStorage(storage, key, [makeTask('missing-backup')]),
    ).rejects.toMatchObject({
      code: 'TASK_RECOVERY_BACKUP_NOT_FOUND',
      message: 'TASK_RECOVERY_BACKUP_NOT_FOUND',
    });
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeAttempts).toEqual([]);
  });

  it.each([
    {
      name: 'legal canonical envelope',
      existing: currentEnvelope([makeTask('SECRET_RECOVER_OCCUPIED_CURRENT')]),
      secret: 'SECRET_RECOVER_OCCUPIED_CURRENT',
      expectedInspection: {
        state: 'current',
        schema: SNAPSHOT_SCHEMA,
        version: 1,
        taskCount: 1,
      },
    },
    {
      name: 'malformed JSON',
      existing: '{"secret":"SECRET_RECOVER_OCCUPIED_MALFORMED"',
      secret: 'SECRET_RECOVER_OCCUPIED_MALFORMED',
      expectedInspection: {
        state: 'unreadable',
        sourceKey: CURRENT_STORAGE_KEY,
        category: 'MALFORMED_JSON',
      },
    },
    {
      name: 'unsupported version envelope',
      existing: JSON.stringify({
        schema: SNAPSHOT_SCHEMA,
        version: 2,
        tasks: [makeTask('SECRET_RECOVER_OCCUPIED_UNSUPPORTED')],
      }),
      secret: 'SECRET_RECOVER_OCCUPIED_UNSUPPORTED',
      expectedInspection: {
        state: 'unreadable',
        sourceKey: CURRENT_STORAGE_KEY,
        category: 'UNSUPPORTED_VERSION',
      },
    },
    {
      name: 'wrong-root raw array',
      existing: JSON.stringify(['SECRET_RECOVER_OCCUPIED_WRONG_ROOT']),
      secret: 'SECRET_RECOVER_OCCUPIED_WRONG_ROOT',
      expectedInspection: {
        state: 'unreadable',
        sourceKey: CURRENT_STORAGE_KEY,
        category: 'WRONG_ROOT',
      },
    },
  ])(
    'gives occupied-target priority over $name and never overwrites its bytes',
    async ({existing, secret, expectedInspection}) => {
      const key = backupKey('occupied');
      const backupRaw = 'recover occupied backup bytes';
      const backend = new ControlledBackend(
        new Map([
          [key, backupRaw],
          [CURRENT_STORAGE_KEY, existing],
        ]),
      );
      const dependencies = makeDependencies();
      const storage = createManagedStorage(backend, dependencies.dependencies);

      const outcome = await captureOutcome(
        Promise.resolve().then(() =>
          recoverStorage(storage, key, [makeTask('replacement')]),
        ),
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
      expect(backend.getAttempts).toEqual([key, CURRENT_STORAGE_KEY]);
      expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(existing);
      expect(backend.raw(key)).toBe(backupRaw);
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
      expect(backend.raw(key)).toBe(backupRaw);
      expect(backend.setAttempts).toEqual([]);
      expect(backend.removeAttempts).toEqual([]);
      expect(dependencies.now).toHaveBeenCalledTimes(0);
      expect(dependencies.idGenerator).toHaveBeenCalledTimes(0);
    },
  );

  it('retains backup, target emptiness, and exact cause on set failure, then retries', async () => {
    const key = backupKey('set-retry');
    const task = makeTask('set-retry');
    const backend = new ControlledBackend(new Map([[key, 'backup bytes']]));
    const failure = new Error('RECOVERY_SET_FAILED');
    backend.failNext('set', CURRENT_STORAGE_KEY, failure);
    const storage = createManagedStorage(
      backend,
      makeDependencies().dependencies,
    );

    await expect(recoverStorage(storage, key, [task])).rejects.toMatchObject({
      code: 'TASK_STORAGE_WRITE_FAILED',
      message: 'TASK_STORAGE_WRITE_FAILED',
      cause: failure,
    });
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBeNull();
    expect(backend.raw(key)).toBe('backup bytes');

    await expect(recoverStorage(storage, key, [task])).resolves.toMatchObject({
      state: 'recovered',
      backupKey: key,
    });
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(currentEnvelope([task]));
    expect(backend.raw(key)).toBe('backup bytes');
  });

  it('retains backup read failure identity and performs no write or remove', async () => {
    const key = backupKey('read-failure');
    const backend = new ControlledBackend(new Map([[key, 'backup bytes']]));
    const failure = new Error('RECOVERY_BACKUP_READ_FAILED');
    backend.failNext('get', key, failure);
    const storage = createManagedStorage(
      backend,
      makeDependencies().dependencies,
    );

    await expect(
      recoverStorage(storage, key, [makeTask('read-failure')]),
    ).rejects.toMatchObject({
      code: 'TASK_STORAGE_READ_FAILED',
      message: 'TASK_STORAGE_READ_FAILED',
      cause: failure,
    });
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeAttempts).toEqual([]);
    expect(backend.raw(key)).toBe('backup bytes');
  });

  it('writes only the exact canonical schema/version envelope', async () => {
    const key = backupKey('canonical-proof');
    const task = makeTask('canonical-proof', {
      scheduledStartAt: '2026-08-05T09:00:00.000Z',
      estimatedMinutes: 15,
      firstStep: 'Preserve this recovery plan',
    });
    const backend = new ControlledBackend(new Map([[key, 'backup']]));
    const storage = createManagedStorage(
      backend,
      makeDependencies().dependencies,
    );

    await recoverStorage(storage, key, defaultEnvelopeObject([task]));

    expect(JSON.parse(backend.raw(CURRENT_STORAGE_KEY) ?? 'null')).toEqual({
      schema: SNAPSHOT_SCHEMA,
      version: 1,
      tasks: [task],
    });
    expect(backend.setCommits).toEqual([
      {key: CURRENT_STORAGE_KEY, value: currentEnvelope([task])},
    ]);
  });
});
