import {
  A2_STORAGE_KEY,
  createA2Harness,
  makeCancelledTask,
  makeCompletedTask,
  makeDeletedTask,
  makeTask,
} from '../gap-p0-01a2/a2Fixtures';
import {
  MemoryFocusBackend,
  loadPersistentProduction,
} from '../gap-p0-02b/focusSessionTestKit';
import {
  ByteDiagnosisRepository,
  ManualBarrier,
  PhysicalDiagnosisBackend,
  SequenceValues,
  StaticDiagnosisContext,
  captureError,
  errorPrivacyChannels,
  expectCode,
  focusSession,
  loadDiagnosisModule,
  type DelayDiagnosisModule,
  type DelayDiagnosisPolicy,
  type DelayDiagnosisService,
  type DelayDiagnosisSignals,
  type DelayDiagnosisSubmitInput,
  type DelayDiagnosisTrigger,
} from './testKit';

const PRD_REASON_KEYS: readonly string[] = [
  'task_too_large',
  'unclear_how_to_start',
  'afraid_of_poor_quality',
  'boring',
  'too_tired',
  'not_enough_time',
  'distracted',
  'not_necessary_now',
  'other',
];

const POLICY: DelayDiagnosisPolicy = {
  minimumConsecutiveDelays: 2,
  minimumReminderDismissals: 3,
  dueRiskWindowMinutes: 120,
  dueRiskProgressBelow: 0.5,
  allowedReasonKeys: PRD_REASON_KEYS,
  maxPrivateTextCodePoints: 40,
};

const QUIET_SIGNALS: DelayDiagnosisSignals = {
  consecutiveDelayCount: 0,
  dismissedReminderCount: 0,
  progressRatio: 0.8,
  userStuck: false,
};

const STUCK_SIGNALS: DelayDiagnosisSignals = {
  ...QUIET_SIGNALS,
  userStuck: true,
};

const DIAGNOSIS_CREATED_AT_OLD = '2026-08-05T09:00:00.000Z';
const DIAGNOSIS_CREATED_AT_TIE = '2026-08-05T10:00:00.000Z';
const DIAGNOSIS_CREATED_AT_NEW = '2026-08-05T11:00:00.000Z';
const EXPECTED_DIAGNOSIS_QUERY_ORDER: readonly Readonly<{
  id: string;
  createdAt: string;
}>[] = [
  {id: 'diagnosis-z-new', createdAt: DIAGNOSIS_CREATED_AT_NEW},
  {id: 'diagnosis-b-tie', createdAt: DIAGNOSIS_CREATED_AT_TIE},
  {id: 'diagnosis-m-tie', createdAt: DIAGNOSIS_CREATED_AT_TIE},
  {id: 'diagnosis-y-tie', createdAt: DIAGNOSIS_CREATED_AT_TIE},
  {id: 'diagnosis-a-old', createdAt: DIAGNOSIS_CREATED_AT_OLD},
];

function eligibleTask(id = 'diagnosis-task') {
  return makeTask(id, {
    startAt: '2026-08-05T10:00:00.000Z',
    scheduledStartAt: '2026-08-05T10:00:00.000Z',
    dueAt: '2026-08-05T12:00:00.000Z',
  });
}

function submitInput(
  overrides: Partial<DelayDiagnosisSubmitInput> = {},
): DelayDiagnosisSubmitInput {
  return {
    taskId: 'diagnosis-task',
    focusSessionId: null,
    signals: STUCK_SIGNALS,
    trigger: 'user_stuck',
    reasonKey: 'task_too_large',
    privateText: null,
    suggestions: [],
    ...overrides,
  };
}

type DiagnosisHarness = Readonly<{
  service: DelayDiagnosisService;
  backend: PhysicalDiagnosisBackend;
  context: StaticDiagnosisContext;
  clock: SequenceValues;
  ids: SequenceValues;
}>;

