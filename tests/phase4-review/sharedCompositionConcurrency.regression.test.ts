import {createStartFiveApp} from '../../src/app/startFiveApp';
import {
  ControlledAsyncKeyValueBackend,
  drainMicrotasks,
  makePendingTask,
  PHASE4_REVIEW_STORAGE_KEY,
  serializeEnvelope,
} from './phase4ReviewFixtures';

function dependencies(
  backend: ControlledAsyncKeyValueBackend,
  idPrefix: string,
): Parameters<typeof createStartFiveApp>[0] {
  let sequence = 0;
  return {
    storageBackend: backend,
    now: () => '2026-08-04T15:00:00.000Z',
    idGenerator: () => {
      sequence += 1;
      return `${idPrefix}-${sequence}`;
    },
  };
}

function taskInput(title: string): {
  title: string;
  description: string;
  important: boolean;
  urgent: boolean;
} {
  return {
    title,
    description: `Created by ${title}`,
    important: false,
    urgent: false,
  };
}

async function durableIds(
  backend: ControlledAsyncKeyValueBackend,
  idPrefix: string,
): Promise<string[]> {
  const fresh = createStartFiveApp(dependencies(backend, idPrefix));
  const state = await fresh.service.getState();
  return state.tasks.map(task => task.id).sort();
}

describe('P4-REVIEW shared-backend composition concurrency', () => {
  it('preserves sequential mutations from two live compositions hydrated from the same empty snapshot', async () => {
    const backend = new ControlledAsyncKeyValueBackend();
    backend.seed(PHASE4_REVIEW_STORAGE_KEY, serializeEnvelope([]));
    const first = createStartFiveApp(dependencies(backend, 'sequential-a'));
    const second = createStartFiveApp(dependencies(backend, 'sequential-b'));

    await Promise.all([first.repository.list(), second.repository.list()]);

    const firstCreated = await first.service.createTask(
      taskInput('Sequential task A'),
      {operationId: 'p4-review:sequential:a'},
    );
    const secondCreated = await second.service.createTask(
      taskInput('Sequential task B'),
      {operationId: 'p4-review:sequential:b'},
    );

    expect(
      await durableIds(backend, 'sequential-fresh'),
    ).toEqual([firstCreated.id, secondCreated.id].sort());
    expect(backend.removeCalls).toEqual([]);
  });

  it('preserves both mutations under a controlled overlapping commit after both compositions hydrate one legal snapshot', async () => {
    const backend = new ControlledAsyncKeyValueBackend();
    const baseline = makePendingTask('preexisting-durable-task');
    backend.seed(
      PHASE4_REVIEW_STORAGE_KEY,
      serializeEnvelope([baseline]),
    );
    const first = createStartFiveApp(dependencies(backend, 'overlap-a'));
    const second = createStartFiveApp(dependencies(backend, 'overlap-b'));

    await Promise.all([first.repository.list(), second.repository.list()]);
    backend.gateNextSet();

    const firstMutation = first.service.createTask(
      taskInput('Overlapped task A'),
      {operationId: 'p4-review:overlap:a'},
    );
    let secondMutation: ReturnType<typeof second.service.createTask>;
    let blockedBeforeSecondStart = 0;
    try {
      await drainMicrotasks();
      blockedBeforeSecondStart = backend.blockedSetCount;
      secondMutation = second.service.createTask(
        taskInput('Overlapped task B'),
        {operationId: 'p4-review:overlap:b'},
      );
      await drainMicrotasks();
    } finally {
      backend.releaseSetGate();
    }

    const [firstCreated, secondCreated] = await Promise.all([
      firstMutation,
      secondMutation!,
    ]);
    expect(blockedBeforeSecondStart).toBe(1);
    expect(
      await durableIds(backend, 'overlap-fresh'),
    ).toEqual([baseline.id, firstCreated.id, secondCreated.id].sort());
    expect(backend.removeCalls).toEqual([]);
  });

  it('keeps compositions backed by different backend identities strictly isolated', async () => {
    const firstBackend = new ControlledAsyncKeyValueBackend();
    const secondBackend = new ControlledAsyncKeyValueBackend();
    firstBackend.seed(PHASE4_REVIEW_STORAGE_KEY, serializeEnvelope([]));
    secondBackend.seed(PHASE4_REVIEW_STORAGE_KEY, serializeEnvelope([]));
    const first = createStartFiveApp(dependencies(firstBackend, 'isolated-a'));
    const second = createStartFiveApp(dependencies(secondBackend, 'isolated-b'));

    await Promise.all([first.repository.list(), second.repository.list()]);
    const firstCreated = await first.service.createTask(
      taskInput('Only backend A'),
      {operationId: 'p4-review:isolated:a'},
    );
    const secondCreated = await second.service.createTask(
      taskInput('Only backend B'),
      {operationId: 'p4-review:isolated:b'},
    );

    await expect(
      durableIds(firstBackend, 'isolated-fresh-a'),
    ).resolves.toEqual([firstCreated.id]);
    await expect(
      durableIds(secondBackend, 'isolated-fresh-b'),
    ).resolves.toEqual([secondCreated.id]);
    expect(firstBackend.raw(PHASE4_REVIEW_STORAGE_KEY)).not.toBe(
      secondBackend.raw(PHASE4_REVIEW_STORAGE_KEY),
    );
  });
});
