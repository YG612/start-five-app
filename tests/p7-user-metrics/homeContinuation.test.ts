import {selectHomeContinuation} from '../../src/domain/homeContinuation';
import type {Task} from '../../src/domain/task';

function task(input: Partial<Task> & Pick<Task, 'id' | 'status'>): Task {
  return {
    id: input.id,
    title: input.title ?? input.id,
    description: '',
    important: true,
    urgent: false,
    status: input.status,
    startAt: null,
    dueAt: null,
    createdAt: input.createdAt ?? '2026-08-14T07:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-08-14T07:00:00.000Z',
    startedAt: input.startedAt ?? null,
    completedAt: input.completedAt ?? null,
    deletedAt: input.deletedAt ?? null,
    score: input.score ?? null,
    scoreAwardedAt: input.scoreAwardedAt ?? null,
    subtasks: [],
  };
}

describe('P7 home continuation selector', () => {
  it('prefers an active focus over a more recently started task', () => {
    const active = task({id: 'active', status: 'in_progress', startedAt: '2026-08-14T07:10:00.000Z'});
    const recent = task({id: 'recent', status: 'in_progress', startedAt: '2026-08-14T07:50:00.000Z'});
    expect(selectHomeContinuation({tasks: [recent, active], activeFocusTaskId: active.id})).toEqual({
      task: active,
      kind: 'active_focus',
    });
  });

  it('selects the most recently started unfinished task with stable ties', () => {
    const first = task({id: 'a', status: 'in_progress', startedAt: '2026-08-14T07:30:00.000Z'});
    const second = task({id: 'b', status: 'in_progress', startedAt: '2026-08-14T07:30:00.000Z'});
    const input = {tasks: [second, first], activeFocusTaskId: null};
    expect(selectHomeContinuation(input)).toEqual({task: first, kind: 'started_task'});
    expect(selectHomeContinuation(input)).toEqual(selectHomeContinuation(input));
  });

  it('hides pending, completed, deleted, and missing tasks', () => {
    expect(selectHomeContinuation({
      tasks: [
        task({id: 'pending', status: 'pending'}),
        task({id: 'done', status: 'completed', completedAt: '2026-08-14T07:40:00.000Z'}),
        task({id: 'deleted', status: 'in_progress', startedAt: '2026-08-14T07:30:00.000Z', deletedAt: '2026-08-14T07:50:00.000Z'}),
      ],
      activeFocusTaskId: 'missing',
    })).toBeNull();
  });
});
