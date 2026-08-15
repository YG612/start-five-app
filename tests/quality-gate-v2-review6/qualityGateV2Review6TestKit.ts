import * as crypto from 'node:crypto';
import {spawn as actualSpawn} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const UNSAFE_CODE = 'QUALITY_GATE_PNPM_LAUNCH_UNSAFE';
export const CLI_USAGE_CODE = 'QUALITY_GATE_CLI_USAGE';
export const PROCESS_START_FAILED = 'QUALITY_GATE_PROCESS_START_FAILED';

const temporaryRoots: string[] = [];
const BOOTSTRAP_MANIFEST = 'QUALITY_GATE_V2_LOCK.sha256';
const BOOTSTRAP_SPEC = 'QUALITY_GATE_V2_TEST_SPEC.md';
const BOOTSTRAP_ROOT = 'tests/quality-gate-v2';
const BOOTSTRAP_TEST = `${BOOTSTRAP_ROOT}/bootstrap.contract.test.ts`;

export type BigIntOption = Readonly<{bigint?: boolean}> | undefined;

export type ProcessRequest = Readonly<{
  executable: string;
  args: readonly string[];
  cwd: string;
  env: Readonly<Record<string, string>>;
  timeoutMs: number;
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

export type ProductionModule = Readonly<{
  createNodeProcessRunner(options: Readonly<{
    baseEnvironment: Readonly<Record<string, string | undefined>>;
    platform?: string;
    nodeExecutable?: string;
  }>): Readonly<{
    run(request: ProcessRequest): Promise<ProcessResult>;
  }>;
}>;

export type CliFixture = Readonly<{
  root: string;
  reportDirectory: string;
  registryPath: string;
  expectedSelfSha256: string;
}>;

export type ProductionCli = Readonly<{
  runCliProcess(
    argv: readonly string[],
    overrides: Readonly<{
      cwd: string;
      platform: string;
      environment: Readonly<Record<string, string | undefined>>;
      bootstrapExpectedSelfSha256: string;
      stdout: {write(value: string): void};
      stderr: {write(value: string): void};
      now: () => string;
      runId: string;
    }>,
  ): Promise<number>;
}>;

export type VirtualStat = Readonly<{
  dev: number | bigint;
  ino: number | bigint;
  mode: number | bigint;
  size: number;
  mtimeMs: number;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}>;

export type Review6Realpath = {
  (filePath: string): string;
  native(filePath: string): string;
};

export type SpawnBoundaryOptions = Readonly<{
  cwd: string;
  env: Readonly<Record<string, string | undefined>>;
  shell?: false;
  windowsHide: true;
  stdio: readonly ['pipe', 'pipe', 'pipe'];
}>;

export type BoundaryFixture = Readonly<{
  root: string;
  toolDirectory: string;
  companionPath: string;
  changedCompanionPath: string;
  heldDirectory: string;
  replacementToolDirectory: string;
  safeMarker: string;
  changedMarker: string;
  reportDirectory: string;
  recorderPath: string;
  launchTemporaryPath: string;
  safePayloadId: string;
  changedPayloadId: string;
}>;

export type LaunchOutcome = Readonly<{
  result: ProcessResult | null;
  error: unknown;
  boundaryCalls: number;
}>;

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function manifestEntry(relativePath: string, content: string): string {
  return `${sha256(content)}  ${relativePath}\n`;
}

function writeText(root: string, relativePath: string, content: string): string {
  const target = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target, content, 'utf8');
  return target;
}

function codedValue(error: unknown, key: string): unknown {
  if (typeof error !== 'object' || error === null) return undefined;
  return Object.prototype.hasOwnProperty.call(error, key)
    ? Reflect.get(error, key)
    : undefined;
}

export function projectRoot(): string {
  return path.resolve(__dirname, '..', '..');
}

export function createTemporaryRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'start-five-qgv2-review6-'));
  temporaryRoots.push(root);
  return root;
}

export function cleanupTemporaryRoots(): void {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root !== undefined) fs.rmSync(root, {recursive: true, force: true});
  }
}

export function windowsIdentity(value: string): string {
  return value.replaceAll('/', '\\').toLowerCase();
}

export function regularStat(
  dev: number | bigint = 17,
  ino: number | bigint = 29,
): VirtualStat {
  return {
    dev,
    ino,
    mode: typeof dev === 'bigint' ? 33_188n : 33_188,
    size: 128,
    mtimeMs: 0,
    isFile: () => true,
    isDirectory: () => false,
    isSymbolicLink: () => false,
  };
}

