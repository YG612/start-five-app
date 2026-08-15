import * as crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const PATH_CONFLICT_CODE =
  'QUALITY_GATE_ENV_PATH_CONFLICT' as const;
export const PLATFORM_UNSUPPORTED_CODE =
  'QUALITY_GATE_PLATFORM_UNSUPPORTED' as const;
export const SHELL_ESCAPE_MARKER = 'shell-evidence' as const;
export const SHELL_SENSITIVE_TEST_ROOT =
  'tests/no-shell&mkdir shell-evidence' as const;

const BOOTSTRAP_MANIFEST = 'QUALITY_GATE_V2_LOCK.sha256';
const BOOTSTRAP_SPEC = 'QUALITY_GATE_V2_TEST_SPEC.md';
const BOOTSTRAP_TEST_ROOT = 'tests/quality-gate-v2';
const BOOTSTRAP_TEST =
  'tests/quality-gate-v2/bootstrap.contract.test.ts';
const FAST_MANIFEST = 'FROZEN_FAST_LOCK.sha256';
const FAST_SPEC = 'FROZEN_FAST_TEST_SPEC.md';
const FAST_TEST =
  'tests/no-shell&mkdir shell-evidence/fast.contract.test.ts';

const tempDirectories: string[] = [];

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

export type TextSink = {
  write(value: string): void;
};

type CliOverrides = Readonly<{
  cwd: string;
  platform: string;
  environment: Readonly<Record<string, string | undefined>>;
  bootstrapExpectedSelfSha256: string;
  stdout: TextSink;
  stderr: TextSink;
  now: () => string;
  runId: string;
  processRunner: ProcessRunner;
}>;

type ProductionCli = Readonly<{
  runCliProcess(
    argv: readonly string[],
    overrides: CliOverrides,
  ): Promise<number>;
}>;

export type SyntheticFixture = Readonly<{
  root: string;
  reportDirectory: string;
  reportPath: string;
  summaryPath: string;
  recorderPath: string;
  pidPath: string;
  expectedSelfSha256: string;
  argv: readonly string[];
}>;

export type RealChildResult = Readonly<{
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
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
      stdout: 'REVIEW1_RECORDING_RUNNER_OK',
      stderr: '',
      timedOut: false,
      timeoutSource: null,
      durationMs: 1,
    };
  }
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function manifest(entries: readonly Readonly<{
  relativePath: string;
  content: string;
}>[]): string {
  return entries
    .map(entry => `${sha256(entry.content)}  ${entry.relativePath}\n`)
    .join('');
}

export function projectRoot(): string {
  return path.resolve(__dirname, '..', '..');
}

export function fixturePath(name: 'fastPnpmProbe.cjs' | 'spreadCliEntry.cjs'):
string {
  return path.join(__dirname, 'fixtures', name);
}

export function createTempDirectory(): string {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'start-five-qgv2-review1-'),
  );
  tempDirectories.push(directory);
  return directory;
}

export function cleanupTempDirectories(): void {
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

export function installSyntheticFixture(): SyntheticFixture {
  const root = createTempDirectory();
  const bootstrapSpecContent = '# synthetic QUALITY-GATE-V2 specification\n';
  const bootstrapTestContent = 'export const bootstrap = true;\n';
  const bootstrapManifestContent = manifest([
    {relativePath: BOOTSTRAP_SPEC, content: bootstrapSpecContent},
    {relativePath: BOOTSTRAP_TEST, content: bootstrapTestContent},
  ]);
  const bootstrapSelf = sha256(bootstrapManifestContent);
  const fastSpecContent = '# fixed fast process probe\n';
  const fastTestContent = 'export const fastProbe = true;\n';
  const fastManifestContent = manifest([
    {relativePath: FAST_SPEC, content: fastSpecContent},
    {relativePath: FAST_TEST, content: fastTestContent},
  ]);
  const fastSelf = sha256(fastManifestContent);

  writeText(root, BOOTSTRAP_SPEC, bootstrapSpecContent);
  writeText(root, BOOTSTRAP_TEST, bootstrapTestContent);
  writeText(root, BOOTSTRAP_MANIFEST, bootstrapManifestContent);
  writeText(root, FAST_SPEC, fastSpecContent);
  writeText(root, FAST_TEST, fastTestContent);
  writeText(root, FAST_MANIFEST, fastManifestContent);
  writeText(
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
          expectedSelfSha256: bootstrapSelf,
        },
        {
          manifest: FAST_MANIFEST,
          status: 'accepted',
          ordering: 'spec-first-posix',
          specPath: FAST_SPEC,
          inventoryRoots: [FAST_SPEC, SHELL_SENSITIVE_TEST_ROOT],
          testRoots: [SHELL_SENSITIVE_TEST_ROOT],
          expectedSelfSha256: fastSelf,
        },
      ],
    }),
  );
  writeText(
    root,
    'exec',
    fs.readFileSync(fixturePath('fastPnpmProbe.cjs'), 'utf8'),
  );

  const reportDirectory = path.join(root, 'reports');
  return {
    root,
    reportDirectory,
    reportPath: path.join(reportDirectory, 'quality-gate-report.json'),
    summaryPath: path.join(reportDirectory, 'quality-gate-summary.txt'),
    recorderPath: path.join(root, 'path-probe-recorder.json'),
    pidPath: path.join(root, 'path-probe-pid.txt'),
    expectedSelfSha256: bootstrapSelf,
    argv: [
      'test',
      '--project-root',
      root,
      '--report-dir',
      reportDirectory,
      '--timeout-ms',
      '20000',
      '--node',
      process.execPath,
      '--pnpm',
      path.basename(process.execPath),
      '--java-home',
      'C:\\review1\\jdk-17',
      '--android-sdk',
      'C:\\review1\\android-sdk',
      '--build-tools',
      '36.0.0',
      '--registry',
      path.join(root, 'quality-gate.acceptance.json'),
    ],
  };
}

