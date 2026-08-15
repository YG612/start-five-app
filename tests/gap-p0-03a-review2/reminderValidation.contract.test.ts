import {
  captureError,
  loadReminderModule,
  type ReminderRule,
} from './testKit';
import {
  REVIEW_START_RULE,
  createReviewReminderHarness,
  reviewReconcileInput,
} from './review2TestKit';

function captureSynchronousError(operation: () => unknown): unknown {
  try {
    operation();
  } catch (error: unknown) {
    return error;
  }
  throw new Error('EXPECTED_REVIEW_SYNCHRONOUS_ERROR');
}

async function expectInvalidRules(
  rules: readonly ReminderRule[],
  expectedCode: string,
): Promise<void> {
  const input = reviewReconcileInput(
    '2026-08-05T10:00:00.000Z',
    `invalid-${expectedCode}`,
    {rules},
  );
  const pureError = captureSynchronousError(() =>
    loadReminderModule().deriveReminderPlan(input),
  );
  expect(pureError).toMatchObject({code: expectedCode});
  expect(pureError).not.toBeInstanceOf(RangeError);

  const harness = createReviewReminderHarness();
  const serviceError = await captureError(() => harness.service.reconcile(input));
  expect(serviceError).toMatchObject({code: expectedCode});
  expect(serviceError).not.toBeInstanceOf(RangeError);
  expect(harness.repositoryBackend.raw).toBeNull();
  expect(harness.repositoryBackend.readCount).toBe(0);
  expect(harness.repositoryBackend.readOnlyLookupCount).toBe(0);
  expect(harness.repositoryBackend.transactionAttemptCount).toBe(0);
  expect(harness.repositoryBackend.saveAttemptCount).toBe(0);
  expect(harness.repositoryBackend.removeAttemptCount).toBe(0);
  expect(harness.repositoryBackend.commitCount).toBe(0);
  expect(harness.repositoryBackend.events).toEqual([]);
  expect(harness.schedulerBackend.queryCount).toBe(0);
  expect(harness.schedulerBackend.replaceAttemptCount).toBe(0);
  expect(harness.schedulerBackend.calls).toEqual([]);
  expect(harness.schedulerBackend.raw).toBeNull();
}

describe('GAP-P0-03A Review2 fail-fast reminder rule validation', () => {
  it('rejects duplicate rule IDs before repository or scheduler effects', async () => {
    await expectInvalidRules(
      [
        REVIEW_START_RULE,
        {
          id: REVIEW_START_RULE.id,
          kind: 'rescue',
          anchor: 'due',
          offsetMinutes: -5,
          progressBelow: 0.5,
        },
      ],
      'REMINDER_RULE_ID_DUPLICATE',
    );
  });

  it.each([
    ['NaN', Number.NaN],
    ['positive infinity', Number.POSITIVE_INFINITY],
    ['negative infinity', Number.NEGATIVE_INFINITY],
    ['non-integer', 1.25],
  ])(
    'rejects a %s minute offset with a stable domain error and no I/O',
    async (_label, offsetMinutes) => {
      await expectInvalidRules(
        [{...REVIEW_START_RULE, offsetMinutes}],
        'REMINDER_RULE_OFFSET_INVALID',
      );
    },
  );

  it('rejects finite integer trigger-time overflow without exposing native RangeError', async () => {
    await expectInvalidRules(
      [{...REVIEW_START_RULE, offsetMinutes: Number.MAX_SAFE_INTEGER}],
      'REMINDER_TRIGGER_TIMESTAMP_OUT_OF_RANGE',
    );
  });

  it.each([
    ['NaN', Number.NaN],
    ['positive infinity', Number.POSITIVE_INFINITY],
    ['negative infinity', Number.NEGATIVE_INFINITY],
    ['below zero', -0.000001],
    ['above one', 1.000001],
  ])(
    'rejects a %s progress threshold with a stable domain error and no I/O',
    async (_label, progressBelow) => {
      await expectInvalidRules(
        [{...REVIEW_START_RULE, progressBelow}],
        'REMINDER_RULE_PROGRESS_THRESHOLD_INVALID',
      );
    },
  );
});
