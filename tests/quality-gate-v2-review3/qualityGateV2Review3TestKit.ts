import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const PNPM_LAUNCH_UNSAFE_CODE =
  'QUALITY_GATE_PNPM_LAUNCH_UNSAFE' as const;
export const PNPM_LAUNCH_AMBIGUOUS_CODE =
  'QUALITY_GATE_PNPM_LAUNCH_AMBIGUOUS' as const;
export const PLATFORM_UNSUPPORTED_CODE =
  'QUALITY_GATE_PLATFORM_UNSUPPORTED' as const;

export const SHELL_SENSITIVE_TEST_ROOT =
  'tests/review3-root&mkdir qgv2-review3-shell-marker' as const;
export const EXACT_PNPM_ARGS = Object.freeze([
  'exec',
  'jest',
  '--runInBand',
  '--testNamePattern',
  'spaces stay together & no shell',
  '--label=quote"inside',
  '',
]);

const BOOTSTRAP_MANIFEST = 'QUALITY_GATE_V2_LOCK.sha256';
const BOOTSTRAP_SPEC = 'QUALITY_GATE_V2_TEST_SPEC.md';
const BOOTSTRAP_TEST_ROOT = 'tests/quality-gate-v2';
const BOOTSTRAP_TEST =
  'tests/quality-gate-v2/bootstrap.contract.test.ts';
const FAST_MANIFEST = 'REVIEW3_FAST_LOCK.sha256';
const FAST_SPEC = 'REVIEW3_FAST_TEST_SPEC.md';
const FAST_TEST = `${SHELL_SENSITIVE_TEST_ROOT}/fast.contract.test.ts`;

const CMD_MARKER = 'review3-cmd-lure-marker.txt';
const SHELL_MARKER = 'qgv2-review3-shell-marker';
const RECORDER = 'review3-companion-recorder.json';
const PID = 'review3-companion-pid.txt';
const REPORT_DIRECTORY = 'review3-quality-reports';
const WINDOWS_PATH_DELIMITER = ';';

const tempDirectories: string[] = [];
const reparseLinks: string[] = [];

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

type ProductionModule = Readonly<{
  createNodeProcessRunner(options: Readonly<{
    baseEnvironment: Readonly<Record<string, string | undefined>>;
    platform?: string;
    nodeExecutable?: string;
  }>): ProcessRunner;
  createQualityGateOrchestrator(options: unknown): {
    plan(mode: 'test' | 'full'): readonly Readonly<{
      id: string;
      kind: string;
      request: ProcessRequest | null;
    }>[];
  };
  parseQualityGateCliArgs(
    argv: readonly string[],
    cwd: string,
    environment?: Readonly<Record<string, string | undefined>>,
  ): Readonly<{
    pnpmExecutable: string;
    projectRoot: string;
  }>;
}>;

type TextSink = {write(value: string): void};

type CliOverrides = Readonly<{
  cwd: string;
  platform: string;
  environment: Readonly<Record<string, string | undefined>>;
  bootstrapExpectedSelfSha256: string;
  stdout: TextSink;
  stderr: TextSink;
  now: () => string;
  runId: string;
  processRunner?: ProcessRunner;
}>;

type ProductionCli = Readonly<{
  runCliProcess(
    argv: readonly string[],
    overrides: CliOverrides,
  ): Promise<number>;
}>;

export type ToolFixture = Readonly<{
  root: string;
  toolDirectory: string;
  pathValue: string;
  cmdMarkerPath: string;
  shellMarkerPath: string;
  recorderPath: string;
  pidPath: string;
  reportDirectory: string;
}>;

export type SyntheticCliFixture = ToolFixture & Readonly<{
  registryPath: string;
  expectedSelfSha256: string;
  reportPath: string;
  summaryPath: string;
  defaultArgv: readonly string[];
}>;

export type CompanionRecord = Readonly<{
  runtime: 'cjs' | 'mjs';
  argv: readonly string[];
  cwd: string;
  execPath: string;
  environment: Readonly<Record<string, unknown>>;
}>;

export type BundledPnpmLayout = Readonly<{
  toolDirectory: string;
  commandWrapper: string;
  nodeExecutable: string;
  companion: string;
  runtimeRoot: string;
}>;

type SpawnSyncResult = Readonly<{
  status: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  error?: Error;
}>;

