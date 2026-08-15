import {
  PhysicalReminderBackend,
  captureError,
} from '../gap-p0-03a/testKit';
import {
  REVIEW_BEFORE_SNAPSHOT,
  REVIEW_NEXT_SNAPSHOT,
  REVIEW_ORPHAN_SNAPSHOT,
  REVIEW_STALE_SNAPSHOT,
  ScriptedSchedulerBackend,
  createReviewReminderHarness,
  isRecoveryRequiredError,
  reminderRepositoryBytes,
  reviewReconcileInput,
  schedulerBytes,
} from './review1TestKit';

describe('GAP-P0-03A Review1 explicit reminder recovery state', () => {
  it('preserves commit and rollback causes, marks recovery required, and lets a new facade converge the exact retry', async () => {
    const repositoryBefore = reminderRepositoryBytes(
      REVIEW_BEFORE_SNAPSHOT,
      'review-prior-operation',
    );
    const platformBefore = schedulerBytes([REVIEW_BEFORE_SNAPSHOT]);
    const harness = createReviewReminderHarness();
    harness.repositoryBackend.raw = `${repositoryBefore}`;
    harness.schedulerBackend.raw = `${platformBefore}`;
    const commitCause = new Error('REVIEW_COMMIT_CAUSE');
    const rollbackCause = new Error('REVIEW_ROLLBACK_CAUSE');
    harness.repositoryBackend.failNextCommit = commitCause;
    harness.schedulerBackend.failures.push({attempt: 2, error: rollbackCause});
    const privateTaskText = 'PRIVATE_REMINDER_RECOVERY_TASK_TEXT';
    const input = reviewReconcileInput(
      '2026-08-05T11:00:00.000Z',
      'review-recovery-operation',
      {
        task: {
          ...reviewReconcileInput(
            '2026-08-05T11:00:00.000Z',
            'unused-inner-operation',
          ).task,
          title: privateTaskText,
        },
      },
    );

    const error = await captureError(() => harness.service.reconcile(input));
    expect(isRecoveryRequiredError(error)).toBe(true);
    if (isRecoveryRequiredError(error)) {
      expect(error.code).toBe('REMINDER_RECOVERY_REQUIRED');
      expect(error.recoveryRequired).toBe(true);
      expect(error.cause).toBe(commitCause);
      expect(error.rollbackCause).toBe(rollbackCause);
      for (const channel of [
        error.message,
        String(error),
        JSON.stringify(error),
        String(error.cause),
        String(error.rollbackCause),
      ]) {
        expect(channel).not.toContain(privateTaskText);
      }
    }
    expect(harness.repositoryBackend.raw).toBe(repositoryBefore);
    expect(harness.repositoryBackend.readCount).toBe(1);
    expect(harness.repositoryBackend.transactionAttemptCount).toBe(1);
    expect(harness.repositoryBackend.saveAttemptCount).toBe(1);
    expect(harness.repositoryBackend.removeAttemptCount).toBe(0);
    expect(harness.repositoryBackend.commitCount).toBe(0);
    expect(harness.repositoryBackend.events).toEqual([
      'transaction-begin',
      'transaction-get',
      'save',
      'commit-failed',
    ]);
    expect(harness.schedulerBackend.raw).toBe(
      schedulerBytes([REVIEW_NEXT_SNAPSHOT]),
    );
    expect(harness.schedulerBackend.queryCount).toBe(1);
    expect(harness.schedulerBackend.replaceAttemptCount).toBe(2);
    expect(harness.schedulerBackend.calls).toEqual([
      {previous: REVIEW_BEFORE_SNAPSHOT, next: REVIEW_NEXT_SNAPSHOT},
      {previous: REVIEW_NEXT_SNAPSHOT, next: REVIEW_BEFORE_SNAPSHOT},
    ]);
    expect(harness.schedulerBackend.events).toEqual([
      'get',
      'replace-1-begin',
      'replace-1-committed',
      'replace-2-begin',
      'replace-2-failed',
    ]);

    const restartedRepositoryBackend = new PhysicalReminderBackend();
    restartedRepositoryBackend.raw = `${harness.repositoryBackend.raw}`;
    const restartedSchedulerBackend = new ScriptedSchedulerBackend();
    restartedSchedulerBackend.raw = `${harness.schedulerBackend.raw}`;
    const restarted = createReviewReminderHarness({
      repositoryBackend: restartedRepositoryBackend,
      schedulerBackend: restartedSchedulerBackend,
    });
    const retry = await restarted.service.reconcile(input);
    expect(retry).toEqual(REVIEW_NEXT_SNAPSHOT);
    expect(restartedRepositoryBackend.readCount).toBe(1);
    expect(restartedRepositoryBackend.transactionAttemptCount).toBe(1);
    expect(restartedRepositoryBackend.saveAttemptCount).toBe(1);
    expect(restartedRepositoryBackend.removeAttemptCount).toBe(0);
    expect(restartedRepositoryBackend.commitCount).toBe(1);
    expect(restartedSchedulerBackend.queryCount).toBe(1);
    expect(restartedSchedulerBackend.replaceAttemptCount).toBe(0);
    expect(restartedSchedulerBackend.calls).toEqual([]);
    expect(restartedSchedulerBackend.raw).toBe(
      schedulerBytes([REVIEW_NEXT_SNAPSHOT]),
    );
    expect(restartedRepositoryBackend.raw).not.toBe(repositoryBefore);
    expect(restartedRepositoryBackend.raw).toContain('"generation":2');
    expect(restartedRepositoryBackend.raw).not.toContain('"generation":3');
    expect(restartedRepositoryBackend.raw).toContain(
      'review-recovery-operation',
    );
  });

  it('converges repository-before plus already-new platform bytes without a duplicate generation or replacement', async () => {
    const harness = createReviewReminderHarness();
    harness.repositoryBackend.raw = reminderRepositoryBytes(
      REVIEW_BEFORE_SNAPSHOT,
      'review-prior-operation',
    );
    harness.schedulerBackend.raw = schedulerBytes([REVIEW_NEXT_SNAPSHOT]);

    const result = await harness.service.reconcile(
      reviewReconcileInput(
        '2026-08-05T11:00:00.000Z',
        'review-platform-already-new',
      ),
    );
    expect(result).toEqual(REVIEW_NEXT_SNAPSHOT);
    expect(harness.repositoryBackend.readCount).toBe(1);
    expect(harness.repositoryBackend.transactionAttemptCount).toBe(1);
    expect(harness.repositoryBackend.saveAttemptCount).toBe(1);
    expect(harness.repositoryBackend.commitCount).toBe(1);
    expect(harness.schedulerBackend.queryCount).toBe(1);
    expect(harness.schedulerBackend.replaceAttemptCount).toBe(0);
    expect(harness.schedulerBackend.calls).toEqual([]);
    expect(harness.schedulerBackend.raw).toBe(
      schedulerBytes([REVIEW_NEXT_SNAPSHOT]),
    );
    expect(harness.repositoryBackend.raw).toContain('"generation":2');
    expect(harness.repositoryBackend.raw).not.toContain('"generation":3');
  });

  it('converges repository-before plus a stale platform view with one exact CAS replacement', async () => {
    const harness = createReviewReminderHarness();
    harness.repositoryBackend.raw = reminderRepositoryBytes(
      REVIEW_BEFORE_SNAPSHOT,
      'review-prior-operation',
    );
    harness.schedulerBackend.raw = schedulerBytes([REVIEW_STALE_SNAPSHOT]);

    const result = await harness.service.reconcile(
      reviewReconcileInput(
        '2026-08-05T11:00:00.000Z',
        'review-platform-stale',
      ),
    );
    expect(result).toEqual(REVIEW_NEXT_SNAPSHOT);
    expect(harness.repositoryBackend.readCount).toBe(1);
    expect(harness.repositoryBackend.transactionAttemptCount).toBe(1);
    expect(harness.repositoryBackend.saveAttemptCount).toBe(1);
    expect(harness.repositoryBackend.commitCount).toBe(1);
    expect(harness.schedulerBackend.queryCount).toBe(1);
    expect(harness.schedulerBackend.replaceAttemptCount).toBe(1);
    expect(harness.schedulerBackend.calls).toEqual([
      {previous: REVIEW_STALE_SNAPSHOT, next: REVIEW_NEXT_SNAPSHOT},
    ]);
    expect(harness.schedulerBackend.raw).toBe(
      schedulerBytes([REVIEW_NEXT_SNAPSHOT]),
    );
    expect(harness.repositoryBackend.raw).toContain('"generation":2');
    expect(harness.repositoryBackend.raw).not.toContain('"generation":3');
  });

  it('adopts an initial orphan platform generation into an empty repository without rescheduling it', async () => {
    const harness = createReviewReminderHarness();
    harness.schedulerBackend.raw = schedulerBytes([REVIEW_ORPHAN_SNAPSHOT]);

    const result = await harness.service.reconcile(
      reviewReconcileInput(
        '2026-08-05T11:00:00.000Z',
        'review-initial-orphan',
      ),
    );
    expect(result).toEqual(REVIEW_ORPHAN_SNAPSHOT);
    expect(harness.repositoryBackend.readCount).toBe(1);
    expect(harness.repositoryBackend.transactionAttemptCount).toBe(1);
    expect(harness.repositoryBackend.saveAttemptCount).toBe(1);
    expect(harness.repositoryBackend.commitCount).toBe(1);
    expect(harness.schedulerBackend.queryCount).toBe(1);
    expect(harness.schedulerBackend.replaceAttemptCount).toBe(0);
    expect(harness.schedulerBackend.calls).toEqual([]);
    expect(harness.schedulerBackend.raw).toBe(
      schedulerBytes([REVIEW_ORPHAN_SNAPSHOT]),
    );
    expect(harness.repositoryBackend.raw).toContain('"generation":1');
    expect(harness.repositoryBackend.raw).not.toContain('"generation":2');
  });
});
