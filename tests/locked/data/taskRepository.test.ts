import {createTaskRepository} from '../../../src/data/taskRepository';
import {MemoryKeyValueStorage} from '../fixtures/memoryStorage';
import {ISO, makeTask} from '../fixtures/taskFactory';

const STORAGE_KEY = 'start-five.tasks.v1';

describe('SF-004 local repository CRUD and durable reload', () => {
  it('creates, reads, lists, and updates a task without mutating the input', async () => {
    const storage = new MemoryKeyValueStorage();
    const repository = createTaskRepository(storage);
    const input = makeTask();

    const created = await repository.create(input);
    const updated = await repository.update('task-1', {
      title: '更新后的周报',
      updatedAt: ISO.later,
    });

    expect(created).toEqual(input);
    expect(updated).toMatchObject({
      id: 'task-1',
      title: '更新后的周报',
      updatedAt: ISO.later,
    });
    expect(await repository.getById('task-1')).toEqual(updated);
    expect(await repository.list()).toEqual([updated]);
    expect(input.title).toBe('写周报');
  });

  it('reloads equivalent data from a new repository over the same storage', async () => {
    const storage = new MemoryKeyValueStorage();
    const first = createTaskRepository(storage);
    await first.create(makeTask());
    await first.update('task-1', {title: '持久化标题', updatedAt: ISO.later});

    const reloaded = createTaskRepository(storage);

    expect(await reloaded.getById('task-1')).toMatchObject({
      title: '持久化标题',
      updatedAt: ISO.later,
    });
    expect(await reloaded.list()).toEqual(await first.list());
  });

  it('rejects duplicate IDs and leaves the durable snapshot unchanged', async () => {
    const storage = new MemoryKeyValueStorage();
    const repository = createTaskRepository(storage);
    await repository.create(makeTask());
    const before = storage.raw(STORAGE_KEY);

    await expect(
      repository.create(makeTask({title: '重复 ID 的另一条记录'})),
    ).rejects.toMatchObject({code: 'TASK_ALREADY_EXISTS'});

    expect(storage.raw(STORAGE_KEY)).toBe(before);
    expect((await repository.getById('task-1'))?.title).toBe('写周报');
  });

  it('reports stable not-found errors for missing update and delete', async () => {
    const repository = createTaskRepository(new MemoryKeyValueStorage());

    await expect(
      repository.update('missing', {title: '不存在'}),
    ).rejects.toMatchObject({code: 'TASK_NOT_FOUND'});
    await expect(
      repository.softDelete('missing', ISO.deleted),
    ).rejects.toMatchObject({code: 'TASK_NOT_FOUND'});
  });
});

describe('SF-004 soft deletion and mutation idempotency', () => {
  it('hides a soft-deleted task by default and reveals it only on request', async () => {
    const storage = new MemoryKeyValueStorage();
    const repository = createTaskRepository(storage);
    await repository.create(makeTask());

    const deleted = await repository.softDelete('task-1', ISO.deleted);

    expect(deleted.deletedAt).toBe(ISO.deleted);
    expect(await repository.getById('task-1')).toBeNull();
    expect(await repository.list()).toEqual([]);
    expect(
      await repository.getById('task-1', {includeDeleted: true}),
    ).toEqual(deleted);
    expect(await repository.list({includeDeleted: true})).toEqual([deleted]);
  });

  it('makes a repeated delete a no-write no-op and preserves the first timestamp', async () => {
    const storage = new MemoryKeyValueStorage();
    const repository = createTaskRepository(storage);
    await repository.create(makeTask());
    const first = await repository.softDelete('task-1', ISO.deleted);
    const writesAfterFirstDelete = storage.setCalls.length;

    const repeated = await repository.softDelete(
      'task-1',
      '2026-02-01T00:00:00.000Z',
    );

    expect(repeated).toEqual(first);
    expect(repeated.deletedAt).toBe(ISO.deleted);
    expect(storage.setCalls).toHaveLength(writesAfterFirstDelete);
  });

  it('does not expose an uncommitted in-memory update after storage failure', async () => {
    const storage = new MemoryKeyValueStorage();
    const repository = createTaskRepository(storage);
    await repository.create(makeTask());
    const before = storage.raw(STORAGE_KEY);
    storage.failNextSetWith = new Error('disk full');

    await expect(
      repository.update('task-1', {
        title: '不应泄漏',
        updatedAt: ISO.later,
      }),
    ).rejects.toThrow('disk full');

    expect(storage.raw(STORAGE_KEY)).toBe(before);
    expect((await repository.getById('task-1'))?.title).toBe('写周报');
  });
});

