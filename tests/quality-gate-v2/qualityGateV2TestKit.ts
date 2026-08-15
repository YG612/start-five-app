import * as crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const EXPECTED_STAGE_ORDER = [
  'formal-tests',
  'typecheck',
  'android-lint',
  'android-unit-tests',
  'android-assemble',
  'android-signature',
  'android-zipalign',
  'android-package-manifest',
  'lock-manifests',
  'ios-static-audit',
] as const;

export const EXPECTED_TEST_STAGE_ORDER = [
  'formal-tests',
  'lock-manifests',
] as const;

export const EXPECTED_ENV_ALLOWLIST = [
  'ANDROID_HOME',
  'ANDROID_SDK_ROOT',
  'CI',
  'ComSpec',
  'JAVA_HOME',
  'NODE_OPTIONS',
  'PATH',
  'PATHEXT',
  'SystemRoot',
  'TEMP',
  'TMP',
] as const;

export const EXPECTED_BOOTSTRAP_MANIFEST_PATH =
  'QUALITY_GATE_V2_LOCK.sha256' as const;
export const EXPECTED_BOOTSTRAP_SPEC_PATH =
  'QUALITY_GATE_V2_TEST_SPEC.md' as const;
export const EXPECTED_BOOTSTRAP_TEST_ROOT =
  'tests/quality-gate-v2' as const;

const SYNTHETIC_BOOTSTRAP_SPEC = 'bootstrap specification\n';
const SYNTHETIC_BOOTSTRAP_TEST = 'export {};\n';
const SYNTHETIC_BOOTSTRAP_TEST_PATH =
  'tests/quality-gate-v2/bootstrap.contract.test.ts';
const SYNTHETIC_BOOTSTRAP_MANIFEST = [
  'fc9ac6197306a3f0a7189b7d8d19686e66d63d1510a37a8fa9fd4dc0e7161961' +
    '  QUALITY_GATE_V2_TEST_SPEC.md',
  '8e609bb71c20b858c77f0e9f90bb1319db8477b13f9f965f1a1e18524bf50881' +
    '  tests/quality-gate-v2/bootstrap.contract.test.ts',
  '',
].join('\n');
export const SYNTHETIC_BOOTSTRAP_EXPECTED_SELF_SHA256 =
  '52596716203c993412346a8adf5f2bbb94a88f2a65d1365b1f3f573ce08de555';

export type QualityGateMode = 'test' | 'full';
export type QualityGateStageId = (typeof EXPECTED_STAGE_ORDER)[number];

export type ProcessRequest = Readonly<{
  executable: string;
  args: readonly string[];
  cwd: string;
  env: Readonly<Record<string, string>>;
  timeoutMs: number;
  signal?: AbortSignal;
  timeoutSignal?: AbortSignal;
}>;

export type ProcessResult = Readonly<{
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  timeoutSource: 'deadline' | 'signal' | null;
  durationMs: number;
}>;

export type ProcessRunner = {
  run(request: ProcessRequest): Promise<ProcessResult>;
};

export type StagePlan = Readonly<{
  id: QualityGateStageId;
  kind: 'process' | 'internal';
  request: ProcessRequest | null;
}>;

export type StageEvidence = Readonly<{
  id: QualityGateStageId;
  status: 'passed' | 'failed' | 'skipped';
  request: ProcessRequest | null;
  result: ProcessResult | null;
  startedAt: string | null;
  finishedAt: string | null;
}>;

export type QualityGateReport = Readonly<{
  schema: 'start-five.quality-gate-report';
  version: 1;
  runId: string;
  mode: QualityGateMode;
  platform: 'win32';
  status: 'passed' | 'failed';
  projectRoot: string;
  startedAt: string;
  finishedAt: string;
  stages: readonly StageEvidence[];
  failure: Readonly<{
    stageId: QualityGateStageId;
    exitCode: number | null;
    signal: string | null;
    timedOut: boolean;
    timeoutSource: 'deadline' | 'signal' | null;
    stdout: string;
    stderr: string;
  }> | null;
}>;

export type ReportArtifacts = Readonly<{
  jsonPath: string;
  summaryPath: string;
}>;

