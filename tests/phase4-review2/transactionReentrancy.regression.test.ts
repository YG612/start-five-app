import {createPersistentTaskStorage} from '../../src/data/persistentTaskStorage';
import {
  createTaskRepository,
  type TaskRepository,
} from '../../src/data/taskRepository';
import {
  captureOutcome,
  errorCode,
  errorMessage,
  InspectableAsyncKeyValueBackend,
  makePendingTask,
  PHASE4_REVIEW2_STORAGE_KEY,
  type ReentrantMutation,
  serializeEnvelope,
  settleWithinMicrotasks,
} from './phase4Review2Fixtures';

const REENTRANT_ERROR = 'TASK_REPOSITORY_REENTRANT_MUTATION';

type ReentrancyCase = {
  label: string;
  invoke: ReentrantMutation;
};

const REENTRANT_MUTATIONS: readonly ReentrancyCase[] = [
  {
    label: 'create',
    invoke: (repository, baseline) =>
      repository.create(
        makePendingTask(`${baseline.id}-reentrant-create`, {
          title: 'Must never enter the mutation queue',
        }),
      ),
  },
  {
    label: 'update',
    invoke: (repository, baseline) =>
      repository.update(baseline.id, {title: 'Must never commit'}),
  },
  {
    label: 'softDelete',
    invoke: (repository, baseline) =>
      repository.softDelete(
        baseline.id,
        '2026-08-04T16:05:00.000Z',
      ),
  },
  {
    label: 'transaction',
    invoke: repository =>
      repository.transaction(async nestedTransaction =>
        nestedTransaction.list({includeDeleted: true}),
      ),
  },
];

async function recoveredTasks(
  raw: string,
): Promise<ReturnType<TaskRepository['list']> extends Promise<infer T> ? T : never> {
  const freshBackend = new InspectableAsyncKeyValueBackend();
  freshBackend.seed(PHASE4_REVIEW2_STORAGE_KEY, raw);
  return createTaskRepository(
    createPersistentTaskStorage(freshBackend),
  ).list({includeDeleted: true});
}

describe('P4-HARDENING-2 transaction reentrancy rejection', () => {
  it.each(REENTRANT_MUTATIONS)(
    'rejects an awaited same-repository $label within a finite microtask budget, rolls back, and recovers',
    async scenario => {
      const backend = new InspectableAsyncKeyValueBackend();
      const baseline = makePendingTask(`reentry-${scenario.label}`);
      const durableBefore = serializeEnvelope([baseline]);
      backend.seed(PHASE4_REVIEW2_STORAGE_KEY, durableBefore);
      const repository = createTaskRepository(
        createPersistentTaskStorage(backend),
      );
      await expect(repository.list({includeDeleted: true})).resolves.toEqual([
        baseline,
      ]);

      const attempt = repository.transaction(async transaction => {
        await transaction.update(baseline.id, {
          title: 'Outer transaction staged value',
        });
        return scenario.invoke(repository, baseline);
      });
      const outcome = await settleWithinMicrotasks(attempt);

      expect(
        outcome.status === 'rejected'
          ? {
              status: outcome.status,
              code: errorCode(outcome.error),
              message: errorMessage(outcome.error),
            }
          : outcome,
      ).toEqual({
        status: 'rejected',
        code: REENTRANT_ERROR,
        message: REENTRANT_ERROR,
      });
      expect(backend.raw(PHASE4_REVIEW2_STORAGE_KEY)).toBe(durableBefore);
      expect(backend.setAttempts).toEqual([]);
      expect(backend.removeCalls).toEqual([]);
      await expect(repository.getById(baseline.id)).resolves.toEqual(baseline);

      const recovery = await settleWithinMicrotasks(
        repository.update(baseline.id, {
          title: `Recovered after ${scenario.label}`,
          updatedAt: '2026-08-04T16:06:00.000Z',
        }),
      );
      expect(
        recovery.status === 'fulfilled'
          ? {
              status: recovery.status,
              title: recovery.value.title,
            }
          : recovery.status === 'rejected'
            ? {
                status: recovery.status,
                code: errorCode(recovery.error),
              }
            : recovery,
      ).toEqual({
        status: 'fulfilled',
        title: `Recovered after ${scenario.label}`,
      });
      expect(backend.setAttempts).toHaveLength(1);
      const durableAfter = backend.raw(PHASE4_REVIEW2_STORAGE_KEY);
      expect(durableAfter).not.toBeNull();
      await expect(recoveredTasks(durableAfter ?? '')).resolves.toEqual([
        expect.objectContaining({
          id: baseline.id,
          title: `Recovered after ${scenario.label}`,
        }),
      ]);
    },
  );

  it('keeps a legal transaction available and commits its staged work once', async () => {
    const backend = new InspectableAsyncKeyValueBackend();
    const baseline = makePendingTask('legal-transaction-baseline');
    backend.seed(
      PHASE4_REVIEW2_STORAGE_KEY,
      serializeEnvelope([baseline]),
    );
    const repository = createTaskRepository(
      createPersistentTaskStorage(backend),
    );
    await repository.list();

    const result = await captureOutcome(
      repository.transaction(async transaction => {
        await transaction.update(baseline.id, {
          title: 'Legally updated in transaction',
          updatedAt: '2026-08-04T16:02:00.000Z',
        });
        await transaction.create(makePendingTask('legal-transaction-created'));
        return 'committed';
      }),
    );

    expect(result).toEqual({status: 'fulfilled', value: 'committed'});
    expect(backend.setAttempts).toHaveLength(1);
    expect(backend.removeCalls).toEqual([]);
    await expect(repository.list()).resolves.toEqual([
      expect.objectContaining({
        id: baseline.id,
        title: 'Legally updated in transaction',
      }),
      expect.objectContaining({id: 'legal-transaction-created'}),
    ]);
  });
});
