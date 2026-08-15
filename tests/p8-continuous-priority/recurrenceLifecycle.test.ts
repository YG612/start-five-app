import {createTaskLifecycleService} from '../../src/application/coreAppService';
import {createTaskRepository, type KeyValueStorage} from '../../src/data/taskRepository';
import type {Task} from '../../src/domain/task';
import {
  copyTaskInput,
  nextRepeatDueAt,
} from '../../src/domain/taskRecurrence';
import type {TaskWithPriority} from '../../src/domain/taskPriority';

class MemoryStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();
  async getItem(key: string): Promise<string | null> { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string): Promise<void> { this.values.set(key, value); }
  async removeItem(key: string): Promise<void> { this.values.delete(key); }
}

const NOW = '2026-08-14T08:00:00.000Z';

describe('P8-05 copy and minimum recurrence', () => {
  it('calculates daily, selected-weekday, monthly, and month-end occurrences', () => {
    expect(nextRepeatDueAt('2026-08-14T08:00:00.000Z', {frequency: 'daily'})).toBe('2026-08-15T08:00:00.000Z');
    expect(new Date(nextRepeatDueAt('2026-08-14T08:00:00.000Z', {frequency: 'weekly', weekdays: [1]})).getDay()).toBe(1);
    expect(nextRepeatDueAt('2026-01-31T08:00:00.000Z', {frequency: 'monthly', dayOfMonth: 31}).slice(0, 10)).toBe('2026-02-28');
    expect(nextRepeatDueAt('2026-02-28T08:00:00.000Z', {frequency: 'monthly', dayOfMonth: 31}).slice(0, 10)).toBe('2026-03-31');
  });

  it('generates exactly one clean next task per completion operation', async () => {
    const repository = createTaskRepository(new MemoryStorage());
    const ids = ['source', 'next', 'third'];
    const lifecycle = createTaskLifecycleService({
      repository,
      now: () => NOW,
      idGenerator: () => ids.shift() ?? 'unexpected',
    });
    const input = {
      title: '每日复盘',
      description: '保留备注',
      important: true,
      urgent: false,
      dueAt: '2026-08-14T20:00:00.000Z',
      estimatedMinutes: 15,
      firstStep: '打开记录',
      prioritySchemaVersion: 1,
      importanceScore: 72,
      manualUrgencyScore: 24,
      urgencyMode: 'hybrid',
      repeatRule: {frequency: 'daily'} as const,
    };
    const source = await lifecycle.create(input, {operationId: 'create'});
    await lifecycle.complete(source.id, {operationId: 'complete-source'});
    await lifecycle.complete(source.id, {operationId: 'complete-source'});
    const tasks = await lifecycle.list({includeDeleted: true});
    expect(tasks).toHaveLength(2);
    const next = tasks.find(item => item.id === 'next') as TaskWithPriority;
    expect(next).toMatchObject({
      status: 'pending',
      score: null,
      startedAt: null,
      completedAt: null,
      firstStep: '打开记录',
      importanceScore: 72,
      manualUrgencyScore: 24,
      repeatRule: {frequency: 'daily'},
    });
    expect((next as Task & {progress?: number}).progress).toBeUndefined();
    await lifecycle.complete(next.id, {operationId: 'complete-next'});
    expect(await lifecycle.list({includeDeleted: true})).toHaveLength(3);
  });

  it('can stop recurrence before completion', async () => {
    const repository = createTaskRepository(new MemoryStorage());
    const ids = ['source', 'should-not-exist'];
    const lifecycle = createTaskLifecycleService({repository, now: () => NOW, idGenerator: () => ids.shift() ?? 'x'});
    const source = await lifecycle.create({
      title: '可停止任务',
      important: true,
      urgent: false,
      dueAt: '2026-08-15T08:00:00.000Z',
      prioritySchemaVersion: 1,
      importanceScore: 80,
      manualUrgencyScore: 25,
      urgencyMode: 'hybrid',
      repeatRule: {frequency: 'daily'},
    } as Parameters<typeof lifecycle.create>[0], {operationId: 'create-stop'});
    await lifecycle.update(source.id, {repeatRule: null} as Parameters<typeof lifecycle.update>[1], {operationId: 'stop'});
    await lifecycle.complete(source.id, {operationId: 'complete-stop'});
    expect(await lifecycle.list({includeDeleted: true})).toHaveLength(1);
  });

  it('copies content and coordinates but clears completion, due date, progress, focus, and recurrence', () => {
    const source = {
      id: 'copy-source',
      title: '复制我',
      description: '备注',
      important: true,
      urgent: true,
      status: 'completed',
      startAt: null,
      dueAt: '2026-08-14T08:00:00.000Z',
      estimatedMinutes: 25,
      firstStep: '第一步',
      createdAt: NOW,
      updatedAt: NOW,
      startedAt: NOW,
      completedAt: NOW,
      deletedAt: null,
      score: 35,
      scoreAwardedAt: NOW,
      subtasks: [],
      progress: 100,
      prioritySchemaVersion: 1,
      importanceScore: 68,
      manualUrgencyScore: 77,
      urgencyMode: 'manual',
      repeatRule: {frequency: 'daily'},
    } as TaskWithPriority & {progress: 100};
    expect(copyTaskInput(source)).toEqual({
      title: '复制我',
      description: '备注',
      important: true,
      urgent: true,
      scheduledStartAt: null,
      dueAt: null,
      estimatedMinutes: 25,
      firstStep: '第一步',
      prioritySchemaVersion: 1,
      importanceScore: 68,
      manualUrgencyScore: 77,
      urgencyMode: 'manual',
      repeatRule: null,
    });
  });
});