export type QualityGateReportWriter = {
  write(report: QualityGateReport): Promise<ReportArtifacts>;
};

export type LockValidationSummary = Readonly<{
  validatedManifests: number;
  entries: number;
  acceptedTestRoots: readonly string[];
  acceptedManifests: readonly string[];
  excludedManifests: readonly Readonly<{
    manifest: string;
    status: Exclude<LockRegistryStatus, 'accepted'>;
  }>[];
}>;

export type LockValidator = {
  validate(): Promise<LockValidationSummary>;
};

export const EXPECTED_IOS_STATIC_CHECK_IDS = [
  'xcode-project',
  'application-target',
  'shared-scheme',
  'scheme-target-graph',
  'info-plist',
  'privacy-manifest',
  'react-native-pod',
  'react-native-entry',
] as const;

export type IosStaticCheckId =
  (typeof EXPECTED_IOS_STATIC_CHECK_IDS)[number];

export type IosStaticAuditResult = Readonly<{
  status: 'passed' | 'failed';
  scope: 'windows-static-only';
  detail: string;
  checks: readonly Readonly<{
    id: IosStaticCheckId;
    status: 'passed' | 'failed';
    detail: string;
  }>[];
}>;

export type IosStaticAuditor = {
  audit(): Promise<IosStaticAuditResult>;
};

export type QualityGateRuntime = Readonly<{
  nodeExecutable: string;
  pnpmExecutable: string;
  javaHome: string;
  androidSdkRoot: string;
  androidBuildToolsVersion: string;
  path: string;
}>;

export type CreateQualityGateOptions = Readonly<{
  projectRoot: string;
  reportDirectory: string;
  platform: 'win32';
  runtime: QualityGateRuntime;
  acceptedTestRoots: readonly string[];
  timeoutMs: number;
  runId: string;
  now(): string;
  signal?: AbortSignal;
  processRunner: ProcessRunner;
  lockValidator: LockValidator;
  iosAuditor: IosStaticAuditor;
  reportWriter: QualityGateReportWriter;
}>;

export type QualityGateOrchestrator = {
  plan(mode: QualityGateMode): readonly StagePlan[];
  run(mode: QualityGateMode): Promise<QualityGateReport>;
};

export type LockRegistryStatus = 'accepted' | 'candidate' | 'rejected';
export type LockOrdering = 'posix' | 'spec-first-posix';

export type ValidateLockManifestsOptions = Readonly<{
  projectRoot: string;
  registryPath: string;
}>;

export type ValidateQualityGateV2BootstrapOptions = Readonly<{
  projectRoot: string;
  expectedSelfSha256: string;
}>;

export type QualityGateV2BootstrapSummary = Readonly<{
  manifest: typeof EXPECTED_BOOTSTRAP_MANIFEST_PATH;
  validatedSelfSha256: string;
  entries: number;
  specPath: typeof EXPECTED_BOOTSTRAP_SPEC_PATH;
  inventoryRoots: readonly [
    typeof EXPECTED_BOOTSTRAP_SPEC_PATH,
    typeof EXPECTED_BOOTSTRAP_TEST_ROOT,
  ];
  testRoots: readonly [typeof EXPECTED_BOOTSTRAP_TEST_ROOT];
}>;

export type AuditIosProjectStaticOptions = Readonly<{
  projectRoot: string;
}>;

export type CreateAtomicReportWriterOptions = Readonly<{
  reportDirectory: string;
}>;

export type CreateNodeProcessRunnerOptions = Readonly<{
  baseEnvironment: Readonly<Record<string, string | undefined>>;
}>;

export type ParsedCliArguments = Readonly<{
  mode: QualityGateMode | 'validate-locks' | 'help';
  projectRoot: string;
  reportDirectory: string;
  timeoutMs: number;
  nodeExecutable: string;
  pnpmExecutable: string;
  javaHome: string;
  androidSdkRoot: string;
  androidBuildToolsVersion: string;
  registryPath: string;
}>;

export type CliTextSink = {
  write(value: string): void;
};