type ChildProcessRuntime = Readonly<{
  spawnSync(
    executable: string,
    args: readonly string[],
    options: Readonly<{
      cwd: string;
      env: Readonly<Record<string, string>>;
      shell: false;
      windowsHide: true;
      encoding: 'utf8';
      timeout: number;
    }>,
  ): SpawnSyncResult;
}>;

export class TextBuffer implements TextSink {
  value = '';

  write(value: string): void {
    this.value += value;
  }
}

export class RecordingRunner implements ProcessRunner {
  readonly requests: ProcessRequest[] = [];

  async run(request: ProcessRequest): Promise<ProcessResult> {
    this.requests.push(request);
    return {
      exitCode: 0,
      signal: null,
      stdout: 'REVIEW3_RECORDING_RUNNER_OK',
      stderr: '',
      timedOut: false,
      timeoutSource: null,
      durationMs: 1,
    };
  }
}

function sha256Text(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function manifest(entries: readonly Readonly<{
  relativePath: string;
  content: string;
}>[]): string {
  return entries
    .map(entry =>
      `${sha256Text(entry.content)}  ${entry.relativePath}\n`,
    )
    .join('');
}

export function projectRoot(): string {
  return path.resolve(__dirname, '..', '..');
}

export function fixturePath(
  name: 'pnpmCompanion.cjs' | 'pnpmCompanion.mjs',
): string {
  return path.join(__dirname, 'fixtures', name);
}

export function createTempDirectory(): string {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'start-five qgv2-review3 & '),
  );
  tempDirectories.push(root);
  return root;
}