export function directoryStat(
  dev: number | bigint = 17,
  ino: number | bigint = 29,
): VirtualStat {
  return {
    dev,
    ino,
    mode: typeof dev === 'bigint' ? 16_893n : 16_893,
    size: 0,
    mtimeMs: 0,
    isFile: () => false,
    isDirectory: () => true,
    isSymbolicLink: () => false,
  };
}

export function reparseDirectoryStat(
  bigint = false,
): VirtualStat {
  return {
    dev: bigint ? 17n : 17,
    ino: bigint ? 31n : 31,
    mode: bigint ? 16_893n : 16_893,
    size: 0,
    mtimeMs: 0,
    isFile: () => false,
    isDirectory: () => true,
    isSymbolicLink: () => true,
  };
}

export function identityRealpath(): Review6Realpath {
  const resolvePath = ((filePath: string): string => filePath) as Review6Realpath;
  resolvePath.native = (filePath: string): string => filePath;
  return resolvePath;
}

export function directRequest(
  executable: string,
  cwd: string,
  pathValue = 'C:\\approved\\bin',
): ProcessRequest {
  return {
    executable,
    args: ['review6-literal-argument', ''],
    cwd,
    env: {
      CI: '1',
      JAVA_HOME: 'C:\\approved\\jdk',
      ANDROID_HOME: 'C:\\approved\\android',
      ANDROID_SDK_ROOT: 'C:\\approved\\android',
      PATH: pathValue,
    },
    timeoutMs: 20_000,
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

export function installCliFixture(): CliFixture {
  const root = createTemporaryRoot();
  const spec = '# Review6 synthetic bootstrap\n';
  const test = 'export const review6Bootstrap = true;\n';
  const manifest = manifestEntry(BOOTSTRAP_SPEC, spec) + manifestEntry(BOOTSTRAP_TEST, test);
  const expectedSelfSha256 = sha256(manifest);
  writeText(root, BOOTSTRAP_SPEC, spec);
  writeText(root, BOOTSTRAP_TEST, test);
  writeText(root, BOOTSTRAP_MANIFEST, manifest);
  const registryPath = writeText(
    root,
    'quality-gate.acceptance.json',
    JSON.stringify({
      schema: 'start-five.quality-lock-registry',
      version: 1,
      locks: [{
        manifest: BOOTSTRAP_MANIFEST,
        status: 'accepted',
        ordering: 'spec-first-posix',
        specPath: BOOTSTRAP_SPEC,
        inventoryRoots: [BOOTSTRAP_SPEC, BOOTSTRAP_ROOT],
        testRoots: [BOOTSTRAP_ROOT],
        expectedSelfSha256,
      }],
    }) + '\n',
  );
  return {
    root,
    reportDirectory: path.join(root, 'review6-reports'),
    registryPath,
    expectedSelfSha256,
  };
}

export function cliArguments(
  fixture: CliFixture,
  pnpmExecutable: string,
): readonly string[] {
  return [
    'test',
    '--project-root', fixture.root,
    '--report-dir', fixture.reportDirectory,
    '--timeout-ms', '20000',
    '--node', process.execPath,
    '--pnpm', pnpmExecutable,
    '--java-home', 'C:\\approved\\jdk',
    '--android-sdk', 'C:\\approved\\android',
    '--build-tools', '36.0.0',
    '--registry', fixture.registryPath,
  ];
}

export function cliEnvironment(): Readonly<Record<string, string | undefined>> {
  return baseEnvironment();
}

export function textSink(): Readonly<{
  sink: {write(value: string): void};
  read(): string;
}> {
  let value = '';
  return {
    sink: {write(chunk: string): void { value += chunk; }},
    read(): string { return value; },
  };
}

export function baseEnvironment(
  pathValue = 'C:\\approved\\bin',
): Readonly<Record<string, string | undefined>> {
  return {
    PATH: pathValue,
    PATHEXT: '.COM;.EXE;.BAT;.CMD',
    SystemRoot: 'C:\\Windows',
    ComSpec: 'C:\\Windows\\System32\\cmd.exe',
  };
}

function payloadSource(markerPath: string, payloadId: string): string {
  return [
    "'use strict';",
    "const fs = require('node:fs');",
    `fs.appendFileSync(${JSON.stringify(markerPath)}, ${JSON.stringify(payloadId + '\n')}, 'utf8');`,
    `process.stdout.write(${JSON.stringify(payloadId + '\n')});`,
    '',
  ].join('\n');
}

export function installBoundaryFixture(): BoundaryFixture {
  const root = createTemporaryRoot();
  const toolDirectory = path.join(root, 'trusted-tool');
  const changedDirectory = path.join(root, 'changed-tool');
  const heldDirectory = path.join(root, 'held-trusted-tool');
  fs.mkdirSync(toolDirectory, {recursive: true});
  fs.mkdirSync(changedDirectory, {recursive: true});
  const safeMarker = path.join(root, 'safe-payload.marker');
  const changedMarker = path.join(root, 'changed-payload.marker');
  const safePayloadId = 'REVIEW6_SAFE_' + sha256('review6-safe-payload');
  const changedPayloadId = 'REVIEW6_CHANGED_' + sha256('review6-changed-payload');
  const companionPath = path.join(toolDirectory, 'pnpm.cjs');
  const changedCompanionPath = path.join(root, 'changed-companion.cjs');
  fs.writeFileSync(companionPath, payloadSource(safeMarker, safePayloadId), 'utf8');
  fs.writeFileSync(changedCompanionPath, payloadSource(changedMarker, changedPayloadId), 'utf8');
  fs.writeFileSync(
    path.join(changedDirectory, 'pnpm.cjs'),
    payloadSource(changedMarker, changedPayloadId),
    'utf8',
  );
  return {
    root,
    toolDirectory,
    companionPath,
    changedCompanionPath,
    heldDirectory,
    replacementToolDirectory: changedDirectory,
    safeMarker,
    changedMarker,
    reportDirectory: path.join(root, 'reports'),
    recorderPath: path.join(root, 'launch.recorder'),
    launchTemporaryPath: path.join(root, 'launch.tmp'),
    safePayloadId,
    changedPayloadId,
  };
}

export function replaceCompanionAtBoundary(fixture: BoundaryFixture): void {
  fs.copyFileSync(fixture.changedCompanionPath, fixture.companionPath);
}

export function replaceAncestorAtBoundary(fixture: BoundaryFixture): void {
  fs.renameSync(fixture.toolDirectory, fixture.heldDirectory);
  fs.renameSync(fixture.replacementToolDirectory, fixture.toolDirectory);
}

export function spawnActual(
  executable: string,
  args: readonly string[],
  options: SpawnBoundaryOptions,
): ReturnType<typeof actualSpawn> {
  return actualSpawn(executable, [...args], options);
}

export function readUtf8IfPresent(filePath: string): string | null {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

export function hasZeroLaunchSideEffects(fixture: BoundaryFixture): boolean {
  return !fs.existsSync(fixture.safeMarker) &&
    !fs.existsSync(fixture.changedMarker) &&
    !fs.existsSync(fixture.reportDirectory) &&
    !fs.existsSync(fixture.recorderPath) &&
    !fs.existsSync(fixture.launchTemporaryPath);
}

export function safePayloadExecutedExactlyOnce(
  fixture: BoundaryFixture,
  result: ProcessResult,
): boolean {
  return result.exitCode === 0 &&
    result.signal === null &&
    result.stderr === '' &&
    result.stdout === `${fixture.safePayloadId}\n` &&
    readUtf8IfPresent(fixture.safeMarker) === `${fixture.safePayloadId}\n` &&
    !fs.existsSync(fixture.changedMarker) &&
    !fs.existsSync(fixture.reportDirectory) &&
    !fs.existsSync(fixture.recorderPath) &&
    !fs.existsSync(fixture.launchTemporaryPath);
}

export function review6UnionAccepts(
  fixture: BoundaryFixture,
  outcome: LaunchOutcome,
): boolean {
  if (outcome.result !== null) {
    return outcome.error === null &&
      outcome.boundaryCalls === 1 &&
      safePayloadExecutedExactlyOnce(fixture, outcome.result);
  }
  return codedValue(outcome.error, 'code') === UNSAFE_CODE &&
    codedValue(outcome.error, 'message') === UNSAFE_CODE &&
    outcome.boundaryCalls === 0 &&
    hasZeroLaunchSideEffects(fixture);
}

export function launchWithSimplifiedPathCheck(
  fixture: BoundaryFixture,
  replace: (value: BoundaryFixture) => void,
): Promise<ProcessResult> {
  const validatedBytes = fs.readFileSync(fixture.companionPath, 'utf8');
  if (!validatedBytes.includes(fixture.safePayloadId)) {
    throw new Error('QUALITY_GATE_REVIEW6_NEGATIVE_CONTROL_NOT_SAFE');
  }
  replace(fixture);
  return new Promise((resolve, reject) => {
    const child = spawnActual(process.execPath, [fixture.companionPath], {
      cwd: fixture.root,
      env: process.env,
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('close', (exitCode, signal) => {
      resolve({
        exitCode,
        signal,
        stdout,
        stderr,
        timedOut: false,
        timeoutSource: null,
        durationMs: 0,
      });
    });
  });
}
