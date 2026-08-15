import {
  completeSubtask,
  completeTask,
  createFirstStep,
  createTask,
  startTask,
} from '../../../src/domain/task';

const CREATED_AT = '2026-01-02T03:04:05.000Z';
const STARTED_AT = '2026-01-02T03:05:00.000Z';
const COMPLETED_AT = '2026-01-02T03:10:00.000Z';

describe('SF-001 task and subtask validation/state machine', () => {
  it('creates a normalized pending task with binary flags and empty children', () => {
    const task = createTask(
      {
        title: '  写周报  ',
        description: '  汇总本周进展  ',
        important: true,
        urgent: false,
      },
      {id: 'task-1', now: CREATED_AT},
    );

    expect(task).toMatchObject({
      id: 'task-1',
      title: '写周报',
      important: true,
      urgent: false,
      status: 'pending',
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      deletedAt: null,
      subtasks: [],
    });
  });

  it.each(['', '   ', '\n\t'])('rejects a blank task title (%j)', title => {
    expect(() =>
      createTask(
        {title, important: false, urgent: false},
        {id: 'task-1', now: CREATED_AT},
      ),
    ).toThrow(expect.objectContaining({code: 'TITLE_REQUIRED'}));
  });

  it('adds a trimmed first step that belongs to its task and keeps append order', () => {
    const task = createTask(
      {title: '写周报', important: true, urgent: false},
      {id: 'task-1', now: CREATED_AT},
    );
    const withFirst = createFirstStep(
      task,
      {title: '  打开文档  '},
      {id: 'step-1', now: CREATED_AT},
    );
    const withSecond = createFirstStep(
      withFirst,
      {title: '写标题'},
      {id: 'step-2', now: STARTED_AT},
    );

    expect(withSecond.subtasks.map(step => step.id)).toEqual(['step-1', 'step-2']);
    expect(withSecond.subtasks[0]).toMatchObject({
      id: 'step-1',
      taskId: 'task-1',
      title: '打开文档',
      status: 'pending',
    });
    expect(task.subtasks).toEqual([]);
  });

  it('rejects a blank first-step title', () => {
    const task = createTask(
      {title: '写周报', important: false, urgent: false},
      {id: 'task-1', now: CREATED_AT},
    );

    expect(() =>
      createFirstStep(task, {title: '   '}, {id: 'step-1', now: CREATED_AT}),
    ).toThrow(expect.objectContaining({code: 'SUBTASK_TITLE_REQUIRED'}));
  });

  it('moves a task pending -> in_progress and makes repeated start idempotent', () => {
    const task = createTask(
      {title: '写周报', important: false, urgent: true},
      {id: 'task-1', now: CREATED_AT},
    );

    const started = startTask(task, STARTED_AT);
    const startedAgain = startTask(started, COMPLETED_AT);

    expect(started).toMatchObject({status: 'in_progress', startedAt: STARTED_AT});
    expect(startedAgain).toEqual(started);
    expect(task.status).toBe('pending');
  });

  it.each(['completed', 'cancelled'] as const)(
    'does not start a %s task',
    status => {
      const task = createTask(
        {title: '写周报', important: false, urgent: false},
        {id: 'task-1', now: CREATED_AT},
      );

      expect(() => startTask({...task, status}, STARTED_AT)).toThrow(
        expect.objectContaining({code: 'INVALID_TASK_TRANSITION'}),
      );
    },
  );

  it('refuses to complete a task while a child step is unfinished', () => {
    const task = createFirstStep(
      createTask(
        {title: '写周报', important: true, urgent: true},
        {id: 'task-1', now: CREATED_AT},
      ),
      {title: '打开文档'},
      {id: 'step-1', now: CREATED_AT},
    );
    const started = startTask(task, STARTED_AT);

    expect(() => completeTask(started, COMPLETED_AT)).toThrow(
      expect.objectContaining({code: 'UNFINISHED_SUBTASKS'}),
    );
  });

  it('follows pending -> in_progress -> completed, once only, without mutating inputs', () => {
    const task = createFirstStep(
      createTask(
        {title: '写周报', important: true, urgent: true},
        {id: 'task-1', now: CREATED_AT},
      ),
      {title: '打开文档'},
      {id: 'step-1', now: CREATED_AT},
    );
    const started = startTask(task, STARTED_AT);
    const withDoneStep = completeSubtask(
      started,
      'step-1',
      '2026-01-02T03:07:00.000Z',
    );
    const repeatedStep = completeSubtask(withDoneStep, 'step-1', COMPLETED_AT);
    const completed = completeTask(withDoneStep, COMPLETED_AT);
    const repeatedTask = completeTask(completed, '2026-01-03T00:00:00.000Z');

    expect(withDoneStep.subtasks[0]).toMatchObject({
      status: 'completed',
      completedAt: '2026-01-02T03:07:00.000Z',
    });
    expect(task.status).toBe('pending');
    expect(started.status).toBe('in_progress');
    expect(repeatedStep).toEqual(withDoneStep);
    expect(completed).toMatchObject({
      status: 'completed',
      completedAt: COMPLETED_AT,
    });
    expect(repeatedTask).toEqual(completed);
    expect(task.subtasks[0]?.status).toBe('pending');
  });

  it('rejects completing a pending task directly', () => {
    const pending = createTask(
      {title: 'Must start first', important: false, urgent: false},
      {id: 'task-pending', now: CREATED_AT},
    );

    expect(() => completeTask(pending, COMPLETED_AT)).toThrow(
      expect.objectContaining({code: 'INVALID_TASK_TRANSITION'}),
    );
  });

  it('rejects completing a cancelled task', () => {
    const pending = createTask(
      {title: 'Cancelled task', important: false, urgent: false},
      {id: 'task-cancelled', now: CREATED_AT},
    );

    expect(() =>
      completeTask({...pending, status: 'cancelled'}, COMPLETED_AT),
    ).toThrow(expect.objectContaining({code: 'INVALID_TASK_TRANSITION'}));
  });
});

