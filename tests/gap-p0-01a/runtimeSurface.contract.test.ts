import * as coreAppServiceModule from '../../src/application/coreAppService';
import * as quadrantModule from '../../src/domain/quadrant';
import {createCoreAppService} from '../../src/application/coreAppService';
import {
  createTaskRepository,
  type KeyValueStorage,
} from '../../src/data/taskRepository';

class MemoryStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}

const EXPECTED_LIFECYCLE_METHODS: readonly string[] = [
  'complete',
  'create',
  'delay',
  'getById',
  'getQuadrantProjection',
  'getQueryResult',
  'getRecommendation',
  'list',
  'reschedule',
  'softDelete',
  'update',
];

const EXPECTED_LEGACY_CORE_METHODS: readonly string[] = [
  'addFirstStep',
  'chooseRecommended',
  'createTask',
  'finishStep',
  'finishTask',
  'getState',
  'startRecommended',
];

describe('GAP-P0-01A-A1 runtime export surface', () => {
  it('exports projectTaskQuadrants as an own runtime function without invoking it', () => {
    expect(
      Object.prototype.hasOwnProperty.call(
        quadrantModule,
        'projectTaskQuadrants',
      ),
    ).toBe(true);
    expect(
      typeof Reflect.get(quadrantModule, 'projectTaskQuadrants'),
    ).toBe('function');
  });

  it('exports a constructable lifecycle factory with exact own method keys', () => {
    expect(
      Object.prototype.hasOwnProperty.call(
        coreAppServiceModule,
        'createTaskLifecycleService',
      ),
    ).toBe(true);
    const factory: unknown = Reflect.get(
      coreAppServiceModule,
      'createTaskLifecycleService',
    );
    expect(typeof factory).toBe('function');
    if (typeof factory !== 'function') {
      throw new Error(
        'GAP_P0_01A_A1_IMPLEMENTATION_REQUIRED:createTaskLifecycleService',
      );
    }

    const repository = createTaskRepository(
      new MemoryStorage(),
      'gap-p0-01a-a1-runtime',
    );
    const service: unknown = factory({
      repository,
      now: () => '2026-08-05T00:00:00.000Z',
      idGenerator: () => 'a1-id-001',
    });
    expect(service).not.toBeNull();
    expect(typeof service).toBe('object');
    if (typeof service !== 'object' || service === null) {
      throw new Error('GAP_P0_01A_A1_FACTORY_MUST_RETURN_SERVICE');
    }

    expect(Object.keys(service).sort()).toEqual(EXPECTED_LIFECYCLE_METHODS);
    for (const methodName of EXPECTED_LIFECYCLE_METHODS) {
      expect(typeof Reflect.get(service, methodName)).toBe('function');
    }
  });

  it('keeps the legacy createCoreAppService own method surface exact', () => {
    const repository = createTaskRepository(
      new MemoryStorage(),
      'gap-p0-01a-a1-legacy-runtime',
    );
    const legacyService = createCoreAppService({
      repository,
      now: () => '2026-08-05T00:00:00.000Z',
      idGenerator: () => 'legacy-id-001',
    });

    expect(Object.keys(legacyService).sort()).toEqual(
      EXPECTED_LEGACY_CORE_METHODS,
    );
  });
});
