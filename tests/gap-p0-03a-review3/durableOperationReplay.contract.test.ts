import {
  makeCancelledTask,
  makeCompletedTask,
  makeDeletedTask,
} from '../gap-p0-01a2/a2Fixtures';
import {
  ByteDiagnosisRepository,
  PhysicalDiagnosisBackend,
  SequenceValues,
  StaticDiagnosisContext,
  errorPrivacyChannels,
  expectCode,
  type DelayDiagnosis,
  type DelayDiagnosisOperationRecord,
  type DelayDiagnosisRepository,
  type DelayDiagnosisTransaction,
} from './testKit';
import {
  REVIEW_POLICY,
  ScriptedDiagnosisContext,
  createReviewDiagnosisHarness,
  reviewEligibleTask,
  reviewSubmitInput,
} from './review3TestKit';

type ReviewSubmitInput = ReturnType<typeof reviewSubmitInput>;

function fingerprintBaseline(): ReviewSubmitInput {
  return reviewSubmitInput({
    privateText: 'normalized fingerprint text',
    suggestions: [
      {kind: 'first_step', value: 'Open the smallest file'},
      {kind: 'estimated_minutes', value: 5},
      {
        kind: 'reschedule',
        scheduledStartAt: '2026-08-05T11:00:00.000Z',
      },
    ],
  });
}

const FINGERPRINT_CHANGES: readonly Readonly<{
  label: string;
  change(input: ReviewSubmitInput): ReviewSubmitInput;
}>[] = [
  {
    label: 'taskId',
    change: input => reviewSubmitInput({...input, taskId: 'changed-task'}),
  },
  {
    label: 'focusSessionId',
    change: input =>
      reviewSubmitInput({...input, focusSessionId: 'changed-focus'}),
  },
  {
    label: 'signals.consecutiveDelayCount',
    change: input =>
      reviewSubmitInput({
        ...input,
        signals: {...input.signals, consecutiveDelayCount: 3},
      }),
  },
  {
    label: 'signals.dismissedReminderCount',
    change: input =>
      reviewSubmitInput({
        ...input,
        signals: {...input.signals, dismissedReminderCount: 4},
      }),
  },
  {
    label: 'signals.progressRatio',
    change: input =>
      reviewSubmitInput({
        ...input,
        signals: {...input.signals, progressRatio: 0.25},
      }),
  },
  {
    label: 'signals.userStuck',
    change: input =>
      reviewSubmitInput({
        ...input,
        signals: {...input.signals, userStuck: false},
      }),
  },
  {
    label: 'trigger',
    change: input =>
      reviewSubmitInput({...input, trigger: 'repeated_delay'}),
  },
  {
    label: 'reasonKey',
    change: input => reviewSubmitInput({...input, reasonKey: 'boring'}),
  },
  {
    label: 'normalized privateText',
    change: input =>
      reviewSubmitInput({...input, privateText: 'changed private text'}),
  },
  {
    label: 'first_step suggestion value',
    change: input =>
      reviewSubmitInput({
        ...input,
        suggestions: [
          {kind: 'first_step', value: 'Changed first step'},
          input.suggestions[1]!,
          input.suggestions[2]!,
        ],
      }),
  },
  {
    label: 'estimated_minutes suggestion value',
    change: input =>
      reviewSubmitInput({
        ...input,
        suggestions: [
          input.suggestions[0]!,
          {kind: 'estimated_minutes', value: 8},
          input.suggestions[2]!,
        ],
      }),
  },
  {
    label: 'reschedule suggestion instant',
    change: input =>
      reviewSubmitInput({
        ...input,
        suggestions: [
          input.suggestions[0]!,
          input.suggestions[1]!,
          {
            kind: 'reschedule',
            scheduledStartAt: '2026-08-05T12:00:00.000Z',
          },
        ],
      }),
  },
  {
    label: 'ordered suggestion list',
    change: input =>
      reviewSubmitInput({
        ...input,
        suggestions: [
          input.suggestions[1]!,
          input.suggestions[0]!,
          input.suggestions[2]!,
        ],
      }),
  },
];

class TwoPartyBarrier {
  private arrivals = 0;
  private release: (() => void) | null = null;
  private readonly released = new Promise<void>(resolve => {
    this.release = resolve;
  });

