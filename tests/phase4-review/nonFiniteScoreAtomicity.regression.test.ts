import {createPersistentTaskStorage} from '../../src/data/persistentTaskStorage';
import {createTaskRepository} from '../../src/data/taskRepository';
import {
  captureOutcome,
  ControlledAsyncKeyValueBackend,
  errorCode,
  makeCompletedTask,
  PHASE4_REVIEW_STORAGE_KEY,
  serializeEnvelope,
} from './phase4ReviewFixtures';

const NON_FINITE_SCORES = [
  {label: 'NaN', value: Number.NaN},
  {label: 'positive Infinity', value: Number.POSITIVE_INFINITY},
  {label: 'negative Infinity', value: Number.NEGATIVE_INFINITY},
] as const;

describe('P4-REVIEW non-finite score write atomicity', () => {
  it.each(NON_FINITE_SCORES)(
    'rejects $label through a real repository update before JSON coercion can destroy the old value',
    async scenario => {
      const backend = new ControlledAsyncKeyValueBackend();
      const original = makeCompletedTask(`preserved-before-${scenario.label}`, {
        score: 15,
      });
      const durableBefore = serializeEnvelope([original]);
      backend.seed(PHASE4_REVIEW_STORAGE_KEY, durableBefore);
      const repository = createTaskRepository(
        createPersistentTaskStorage(backend),
      );

      await expect(repository.getById(original.id)).resolves.toEqual(original);
      const outcome = await captureOutcome(
        repository.update(original.id, {score: scenario.value}),
      );
      const current = await repository.getById(original.id, {
        includeDeleted: true,
      });
      const recoveredRepository = createTaskRepository(
        createPersistentTaskStorage(backend),
      );
      const recovered = await recoveredRepository.getById(original.id, {
        includeDeleted: true,
      });

      expect({
        mutationStatus: outcome.status,
        mutationCode:
          outcome.status === 'rejected' ? errorCode(outcome.error) : undefined,
        durableRaw: backend.raw(PHASE4_REVIEW_STORAGE_KEY),
        setAttempts: backend.setAttempts,
        removeCalls: backend.removeCalls,
        current,
        recovered,
      }).toEqual({
        mutationStatus: 'rejected',
        mutationCode: 'TASK_SNAPSHOT_INVALID',
        durableRaw: durableBefore,
        setAttempts: [],
        removeCalls: [],
        current: original,
        recovered: original,
      });
    },
  );
});
