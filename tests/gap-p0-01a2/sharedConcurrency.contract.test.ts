import {createTaskRepository} from '../../src/data/taskRepository';
import {
  A2_STORAGE_KEY,
  ControlledTaskStorage,
  PhysicalTaskBackend,
  SequenceIds,
  createA2Harness,
  expectBarrierBeforeSettlement,
  expectErrorCode,
  makeTask,
  operation,
  readFreshTasks,
} from './a2Fixtures';

describe('GAP-P0-01A2 shared backend concurrency contract', () => {
  it('serializes barrier-controlled creates across two repositories without a lost task', async () => {
    const backend = new PhysicalTaskBackend();
    const storageA = new ControlledTaskStorage(backend);
    const storageB = new ControlledTaskStorage(backend);
    storageA.seedTasks([]);
    const repositoryA = createTaskRepository(storageA, A2_STORAGE_KEY);
    const repositoryB = createTaskRepository(storageB, A2_STORAGE_KEY);
    const serviceA = createA2Harness({
      backend,
      storage: storageA,
      repository: repositoryA,
      idGenerator: () => 'concurrent-a',
    }).service;
    const serviceB = createA2Harness({
      backend,
      storage: storageB,
      repository: repositoryB,
      idGenerator: () => 'concurrent-b',
    }).service;
    const barrier = storageA.blockNextWrite();
    try {
      const first = serviceA.create(
        {title: 'Concurrent A', important: false, urgent: false},
        operation('concurrent:create:a'),
      );
      await expectBarrierBeforeSettlement(barrier, first);
      const second = serviceB.create(
        {title: 'Concurrent B', important: true, urgent: true},
        operation('concurrent:create:b'),
      );
      barrier.release();

      await expect(first).resolves.toMatchObject({id: 'concurrent-a'});
      await expect(second).resolves.toMatchObject({id: 'concurrent-b'});
      expect((await readFreshTasks(backend)).map(task => task.id)).toEqual([
        'concurrent-a',
        'concurrent-b',
      ]);
      expect(storageA.setCommits.length + storageB.setCommits.length).toBe(2);
    } finally {
      barrier.release();
    }
  });

  it('merges concurrent patches against the latest committed task instead of losing a field', async () => {
    const backend = new PhysicalTaskBackend();
    const storageA = new ControlledTaskStorage(backend);
    const storageB = new ControlledTaskStorage(backend);
    const baseline = makeTask('concurrent-update');
    storageA.seedTasks([baseline]);
    const serviceA = createA2Harness({
      backend,
      storage: storageA,
      repository: createTaskRepository(storageA, A2_STORAGE_KEY),
    }).service;
    const serviceB = createA2Harness({
      backend,
      storage: storageB,
      repository: createTaskRepository(storageB, A2_STORAGE_KEY),
    }).service;
    const barrier = storageA.blockNextWrite();
    try {
      const titleUpdate = serviceA.update(
        baseline.id,
        {title: 'Concurrent title'},
        operation('concurrent:update:title'),
      );
      await expectBarrierBeforeSettlement(barrier, titleUpdate);
      const descriptionUpdate = serviceB.update(
        baseline.id,
        {description: 'Concurrent description'},
        operation('concurrent:update:description'),
      );
      barrier.release();
      await Promise.all([titleUpdate, descriptionUpdate]);

      await expect(readFreshTasks(backend)).resolves.toEqual([
        expect.objectContaining({
          id: baseline.id,
          title: 'Concurrent title',
          description: 'Concurrent description',
        }),
      ]);
    } finally {
      barrier.release();
    }
  });

  it('turns a concurrent generated-ID collision into one stable error without overwrite', async () => {
    const backend = new PhysicalTaskBackend();
    const storageA = new ControlledTaskStorage(backend);
    const storageB = new ControlledTaskStorage(backend);
    storageA.seedTasks([]);
    const serviceA = createA2Harness({
      backend,
      storage: storageA,
      repository: createTaskRepository(storageA, A2_STORAGE_KEY),
      idGenerator: () => 'collision-id',
    }).service;
    const serviceB = createA2Harness({
      backend,
      storage: storageB,
      repository: createTaskRepository(storageB, A2_STORAGE_KEY),
      idGenerator: () => 'collision-id',
    }).service;
    const barrier = storageA.blockNextWrite();
    try {
      const winner = serviceA.create(
        {title: 'Collision winner', important: false, urgent: false},
        operation('collision:winner'),
      );
      await expectBarrierBeforeSettlement(barrier, winner);
      const rejected = serviceB.create(
        {title: 'Collision rejected', important: true, urgent: true},
        operation('collision:rejected'),
      );
      barrier.release();

      await expect(winner).resolves.toMatchObject({
        id: 'collision-id',
        title: 'Collision winner',
      });
      await expectErrorCode(() => rejected, 'TASK_ALREADY_EXISTS');
      await expect(readFreshTasks(backend)).resolves.toEqual([
        expect.objectContaining({
          id: 'collision-id',
          title: 'Collision winner',
        }),
      ]);
    } finally {
      barrier.release();
    }
  });

  it('deduplicates and conflict-checks one operation ID across service facades', async () => {
    const backend = new PhysicalTaskBackend();
    const storageA = new ControlledTaskStorage(backend);
    const storageB = new ControlledTaskStorage(backend);
    storageA.seedTasks([]);
    const idsA = new SequenceIds(['shared-operation-id']);
    const idsB = new SequenceIds(['must-not-be-consumed']);
    const serviceA = createA2Harness({
      backend,
      storage: storageA,
      repository: createTaskRepository(storageA, A2_STORAGE_KEY),
      idGenerator: idsA.next,
    }).service;
    const serviceB = createA2Harness({
      backend,
      storage: storageB,
      repository: createTaskRepository(storageB, A2_STORAGE_KEY),
      idGenerator: idsB.next,
    }).service;
    const barrier = storageA.blockNextWrite();
    const command = {
      title: 'Shared operation',
      important: true,
      urgent: false,
    };
    const op = operation('concurrent:shared-operation');
    try {
      const first = serviceA.create(command, op);
      await expectBarrierBeforeSettlement(barrier, first);
      const duplicate = serviceB.create({...command}, {...op});
      barrier.release();
      const [firstResult, duplicateResult] = await Promise.all([
        first,
        duplicate,
      ]);

      expect(duplicateResult).toEqual(firstResult);
      expect(duplicateResult).not.toBe(firstResult);
      expect(idsA.consumed).toBe(1);
      expect(idsB.consumed).toBe(0);
      expect(storageA.setCommits.length + storageB.setCommits.length).toBe(1);
      const writesABeforeConflict = storageA.setCommits.map(commit => ({
        ...commit,
      }));
      const writesBBeforeConflict = storageB.setCommits.map(commit => ({
        ...commit,
      }));
      const durableBeforeConflict = storageA.raw();
      expect(durableBeforeConflict).not.toBeNull();
      expect(storageB.raw()).toBe(durableBeforeConflict);
      const visibleABeforeConflict = await serviceA.list({includeDeleted: true});
      const visibleBBeforeConflict = await serviceB.list({includeDeleted: true});
      await expectErrorCode(
        () =>
          serviceB.create(
            {...command, title: 'Conflicting command'},
            operation('concurrent:shared-operation'),
        ),
        'OPERATION_ID_CONFLICT',
      );
      expect(storageA.setCommits).toEqual(writesABeforeConflict);
      expect(storageB.setCommits).toEqual(writesBBeforeConflict);
      expect(storageA.raw()).toBe(durableBeforeConflict);
      expect(storageB.raw()).toBe(durableBeforeConflict);
      expect(await serviceA.list({includeDeleted: true})).toEqual(
        visibleABeforeConflict,
      );
      expect(await serviceB.list({includeDeleted: true})).toEqual(
        visibleBBeforeConflict,
      );
      expect(idsA.consumed).toBe(1);
      expect(idsB.consumed).toBe(0);

      const [readA, readB, restartedTasks] = await Promise.all([
        serviceA.getById(firstResult.id, {includeDeleted: true}),
        serviceB.getById(firstResult.id, {includeDeleted: true}),
        readFreshTasks(backend),
      ]);
      expect(readA).toEqual(firstResult);
      expect(readB).toEqual(firstResult);
      expect(restartedTasks).toEqual([firstResult]);
    } finally {
      barrier.release();
    }
  });
});