export function cleanupTempDirectories(): void {
  while (reparseLinks.length > 0) {
    const link = reparseLinks.pop();
    if (link !== undefined && fs.existsSync(link)) {
      fs.unlinkSync(link);
    }
  }
  while (tempDirectories.length > 0) {
    const directory = tempDirectories.pop();
    if (directory !== undefined) {
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

function lureText(externalCompanion: string | null = null): string {
  const traversal = externalCompanion === null
    ? ''
    : `"${process.execPath}" "${externalCompanion}" %*\r\n`;
  return [
    '@echo off',
    `> "%CD%\\${CMD_MARKER}" echo REVIEW3_CMD_LURE_EXECUTED`,
    traversal.trimEnd(),
    'exit /b 91',
    '',
  ].filter((line, index) => line.length > 0 || index === 4).join('\r\n');
}

function baseFixture(root: string, toolDirectory: string): ToolFixture {
  return {
    root,
    toolDirectory,
    pathValue: toolDirectory,
    cmdMarkerPath: path.join(root, CMD_MARKER),
    shellMarkerPath: path.join(root, SHELL_MARKER),
    recorderPath: path.join(root, RECORDER),
    pidPath: path.join(root, PID),
    reportDirectory: path.join(root, REPORT_DIRECTORY),
  };
}

export function seedToolDirectory(
  root: string,
  toolDirectory: string,
  mode: 'none' | 'cjs' | 'mjs' | 'both' | 'directory-cjs',
  externalCompanion: string | null = null,
): ToolFixture {
  fs.mkdirSync(toolDirectory, {recursive: true});
  fs.writeFileSync(
    path.join(toolDirectory, 'pnpm.cmd'),
    lureText(externalCompanion),
    'utf8',
  );
  if (mode === 'cjs' || mode === 'both') {
    fs.copyFileSync(
      fixturePath('pnpmCompanion.cjs'),
      path.join(toolDirectory, 'pnpm.cjs'),
    );
  }
  if (mode === 'mjs' || mode === 'both' || mode === 'directory-cjs') {
    fs.copyFileSync(
      fixturePath('pnpmCompanion.mjs'),
      path.join(toolDirectory, 'pnpm.mjs'),
    );
  }
  if (mode === 'directory-cjs') {
    fs.mkdirSync(path.join(toolDirectory, 'pnpm.cjs'), {recursive: true});
  }
  return baseFixture(root, toolDirectory);
}

export function installToolFixture(
  mode: 'none' | 'cjs' | 'mjs' | 'both' | 'directory-cjs',
): ToolFixture {
  const root = createTempDirectory();
  return seedToolDirectory(
    root,
    path.join(root, 'tool bin & review3'),
    mode,
  );
}

export function installTraversalFixture(): ToolFixture {
  const root = createTempDirectory();
  const outsideDirectory = path.join(root, 'outside trusted tool');
  fs.mkdirSync(outsideDirectory, {recursive: true});
  const externalCompanion = path.join(outsideDirectory, 'pnpm.cjs');
  fs.copyFileSync(fixturePath('pnpmCompanion.cjs'), externalCompanion);
  return seedToolDirectory(
    root,
    path.join(root, 'tool bin & review3'),
    'none',
    externalCompanion,
  );
}

export function installReparseToolFixture(): ToolFixture {
  const root = createTempDirectory();
  const physicalDirectory = path.join(root, 'physical tool directory');
  seedToolDirectory(root, physicalDirectory, 'cjs');
  const linkDirectory = path.join(root, 'junction tool & review3');
  fs.symlinkSync(physicalDirectory, linkDirectory, 'junction');
  reparseLinks.push(linkDirectory);
  return baseFixture(root, linkDirectory);
}

export function installDuplicateToolFixture(): Readonly<{
  fixture: ToolFixture;
  firstDirectory: string;
  secondDirectory: string;
}> {
  const root = createTempDirectory();
  const firstDirectory = path.join(root, 'tool A & review3');
  const secondDirectory = path.join(root, 'tool B & review3');
  seedToolDirectory(root, firstDirectory, 'cjs');
  seedToolDirectory(root, secondDirectory, 'cjs');
  return {
    fixture: {
      ...baseFixture(root, firstDirectory),
      pathValue: `${firstDirectory}${WINDOWS_PATH_DELIMITER}${secondDirectory}`,
    },
    firstDirectory,
    secondDirectory,
  };
}

export function installSyntheticCliFixture(
  mode: 'none' | 'cjs' | 'mjs' | 'both',
): SyntheticCliFixture {
  const root = createTempDirectory();
  const bootstrapSpecContent = '# synthetic QUALITY-GATE-V2 spec\n';
  const bootstrapTestContent = 'export const bootstrap = true;\n';
  const bootstrapManifestContent = manifest([
    {relativePath: BOOTSTRAP_SPEC, content: bootstrapSpecContent},
    {relativePath: BOOTSTRAP_TEST, content: bootstrapTestContent},
  ]);
  const expectedSelfSha256 = sha256Text(bootstrapManifestContent);
  const fastSpecContent = '# synthetic shell-sensitive accepted root\n';
  const fastTestContent = 'export const fast = true;\n';
  const fastManifestContent = manifest([
    {relativePath: FAST_SPEC, content: fastSpecContent},
    {relativePath: FAST_TEST, content: fastTestContent},
  ]);
  const fastSelfSha256 = sha256Text(fastManifestContent);

  writeText(root, BOOTSTRAP_SPEC, bootstrapSpecContent);
  writeText(root, BOOTSTRAP_TEST, bootstrapTestContent);
  writeText(root, BOOTSTRAP_MANIFEST, bootstrapManifestContent);
  writeText(root, FAST_SPEC, fastSpecContent);
  writeText(root, FAST_TEST, fastTestContent);
  writeText(root, FAST_MANIFEST, fastManifestContent);

  const registryPath = writeText(
    root,
    'quality-gate.acceptance.json',
    JSON.stringify({
      schema: 'start-five.quality-lock-registry',
      version: 1,
      locks: [
        {
          manifest: BOOTSTRAP_MANIFEST,
          status: 'accepted',
          ordering: 'spec-first-posix',
          specPath: BOOTSTRAP_SPEC,
          inventoryRoots: [BOOTSTRAP_SPEC, BOOTSTRAP_TEST_ROOT],
          testRoots: [BOOTSTRAP_TEST_ROOT],
          expectedSelfSha256,
        },
        {
          manifest: FAST_MANIFEST,
          status: 'accepted',
          ordering: 'spec-first-posix',
          specPath: FAST_SPEC,
          inventoryRoots: [FAST_SPEC, SHELL_SENSITIVE_TEST_ROOT],
          testRoots: [SHELL_SENSITIVE_TEST_ROOT],
          expectedSelfSha256: fastSelfSha256,
        },
      ],
    }),
  );
  const seeded = seedToolDirectory(
    root,
    path.join(root, 'tool bin & review3'),
    mode,
  );
  const reportDirectory = path.join(root, REPORT_DIRECTORY);
  return {
    ...seeded,
    registryPath,
    expectedSelfSha256,
    reportDirectory,
    reportPath: path.join(reportDirectory, 'quality-gate-report.json'),
    summaryPath: path.join(reportDirectory, 'quality-gate-summary.txt'),
    defaultArgv: [
      'test',
      '--project-root',
      root,
      '--report-dir',
      reportDirectory,
      '--timeout-ms',
      '20000',
      '--node',
      process.execPath,
      '--java-home',
      'C:\\review3 jdk & literal',
      '--android-sdk',
      'C:\\review3 android sdk & literal',
      '--build-tools',
      '36.0.0',
      '--registry',
      registryPath,
    ],
  };
}

export function loadProduction(): ProductionModule {
  return jest.requireActual<ProductionModule>(
    path.join(projectRoot(), 'scripts', 'quality-gate-v2', 'index.cjs'),
  );
}

export function loadProductionCli(): ProductionCli {
  return jest.requireActual<ProductionCli>(
    path.join(projectRoot(), 'scripts', 'quality-gate-v2', 'cli.cjs'),
  );
}

export function windowsBaseEnvironment(
  fixture: ToolFixture,
  pathValue = fixture.pathValue,
): Readonly<Record<string, string | undefined>> {
  return {
    PATH: pathValue,
    PATHEXT: process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD',
    ComSpec: process.env.ComSpec ?? 'C:\\Windows\\System32\\cmd.exe',
    SystemRoot: process.env.SystemRoot ?? 'C:\\Windows',
    TEMP: fixture.root,
    TMP: fixture.root,
    NODE_OPTIONS: '--no-warnings',
    QUALITY_GATE_FORBIDDEN_SECRET: 'must-not-reach-review3-child',
  };
}

export function expectedChildEnvironment(
  fixture: ToolFixture,
  pathValue = fixture.pathValue,
): Readonly<Record<string, string>> {
  return {
    ANDROID_HOME: 'C:\\review3\\android-sdk',
    ANDROID_SDK_ROOT: 'C:\\review3\\android-sdk',
    CI: '1',
    ComSpec: process.env.ComSpec ?? 'C:\\Windows\\System32\\cmd.exe',
    JAVA_HOME: 'C:\\review3\\jdk-17',
    NODE_OPTIONS: '--no-warnings',
    PATH: pathValue,
    PATHEXT: process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD',
    SystemRoot: process.env.SystemRoot ?? 'C:\\Windows',
    TEMP: fixture.root,
    TMP: fixture.root,
  };
}

export function expectedCliChildEnvironment(
  fixture: ToolFixture,
): Readonly<Record<string, string>> {
  return {
    ...expectedChildEnvironment(fixture),
    ANDROID_HOME: 'C:\\review3 android sdk & literal',
    ANDROID_SDK_ROOT: 'C:\\review3 android sdk & literal',
    JAVA_HOME: 'C:\\review3 jdk & literal',
  };
}

export function expectedRecordedEnvironment(
  fixture: ToolFixture,
  pathValue = fixture.pathValue,
): Readonly<Record<string, unknown>> {
  return {
    ...expectedChildEnvironment(fixture, pathValue),
    forbiddenSecret: null,
    pathKeys: ['PATH'],
  };
}

export function expectedCliRecordedEnvironment(
  fixture: ToolFixture,
): Readonly<Record<string, unknown>> {
  return {
    ...expectedCliChildEnvironment(fixture),
    forbiddenSecret: null,
    pathKeys: ['PATH'],
  };
}

export function createWindowsRunner(
  fixture: ToolFixture,
  pathValue = fixture.pathValue,
): ProcessRunner {
  return loadProduction().createNodeProcessRunner({
    baseEnvironment: windowsBaseEnvironment(fixture, pathValue),
    platform: 'win32',
    nodeExecutable: process.execPath,
  });
}

export function directPnpmRequest(
  fixture: ToolFixture,
  executable = 'pnpm',
  args: readonly string[] = EXACT_PNPM_ARGS,
  pathValue = fixture.pathValue,
): ProcessRequest {
  return Object.freeze({
    executable,
    args: Object.freeze([...args]),
    cwd: fixture.root,
    env: Object.freeze({
      ANDROID_HOME: 'C:\\review3\\android-sdk',
      ANDROID_SDK_ROOT: 'C:\\review3\\android-sdk',
      CI: '1',
      JAVA_HOME: 'C:\\review3\\jdk-17',
      PATH: pathValue,
    }),
    timeoutMs: 20_000,
  });
}

export function cliOverrides(
  fixture: SyntheticCliFixture,
  processRunner?: ProcessRunner,
  platform = 'win32',
): Readonly<{
  overrides: CliOverrides;
  stdout: TextBuffer;
  stderr: TextBuffer;
}> {
  const stdout = new TextBuffer();
  const stderr = new TextBuffer();
  const common = {
    cwd: fixture.root,
    platform,
    environment: windowsBaseEnvironment(fixture),
    bootstrapExpectedSelfSha256: fixture.expectedSelfSha256,
    stdout,
    stderr,
    now: () => '2026-08-06T00:00:00.000Z',
    runId: 'quality-gate-v2-review3-run',
  };
  return {
    stdout,
    stderr,
    overrides: processRunner === undefined
      ? common
      : {...common, processRunner},
  };
}

export function expectedFormalArgs(): readonly string[] {
  return [
    'exec',
    'jest',
    '--runInBand',
    '--ci',
    '--coverage=false',
    '--roots',
    BOOTSTRAP_TEST_ROOT,
    SHELL_SENSITIVE_TEST_ROOT,
  ];
}

export function readCompanionRecord(fixture: ToolFixture): CompanionRecord {
  const parsed: unknown = JSON.parse(
    fs.readFileSync(fixture.recorderPath, 'utf8'),
  );
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('QUALITY_GATE_V2_REVIEW3_RECORD_INVALID');
  }
  return parsed as CompanionRecord;
}

export function expectSuccessfulCompanion(
  fixture: ToolFixture,
  result: ProcessResult,
  runtime: 'cjs' | 'mjs',
  expectedArgs: readonly string[] = EXACT_PNPM_ARGS,
  expectedEnvironment = expectedRecordedEnvironment(fixture),
): void {
  expect(result).toMatchObject({
    exitCode: 0,
    signal: null,
    timedOut: false,
    timeoutSource: null,
    stderr: '',
  });
  expect(result.stdout).toBe(
    runtime === 'cjs'
      ? 'REVIEW3_CJS_COMPANION_OK'
      : 'REVIEW3_MJS_COMPANION_OK',
  );
  expect(readCompanionRecord(fixture)).toEqual({
    runtime,
    argv: expectedArgs,
    cwd: fixture.root,
    execPath: process.execPath,
    environment: expectedEnvironment,
  });
  expect(fs.readFileSync(fixture.pidPath, 'utf8')).toMatch(/^[1-9][0-9]*$/);
  expect(fs.existsSync(fixture.cmdMarkerPath)).toBe(false);
  expect(fs.existsSync(fixture.shellMarkerPath)).toBe(false);
}

export function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const value = Reflect.get(error, 'code');
  return typeof value === 'string' ? value : null;
}

function treeEntries(root: string, current: string, output: string[]): void {
  for (const name of fs.readdirSync(current).sort()) {
    const absolutePath = path.join(current, name);
    const relativePath = path.relative(root, absolutePath).replaceAll('\\', '/');
    const stat = fs.lstatSync(absolutePath);
    if (stat.isSymbolicLink()) {
      output.push(`link:${relativePath}:${fs.readlinkSync(absolutePath)}`);
    } else if (stat.isDirectory()) {
      output.push(`dir:${relativePath}`);
      treeEntries(root, absolutePath, output);
    } else if (stat.isFile()) {
      output.push(
        `file:${relativePath}:${sha256Text(fs.readFileSync(absolutePath, 'utf8'))}`,
      );
    } else {
      output.push(`other:${relativePath}`);
    }
  }
}

export function snapshotTree(root: string): readonly string[] {
  const output: string[] = [];
  treeEntries(root, root, output);
  return output;
}

export function expectNoExecutionArtifacts(
  fixture: ToolFixture,
  before: readonly string[],
): void {
  expect(fs.existsSync(fixture.cmdMarkerPath)).toBe(false);
  expect(fs.existsSync(fixture.shellMarkerPath)).toBe(false);
  expect(fs.existsSync(fixture.recorderPath)).toBe(false);
  expect(fs.existsSync(fixture.pidPath)).toBe(false);
  expect(fs.existsSync(fixture.reportDirectory)).toBe(false);
  expect(snapshotTree(fixture.root)).toEqual(before);
}

export function invokeFixtureDirectly(
  fixture: ToolFixture,
  runtime: 'cjs' | 'mjs',
): Readonly<{
  status: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
}> {
  const environment = expectedChildEnvironment(fixture);
  const childProcess = jest.requireActual<ChildProcessRuntime>(
    'node:child_process',
  );
  const result = childProcess.spawnSync(
    process.execPath,
    [fixturePath(runtime === 'cjs' ? 'pnpmCompanion.cjs' : 'pnpmCompanion.mjs'), ...EXACT_PNPM_ARGS],
    {
      cwd: fixture.root,
      env: environment,
      shell: false,
      windowsHide: true,
      encoding: 'utf8',
      timeout: 20_000,
    },
  );
  if (result.error !== undefined) throw result.error;
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function regularFile(filePath: string): boolean {
  try {
    const stat = fs.lstatSync(filePath);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function within(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative.length > 0 &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative);
}

export function discoverCurrentBundledPnpmLayout(): BundledPnpmLayout {
  const pathValue = process.env.PATH;
  if (typeof pathValue !== 'string' || pathValue.length === 0) {
    throw new Error('QUALITY_GATE_V2_REVIEW3_BUNDLED_PATH_REQUIRED');
  }
  for (const rawEntry of pathValue.split(WINDOWS_PATH_DELIMITER)) {
    const toolDirectory = rawEntry.trim();
    if (toolDirectory.length === 0) continue;
    const commandWrapper = path.join(toolDirectory, 'pnpm.cmd');
    if (!regularFile(commandWrapper)) continue;
    const roots = [
      toolDirectory,
      path.resolve(toolDirectory, '..'),
      path.resolve(toolDirectory, '..', '..'),
    ];
    for (const runtimeRoot of roots) {
      const nodeCandidates = [
        path.join(runtimeRoot, 'node', 'bin', 'node.exe'),
        path.join(runtimeRoot, 'bin', 'node.exe'),
      ];
      const companionCandidates = [
        path.join(toolDirectory, 'pnpm.cjs'),
        path.join(toolDirectory, 'pnpm.mjs'),
        path.join(runtimeRoot, 'node', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
        path.join(runtimeRoot, 'node', 'node_modules', 'pnpm', 'bin', 'pnpm.mjs'),
        path.join(runtimeRoot, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
        path.join(runtimeRoot, 'node_modules', 'pnpm', 'bin', 'pnpm.mjs'),
      ];
      const nodeExecutable = nodeCandidates.find(regularFile);
      const companion = companionCandidates.find(regularFile);
      if (
        nodeExecutable !== undefined &&
        companion !== undefined &&
        within(runtimeRoot, nodeExecutable) &&
        within(runtimeRoot, companion)
      ) {
        return {
          toolDirectory,
          commandWrapper,
          nodeExecutable,
          companion,
          runtimeRoot,
        };
      }
    }
  }
  throw new Error('QUALITY_GATE_V2_REVIEW3_BUNDLED_LAYOUT_NOT_FOUND');
}

export function windowsIdentity(value: string): string {
  return value.replaceAll('/', '\\').toLowerCase();
}

export function createRegularPnpmExeFixture(): Readonly<{
  fixture: ToolFixture;
  executable: string;
}> {
  const fixture = installToolFixture('none');
  const executable = path.join(fixture.toolDirectory, 'pnpm.exe');
  fs.linkSync(process.execPath, executable);
  return {fixture, executable};
}

export function explicitCliArgv(
  fixture: SyntheticCliFixture,
  explicitPnpm: string,
): readonly string[] {
  return [...fixture.defaultArgv, '--pnpm', explicitPnpm];
}

export function orchestratorOptions(
  fixture: ToolFixture,
  pnpmExecutable: string,
  runner: ProcessRunner,
): unknown {
  return {
    projectRoot: fixture.root,
    reportDirectory: fixture.reportDirectory,
    platform: 'win32',
    runtime: {
      nodeExecutable: process.execPath,
      pnpmExecutable,
      javaHome: 'C:\\review3\\jdk-17',
      androidSdkRoot: 'C:\\review3\\android-sdk',
      androidBuildToolsVersion: '36.0.0',
      path: fixture.pathValue,
    },
    acceptedTestRoots: [BOOTSTRAP_TEST_ROOT],
    timeoutMs: 20_000,
    runId: 'review3-plan-control',
    now: () => '2026-08-06T00:00:00.000Z',
    processRunner: runner,
    lockValidator: {validate: async () => ({})},
    iosAuditor: {audit: async () => ({status: 'passed', detail: '', checks: []})},
    reportWriter: {write: async () => undefined},
  };
}