describe('SF-004 atomic transaction semantics', () => {
  it('rolls back every staged operation when the callback throws', async () => {
    const storage = new MemoryKeyValueStorage();
    const repository = createTaskRepository(storage);
    await repository.create(makeTask());
    const before = storage.raw(STORAGE_KEY);
    const writesBefore = storage.setCalls.length;

    await expect(
      repository.transaction(async transaction => {
        await transaction.update('task-1', {
          title: '事务内标题',
          updatedAt: ISO.later,
        });
        await transaction.create(makeTask({id: 'task-2', title: '事务内新增'}));
        throw new Error('abort transaction');
      }),
    ).rejects.toThrow('abort transaction');

    expect(storage.raw(STORAGE_KEY)).toBe(before);
    expect(storage.setCalls).toHaveLength(writesBefore);
    expect((await repository.getById('task-1'))?.title).toBe('写周报');
    expect(await repository.getById('task-2')).toBeNull();
  });

  it('commits all staged changes with exactly one durable write', async () => {
    const storage = new MemoryKeyValueStorage();
    const repository = createTaskRepository(storage);
    await repository.create(makeTask());
    const writesBefore = storage.setCalls.length;

    const callbackResult = await repository.transaction(async transaction => {
      await transaction.update('task-1', {
        title: '事务已提交',
        updatedAt: ISO.later,
      });
      await transaction.create(makeTask({id: 'task-2', title: '第二项'}));
      return 'committed';
    });

    expect(callbackResult).toBe('committed');
    expect(storage.setCalls).toHaveLength(writesBefore + 1);
    expect((await repository.getById('task-1'))?.title).toBe('事务已提交');
    expect(await repository.getById('task-2')).toMatchObject({title: '第二项'});
  });

  it('leaves both durable and visible state unchanged when commit itself fails', async () => {
    const storage = new MemoryKeyValueStorage();
    const repository = createTaskRepository(storage);
    await repository.create(makeTask());
    const before = storage.raw(STORAGE_KEY);
    storage.failNextSetWith = new Error('commit failed');

    await expect(
      repository.transaction(async transaction => {
        await transaction.update('task-1', {
          title: '不应提交',
          updatedAt: ISO.later,
        });
      }),
    ).rejects.toThrow('commit failed');

    expect(storage.raw(STORAGE_KEY)).toBe(before);
    expect((await repository.getById('task-1'))?.title).toBe('写周报');
  });
});

describe('SF-004 custom storage key and complete transaction surface', () => {
  it('persists and reloads through the caller-supplied storage key only', async () => {
    const storage = new MemoryKeyValueStorage();
    const customKey = 'tenant-a.start-five.tasks.v1';
    const repository = createTaskRepository(storage, customKey);

    await repository.create(makeTask({id: 'custom-task'}));

    expect(storage.raw(customKey)).not.toBeNull();
    expect(storage.raw(STORAGE_KEY)).toBeNull();
    const reloaded = createTaskRepository(storage, customKey);
    await expect(reloaded.getById('custom-task')).resolves.toMatchObject({
      id: 'custom-task',
    });
  });

  it('makes getById/list observe a staged softDelete and commits it atomically', async () => {
    const storage = new MemoryKeyValueStorage();
    const repository = createTaskRepository(storage);
    await repository.create(makeTask({id: 'task-1'}));
    await repository.create(makeTask({id: 'task-2', title: 'Second'}));
    const writesBefore = storage.setCalls.length;

    const result = await repository.transaction(async transaction => {
      expect(await transaction.getById('task-1')).toMatchObject({id: 'task-1'});
      expect(await transaction.list()).toHaveLength(2);

      const deleted = await transaction.softDelete('task-1', ISO.deleted);

      expect(await transaction.getById('task-1')).toBeNull();
      expect(
        await transaction.getById('task-1', {includeDeleted: true}),
      ).toEqual(deleted);
      expect((await transaction.list()).map(task => task.id)).toEqual(['task-2']);
      expect(await transaction.list({includeDeleted: true})).toHaveLength(2);
      return deleted;
    });

    expect(result.deletedAt).toBe(ISO.deleted);
    expect(storage.setCalls).toHaveLength(writesBefore + 1);
    expect(await repository.getById('task-1')).toBeNull();
    expect((await repository.list()).map(task => task.id)).toEqual(['task-2']);
  });

  it('rolls back a staged softDelete and every transactional read view', async () => {
    const storage = new MemoryKeyValueStorage();
    const repository = createTaskRepository(storage);
    await repository.create(makeTask({id: 'task-1'}));
    await repository.create(makeTask({id: 'task-2', title: 'Second'}));
    const before = storage.raw(STORAGE_KEY);
    const writesBefore = storage.setCalls.length;

    await expect(
      repository.transaction(async transaction => {
        await transaction.softDelete('task-1', ISO.deleted);
        expect(await transaction.getById('task-1')).toBeNull();
        expect(await transaction.list()).toHaveLength(1);
        throw new Error('rollback staged delete');
      }),
    ).rejects.toThrow('rollback staged delete');

    expect(storage.raw(STORAGE_KEY)).toBe(before);
    expect(storage.setCalls).toHaveLength(writesBefore);
    expect(await repository.getById('task-1')).toMatchObject({id: 'task-1'});
    expect(await repository.list()).toHaveLength(2);
  });
});