export type QualityGateCliDependencies = Readonly<{
  cwd: string;
  platform: 'win32';
  environment: Readonly<Record<string, string | undefined>>;
  bootstrapExpectedSelfSha256: string;
  signal?: AbortSignal;
  stdout: CliTextSink;
  stderr: CliTextSink;
  now(): string;
  runId: string;
  processRunner: ProcessRunner;
}>;

export type QualityGateProduction = {
  QUALITY_GATE_V2_BOOTSTRAP_MANIFEST: string;
  QUALITY_GATE_V2_BOOTSTRAP_SPEC: string;
  QUALITY_GATE_V2_BOOTSTRAP_TEST_ROOT: string;
  QUALITY_GATE_STAGE_ORDER: readonly string[];
  QUALITY_GATE_TEST_STAGE_ORDER: readonly string[];
  QUALITY_GATE_ENV_ALLOWLIST: readonly string[];
  QUALITY_GATE_REPORT_SCHEMA: string;
  QUALITY_GATE_REPORT_VERSION: number;
  createNodeProcessRunner(
    options: CreateNodeProcessRunnerOptions,
  ): ProcessRunner;
  createQualityGateOrchestrator(
    options: CreateQualityGateOptions,
  ): QualityGateOrchestrator;
  validateLockManifests(
    options: ValidateLockManifestsOptions,
  ): Promise<LockValidationSummary>;
  validateQualityGateV2Bootstrap(
    options: ValidateQualityGateV2BootstrapOptions,
  ): Promise<QualityGateV2BootstrapSummary>;
  discoverAcceptedTestRoots(
    options: ValidateLockManifestsOptions,
  ): Promise<readonly string[]>;
  createAtomicQualityGateReportWriter(
    options: CreateAtomicReportWriterOptions,
  ): QualityGateReportWriter;
  auditIosProjectStatic(
    options: AuditIosProjectStaticOptions,
  ): Promise<IosStaticAuditResult>;
  parseQualityGateCliArgs(
    argv: readonly string[],
    cwd: string,
  ): ParsedCliArguments;
  runQualityGateCli(
    argv: readonly string[],
    dependencies: QualityGateCliDependencies,
  ): Promise<number>;
};

type RuntimeModule = Record<string, unknown>;

const RUNTIME_KEYS = [
  'QUALITY_GATE_V2_BOOTSTRAP_MANIFEST',
  'QUALITY_GATE_V2_BOOTSTRAP_SPEC',
  'QUALITY_GATE_V2_BOOTSTRAP_TEST_ROOT',
  'QUALITY_GATE_ENV_ALLOWLIST',
  'QUALITY_GATE_REPORT_SCHEMA',
  'QUALITY_GATE_REPORT_VERSION',
  'QUALITY_GATE_STAGE_ORDER',
  'QUALITY_GATE_TEST_STAGE_ORDER',
  'auditIosProjectStatic',
  'createAtomicQualityGateReportWriter',
  'createNodeProcessRunner',
  'createQualityGateOrchestrator',
  'discoverAcceptedTestRoots',
  'parseQualityGateCliArgs',
  'runQualityGateCli',
  'validateLockManifests',
  'validateQualityGateV2Bootstrap',
] as const;

function requiredFunction(
  moduleValue: RuntimeModule,
  name: (typeof RUNTIME_KEYS)[number],
): Function {
  const value = moduleValue[name];
  if (typeof value !== 'function') {
    throw new Error('QUALITY_GATE_V2_IMPLEMENTATION_REQUIRED:' + name);
  }
  return value;
}

export function loadRawQualityGateModule(): RuntimeModule {
  try {
    return jest.requireActual<RuntimeModule>(
      '../../scripts/quality-gate-v2/index.cjs',
    );
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      'QUALITY_GATE_V2_IMPLEMENTATION_REQUIRED:index.cjs:' + detail,
    );
  }
}

