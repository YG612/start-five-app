import {
  compileContract,
  diagnosticCodes,
  diagnosticReport,
} from '../gap-p0-02a/inMemoryTypecheck';
import {
  ByteDiagnosisRepository,
  ByteReminderRepository,
  DeepFrozenDiagnosisContext,
  DeepFrozenDiagnosisRepository,
  DeepFrozenReminderRepository,
  DeepFrozenReminderScheduler,
  PhysicalDiagnosisBackend,
  PhysicalReminderBackend,
  PhysicalSchedulerBackend,
  StaticDiagnosisContext,
  AtomicReminderScheduler,
  deepFreeze,
  loadDiagnosisModule,
  loadReminderModule,
  type DelayDiagnosisPolicy,
} from './testKit';
import {
  reviewEligibleTask,
  reviewReconcileInput,
  reviewSubmitInput,
} from './review3TestKit';

declare const __dirname: string;

type FsApi = {readFileSync(path: string, encoding: 'utf8'): string};
type PathApi = {resolve(...paths: string[]): string};

const fs = jest.requireActual<FsApi>('fs');
const path = jest.requireActual<PathApi>('path');

const POLICY: DelayDiagnosisPolicy = {
  minimumConsecutiveDelays: 2,
  minimumReminderDismissals: 2,
  dueRiskWindowMinutes: 120,
  dueRiskProgressBelow: 0.5,
  allowedReasonKeys: ['task_too_large', 'unclear_how_to_start'],
  maxPrivateTextCodePoints: 40,
};

async function drainMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