  async arrive(): Promise<void> {
    this.arrivals += 1;
    if (this.arrivals === 2) {
      this.release?.();
    }
    await this.released;
  }
}

class CollisionRepository implements DelayDiagnosisRepository {
  readonly events: string[] = [];
  readonly publicResults: Array<'null' | 'existing'> = [];
  readonly transactionResults: Array<'null' | 'existing'> = [];
  transactionRequests = 0;
  private readonly publicBarrier = new TwoPartyBarrier();
  private readonly transactionBarrier = new TwoPartyBarrier();

  constructor(private readonly inner: DelayDiagnosisRepository) {}

  async getOperation(
    operationId: string,
  ): Promise<DelayDiagnosisOperationRecord | null> {
    const value = await this.inner.getOperation(operationId);
    const result = value === null ? 'null' : 'existing';
    this.publicResults.push(result);
    this.events.push(`public-${this.publicResults.length}-${result}`);
    await this.publicBarrier.arrive();
    return value;
  }

  list(taskId?: string): Promise<readonly DelayDiagnosis[]> {
    return this.inner.list(taskId);
  }

  async transaction<T>(
    work: (transaction: DelayDiagnosisTransaction) => Promise<T>,
  ): Promise<T> {
    this.transactionRequests += 1;
    const request = this.transactionRequests;
    this.events.push(`transaction-request-${request}`);
    await this.transactionBarrier.arrive();
    return this.inner.transaction(transaction =>
      work({
        getOperation: async operationId => {
          const value = await transaction.getOperation(operationId);
          const result = value === null ? 'null' : 'existing';
          this.transactionResults.push(result);
          this.events.push(
            `transaction-get-${this.transactionResults.length}-${result}`,
          );
          return value;
        },
        saveDiagnosis(diagnosis) {
          return transaction.saveDiagnosis(diagnosis);
        },
        saveOperation(operation) {
          return transaction.saveOperation(operation);
        },
      }),
    );
  }
}

async function committedBytes(
  operationId: string,
  input: ReviewSubmitInput = reviewSubmitInput({
    privateText: 'durable private text',
    suggestions: [{kind: 'first_step', value: 'Open the smallest file'}],
  }),
) {
  const context = new StaticDiagnosisContext();
  context.tasks.set('review-diagnosis-task', reviewEligibleTask());
  const first = createReviewDiagnosisHarness({context});
  const created = await first.service.submit(input, {operationId});
  if (first.backend.raw === null) {
    throw new Error('EXPECTED_REVIEW_DIAGNOSIS_BYTES');
  }
  return {raw: `${first.backend.raw}`, expectedId: created.id, created};
}

