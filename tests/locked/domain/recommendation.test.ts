import {recommendNextTask} from '../../../src/domain/recommendation';
import {makeTask} from '../fixtures/taskFactory';

describe('SF-006 deterministic next-task recommendation', () => {
  it('filters completed, cancelled, and soft-deleted tasks', () => {
    const eligible = makeTask({id: 'eligible'});
    const tasks = [
      makeTask({id: 'done', status: 'completed'}),
      makeTask({id: 'cancelled', status: 'cancelled'}),
      makeTask({id: 'deleted', deletedAt: '2026-01-03T00:00:00.000Z'}),
      eligible,
    ];

    expect(recommendNextTask(tasks)).toMatchObject({id: 'eligible'});
    expect(recommendNextTask(tasks.slice(0, 3))).toBeNull();
  });

  it('prioritizes an already-started task before every pending task', () => {
    const pending = makeTask({
      id: 'pending',
      important: true,
      urgent: true,
      dueAt: '2026-01-01T00:00:00.000Z',
    });
    const started = makeTask({
      id: 'started',
      status: 'in_progress',
      important: false,
      urgent: false,
    });

    expect(recommendNextTask([pending, started])?.id).toBe('started');
  });

  it('uses importance before urgency', () => {
    const urgentOnly = makeTask({id: 'urgent', important: false, urgent: true});
    const importantOnly = makeTask({id: 'important', important: true, urgent: false});

    expect(recommendNextTask([urgentOnly, importantOnly])?.id).toBe('important');
  });

  it('uses urgency after importance', () => {
    const notUrgent = makeTask({id: 'not-urgent', important: true, urgent: false});
    const urgent = makeTask({id: 'urgent', important: true, urgent: true});

    expect(recommendNextTask([notUrgent, urgent])?.id).toBe('urgent');
  });

  it('uses deadline ascending and places missing deadlines last', () => {
    const noDue = makeTask({id: 'no-due', important: true, urgent: true});
    const later = makeTask({
      id: 'later',
      important: true,
      urgent: true,
      dueAt: '2026-02-01T00:00:00.000Z',
    });
    const sooner = makeTask({
      id: 'sooner',
      important: true,
      urgent: true,
      dueAt: '2026-01-15T00:00:00.000Z',
    });

    expect(recommendNextTask([noDue, later, sooner])?.id).toBe('sooner');
    expect(recommendNextTask([noDue, later])?.id).toBe('later');
  });

  it('uses creation time ascending after equal/no deadlines', () => {
    const newer = makeTask({id: 'newer', createdAt: '2026-01-02T00:00:00.000Z'});
    const older = makeTask({id: 'older', createdAt: '2026-01-01T00:00:00.000Z'});

    expect(recommendNextTask([newer, older])?.id).toBe('older');
  });

  it('breaks a complete tie by JavaScript ID lexical order', () => {
    const b = makeTask({id: 'task-b'});
    const a = makeTask({id: 'task-a'});

    expect(recommendNextTask([b, a])?.id).toBe('task-a');
  });

  it('is stable under every tested input permutation and does not mutate input', () => {
    const tasks = [
      makeTask({id: 'task-c'}),
      makeTask({id: 'task-a'}),
      makeTask({id: 'task-b'}),
    ];
    const originalIds = tasks.map(task => task.id);
    const permutations = [
      tasks,
      [tasks[2]!, tasks[0]!, tasks[1]!],
      [...tasks].reverse(),
    ];

    expect(permutations.map(items => recommendNextTask(items)?.id)).toEqual([
      'task-a',
      'task-a',
      'task-a',
    ]);
    expect(tasks.map(task => task.id)).toEqual(originalIds);
  });
});
