import {
  compileContract,
  diagnosticReport,
} from './inMemoryTypecheck';

type RuntimeModule = {
  [key: string]: unknown;
};

async function drainConstructionMicrotasks(): Promise<void> {
  for (let round = 0; round < 8; round += 1) {
    await Promise.resolve();
  }
}

function loadRepositoryModule(): RuntimeModule {
  return jest.requireActual<RuntimeModule>(
    '../../src/data/focusSessionRepository',
  );
}

function loadStorageModule(): RuntimeModule {
  try {
    return jest.requireActual<RuntimeModule>(
      '../../src/data/persistentFocusSessionStorage',
    );
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `GAP_P0_02B_IMPLEMENTATION_REQUIRED:persistentFocusSessionStorage:${detail}`,
    );
  }
}

describe('GAP-P0-02B persistent public TypeScript and runtime surface', () => {
  it('exports the exact public key-value storage and repository factory signatures', () => {
    const compilation = compileContract(
      'repository-public-surface',
      `
        import type {FocusSessionRepository} from '../../../src/data/focusSessionRepository';
        import {
          DEFAULT_FOCUS_SESSION_STORAGE_KEY,
          createFocusSessionRepository,
          type FocusSessionKeyValueStorage,
        } from '../../../src/data/focusSessionRepository';

        type Assert<T extends true> = T;
        type Equal<A, B> =
          (<T>() => T extends A ? 1 : 2) extends
          (<T>() => T extends B ? 1 : 2)
            ? true
            : false;
        type ExpectedStorage = {
          getItem(key: string): Promise<string | null>;
          setItem(key: string, value: string): Promise<void>;
          removeItem(key: string): Promise<void>;
        };
        type ExpectedFactory = (
          storage: ExpectedStorage,
          key?: string,
        ) => FocusSessionRepository;
        type Proofs = [
          Assert<Equal<FocusSessionKeyValueStorage, ExpectedStorage>>,
          Assert<Equal<typeof DEFAULT_FOCUS_SESSION_STORAGE_KEY, 'start-five.focus-sessions.v1'>>,
          Assert<Equal<typeof createFocusSessionRepository, ExpectedFactory>>,
        ];
        const proofs: Proofs = [true, true, true];
        void proofs;
      `,
    );

    expect(diagnosticReport(compilation)).toBe('');
    expect(compilation.diagnostics).toEqual([]);
    expect(compilation.emittedFileCount).toBe(0);
  });

  it('exports the exact persistent backend, constants, and factory signature', () => {
    const compilation = compileContract(
      'persistent-storage-public-surface',
      `
        import type {FocusSessionKeyValueStorage} from '../../../src/data/focusSessionRepository';
        import {
          FOCUS_SESSION_SNAPSHOT_SCHEMA,
          FOCUS_SESSION_SNAPSHOT_VERSION,
          FOCUS_SESSION_STORAGE_KEY,
          createPersistentFocusSessionStorage,
          type FocusSessionAsyncKeyValueBackend,
        } from '../../../src/data/persistentFocusSessionStorage';

        type Assert<T extends true> = T;
        type Equal<A, B> =
          (<T>() => T extends A ? 1 : 2) extends
          (<T>() => T extends B ? 1 : 2)
            ? true
            : false;
        type ExpectedBackend = {
          getItem(key: string): Promise<string | null>;
          setItem(key: string, value: string): Promise<void>;
          removeItem(key: string): Promise<void>;
        };
        type ExpectedFactory = (
          backend: ExpectedBackend,
        ) => FocusSessionKeyValueStorage;
        type Proofs = [
          Assert<Equal<FocusSessionAsyncKeyValueBackend, ExpectedBackend>>,
          Assert<Equal<typeof FOCUS_SESSION_STORAGE_KEY, 'start-five.focus-sessions.v1'>>,
          Assert<Equal<typeof FOCUS_SESSION_SNAPSHOT_SCHEMA, 'start-five.focus-sessions'>>,
          Assert<Equal<typeof FOCUS_SESSION_SNAPSHOT_VERSION, 1>>,
          Assert<Equal<typeof createPersistentFocusSessionStorage, ExpectedFactory>>,
        ];
        const proofs: Proofs = [true, true, true, true, true];
        void proofs;
      `,
    );

    expect(diagnosticReport(compilation)).toBe('');
    expect(compilation.diagnostics).toEqual([]);
    expect(compilation.emittedFileCount).toBe(0);
  });

  it('owns exact runtime namespaces and constructs both adapters with synchronous and deferred zero backend I/O', async () => {
    const repositoryModule = loadRepositoryModule();
    const storageModule = loadStorageModule();

    expect(Object.keys(repositoryModule).sort()).toEqual([
      'DEFAULT_FOCUS_SESSION_STORAGE_KEY',
      'createFocusSessionRepository',
    ]);
    expect(Object.keys(storageModule).sort()).toEqual([
      'FOCUS_SESSION_SNAPSHOT_SCHEMA',
      'FOCUS_SESSION_SNAPSHOT_VERSION',
      'FOCUS_SESSION_STORAGE_KEY',
      'createPersistentFocusSessionStorage',
    ]);

    const createStorage = storageModule.createPersistentFocusSessionStorage;
    const createRepository = repositoryModule.createFocusSessionRepository;
    expect(typeof createStorage).toBe('function');
    expect(typeof createRepository).toBe('function');
    if (typeof createStorage !== 'function' || typeof createRepository !== 'function') {
      throw new Error('GAP_P0_02B_FACTORY_RUNTIME_REQUIRED');
    }

    const getItem = jest.fn(() => Promise.resolve(null));
    const setItem = jest.fn(() => Promise.resolve());
    const removeItem = jest.fn(() => Promise.resolve());
    const storage = createStorage({getItem, setItem, removeItem});
    expect(storage).not.toBeNull();
    expect(typeof storage).toBe('object');
    expect(Object.keys(storage).sort()).toEqual([
      'getItem',
      'removeItem',
      'setItem',
    ]);
    const repository = createRepository(storage);
    expect(repository).not.toBeNull();
    expect(typeof repository).toBe('object');
    expect(Object.keys(repository).sort()).toEqual([
      'get',
      'list',
      'load',
      'save',
      'transaction',
    ]);
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    await drainConstructionMicrotasks();
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });
});
