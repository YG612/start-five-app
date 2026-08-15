import type {
  TaskLifecycleTaskInput,
  TaskLifecycleTaskPatch,
} from '../../src/application/coreAppService';
import {
  A2_STORAGE_KEY,
  A2_NOW,
  SequenceIds,
  createA2Harness,
  createFreshA2Harness,
  makeSubtask,
  makeTask,
  operation,
  readFreshTasks,
} from './a2Fixtures';

describe('GAP-P0-01A2 deep isolation and true persistence restart contract', () => {
  it('deep-separates every read aggregate from storage and from sibling result shapes', async () => {
    const source = makeTask('isolation-source', {
      important: true,
      urgent: true,
      subtasks: [makeSubtask('isolation-source')],
    });
    const {service} = createA2Harness({tasks: [source]});
    const byId = await service.getById(source.id);
    const listed = await service.list();
    const recommendation = await service.getRecommendation();
    const projection = await service.getQuadrantProjection();
    const query = await service.getQueryResult();
    expect(byId).not.toBeNull();
    expect(recommendation).not.toBeNull();
    if (byId === null || recommendation === null) {
      throw new Error('A2_ISOLATION_FIXTURE_MISSING');
    }

    const references = [
      byId,
      listed[0],
      recommendation,
      projection[0].allTasks[0],
      query.tasks[0],
      query.recommendation,
      query.quadrants[0].allTasks[0],
    ];
    expect(references.every(value => value !== undefined && value !== null)).toBe(
      true,
    );
    expect(new Set(references).size).toBe(references.length);

    byId.title = 'mutated by-id';
    byId.subtasks[0]!.title = 'mutated by-id step';
    listed[0]!.title = 'mutated list';
    recommendation.title = 'mutated recommendation';
    projection[0].allTasks[0]!.title = 'mutated projection';
    query.tasks[0]!.title = 'mutated query list';
    query.recommendation!.title = 'mutated query recommendation';
    query.quadrants[0].allTasks[0]!.title = 'mutated query projection';

    await expect(service.getById(source.id)).resolves.toEqual(source);
    await expect(service.list()).resolves.toEqual([source]);
  });

  it('deep-separates nested subtasks returned by list from rereads and fresh restart', async () => {
    const source = makeTask('isolation-list-nested', {
      subtasks: [makeSubtask('isolation-list-nested')],
    });
    const {service, backend} = createA2Harness({tasks: [source]});

    const listed = await service.list();
    listed[0]!.subtasks[0]!.title = 'caller-mutated list subtask';

    expect((await service.list())[0]!.subtasks[0]!.title).toBe(
      'Step for isolation-list-nested',
    );
    await expect(readFreshTasks(backend)).resolves.toEqual([source]);
  });

  it('deep-separates nested subtasks returned by recommendation from rereads and restart', async () => {
    const source = makeTask('isolation-recommendation-nested', {
      important: true,
      urgent: true,
      subtasks: [makeSubtask('isolation-recommendation-nested')],
    });
    const {service, backend} = createA2Harness({tasks: [source]});

    const recommendation = await service.getRecommendation();
    expect(recommendation).not.toBeNull();
    if (recommendation === null) {
      throw new Error('A2_RECOMMENDATION_NESTED_FIXTURE_MISSING');
    }
    recommendation.subtasks[0]!.title = 'caller-mutated recommendation subtask';

    expect((await service.getRecommendation())?.subtasks[0]!.title).toBe(
      'Step for isolation-recommendation-nested',
    );
    await expect(readFreshTasks(backend)).resolves.toEqual([source]);
  });

  it('deep-separates nested quadrant subtasks from projection rereads and fresh restart', async () => {
    const source = makeTask('isolation-quadrant-nested', {
      important: true,
      urgent: true,
      subtasks: [makeSubtask('isolation-quadrant-nested')],
    });
    const {service, backend} = createA2Harness({tasks: [source]});

    const projection = await service.getQuadrantProjection();
    projection[0].allTasks[0]!.subtasks[0]!.title =
      'caller-mutated quadrant subtask';

    expect(
      (await service.getQuadrantProjection())[0].allTasks[0]!.subtasks[0]!.title,
    ).toBe('Step for isolation-quadrant-nested');
    await expect(readFreshTasks(backend)).resolves.toEqual([source]);
  });

  it('snapshots create and update inputs at call entry instead of retaining caller aliases', async () => {
    const {service} = createA2Harness({idGenerator: () => 'isolation-input'});
    const input: TaskLifecycleTaskInput = {
      title: 'Original create input',
      description: 'Original create description',
      important: false,
      urgent: false,
      firstStep: 'Original first step',
    };
    const createPromise = service.create(input, operation('isolation:create'));
    input.title = 'Mutated create input';
    input.description = 'Mutated create description';
    input.firstStep = 'Mutated first step';
    const created = await createPromise;
    expect(created).toMatchObject({
      title: 'Original create input',
      description: 'Original create description',
      firstStep: 'Original first step',
    });

    const patch: TaskLifecycleTaskPatch = {
      title: 'Original patch title',
      firstStep: 'Original patch step',
    };
    const updatePromise = service.update(
      created.id,
      patch,
      operation('isolation:update'),
    );
    patch.title = 'Mutated patch title';
    patch.firstStep = 'Mutated patch step';
    await expect(updatePromise).resolves.toMatchObject({
      title: 'Original patch title',
      firstStep: 'Original patch step',
    });
  });

  it('rehydrates all planning fields, ordering, score, and tombstones through a truly fresh facade', async () => {
    const ids = new SequenceIds(['restart-q4', 'restart-q1', 'restart-deleted']);
    const first = createA2Harness({idGenerator: ids.next});
    const q4 = await first.service.create(
      {
        title: 'Restart Q4',
        important: false,
        urgent: false,
        scheduledStartAt: '2026-08-05T09:00:00.000Z',
        dueAt: '2026-08-06T09:00:00.000Z',
        estimatedMinutes: 20,
        firstStep: 'Open Q4',
      },
      operation('restart:create:q4'),
    );
    const q1 = await first.service.create(
      {
        title: 'Restart Q1',
        important: true,
        urgent: true,
        estimatedMinutes: 5,
        firstStep: 'Open Q1',
      },
      operation('restart:create:q1'),
    );
    const deleted = await first.service.create(
      {
        title: 'Restart deleted',
        important: false,
        urgent: true,
      },
      operation('restart:create:deleted'),
    );
    const completed = await first.service.complete(
      q4.id,
      operation('restart:complete:q4'),
    );
    await first.service.softDelete(
      deleted.id,
      operation('restart:delete'),
    );
    const rawBeforeRestart = first.storage.raw();

    const fresh = createFreshA2Harness(first.backend, {
      now: () => '2030-01-01T00:00:00.000Z',
      idGenerator: () => 'must-not-be-read',
    });
    const all = await fresh.service.list({includeDeleted: true});
    const projection = await fresh.service.getQuadrantProjection();

    expect(fresh.storage.getCalls).toEqual([A2_STORAGE_KEY]);
    expect(fresh.storage.setAttempts).toEqual([]);
    expect(first.storage.raw()).toBe(rawBeforeRestart);
    expect(all.map(task => task.id)).toEqual([q4.id, q1.id, deleted.id]);
    expect(all[0]).toMatchObject({
      status: 'completed',
      score: completed.points,
      scheduledStartAt: '2026-08-05T09:00:00.000Z',
      estimatedMinutes: 20,
      firstStep: 'Open Q4',
    });
    expect(all[1]).toMatchObject({
      scheduledStartAt: null,
      estimatedMinutes: 5,
      firstStep: 'Open Q1',
    });
    expect(all[2]!.deletedAt).not.toBeNull();
    expect(projection[0].allTasks.map(task => task.id)).toEqual([q1.id]);
  });

  it('keeps caller mutations non-durable across a second fresh restart', async () => {
    const source = makeTask('restart-clone', {
      important: true,
      urgent: true,
      subtasks: [makeSubtask('restart-clone')],
    });
    const first = createA2Harness({tasks: [source]});
    const read = await first.service.getById(source.id);
    expect(read).not.toBeNull();
    if (read === null) {
      throw new Error('A2_RESTART_FIXTURE_MISSING');
    }
    read.title = 'Caller-only title';
    read.subtasks[0]!.title = 'Caller-only step';

    const freshTasks = await readFreshTasks(first.backend);
    expect(freshTasks).toEqual([source]);
    expect(first.storage.raw()).toBe(JSON.stringify([source]));
  });
});
