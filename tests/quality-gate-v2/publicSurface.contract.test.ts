import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import {
  EXPECTED_BOOTSTRAP_MANIFEST_PATH,
  EXPECTED_BOOTSTRAP_SPEC_PATH,
  EXPECTED_BOOTSTRAP_TEST_ROOT,
  EXPECTED_ENV_ALLOWLIST,
  EXPECTED_STAGE_ORDER,
  EXPECTED_TEST_STAGE_ORDER,
  expectedRuntimeKeys,
  fixturePath,
  loadQualityGateProduction,
  loadRawQualityGateModule,
  projectRoot,
  sha256,
} from './qualityGateV2TestKit';

describe('QUALITY-GATE-V2 public contract', () => {
  it('exports the exact runtime namespace and stable literal constants', () => {
    const raw = loadRawQualityGateModule();
    expect(Object.keys(raw).sort()).toEqual(expectedRuntimeKeys());

    const production = loadQualityGateProduction();
    expect(production.QUALITY_GATE_V2_BOOTSTRAP_MANIFEST).toBe(
      EXPECTED_BOOTSTRAP_MANIFEST_PATH,
    );
    expect(production.QUALITY_GATE_V2_BOOTSTRAP_SPEC).toBe(
      EXPECTED_BOOTSTRAP_SPEC_PATH,
    );
    expect(production.QUALITY_GATE_V2_BOOTSTRAP_TEST_ROOT).toBe(
      EXPECTED_BOOTSTRAP_TEST_ROOT,
    );
    expect(production.QUALITY_GATE_STAGE_ORDER).toEqual(EXPECTED_STAGE_ORDER);
    expect(production.QUALITY_GATE_TEST_STAGE_ORDER).toEqual(
      EXPECTED_TEST_STAGE_ORDER,
    );
    expect(production.QUALITY_GATE_ENV_ALLOWLIST).toEqual(
      EXPECTED_ENV_ALLOWLIST,
    );
    expect(production.QUALITY_GATE_REPORT_SCHEMA).toBe(
      'start-five.quality-gate-report',
    );
    expect(production.QUALITY_GATE_REPORT_VERSION).toBe(1);
  });

  it('provides a strict declaration surface usable by an ordinary TypeScript consumer', () => {
    const root = projectRoot();
    const virtualFile = path.join(
      root,
      'tests',
      'quality-gate-v2',
      '__virtual__',
      'consumer.ts',
    );
    const source = [
      "import {",
      "  QUALITY_GATE_V2_BOOTSTRAP_MANIFEST,",
      "  QUALITY_GATE_V2_BOOTSTRAP_SPEC,",
      "  QUALITY_GATE_V2_BOOTSTRAP_TEST_ROOT,",
      "  QUALITY_GATE_STAGE_ORDER,",
      "  QUALITY_GATE_TEST_STAGE_ORDER,",
      "  QUALITY_GATE_ENV_ALLOWLIST,",
      "  QUALITY_GATE_REPORT_SCHEMA,",
      "  QUALITY_GATE_REPORT_VERSION,",
      "  createNodeProcessRunner,",
      "  createQualityGateOrchestrator,",
      "  validateLockManifests,",
      "  validateQualityGateV2Bootstrap,",
      "  discoverAcceptedTestRoots,",
      "  createAtomicQualityGateReportWriter,",
      "  auditIosProjectStatic,",
      "  parseQualityGateCliArgs,",
      "  runQualityGateCli,",
      "  type CreateQualityGateOptions,",
      "  type IosStaticAuditResult,",
      "  type QualityGateCliDependencies,",
      "  type QualityGateV2BootstrapSummary,",
      "  type ProcessRequest,",
      "  type ProcessResult,",
      "  type ProcessRunner,",
      "} from '../../../scripts/quality-gate-v2/index';",
      "declare const options: CreateQualityGateOptions;",
      "declare const cliDependencies: QualityGateCliDependencies;",
      "declare const request: ProcessRequest;",
      "declare const result: ProcessResult;",
      "declare const iosAuditResult: IosStaticAuditResult;",
      "declare const bootstrapSummary: QualityGateV2BootstrapSummary;",
      "const runner: ProcessRunner = createNodeProcessRunner({baseEnvironment: {CI: '1'}});",
      "const orchestrator = createQualityGateOrchestrator(options);",
      "orchestrator.plan('full');",
      "orchestrator.run('test');",
      "runner.run(request);",
      "Promise.resolve(result);",
      "Promise.resolve(iosAuditResult);",
      "Promise.resolve(bootstrapSummary);",
      "validateLockManifests({projectRoot: 'C:\\\\project', registryPath: 'C:\\\\project\\\\quality-gate.acceptance.json'});",
      "validateQualityGateV2Bootstrap({projectRoot: 'C:\\\\project', expectedSelfSha256: 'a'.repeat(64)});",
      "discoverAcceptedTestRoots({projectRoot: 'C:\\\\project', registryPath: 'C:\\\\project\\\\quality-gate.acceptance.json'});",
      "createAtomicQualityGateReportWriter({reportDirectory: 'C:\\\\reports'});",
      "auditIosProjectStatic({projectRoot: 'C:\\\\project'});",
      "parseQualityGateCliArgs(['full'], 'C:\\\\project');",
      "runQualityGateCli(['full'], cliDependencies);",
      "void QUALITY_GATE_STAGE_ORDER;",
      "void QUALITY_GATE_TEST_STAGE_ORDER;",
      "void QUALITY_GATE_ENV_ALLOWLIST;",
      "void QUALITY_GATE_REPORT_SCHEMA;",
      "void QUALITY_GATE_REPORT_VERSION;",
      "void QUALITY_GATE_V2_BOOTSTRAP_MANIFEST;",
      "void QUALITY_GATE_V2_BOOTSTRAP_SPEC;",
      "void QUALITY_GATE_V2_BOOTSTRAP_TEST_ROOT;",
    ].join('\n');

    const compilerOptions: ts.CompilerOptions = {
      strict: true,
      noEmit: true,
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      esModuleInterop: true,
      skipLibCheck: true,
    };
    const host = ts.createCompilerHost(compilerOptions);
    const originalFileExists = host.fileExists.bind(host);
    const originalReadFile = host.readFile.bind(host);
    const originalGetSourceFile = host.getSourceFile.bind(host);
    const normalize = (value: string): string => path.resolve(value);
    host.fileExists = fileName =>
      normalize(fileName) === normalize(virtualFile) ||
      originalFileExists(fileName);
    host.readFile = fileName =>
      normalize(fileName) === normalize(virtualFile)
        ? source
        : originalReadFile(fileName);
    host.getSourceFile = (
      fileName,
      languageVersion,
      onError,
      shouldCreateNewSourceFile,
    ) =>
      normalize(fileName) === normalize(virtualFile)
        ? ts.createSourceFile(
            fileName,
            source,
            languageVersion,
            true,
            ts.ScriptKind.TS,
          )
        : originalGetSourceFile(
            fileName,
            languageVersion,
            onError,
            shouldCreateNewSourceFile,
          );

    const program = ts.createProgram({
      rootNames: [virtualFile],
      options: compilerOptions,
      host,
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    expect(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: fileName => fileName,
        getCurrentDirectory: () => root,
        getNewLine: () => '\n',
      }),
    ).toBe('');
  });

  it('keeps the independent SHA and child fixture controls auditable', () => {
    expect(sha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(fs.existsSync(fixturePath())).toBe(true);
  });
});
