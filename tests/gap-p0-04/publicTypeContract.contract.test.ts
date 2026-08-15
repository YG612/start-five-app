import {
  compileContract,
  diagnosticCodes,
  diagnosticReport,
} from './inMemoryTypecheck';

describe('GAP-P0-04 managed storage public TypeScript contract', () => {
  it('typechecks the direct managed-runtime factory and every exact public recovery type', () => {
    const compilation = compileContract(
      'p0-04-managed-runtime-direct-positive-v3',
      `
        import {createStartFiveManagedRuntime} from '../../../src/app/startFiveManagedRuntime';
        import type {StartFiveAppComposition} from '../../../src/app/startFiveApp';
        import type {
          AsyncKeyValueBackend,
          QuarantineReceipt,
          RecoveryReceipt,
          RestoreReceipt,
          TaskDataInspection,
          TaskDataIntegrityCategory,
          TaskDataRecoveryController,
        } from '../../../src/data/persistentTaskStorage';

        type Assert<T extends true> = T;
        type Equal<A, B> =
          (<T>() => T extends A ? 1 : 2) extends
          (<T>() => T extends B ? 1 : 2)
            ? true
            : false;

        type ExpectedDependencies = {
          storageBackend: AsyncKeyValueBackend;
          now(): string;
          idGenerator(): string;
        };
        type ExpectedInspection =
          | {state: 'empty'}
          | {
              state: 'current';
              schema: 'start-five.tasks';
              version: 1;
              taskCount: number;
            }
          | {
              state: 'legacy';
              sourceKey: 'start-five.tasks.v1' | 'start-five.tasks';
              fromVersion: 0 | 'default';
              taskCount: number;
            }
          | {
              state: 'unreadable';
              sourceKey: 'start-five.tasks.v1' | 'start-five.tasks';
              category: TaskDataIntegrityCategory;
            }
          | {
              state: 'conflict';
              currentKey: 'start-five.tasks.v1';
              legacyKey: 'start-five.tasks';
            };
        type ExpectedController = {
          inspect(): Promise<TaskDataInspection>;
          quarantine(): Promise<QuarantineReceipt>;
          recover(
            backupKey: string,
            candidate: unknown,
          ): Promise<RecoveryReceipt>;
          restore(backupKey: string): Promise<RestoreReceipt>;
        };
        type ExpectedRuntime = {
          app: StartFiveAppComposition;
          recovery: TaskDataRecoveryController;
        };

        type ParameterCountProof = Assert<Equal<
          Parameters<typeof createStartFiveManagedRuntime>['length'],
          1
        >>;
        type ParameterProof = Assert<Equal<
          Parameters<typeof createStartFiveManagedRuntime>[0],
          ExpectedDependencies
        >>;
        type SynchronousReturnProof = Assert<Equal<
          ReturnType<typeof createStartFiveManagedRuntime>,
          ExpectedRuntime
        >>;
        type RuntimeKeysProof = Assert<Equal<
          keyof ReturnType<typeof createStartFiveManagedRuntime>,
          'app' | 'recovery'
        >>;
        type ControllerProof = Assert<Equal<
          TaskDataRecoveryController,
          ExpectedController
        >>;
        type ControllerKeysProof = Assert<Equal<
          keyof TaskDataRecoveryController,
          'inspect' | 'quarantine' | 'recover' | 'restore'
        >>;
        type InspectionProof = Assert<Equal<
          TaskDataInspection,
          ExpectedInspection
        >>;
        type QuarantineProof = Assert<Equal<
          QuarantineReceipt,
          {
            state: 'quarantined';
            backupKey: string;
            category: TaskDataIntegrityCategory;
            createdAt: string;
          }
        >>;
        type RecoveryProof = Assert<Equal<
          RecoveryReceipt,
          {
            state: 'recovered';
            backupKey: string;
            version: 1;
            taskCount: number;
          }
        >>;
        type RestoreProof = Assert<Equal<
          RestoreReceipt,
          {
            state: 'restored';
            backupKey: string;
            version: 1;
            taskCount: number;
          }
        >>;

        declare const backend: AsyncKeyValueBackend;
        const runtime = createStartFiveManagedRuntime({
          storageBackend: backend,
          now: () => '2026-08-05T08:00:00.000Z',
          idGenerator: () => 'backup-001',
        });
        const app: StartFiveAppComposition = runtime.app;
        const recovery: TaskDataRecoveryController = runtime.recovery;
        const parameterCountProof: ParameterCountProof = true;
        const parameterProof: ParameterProof = true;
        const synchronousReturnProof: SynchronousReturnProof = true;
        const runtimeKeysProof: RuntimeKeysProof = true;
        const controllerProof: ControllerProof = true;
        const controllerKeysProof: ControllerKeysProof = true;
        const inspectionProof: InspectionProof = true;
        const quarantineProof: QuarantineProof = true;
        const recoveryProof: RecoveryProof = true;
        const restoreProof: RestoreProof = true;
        void app;
        void recovery;
        void parameterCountProof;
        void parameterProof;
        void synchronousReturnProof;
        void runtimeKeysProof;
        void controllerProof;
        void controllerKeysProof;
        void inspectionProof;
        void quarantineProof;
        void recoveryProof;
        void restoreProof;
      `,
    );

    expect(diagnosticReport(compilation)).toBe('');
    expect(compilation.diagnostics).toEqual([]);
    expect(compilation.emittedFileCount).toBe(0);
  });

  it('typechecks the managed overload, exact four-method extension, categories, and canonical receipts', () => {
    const compilation = compileContract(
      'p0-04-managed-storage-positive-v2',
      `
        import {
          createPersistentTaskStorage,
          type AsyncKeyValueBackend,
          type ManagedTaskStorage,
          type QuarantineReceipt,
          type RecoveryReceipt,
          type RestoreReceipt,
          type TaskDataInspection,
          type TaskDataIntegrityCategory,
          type TaskDataRecoveryDependencies,
        } from '../../../src/data/persistentTaskStorage';
        import type {KeyValueStorage} from '../../../src/data/taskRepository';

        type Assert<T extends true> = T;
        type Equal<A, B> =
          (<T>() => T extends A ? 1 : 2) extends
          (<T>() => T extends B ? 1 : 2)
            ? true
            : false;

        declare const backend: AsyncKeyValueBackend;
        const dependencies: TaskDataRecoveryDependencies = {
          now: () => '2026-08-05T08:00:00.000Z',
          idGenerator: () => 'backup-001',
        };
        const managed = createPersistentTaskStorage(backend, dependencies);
        const managedProof: ManagedTaskStorage = managed;
        const keyValueProof: KeyValueStorage = managed;
        const inspection: Promise<TaskDataInspection> = managed.inspect();
        const quarantine: Promise<QuarantineReceipt> = managed.quarantine();
        const recovery: Promise<RecoveryReceipt> = managed.recover(
          'start-five.tasks.quarantine.backup-001',
          {schema: 'start-five.tasks', version: 1, tasks: []},
        );
        const restore: Promise<RestoreReceipt> = managed.restore(
          'start-five.tasks.quarantine.backup-001',
        );

        type ManagementMethods = Exclude<
          keyof ManagedTaskStorage,
          keyof KeyValueStorage
        >;
        type MethodProof = Assert<Equal<
          ManagementMethods,
          'inspect' | 'quarantine' | 'recover' | 'restore'
        >>;
        type CategoryProof = Assert<Equal<
          TaskDataIntegrityCategory,
          | 'MALFORMED_JSON'
          | 'WRONG_ROOT'
          | 'UNSUPPORTED_SCHEMA'
          | 'UNSUPPORTED_VERSION'
          | 'INVALID_SNAPSHOT'
        >>;
        type RestoreKeysProof = Assert<Equal<
          keyof RestoreReceipt,
          'state' | 'backupKey' | 'version' | 'taskCount'
        >>;
        type RestoreShapeProof = Assert<Equal<
          RestoreReceipt,
          {
            state: 'restored';
            backupKey: string;
            version: 1;
            taskCount: number;
          }
        >>;
        const methodProof: MethodProof = true;
        const categoryProof: CategoryProof = true;
        const restoreKeysProof: RestoreKeysProof = true;
        const restoreShapeProof: RestoreShapeProof = true;
        void managedProof;
        void keyValueProof;
        void inspection;
        void quarantine;
        void recovery;
        void restore;
        void methodProof;
        void categoryProof;
        void restoreKeysProof;
        void restoreShapeProof;
      `,
    );

    expect(diagnosticReport(compilation)).toBe('');
    expect(compilation.diagnostics).toEqual([]);
    expect(compilation.emittedFileCount).toBe(0);
  });

  it('keeps the original one-argument overload compatibility-only', () => {
    const compilation = compileContract(
      'p0-04-compatibility-overload-negative-v2',
      `
        import {
          createPersistentTaskStorage,
          type AsyncKeyValueBackend,
        } from '../../../src/data/persistentTaskStorage';
        declare const backend: AsyncKeyValueBackend;
        const compatibility = createPersistentTaskStorage(backend);
        compatibility.inspect();
      `,
    );

    expect(diagnosticCodes(compilation)).toEqual([2339]);
    expect(compilation.diagnostics[0]?.message).toContain(
      "Property 'inspect' does not exist",
    );
    expect(compilation.emittedFileCount).toBe(0);
  });

  it('does not expose the revoked raw-preserving restore receipt', () => {
    const compilation = compileContract(
      'p0-04-no-raw-restore-receipt-v2',
      `
        import type {RestoreReceipt} from '../../../src/data/persistentTaskStorage';
        declare const receipt: RestoreReceipt;
        const rawPreserved: true = receipt.rawPreserved;
        void rawPreserved;
      `,
    );

    expect(diagnosticCodes(compilation)).toEqual([2339]);
    expect(compilation.diagnostics[0]?.message).toContain(
      "Property 'rawPreserved' does not exist",
    );
    expect(compilation.emittedFileCount).toBe(0);
  });
});
