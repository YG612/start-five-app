const EXPECTED_SERVICE_METHODS: readonly string[] = [
  'finish',
  'getActive',
  'getById',
  'interrupt',
  'listForTask',
  'restore',
  'start',
];

const MICROTASK_DRAIN_ROUNDS = 8;

async function drainConstructionMicrotasks(): Promise<void> {
  for (let round = 0; round < MICROTASK_DRAIN_ROUNDS; round += 1) {
    await Promise.resolve();
  }
}

function loadFocusSessionServiceModule(): unknown {
  try {
    return jest.requireActual<object>(
      '../../src/application/focusSessionService',
    );
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `GAP_P0_02A_IMPLEMENTATION_REQUIRED:focusSessionService:${detail}`,
    );
  }
}

describe('GAP-P0-02A runtime factory surface', () => {
  it('owns one constructable factory, returns exactly seven methods, and performs zero synchronous or microtask construction I/O', async () => {
    const moduleValue = loadFocusSessionServiceModule();
    expect(moduleValue).not.toBeNull();
    expect(typeof moduleValue).toBe('object');
    if (typeof moduleValue !== 'object' || moduleValue === null) {
      throw new Error('GAP_P0_02A_MODULE_MUST_BE_AN_OBJECT');
    }

    expect(Object.keys(moduleValue).sort()).toEqual([
      'createFocusSessionService',
    ]);
    expect(
      Object.prototype.hasOwnProperty.call(
        moduleValue,
        'createFocusSessionService',
      ),
    ).toBe(true);

    const factory: unknown = Reflect.get(
      moduleValue,
      'createFocusSessionService',
    );
    expect(typeof factory).toBe('function');
    if (typeof factory !== 'function') {
      throw new Error(
        'GAP_P0_02A_IMPLEMENTATION_REQUIRED:createFocusSessionService',
      );
    }

    const load = jest.fn(() => Promise.resolve([]));
    const list = jest.fn(() => Promise.resolve([]));
    const get = jest.fn(() => Promise.resolve(null));
    const save = jest.fn(() => Promise.reject(new Error('UNEXPECTED_SAVE')));
    const transaction = jest.fn(() =>
      Promise.reject(new Error('UNEXPECTED_TRANSACTION')),
    );
    const now = jest.fn(() => '2026-08-05T00:00:00.000Z');
    const idGenerator = jest.fn(() => 'focus-runtime-001');

    const service: unknown = factory({
      repository: {load, list, get, save, transaction},
      now,
      idGenerator,
    });
    expect(service).not.toBeNull();
    expect(typeof service).toBe('object');
    if (typeof service !== 'object' || service === null) {
      throw new Error('GAP_P0_02A_FACTORY_MUST_RETURN_SERVICE');
    }

    expect(Object.keys(service).sort()).toEqual(EXPECTED_SERVICE_METHODS);
    for (const methodName of EXPECTED_SERVICE_METHODS) {
      expect(typeof Reflect.get(service, methodName)).toBe('function');
    }
    const dependencies = [
      load,
      list,
      get,
      save,
      transaction,
      now,
      idGenerator,
    ];
    for (const dependency of dependencies) {
      expect(dependency).not.toHaveBeenCalled();
    }

    await drainConstructionMicrotasks();

    for (const dependency of dependencies) {
      expect(dependency).not.toHaveBeenCalled();
    }
  });
});
