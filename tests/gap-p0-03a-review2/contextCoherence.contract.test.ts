import {
  errorPrivacyChannels,
  expectCode,
  focusSession,
} from './testKit';
import {
  ScriptedDiagnosisContext,
  createReviewDiagnosisHarness,
  reviewEligibleTask,
  reviewSubmitInput,
} from './review2TestKit';

describe('GAP-P0-03A Review2 authoritative context identity coherence', () => {
  it.each([
    [
      'returned Task ID differs from the requested Task ID',
      'DELAY_DIAGNOSIS_TASK_ID_MISMATCH',
      new ScriptedDiagnosisContext({
        task: reviewEligibleTask('different-returned-task'),
        focusSession: null,
      }),
      reviewSubmitInput(),
      'PRIVATE_CONTEXT_TASK_ID_MISMATCH',
    ],
    [
      'returned FocusSession ID differs from the requested FocusSession ID',
      'DELAY_DIAGNOSIS_SESSION_ID_MISMATCH',
      new ScriptedDiagnosisContext({
        task: reviewEligibleTask(),
        focusSession: focusSession(
          'different-returned-focus',
          'review-diagnosis-task',
        ),
      }),
      reviewSubmitInput({
        focusSessionId: 'requested-focus',
        trigger: 'focus_interrupted',
      }),
      'PRIVATE_CONTEXT_FOCUS_ID_MISMATCH',
    ],
    [
      'returned FocusSession Task ID differs from the authoritative Task ID',
      'DELAY_DIAGNOSIS_SESSION_TASK_MISMATCH',
      new ScriptedDiagnosisContext({
        task: reviewEligibleTask(),
        focusSession: focusSession('requested-focus', 'different-task'),
      }),
      reviewSubmitInput({
        focusSessionId: 'requested-focus',
        trigger: 'focus_interrupted',
      }),
      'PRIVATE_CONTEXT_FOCUS_TASK_MISMATCH',
    ],
  ])(
    'rejects when %s with one read-only lookup and no mutation',
    async (_label, expectedCode, context, baseInput, secret) => {
      const harness = createReviewDiagnosisHarness({context});
      const input = {...baseInput, privateText: secret};
      const error = await expectCode(
        () =>
          harness.service.submit(input, {
            operationId: `review-context-${expectedCode}`,
          }),
        expectedCode,
      );

      expect(context.calls).toEqual([
        {
          taskId: input.taskId,
          focusSessionId: input.focusSessionId,
        },
      ]);
      expect(context.loadCount).toBe(1);
      expect(harness.backend.raw).toBeNull();
      expect(harness.backend.readOnlyOperationLookupCount).toBe(1);
      expect(harness.backend.readCount).toBe(1);
      expect(harness.backend.transactionAttemptCount).toBe(0);
      expect(harness.backend.commitCount).toBe(0);
      expect(harness.backend.events).toEqual(['get-operation-readonly']);
      expect(harness.clock.calls).toBe(0);
      expect(harness.ids.calls).toBe(0);
      const serializedSurface = JSON.stringify({
        errorChannels: errorPrivacyChannels(error),
        contextCalls: context.calls,
        repositoryEvents: harness.backend.events,
        repositoryRaw: harness.backend.raw,
      });
      expect(serializedSurface).not.toContain(secret);
    },
  );
});
