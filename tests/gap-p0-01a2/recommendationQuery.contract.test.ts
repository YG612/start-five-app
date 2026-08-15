import type {TaskLifecycleService} from '../../src/application/coreAppService';
import type {TaskRepository} from '../../src/data/taskRepository';
import {QUADRANT_POSITION} from '../../src/domain/quadrant';
import type {Task} from '../../src/domain/task';
import {
  A2_NOW,
  createA2Harness,
  createFreshA2Harness,
  makeCancelledTask,
  makeCompletedTask,
  makeDeletedTask,
  makeInProgressTask,
  makeSubtask,
  makeTask,
  operation,
} from './a2Fixtures';

function createChangingReadRepository(
  snapshots: readonly (readonly Task[])[],
): {repository: TaskRepository; listCalls(): number} {
  let reads = 0;
  const cloneSnapshot = (tasks: readonly Task[]): Task[] =>
    tasks.map(task => ({
      ...task,
      subtasks: task.subtasks.map(subtask => ({...subtask})),
    }));
  const repository: TaskRepository = {
    async create() {
      throw new Error('A2_QUERY_UNEXPECTED_CREATE');
    },
    async getById() {
      throw new Error('A2_QUERY_UNEXPECTED_GET_BY_ID');
    },
    async list() {
      const snapshot = snapshots[reads];
      reads += 1;
      if (snapshot === undefined) {
        throw new Error('A2_QUERY_EXTRA_LIST_READ');
      }
      return cloneSnapshot(snapshot);
    },
    async update() {
      throw new Error('A2_QUERY_UNEXPECTED_UPDATE');
    },
    async softDelete() {
      throw new Error('A2_QUERY_UNEXPECTED_SOFT_DELETE');
    },
    async transaction() {
      throw new Error('A2_QUERY_UNEXPECTED_TRANSACTION');
    },
  };
  return {repository, listCalls: () => reads};
}

async function expectDetachedRecommendation(
  service: TaskLifecycleService,
  expectedSource: Task,
): Promise<void> {
  const sourceSubtask = expectedSource.subtasks[0];
  if (sourceSubtask === undefined) {
    throw new Error('A2_RECOMMENDATION_SOURCE_SUBTASK_MISSING');
  }
  const first = await service.getRecommendation();
  if (first === null || first.subtasks[0] === undefined) {
    throw new Error('A2_RECOMMENDATION_RESULT_SUBTASK_MISSING');
  }

  expect(first.id).toBe(expectedSource.id);
  expect(first).not.toBe(expectedSource);
  expect(first.subtasks).not.toBe(expectedSource.subtasks);
  expect(first.subtasks[0]).not.toBe(sourceSubtask);
  first.subtasks[0].title = 'Mutated recommendation result';
  expect(sourceSubtask.title).toBe(`Step for ${expectedSource.id}`);

  const reread = await service.getRecommendation();
  if (reread === null || reread.subtasks[0] === undefined) {
    throw new Error('A2_RECOMMENDATION_REREAD_SUBTASK_MISSING');
  }
  expect(reread.id).toBe(expectedSource.id);
  expect(reread).not.toBe(first);
  expect(reread.subtasks).not.toBe(first.subtasks);
  expect(reread.subtasks[0]).not.toBe(first.subtasks[0]);
  expect(reread.subtasks[0].title).toBe(`Step for ${expectedSource.id}`);
  expect(sourceSubtask.title).toBe(`Step for ${expectedSource.id}`);
}

