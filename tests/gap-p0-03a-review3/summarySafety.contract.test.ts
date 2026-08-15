import {
  PhysicalDiagnosisBackend,
  StaticDiagnosisContext,
  type DelayDiagnosisPolicy,
} from './testKit';
import {
  REVIEW_POLICY,
  ScriptedDiagnosisContext,
  createReviewDiagnosisHarness,
  reviewEligibleTask,
  reviewSubmitInput,
} from './review3TestKit';

const ADVERSARIAL_REASON_KEYS: readonly string[] = [
  '__proto__',
  'constructor',
  'toString',
  'hasOwnProperty',
  'e\u0301',
  'é',
  '原因',
  '🙂',
];

const EXPECTED_SUMMARY = {
  total: 13,
  byReason: [
    {key: '__proto__', count: 2},
    {key: 'constructor', count: 1},
    {key: 'e\u0301', count: 2},
    {key: 'hasOwnProperty', count: 1},
    {key: 'toString', count: 2},
    {key: 'é', count: 1},
    {key: '原因', count: 2},
    {key: '🙂', count: 2},
  ],
  byTrigger: [{key: 'user_stuck', count: 13}],
} as const;

const SUBMISSIONS: readonly Readonly<{
  reasonKey: string;
  operationId: string;
}>[] = [
  {reasonKey: '__proto__', operationId: 'summary-proto-1'},
  {reasonKey: 'constructor', operationId: 'summary-constructor-1'},
  {reasonKey: 'toString', operationId: 'summary-to-string-1'},
  {reasonKey: 'hasOwnProperty', operationId: 'summary-own-property-1'},
  {reasonKey: 'e\u0301', operationId: 'summary-decomposed-1'},
  {reasonKey: 'é', operationId: 'summary-composed-1'},
  {reasonKey: '原因', operationId: 'summary-cjk-1'},
  {reasonKey: '🙂', operationId: 'summary-emoji-1'},
  {reasonKey: '__proto__', operationId: 'summary-proto-2'},
  {reasonKey: 'toString', operationId: 'summary-to-string-2'},
  {reasonKey: 'e\u0301', operationId: 'summary-decomposed-2'},
  {reasonKey: '原因', operationId: 'summary-cjk-2'},
  {reasonKey: '🙂', operationId: 'summary-emoji-2'},
];

describe('GAP-P0-03A Review3 prototype-safe deterministic summaries', () => {
  it('counts adversarial and Unicode keys exactly, preserves Object.prototype, restarts consistently, and detaches results', async () => {
    const prototypeNamesBefore = Object.getOwnPropertyNames(Object.prototype);
    const policy: DelayDiagnosisPolicy = {
      ...REVIEW_POLICY,
      allowedReasonKeys: ADVERSARIAL_REASON_KEYS,
    };
    const context = new StaticDiagnosisContext();
    context.tasks.set('review-diagnosis-task', reviewEligibleTask());
    const first = createReviewDiagnosisHarness({context, policy});

    for (const submission of SUBMISSIONS) {
      await first.service.submit(
        reviewSubmitInput({
          reasonKey: submission.reasonKey,
          privateText: `PRIVATE_${submission.operationId}`,
          suggestions: [
            {kind: 'first_step', value: `SUGGESTION_${submission.operationId}`},
          ],
        }),
        {operationId: submission.operationId},
      );
    }

    const summary = await first.service.summarize('review-diagnosis-task');
    expect(summary).toEqual(EXPECTED_SUMMARY);
    expect(Object.getOwnPropertyNames(Object.prototype)).toEqual(
      prototypeNamesBefore,
    );
    expect(first.backend.readOnlyOperationLookupCount).toBe(13);
    expect(first.backend.transactionAttemptCount).toBe(13);
    expect(first.backend.commitCount).toBe(13);
    const callerClone = {
      ...summary,
      byReason: summary.byReason.map(count => ({...count})),
      byTrigger: summary.byTrigger.map(count => ({...count})),
    };
    const firstCount = callerClone.byReason[0];
    if (firstCount === undefined) {
      throw new Error('EXPECTED_REVIEW_SUMMARY_COUNT');
    }
    firstCount.count = 999;
    expect(summary).toEqual(EXPECTED_SUMMARY);
    expect(await first.service.summarize('review-diagnosis-task')).toEqual(
      EXPECTED_SUMMARY,
    );

    const raw = first.backend.raw;
    if (raw === null) {
      throw new Error('EXPECTED_REVIEW_SUMMARY_BYTES');
    }
    const restartedBackend = new PhysicalDiagnosisBackend();
    restartedBackend.raw = `${raw}`;
    const forbiddenContext = new ScriptedDiagnosisContext(
      {task: null, focusSession: null},
      new Error('SUMMARY_MUST_NOT_LOAD_CONTEXT'),
    );
    const restarted = createReviewDiagnosisHarness({
      backend: restartedBackend,
      context: forbiddenContext,
      policy,
    });
    expect(
      await restarted.service.summarize('review-diagnosis-task'),
    ).toEqual(EXPECTED_SUMMARY);
    expect(forbiddenContext.loadCount).toBe(0);
    expect(restartedBackend.raw).toBe(raw);
    expect(Object.getOwnPropertyNames(Object.prototype)).toEqual(
      prototypeNamesBefore,
    );
    const serialized = JSON.stringify(
      await restarted.service.summarize('review-diagnosis-task'),
    );
    for (const submission of SUBMISSIONS) {
      expect(serialized).not.toContain(`PRIVATE_${submission.operationId}`);
      expect(serialized).not.toContain(`SUGGESTION_${submission.operationId}`);
    }
  });
});