export function loadQualityGateProduction(): QualityGateProduction {
  const moduleValue = loadRawQualityGateModule();
  const createNodeProcessRunner = requiredFunction(
    moduleValue,
    'createNodeProcessRunner',
  );
  const createQualityGateOrchestrator = requiredFunction(
    moduleValue,
    'createQualityGateOrchestrator',
  );
  const validateLockManifests = requiredFunction(
    moduleValue,
    'validateLockManifests',
  );
  const validateQualityGateV2Bootstrap = requiredFunction(
    moduleValue,
    'validateQualityGateV2Bootstrap',
  );
  const discoverAcceptedTestRoots = requiredFunction(
    moduleValue,
    'discoverAcceptedTestRoots',
  );
  const createAtomicQualityGateReportWriter = requiredFunction(
    moduleValue,
    'createAtomicQualityGateReportWriter',
  );
  const auditIosProjectStatic = requiredFunction(
    moduleValue,
    'auditIosProjectStatic',
  );
  const parseQualityGateCliArgs = requiredFunction(
    moduleValue,
    'parseQualityGateCliArgs',
  );
  const runQualityGateCli = requiredFunction(
    moduleValue,
    'runQualityGateCli',
  );

  return {
    QUALITY_GATE_V2_BOOTSTRAP_MANIFEST: requiredString(
      moduleValue,
      'QUALITY_GATE_V2_BOOTSTRAP_MANIFEST',
    ),
    QUALITY_GATE_V2_BOOTSTRAP_SPEC: requiredString(
      moduleValue,
      'QUALITY_GATE_V2_BOOTSTRAP_SPEC',
    ),
    QUALITY_GATE_V2_BOOTSTRAP_TEST_ROOT: requiredString(
      moduleValue,
      'QUALITY_GATE_V2_BOOTSTRAP_TEST_ROOT',
    ),
    QUALITY_GATE_STAGE_ORDER: requiredStringArray(
      moduleValue,
      'QUALITY_GATE_STAGE_ORDER',
    ),
    QUALITY_GATE_TEST_STAGE_ORDER: requiredStringArray(
      moduleValue,
      'QUALITY_GATE_TEST_STAGE_ORDER',
    ),
    QUALITY_GATE_ENV_ALLOWLIST: requiredStringArray(
      moduleValue,
      'QUALITY_GATE_ENV_ALLOWLIST',
    ),
    QUALITY_GATE_REPORT_SCHEMA: requiredString(
      moduleValue,
      'QUALITY_GATE_REPORT_SCHEMA',
    ),
    QUALITY_GATE_REPORT_VERSION: requiredNumber(
      moduleValue,
      'QUALITY_GATE_REPORT_VERSION',
    ),
    createNodeProcessRunner(options): ProcessRunner {
      return createNodeProcessRunner(options);
    },
    createQualityGateOrchestrator(options): QualityGateOrchestrator {
      return createQualityGateOrchestrator(options);
    },
    validateLockManifests(options): Promise<LockValidationSummary> {
      return validateLockManifests(options);
    },
    validateQualityGateV2Bootstrap(
      options,
    ): Promise<QualityGateV2BootstrapSummary> {
      return validateQualityGateV2Bootstrap(options);
    },
    discoverAcceptedTestRoots(options): Promise<readonly string[]> {
      return discoverAcceptedTestRoots(options);
    },
    createAtomicQualityGateReportWriter(
      options,
    ): QualityGateReportWriter {
      return createAtomicQualityGateReportWriter(options);
    },
    auditIosProjectStatic(options): Promise<IosStaticAuditResult> {
      return auditIosProjectStatic(options);
    },
    parseQualityGateCliArgs(argv, cwd): ParsedCliArguments {
      return parseQualityGateCliArgs(argv, cwd);
    },
    runQualityGateCli(argv, dependencies): Promise<number> {
      return runQualityGateCli(argv, dependencies);
    },
  };
}

export function expectedRuntimeKeys(): readonly string[] {
  return [...RUNTIME_KEYS].sort();
}

function requiredStringArray(
  moduleValue: RuntimeModule,
  name: string,
): readonly string[] {
  const value = moduleValue[name];
  if (
    !Array.isArray(value) ||
    value.some(entry => typeof entry !== 'string')
  ) {
    throw new Error('QUALITY_GATE_V2_IMPLEMENTATION_REQUIRED:' + name);
  }
  return [...value];
}

