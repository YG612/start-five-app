import {assertValidTaskSnapshot} from '../../src/data/taskSnapshotValidation';
import {
  ControlledBackend,
  CURRENT_STORAGE_KEY,
  backupKey,
  captureOutcome,
  createManagedStorage,
  errorView,
  makeDependencies,
  publicErrorText,
  recoverStorage,
  restoreStorage,
} from './taskDataRecoveryTestKit';
import {buildPureJsonSemanticAdversaryMatrix} from './semanticAdversaryMatrix';

const semanticMatrix = buildPureJsonSemanticAdversaryMatrix();

function tasksFrom(candidate: Record<string, unknown>): unknown {
  return Reflect.get(candidate, 'tasks');
}

describe('GAP-P0-04 shared pure-JSON semantic validation parity', () => {
  it('keeps every adversary JSON-stable with a legal control and one rejected semantic target', () => {
    expect(semanticMatrix).toHaveLength(20);
    expect(new Set(semanticMatrix.map(testCase => testCase.name)).size).toBe(20);

    for (const testCase of semanticMatrix) {
      const legalText = JSON.stringify(testCase.legalCandidate);
      const invalidText = JSON.stringify(testCase.invalidCandidate);
      expect(JSON.parse(legalText)).toEqual(testCase.legalCandidate);
      expect(JSON.parse(invalidText)).toEqual(testCase.invalidCandidate);
      expect(invalidText).toContain(testCase.secret);
      expect(() =>
        assertValidTaskSnapshot(tasksFrom(testCase.legalCandidate)),
      ).not.toThrow();
      expect(() =>
        assertValidTaskSnapshot(tasksFrom(testCase.invalidCandidate)),
      ).toThrow('TASK_SNAPSHOT_INVALID');
    }
  });

  it.each(semanticMatrix)(
    'recover rejects $name before backend/dependency I/O without retaining payload cause',
    async testCase => {
      const key = backupKey(`semantic-recover-${testCase.name.replaceAll(' ', '-')}`);
      const backupRaw = `retained backup for ${testCase.name}`;
      const backend = new ControlledBackend(new Map([[key, backupRaw]]));
      const dependencies = makeDependencies();
      const storage = createManagedStorage(backend, dependencies.dependencies);

      const outcome = await captureOutcome(
        Promise.resolve().then(() =>
          recoverStorage(storage, key, testCase.invalidCandidate),
        ),
      );

      expect(outcome.status).toBe('rejected');
      const error = outcome.status === 'rejected' ? outcome.error : undefined;
      expect(errorView(error)).toEqual({
        code: 'TASK_RECOVERY_CANDIDATE_INVALID',
        message: 'TASK_RECOVERY_CANDIDATE_INVALID',
        category: 'INVALID_SNAPSHOT',
        cause: undefined,
      });
      expect(publicErrorText(error)).not.toContain(testCase.secret);
      expect(backend.events).toEqual([]);
      expect(backend.raw(key)).toBe(backupRaw);
      expect(backend.raw(CURRENT_STORAGE_KEY)).toBeNull();
      expect(backend.setAttempts).toEqual([]);
      expect(backend.removeAttempts).toEqual([]);
      expect(dependencies.now).not.toHaveBeenCalled();
      expect(dependencies.idGenerator).not.toHaveBeenCalled();
    },
  );

  it.each(semanticMatrix)(
    'restore rejects $name while preserving backup, empty target, and payload-free cause',
    async testCase => {
      const key = backupKey(`semantic-restore-${testCase.name.replaceAll(' ', '-')}`);
      const backupRaw = JSON.stringify(testCase.invalidCandidate);
      const backend = new ControlledBackend(new Map([[key, backupRaw]]));
      const dependencies = makeDependencies();
      const storage = createManagedStorage(backend, dependencies.dependencies);

      const outcome = await captureOutcome(
        Promise.resolve().then(() => restoreStorage(storage, key)),
      );

      expect(outcome.status).toBe('rejected');
      const error = outcome.status === 'rejected' ? outcome.error : undefined;
      expect(errorView(error)).toMatchObject({
        code: 'TASK_RECOVERY_BACKUP_INVALID',
        message: 'TASK_RECOVERY_BACKUP_INVALID',
        cause: undefined,
      });
      expect(publicErrorText(error)).not.toContain(testCase.secret);
      expect(backend.raw(key)).toBe(backupRaw);
      expect(backend.raw(CURRENT_STORAGE_KEY)).toBeNull();
      expect(backend.setAttempts).toEqual([]);
      expect(backend.removeAttempts).toEqual([]);
      expect(dependencies.now).not.toHaveBeenCalled();
      expect(dependencies.idGenerator).not.toHaveBeenCalled();
    },
  );
});

