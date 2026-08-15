import {DomainError, type Subtask, type Task} from './task';

export function selectNextStep(task: Task): Subtask | null {
  for (const subtask of task.subtasks) {
    if (subtask.taskId !== task.id) {
      throw new DomainError('SUBTASK_PARENT_MISMATCH');
    }
  }

  return task.subtasks.find(subtask => subtask.status !== 'completed') ?? null;
}