describe('GAP-P0-01A2 recommendation and coherent query contract', () => {
  it('recommends an in-progress task first, then active quadrants in Q1-Q4 order', async () => {
    const q1 = makeTask('recommend-q1', {important: true, urgent: true});
    const q2 = makeTask('recommend-q2', {important: true, urgent: false});
    const q3 = makeTask('recommend-q3', {important: false, urgent: true});
    const q4InProgress = makeInProgressTask('recommend-q4-active');
    const {service} = createA2Harness({tasks: [q3, q2, q1, q4InProgress]});

    await expect(service.getRecommendation()).resolves.toMatchObject({
      id: q4InProgress.id,
    });

    const pendingOnly = createA2Harness({tasks: [q3, q2, q1, makeTask('q4')]});
    await expect(pendingOnly.service.getRecommendation()).resolves.toMatchObject(
      {id: q1.id},
    );
  });

  it('excludes a future Q1 task when an eligible Q4 fallback exists', async () => {
    const future = makeTask('recommend-future-q1', {
      important: true,
      urgent: true,
      startAt: '2026-08-05T10:00:00.001Z',
      scheduledStartAt: '2026-08-05T10:00:00.001Z',
    });
    const fallback = makeTask('recommend-future-fallback', {
      subtasks: [makeSubtask('recommend-future-fallback')],
    });
    const {service} = createA2Harness({tasks: [future, fallback]});

    await expectDetachedRecommendation(service, fallback);
  });

  it('keeps an overdue due-active task eligible against a Q4 fallback', async () => {
    const dueActive = makeTask('recommend-overdue-active', {
      important: true,
      urgent: false,
      startAt: '2026-08-05T08:00:00.000Z',
      scheduledStartAt: '2026-08-05T08:00:00.000Z',
      dueAt: '2026-08-05T09:00:00.000Z',
      subtasks: [makeSubtask('recommend-overdue-active')],
    });
    const fallback = makeTask('recommend-overdue-fallback', {
      subtasks: [makeSubtask('recommend-overdue-fallback')],
    });
    const {service} = createA2Harness({tasks: [fallback, dueActive]});

    await expectDetachedRecommendation(service, dueActive);
  });

  it.each([
    {
      label: 'completed',
      excluded: makeCompletedTask('recommend-excluded-completed', {
        important: true,
        urgent: true,
      }),
    },
    {
      label: 'cancelled',
      excluded: makeCancelledTask('recommend-excluded-cancelled', {
        important: true,
        urgent: true,
      }),
    },
    {
      label: 'deleted',
      excluded: makeDeletedTask('recommend-excluded-deleted', {
        important: true,
        urgent: true,
      }),
    },
  ])(
    'excludes a $label task independently when an eligible fallback exists',
    async ({label, excluded}) => {
      const fallbackId = `recommend-${label}-fallback`;
      const fallback = makeTask(fallbackId, {
        subtasks: [makeSubtask(fallbackId)],
      });
      const {service} = createA2Harness({tasks: [excluded, fallback]});

      await expectDetachedRecommendation(service, fallback);
    },
  );

  it('admits a task scheduled exactly at now against an eligible fallback', async () => {
    const exactNow = makeTask('recommend-exactly-now', {
      important: true,
      urgent: true,
      startAt: A2_NOW,
      scheduledStartAt: A2_NOW,
      subtasks: [makeSubtask('recommend-exactly-now')],
    });
    const fallback = makeTask('recommend-exact-now-fallback', {
      subtasks: [makeSubtask('recommend-exact-now-fallback')],
    });
    const {service} = createA2Harness({tasks: [fallback, exactNow]});

    await expectDetachedRecommendation(service, exactNow);
  });

  it('uses scheduled, due, created, and ID tie-breakers deterministically within one status and quadrant', async () => {
    const cases = [
      {
        tasks: [
          makeTask('rank-schedule-null', {
            important: true,
            urgent: true,
            startAt: null,
          }),
          makeTask('rank-schedule-value', {
            important: true,
            urgent: true,
            startAt: '2026-08-05T09:00:00.000Z',
          }),
        ],
        expected: 'rank-schedule-value',
      },
      {
        tasks: [
          makeTask('rank-schedule-later', {
            important: true,
            urgent: true,
            startAt: '2026-08-05T09:30:00.000Z',
            dueAt: '2026-08-05T09:30:00.000Z',
          }),
          makeTask('rank-schedule-earlier', {
            important: true,
            urgent: true,
            startAt: '2026-08-05T09:00:00.000Z',
            dueAt: null,
          }),
        ],
        expected: 'rank-schedule-earlier',
      },
      {
        tasks: [
          makeTask('rank-due-null', {
            important: true,
            urgent: true,
            startAt: '2026-08-05T09:00:00.000Z',
            dueAt: null,
          }),
          makeTask('rank-due-value', {
            important: true,
            urgent: true,
            startAt: '2026-08-05T09:00:00.000Z',
            dueAt: '2026-08-06T09:00:00.000Z',
          }),
        ],
        expected: 'rank-due-value',
      },
      {
        tasks: [
          makeTask('rank-created-later', {
            important: true,
            urgent: true,
            createdAt: '2026-08-05T08:01:00.000Z',
            updatedAt: '2026-08-05T08:01:00.000Z',
          }),
          makeTask('rank-created-earlier', {
            important: true,
            urgent: true,
            createdAt: '2026-08-05T08:00:00.000Z',
          }),
        ],
        expected: 'rank-created-earlier',
      },
      {
        tasks: [
          makeTask('rank-id-b', {important: true, urgent: true}),
          makeTask('rank-id-a', {important: true, urgent: true}),
        ],
        expected: 'rank-id-a',
      },
    ];

    for (const entry of cases) {
      const {service} = createA2Harness({tasks: entry.tasks});
      await expect(service.getRecommendation()).resolves.toMatchObject({
        id: entry.expected,
      });
    }
  });

  it('refreshes immediately after create, flag update, completion, and deletion', async () => {
    const fallback = makeTask('refresh-fallback');
    const target = makeTask('refresh-target', {important: true, urgent: true});
    const {service} = createA2Harness({
      tasks: [fallback, target],
      idGenerator: () => 'refresh-created',
    });

    await expect(service.getRecommendation()).resolves.toMatchObject({
      id: target.id,
    });
    await service.update(
      target.id,
      {important: false, urgent: false},
      operation('recommend:refresh:update'),
    );
    await expect(service.getRecommendation()).resolves.toMatchObject({
      id: fallback.id,
    });
    await service.complete(
      fallback.id,
      operation('recommend:refresh:complete'),
    );
    await expect(service.getRecommendation()).resolves.toMatchObject({
      id: target.id,
    });
    const created = await service.create(
      {
        title: 'New Q1',
        important: true,
        urgent: true,
      },
      operation('recommend:refresh:create'),
    );
    await expect(service.getRecommendation()).resolves.toMatchObject({
      id: created.id,
    });
    await service.softDelete(
      created.id,
      operation('recommend:refresh:delete'),
    );
    await expect(service.getRecommendation()).resolves.toMatchObject({
      id: target.id,
    });
  });

  it('refreshes after reschedule and delay move the current recommendation across now', async () => {
    const q1 = makeTask('refresh-schedule-q1', {
      important: true,
      urgent: true,
    });
    const q2 = makeTask('refresh-schedule-q2', {
      important: true,
      urgent: false,
    });
    const {service} = createA2Harness({tasks: [q1, q2]});

    await expect(service.getRecommendation()).resolves.toMatchObject({id: q1.id});
    await service.reschedule(
      q1.id,
      {scheduledStartAt: '2026-08-05T10:00:00.001Z'},
      operation('recommend:reschedule:future'),
    );
    await expect(service.getRecommendation()).resolves.toMatchObject({id: q2.id});
    await service.reschedule(
      q1.id,
      {scheduledStartAt: null},
      operation('recommend:reschedule:eligible'),
    );
    await expect(service.getRecommendation()).resolves.toMatchObject({id: q1.id});
    await service.delay(
      q1.id,
      {minutes: 1},
      operation('recommend:delay:future'),
    );
    await expect(service.getRecommendation()).resolves.toMatchObject({id: q2.id});
  });

  it('returns an internally coherent empty or populated query snapshot', async () => {
    const empty = createA2Harness();
    await expect(empty.service.getRecommendation()).resolves.toBeNull();
    await expect(empty.service.getQueryResult()).resolves.toEqual({
      tasks: [],
      recommendation: null,
      quadrants: [
        {
          quadrant: 'Q1',
          position: QUADRANT_POSITION.Q1,
          totalCount: 0,
          preview: [],
          allTasks: [],
        },
        {
          quadrant: 'Q2',
          position: QUADRANT_POSITION.Q2,
          totalCount: 0,
          preview: [],
          allTasks: [],
        },
        {
          quadrant: 'Q3',
          position: QUADRANT_POSITION.Q3,
          totalCount: 0,
          preview: [],
          allTasks: [],
        },
        {
          quadrant: 'Q4',
          position: QUADRANT_POSITION.Q4,
          totalCount: 0,
          preview: [],
          allTasks: [],
        },
      ],
    });

    const q1 = makeTask('query-q1', {important: true, urgent: true});
    const q4 = makeTask('query-q4');
    const deleted = makeDeletedTask('query-deleted');
    const populated = createA2Harness({tasks: [q4, deleted, q1]});
    const result = await populated.service.getQueryResult();

    expect(result.tasks.map(task => task.id)).toEqual([q4.id, q1.id]);
    expect(result.recommendation?.id).toBe(q1.id);
    expect(result.quadrants[0].allTasks.map(task => task.id)).toEqual([q1.id]);
    expect(result.quadrants[3].allTasks.map(task => task.id)).toEqual([q4.id]);
    expect(
      result.quadrants.flatMap(bucket => bucket.allTasks).some(
        task => task.id === deleted.id,
      ),
    ).toBe(false);
  });

  it('builds query tasks, recommendation, and quadrants from one repository list snapshot', async () => {
    const firstSnapshot = [
      makeTask('query-single-snapshot-q1', {
        important: true,
        urgent: true,
        subtasks: [makeSubtask('query-single-snapshot-q1')],
      }),
    ];
    const laterSnapshot = [makeTask('query-later-snapshot-q4')];
    const changing = createChangingReadRepository([
      firstSnapshot,
      laterSnapshot,
      [],
    ]);
    const {service} = createA2Harness({repository: changing.repository});

    const result = await service.getQueryResult();

    expect(changing.listCalls()).toBe(1);
    expect(result.tasks.map(task => task.id)).toEqual([
      'query-single-snapshot-q1',
    ]);
    expect(result.recommendation?.id).toBe('query-single-snapshot-q1');
    expect(result.quadrants[0].allTasks.map(task => task.id)).toEqual([
      'query-single-snapshot-q1',
    ]);
    expect(result.quadrants.slice(1).every(bucket => bucket.totalCount === 0)).toBe(
      true,
    );

    const taskView = result.tasks[0];
    const recommendationView = result.recommendation;
    const previewView = result.quadrants[0].preview[0];
    const allTasksView = result.quadrants[0].allTasks[0];
    if (
      taskView === undefined ||
      recommendationView === null ||
      previewView === undefined ||
      allTasksView === undefined
    ) {
      throw new Error('A2_QUERY_NESTED_SINGLE_SNAPSHOT_FIXTURE_MISSING');
    }
    taskView.subtasks[0]!.title = 'Mutated query task nested view';
    expect(recommendationView.subtasks[0]!.title).toBe(
      'Step for query-single-snapshot-q1',
    );
    expect(previewView.subtasks[0]!.title).toBe(
      'Step for query-single-snapshot-q1',
    );
    expect(allTasksView.subtasks[0]!.title).toBe(
      'Step for query-single-snapshot-q1',
    );
  });

  it('deep-separates every nested query representation and preserves fresh reads and restart', async () => {
    const source = makeTask('query-nested-alias', {
      important: true,
      urgent: true,
      subtasks: [makeSubtask('query-nested-alias')],
    });
    const {backend, service} = createA2Harness({tasks: [source]});
    const result = await service.getQueryResult();
    const taskView = result.tasks[0];
    const recommendationView = result.recommendation;
    const previewView = result.quadrants[0].preview[0];
    const allTasksView = result.quadrants[0].allTasks[0];
    if (
      taskView === undefined ||
      recommendationView === null ||
      previewView === undefined ||
      allTasksView === undefined
    ) {
      throw new Error('A2_QUERY_NESTED_ALIAS_FIXTURE_MISSING');
    }

    taskView.subtasks[0]!.title = 'Mutated tasks nested view';
    expect(recommendationView.subtasks[0]!.title).toBe(
      'Step for query-nested-alias',
    );
    expect(previewView.subtasks[0]!.title).toBe('Step for query-nested-alias');
    expect(allTasksView.subtasks[0]!.title).toBe('Step for query-nested-alias');

    recommendationView.subtasks[0]!.title = 'Mutated recommendation nested view';
    expect(taskView.subtasks[0]!.title).toBe('Mutated tasks nested view');
    expect(previewView.subtasks[0]!.title).toBe('Step for query-nested-alias');
    expect(allTasksView.subtasks[0]!.title).toBe('Step for query-nested-alias');

    previewView.subtasks[0]!.title = 'Mutated preview nested view';
    expect(taskView.subtasks[0]!.title).toBe('Mutated tasks nested view');
    expect(recommendationView.subtasks[0]!.title).toBe(
      'Mutated recommendation nested view',
    );
    expect(allTasksView.subtasks[0]!.title).toBe('Step for query-nested-alias');

    allTasksView.subtasks[0]!.title = 'Mutated allTasks nested view';
    expect(taskView.subtasks[0]!.title).toBe('Mutated tasks nested view');
    expect(recommendationView.subtasks[0]!.title).toBe(
      'Mutated recommendation nested view',
    );
    expect(previewView.subtasks[0]!.title).toBe('Mutated preview nested view');

    const fresh = await service.getQueryResult();
    expect(fresh.tasks[0]?.subtasks[0]?.title).toBe(
      'Step for query-nested-alias',
    );
    expect(fresh.recommendation?.subtasks[0]?.title).toBe(
      'Step for query-nested-alias',
    );
    expect(fresh.quadrants[0].preview[0]?.subtasks[0]?.title).toBe(
      'Step for query-nested-alias',
    );
    expect(fresh.quadrants[0].allTasks[0]?.subtasks[0]?.title).toBe(
      'Step for query-nested-alias',
    );

    const restarted = await createFreshA2Harness(backend).service.getQueryResult();
    expect(restarted.tasks[0]?.subtasks[0]?.title).toBe(
      'Step for query-nested-alias',
    );
    expect(restarted.recommendation?.subtasks[0]?.title).toBe(
      'Step for query-nested-alias',
    );
    expect(restarted.quadrants[0].preview[0]?.subtasks[0]?.title).toBe(
      'Step for query-nested-alias',
    );
    expect(restarted.quadrants[0].allTasks[0]?.subtasks[0]?.title).toBe(
      'Step for query-nested-alias',
    );
  });
});
