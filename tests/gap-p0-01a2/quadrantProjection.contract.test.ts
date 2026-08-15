import {
  QUADRANT_POSITION,
  projectTaskQuadrants,
  type TaskQuadrantProjection,
} from '../../src/domain/quadrant';
import {
  createA2Harness,
  makeCancelledTask,
  makeCompletedTask,
  makeDeletedTask,
  makeInProgressTask,
  makeSubtask,
  makeTask,
} from './a2Fixtures';

function projectionIds(
  projection: TaskQuadrantProjection,
): string[][] {
  return projection.map(bucket => bucket.allTasks.map(task => task.id));
}

describe('GAP-P0-01A2 fixed quadrant projection contract', () => {
  it('projects the standalone public function into the fixed Q1-Q4 tuple', () => {
    const tasks = [
      makeTask('projection-q4-b'),
      makeTask('projection-q2', {important: true}),
      makeTask('projection-q1', {important: true, urgent: true}),
      makeTask('projection-q3', {urgent: true}),
      makeTask('projection-q4-a', {
        subtasks: [makeSubtask('projection-q4-a')],
      }),
    ];
    const inputBefore = JSON.stringify(tasks);
    const inputOrderBefore = tasks.map(task => task.id);

    const projection = projectTaskQuadrants(tasks);

    expect(projection.map(bucket => bucket.quadrant)).toEqual([
      'Q1',
      'Q2',
      'Q3',
      'Q4',
    ]);
    expect(projection.map(bucket => bucket.position)).toEqual([
      QUADRANT_POSITION.Q1,
      QUADRANT_POSITION.Q2,
      QUADRANT_POSITION.Q3,
      QUADRANT_POSITION.Q4,
    ]);
    expect(projectionIds(projection)).toEqual([
      ['projection-q1'],
      ['projection-q2'],
      ['projection-q3'],
      ['projection-q4-a', 'projection-q4-b'],
    ]);
    expect(tasks.map(task => task.id)).toEqual(inputOrderBefore);
    expect(JSON.stringify(tasks)).toBe(inputBefore);

    const previewTask = projection[3].preview[0];
    const allTask = projection[3].allTasks[0];
    expect(previewTask).toBeDefined();
    expect(allTask).toBeDefined();
    if (previewTask === undefined || allTask === undefined) {
      throw new Error('A2_STANDALONE_PROJECTION_FIXTURE_MISSING');
    }
    previewTask.title = 'standalone caller mutation';
    previewTask.subtasks[0]!.title = 'standalone nested caller mutation';
    expect(allTask.title).toBe('Task projection-q4-a');
    expect(allTask.subtasks[0]!.title).toBe('Step for projection-q4-a');
    expect(JSON.stringify(tasks)).toBe(inputBefore);
  });

  it('includes only active tasks, reports totalCount, and caps preview at three', async () => {
    const activeQ1 = Array.from({length: 5}, (_, index) =>
      makeTask(`active-q1-${index}`, {
        important: true,
        urgent: true,
        createdAt: `2026-08-05T08:0${index}:00.000Z`,
        updatedAt: `2026-08-05T08:0${index}:00.000Z`,
      }),
    );
    const completed = makeCompletedTask('projection-completed', {
      important: true,
      urgent: true,
    });
    const cancelled = makeCancelledTask('projection-cancelled', {
      important: true,
      urgent: true,
    });
    const deleted = makeDeletedTask('projection-deleted', {
      important: true,
      urgent: true,
    });
    const {service} = createA2Harness({
      tasks: [...activeQ1, completed, cancelled, deleted],
    });

    const projection = await service.getQuadrantProjection();
    const q1 = projection[0];

    expect(q1.quadrant).toBe('Q1');
    expect(q1.totalCount).toBe(5);
    expect(q1.preview).toHaveLength(3);
    expect(q1.preview).toEqual(q1.allTasks.slice(0, 3));
    expect(q1.allTasks).toHaveLength(5);
    expect(projection.slice(1).every(bucket => bucket.totalCount === 0)).toBe(
      true,
    );
  });

  it('orders in-progress tasks before pending tasks independent of all time fields', async () => {
    const tasks = [
      makeTask('status-pending-early', {
        startAt: '2026-08-05T08:00:00.000Z',
        dueAt: '2026-08-05T08:30:00.000Z',
      }),
      makeInProgressTask('status-active-late', {
        startAt: '2026-08-20T08:00:00.000Z',
        dueAt: null,
      }),
      makeTask('status-pending-late', {
        startAt: '2026-08-20T09:00:00.000Z',
        dueAt: null,
      }),
      makeInProgressTask('status-active-early', {
        startAt: '2026-08-19T08:00:00.000Z',
        dueAt: '2026-08-21T08:00:00.000Z',
      }),
    ];
    const {service} = createA2Harness({tasks});

    const q4 = (await service.getQuadrantProjection())[3];
    expect(q4.allTasks.map(task => task.id)).toEqual([
      'status-active-early',
      'status-active-late',
      'status-pending-early',
      'status-pending-late',
    ]);
  });

  it('applies scheduled null-last before due null-last as independent sort stages', async () => {
    const tasks = [
      makeTask('time-schedule-null-due-early', {
        startAt: null,
        dueAt: '2026-08-05T10:01:00.000Z',
      }),
      makeTask('time-schedule-a-due-null', {
        startAt: '2026-08-05T10:01:00.000Z',
        dueAt: null,
      }),
      makeTask('time-schedule-a-due-late', {
        startAt: '2026-08-05T10:01:00.000Z',
        dueAt: '2026-08-05T10:04:00.000Z',
      }),
      makeTask('time-schedule-a-due-early', {
        startAt: '2026-08-05T10:01:00.000Z',
        dueAt: '2026-08-05T10:03:00.000Z',
      }),
      makeTask('time-schedule-b-due-earliest', {
        startAt: '2026-08-05T10:02:00.000Z',
        dueAt: '2026-08-05T10:02:00.000Z',
      }),
    ];
    const {service} = createA2Harness({tasks});

    const q4 = (await service.getQuadrantProjection())[3];
    expect(q4.allTasks.map(task => task.id)).toEqual([
      'time-schedule-a-due-early',
      'time-schedule-a-due-late',
      'time-schedule-a-due-null',
      'time-schedule-b-due-earliest',
      'time-schedule-null-due-early',
    ]);
  });

  it('uses createdAt then ID as deterministic ties and ignores input permutation', async () => {
    const tasks = [
      makeTask('tie-z', {
        createdAt: '2026-08-05T08:01:00.000Z',
        updatedAt: '2026-08-05T08:01:00.000Z',
      }),
      makeTask('tie-b', {createdAt: '2026-08-05T08:00:00.000Z'}),
      makeTask('tie-a', {createdAt: '2026-08-05T08:00:00.000Z'}),
    ];
    const forward = createA2Harness({tasks});
    const reverse = createA2Harness({tasks: [...tasks].reverse()});

    const forwardIds = projectionIds(
      await forward.service.getQuadrantProjection(),
    );
    const reverseIds = projectionIds(
      await reverse.service.getQuadrantProjection(),
    );

    expect(forwardIds[3]).toEqual(['tie-a', 'tie-b', 'tie-z']);
    expect(reverseIds).toEqual(forwardIds);
  });

  it('returns deep-separated preview/allTasks aggregates without mutating source tasks', async () => {
    const source = makeTask('projection-clone', {
      subtasks: [
        {
          id: 'projection-clone-step',
          taskId: 'projection-clone',
          title: 'Original nested step',
          status: 'pending',
          createdAt: '2026-08-05T08:00:00.000Z',
          updatedAt: '2026-08-05T08:00:00.000Z',
          completedAt: null,
        },
      ],
    });
    const {service} = createA2Harness({tasks: [source]});
    const projection = await service.getQuadrantProjection();
    const previewTask = projection[3].preview[0];
    const allTask = projection[3].allTasks[0];
    expect(previewTask).toBeDefined();
    expect(allTask).toBeDefined();
    if (previewTask === undefined || allTask === undefined) {
      throw new Error('A2_PROJECTION_FIXTURE_MISSING');
    }

    previewTask.title = 'Mutated preview';
    previewTask.subtasks[0]!.title = 'Mutated preview step';
    expect(allTask.title).toBe(source.title);
    expect(allTask.subtasks[0]!.title).toBe('Original nested step');
    expect(source.title).toBe('Task projection-clone');
    expect(source.subtasks[0]!.title).toBe('Original nested step');

    const reread = await service.getQuadrantProjection();
    expect(reread[3].allTasks[0]).toEqual(source);
  });
});
