import type {Task} from './task';

export type HomeContinuation = Readonly<{
  task: Task;
  kind: 'active_focus' | 'started_task';
}>;

export function selectHomeContinuation(input: Readonly<{
  tasks: readonly Task[];
  activeFocusTaskId: string | null;
}>): HomeContinuation | null {
  const available = input.tasks.filter(
    task =>
      task.deletedAt === null &&
      (task.status === 'pending' || task.status === 'in_progress'),
  );
  if (input.activeFocusTaskId !== null) {
    const active = available.find(task => task.id === input.activeFocusTaskId);
    if (active !== undefined) {
      return {task: active, kind: 'active_focus'};
    }
  }
  const started = available
    .filter(task => task.status === 'in_progress' && task.startedAt !== null)
    .slice()
    .sort((left, right) => {
      const leftAt = left.startedAt ?? left.updatedAt;
      const rightAt = right.startedAt ?? right.updatedAt;
      return rightAt.localeCompare(leftAt) || left.id.localeCompare(right.id);
    })[0];
  return started === undefined ? null : {task: started, kind: 'started_task'};
}
