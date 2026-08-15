import {
  makeCancelledTask,
  makeCompletedTask,
  makeDeletedTask,
} from '../gap-p0-01a2/a2Fixtures';
import {
  PhysicalDiagnosisBackend,
  SequenceValues,
  StaticDiagnosisContext,
  errorPrivacyChannels,
  expectCode,
} from './testKit';
import {
  ScriptedDiagnosisContext,
  createReviewDiagnosisHarness,
  reviewEligibleTask,
  reviewSubmitInput,
} from './review2TestKit';

async function committedBytes(
  operationId: string,
): Promise<Readonly<{raw: string; expectedId: string}>> {
  const context = new StaticDiagnosisContext();
  context.tasks.set('review-diagnosis-task', reviewEligibleTask());
  const first = createReviewDiagnosisHarness({context});
  const created = await first.service.submit(
    reviewSubmitInput({
      privateText: 'durable private text',
      suggestions: [{kind: 'first_step', value: 'Open the smallest file'}],
    }),
    {operationId},
  );
  if (first.backend.raw === null) {
    throw new Error('EXPECTED_REVIEW_DIAGNOSIS_BYTES');
  }
  return {raw: `${first.backend.raw}`, expectedId: created.id};
}

describe('GAP-P0-03A Review2 durable operation preflight and byte-only replay', () => {
  it('replays from copied bytes before a forbidden context and returns a deeply isolated result on every command', async () => {
    const operationId = 'review-cold-replay';
    const seeded = await committedBytes(operationId);
    const backend = new PhysicalDiagnosisBackend();
    backend.raw = `${seeded.raw}`;
    const forbidden = new ScriptedDiagnosisContext(
      {task: reviewEligibleTask(), focusSession: null},
      new Error('CONTEXT_MUST_NOT_BE_CALLED_FOR_DURABLE_REPLAY'),
    );
    const restarted = createReviewDiagnosisHarness({
      backend,
      context: forbidden,
      clock: new SequenceValues([]),
      ids: new SequenceValues([]),
    });
    const sourceSuggestion = {
      kind: 'first_step' as const,
      value: 'Open the smallest file',
    };
    const input = reviewSubmitInput({
      privateText: 'durable private text',
      suggestions: [sourceSuggestion],
    });

    const replay = await restarted.service.submit(input, {operationId});
    expect(replay).toMatchObject({
      id: seeded.expectedId,
      taskId: 'review-diagnosis-task',
      privateText: 'durable private text',
    });
    const suggestion = replay.suggestions[0];
    if (suggestion === undefined || suggestion.kind !== 'first_step') {
      throw new Error('EXPECTED_REVIEW_REPLAY_SUGGESTION');
    }
    expect(suggestion.value).toBe('Open the smallest file');
    sourceSuggestion.value = 'CALLER_SOURCE_MUTATION';
    expect(replay).toMatchObject({
      privateText: 'durable private text',
      suggestions: [{kind: 'first_step', value: 'Open the smallest file'}],
    });

    const secondReplay = await restarted.service.submit(input, {operationId});
    expect(secondReplay).toMatchObject({
      id: seeded.expectedId,
      privateText: 'durable private text',
      suggestions: [{kind: 'first_step', value: 'Open the smallest file'}],
    });
    expect(forbidden.loadCount).toBe(0);
    expect(restarted.clock.calls).toBe(0);
    expect(restarted.ids.calls).toBe(0);
    expect(backend.readOnlyOperationLookupCount).toBe(2);
    expect(backend.readCount).toBe(2);
    expect(backend.transactionAttemptCount).toBe(0);
    expect(backend.commitCount).toBe(0);
    expect(backend.events).toEqual([
      'get-operation-readonly',
      'get-operation-readonly',
    ]);
    expect(backend.raw).toBe(seeded.raw);
  });

  it.each([
    ['completed', makeCompletedTask('review-diagnosis-task')],
    ['cancelled', makeCancelledTask('review-diagnosis-task')],
    ['deleted', makeDeletedTask('review-diagnosis-task')],
  ])(
    'replays an already committed operation before observing a now-%s Task',
    async (_label, terminalTask) => {
      const operationId = `review-terminal-replay-${_label}`;
      const seeded = await committedBytes(operationId);
      const backend = new PhysicalDiagnosisBackend();
      backend.raw = `${seeded.raw}`;
      const terminalContext = new ScriptedDiagnosisContext({
        task: terminalTask,
        focusSession: null,
      });
      const restarted = createReviewDiagnosisHarness({
        backend,
        context: terminalContext,
        clock: new SequenceValues([]),
        ids: new SequenceValues([]),
      });

      const replay = await restarted.service.submit(
        reviewSubmitInput({
          privateText: 'durable private text',
          suggestions: [{kind: 'first_step', value: 'Open the smallest file'}],
        }),
        {operationId},
      );
      expect(replay.id).toBe(seeded.expectedId);
      expect(terminalContext.loadCount).toBe(0);
      expect(restarted.clock.calls).toBe(0);
      expect(restarted.ids.calls).toBe(0);
      expect(backend.readOnlyOperationLookupCount).toBe(1);
      expect(backend.readCount).toBe(1);
      expect(backend.transactionAttemptCount).toBe(0);
      expect(backend.commitCount).toBe(0);
      expect(backend.events).toEqual(['get-operation-readonly']);
      expect(backend.raw).toBe(seeded.raw);
    },
  );

  it('rejects a copied-byte operation conflict before unavailable context and leaks no conflicting private text', async () => {
    const operationId = 'review-cold-conflict';
    const seeded = await committedBytes(operationId);
    const backend = new PhysicalDiagnosisBackend();
    backend.raw = `${seeded.raw}`;
    const contextFault = new Error('CONTEXT_UNAVAILABLE_REVIEW_SENTINEL');
    const unavailable = new ScriptedDiagnosisContext(
      {task: reviewEligibleTask(), focusSession: null},
      contextFault,
    );
    const restarted = createReviewDiagnosisHarness({
      backend,
      context: unavailable,
      clock: new SequenceValues([]),
      ids: new SequenceValues([]),
    });
    const secret = 'PRIVATE_REVIEW_COLD_CONFLICT_SECRET';
    const error = await expectCode(
      () =>
        restarted.service.submit(
          reviewSubmitInput({reasonKey: 'boring', privateText: secret}),
          {operationId},
        ),
      'DELAY_DIAGNOSIS_OPERATION_CONFLICT',
    );

    expect(error).not.toBe(contextFault);
    expect(unavailable.loadCount).toBe(0);
    expect(restarted.clock.calls).toBe(0);
    expect(restarted.ids.calls).toBe(0);
    expect(backend.readOnlyOperationLookupCount).toBe(1);
    expect(backend.readCount).toBe(1);
    expect(backend.transactionAttemptCount).toBe(0);
    expect(backend.commitCount).toBe(0);
    expect(backend.events).toEqual(['get-operation-readonly']);
    expect(backend.raw).toBe(seeded.raw);
    for (const channel of errorPrivacyChannels(error)) {
      expect(channel).not.toContain(secret);
    }
  });
});
