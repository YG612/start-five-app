import type {Task} from '../../src/domain/task';
import {
  captureOutcome,
  createHarness,
  freshTasks,
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

describe('P4-HARDENING-5 facade shared-DAG complexity boundary', () => {
  it('rejects an acyclic shared DAG supplied to create within a linear read budget and recovers atomically', async () => {
    const baseline = makePendingTask('dag-create-baseline');
    const {backend, durableBefore, repository} = createHarness([baseline]);
    await repository.list({includeDeleted: true});
    const dag = makeSharedDag();
    const candidate = makePendingTask('dag-create-candidate', {
      description: dag.root as unknown as string,
    });

    const rejected = await captureOutcome(repository.create(candidate));

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
      repository.create(makePendingTask('dag-create-recovery')),
    ).resolves.toMatchObject({id: 'dag-create-recovery'});
    expect(backend.setAttempts).toHaveLength(1);
    expect(backend.setCommits).toHaveLength(1);
    expect(dag.audit.exceeded).toBe(false);
    expect(dag.audit.attempts).toBeLessThanOrEqual(SHARED_DAG_GET_BUDGET);
  });

  it('rejects an acyclic shared DAG supplied to update within a linear read budget and preserves the old cache/durable view', async () => {
    const baseline = makePendingTask('dag-update-baseline');
    const {backend, durableBefore, repository} = createHarness([baseline]);
    await repository.list({includeDeleted: true});
    const dag = makeSharedDag();

    const rejected = await captureOutcome(
      repository.update(baseline.id, unknownPatch(dag.root)),
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
      repository.update(baseline.id, {
        title: 'Recovered after facade DAG rejection',
        updatedAt: PHASE4_REVIEW5_RECOVERY_AT,
      }),
    ).resolves.toMatchObject({
      id: baseline.id,
      title: 'Recovered after facade DAG rejection',
    });
    expect(backend.setAttempts).toHaveLength(1);
    expect(backend.setCommits).toHaveLength(1);
    expect(dag.audit.exceeded).toBe(false);
    expect(dag.audit.attempts).toBeLessThanOrEqual(SHARED_DAG_GET_BUDGET);
  });
});