describe('SF-002 UTC ISO timestamp and start/deadline validation', () => {
  it('canonicalizes offset timestamps to UTC ISO strings', () => {
    const task = createTask(
      {
        title: '写周报',
        important: false,
        urgent: true,
        startAt: '2026-01-02T09:00:00+08:00',
        dueAt: '2026-01-02T10:30:00+08:00',
      },
      {id: 'task-1', now: '2026-01-02T08:00:00+08:00'},
    );

    expect(task.createdAt).toBe('2026-01-02T00:00:00.000Z');
    expect(task.startAt).toBe('2026-01-02T01:00:00.000Z');
    expect(task.dueAt).toBe('2026-01-02T02:30:00.000Z');
  });

  it.each(['not-a-date', '2026-13-40', ''])('rejects invalid start timestamps (%j)', startAt => {
    expect(() =>
      createTask(
        {
          title: '写周报',
          important: false,
          urgent: false,
          startAt,
        },
        {id: 'task-1', now: CREATED_AT},
      ),
    ).toThrow(expect.objectContaining({code: 'INVALID_TIMESTAMP'}));
  });

  it('rejects a start later than the deadline', () => {
    expect(() =>
      createTask(
        {
          title: '写周报',
          important: false,
          urgent: false,
          startAt: '2026-01-02T12:00:00.000Z',
          dueAt: '2026-01-02T11:59:59.999Z',
        },
        {id: 'task-1', now: CREATED_AT},
      ),
    ).toThrow(expect.objectContaining({code: 'INVALID_TIME_RANGE'}));
  });

  it('allows start and deadline equality', () => {
    const task = createTask(
      {
        title: '写周报',
        important: false,
        urgent: false,
        startAt: '2026-01-02T12:00:00.000Z',
        dueAt: '2026-01-02T12:00:00.000Z',
      },
      {id: 'task-1', now: CREATED_AT},
    );

    expect(task.startAt).toBe(task.dueAt);
  });

  it.each(['not-a-date', '2026-13-40', ''])('rejects invalid due timestamps (%j)', dueAt => {
    expect(() =>
      createTask(
        {
          title: 'Invalid deadline',
          important: false,
          urgent: false,
          dueAt,
        },
        {id: 'task-bad-due', now: CREATED_AT},
      ),
    ).toThrow(expect.objectContaining({code: 'INVALID_TIMESTAMP'}));
  });

  it('canonicalizes time input for every task state operation', () => {
    const task = createTask(
      {title: 'UTC pipeline', important: true, urgent: false},
      {id: 'task-utc', now: '2026-01-02T08:00:00+08:00'},
    );
    const withStep = createFirstStep(
      task,
      {title: 'UTC child'},
      {id: 'step-utc', now: '2026-01-02T08:01:00+08:00'},
    );
    const started = startTask(withStep, '2026-01-02T08:02:00+08:00');
    const stepDone = completeSubtask(
      started,
      'step-utc',
      '2026-01-02T08:03:00+08:00',
    );
    const completed = completeTask(stepDone, '2026-01-02T08:04:00+08:00');

    expect(task).toMatchObject({
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    expect(withStep).toMatchObject({updatedAt: '2026-01-02T00:01:00.000Z'});
    expect(withStep.subtasks[0]).toMatchObject({
      createdAt: '2026-01-02T00:01:00.000Z',
      updatedAt: '2026-01-02T00:01:00.000Z',
    });
    expect(started).toMatchObject({
      startedAt: '2026-01-02T00:02:00.000Z',
      updatedAt: '2026-01-02T00:02:00.000Z',
    });
    expect(stepDone).toMatchObject({updatedAt: '2026-01-02T00:03:00.000Z'});
    expect(stepDone.subtasks[0]).toMatchObject({
      completedAt: '2026-01-02T00:03:00.000Z',
      updatedAt: '2026-01-02T00:03:00.000Z',
    });
    expect(completed).toMatchObject({
      completedAt: '2026-01-02T00:04:00.000Z',
      updatedAt: '2026-01-02T00:04:00.000Z',
    });
  });

  it.each([
    [
      'createTask.now',
      () =>
        createTask(
          {title: 'Bad create clock', important: false, urgent: false},
          {id: 'task-clock', now: 'not-a-date'},
        ),
    ],
    [
      'createFirstStep.now',
      () =>
        createFirstStep(
          createTask(
            {title: 'Parent', important: false, urgent: false},
            {id: 'task-clock', now: CREATED_AT},
          ),
          {title: 'Child'},
          {id: 'step-clock', now: 'not-a-date'},
        ),
    ],
    [
      'startTask.now',
      () =>
        startTask(
          createTask(
            {title: 'Start clock', important: false, urgent: false},
            {id: 'task-clock', now: CREATED_AT},
          ),
          'not-a-date',
        ),
    ],
    [
      'completeSubtask.now',
      () => {
        const withStep = createFirstStep(
          createTask(
            {title: 'Step clock', important: false, urgent: false},
            {id: 'task-clock', now: CREATED_AT},
          ),
          {title: 'Child'},
          {id: 'step-clock', now: CREATED_AT},
        );
        return completeSubtask(
          startTask(withStep, STARTED_AT),
          'step-clock',
          'not-a-date',
        );
      },
    ],
    [
      'completeTask.now',
      () =>
        completeTask(
          startTask(
            createTask(
              {title: 'Complete clock', important: false, urgent: false},
              {id: 'task-clock', now: CREATED_AT},
            ),
            STARTED_AT,
          ),
          'not-a-date',
        ),
    ],
  ] as const)('rejects invalid timestamp input for %s', (_name, action) => {
    expect(action).toThrow(expect.objectContaining({code: 'INVALID_TIMESTAMP'}));
  });
});
