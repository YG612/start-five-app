import {
  createCoreAppService,
  createOperationRegistry,
  DEFAULT_OPERATION_REGISTRY_CAPACITY,
  getDefaultOperationRegistryDiagnostics,
  type CreateCoreAppServiceDependencies,
} from '../../src/application/coreAppService';
import {createTaskRepository} from '../../src/data/taskRepository';
import {
  createDeferred,
  makeReviewSubtask,
  makeReviewTask,
  REVIEW_NOW,
  ReviewMemoryStorage,
} from './fixtures/reviewFixtures';

type ReviewRegistry = ReturnType<typeof createOperationRegistry>;

function dependenciesWithRegistry(
  storage: ReviewMemoryStorage,
  registry: ReviewRegistry,
  ids: string[],
): CreateCoreAppServiceDependencies & {operationRegistry: ReviewRegistry} {
  return {
    repository: createTaskRepository(storage),
    now: () => REVIEW_NOW,
    idGenerator: jest.fn(() => ids.shift() ?? 'unexpected-id'),
    operationRegistry: registry,
  };
}

describe('R1-C bounded operation registry contract', () => {
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid maxEntries %p',
    maxEntries => {
      expect(() => createOperationRegistry({maxEntries})).toThrow(
        expect.objectContaining({code: 'INVALID_OPERATION_REGISTRY_CAPACITY'}),
      );
    },
  );

  it('never exceeds maxEntries while retaining recent settled operations', async () => {
    const registry = createOperationRegistry({maxEntries: 3});

    for (let index = 0; index < 12; index += 1) {
      await expect(
        registry.run(
          {
            operationId: `bounded-${index}`,
            kind: 'createTask',
            fingerprint: `task-${index}`,
          },
          async () => index,
        ),
      ).resolves.toBe(index);
      expect(registry.size).toBeLessThanOrEqual(3);
    }

    expect(registry.size).toBe(3);
  });

  it('evicts a settled record before an in-flight record', async () => {
    const registry = createOperationRegistry({maxEntries: 2});
    const deferred = createDeferred<string>();
    const firstWork = jest.fn(() => deferred.promise);
    const duplicateWork = jest.fn(async () => 'incorrect duplicate');
    const first = registry.run(
      {operationId: 'pending', kind: 'createTask', fingerprint: 'same'},
      firstWork,
    );
    await Promise.resolve();
    await registry.run(
      {operationId: 'settled', kind: 'createTask', fingerprint: 'settled'},
      async () => 'settled',
    );
    await registry.run(
      {operationId: 'new', kind: 'createTask', fingerprint: 'new'},
      async () => 'new',
    );

    expect(registry.size).toBeLessThanOrEqual(2);
    const duplicate = registry.run(
      {operationId: 'pending', kind: 'createTask', fingerprint: 'same'},
      duplicateWork,
    );
    expect(firstWork).toHaveBeenCalledTimes(1);
    expect(duplicateWork).not.toHaveBeenCalled();

    deferred.resolve('original');
    await expect(first).resolves.toBe('original');
    await expect(duplicate).resolves.toBe('original');
  });

  it('rejects a same-kind fingerprint conflict without invoking work', async () => {
    const registry = createOperationRegistry({maxEntries: 2});
    await registry.run(
      {operationId: 'same-id', kind: 'addFirstStep', fingerprint: 'step-a'},
      async () => 'first',
    );
    const conflictingWork = jest.fn(async () => 'second');

    await expect(
      registry.run(
        {operationId: 'same-id', kind: 'addFirstStep', fingerprint: 'step-b'},
        conflictingWork,
      ),
    ).rejects.toMatchObject({code: 'OPERATION_ID_CONFLICT'});
    expect(conflictingWork).not.toHaveBeenCalled();
    expect(registry.size).toBe(1);
  });

  it('removes a rejected work record so the identical request can retry', async () => {
    const registry = createOperationRegistry({maxEntries: 2});
    const request = {
      operationId: 'retry-after-rejection',
      kind: 'createTask' as const,
      fingerprint: 'same-request',
    };
    const failure = new Error('transient failure');
    const failedWork = jest.fn(() => Promise.reject(failure));

    await expect(registry.run(request, failedWork)).rejects.toBe(failure);
    expect(failedWork).toHaveBeenCalledTimes(1);
    expect(registry.size).toBe(0);

    const retryWork = jest.fn(async () => 'recovered');
    await expect(registry.run(request, retryWork)).resolves.toBe('recovered');
    expect(retryWork).toHaveBeenCalledTimes(1);
    expect(registry.size).toBe(1);
  });

  it('rejects a distinct request at all-in-flight capacity but still reuses a duplicate', async () => {
    const registry = createOperationRegistry({maxEntries: 2});
    const firstDeferred = createDeferred<string>();
    const secondDeferred = createDeferred<string>();
    const firstWork = jest.fn(() => firstDeferred.promise);
    const secondWork = jest.fn(() => secondDeferred.promise);
    const firstRequest = {
      operationId: 'in-flight-a',
      kind: 'createTask' as const,
      fingerprint: 'a',
    };
    const first = registry.run(firstRequest, firstWork);
    const second = registry.run(
      {operationId: 'in-flight-b', kind: 'createTask', fingerprint: 'b'},
      secondWork,
    );
    await Promise.resolve();
    const overflowWork = jest.fn(async () => 'must not run');

    await expect(
      registry.run(
        {operationId: 'overflow', kind: 'createTask', fingerprint: 'c'},
        overflowWork,
      ),
    ).rejects.toMatchObject({code: 'OPERATION_REGISTRY_CAPACITY'});
    expect(overflowWork).not.toHaveBeenCalled();
    expect(registry.size).toBe(2);

    const duplicateWork = jest.fn(async () => 'incorrect duplicate');
    const duplicate = registry.run(firstRequest, duplicateWork);
    expect(duplicateWork).not.toHaveBeenCalled();
    expect(firstWork).toHaveBeenCalledTimes(1);
    expect(secondWork).toHaveBeenCalledTimes(1);

    firstDeferred.resolve('first');
    secondDeferred.resolve('second');
    await expect(first).resolves.toBe('first');
    await expect(duplicate).resolves.toBe('first');
    await expect(second).resolves.toBe('second');
    expect(registry.size).toBe(2);
  });
});

