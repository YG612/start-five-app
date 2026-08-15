import {createPersistentTaskStorage} from '../../src/data/persistentTaskStorage';
import {
  createTaskRepository,
  type TaskRepository,
} from '../../src/data/taskRepository';
import type {Task} from '../../src/domain/task';
import {
  captureOutcome,
  deepGetterPatch,
  InspectableBackend,
  makePendingTask,
  outcomeIdentity,
  PHASE4_REVIEW3_RECOVERY_AT,
  PHASE4_REVIEW3_STORAGE_KEY,
  revokedPatchProxy,
  serializeEnvelope,
  throwingAggregateProxy,
} from './phase4Review3Fixtures';

type AdversarialMutationCase = {
  label: string;
  invoke(repository: TaskRepository, baseline: Task): Promise<unknown>;
  postcondition?(): void;
};

const deep = deepGetterPatch(256);

const ADVERSARIAL_MUTATIONS: readonly AdversarialMutationCase[] = [
  {
    label: 'a throwing aggregate Proxy',
    invoke: repository =>
      repository.create(
        throwingAggregateProxy(makePendingTask('throwing-proxy-create')),
      ),
  },
  {
    label: 'a revoked patch Proxy',
    invoke: (repository, baseline) =>
      repository.update(baseline.id, revokedPatchProxy()),
  },
  {
    label: 'a 256-level unknown patch with a throwing getter leaf',
    invoke: (repository, baseline) =>
      repository.update(baseline.id, deep.patch),
    postcondition: () => {
      // Descriptor-based or bounded inspection must not execute the getter.
      // The test itself never reads the adversarial patch.
      expect(deep.getterCalls()).toBe(0);
    },
  },
];

async function freshTasks(raw: string): Promise<Task[]> {
  const backend = new InspectableBackend();
  backend.seed(PHASE4_REVIEW3_STORAGE_KEY, raw);
  return createTaskRepository(
    createPersistentTaskStorage(backend),
  ).list({includeDeleted: true});
}

describe('P4-HARDENING-3 adversarial plain-data rejection', () => {
  it.each(ADVERSARIAL_MUTATIONS)(
    'normalizes $label to stable invalid-snapshot failure, writes nothing, and restores queue progress',
    async scenario => {
      const backend = new InspectableBackend();
      const baseline = makePendingTask(`adversarial-baseline-${scenario.label}`);
      const durableBefore = serializeEnvelope([baseline]);
      backend.seed(PHASE4_REVIEW3_STORAGE_KEY, durableBefore);
      const repository = createTaskRepository(
        createPersistentTaskStorage(backend),
      );
      await repository.list({includeDeleted: true});

      // captureOutcome is the only test catch boundary. Assertions inspect
      // the resulting ordinary error and never re-read the hostile input.
      const rejected = await captureOutcome(
        scenario.invoke(repository, baseline),
      );
      expect(outcomeIdentity(rejected)).toEqual({
        status: 'rejected',
        code: 'TASK_SNAPSHOT_INVALID',
        message: 'TASK_SNAPSHOT_INVALID',
      });
      scenario.postcondition?.();
      expect(backend.raw(PHASE4_REVIEW3_STORAGE_KEY)).toBe(durableBefore);
      expect(backend.setAttempts).toEqual([]);
      expect(backend.removeCalls).toEqual([]);
      await expect(repository.list({includeDeleted: true})).resolves.toEqual([
        baseline,
      ]);
      await expect(freshTasks(durableBefore)).resolves.toEqual([baseline]);

      const recovery = await captureOutcome(
        repository.update(baseline.id, {
          title: `Recovered after ${scenario.label}`,
          updatedAt: PHASE4_REVIEW3_RECOVERY_AT,
        }),
      );
      expect(outcomeIdentity(recovery)).toEqual({status: 'fulfilled'});
      expect(backend.setAttempts).toHaveLength(1);
      expect(backend.removeCalls).toEqual([]);
      const durableAfter = backend.raw(PHASE4_REVIEW3_STORAGE_KEY);
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
