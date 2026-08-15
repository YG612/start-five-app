export type QualityGateMode = 'test' | 'full';
export type QualityGateStageId =
  | 'formal-tests'
  | 'typecheck'
  | 'android-lint'
  | 'android-unit-tests'
  | 'android-assemble'
  | 'android-signature'
  | 'android-zipalign'
  | 'android-package-manifest'
  | 'lock-manifests'
  | 'ios-static-audit';
export type TimeoutSource = 'deadline' | 'signal' | null;

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
  timeoutSource: TimeoutSource;
  durationMs: number;
}>;

export type ProcessRunner = Readonly<{
  run(request: ProcessRequest): Promise<ProcessResult>;
}>;

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

export type QualityGateFailure = Readonly<{
  stageId: QualityGateStageId;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  timeoutSource: TimeoutSource;
  stdout: string;
  stderr: string;
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
  failure: QualityGateFailure | null;
}>;

export type ReportArtifacts = Readonly<{
  jsonPath: string;
  summaryPath: string;
}>;

export type QualityGateReportWriter = Readonly<{
  write(report: QualityGateReport): Promise<ReportArtifacts>;
}>;

export type LockRegistryStatus = 'accepted' | 'candidate' | 'rejected';
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

export type LockValidator = Readonly<{
  validate(): Promise<LockValidationSummary>;
}>;

export type IosStaticCheckId =
  | 'xcode-project'
  | 'application-target'
  | 'shared-scheme'
  | 'scheme-target-graph'
  | 'info-plist'
  | 'privacy-manifest'
  | 'react-native-pod'
  | 'react-native-entry';

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

export type IosStaticAuditor = Readonly<{
  audit(): Promise<IosStaticAuditResult>;
}>;

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

export type QualityGateOrchestrator = Readonly<{
  plan(mode: QualityGateMode): readonly StagePlan[];
  run(mode: QualityGateMode): Promise<QualityGateReport>;
}>;

export type QualityGateV2BootstrapSummary = Readonly<{
  manifest: typeof QUALITY_GATE_V2_BOOTSTRAP_MANIFEST;
  validatedSelfSha256: string;
  entries: number;
  specPath: typeof QUALITY_GATE_V2_BOOTSTRAP_SPEC;
  inventoryRoots: readonly [
    typeof QUALITY_GATE_V2_BOOTSTRAP_SPEC,
    typeof QUALITY_GATE_V2_BOOTSTRAP_TEST_ROOT,
  ];
  testRoots: readonly [typeof QUALITY_GATE_V2_BOOTSTRAP_TEST_ROOT];
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

export type CliTextSink = Readonly<{
  write(value: string): void;
}>;

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

export declare const QUALITY_GATE_ENV_ALLOWLIST: readonly [
  'ANDROID_HOME', 'ANDROID_SDK_ROOT', 'CI', 'ComSpec', 'JAVA_HOME',
  'NODE_OPTIONS', 'PATH', 'PATHEXT', 'SystemRoot', 'TEMP', 'TMP',
];
export declare const QUALITY_GATE_REPORT_SCHEMA: 'start-five.quality-gate-report';
export declare const QUALITY_GATE_REPORT_VERSION: 1;
export declare const QUALITY_GATE_STAGE_ORDER: readonly QualityGateStageId[];
export declare const QUALITY_GATE_TEST_STAGE_ORDER: readonly ['formal-tests', 'lock-manifests'];
export declare const QUALITY_GATE_V2_BOOTSTRAP_MANIFEST: 'QUALITY_GATE_V2_LOCK.sha256';
export declare const QUALITY_GATE_V2_BOOTSTRAP_SPEC: 'QUALITY_GATE_V2_TEST_SPEC.md';
export declare const QUALITY_GATE_V2_BOOTSTRAP_TEST_ROOT: 'tests/quality-gate-v2';

export declare function createNodeProcessRunner(options: Readonly<{
  baseEnvironment: Readonly<Record<string, string | undefined>>;
}>): ProcessRunner;
export declare function createQualityGateOrchestrator(
  options: CreateQualityGateOptions,
): QualityGateOrchestrator;
export declare function validateLockManifests(options: Readonly<{
  projectRoot: string;
  registryPath: string;
}>): Promise<LockValidationSummary>;
export declare function validateQualityGateV2Bootstrap(options: Readonly<{
  projectRoot: string;
  expectedSelfSha256: string;
}>): Promise<QualityGateV2BootstrapSummary>;
export declare function discoverAcceptedTestRoots(options: Readonly<{
  projectRoot: string;
  registryPath: string;
}>): Promise<readonly string[]>;
export declare function createAtomicQualityGateReportWriter(options: Readonly<{
  reportDirectory: string;
}>): QualityGateReportWriter;
export declare function auditIosProjectStatic(options: Readonly<{
  projectRoot: string;
}>): Promise<IosStaticAuditResult>;
export declare function parseQualityGateCliArgs(
  argv: readonly string[],
  cwd: string,
): ParsedCliArguments;
export declare function runQualityGateCli(
  argv: readonly string[],
  dependencies: QualityGateCliDependencies,
): Promise<number>;
