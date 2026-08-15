import {createCoreAppService} from '../../src/application/coreAppService';
import {createTaskRepository} from '../../src/data/taskRepository';
import type {Task} from '../../src/domain/task';
import {
  A2_STORAGE_KEY,
  ControlledTaskStorage,
  PhysicalTaskBackend,
  expectErrorCode,
  makeTask,
} from './a2Fixtures';

describe('GAP-P0-01A2 legacy and repository compatibility controls', () => {
  it('keeps the legacy seven-method CoreAppService operational and unexpanded', async () => {
    const backend = new PhysicalTaskBackend();
    const storage = new ControlledTaskStorage(backend);
    storage.seedTasks([]);
    const repository = createTaskRepository(storage, A2_STORAGE_KEY);
    const service = createCoreAppService({
      repository,
      now: () => '2026-08-05T10:00:00.000Z',
      idGenerator: () => 'legacy-control-task',
    });

    expect(Object.keys(service).sort()).toEqual([
      'addFirstStep',
      'chooseRecommended',
      'createTask',
      'finishStep',
      'finishTask',
      'getState',
      'startRecommended',
    ]);
    await expect(
      service.createTask(
        {title: 'Legacy control', important: false, urgent: false},
        {operationId: 'legacy-control:create'},
      ),
    ).resolves.toMatchObject({
      id: 'legacy-control-task',
      title: 'Legacy control',
    });
    await expect(service.getState()).resolves.toMatchObject({
      tasks: [expect.objectContaining({id: 'legacy-control-task'})],
      totalScore: 0,
    });
  });

  it('preserves repository deep cloning and shared-backend serialized mutations', async () => {
    const backend = new PhysicalTaskBackend();
    const storageA = new ControlledTaskStorage(backend);
    const storageB = new ControlledTaskStorage(backend);
    storageA.seedTasks([]);
    const repositoryA = createTaskRepository(storageA, A2_STORAGE_KEY);
    const repositoryB = createTaskRepository(storageB, A2_STORAGE_KEY);
    const first = makeTask('repository-control-a');
    const second = makeTask('repository-control-b');

    const [createdFirst, createdSecond] = await Promise.all([
      repositoryA.create(first),
      repositoryB.create(second),
    ]);
    createdFirst.title = 'caller mutation A';
    createdSecond.title = 'caller mutation B';

    await expect(repositoryA.list()).resolves.toEqual([first, second]);
    await expect(repositoryB.list()).resolves.toEqual([first, second]);
    expect(storageA.setCommits.length + storageB.setCommits.length).toBe(2);
  });

  it('keeps reentrant facade mutation fail-fast and expires leaked transaction surfaces', async () => {
    const backend = new PhysicalTaskBackend();
    const storage = new ControlledTaskStorage(backend);
    const baseline = makeTask('repository-control-transaction');
    storage.seedTasks([baseline]);
    const repository = createTaskRepository(storage, A2_STORAGE_KEY);
    let leakedList: () => Promise<Task[]> = () =>
      Promise.reject(new Error('A2_TRANSACTION_SURFACE_NOT_CAPTURED'));

    await expectErrorCode(
      () =>
        repository.transaction(async transaction => {
          await repository.update(baseline.id, {
            title: 'must reject reentrant facade call',
          });
          return transaction.list();
        }),
      'TASK_REPOSITORY_REENTRANT_MUTATION',
    );
    expect(storage.setCommits).toEqual([]);

    await repository.transaction(async transaction => {
      leakedList = () => transaction.list({includeDeleted: true});
      return transaction.getById(baseline.id);
    });
    await expectErrorCode(
      () => leakedList(),
      'TASK_REPOSITORY_TRANSACTION_EXPIRED',
    );
  });
});
