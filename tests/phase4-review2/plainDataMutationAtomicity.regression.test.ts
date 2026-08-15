import {createPersistentTaskStorage} from '../../src/data/persistentTaskStorage';
import {
  createTaskRepository,
  type TaskRepository,
} from '../../src/data/taskRepository';
import type {Task} from '../../src/domain/task';
import {
  captureOutcome,
  errorCode,
  InspectableAsyncKeyValueBackend,
  makePendingTask,
  patchWithCustomPrototype,
  PHASE4_REVIEW2_STORAGE_KEY,
  serializeEnvelope,
  taskWithCustomPrototype,
  taskWithOwnToJSON,
} from './phase4Review2Fixtures';

type UnsafeMutationCase = {
  label: string;
  mutate(repository: TaskRepository, baseline: Task): Promise<unknown>;
};

const UNSAFE_MUTATIONS: readonly UnsafeMutationCase[] = [
  {
    label: 'create with an own toJSON hook',
    mutate: repository =>
      repository.create(
        taskWithOwnToJSON(makePendingTask('unsafe-create-tojson')),
      ),
  },
  {
    label: 'create with a custom aggregate prototype',
    mutate: repository =>
      repository.create(
        taskWithCustomPrototype(makePendingTask('unsafe-create-prototype')),
      ),
  },
  {
    label: 'update with a boxed primitive title',
    mutate: (repository, baseline) =>
      repository.update(baseline.id, {
        title: new String('boxed title') as unknown as string,
      }),
  },
  {
    label: 'update with a Date instance in a timestamp field',
    mutate: (repository, baseline) =>
      repository.update(baseline.id, {
        updatedAt: new Date('2026-08-04T16:02:00.000Z') as unknown as string,
      }),
  },
  {
    label: 'transaction create with an own toJSON hook',
    mutate: repository =>
      repository.transaction(transaction =>
        transaction.create(
          taskWithOwnToJSON(makePendingTask('unsafe-transaction-tojson')),
        ),
      ),
  },
  {
    label: 'transaction update with a custom patch prototype',
    mutate: (repository, baseline) =>
      repository.transaction(transaction =>
        transaction.update(
          baseline.id,
          patchWithCustomPrototype({title: 'custom patch prototype'}),
        ),
      ),
  },
];

async function recoverFromRaw(raw: string): Promise<unknown> {
  const freshBackend = new InspectableAsyncKeyValueBackend();
  freshBackend.seed(PHASE4_REVIEW2_STORAGE_KEY, raw);
  return createTaskRepository(
    createPersistentTaskStorage(freshBackend),
  ).list({includeDeleted: true});
}

describe('P4-HARDENING-2 public mutation plain-data-only atomicity', () => {
  it.each(UNSAFE_MUTATIONS)(
    'atomically rejects $label before JSON semantics can normalize it',
    async scenario => {
      const backend = new InspectableAsyncKeyValueBackend();
      const baseline = makePendingTask(`baseline-${scenario.label}`);
      const durableBefore = serializeEnvelope([baseline]);
      backend.seed(PHASE4_REVIEW2_STORAGE_KEY, durableBefore);
      const repository = createTaskRepository(
        createPersistentTaskStorage(backend),
      );
      await repository.list({includeDeleted: true});

      const mutation = await captureOutcome(
        scenario.mutate(repository, baseline),
      );
      const cached = await repository.list({includeDeleted: true});
      const durableAfter = backend.raw(PHASE4_REVIEW2_STORAGE_KEY);
      const fresh = await captureOutcome(
        recoverFromRaw(durableAfter ?? 'missing durable value'),
      );

      expect({
        status: mutation.status,
        code:
          mutation.status === 'rejected'
            ? errorCode(mutation.error)
            : undefined,
        durableAfter,
        setAttempts: backend.setAttempts,
        removeCalls: backend.removeCalls,
        cached,
        fresh,
      }).toEqual({
        status: 'rejected',
        code: 'TASK_SNAPSHOT_INVALID',
        durableAfter: durableBefore,
        setAttempts: [],
        removeCalls: [],
        cached: [baseline],
        fresh: {status: 'fulfilled', value: [baseline]},
      });
    },
  );

  it('preserves normal plain objects, arrays, primitives, and one atomic transaction commit', async () => {
    const backend = new InspectableAsyncKeyValueBackend();
    const baseline = makePendingTask('plain-data-control');
    backend.seed(
      PHASE4_REVIEW2_STORAGE_KEY,
      serializeEnvelope([baseline]),
    );
    const repository = createTaskRepository(
      createPersistentTaskStorage(backend),
    );
    await repository.list();

    await expect(
      repository.transaction(async transaction => {
        await transaction.update(baseline.id, {
          title: 'Plain update',
          updatedAt: '2026-08-04T16:02:00.000Z',
        });
        return transaction.create(makePendingTask('plain-created'));
      }),
    ).resolves.toMatchObject({id: 'plain-created'});

    expect(backend.setAttempts).toHaveLength(1);
    expect(backend.removeCalls).toEqual([]);
    await expect(repository.list()).resolves.toEqual([
      expect.objectContaining({id: baseline.id, title: 'Plain update'}),
      expect.objectContaining({id: 'plain-created'}),
    ]);
  });
});
