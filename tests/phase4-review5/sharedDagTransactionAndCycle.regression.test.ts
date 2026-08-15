import {
  captureOutcome,
  createHarness,
  freshTasks,
  makeCycle,
  makePendingTask,
  makeSharedDag,
  outcomeIdentity,
  PHASE4_REVIEW5_RECOVERY_AT,
  SHARED_DAG_GET_BUDGET,
  unknownPatch,
} from './phase4Review5Fixtures';

const INVALID_IDENTITY = {
  status: 'rejected',
  code: 'TASK_SNAPSHOT_INVALID',
  message: 'TASK_SNAPSHOT_INVALID',
} as const;

describe('P4-HARDENING-5 transaction DAG path and cycle distinction', () => {
  it('applies the same linear shared-DAG budget to transaction update, rolls back, and permits a later transaction', async () => {
    const baseline = makePendingTask('transaction-dag-baseline');
    const {backend, durableBefore, repository} = createHarness([baseline]);
    await repository.list({includeDeleted: true});
    const dag = makeSharedDag();

    const rejected = await captureOutcome(
      repository.transaction(transaction =>
        transaction.update(baseline.id, unknownPatch(dag.root)),
      ),
    );

    expect(outcomeIdentity(rejected)).toEqual(INVALID_IDENTITY);
    expect(dag.audit.attempts).toBeGreaterThan(0);
    expect(backend.raw('start-five.tasks.v1')).toBe(durableBefore);
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
          title: 'Recovered transaction after DAG rejection',
          updatedAt: PHASE4_REVIEW5_RECOVERY_AT,
        }),
      ),
    ).resolves.toMatchObject({
      id: baseline.id,
      title: 'Recovered transaction after DAG rejection',
    });
    expect(backend.setAttempts).toHaveLength(1);
    expect(backend.setCommits).toHaveLength(1);
    expect(dag.audit.exceeded).toBe(false);
    expect(dag.audit.attempts).toBeLessThanOrEqual(SHARED_DAG_GET_BUDGET);
  });

  it('keeps an actual cycle distinct from acyclic sharing and rejects it stably without tripping the safety fuse', async () => {
    const baseline = makePendingTask('cycle-control-baseline');
    const {backend, durableBefore, repository} = createHarness([baseline]);
    await repository.list({includeDeleted: true});
    const cycle = makeCycle();
    const selfDescriptor = Object.getOwnPropertyDescriptor(cycle.root, 'self');
    expect(selfDescriptor && 'value' in selfDescriptor
      ? selfDescriptor.value
      : undefined).toBe(cycle.root);

    const rejected = await captureOutcome(
      repository.update(baseline.id, unknownPatch(cycle.root)),
    );

    expect(outcomeIdentity(rejected)).toEqual(INVALID_IDENTITY);
    expect(cycle.audit.attempts).toBe(1);
    expect(cycle.audit.exceeded).toBe(false);
    expect(backend.raw('start-five.tasks.v1')).toBe(durableBefore);
    expect(backend.setAttempts).toEqual([]);
    expect(backend.setCommits).toEqual([]);
    expect(backend.removeAttempts).toEqual([]);
    await expect(repository.list({includeDeleted: true})).resolves.toEqual([
      baseline,
    ]);

    await expect(
      repository.update(baseline.id, {
        title: 'Recovered after cycle control',
        updatedAt: PHASE4_REVIEW5_RECOVERY_AT,
      }),
    ).resolves.toMatchObject({
      id: baseline.id,
      title: 'Recovered after cycle control',
    });
    expect(backend.setAttempts).toHaveLength(1);
    expect(backend.setCommits).toHaveLength(1);
  });
});