describe('GAP-P0-03A public platform-independent surface', () => {
  it('compiles the exact reminder planner, repository, scheduler, and two-method service contract', () => {
    const compilation = compileContract(
      'p0-03a-reminder-surface',
      `
        import type {Task} from '../../../src/domain/task';
        import {
          createReminderSchedulingService,
          deriveReminderPlan,
          type ReminderAnchor,
          type ReminderIntent,
          type ReminderKind,
          type ReminderOperationBinding,
          type ReminderPermission,
          type ReminderPlanningInput,
          type ReminderReconcileInput,
          type ReminderReplaceRequest,
          type ReminderRepository,
          type ReminderRule,
          type ReminderScheduleSnapshot,
          type ReminderScheduler,
          type ReminderSchedulingService,
          type ReminderStateRecord,
          type ReminderTransaction,
        } from '../../../src/application/reminderScheduling';

        type Assert<T extends true> = T;
        type Equal<A, B> =
          (<T>() => T extends A ? 1 : 2) extends
          (<T>() => T extends B ? 1 : 2) ? true : false;
        type ExpectedKind =
          | 'planning' | 'start' | 'progress' | 'rescue' | 'overdue_decision';
        type ExpectedAnchor = 'scheduled_start' | 'due';
        type ExpectedPermission = 'denied' | 'not_determined' | 'granted';
        type ExpectedRule = Readonly<{
          id: string;
          kind: ExpectedKind;
          anchor: ExpectedAnchor;
          offsetMinutes: number;
          progressBelow: number | null;
        }>;
        type ExpectedIntent = Readonly<{
          taskId: string;
          ruleId: string;
          kind: ExpectedKind;
          triggerAt: string;
        }>;
        type ExpectedPlanningInput = Readonly<{
          task: Task;
          now: string;
          timeZone: string;
          progressRatio: number | null;
          rules: readonly ExpectedRule[];
        }>;
        type ExpectedReconcileInput = Readonly<{
          task: Task;
          now: string;
          timeZone: string;
          progressRatio: number | null;
          rules: readonly ExpectedRule[];
          permission: ExpectedPermission;
          operationId: string;
        }>;
        type ExpectedSnapshot = Readonly<{
          taskId: string;
          generation: number;
          permission: ExpectedPermission;
          intents: readonly ExpectedIntent[];
          scheduled: boolean;
        }>;
        type ExpectedBinding = Readonly<{
          operationId: string;
          fingerprint: string;
        }>;
        type ExpectedRecord = Readonly<{
          snapshot: ExpectedSnapshot;
          binding: ExpectedBinding;
        }>;
        type ExpectedTransaction = {
          get(taskId: string): Promise<ExpectedRecord | null>;
          save(record: ExpectedRecord): Promise<void>;
          remove(taskId: string): Promise<void>;
        };
        type ExpectedRepository = {
          get(taskId: string): Promise<ExpectedRecord | null>;
          transaction<T>(
            work: (transaction: ExpectedTransaction) => Promise<T>,
          ): Promise<T>;
        };
        type ExpectedReplaceRequest = Readonly<{
          previous: ExpectedSnapshot | null;
          next: ExpectedSnapshot;
        }>;
        type ExpectedScheduler = {
          get(taskId: string): Promise<ExpectedSnapshot | null>;
          replace(request: ExpectedReplaceRequest): Promise<void>;
        };
        type ExpectedService = {
          reconcile(input: ExpectedReconcileInput): Promise<ExpectedSnapshot>;
          getState(taskId: string): Promise<ExpectedSnapshot | null>;
        };
        type ExpectedFactory = (options: Readonly<{
          repository: ExpectedRepository;
          scheduler: ExpectedScheduler;
        }>) => ExpectedService;
        type ExpectedPlanner = (
          input: ExpectedPlanningInput,
        ) => readonly ExpectedIntent[];

        type Proofs = [
          Assert<Equal<ReminderKind, ExpectedKind>>,
          Assert<Equal<ReminderAnchor, ExpectedAnchor>>,
          Assert<Equal<ReminderPermission, ExpectedPermission>>,
          Assert<Equal<ReminderRule, ExpectedRule>>,
          Assert<Equal<ReminderIntent, ExpectedIntent>>,
          Assert<Equal<ReminderPlanningInput, ExpectedPlanningInput>>,
          Assert<Equal<ReminderReconcileInput, ExpectedReconcileInput>>,
          Assert<Equal<ReminderScheduleSnapshot, ExpectedSnapshot>>,
          Assert<Equal<ReminderOperationBinding, ExpectedBinding>>,
          Assert<Equal<ReminderStateRecord, ExpectedRecord>>,
          Assert<Equal<ReminderTransaction, ExpectedTransaction>>,
          Assert<Equal<ReminderRepository, ExpectedRepository>>,
          Assert<Equal<ReminderReplaceRequest, ExpectedReplaceRequest>>,
          Assert<Equal<ReminderScheduler, ExpectedScheduler>>,
          Assert<Equal<ReminderSchedulingService, ExpectedService>>,
          Assert<Equal<typeof createReminderSchedulingService, ExpectedFactory>>,
          Assert<Equal<typeof deriveReminderPlan, ExpectedPlanner>>
        ];
        const proofs: Proofs = [
          true, true, true, true, true, true, true, true, true,
          true, true, true, true, true, true, true, true,
        ];
        void proofs;
      `,
    );

    expect(diagnosticReport(compilation)).toBe('');
    expect(compilation.diagnostics).toEqual([]);
  });

  it('compiles the exact diagnosis eligibility, persistence, privacy-summary, and three-method service contract', () => {
    const compilation = compileContract(
      'p0-03a-diagnosis-surface',
      `
        import type {FocusSession} from '../../../src/domain/focusSession';
        import type {Task} from '../../../src/domain/task';
        import {
          createDelayDiagnosisService,
          deriveDelayDiagnosisEligibility,
          type DelayDiagnosis,
          type DelayDiagnosisContext,
          type DelayDiagnosisContextPort,
          type DelayDiagnosisEligibility,
          type DelayDiagnosisEligibilityInput,
          type DelayDiagnosisOperation,
          type DelayDiagnosisOperationRecord,
          type DelayDiagnosisPolicy,
          type DelayDiagnosisRepository,
          type DelayDiagnosisService,
          type DelayDiagnosisSignals,
          type DelayDiagnosisSubmitInput,
          type DelayDiagnosisSummary,
          type DelayDiagnosisSummaryCount,
          type DelayDiagnosisTransaction,
          type DelayDiagnosisTrigger,
          type DelaySuggestion,
        } from '../../../src/application/delayDiagnosis';

        type Assert<T extends true> = T;
        type Equal<A, B> =
          (<T>() => T extends A ? 1 : 2) extends
          (<T>() => T extends B ? 1 : 2) ? true : false;
        type Trigger =
          | 'scheduled_start_missed' | 'repeated_delay'
          | 'reminder_dismissed' | 'due_progress_risk'
          | 'user_stuck' | 'focus_interrupted';
        type Signals = Readonly<{
          consecutiveDelayCount: number;
          dismissedReminderCount: number;
          progressRatio: number;
          userStuck: boolean;
        }>;
        type Policy = Readonly<{
          minimumConsecutiveDelays: number;
          minimumReminderDismissals: number;
          dueRiskWindowMinutes: number;
          dueRiskProgressBelow: number;
          allowedReasonKeys: readonly string[];
          maxPrivateTextCodePoints: number;
        }>;
        type EligibilityInput = Readonly<{
          task: Task;
          focusSession: FocusSession | null;
          now: string;
          signals: Signals;
          policy: Policy;
        }>;
        type Eligibility = Readonly<{
          eligible: boolean;
          triggers: readonly Trigger[];
        }>;
        type Suggestion =
          | Readonly<{kind: 'first_step'; value: string}>
          | Readonly<{kind: 'estimated_minutes'; value: number}>
          | Readonly<{kind: 'reschedule'; scheduledStartAt: string}>;
        type Diagnosis = Readonly<{
          id: string;
          taskId: string;
          focusSessionId: string | null;
          trigger: Trigger;
          reasonKey: string;
          privateText: string | null;
          suggestions: readonly Suggestion[];
          createdAt: string;
        }>;
        type Context = Readonly<{
          task: Task | null;
          focusSession: FocusSession | null;
        }>;
        type ContextPort = {
          load(taskId: string, focusSessionId: string | null): Promise<Context>;
        };
        type OperationRecord = Readonly<{
          operationId: string;
          fingerprint: string;
          diagnosis: Diagnosis;
        }>;
        type Transaction = {
          getOperation(operationId: string): Promise<OperationRecord | null>;
          saveDiagnosis(diagnosis: Diagnosis): Promise<void>;
          saveOperation(record: OperationRecord): Promise<void>;
        };
        type Repository = {
          getOperation(operationId: string): Promise<OperationRecord | null>;
          list(taskId?: string): Promise<readonly Diagnosis[]>;
          transaction<T>(work: (transaction: Transaction) => Promise<T>): Promise<T>;
        };
        type SubmitInput = Readonly<{
          taskId: string;
          focusSessionId: string | null;
          signals: Signals;
          trigger: Trigger;
          reasonKey: string;
          privateText: string | null;
          suggestions: readonly Suggestion[];
        }>;
        type Operation = Readonly<{operationId: string}>;
        type SummaryCount = Readonly<{key: string; count: number}>;
        type Summary = Readonly<{
          total: number;
          byReason: readonly SummaryCount[];
          byTrigger: readonly SummaryCount[];
        }>;
        type Service = {
          submit(input: SubmitInput, operation: Operation): Promise<Diagnosis>;
          listForTask(taskId: string): Promise<readonly Diagnosis[]>;
          summarize(taskId?: string): Promise<Summary>;
        };
        type Factory = (options: Readonly<{
          context: ContextPort;
          repository: Repository;
          now(): string;
          idGenerator(): string;
          policy: Policy;
        }>) => Service;
        type Detector = (input: EligibilityInput) => Eligibility;

        type Proofs = [
          Assert<Equal<DelayDiagnosisTrigger, Trigger>>,
          Assert<Equal<DelayDiagnosisSignals, Signals>>,
          Assert<Equal<DelayDiagnosisPolicy, Policy>>,
          Assert<Equal<DelayDiagnosisEligibilityInput, EligibilityInput>>,
          Assert<Equal<DelayDiagnosisEligibility, Eligibility>>,
          Assert<Equal<DelaySuggestion, Suggestion>>,
          Assert<Equal<DelayDiagnosis, Diagnosis>>,
          Assert<Equal<DelayDiagnosisContext, Context>>,
          Assert<Equal<DelayDiagnosisContextPort, ContextPort>>,
          Assert<Equal<DelayDiagnosisOperationRecord, OperationRecord>>,
          Assert<Equal<DelayDiagnosisTransaction, Transaction>>,
          Assert<Equal<DelayDiagnosisRepository, Repository>>,
          Assert<Equal<DelayDiagnosisSubmitInput, SubmitInput>>,
          Assert<Equal<DelayDiagnosisOperation, Operation>>,
          Assert<Equal<DelayDiagnosisSummaryCount, SummaryCount>>,
          Assert<Equal<DelayDiagnosisSummary, Summary>>,
          Assert<Equal<DelayDiagnosisService, Service>>,
          Assert<Equal<typeof createDelayDiagnosisService, Factory>>,
          Assert<Equal<typeof deriveDelayDiagnosisEligibility, Detector>>
        ];
        const proofs: Proofs = [
          true, true, true, true, true, true, true, true, true, true,
          true, true, true, true, true, true, true, true, true,
        ];
        void proofs;
      `,
    );

    expect(diagnosticReport(compilation)).toBe('');
    expect(compilation.diagnostics).toEqual([]);
  });

  it('rejects unsupported mutation, missing platform ports, and a scheduler without state query', () => {
    const compilation = compileContract(
      'p0-03a-negative-surface',
      `
        import {
          createReminderSchedulingService,
          type ReminderPermission,
          type ReminderRule,
        } from '../../../src/application/reminderScheduling';
        import type {
          DelayDiagnosis,
          DelayDiagnosisTrigger,
        } from '../../../src/application/delayDiagnosis';

        const permission: ReminderPermission = 'prompt';
        const trigger: DelayDiagnosisTrigger = 'automatic_shame';
        declare const rule: ReminderRule;
        declare const diagnosis: DelayDiagnosis;
        rule.offsetMinutes = 10;
        diagnosis.privateText = 'leak';
        createReminderSchedulingService({
          repository: {
            get: async () => null,
            transaction: async work => work({
              get: async () => null,
              save: async () => undefined,
              remove: async () => undefined,
            }),
          },
        });
        createReminderSchedulingService({
          repository: {
            get: async () => null,
            transaction: async work => work({
              get: async () => null,
              save: async () => undefined,
              remove: async () => undefined,
            }),
          },
          scheduler: {
            replace: async () => undefined,
          },
        });
        void [permission, trigger];
      `,
    );

    expect(diagnosticCodes(compilation)).toEqual([
      2322,
      2322,
      2540,
      2540,
      2345,
      2741,
    ]);
    expect(compilation.emittedFileCount).toBe(0);
  });

  it('owns exact runtime factories, constructs silently, and exposes no native/timer/network coupling', async () => {
    const reminderModule = loadReminderModule();
    const diagnosisModule = loadDiagnosisModule();
    expect(Object.keys(reminderModule).sort()).toEqual([
      'createReminderSchedulingService',
      'deriveReminderPlan',
    ]);
    expect(Object.keys(diagnosisModule).sort()).toEqual([
      'createDelayDiagnosisService',
      'deriveDelayDiagnosisEligibility',
    ]);

    const reminderBackend = new PhysicalReminderBackend();
    const schedulerBackend = new PhysicalSchedulerBackend();
    const diagnosisBackend = new PhysicalDiagnosisBackend();
    const context = new StaticDiagnosisContext();
    let nowCallCount = 0;
    const now = (): string => {
      nowCallCount += 1;
      return '2026-08-05T10:00:00.000Z';
    };
    let idGeneratorCallCount = 0;
    const idGenerator = (): string => {
      idGeneratorCallCount += 1;
      return 'diagnosis-runtime';
    };

    const reminder = reminderModule.createReminderSchedulingService({
      repository: new ByteReminderRepository(reminderBackend),
      scheduler: new AtomicReminderScheduler(schedulerBackend),
    });
    const diagnosis = diagnosisModule.createDelayDiagnosisService({
      context,
      repository: new ByteDiagnosisRepository(diagnosisBackend),
      now,
      idGenerator,
      policy: POLICY,
    });

    expect(Object.keys(reminder).sort()).toEqual(['getState', 'reconcile']);
    expect(Object.keys(diagnosis).sort()).toEqual([
      'listForTask',
      'submit',
      'summarize',
    ]);
    await drainMicrotasks();
    expect(reminderBackend.readCount).toBe(0);
    expect(reminderBackend.commitCount).toBe(0);
    expect(schedulerBackend.queryCount).toBe(0);
    expect(schedulerBackend.calls).toEqual([]);
    expect(schedulerBackend.raw).toBeNull();
    expect(diagnosisBackend.readCount).toBe(0);
    expect(diagnosisBackend.commitCount).toBe(0);
    expect(context.loadCount).toBe(0);
    expect(nowCallCount).toBe(0);
    expect(idGeneratorCallCount).toBe(0);

    const sourceRoot = path.resolve(__dirname, '..', '..', 'src', 'application');
    const reminderSource = fs.readFileSync(
      path.resolve(sourceRoot, 'reminderScheduling.ts'),
      'utf8',
    );
    const diagnosisSource = fs.readFileSync(
      path.resolve(sourceRoot, 'delayDiagnosis.ts'),
      'utf8',
    );
    for (const source of [reminderSource, diagnosisSource]) {
      expect(source).not.toMatch(
        /from\s+['"](?:react-native|expo|@notifee|.*notifications?).*['"]/i,
      );
      expect(source).not.toMatch(/\b(?:setTimeout|setInterval|fetch)\s*\(/);
    }
  });

  it('accepts recursively frozen reminder inputs and frozen repository/scheduler returns while keeping results detached', async () => {
    const reminderBackend = new PhysicalReminderBackend();
    const schedulerBackend = new PhysicalSchedulerBackend();
    const service = loadReminderModule().createReminderSchedulingService({
      repository: new DeepFrozenReminderRepository(
        new ByteReminderRepository(reminderBackend),
      ),
      scheduler: new DeepFrozenReminderScheduler(
        new AtomicReminderScheduler(schedulerBackend),
      ),
    });
    const input = deepFreeze(
      reviewReconcileInput(
        '2026-08-05T10:00:00.000Z',
        'deep-frozen-reminder-operation',
      ),
    );
    expect(Object.isFrozen(input)).toBe(true);
    expect(Object.isFrozen(input.task)).toBe(true);
    expect(Object.isFrozen(input.task.subtasks)).toBe(true);
    expect(Object.isFrozen(input.rules)).toBe(true);
    expect(Object.isFrozen(input.rules[0])).toBe(true);

    const first = await service.reconcile(input);
    const repositoryBytes = reminderBackend.raw;
    const schedulerBytes = schedulerBackend.raw;
    expect(await service.reconcile(input)).toEqual(first);
    expect(reminderBackend.raw).toBe(repositoryBytes);
    expect(schedulerBackend.raw).toBe(schedulerBytes);
    const callerClone = {
      ...first,
      intents: first.intents.map(intent => ({...intent})),
    };
    const clonedIntent = callerClone.intents[0];
    if (clonedIntent === undefined) {
      throw new Error('EXPECTED_DEEP_FROZEN_REMINDER_INTENT');
    }
    clonedIntent.triggerAt = '2099-01-01T00:00:00.000Z';
    expect((await service.getState(input.task.id))?.intents).toEqual(
      first.intents,
    );
  });

  it('accepts recursively frozen diagnosis inputs and frozen context/repository returns while keeping results detached', async () => {
    const diagnosisBackend = new PhysicalDiagnosisBackend();
    const mutableContext = new StaticDiagnosisContext();
    mutableContext.tasks.set(
      'review-diagnosis-task',
      reviewEligibleTask(),
    );
    const repository = new DeepFrozenDiagnosisRepository(
      new ByteDiagnosisRepository(diagnosisBackend),
    );
    const service = loadDiagnosisModule().createDelayDiagnosisService({
      context: new DeepFrozenDiagnosisContext(mutableContext),
      repository,
      now: () => '2026-08-05T10:00:00.000Z',
      idGenerator: () => 'deep-frozen-diagnosis',
      policy: deepFreeze({...POLICY, allowedReasonKeys: [...POLICY.allowedReasonKeys]}),
    });
    const input = deepFreeze(
      reviewSubmitInput({
        privateText: 'deep frozen private text',
        suggestions: [
          {kind: 'first_step', value: 'Open the smallest file'},
          {kind: 'estimated_minutes', value: 5},
        ],
      }),
    );
    expect(Object.isFrozen(input)).toBe(true);
    expect(Object.isFrozen(input.signals)).toBe(true);
    expect(Object.isFrozen(input.suggestions)).toBe(true);
    expect(Object.isFrozen(input.suggestions[0])).toBe(true);

    const first = await service.submit(input, {
      operationId: 'deep-frozen-diagnosis-operation',
    });
    const durableBytes = diagnosisBackend.raw;
    const replay = await service.submit(input, {
      operationId: 'deep-frozen-diagnosis-operation',
    });
    expect(replay).toEqual(first);
    expect(diagnosisBackend.raw).toBe(durableBytes);
    const callerClone = {
      ...first,
      suggestions: first.suggestions.map(suggestion => ({...suggestion})),
    };
    const clonedSuggestion = callerClone.suggestions[0];
    if (clonedSuggestion === undefined || clonedSuggestion.kind !== 'first_step') {
      throw new Error('EXPECTED_DEEP_FROZEN_DIAGNOSIS_SUGGESTION');
    }
    clonedSuggestion.value = 'CALLER_CLONE_MUTATION';
    expect((await service.listForTask(input.taskId))[0]).toEqual(first);
  });
});
