import {
  createCoreAppService,
  createTaskLifecycleService,
} from '../../src/application/coreAppService';
import {
  createPersistentTaskStorage,
  TASK_STORAGE_KEY,
} from '../../src/data/persistentTaskStorage';
import {createTaskRepository} from '../../src/data/taskRepository';
import {makeTask} from '../locked/fixtures/taskFactory';
import {
  createStuckRepairRecord,
  createTaskRescuePlan,
  nextStartAtForTask,
  type TaskWithSupport,
} from '../../src/domain/taskSupport';

class Backend {
  readonly values = new Map<string, string>();
  async getItem(key: string): Promise<string | null> { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string): Promise<void> { this.values.set(key, value); }
  async removeItem(key: string): Promise<void> { this.values.delete(key); }
}

const NOW = '2026-08-14T08:00:00.000Z';

describe('P9 task extension persistence and lifecycle', () => {
  it('keeps legacy tasks field-free and normalizes one malformed P9 record independently', async () => {
    const legacy = makeTask({id: 'legacy'});
    const malformed = {
      ...makeTask({id: 'malformed'}),
      supportSchemaVersion: 99,
      nextStartAt: 'not-a-time',
      rescuePlan: {bad: true},
    };
    const raw = JSON.stringify({schema: 'start-five.tasks', version: 1, tasks: [legacy, malformed]});
    const storage = createPersistentTaskStorage({
      getItem: async () => raw,
      setItem: async () => undefined,
      removeItem: async () => undefined,
    });
    const parsed = JSON.parse((await storage.getItem(TASK_STORAGE_KEY)) ?? '[]') as Array<Record<string, unknown>>;
    expect(parsed[0]).not.toHaveProperty('supportSchemaVersion');
    expect(parsed[1]).toMatchObject({supportSchemaVersion: 1, nextStartAt: null, rescuePlan: null});
    expect(nextStartAtForTask(parsed[0] as never)).toBeNull();
  });

  it('persists next start, local repair, and one attached rescue plan across restart', async () => {
    const backend = new Backend();
    const storage = createPersistentTaskStorage(backend);
    const repository = createTaskRepository(storage);
    const lifecycle = createTaskLifecycleService({repository, now: () => NOW, idGenerator: () => 'task-1'});
    await lifecycle.create({
      title: '提交报告', important: true, urgent: true,
      dueAt: '2026-08-14T18:00:00.000Z', firstStep: '打开报告',
    }, {operationId: 'create'});
    const repair = createStuckRepairRecord({
      taskId: 'task-1', reason: 'TOO_LARGE', action: 'SET_SMALLER_FIRST_STEP',
      firstStep: '写三条结论', focusMinutes: 5, now: NOW,
    });
    const rescuePlan = createTaskRescuePlan({
      taskId: 'task-1', minimumDeliverable: '一页摘要', nextRequiredStep: '写三条结论',
      focusMinutes: 15, now: NOW,
    });
    const update = lifecycle.update as unknown as (
      id: string, patch: Record<string, unknown>, operation: {operationId: string},
    ) => Promise<unknown>;
    await update('task-1', {
      supportSchemaVersion: 1,
      nextStartAt: '2026-08-14T09:00:00.000Z',
      stuckRepair: repair,
      rescuePlan,
      firstStep: rescuePlan.nextRequiredStep,
    }, {operationId: 'support'});
    const restarted = createTaskRepository(createPersistentTaskStorage(backend));
    const restored = await restarted.getById('task-1') as TaskWithSupport;
    expect(restored).toMatchObject({
      dueAt: '2026-08-14T18:00:00.000Z',
      nextStartAt: '2026-08-14T09:00:00.000Z',
      firstStep: '写三条结论',
      stuckRepair: {operationKey: repair.operationKey},
      rescuePlan: {taskId: 'task-1'},
    });
    expect(await restarted.list()).toHaveLength(1);
  });

  it('clears nextStartAt when starting while preserving deadline and never completing the task', async () => {
    const backend = new Backend();
    const repository = createTaskRepository(createPersistentTaskStorage(backend));
    await repository.create(Object.assign(makeTask({
      id: 'start-task',
      important: true,
      urgent: true,
      dueAt: '2026-08-14T18:00:00.000Z',
      createdAt: '2026-08-14T07:00:00.000Z',
      updatedAt: '2026-08-14T07:00:00.000Z',
    }), {supportSchemaVersion: 1 as const, nextStartAt: '2026-08-14T09:00:00.000Z'}));
    const service = createCoreAppService({repository, now: () => NOW, idGenerator: () => 'unused'});
    const started = await service.startRecommended({operationId: 'start'});
    expect(started).toMatchObject({status: 'in_progress', dueAt: '2026-08-14T18:00:00.000Z'});
    expect(nextStartAtForTask(started)).toBeNull();
    expect(started.completedAt).toBeNull();
  });
});
