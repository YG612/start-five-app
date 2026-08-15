import {
  captureOutcome,
  createHarness,
  makePendingTask,
  outcomeIdentity,
  PHASE4_REVIEW5_RECOVERY_AT,
  PHASE4_REVIEW5_UPDATED_AT,
} from './phase4Review5Fixtures';

describe('P4-HARDENING-5 budget catch excludes real storage failures', () => {
  it('preserves TASK_STORAGE_WRITE_FAILED, keeps cache/durable agreement, and permits a later write', async () => {
    const baseline = makePendingTask('storage-boundary-baseline');
    const {backend, durableBefore, repository} = createHarness([baseline]);
    await repository.list({includeDeleted: true});
    backend.failNextSetWith = new Error('PHASE4_REVIEW5_BACKEND_WRITE');

    const failed = await captureOutcome(
      repository.update(baseline.id, {
        title: 'This backend write must fail',
        updatedAt: PHASE4_REVIEW5_UPDATED_AT,
      }),
    );

    expect(outcomeIdentity(failed)).toEqual({
      status: 'rejected',
      code: 'TASK_STORAGE_WRITE_FAILED',
      message: 'TASK_STORAGE_WRITE_FAILED',
    });
    expect(backend.raw('start-five.tasks.v1')).toBe(durableBefore);
    expect(backend.setAttempts).toHaveLength(1);
    expect(backend.setCommits).toEqual([]);
    expect(backend.removeAttempts).toEqual([]);
    await expect(repository.list({includeDeleted: true})).resolves.toEqual([
      baseline,
    ]);

    await expect(
      repository.update(baseline.id, {
        title: 'Recovered after real storage error',
        updatedAt: PHASE4_REVIEW5_RECOVERY_AT,
      }),
    ).resolves.toMatchObject({
      id: baseline.id,
      title: 'Recovered after real storage error',
    });
    expect(backend.setAttempts).toHaveLength(2);
    expect(backend.setCommits).toHaveLength(1);
  });
});