describe('GAP-P0-03A Review3 durable operation preflight and byte-only replay', () => {
  it.each(FINGERPRINT_CHANGES)(
    'cold-conflicts when only normalized operation field $label changes',
    async ({label, change}) => {
      const operationId = `review-fingerprint-${label}`;
      const baseline = fingerprintBaseline();
      const seeded = await committedBytes(operationId, baseline);
      const backend = new PhysicalDiagnosisBackend();
      backend.raw = `${seeded.raw}`;
      const forbidden = new ScriptedDiagnosisContext(
        {task: reviewEligibleTask(), focusSession: null},
        new Error('CONTEXT_MUST_NOT_BE_CALLED_FOR_FINGERPRINT_CONFLICT'),
      );
      const restarted = createReviewDiagnosisHarness({
        backend,
        context: forbidden,
        clock: new SequenceValues([]),
        ids: new SequenceValues([]),
      });
      const changed = change(fingerprintBaseline());
      const error = await expectCode(
        () => restarted.service.submit(changed, {operationId}),
        'DELAY_DIAGNOSIS_OPERATION_CONFLICT',
      );

      expect(forbidden.loadCount).toBe(0);
      expect(restarted.clock.calls).toBe(0);
      expect(restarted.ids.calls).toBe(0);
      expect(backend.readOnlyOperationLookupCount).toBe(1);
      expect(backend.readCount).toBe(1);
      expect(backend.transactionAttemptCount).toBe(0);
      expect(backend.commitCount).toBe(0);
      expect(backend.events).toEqual(['get-operation-readonly']);
      expect(backend.raw).toBe(seeded.raw);
      for (const channel of errorPrivacyChannels(error)) {
        expect(channel).not.toContain('changed private text');
        expect(channel).not.toContain('Changed first step');
      }
    },
  );

  it('replays normalized private text equivalence instead of fingerprinting raw caller whitespace', async () => {
    const operationId = 'review-normalized-private-equivalence';
    const seeded = await committedBytes(
      operationId,
      reviewSubmitInput({privateText: '  normalized private text  '}),
    );
    const backend = new PhysicalDiagnosisBackend();
    backend.raw = `${seeded.raw}`;
    const forbidden = new ScriptedDiagnosisContext(
      {task: reviewEligibleTask(), focusSession: null},
      new Error('CONTEXT_MUST_NOT_BE_CALLED_FOR_NORMALIZED_REPLAY'),
    );
    const restarted = createReviewDiagnosisHarness({
      backend,
      context: forbidden,
      clock: new SequenceValues([]),
      ids: new SequenceValues([]),
    });
    const replay = await restarted.service.submit(
      reviewSubmitInput({privateText: 'normalized private text'}),
      {operationId},
    );
    expect(replay.id).toBe(seeded.expectedId);
    expect(replay.privateText).toBe('normalized private text');
    expect(forbidden.loadCount).toBe(0);
    expect(backend.events).toEqual(['get-operation-readonly']);
    expect(backend.raw).toBe(seeded.raw);
  });

  it('lets transaction-local collision state decide after both public lookups observed null', async () => {
    const backend = new PhysicalDiagnosisBackend();
    const repository = new CollisionRepository(
      new ByteDiagnosisRepository(backend),
    );
    const context = new StaticDiagnosisContext();
    context.tasks.set('review-diagnosis-task', reviewEligibleTask());
    const left = createReviewDiagnosisHarness({
      backend,
      context,
      clock: new SequenceValues(['2026-08-05T10:00:00.000Z']),
      ids: new SequenceValues(['collision-left']),
    });
    const right = createReviewDiagnosisHarness({
      backend,
      context,
      clock: new SequenceValues(['2026-08-05T10:01:00.000Z']),
      ids: new SequenceValues(['collision-right']),
    });
    const production = jest.requireActual<{
      createDelayDiagnosisService(options: Readonly<{
        context: typeof context;
        repository: DelayDiagnosisRepository;
        now(): string;
        idGenerator(): string;
        policy: typeof REVIEW_POLICY;
      }>): typeof left.service;
    }>('../../src/application/delayDiagnosis');
    const leftService = production.createDelayDiagnosisService({
      context,
      repository,
      now: left.clock.next,
      idGenerator: left.ids.next,
      policy: REVIEW_POLICY,
    });
    const rightService = production.createDelayDiagnosisService({
      context,
      repository,
      now: right.clock.next,
      idGenerator: right.ids.next,
      policy: REVIEW_POLICY,
    });
    const input = reviewSubmitInput({privateText: 'collision command'});
    const [leftResult, rightResult] = await Promise.all([
      leftService.submit(input, {operationId: 'collision-operation'}),
      rightService.submit(input, {operationId: 'collision-operation'}),
    ]);

    expect(repository.publicResults).toEqual(['null', 'null']);
    expect(repository.events.slice(0, 2)).toEqual([
      'public-1-null',
      'public-2-null',
    ]);
    expect(repository.transactionResults).toEqual(['null', 'existing']);
    expect(repository.transactionRequests).toBe(2);
    expect(leftResult).toEqual(rightResult);
    expect(backend.commitCount).toBe(1);
    expect((await repository.list('review-diagnosis-task'))).toHaveLength(1);
    expect(left.clock.calls + right.clock.calls).toBe(1);
    expect(left.ids.calls + right.ids.calls).toBe(1);
  });

  it('replays an equivalent fresh command from copied bytes and stays detached without requiring mutable outputs', async () => {
    const operationId = 'review-cold-replay';
    const sourceSuggestion = {
      kind: 'first_step' as const,
      value: 'Open the smallest file',
    };
    const firstInput = reviewSubmitInput({
      privateText: 'durable private text',
      suggestions: [sourceSuggestion],
    });
    const seeded = await committedBytes(operationId, firstInput);
    sourceSuggestion.value = 'CALLER_SOURCE_MUTATION';
    expect(seeded.created).toMatchObject({
      id: seeded.expectedId,
      taskId: 'review-diagnosis-task',
      privateText: 'durable private text',
      suggestions: [{kind: 'first_step', value: 'Open the smallest file'}],
    });
    expect(seeded.raw).toContain('Open the smallest file');
    expect(seeded.raw).not.toContain('CALLER_SOURCE_MUTATION');

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

    const equivalentReplayInput = reviewSubmitInput({
      privateText: 'durable private text',
      suggestions: [{kind: 'first_step', value: 'Open the smallest file'}],
    });
    const secondReplay = await restarted.service.submit(
      equivalentReplayInput,
      {operationId},
    );
    expect(secondReplay).toMatchObject({
      id: seeded.expectedId,
      privateText: 'durable private text',
      suggestions: [{kind: 'first_step', value: 'Open the smallest file'}],
    });
    expect(forbidden.loadCount).toBe(0);
    expect(restarted.clock.calls).toBe(0);
    expect(restarted.ids.calls).toBe(0);
    expect(backend.readOnlyOperationLookupCount).toBe(1);
    expect(backend.readCount).toBe(1);
    expect(backend.transactionAttemptCount).toBe(0);
    expect(backend.commitCount).toBe(0);
    expect(backend.events).toEqual(['get-operation-readonly']);
    expect(backend.raw).toBe(seeded.raw);
  });

  it('treats a changed suggestion as an operation conflict with only one new read-only lookup', async () => {
    const operationId = 'review-suggestion-conflict';
    const sourceSuggestion = {
      kind: 'first_step' as const,
      value: 'Open the smallest file',
    };
    const input = reviewSubmitInput({
      privateText: 'durable private text',
      suggestions: [sourceSuggestion],
    });
    const seeded = await committedBytes(operationId, input);
    const backend = new PhysicalDiagnosisBackend();
    backend.raw = `${seeded.raw}`;
    const forbidden = new ScriptedDiagnosisContext(
      {task: reviewEligibleTask(), focusSession: null},
      new Error('CONTEXT_MUST_NOT_BE_CALLED_FOR_SUGGESTION_CONFLICT'),
    );
    const restarted = createReviewDiagnosisHarness({
      backend,
      context: forbidden,
      clock: new SequenceValues([]),
      ids: new SequenceValues([]),
    });

    const beforeConflict = {
      raw: backend.raw,
      readCount: backend.readCount,
      readOnlyOperationLookupCount: backend.readOnlyOperationLookupCount,
      transactionAttemptCount: backend.transactionAttemptCount,
      commitCount: backend.commitCount,
      eventCount: backend.events.length,
      contextLoadCount: forbidden.loadCount,
      clockCalls: restarted.clock.calls,
      idCalls: restarted.ids.calls,
    };
    const changedSuggestion = 'CALLER_CHANGED_SUGGESTION_SECRET';
    sourceSuggestion.value = changedSuggestion;
    const error = await expectCode(
      () => restarted.service.submit(input, {operationId}),
      'DELAY_DIAGNOSIS_OPERATION_CONFLICT',
    );

    expect(seeded.created).toMatchObject({
      id: seeded.expectedId,
      suggestions: [{kind: 'first_step', value: 'Open the smallest file'}],
    });
    expect(backend.readCount - beforeConflict.readCount).toBe(1);
    expect(
      backend.readOnlyOperationLookupCount -
        beforeConflict.readOnlyOperationLookupCount,
    ).toBe(1);
    expect(backend.transactionAttemptCount).toBe(
      beforeConflict.transactionAttemptCount,
    );
    expect(backend.commitCount).toBe(beforeConflict.commitCount);
    expect(forbidden.loadCount).toBe(beforeConflict.contextLoadCount);
    expect(restarted.clock.calls).toBe(beforeConflict.clockCalls);
    expect(restarted.ids.calls).toBe(beforeConflict.idCalls);
    expect(backend.events.slice(beforeConflict.eventCount)).toEqual([
      'get-operation-readonly',
    ]);
    expect(backend.raw).toBe(beforeConflict.raw);
    for (const channel of errorPrivacyChannels(error)) {
      expect(channel).not.toContain(changedSuggestion);
    }
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