function expectPrivateFailureIsOpaque(
  error: unknown,
  secret: string,
  harness: DiagnosisHarness,
): void {
  const channels = errorPrivacyChannels(error);
  for (const channel of channels) {
    expect(channel).not.toContain(secret);
  }
  const serializedResult = JSON.stringify({
    errorChannels: channels,
    repositoryRaw: harness.backend.raw,
    portLogs: {
      context: harness.context.calls,
      repository: harness.backend.events,
      repositoryReads: harness.backend.readCount,
      transactionAttempts: harness.backend.transactionAttemptCount,
      commits: harness.backend.commitCount,
      clockCalls: harness.clock.calls,
      idCalls: harness.ids.calls,
    },
  });
  expect(serializedResult).not.toContain(secret);
}

function createDiagnosisHarness(options: {
  module?: DelayDiagnosisModule;
  backend?: PhysicalDiagnosisBackend;
  context?: StaticDiagnosisContext;
  policy?: DelayDiagnosisPolicy;
  clock?: SequenceValues;
  ids?: SequenceValues;
} = {}): DiagnosisHarness {
  const module = options.module ?? loadDiagnosisModule();
  const backend = options.backend ?? new PhysicalDiagnosisBackend();
  const context = options.context ?? new StaticDiagnosisContext();
  const clock =
    options.clock ??
    new SequenceValues([
      '2026-08-05T10:00:00.000Z',
      '2026-08-05T10:01:00.000Z',
      '2026-08-05T10:02:00.000Z',
      '2026-08-05T10:03:00.000Z',
      '2026-08-05T10:04:00.000Z',
      '2026-08-05T10:05:00.000Z',
      '2026-08-05T10:06:00.000Z',
      '2026-08-05T10:07:00.000Z',
      '2026-08-05T10:08:00.000Z',
    ]);
  const ids =
    options.ids ??
    new SequenceValues([
      'diagnosis-01',
      'diagnosis-02',
      'diagnosis-03',
      'diagnosis-04',
      'diagnosis-05',
      'diagnosis-06',
      'diagnosis-07',
      'diagnosis-08',
      'diagnosis-09',
    ]);
  const service = module.createDelayDiagnosisService({
    context,
    repository: new ByteDiagnosisRepository(backend),
    now: clock.next,
    idGenerator: ids.next,
    policy: options.policy ?? POLICY,
  });
  return {service, backend, context, clock, ids};
}