export function loadProductionCli(): ProductionCli {
  return jest.requireActual<ProductionCli>(
    path.join(projectRoot(), 'scripts', 'quality-gate-v2', 'cli.cjs'),
  );
}

export function cliOverrides(
  fixture: SyntheticFixture,
  environment: Readonly<Record<string, string | undefined>>,
  runner: ProcessRunner,
  platform = 'win32',
): Readonly<{
  overrides: CliOverrides;
  stdout: TextBuffer;
  stderr: TextBuffer;
}> {
  const stdout = new TextBuffer();
  const stderr = new TextBuffer();
  return {
    stdout,
    stderr,
    overrides: {
      cwd: fixture.root,
      platform,
      environment,
      bootstrapExpectedSelfSha256: fixture.expectedSelfSha256,
      stdout,
      stderr,
      now: () => '2026-08-06T00:00:00.000Z',
      runId: 'qgv2-review1-unit-run',
      processRunner: runner,
    },
  };
}

export function runRealChild(options: Readonly<{
  args: readonly string[];
  cwd: string;
  environment: Readonly<Record<string, string | undefined>>;
  watchdogMs?: number;
}>): Promise<RealChildResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...options.args], {
      cwd: options.cwd,
      env: options.environment,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let completed = false;
    const watchdog = setTimeout(() => {
      if (completed) {
        return;
      }
      completed = true;
      child.kill('SIGTERM');
      reject(new Error('QUALITY_GATE_V2_REVIEW1_CHILD_WATCHDOG'));
    }, options.watchdogMs ?? 20_000);
    child.stdout.on('data', chunk => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', error => {
      if (completed) {
        return;
      }
      completed = true;
      clearTimeout(watchdog);
      reject(error);
    });
    child.on('close', (exitCode, signal) => {
      if (completed) {
        return;
      }
      completed = true;
      clearTimeout(watchdog);
      resolve({exitCode, signal, stdout, stderr});
    });
  });
}

export function readJsonRecord(filePath: string): object {
  const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('QUALITY_GATE_V2_REVIEW1_JSON_RECORD_REQUIRED');
  }
  return parsed;
}

export function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }
  const value = Reflect.get(error, 'code');
  return typeof value === 'string' ? value : null;
}

export function windowsBaseEnvironment(
  fixture: SyntheticFixture,
  pathEntries: Readonly<Record<string, string>>,
): Readonly<Record<string, string | undefined>> {
  return {
    ...pathEntries,
    QUALITY_GATE_V2_BOOTSTRAP_SELF_SHA256:
      fixture.expectedSelfSha256,
    QUALITY_GATE_FORBIDDEN_SECRET: 'must-not-reach-stage-child',
    ANDROID_HOME: 'C:\\attacker\\android-home',
    ANDROID_SDK_ROOT: 'C:\\attacker\\android-sdk',
    CI: 'attacker-ci',
    ComSpec: process.env.ComSpec ??
      'C:\\Windows\\System32\\cmd.exe',
    JAVA_HOME: 'C:\\attacker\\jdk',
    NODE_OPTIONS: '--no-warnings',
    PATHEXT: process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD',
    SystemRoot: process.env.SystemRoot ?? 'C:\\Windows',
    TEMP: fixture.root,
    TMP: fixture.root,
  };
}

export function expectedProbeArgv(): readonly string[] {
  return [
    'jest',
    '--runInBand',
    '--ci',
    '--coverage=false',
    '--roots',
    SHELL_SENSITIVE_TEST_ROOT,
    BOOTSTRAP_TEST_ROOT,
  ];
}

export function expectedLockValidationSummary(): Readonly<{
  validatedManifests: 2;
  entries: 4;
  acceptedTestRoots: readonly string[];
  acceptedManifests: readonly string[];
  excludedManifests: readonly never[];
}> {
  return {
    validatedManifests: 2,
    entries: 4,
    acceptedTestRoots: [
      SHELL_SENSITIVE_TEST_ROOT,
      BOOTSTRAP_TEST_ROOT,
    ],
    acceptedManifests: [FAST_MANIFEST, BOOTSTRAP_MANIFEST],
    excludedManifests: [],
  };
}
