import * as coreAppServiceModule from '../../src/application/coreAppService';
import {createCoreAppService} from '../../src/application/coreAppService';
import {
  createTaskRepository,
  type KeyValueStorage,
} from '../../src/data/taskRepository';
import * as fiveMinuteTimerModule from '../../src/services/fiveMinuteTimer';
import * as coreFlowScreenModule from '../../src/screens/CoreFlowScreen';
import {createDefaultCoreFlowTimerController} from '../../src/screens/CoreFlowScreen';
import {
  compileContract,
  diagnosticReport,
} from './inMemoryTypecheck';

class MemoryStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}

const EXPECTED_LEGACY_CORE_METHODS: readonly string[] = [
  'addFirstStep',
  'chooseRecommended',
  'createTask',
  'finishStep',
  'finishTask',
  'getState',
  'startRecommended',
];

describe('GAP-P0-02A legacy compatibility controls', () => {
  it('keeps the FiveMinuteTimer public TypeScript surface exact', () => {
    const compilation = compileContract(
      'legacy-five-minute-timer-type',
      `
        import {
          DEFAULT_DURATION_MS,
          FiveMinuteTimer,
        } from '../../../src/services/fiveMinuteTimer';

        type Assert<T extends true> = T;
        type Equal<A, B> =
          (<T>() => T extends A ? 1 : 2) extends
          (<T>() => T extends B ? 1 : 2)
            ? true
            : false;
        type ExpectedOptions = {
          durationMs?: number;
          now?: () => number;
          onFinish?: () => void;
        };
        type ExpectedTimer = {
          start(): void;
          pause(): void;
          resume(): void;
          handleAppState(state: 'active' | 'background' | 'inactive'): void;
          finish(): void;
          dispose(): void;
          getSnapshot(): {
            state: 'idle' | 'running' | 'paused' | 'finished';
            durationMs: number;
            remainingMs: number;
            startedAtMs: number | null;
            finishedAtMs: number | null;
          };
        };
        type DurationExact = Assert<Equal<typeof DEFAULT_DURATION_MS, 300000>>;
        type ConstructorExact = Assert<
          Equal<
            ConstructorParameters<typeof FiveMinuteTimer>,
            [options?: ExpectedOptions]
          >
        >;
        type PublicKeysExact = Assert<
          Equal<keyof FiveMinuteTimer, keyof ExpectedTimer>
        >;
        type PublicShapeExact = Assert<
          Equal<Pick<FiveMinuteTimer, keyof FiveMinuteTimer>, ExpectedTimer>
        >;
        const proofs: [
          DurationExact,
          ConstructorExact,
          PublicKeysExact,
          PublicShapeExact,
        ] = [true, true, true, true];
        void proofs;
      `,
    );

    expect(diagnosticReport(compilation)).toBe('');
    expect(compilation.diagnostics).toEqual([]);
  });

  it('keeps CoreAppService and CoreFlow controller/screen public types exact', () => {
    const compilation = compileContract(
      'legacy-core-public-types',
      `
        import type {Task, TaskInput} from '../../../src/domain/task';
        import type {CoreAppService} from '../../../src/application/coreAppService';
        import type {
          CoreFlowAppState,
          CoreFlowAppStateSource,
          CoreFlowScreenProps,
          CoreFlowTimerController,
          CoreFlowTimerSnapshot,
          CoreFlowTimerState,
          CoreFlowUiCommitKind,
        } from '../../../src/screens/CoreFlowScreen';

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
        type ExpectedTimerState = 'idle' | 'running' | 'paused' | 'finished';
        type ExpectedTimerSnapshot = {
          state: ExpectedTimerState;
          durationMs: number;
          remainingMs: number;
        };
        type ExpectedAppState = 'active' | 'background' | 'inactive';
        type ExpectedTimerController = {
          getSnapshot(): ExpectedTimerSnapshot;
          subscribe(
            listener: (snapshot: ExpectedTimerSnapshot) => void,
          ): () => void;
          start(): void;
          pause(): void;
          resume(): void;
          handleAppState(state: ExpectedAppState): void;
          dispose(): void;
        };
        type ExpectedAppStateSource = {
          addEventListener(
            event: 'change',
            listener: (state: ExpectedAppState) => void,
          ): {remove(): void};
        };
        type ExpectedCommitKind =
          | 'activeTask'
          | 'selectedStep'
          | 'error'
          | 'starting';
        type ExpectedScreenProps = {
          service: CoreAppService;
          timerController?: ExpectedTimerController;
          appStateSource?: ExpectedAppStateSource;
          onUiCommit?: (kind: ExpectedCommitKind) => void;
          onUiCommitError?: (
            error: unknown,
            kind: ExpectedCommitKind,
          ) => void;
        };
        type Proofs = [
          Assert<Equal<CoreAppService, ExpectedCoreAppService>>,
          Assert<Equal<CoreFlowTimerState, ExpectedTimerState>>,
          Assert<Equal<CoreFlowTimerSnapshot, ExpectedTimerSnapshot>>,
          Assert<Equal<CoreFlowAppState, ExpectedAppState>>,
          Assert<Equal<CoreFlowTimerController, ExpectedTimerController>>,
          Assert<Equal<CoreFlowAppStateSource, ExpectedAppStateSource>>,
          Assert<Equal<CoreFlowUiCommitKind, ExpectedCommitKind>>,
          Assert<Equal<CoreFlowScreenProps, ExpectedScreenProps>>,
        ];
        const proofs: Proofs = [
          true,
          true,
          true,
          true,
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

  it('keeps both CoreFlowScreen runtime function signatures exact in the real CompilerHost', () => {
    const compilation = compileContract(
      'legacy-core-flow-function-signatures',
      `
        import type {JSX} from 'react';
        import type {CoreAppService} from '../../../src/application/coreAppService';
        import {
          CoreFlowScreen,
          createDefaultCoreFlowTimerController,
        } from '../../../src/screens/CoreFlowScreen';

        type Assert<T extends true> = T;
        type Equal<A, B> =
          (<T>() => T extends A ? 1 : 2) extends
          (<T>() => T extends B ? 1 : 2)
            ? true
            : false;
        type ExpectedTimerState = 'idle' | 'running' | 'paused' | 'finished';
        type ExpectedTimerSnapshot = {
          state: ExpectedTimerState;
          durationMs: number;
          remainingMs: number;
        };
        type ExpectedAppState = 'active' | 'background' | 'inactive';
        type ExpectedTimerController = {
          getSnapshot(): ExpectedTimerSnapshot;
          subscribe(
            listener: (snapshot: ExpectedTimerSnapshot) => void,
          ): () => void;
          start(): void;
          pause(): void;
          resume(): void;
          handleAppState(state: ExpectedAppState): void;
          dispose(): void;
        };
        type ExpectedAppStateSource = {
          addEventListener(
            event: 'change',
            listener: (state: ExpectedAppState) => void,
          ): {remove(): void};
        };
        type ExpectedCommitKind =
          | 'activeTask'
          | 'selectedStep'
          | 'error'
          | 'starting';
        type ExpectedScreenProps = {
          service: CoreAppService;
          timerController?: ExpectedTimerController;
          appStateSource?: ExpectedAppStateSource;
          onUiCommit?: (kind: ExpectedCommitKind) => void;
          onUiCommitError?: (
            error: unknown,
            kind: ExpectedCommitKind,
          ) => void;
        };
        type ExpectedScreenFunction = (
          props: ExpectedScreenProps,
        ) => JSX.Element;
        type ExpectedControllerFactory = (
          options?: {
            durationMs?: number;
            now?: () => number;
          },
        ) => ExpectedTimerController;
        type ScreenFunctionExact = Assert<
          Equal<typeof CoreFlowScreen, ExpectedScreenFunction>
        >;
        type ControllerFactoryExact = Assert<
          Equal<
            typeof createDefaultCoreFlowTimerController,
            ExpectedControllerFactory
          >
        >;
        const proofs: [ScreenFunctionExact, ControllerFactoryExact] = [
          true,
          true,
        ];
        void proofs;
      `,
    );

    expect(diagnosticReport(compilation)).toBe('');
    expect(compilation.diagnostics).toEqual([]);
  });

  it('keeps legacy timer and core module runtime exports exact', () => {
    expect(Object.keys(fiveMinuteTimerModule).sort()).toEqual([
      'DEFAULT_DURATION_MS',
      'FiveMinuteTimer',
    ]);
    expect(Object.keys(coreAppServiceModule).sort()).toEqual([
      'DEFAULT_OPERATION_REGISTRY_CAPACITY',
      'createCoreAppService',
      'createOperationRegistry',
      'createTaskLifecycleService',
      'getDefaultOperationRegistryDiagnostics',
    ]);
  });

  it('keeps the real CoreFlowScreen namespace and default controller construction surface exact and side-effect free', () => {
    const now = jest.fn(() => 0);
    const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout');
    const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');
    const setIntervalSpy = jest.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = jest.spyOn(globalThis, 'clearInterval');

    expect(Object.keys(coreFlowScreenModule).sort()).toEqual([
      'CoreFlowScreen',
      'createDefaultCoreFlowTimerController',
    ]);
    const controller = createDefaultCoreFlowTimerController({
      durationMs: 300_000,
      now,
    });

    expect(Object.keys(controller).sort()).toEqual([
      'dispose',
      'getSnapshot',
      'handleAppState',
      'pause',
      'resume',
      'start',
      'subscribe',
    ]);
    expect(now).not.toHaveBeenCalled();
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    expect(clearTimeoutSpy).not.toHaveBeenCalled();
    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(clearIntervalSpy).not.toHaveBeenCalled();
  });

  it('keeps the legacy createCoreAppService own seven-method object exact', () => {
    const repository = createTaskRepository(
      new MemoryStorage(),
      'gap-p0-02a-legacy-core',
    );
    const service = createCoreAppService({
      repository,
      now: () => '2026-08-05T00:00:00.000Z',
      idGenerator: () => 'legacy-focus-control-id',
    });

    expect(Object.keys(service).sort()).toEqual(EXPECTED_LEGACY_CORE_METHODS);
  });
});