function requiredString(moduleValue: RuntimeModule, name: string): string {
  const value = moduleValue[name];
  if (typeof value !== 'string') {
    throw new Error('QUALITY_GATE_V2_IMPLEMENTATION_REQUIRED:' + name);
  }
  return value;
}

function requiredNumber(moduleValue: RuntimeModule, name: string): number {
  const value = moduleValue[name];
  if (typeof value !== 'number') {
    throw new Error('QUALITY_GATE_V2_IMPLEMENTATION_REQUIRED:' + name);
  }
  return value;
}

export function successResult(
  overrides: Partial<ProcessResult> = {},
): ProcessResult {
  return {
    exitCode: 0,
    signal: null,
    stdout: '',
    stderr: '',
    timedOut: false,
    timeoutSource: null,
    durationMs: 1,
    ...overrides,
  };
}

export function failedResult(
  exitCode = 1,
  stdout = 'stage stdout',
  stderr = 'stage stderr',
): ProcessResult {
  return successResult({exitCode, stdout, stderr});
}

export class RecordingRunner implements ProcessRunner {
  readonly calls: ProcessRequest[] = [];
  private readonly results: ProcessResult[];

  constructor(results: readonly ProcessResult[] = []) {
    this.results = [...results];
  }

  async run(request: ProcessRequest): Promise<ProcessResult> {
    this.calls.push({
      ...request,
      args: [...request.args],
      env: {...request.env},
    });
    const result = this.results.shift();
    return result ?? successResult();
  }
}

export class RecordingReportWriter implements QualityGateReportWriter {
  readonly reports: QualityGateReport[] = [];
  failure: Error | null = null;

  async write(report: QualityGateReport): Promise<ReportArtifacts> {
    this.reports.push(report);
    if (this.failure !== null) {
      throw this.failure;
    }
    return {
      jsonPath: 'C:\\reports\\quality-gate-report.json',
      summaryPath: 'C:\\reports\\quality-gate-summary.txt',
    };
  }
}

export class PassingLockValidator implements LockValidator {
  calls = 0;
  failure: Error | null = null;

  async validate(): Promise<LockValidationSummary> {
    this.calls += 1;
    if (this.failure !== null) {
      throw this.failure;
    }
    return {
      validatedManifests: 2,
      entries: 4,
      acceptedTestRoots: ['tests/accepted-a', 'tests/accepted-b'],
      acceptedManifests: ['ALPHA_LOCK.sha256', 'BETA_LOCK.sha256'],
      excludedManifests: [],
    };
  }
}

export class PassingIosAuditor implements IosStaticAuditor {
  calls = 0;
  result: IosStaticAuditResult = {
    status: 'passed',
    scope: 'windows-static-only',
    detail: 'Static iOS audit only; no Windows build claimed.',
    checks: EXPECTED_IOS_STATIC_CHECK_IDS.map(id => ({
      id,
      status: 'passed',
      detail: 'Passed static check: ' + id,
    })),
  };

  async audit(): Promise<IosStaticAuditResult> {
    this.calls += 1;
    return this.result;
  }
}

export type QualityGateHarness = Readonly<{
  options: CreateQualityGateOptions;
  runner: RecordingRunner;
  reportWriter: RecordingReportWriter;
  lockValidator: PassingLockValidator;
  iosAuditor: PassingIosAuditor;
}>;

export function createQualityGateHarness(
  results: readonly ProcessResult[] = [],
  projectRoot = 'C:\\workspace\\start-five',
): QualityGateHarness {
  const runner = new RecordingRunner(results);
  const reportWriter = new RecordingReportWriter();
  const lockValidator = new PassingLockValidator();
  const iosAuditor = new PassingIosAuditor();
  return {
    runner,
    reportWriter,
    lockValidator,
    iosAuditor,
    options: {
      projectRoot,
      reportDirectory: path.win32.join(projectRoot, 'quality-reports'),
      platform: 'win32',
      runtime: {
        nodeExecutable: 'C:\\runtime\\node.exe',
        pnpmExecutable: 'C:\\runtime\\pnpm.cmd',
        javaHome: 'C:\\runtime\\jdk-17',
        androidSdkRoot: 'C:\\runtime\\android-sdk',
        androidBuildToolsVersion: '36.0.0',
        path: 'C:\\runtime;C:\\Windows\\System32',
      },
      acceptedTestRoots: ['tests/accepted-a', 'tests/accepted-b'],
      timeoutMs: 120_000,
      runId: 'quality-run-001',
      now(): string {
        return '2026-08-05T12:00:00.000Z';
      },
      processRunner: runner,
      lockValidator,
      iosAuditor,
      reportWriter,
    },
  };
}