describe('GAP-P0-03A delay diagnosis eligibility, persistence, and privacy', () => {
  it('derives every PRD trigger at explicit threshold boundaries in stable order', () => {
    const module = loadDiagnosisModule();
    const task = eligibleTask();
    const session = focusSession('focus-eligible', task.id);
    const eligibility = module.deriveDelayDiagnosisEligibility({
      task,
      focusSession: session,
      now: '2026-08-05T10:00:00.000Z',
      signals: {
        consecutiveDelayCount: 2,
        dismissedReminderCount: 3,
        progressRatio: 0.49,
        userStuck: true,
      },
      policy: POLICY,
    });
    expect(eligibility).toEqual({
      eligible: true,
      triggers: [
        'scheduled_start_missed',
        'repeated_delay',
        'reminder_dismissed',
        'due_progress_risk',
        'user_stuck',
        'focus_interrupted',
      ],
    });
  });

  it('remains ineligible immediately below every configured threshold', () => {
    const task = eligibleTask();
    const eligibility = loadDiagnosisModule().deriveDelayDiagnosisEligibility({
      task: {
        ...task,
        startAt: '2026-08-05T10:00:00.001Z',
        scheduledStartAt: '2026-08-05T10:00:00.001Z',
        dueAt: '2026-08-05T12:00:00.001Z',
      },
      focusSession: null,
      now: '2026-08-05T10:00:00.000Z',
      signals: {
        consecutiveDelayCount: 1,
        dismissedReminderCount: 2,
        progressRatio: 0.5,
        userStuck: false,
      },
      policy: POLICY,
    });
    expect(eligibility).toEqual({eligible: false, triggers: []});
  });

  it.each<
    [
      label: string,
      progressRatio: number,
      expected: Readonly<{
        eligible: boolean;
        triggers: readonly DelayDiagnosisTrigger[];
      }>,
    ]
  >([
    [
      'strictly below 0.5',
      0.499999999999,
      {eligible: true, triggers: ['due_progress_risk']},
    ],
    ['exactly 0.5', 0.5, {eligible: false, triggers: []}],
    ['strictly above 0.5', 0.500000000001, {eligible: false, triggers: []}],
  ])(
    'applies the explicit progress threshold %s with every time/risk input fixed',
    (_label, progressRatio, expected) => {
      const task = makeTask('strict-progress-boundary-task', {
        startAt: '2026-08-05T11:00:00.000Z',
        scheduledStartAt: '2026-08-05T11:00:00.000Z',
        dueAt: '2026-08-05T12:00:00.000Z',
      });
      const actual = loadDiagnosisModule().deriveDelayDiagnosisEligibility({
        task,
        focusSession: null,
        now: '2026-08-05T10:00:00.000Z',
        signals: {
          consecutiveDelayCount: 0,
          dismissedReminderCount: 0,
          progressRatio,
          userStuck: false,
        },
        policy: {
          ...POLICY,
          dueRiskWindowMinutes: 120,
          dueRiskProgressBelow: 0.5,
        },
      });
      expect(actual).toEqual(expected);
    },
  );

  it.each([
    ['completed', makeCompletedTask('diagnosis-task')],
    ['cancelled', makeCancelledTask('diagnosis-task')],
    ['deleted', makeDeletedTask('diagnosis-task')],
  ])('never diagnoses a %s task even when every signal is high', (_label, task) => {
    expect(
      loadDiagnosisModule().deriveDelayDiagnosisEligibility({
        task,
        focusSession: focusSession('terminal-focus', task.id),
        now: '2026-08-05T10:00:00.000Z',
        signals: {
          consecutiveDelayCount: 99,
          dismissedReminderCount: 99,
          progressRatio: 0,
          userStuck: true,
        },
        policy: POLICY,
      }),
    ).toEqual({eligible: false, triggers: []});
  });

  it.each([
    [
      'completed',
      makeCompletedTask('diagnosis-task'),
      'PRIVATE_TERMINAL_COMPLETED_03A',
    ],
    [
      'cancelled',
      makeCancelledTask('diagnosis-task'),
      'PRIVATE_TERMINAL_CANCELLED_03A',
    ],
    [
      'deleted',
      makeDeletedTask('diagnosis-task'),
      'PRIVATE_TERMINAL_DELETED_03A',
    ],
  ])(
    'rejects submit for a %s task after one read-only operation lookup and before transactional, clock, or ID effects',
    async (_label, task, secret) => {
      const harness = createDiagnosisHarness();
      harness.context.tasks.set('diagnosis-task', task);
      const error = await expectCode(
        () =>
          harness.service.submit(
            submitInput({privateText: secret}),
            {operationId: `terminal-submit-${_label}`},
          ),
        'DELAY_DIAGNOSIS_TASK_TERMINAL',
      );
      expect(harness.context.calls).toEqual([
        {taskId: 'diagnosis-task', focusSessionId: null},
      ]);
      expect(harness.backend.raw).toBeNull();
      expect(harness.backend.readCount).toBe(1);
      expect(harness.backend.readOnlyOperationLookupCount).toBe(1);
      expect(harness.backend.transactionAttemptCount).toBe(0);
      expect(harness.backend.commitCount).toBe(0);
      expect(harness.backend.events).toEqual(['get-operation-readonly']);
      expect(harness.clock.calls).toBe(0);
      expect(harness.ids.calls).toBe(0);
      expectPrivateFailureIsOpaque(error, secret, harness);
    },
  );

  it('does not treat a completed or cross-task focus session as an interruption trigger', () => {
    const module = loadDiagnosisModule();
    const task = eligibleTask();
    const completed = focusSession('completed-focus', task.id, {
      status: 'completed',
      interruptionReason: null,
    });
    const otherTask = focusSession('other-focus', 'different-task');
    for (const session of [completed, otherTask]) {
      expect(
        module.deriveDelayDiagnosisEligibility({
          task,
          focusSession: session,
          now: '2026-08-05T09:00:00.000Z',
          signals: QUIET_SIGNALS,
          policy: POLICY,
        }),
      ).toEqual({eligible: false, triggers: []});
    }
  });

  it.each(PRD_REASON_KEYS)(
    'persists the policy-supplied stable reason key %s',
    async reasonKey => {
      const harness = createDiagnosisHarness();
      harness.context.tasks.set('diagnosis-task', eligibleTask());
      const result = await harness.service.submit(
        submitInput({reasonKey}),
        {operationId: `reason-${reasonKey}`},
      );
      expect(result).toMatchObject({
        taskId: 'diagnosis-task',
        trigger: 'user_stuck',
        reasonKey,
      });
      expect(harness.backend.commitCount).toBe(1);
    },
  );

  it('does not classify an already-started task as missed solely because its plan time passed', () => {
    const task = eligibleTask();
    expect(
      loadDiagnosisModule().deriveDelayDiagnosisEligibility({
        task: {
          ...task,
          status: 'in_progress',
          startedAt: '2026-08-05T09:55:00.000Z',
        },
        focusSession: null,
        now: '2026-08-05T10:05:00.000Z',
        signals: QUIET_SIGNALS,
        policy: POLICY,
      }),
    ).toEqual({eligible: false, triggers: []});
  });

  it('rejects an unconfigured reason before context, clock, ID, or repository use', async () => {
    const harness = createDiagnosisHarness();
    harness.context.tasks.set('diagnosis-task', eligibleTask());
    const secret = 'PRIVATE_INVALID_REASON_03A';
    const error = await expectCode(
      () =>
        harness.service.submit(
          submitInput({
            reasonKey: 'invented_reason',
            privateText: secret,
          }),
          {operationId: 'invalid-reason'},
        ),
      'DELAY_DIAGNOSIS_REASON_INVALID',
    );
    expect(harness.context.loadCount).toBe(0);
    expect(harness.clock.calls).toBe(0);
    expect(harness.ids.calls).toBe(0);
    expect(harness.backend.raw).toBeNull();
    expect(harness.backend.readCount).toBe(0);
    expect(harness.backend.readOnlyOperationLookupCount).toBe(0);
    expect(harness.backend.transactionAttemptCount).toBe(0);
    expect(harness.backend.commitCount).toBe(0);
    expect(harness.backend.events).toEqual([]);
    expectPrivateFailureIsOpaque(error, secret, harness);
  });

  it('rejects a requested trigger that is not present in the current eligibility result', async () => {
    const harness = createDiagnosisHarness();
    harness.context.tasks.set('diagnosis-task', eligibleTask());
    const secret = 'PRIVATE_INVALID_TRIGGER_03A';
    const error = await expectCode(
      () =>
        harness.service.submit(
          submitInput({
            trigger: 'focus_interrupted',
            privateText: secret,
          }),
          {operationId: 'trigger-not-eligible'},
        ),
      'DELAY_DIAGNOSIS_TRIGGER_NOT_ELIGIBLE',
    );
    expect(harness.context.calls).toEqual([
      {taskId: 'diagnosis-task', focusSessionId: null},
    ]);
    expect(harness.backend.raw).toBeNull();
    expect(harness.backend.readCount).toBe(1);
    expect(harness.backend.readOnlyOperationLookupCount).toBe(1);
    expect(harness.backend.transactionAttemptCount).toBe(0);
    expect(harness.backend.commitCount).toBe(0);
    expect(harness.backend.events).toEqual(['get-operation-readonly']);
    expect(harness.clock.calls).toBe(0);
    expect(harness.ids.calls).toBe(0);
    expectPrivateFailureIsOpaque(error, secret, harness);
  });

  it('trims Unicode private text by code point and does not leak an over-limit secret through errors', async () => {
    const unicodePolicy: DelayDiagnosisPolicy = {
      ...POLICY,
      maxPrivateTextCodePoints: 3,
    };
    const accepted = createDiagnosisHarness({policy: unicodePolicy});
    accepted.context.tasks.set('diagnosis-task', eligibleTask());
    const result = await accepted.service.submit(
      submitInput({privateText: '  你🙂a  '}),
      {operationId: 'unicode-private-text'},
    );
    expect(result.privateText).toBe('你🙂a');

    const rejected = createDiagnosisHarness({policy: unicodePolicy});
    rejected.context.tasks.set('diagnosis-task', eligibleTask());
    const secret = 'SECRET_PRIVATE_TEXT_03A';
    const error = await expectCode(
      () =>
        rejected.service.submit(
          submitInput({privateText: secret}),
          {operationId: 'private-text-too-long'},
        ),
      'DELAY_DIAGNOSIS_PRIVATE_TEXT_TOO_LONG',
    );
    expectPrivateFailureIsOpaque(error, secret, rejected);
    expect(rejected.context.loadCount).toBe(0);
    expect(rejected.backend.raw).toBeNull();
    expect(rejected.backend.transactionAttemptCount).toBe(0);
    expect(rejected.backend.commitCount).toBe(0);
  });

  it('normalizes whitespace-only private text to durable null across restart, query, and replay without diagnostic leakage', async () => {
    const whitespaceOnly = ' \t\n\u00a0\u2003\u3000 ';
    const first = createDiagnosisHarness();
    first.context.tasks.set('diagnosis-task', eligibleTask());
    const input = submitInput({privateText: whitespaceOnly});
    const submitted = await first.service.submit(input, {
      operationId: 'whitespace-private-text',
    });
    expect(submitted.privateText).toBeNull();
    expect(first.context.calls).toEqual([
      {taskId: 'diagnosis-task', focusSessionId: null},
    ]);
    expect(first.backend.events).toEqual([
      'get-operation-readonly',
      'transaction-begin',
      'get-operation',
      'save-diagnosis',
      'save-operation',
      'commit-succeeded',
    ]);
    const raw = first.backend.raw;
    if (raw === null) {
      throw new Error('EXPECTED_WHITESPACE_NORMALIZED_DIAGNOSIS_BYTES');
    }
    expect(raw).toContain('"privateText":null');
    expect(raw).not.toContain('"privateText":""');
    expect(raw).not.toContain('\\t');
    expect(raw).not.toContain('\\n');
    for (const whitespace of ['\u00a0', '\u2003', '\u3000']) {
      expect(raw).not.toContain(whitespace);
    }

    const restartedBackend = new PhysicalDiagnosisBackend();
    restartedBackend.raw = `${raw}`;
    const restartedContext = new StaticDiagnosisContext();
    restartedContext.tasks.set('diagnosis-task', eligibleTask());
    const restarted = createDiagnosisHarness({
      backend: restartedBackend,
      context: restartedContext,
    });
    const queried = await restarted.service.listForTask('diagnosis-task');
    expect(queried).toHaveLength(1);
    expect(queried[0]?.privateText).toBeNull();
    const replay = await restarted.service.submit(input, {
      operationId: 'whitespace-private-text',
    });
    expect(replay.privateText).toBeNull();
    expect(restartedContext.calls).toEqual([]);
    expect(restarted.clock.calls).toBe(0);
    expect(restarted.ids.calls).toBe(0);
    expect(restartedBackend.commitCount).toBe(0);
    expect(restartedBackend.raw).toBe(raw);
    expect(restartedBackend.events).toEqual([
      'list',
      'get-operation-readonly',
    ]);
    const portAndErrorSurface = JSON.stringify({
      errors: [],
      firstContext: first.context.calls,
      firstRepository: first.backend.events,
      restartedContext: restartedContext.calls,
      restartedRepository: restartedBackend.events,
    });
    for (const forbidden of [
      whitespaceOnly,
      '\t',
      '\n',
      '\u00a0',
      '\u2003',
      '\u3000',
    ]) {
      expect(portAndErrorSurface).not.toContain(forbidden);
    }
  });

  it.each([
    [
      'missing task',
      'DELAY_DIAGNOSIS_TASK_NOT_FOUND',
      null,
      null,
      'PRIVATE_ASSOCIATION_MISSING_TASK_03A',
    ],
    [
      'missing session',
      'DELAY_DIAGNOSIS_SESSION_NOT_FOUND',
      eligibleTask(),
      null,
      'PRIVATE_ASSOCIATION_MISSING_SESSION_03A',
    ],
    [
      'cross-task session',
      'DELAY_DIAGNOSIS_SESSION_TASK_MISMATCH',
      eligibleTask(),
      focusSession('focus-link', 'different-task'),
      'PRIVATE_ASSOCIATION_CROSS_TASK_03A',
    ],
  ])(
    'rejects %s association with no diagnosis write',
    async (_label, code, task, session, secret) => {
      const harness = createDiagnosisHarness();
      if (task !== null) {
        harness.context.tasks.set('diagnosis-task', task);
      }
      if (session !== null) {
        harness.context.sessions.set('focus-link', session);
      }
      const error = await expectCode(
        () =>
          harness.service.submit(
            submitInput({focusSessionId: 'focus-link', privateText: secret}),
            {operationId: `association-${_label}`},
          ),
        code,
      );
      expect(harness.context.calls).toEqual([
        {taskId: 'diagnosis-task', focusSessionId: 'focus-link'},
      ]);
      expect(harness.backend.raw).toBeNull();
      expect(harness.backend.readCount).toBe(1);
      expect(harness.backend.readOnlyOperationLookupCount).toBe(1);
      expect(harness.backend.transactionAttemptCount).toBe(0);
      expect(harness.backend.commitCount).toBe(0);
      expect(harness.backend.events).toEqual(['get-operation-readonly']);
      expect(harness.clock.calls).toBe(0);
      expect(harness.ids.calls).toBe(0);
      expectPrivateFailureIsOpaque(error, secret, harness);
    },
  );

  it('persists detached suggestions without automatically changing Task or FocusSession bytes', async () => {
    const task = eligibleTask();
    const session = focusSession('focus-suggestion', task.id);
    const taskHarness = createA2Harness({tasks: [task]});
    const taskBytesBefore = taskHarness.storage.raw(A2_STORAGE_KEY);

    const focusProduction = loadPersistentProduction();
    const focusBackend = new MemoryFocusBackend();
    const focusRepository = focusProduction.createRepository(
      focusProduction.createStorage(focusBackend),
    );
    await focusRepository.save(session);
    const focusBytesBefore = focusBackend.raw(focusProduction.storageKey);

    const harness = createDiagnosisHarness();
    harness.context.tasks.set(task.id, task);
    harness.context.sessions.set(session.id, session);
    const result = await harness.service.submit(
      submitInput({
        focusSessionId: session.id,
        trigger: 'focus_interrupted',
        suggestions: [
          {kind: 'first_step', value: 'Open the document'},
          {kind: 'estimated_minutes', value: 25},
          {
            kind: 'reschedule',
            scheduledStartAt: '2026-08-05T11:00:00.000Z',
          },
        ],
      }),
      {operationId: 'suggestions-no-auto-mutation'},
    );
    const firstSuggestion = result.suggestions[0];
    if (firstSuggestion === undefined) {
      throw new Error('EXPECTED_DIAGNOSIS_SUGGESTION');
    }
    Object.defineProperty(firstSuggestion, 'value', {
      value: 'CALLER_MUTATION',
      configurable: true,
    });
    expect((await harness.service.listForTask(task.id))[0]?.suggestions[0])
      .toEqual({kind: 'first_step', value: 'Open the document'});
    expect(taskHarness.storage.raw(A2_STORAGE_KEY)).toBe(taskBytesBefore);
    expect(focusBackend.raw(focusProduction.storageKey)).toBe(focusBytesBefore);
  });

  it('replays one durable operation without clock/ID/write and rejects a conflicting reuse', async () => {
    const harness = createDiagnosisHarness();
    harness.context.tasks.set('diagnosis-task', eligibleTask());
    const input = submitInput({privateText: 'PRIVATE_REPLAY_ACCEPTED_03A'});
    const first = await harness.service.submit(input, {
      operationId: 'diagnosis-replay',
    });
    const calls = {
      clock: harness.clock.calls,
      ids: harness.ids.calls,
      commits: harness.backend.commitCount,
      raw: harness.backend.raw,
      context: harness.context.loadCount,
      reads: harness.backend.readCount,
      attempts: harness.backend.transactionAttemptCount,
      events: harness.backend.events.length,
    };
    const replay = await harness.service.submit(input, {
      operationId: 'diagnosis-replay',
    });
    expect(replay).toEqual(first);
    expect(harness.clock.calls).toBe(calls.clock);
    expect(harness.ids.calls).toBe(calls.ids);
    expect(harness.backend.commitCount).toBe(calls.commits);
    const conflictSecret = 'PRIVATE_OPERATION_CONFLICT_03A';
    const conflict = await expectCode(
      () =>
        harness.service.submit(
          submitInput({
            reasonKey: 'boring',
            privateText: conflictSecret,
          }),
          {operationId: 'diagnosis-replay'},
        ),
      'DELAY_DIAGNOSIS_OPERATION_CONFLICT',
    );
    expect(conflict).toBeDefined();
    expect(harness.backend.raw).toBe(calls.raw);
    expect(harness.backend.commitCount).toBe(calls.commits);
    expect(harness.context.loadCount).toBe(calls.context);
    expect(harness.clock.calls).toBe(calls.clock);
    expect(harness.ids.calls).toBe(calls.ids);
    expect(harness.backend.readCount).toBe(calls.reads + 2);
    expect(harness.backend.transactionAttemptCount).toBe(calls.attempts);
    expect(harness.backend.events.slice(calls.events)).toEqual([
      'get-operation-readonly',
      'get-operation-readonly',
    ]);
    expectPrivateFailureIsOpaque(conflict, conflictSecret, harness);
  });

  it('rolls back an exact repository failure and permits the same operation retry', async () => {
    const harness = createDiagnosisHarness();
    harness.context.tasks.set('diagnosis-task', eligibleTask());
    const fault = new Error('DIAGNOSIS_COMMIT_FAULT_EXACT');
    const secret = 'PRIVATE_STORAGE_FAILURE_03A';
    const input = submitInput({privateText: secret});
    harness.backend.failNextCommit = fault;
    const error = await captureError(() =>
      harness.service.submit(input, {
        operationId: 'diagnosis-fault-retry',
      }),
    );
    expect(error).toBe(fault);
    expect(harness.backend.raw).toBeNull();
    expect(harness.backend.transactionAttemptCount).toBe(1);
    expect(harness.backend.commitCount).toBe(0);
    expect(harness.backend.events).toEqual([
      'get-operation-readonly',
      'transaction-begin',
      'get-operation',
      'save-diagnosis',
      'save-operation',
      'commit-failed',
    ]);
    expectPrivateFailureIsOpaque(error, secret, harness);
    const retry = await harness.service.submit(input, {
      operationId: 'diagnosis-fault-retry',
    });
    expect(retry.id).toBe('diagnosis-02');
    expect(harness.clock.calls).toBe(2);
    expect(harness.ids.calls).toBe(2);
    expect(harness.backend.commitCount).toBe(1);
  });

  it('rehydrates from bytes, sorts three distinct timestamps descending and ties by ID, and returns deeply detached queries', async () => {
    const clock = new SequenceValues([
      DIAGNOSIS_CREATED_AT_OLD,
      DIAGNOSIS_CREATED_AT_TIE,
      DIAGNOSIS_CREATED_AT_NEW,
      DIAGNOSIS_CREATED_AT_TIE,
      DIAGNOSIS_CREATED_AT_TIE,
    ]);
    const ids = new SequenceValues([
      'diagnosis-a-old',
      'diagnosis-m-tie',
      'diagnosis-z-new',
      'diagnosis-b-tie',
      'diagnosis-y-tie',
    ]);
    const first = createDiagnosisHarness({clock, ids});
    first.context.tasks.set('diagnosis-task', eligibleTask());
    await first.service.submit(
      submitInput({reasonKey: 'boring'}),
      {operationId: 'ordered-old'},
    );
    await first.service.submit(
      submitInput({reasonKey: 'too_tired'}),
      {operationId: 'ordered-tie-m'},
    );
    await first.service.submit(
      submitInput({reasonKey: 'afraid_of_poor_quality'}),
      {operationId: 'ordered-new'},
    );
    await first.service.submit(
      submitInput({reasonKey: 'distracted'}),
      {operationId: 'ordered-tie-b'},
    );
    await first.service.submit(
      submitInput({reasonKey: 'other'}),
      {operationId: 'ordered-tie-y'},
    );
    const raw = first.backend.raw;
    if (raw === null) {
      throw new Error('EXPECTED_DIAGNOSIS_BYTES');
    }
    const restartedBackend = new PhysicalDiagnosisBackend();
    restartedBackend.raw = `${raw}`;
    const restarted = createDiagnosisHarness({
      backend: restartedBackend,
      context: first.context,
    });
    const replay = await restarted.service.submit(
      submitInput({reasonKey: 'afraid_of_poor_quality'}),
      {operationId: 'ordered-new'},
    );
    expect(replay.id).toBe('diagnosis-z-new');
    expect(restarted.clock.calls).toBe(0);
    expect(restarted.ids.calls).toBe(0);
    expect(restartedBackend.commitCount).toBe(0);
    const list = await restarted.service.listForTask('diagnosis-task');
    expect(
      list.map(item => ({id: item.id, createdAt: item.createdAt})),
    ).toEqual(EXPECTED_DIAGNOSIS_QUERY_ORDER);
    const firstRecord = list[0];
    if (firstRecord === undefined) {
      throw new Error('EXPECTED_DIAGNOSIS_RECORD');
    }
    Object.defineProperty(firstRecord, 'reasonKey', {
      value: 'CALLER_MUTATION',
      configurable: true,
    });
    expect((await restarted.service.listForTask('diagnosis-task'))[0]?.reasonKey)
      .toBe('afraid_of_poor_quality');
    expect(restartedBackend.raw).toBe(raw);
  });

  it('summarizes only stable counts and never exposes private text or suggestion values', async () => {
    const harness = createDiagnosisHarness();
    harness.context.tasks.set('diagnosis-task', eligibleTask());
    await harness.service.submit(
      submitInput({
        reasonKey: 'task_too_large',
        privateText: 'SUMMARY_SECRET_ALPHA',
        suggestions: [{kind: 'first_step', value: 'SUGGESTION_SECRET_ALPHA'}],
      }),
      {operationId: 'summary-alpha'},
    );
    await harness.service.submit(
      submitInput({
        reasonKey: 'boring',
        privateText: 'SUMMARY_SECRET_BETA',
      }),
      {operationId: 'summary-beta'},
    );
    const summary = await harness.service.summarize('diagnosis-task');
    expect(summary).toEqual({
      total: 2,
      byReason: [
        {key: 'boring', count: 1},
        {key: 'task_too_large', count: 1},
      ],
      byTrigger: [{key: 'user_stuck', count: 2}],
    });
    const serialized = JSON.stringify(summary);
    for (const secret of [
      'SUMMARY_SECRET_ALPHA',
      'SUMMARY_SECRET_BETA',
      'SUGGESTION_SECRET_ALPHA',
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('linearizes concurrent same-operation submissions across two facades using a barrier', async () => {
    const module = loadDiagnosisModule();
    const backend = new PhysicalDiagnosisBackend();
    const barrier = new ManualBarrier();
    backend.commitBarrier = barrier;
    const context = new StaticDiagnosisContext();
    context.tasks.set('diagnosis-task', eligibleTask());
    const firstClock = new SequenceValues(['2026-08-05T10:00:00.000Z']);
    const firstIds = new SequenceValues(['concurrent-diagnosis']);
    const secondClock = new SequenceValues(['SHOULD_NOT_BE_CONSUMED']);
    const secondIds = new SequenceValues(['SHOULD_NOT_BE_CONSUMED']);
    const first = createDiagnosisHarness({
      module,
      backend,
      context,
      clock: firstClock,
      ids: firstIds,
    });
    const second = createDiagnosisHarness({
      module,
      backend,
      context,
      clock: secondClock,
      ids: secondIds,
    });
    const input = submitInput({privateText: 'same command'});
    const firstPending = first.service.submit(input, {
      operationId: 'concurrent-operation',
    });
    await barrier.entered;
    const secondPending = second.service.submit(input, {
      operationId: 'concurrent-operation',
    });
    barrier.release();
    const [left, right] = await Promise.all([firstPending, secondPending]);
    expect(right).toEqual(left);
    expect(backend.commitCount).toBe(1);
    expect(secondClock.calls).toBe(0);
    expect(secondIds.calls).toBe(0);
    expect(await first.service.listForTask('diagnosis-task')).toHaveLength(1);
  });
});
