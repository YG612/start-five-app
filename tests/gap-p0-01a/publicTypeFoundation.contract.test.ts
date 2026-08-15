import {
  compileContract,
  diagnosticCodes,
  diagnosticReport,
} from './inMemoryTypecheck';

describe('GAP-P0-01A-A1 public TypeScript foundation', () => {
  it('exports optional planning fields on Task and TaskInput while legacy callers still compile', () => {
    const compilation = compileContract(
      'task-planning-fields-positive',
      `
        import type {Task, TaskInput} from '../../../src/domain/task';

        type Assert<T extends true> = T;
        type Equal<A, B> =
          (<T>() => T extends A ? 1 : 2) extends
          (<T>() => T extends B ? 1 : 2)
            ? true
            : false;
        type ExpectedPlanningFields = {
          scheduledStartAt?: string | null;
          estimatedMinutes?: number | null;
          firstStep?: string | null;
        };
        type TaskPlanningFields = Pick<Task, keyof ExpectedPlanningFields>;
        type InputPlanningFields = Pick<
          TaskInput,
          keyof ExpectedPlanningFields
        >;
        type TaskFieldsAreExact = Assert<
          Equal<TaskPlanningFields, ExpectedPlanningFields>
        >;
        type InputFieldsAreExact = Assert<
          Equal<InputPlanningFields, ExpectedPlanningFields>
        >;

        const legacyInput: TaskInput = {
          title: 'legacy input',
          important: false,
          urgent: true,
          startAt: null,
          dueAt: null,
        };
        const legacyTask: Task = {
          id: 'legacy-task',
          title: 'legacy task',
          description: '',
          important: false,
          urgent: false,
          status: 'pending',
          startAt: null,
          dueAt: null,
          createdAt: '2026-08-05T00:00:00.000Z',
          updatedAt: '2026-08-05T00:00:00.000Z',
          startedAt: null,
          completedAt: null,
          deletedAt: null,
          score: null,
          scoreAwardedAt: null,
          subtasks: [],
        };
        const extendedInput: TaskInput = {
          ...legacyInput,
          scheduledStartAt: null,
          estimatedMinutes: 0,
          firstStep: null,
        };
        const extendedTask: Task = {
          ...legacyTask,
          scheduledStartAt: null,
          estimatedMinutes: 0,
          firstStep: null,
        };

        const taskProof: TaskFieldsAreExact = true;
        const inputProof: InputFieldsAreExact = true;
        void [legacyInput, legacyTask, extendedInput, extendedTask];
        void [taskProof, inputProof];
      `,
    );

    expect(diagnosticReport(compilation)).toBe('');
    expect(compilation.diagnostics).toEqual([]);
  });

  it('rejects illegal public planning-field types with compiler type errors', () => {
    const compilation = compileContract(
      'task-planning-fields-negative',
      `
        import type {TaskInput} from '../../../src/domain/task';

        const badScheduledStart: TaskInput = {
          title: 'bad scheduled start',
          important: true,
          urgent: true,
          scheduledStartAt: 123,
        };
        const badEstimate: TaskInput = {
          title: 'bad estimate',
          important: true,
          urgent: false,
          estimatedMinutes: 'five',
        };
        const badFirstStep: TaskInput = {
          title: 'bad first step',
          important: false,
          urgent: true,
          firstStep: 456,
        };
        void [badScheduledStart, badEstimate, badFirstStep];
      `,
    );

    expect(diagnosticCodes(compilation)).toEqual([2322, 2322, 2322]);
    expect(
      compilation.diagnostics.every(diagnostic =>
        diagnostic.message.includes('is not assignable to type'),
      ),
    ).toBe(true);
  });

  it('keeps the legacy CoreAppService public type exact', () => {
    const compilation = compileContract(
      'legacy-core-service-type',
      `
        import type {Task, TaskInput} from '../../../src/domain/task';
        import type {CoreAppService} from '../../../src/application/coreAppService';

        type Assert<T extends true> = T;
        type Equal<A, B> =
          (<T>() => T extends A ? 1 : 2) extends
          (<T>() => T extends B ? 1 : 2)
            ? true
            : false;
        type ExpectedCoreAppService = {
          createTask(
            input: TaskInput,
            operation: {operationId: string},
          ): Promise<Task>;
          addFirstStep(
            taskId: string,
            input: {title: string},
            operation: {operationId: string},
          ): Promise<Task>;
          chooseRecommended(): Promise<Task | null>;
          startRecommended(operation: {operationId: string}): Promise<Task>;
          finishStep(
            taskId: string,
            stepId: string,
            operation: {operationId: string},
          ): Promise<Task>;
          finishTask(
            taskId: string,
            operation: {operationId: string},
          ): Promise<{task: Task; points: number}>;
          getState(): Promise<{tasks: Task[]; totalScore: number}>;
        };
        type LegacySurfaceExact = Assert<
          Equal<CoreAppService, ExpectedCoreAppService>
        >;
        const proof: LegacySurfaceExact = true;
        void proof;
      `,
    );

    expect(diagnosticReport(compilation)).toBe('');
    expect(compilation.diagnostics).toEqual([]);
  });

  it('exports the exact minimal lifecycle service, inputs, options, query result, and factory signature', () => {
    const compilation = compileContract(
      'lifecycle-public-api',
      `
        import type {Task} from '../../../src/domain/task';
        import type {TaskRepository} from '../../../src/data/taskRepository';
        import type {TaskQuadrantProjection} from '../../../src/domain/quadrant';
        import {
          createTaskLifecycleService,
          type CreateTaskLifecycleServiceOptions,
          type TaskLifecycleDelayInput,
          type TaskLifecycleOperationOptions,
          type TaskLifecycleQueryResult,
          type TaskLifecycleReadOptions,
          type TaskLifecycleRescheduleInput,
          type TaskLifecycleService,
          type TaskLifecycleTaskInput,
          type TaskLifecycleTaskPatch,
        } from '../../../src/application/coreAppService';

        type Assert<T extends true> = T;
        type Equal<A, B> =
          (<T>() => T extends A ? 1 : 2) extends
          (<T>() => T extends B ? 1 : 2)
            ? true
            : false;

        type ExpectedTaskInput = {
          title: string;
          description?: string;
          important: boolean;
          urgent: boolean;
          startAt?: string | null;
          scheduledStartAt?: string | null;
          dueAt?: string | null;
          estimatedMinutes?: number | null;
          firstStep?: string | null;
        };
        type ExpectedTaskPatch = Partial<
          Pick<
            Task,
            | 'title'
            | 'description'
            | 'important'
            | 'urgent'
            | 'startAt'
            | 'scheduledStartAt'
            | 'dueAt'
            | 'estimatedMinutes'
            | 'firstStep'
          >
        >;
        type ExpectedReadOptions = {includeDeleted?: boolean};
        type ExpectedOperationOptions = {operationId: string};
        type ExpectedRescheduleInput = {
          scheduledStartAt: string | null;
          dueAt?: string | null;
        };
        type ExpectedDelayInput = {minutes: number};
        type ExpectedQueryResult = {
          tasks: Task[];
          recommendation: Task | null;
          quadrants: TaskQuadrantProjection;
        };
        type ExpectedFactoryOptions = {
          repository: TaskRepository;
          now(): string;
          idGenerator(): string;
        };
        type ExpectedService = {
          create(
            input: ExpectedTaskInput,
            operation: ExpectedOperationOptions,
          ): Promise<Task>;
          getById(
            taskId: string,
            options?: ExpectedReadOptions,
          ): Promise<Task | null>;
          list(options?: ExpectedReadOptions): Promise<Task[]>;
          update(
            taskId: string,
            patch: ExpectedTaskPatch,
            operation: ExpectedOperationOptions,
          ): Promise<Task>;
          softDelete(
            taskId: string,
            operation: ExpectedOperationOptions,
          ): Promise<Task>;
          complete(
            taskId: string,
            operation: ExpectedOperationOptions,
          ): Promise<{task: Task; points: number}>;
          reschedule(
            taskId: string,
            input: ExpectedRescheduleInput,
            operation: ExpectedOperationOptions,
          ): Promise<Task>;
          delay(
            taskId: string,
            input: ExpectedDelayInput,
            operation: ExpectedOperationOptions,
          ): Promise<Task>;
          getRecommendation(): Promise<Task | null>;
          getQuadrantProjection(): Promise<TaskQuadrantProjection>;
          getQueryResult(): Promise<ExpectedQueryResult>;
        };
        type ExpectedFactory = (
          options: ExpectedFactoryOptions,
        ) => ExpectedService;

        type InputExact = Assert<Equal<TaskLifecycleTaskInput, ExpectedTaskInput>>;
        type PatchExact = Assert<Equal<TaskLifecycleTaskPatch, ExpectedTaskPatch>>;
        type ReadExact = Assert<Equal<TaskLifecycleReadOptions, ExpectedReadOptions>>;
        type OperationExact = Assert<
          Equal<TaskLifecycleOperationOptions, ExpectedOperationOptions>
        >;
        type RescheduleExact = Assert<
          Equal<TaskLifecycleRescheduleInput, ExpectedRescheduleInput>
        >;
        type DelayExact = Assert<
          Equal<TaskLifecycleDelayInput, ExpectedDelayInput>
        >;
        type QueryExact = Assert<
          Equal<TaskLifecycleQueryResult, ExpectedQueryResult>
        >;
        type OptionsExact = Assert<
          Equal<CreateTaskLifecycleServiceOptions, ExpectedFactoryOptions>
        >;
        type ServiceExact = Assert<Equal<TaskLifecycleService, ExpectedService>>;
        type FactoryExact = Assert<
          Equal<typeof createTaskLifecycleService, ExpectedFactory>
        >;

        const proofs: [
          InputExact,
          PatchExact,
          ReadExact,
          OperationExact,
          RescheduleExact,
          DelayExact,
          QueryExact,
          OptionsExact,
          ServiceExact,
          FactoryExact,
        ] = [true, true, true, true, true, true, true, true, true, true];
        void proofs;
      `,
    );

    expect(diagnosticReport(compilation)).toBe('');
    expect(compilation.diagnostics).toEqual([]);
  });

  it('exports a fixed Q1-Q4 quadrant tuple and projection function signature without testing behavior', () => {
    const compilation = compileContract(
      'quadrant-public-api',
      `
        import type {Task} from '../../../src/domain/task';
        import {
          projectTaskQuadrants,
          QUADRANT_POSITION,
          type Quadrant,
          type TaskQuadrantBucket,
          type TaskQuadrantProjection,
        } from '../../../src/domain/quadrant';

        type Assert<T extends true> = T;
        type Equal<A, B> =
          (<T>() => T extends A ? 1 : 2) extends
          (<T>() => T extends B ? 1 : 2)
            ? true
            : false;
        type ExpectedBucket<Q extends Quadrant> = {
          quadrant: Q;
          position: (typeof QUADRANT_POSITION)[Q];
          totalCount: number;
          preview: Task[];
          allTasks: Task[];
        };
        type ExpectedProjection = readonly [
          ExpectedBucket<'Q1'>,
          ExpectedBucket<'Q2'>,
          ExpectedBucket<'Q3'>,
          ExpectedBucket<'Q4'>,
        ];
        type ExpectedFunction = (
          tasks: readonly Task[],
        ) => TaskQuadrantProjection;

        type Q1Exact = Assert<
          Equal<TaskQuadrantBucket<'Q1'>, ExpectedBucket<'Q1'>>
        >;
        type AllBucketExact = Assert<
          Equal<TaskQuadrantBucket<Quadrant>, ExpectedBucket<Quadrant>>
        >;
        type ProjectionExact = Assert<
          Equal<TaskQuadrantProjection, ExpectedProjection>
        >;
        type FunctionExact = Assert<
          Equal<typeof projectTaskQuadrants, ExpectedFunction>
        >;
        const proofs: [Q1Exact, AllBucketExact, ProjectionExact, FunctionExact] = [
          true,
          true,
          true,
          true,
        ];
        void proofs;
      `,
    );

    expect(diagnosticReport(compilation)).toBe('');
    expect(compilation.diagnostics).toEqual([]);
  });
});
