import {
  ControlledBackend,
  CURRENT_STORAGE_KEY,
  FOCUS_SESSION_SENTINEL_KEY,
  LEGACY_STORAGE_KEY,
  afterMicrotasks,
  countTaskCandidateContainers,
  createCompatibilityStorage,
  createManagedStorage,
  currentEnvelope,
  expectFocusSentinelUntouched,
  legacyRawArray,
  loadManagedRuntimeModule,
  makeAccessorCandidate,
  makeDependencies,
  makeExactContainerCandidate,
  makeSparseCandidate,
  makeSymbolCandidate,
  makeTask,
  makeTasksWithSubtaskCount,
  seedFocusSentinel,
} from './taskDataRecoveryTestKit';

function moduleNotFound(message: string): Error {
  return Object.assign(new Error(message), {code: 'MODULE_NOT_FOUND'});
}

describe('GAP-P0-04 test-harness controls', () => {
  it('constructs the real storage factory without performing backend I/O', () => {
    const backend = new ControlledBackend();
    const dependencies = makeDependencies();

    createManagedStorage(backend, dependencies.dependencies);

    expect(backend.events).toEqual([]);
    expect(dependencies.now).not.toHaveBeenCalled();
    expect(dependencies.idGenerator).not.toHaveBeenCalled();
  });

  it('keeps the one-argument runtime current-key-only with no management surface', async () => {
    const task = makeTask('compatibility-historical-only');
    const historicalRaw = legacyRawArray([task]);
    const backend = new ControlledBackend(
      new Map([[LEGACY_STORAGE_KEY, historicalRaw]]),
    );
    const storage = createCompatibilityStorage(backend);

    await expect(storage.getItem(CURRENT_STORAGE_KEY)).resolves.toBeNull();

    expect(backend.getAttempts).toEqual([CURRENT_STORAGE_KEY]);
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBeNull();
    expect(backend.raw(LEGACY_STORAGE_KEY)).toBe(historicalRaw);
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeAttempts).toEqual([]);
    for (const method of ['inspect', 'quarantine', 'recover', 'restore']) {
      expect(Reflect.has(storage, method)).toBe(false);
    }
  });

  it('models failed set and remove attempts as no durable commit', async () => {
    const backend = new ControlledBackend(
      new Map([[CURRENT_STORAGE_KEY, 'original']]),
    );
    const setFailure = new Error('CONTROL_SET_FAILURE');
    const removeFailure = new Error('CONTROL_REMOVE_FAILURE');
    backend.failNext('set', CURRENT_STORAGE_KEY, setFailure);
    backend.failNext('remove', CURRENT_STORAGE_KEY, removeFailure);

    await expect(backend.setItem(CURRENT_STORAGE_KEY, 'replacement')).rejects.toBe(
      setFailure,
    );
    await expect(backend.removeItem(CURRENT_STORAGE_KEY)).rejects.toBe(
      removeFailure,
    );

    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe('original');
    expect(backend.setCommits).toEqual([]);
    expect(backend.removeCommits).toEqual([]);
  });

  it('keeps barrier holds deterministic without timers', async () => {
    const backend = new ControlledBackend();
    const hold = backend.holdNext('set', CURRENT_STORAGE_KEY);
    const write = backend.setItem(CURRENT_STORAGE_KEY, 'committed-after-release');
    const signal = await Promise.race([
      hold.entered.then(() => 'entered' as const),
      write.then(() => 'settled' as const),
      afterMicrotasks(64).then(() => 'budget' as const),
    ]);

    expect(signal).toBe('entered');
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBeNull();
    hold.release();
    await write;
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe('committed-after-release');
  });

  it('proves the legal boundary fixtures target exactly 512/513 containers and 256/257 array elements', () => {
    const atContainerLimit = makeExactContainerCandidate(512);
    const overContainerLimit = makeExactContainerCandidate(513);
    const atArrayLimit = makeTasksWithSubtaskCount(256);
    const overArrayLimit = makeTasksWithSubtaskCount(257);

    expect(countTaskCandidateContainers(atContainerLimit)).toBe(512);
    expect(countTaskCandidateContainers(overContainerLimit)).toBe(513);
    expect(atContainerLimit.every(task => task.title.trim() !== '')).toBe(true);
    expect(overContainerLimit.every(task => task.title.trim() !== '')).toBe(true);
    expect(atArrayLimit[0]?.subtasks).toHaveLength(256);
    expect(overArrayLimit[0]?.subtasks).toHaveLength(257);
    expect(
      atArrayLimit[0]?.subtasks.every(step => step.taskId === atArrayLimit[0]?.id),
    ).toBe(true);
  });

  it('proves accessor, symbol, and sparse adversaries retain otherwise legal required Task fields', () => {
    const audit = {calls: 0};
    const accessor = makeAccessorCandidate(audit);
    const accessorTask = Reflect.get(accessor, 'tasks');
    const firstAccessorTask = Array.isArray(accessorTask)
      ? accessorTask[0]
      : undefined;
    const descriptor =
      typeof firstAccessorTask === 'object' && firstAccessorTask !== null
        ? Object.getOwnPropertyDescriptor(firstAccessorTask, 'description')
        : undefined;
    const symbolTasks = Reflect.get(makeSymbolCandidate(), 'tasks');
    const sparseTasks = Reflect.get(makeSparseCandidate(), 'tasks');

    expect(descriptor?.get).toEqual(expect.any(Function));
    expect(audit.calls).toBe(0);
    expect(
      Array.isArray(symbolTasks) &&
        typeof symbolTasks[0] === 'object' &&
        symbolTasks[0] !== null
        ? Object.getOwnPropertySymbols(symbolTasks[0])
        : [],
    ).toHaveLength(1);
    expect(
      Array.isArray(sparseTasks) &&
        typeof sparseTasks[0] === 'object' &&
        sparseTasks[0] !== null
        ? Reflect.get(sparseTasks[0], 'subtasks')
        : [],
    ).toHaveLength(2);
    expect(makeTask('legal-control')).toMatchObject({
      title: 'Recovery task legal-control',
      status: 'pending',
      subtasks: [],
    });
  });

  it('accepts canonical V1 through the one-argument compatibility bridge with one current-key read', async () => {
    const task = makeTask('current-control');
    const raw = currentEnvelope([task]);
    const backend = new ControlledBackend();
    backend.seed(CURRENT_STORAGE_KEY, raw);
    const storage = createCompatibilityStorage(backend);

    await expect(storage.getItem(CURRENT_STORAGE_KEY)).resolves.toBe(
      legacyRawArray([task]),
    );
    expect(backend.raw(CURRENT_STORAGE_KEY)).toBe(raw);
    expect(backend.getAttempts).toEqual([CURRENT_STORAGE_KEY]);
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeAttempts).toEqual([]);
  });

  it('maps only an exact missing managed-runtime module and rethrows loader failures by identity', () => {
    const requested = '../../src/app/startFiveManagedRuntime';
    const exactMissing = moduleNotFound(`Cannot find module '${requested}'`);
    const nestedMissing = moduleNotFound("Cannot find module './nested-helper'");
    const syntaxFailure = new SyntaxError('BROKEN_RUNTIME_SOURCE');

    expect(() => loadManagedRuntimeModule(() => { throw exactMissing; })).toThrow(
      'GAP_P0_04_IMPLEMENTATION_REQUIRED:createStartFiveManagedRuntime',
    );
    expect(() => loadManagedRuntimeModule(() => { throw nestedMissing; })).toThrow(
      nestedMissing,
    );
    expect(() => loadManagedRuntimeModule(() => { throw syntaxFailure; })).toThrow(
      syntaxFailure,
    );
  });

  it('keeps the FocusSession sentinel helper independent of task keys', () => {
    const backend = new ControlledBackend();
    seedFocusSentinel(backend);
    expect(FOCUS_SESSION_SENTINEL_KEY).not.toBe(CURRENT_STORAGE_KEY);
    expectFocusSentinelUntouched(backend);
  });
});
