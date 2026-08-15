import {createPersistentTaskStorage} from '../../src/data/persistentTaskStorage';
import {createTaskRepository} from '../../src/data/taskRepository';
import type {Task} from '../../src/domain/task';
import {
  captureOutcome,
  ControlledBackend,
  makePendingTask,
  outcomeIdentity,
  PHASE4_REVIEW4_RECOVERY_AT,
  PHASE4_REVIEW4_STORAGE_KEY,
  PHASE4_REVIEW4_UPDATED_AT,
  ProxyAudit,
  serializeEnvelope,
  throwingOrdinaryGetProxy,
  type TransactionSurface,
} from './phase4Review4Fixtures';

const INVALID_IDENTITY = {
  status: 'rejected',
  code: 'TASK_SNAPSHOT_INVALID',
  message: 'TASK_SNAPSHOT_INVALID',
} as const;

type SurfaceCase = {
  label: string;
  throwingKey: PropertyKey;
  invoke(
    transaction: TransactionSurface,
    baseline: Task,
  ): {promise: Promise<unknown>; audit: ProxyAudit};
};

const SURFACE_CASES: readonly SurfaceCase[] = [
  {
    label: 'create task status',
    throwingKey: 'status',
    invoke: transaction => {
      const adversarial = throwingOrdinaryGetProxy(
        makePendingTask('surface-create-proxy'),
        'status',
      );
      return {
        promise: transaction.create(adversarial.proxy),
        audit: adversarial.audit,
      };
    },
  },
  {
    label: 'update patch title',
    throwingKey: 'title',
    invoke: (transaction, baseline) => {
      const adversarial = throwingOrdinaryGetProxy(
        {
          title: 'Surface caller-controlled title',
          updatedAt: PHASE4_REVIEW4_UPDATED_AT,
        },
        'title',
      );
      return {
        promise: transaction.update(baseline.id, adversarial.proxy),
        audit: adversarial.audit,
      };
    },
  },
];

async function freshTasks(raw: string): Promise<Task[]> {
  const backend = new ControlledBackend();
  backend.seed(PHASE4_REVIEW4_STORAGE_KEY, raw);
  return createTaskRepository(
    createPersistentTaskStorage(backend),
  ).list({includeDeleted: true});
}

describe('P4-HARDENING-4 transaction-surface caller-input materialization boundary', () => {
  it.each(SURFACE_CASES)(
    'maps $label ordinary get failure, rolls back atomically, and leaves the queue recoverable',
    async scenario => {
      const backend = new ControlledBackend();
      const baseline = makePendingTask(`transaction-${scenario.label}`);
      const durableBefore = serializeEnvelope([baseline]);
      backend.seed(PHASE4_REVIEW4_STORAGE_KEY, durableBefore);
      const repository = createTaskRepository(
        createPersistentTaskStorage(backend),
      );
      await repository.list({includeDeleted: true});

      const holder: {audit?: ProxyAudit} = {};
      const rejected = await captureOutcome(
        repository.transaction(async transaction => {
          const invocation = scenario.invoke(transaction, baseline);
          holder.audit = invocation.audit;
          return invocation.promise;
        }),
      );

      expect(outcomeIdentity(rejected)).toEqual(INVALID_IDENTITY);
      expect(holder.audit?.hasIntrospection()).toBe(true);
      expect(holder.audit?.hasThrowingGet(scenario.throwingKey)).toBe(true);
      expect(backend.raw(PHASE4_REVIEW4_STORAGE_KEY)).toBe(durableBefore);
      expect(backend.setAttempts).toEqual([]);
      expect(backend.setCommits).toEqual([]);
      expect(backend.removeAttempts).toEqual([]);
      await expect(repository.list({includeDeleted: true})).resolves.toEqual([
        baseline,
      ]);
      await expect(freshTasks(durableBefore)).resolves.toEqual([baseline]);

      await expect(
        repository.transaction(transaction =>
          transaction.update(baseline.id, {
            title: `Recovered after ${scenario.label}`,
            updatedAt: PHASE4_REVIEW4_RECOVERY_AT,
          }),
        ),
      ).resolves.toMatchObject({
        id: baseline.id,
        title: `Recovered after ${scenario.label}`,
      });
      expect(backend.setAttempts).toHaveLength(1);
      expect(backend.setCommits).toHaveLength(1);
      const durableAfter = backend.raw(PHASE4_REVIEW4_STORAGE_KEY);
      expect(durableAfter).not.toBeNull();
      await expect(freshTasks(durableAfter ?? '')).resolves.toEqual([
        expect.objectContaining({
          id: baseline.id,
          title: `Recovered after ${scenario.label}`,
        }),
      ]);
    },
  );
});
