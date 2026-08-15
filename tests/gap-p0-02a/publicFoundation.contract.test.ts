import {
  compileContract,
  diagnosticCodes,
  diagnosticReport,
} from './inMemoryTypecheck';

describe('GAP-P0-02A public focus-session foundation', () => {
  it('exports exact readonly session, input, patch, duration, status, and query-result types', () => {
    const compilation = compileContract(
      'focus-session-public-types',
      `
        import type {
          FocusDurationMinutes,
          FocusSession,
          FocusSessionInput,
          FocusSessionPatch,
          FocusSessionQueryResult,
          FocusSessionStatus,
        } from '../../../src/domain/focusSession';

        type Assert<T extends true> = T;
        type Equal<A, B> =
          (<T>() => T extends A ? 1 : 2) extends
          (<T>() => T extends B ? 1 : 2)
            ? true
            : false;

        type ExpectedDuration = 2 | 5 | 15 | 25 | 50;
        type ExpectedStatus = 'running' | 'completed' | 'interrupted';
        type ExpectedSession = Readonly<{
          id: string;
          taskId: string;
          plannedMinutes: ExpectedDuration;
          status: ExpectedStatus;
          startedAt: string;
          plannedEndAt: string;
          endedAt: string | null;
          actualSeconds: number | null;
          interruptionReason: string | null;
          createdAt: string;
          updatedAt: string;
        }>;
        type ExpectedInput = Readonly<{
          taskId: string;
          plannedMinutes: ExpectedDuration;
        }>;
        type ExpectedPatch = Readonly<
          Partial<
            Pick<
              ExpectedSession,
              | 'status'
              | 'endedAt'
              | 'actualSeconds'
              | 'interruptionReason'
              | 'updatedAt'
            >
          >
        >;
        type ExpectedQueryResult = Readonly<{
          taskId: string;
          sessions: readonly ExpectedSession[];
          activeSession: ExpectedSession | null;
        }>;

        type DurationExact = Assert<
          Equal<FocusDurationMinutes, ExpectedDuration>
        >;
        type StatusExact = Assert<Equal<FocusSessionStatus, ExpectedStatus>>;
        type SessionExact = Assert<Equal<FocusSession, ExpectedSession>>;
        type InputExact = Assert<Equal<FocusSessionInput, ExpectedInput>>;
        type PatchExact = Assert<Equal<FocusSessionPatch, ExpectedPatch>>;
        type QueryExact = Assert<
          Equal<FocusSessionQueryResult, ExpectedQueryResult>
        >;

        const running: FocusSession = {
          id: 'focus-001',
          taskId: 'task-001',
          plannedMinutes: 5,
          status: 'running',
          startedAt: '2026-08-05T00:00:00.000Z',
          plannedEndAt: '2026-08-05T00:05:00.000Z',
          endedAt: null,
          actualSeconds: null,
          interruptionReason: null,
          createdAt: '2026-08-05T00:00:00.000Z',
          updatedAt: '2026-08-05T00:00:00.000Z',
        };
        const input: FocusSessionInput = {
          taskId: running.taskId,
          plannedMinutes: 25,
        };
        const patch: FocusSessionPatch = {
          status: 'completed',
          endedAt: '2026-08-05T00:05:00.000Z',
          actualSeconds: 300,
          interruptionReason: null,
          updatedAt: '2026-08-05T00:05:00.000Z',
        };
        const query: FocusSessionQueryResult = {
          taskId: running.taskId,
          sessions: [running],
          activeSession: running,
        };
        const proofs: [
          DurationExact,
          StatusExact,
          SessionExact,
          InputExact,
          PatchExact,
          QueryExact,
        ] = [true, true, true, true, true, true];
        void [running, input, patch, query, proofs];
      `,
    );

    expect(diagnosticReport(compilation)).toBe('');
    expect(compilation.diagnostics).toEqual([]);
  });

  it('rejects unsupported durations and mutation of every locked readonly layer', () => {
    const compilation = compileContract(
      'focus-session-negative-types',
      `
        import type {
          FocusDurationMinutes,
          FocusSession,
          FocusSessionInput,
          FocusSessionQueryResult,
        } from '../../../src/domain/focusSession';

        const tooShort: FocusDurationMinutes = 1;
        const arbitrary: FocusDurationMinutes = 10;
        const tooLong: FocusDurationMinutes = 60;
        declare const session: FocusSession;
        declare const input: FocusSessionInput;
        declare const result: FocusSessionQueryResult;
        session.status = 'completed';
        input.plannedMinutes = 5;
        result.sessions.push(session);
        void [tooShort, arbitrary, tooLong];
      `,
    );

    expect(diagnosticCodes(compilation)).toEqual([
      2322,
      2322,
      2322,
      2540,
      2540,
      2339,
    ]);
    expect(compilation.emittedFileCount).toBe(0);
  });

  it('exports an exact storage-independent load/list/get/save/transaction repository port', () => {
    const compilation = compileContract(
      'focus-session-repository-port',
      `
        import type {FocusSession} from '../../../src/domain/focusSession';
        import type {
          FocusSessionRepository,
          FocusSessionTransaction,
        } from '../../../src/data/focusSessionRepository';

        type Assert<T extends true> = T;
        type Equal<A, B> =
          (<T>() => T extends A ? 1 : 2) extends
          (<T>() => T extends B ? 1 : 2)
            ? true
            : false;
        type ExpectedTransaction = {
          load(): Promise<readonly FocusSession[]>;
          list(taskId?: string): Promise<readonly FocusSession[]>;
          get(sessionId: string): Promise<FocusSession | null>;
          save(session: FocusSession): Promise<FocusSession>;
        };
        type ExpectedRepository = {
          load(): Promise<readonly FocusSession[]>;
          list(taskId?: string): Promise<readonly FocusSession[]>;
          get(sessionId: string): Promise<FocusSession | null>;
          save(session: FocusSession): Promise<FocusSession>;
          transaction<T>(
            work: (transaction: ExpectedTransaction) => Promise<T>,
          ): Promise<T>;
        };
        type TransactionExact = Assert<
          Equal<FocusSessionTransaction, ExpectedTransaction>
        >;
        type RepositoryExact = Assert<
          Equal<FocusSessionRepository, ExpectedRepository>
        >;
        const proofs: [TransactionExact, RepositoryExact] = [true, true];
        void proofs;
      `,
    );

    expect(diagnosticReport(compilation)).toBe('');
    expect(compilation.diagnostics).toEqual([]);
  });

  it('exports the exact seven-method service, options, and factory signature', () => {
    const compilation = compileContract(
      'focus-session-service-port',
      `
        import type {
          FocusSession,
          FocusSessionInput,
          FocusSessionQueryResult,
        } from '../../../src/domain/focusSession';
        import type {FocusSessionRepository} from '../../../src/data/focusSessionRepository';
        import {
          createFocusSessionService,
          type CreateFocusSessionServiceOptions,
          type FocusSessionService,
        } from '../../../src/application/focusSessionService';

        type Assert<T extends true> = T;
        type Equal<A, B> =
          (<T>() => T extends A ? 1 : 2) extends
          (<T>() => T extends B ? 1 : 2)
            ? true
            : false;
        type ExpectedOptions = Readonly<{
          repository: FocusSessionRepository;
          now(): string;
          idGenerator(): string;
        }>;
        type ExpectedService = {
          start(input: FocusSessionInput): Promise<FocusSession>;
          getActive(): Promise<FocusSession | null>;
          getById(sessionId: string): Promise<FocusSession | null>;
          listForTask(taskId: string): Promise<FocusSessionQueryResult>;
          finish(sessionId: string): Promise<FocusSession>;
          interrupt(
            sessionId: string,
            reason: string,
          ): Promise<FocusSession>;
          restore(): Promise<FocusSession | null>;
        };
        type ExpectedFactory = (options: ExpectedOptions) => ExpectedService;
        type OptionsExact = Assert<
          Equal<CreateFocusSessionServiceOptions, ExpectedOptions>
        >;
        type ServiceExact = Assert<Equal<FocusSessionService, ExpectedService>>;
        type FactoryExact = Assert<
          Equal<typeof createFocusSessionService, ExpectedFactory>
        >;
        const proofs: [OptionsExact, ServiceExact, FactoryExact] = [
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
