import type {Task} from './task';
import {selectHomeContinuation} from './homeContinuation';

export type HomePrimaryAction =
  | Readonly<{
      type: 'RESUME_ACTIVE_FOCUS';
      taskId: string;
      focusSessionId: string;
    }>
  | Readonly<{type: 'CONTINUE_TASK'; taskId: string}>
  | Readonly<{type: 'TRIAGE_URGENT_UNSORTED'; taskId: string}>
  | Readonly<{
      type: 'START_RECOMMENDED';
      taskId: string;
      reasons: readonly string[];
    }>
  | Readonly<{type: 'CAPTURE_FIRST_TASK'}>
  | Readonly<{type: 'NONE'}>;

type PlacementTask = Task & {placementState?: 'QUADRANT' | 'UNSORTED'};

export type HomePrimaryActionInput = Readonly<{
  tasks: readonly Task[];
  activeFocus: Readonly<{taskId: string; focusSessionId: string}> | null;
  recommended: Readonly<{taskId: string; reasons: readonly string[]}> | null;
  now: string;
}>;

function available(task: Task): boolean {
  return (
    task.deletedAt === null &&
    (task.status === 'pending' || task.status === 'in_progress')
  );
}

function urgentUnsorted(tasks: readonly Task[], now: string): Task | null {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) return null;
  const cutoff = nowMs + 24 * 60 * 60 * 1_000;
  return tasks
    .filter((task): task is PlacementTask =>
      available(task) &&
      (task as PlacementTask).placementState === 'UNSORTED' &&
      task.dueAt !== null &&
      Number.isFinite(Date.parse(task.dueAt)) &&
      Date.parse(task.dueAt) <= cutoff,
    )
    .slice()
    .sort((left, right) =>
      (left.dueAt ?? '').localeCompare(right.dueAt ?? '') ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
    )[0] ?? null;
}

export function selectHomePrimaryAction(
  input: HomePrimaryActionInput,
): HomePrimaryAction {
  const activeTasks = input.tasks.filter(available);
  if (input.activeFocus !== null) {
    const focusTask = activeTasks.find(
      task => task.id === input.activeFocus?.taskId,
    );
    if (focusTask !== undefined) {
      return {
        type: 'RESUME_ACTIVE_FOCUS',
        taskId: focusTask.id,
        focusSessionId: input.activeFocus.focusSessionId,
      };
    }
  }

  const continuation = selectHomeContinuation({
    tasks: activeTasks,
    activeFocusTaskId: null,
  });
  if (continuation !== null) {
    return {type: 'CONTINUE_TASK', taskId: continuation.task.id};
  }

  const triage = urgentUnsorted(activeTasks, input.now);
  if (triage !== null) {
    return {type: 'TRIAGE_URGENT_UNSORTED', taskId: triage.id};
  }

  if (
    input.recommended !== null &&
    activeTasks.some(task => task.id === input.recommended?.taskId)
  ) {
    return {
      type: 'START_RECOMMENDED',
      taskId: input.recommended.taskId,
      reasons: [...input.recommended.reasons],
    };
  }

  return activeTasks.length === 0
    ? {type: 'CAPTURE_FIRST_TASK'}
    : {type: 'NONE'};
}

export function homePrimaryActionKey(action: HomePrimaryAction): string {
  switch (action.type) {
    case 'RESUME_ACTIVE_FOCUS':
      return `${action.type}:${action.taskId}:${action.focusSessionId}`;
    case 'CONTINUE_TASK':
    case 'TRIAGE_URGENT_UNSORTED':
      return `${action.type}:${action.taskId}`;
    case 'START_RECOMMENDED':
      return `${action.type}:${action.taskId}:${action.reasons.join('|')}`;
    case 'CAPTURE_FIRST_TASK':
    case 'NONE':
      return action.type;
  }
}