describe('R1-C normalized request binding in CoreAppService', () => {
  it('reuses a normalized create request across services but rejects changed input without a write', async () => {
    const storage = new ReviewMemoryStorage();
    const registry = createOperationRegistry({maxEntries: 8});
    const dependencies = dependenciesWithRegistry(storage, registry, ['task-1']);
    const firstService = createCoreAppService(dependencies);
    const operation = {operationId: 'normalized-create'};

    const first = await firstService.createTask(
      {
        title: '  Focus  ',
        important: true,
        urgent: false,
        startAt: '2026-08-04T09:02:03+08:00',
      },
      operation,
    );
    const writesAfterFirst = storage.setCalls.length;
    const secondService = createCoreAppService(dependencies);
    const equivalent = await secondService.createTask(
      {
        title: 'Focus',
        description: '',
        important: true,
        urgent: false,
        startAt: REVIEW_NOW,
        dueAt: null,
      },
      operation,
    );

    expect(equivalent).toEqual(first);
    expect(storage.setCalls).toHaveLength(writesAfterFirst);
    expect(registry.size).toBe(1);

    await expect(
      secondService.createTask(
        {
          title: 'Focus',
          description: '',
          important: true,
          urgent: true,
          startAt: REVIEW_NOW,
          dueAt: null,
        },
        operation,
      ),
    ).rejects.toMatchObject({code: 'OPERATION_ID_CONFLICT'});
    expect(storage.setCalls).toHaveLength(writesAfterFirst);
    expect(dependencies.idGenerator).toHaveBeenCalledTimes(1);
  });

  it('binds addFirstStep to taskId and normalized title without an extra write', async () => {
    const storage = new ReviewMemoryStorage();
    const registry = createOperationRegistry({maxEntries: 8});
    const dependencies = dependenciesWithRegistry(storage, registry, [
      'task-1',
      'step-1',
    ]);
    const firstService = createCoreAppService(dependencies);
    await firstService.createTask(
      {title: 'Parent', important: false, urgent: false},
      {operationId: 'create-parent'},
    );
    const operation = {operationId: 'normalized-step'};
    const first = await firstService.addFirstStep(
      'task-1',
      {title: '  Open document  '},
      operation,
    );
    const writesAfterFirst = storage.setCalls.length;
    const secondService = createCoreAppService(dependencies);

    await expect(
      secondService.addFirstStep(
        'task-1',
        {title: 'Open document'},
        operation,
      ),
    ).resolves.toEqual(first);
    expect(storage.setCalls).toHaveLength(writesAfterFirst);

    await expect(
      secondService.addFirstStep(
        'task-1',
        {title: 'Draft first paragraph'},
        operation,
      ),
    ).rejects.toMatchObject({code: 'OPERATION_ID_CONFLICT'});
    expect(storage.setCalls).toHaveLength(writesAfterFirst);
    expect(dependencies.idGenerator).toHaveBeenCalledTimes(2);
  });

  it('binds finishStep to both entity identifiers and blocks a second task write', async () => {
    const storage = new ReviewMemoryStorage();
    const registry = createOperationRegistry({maxEntries: 8});
    const dependencies = dependenciesWithRegistry(storage, registry, []);
    await dependencies.repository.create(
      makeReviewTask({
        id: 'task-1',
        status: 'in_progress',
        subtasks: [makeReviewSubtask({id: 'step-1', taskId: 'task-1'})],
      }),
    );
    await dependencies.repository.create(
      makeReviewTask({
        id: 'task-2',
        status: 'in_progress',
        subtasks: [makeReviewSubtask({id: 'step-2', taskId: 'task-2'})],
      }),
    );
    const firstService = createCoreAppService(dependencies);
    const operation = {operationId: 'finish-one-step'};
    await firstService.finishStep('task-1', 'step-1', operation);
    const writesAfterFirst = storage.setCalls.length;

    await expect(
      createCoreAppService(dependencies).finishStep(
        'task-2',
        'step-2',
        operation,
      ),
    ).rejects.toMatchObject({code: 'OPERATION_ID_CONFLICT'});
    expect(storage.setCalls).toHaveLength(writesAfterFirst);
    await expect(dependencies.repository.getById('task-2')).resolves.toMatchObject(
      {subtasks: [expect.objectContaining({status: 'pending'})]},
    );
  });

  it('binds finishTask to taskId and preserves the other task unchanged', async () => {
    const storage = new ReviewMemoryStorage();
    const registry = createOperationRegistry({maxEntries: 8});
    const dependencies = dependenciesWithRegistry(storage, registry, []);
    await dependencies.repository.create(
      makeReviewTask({id: 'task-1', status: 'in_progress'}),
    );
    await dependencies.repository.create(
      makeReviewTask({id: 'task-2', status: 'in_progress'}),
    );
    const operation = {operationId: 'finish-one-task'};
    await createCoreAppService(dependencies).finishTask('task-1', operation);
    const writesAfterFirst = storage.setCalls.length;

    await expect(
      createCoreAppService(dependencies).finishTask('task-2', operation),
    ).rejects.toMatchObject({code: 'OPERATION_ID_CONFLICT'});
    expect(storage.setCalls).toHaveLength(writesAfterFirst);
    await expect(dependencies.repository.getById('task-2')).resolves.toMatchObject(
      {status: 'in_progress', score: null},
    );
  });

  it('shares a finite default registry across services and safely evicts old settled work', async () => {
    expect(Number.isInteger(DEFAULT_OPERATION_REGISTRY_CAPACITY)).toBe(true);
    expect(DEFAULT_OPERATION_REGISTRY_CAPACITY).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_OPERATION_REGISTRY_CAPACITY).toBeLessThanOrEqual(256);

    const storage = new ReviewMemoryStorage();
    const repository = createTaskRepository(storage);
    await repository.create(
      makeReviewTask({
        status: 'completed',
        completedAt: REVIEW_NOW,
        score: 45,
        scoreAwardedAt: REVIEW_NOW,
      }),
    );
    const writesAfterSeed = storage.setCalls.length;
    const transactionSpy = jest.spyOn(repository, 'transaction');
    const dependencies: CreateCoreAppServiceDependencies = {
      repository,
      now: () => REVIEW_NOW,
      idGenerator: () => 'unused-id',
    };
    const finishWithFreshService = (operationId: string) =>
      createCoreAppService(dependencies).finishTask('task-review-1', {
        operationId,
      });

    for (
      let index = 0;
      index <= DEFAULT_OPERATION_REGISTRY_CAPACITY;
      index += 1
    ) {
      await expect(
        finishWithFreshService(`default-registry-${index}`),
      ).resolves.toMatchObject({points: 0});
    }

    expect(getDefaultOperationRegistryDiagnostics(repository)).toEqual({
      size: DEFAULT_OPERATION_REGISTRY_CAPACITY,
      maxEntries: DEFAULT_OPERATION_REGISTRY_CAPACITY,
    });
    expect(storage.setCalls).toHaveLength(writesAfterSeed);

    const callsBeforeRecentDuplicate = transactionSpy.mock.calls.length;
    await expect(
      finishWithFreshService(
        `default-registry-${DEFAULT_OPERATION_REGISTRY_CAPACITY}`,
      ),
    ).resolves.toMatchObject({points: 0});
    expect(transactionSpy).toHaveBeenCalledTimes(callsBeforeRecentDuplicate);

    const callsBeforeEvictedRetry = transactionSpy.mock.calls.length;
    await expect(
      finishWithFreshService('default-registry-0'),
    ).resolves.toMatchObject({points: 0});
    expect(transactionSpy).toHaveBeenCalledTimes(callsBeforeEvictedRetry + 1);
    expect(storage.setCalls).toHaveLength(writesAfterSeed);
    expect(getDefaultOperationRegistryDiagnostics(repository).size).toBe(
      DEFAULT_OPERATION_REGISTRY_CAPACITY,
    );
  });
});
