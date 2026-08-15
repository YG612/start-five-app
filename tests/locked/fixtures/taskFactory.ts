import type {Subtask, Task} from '../../../src/domain/task';

export const ISO = {
  created: '2026-01-02T03:04:05.000Z',
  later: '2026-01-02T03:09:05.000Z',
  completed: '2026-01-02T03:14:05.000Z',
  deleted: '2026-01-02T04:00:00.000Z',
} as const;

export function makeSubtask(overrides: Partial<Subtask> = {}): Subtask {
  return {
    id: 'step-1',
    taskId: 'task-1',
    title: '打开文档',
    status: 'pending',
    createdAt: ISO.created,
    updatedAt: ISO.created,
    completedAt: null,
    ...overrides,
  };
}

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: '写周报',
    description: '',
    important: false,
    urgent: false,
    status: 'pending',
    startAt: null,
    dueAt: null,
    createdAt: ISO.created,
    updatedAt: ISO.created,
    startedAt: null,
    completedAt: null,
    deletedAt: null,
    score: null,
    scoreAwardedAt: null,
    subtasks: [],
    ...overrides,
  };
}