const temporaryDirectories: string[] = [];

export function createTempDirectory(): string {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'start-five-quality-v2-'),
  );
  temporaryDirectories.push(directory);
  return directory;
}

export function cleanupTempDirectories(): void {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory !== undefined && directory.startsWith(os.tmpdir())) {
      fs.rmSync(directory, {recursive: true, force: true});
    }
  }
}

export function writeText(
  root: string,
  relativePath: string,
  content: string,
): string {
  const absolutePath = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(absolutePath), {recursive: true});
  fs.writeFileSync(absolutePath, content, 'utf8');
  return absolutePath;
}

export type SyntheticBootstrapFixture = Readonly<{
  manifestPath: string;
  manifestText: string;
  specPath: string;
  testPath: string;
  expectedSelfSha256: string;
}>;

export function installSyntheticBootstrap(
  root: string,
): SyntheticBootstrapFixture {
  const specPath = writeText(
    root,
    EXPECTED_BOOTSTRAP_SPEC_PATH,
    SYNTHETIC_BOOTSTRAP_SPEC,
  );
  const testPath = writeText(
    root,
    SYNTHETIC_BOOTSTRAP_TEST_PATH,
    SYNTHETIC_BOOTSTRAP_TEST,
  );
  const manifestPath = writeText(
    root,
    EXPECTED_BOOTSTRAP_MANIFEST_PATH,
    SYNTHETIC_BOOTSTRAP_MANIFEST,
  );
  return {
    manifestPath,
    manifestText: SYNTHETIC_BOOTSTRAP_MANIFEST,
    specPath,
    testPath,
    expectedSelfSha256: SYNTHETIC_BOOTSTRAP_EXPECTED_SELF_SHA256,
  };
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

export function projectRoot(): string {
  return path.resolve(__dirname, '..', '..');
}

export function fixturePath(): string {
  return path.join(__dirname, 'fixtures', 'childProcessFixture.cjs');
}

export type RealChildResult = Readonly<{
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
}>;

export type RunRealChildOptions = Readonly<{
  executable: string;
  args: readonly string[];
  cwd: string;
  environment: Readonly<Record<string, string | undefined>>;
  watchdogMs: number;
}>;

export function runRealChild(
  options: RunRealChildOptions,
): Promise<RealChildResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.executable, options.args, {
      cwd: options.cwd,
      env: options.environment,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const watchdog = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill('SIGTERM');
      reject(new Error('QUALITY_GATE_V2_CHILD_WATCHDOG'));
    }, options.watchdogMs);

    child.stdout.on('data', chunk => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', error => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(watchdog);
      reject(error);
    });
    child.on('close', (exitCode, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(watchdog);
      resolve({exitCode, signal, stdout, stderr});
    });
  });
}

export async function expectRejectCode(
  promise: Promise<unknown>,
  code: string,
): Promise<unknown> {
  try {
    await promise;
  } catch (error: unknown) {
    expect(error).toMatchObject({code});
    return error;
  }
  throw new Error('QUALITY_GATE_V2_EXPECTED_REJECTION:' + code);
}

export function errorCause(error: unknown): unknown {
  if (typeof error !== 'object' || error === null || !('cause' in error)) {
    throw new Error('QUALITY_GATE_V2_ERROR_CAUSE_REQUIRED');
  }
  return error.cause;
}

export function readJsonRecord(filePath: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!isJsonRecord(parsed)) {
    throw new Error('QUALITY_GATE_V2_JSON_OBJECT_REQUIRED');
  }
  return parsed;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
