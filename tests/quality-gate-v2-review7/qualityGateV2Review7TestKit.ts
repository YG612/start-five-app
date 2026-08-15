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
  }>): Readonly<{run(request: ProcessRequest): Promise<ProcessResult>}>;
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

export type CliFixture = Readonly<{
  root: string;
  reportDirectory: string;
  recorderPath: string;
  temporaryLaunchPath: string;
  registryPath: string;
  expectedSelfSha256: string;
}>;

export type SpawnBoundaryOptions = Readonly<{
  cwd: string;
  env: Readonly<Record<string, string | undefined>>;
  shell?: false;
  windowsHide: true;
  stdio: readonly ['pipe', 'pipe', 'pipe'];
}>;

export type FileIdentity = Readonly<{
  canonicalPath: string;
  dev: bigint;
  ino: bigint;
  mode: bigint;
  kind: 'file' | 'directory';
}>;

export type ChangeLevel = 'first' | 'middle' | 'parent';
export type TrustBranch = 'companion' | 'current-node';

export type AncestorFixture = Readonly<{
  branch: TrustBranch;
  root: string;
  levels: readonly [string, string, string, string, string];
  finalPath: string;
  companionPath: string;
  sentinelPath: string;
  changeLevel: ChangeLevel;
  changedDirectory: string;
  heldDirectory: string;
  preservedChildName: string | null;
  safeMarker: string;
  changedMarker: string;
  reportDirectory: string;
  recorderPath: string;
  temporaryLaunchPath: string;
}>;

export type LaunchOutcome = Readonly<{
  result: ProcessResult | null;
  error: unknown;
  boundaryCalls: number;
}>;

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

export function projectRoot(): string {
  return path.resolve(__dirname, '..', '..');
}

export function createTemporaryRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'start-five-qgv2-review7-'));
  temporaryRoots.push(root);
  return root;
}

export function cleanupTemporaryRoots(): void {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root !== undefined) fs.rmSync(root, {recursive: true, force: true});
  }
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

function manifestEntry(relativePath: string, content: string): string {
  return `${sha256(content)}  ${relativePath}\n`;
}

function writeText(root: string, relativePath: string, content: string): string {
  const target = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target, content, 'utf8');
  return target;
}

export function installCliFixture(): CliFixture {
  const root = createTemporaryRoot();
  const spec = '# Review7 synthetic bootstrap\n';
  const test = 'export const review7Bootstrap = true;\n';
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
    reportDirectory: path.join(root, 'review7-reports'),
    recorderPath: path.join(root, 'review7.recorder'),
    temporaryLaunchPath: path.join(root, 'review7-launch.tmp'),
    registryPath,
    expectedSelfSha256,
  };
}

export function cliArguments(
  fixture: CliFixture,
  pnpmExecutable: string,
  nodeExecutable = process.execPath,
): readonly string[] {
  return [
    'test',
    '--project-root', fixture.root,
    '--report-dir', fixture.reportDirectory,
    '--timeout-ms', '20000',
    '--node', nodeExecutable,
    '--pnpm', pnpmExecutable,
    '--java-home', 'C:\\approved\\jdk',
    '--android-sdk', 'C:\\approved\\android',
    '--build-tools', '36.0.0',
    '--registry', fixture.registryPath,
  ];
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

export function baseEnvironment(pathValue: string): Readonly<Record<string, string | undefined>> {
  return {
    PATH: pathValue,
    PATHEXT: '.COM;.EXE;.BAT;.CMD',
    SystemRoot: 'C:\\Windows',
    ComSpec: 'C:\\Windows\\System32\\cmd.exe',
  };
}

export function captureIdentity(filePath: string): FileIdentity {
  const canonicalPath = fs.realpathSync.native(filePath);
  const stat = fs.lstatSync(canonicalPath, {bigint: true});
  if (!stat.isFile() && !stat.isDirectory()) {
    throw new Error('QUALITY_GATE_REVIEW7_IDENTITY_KIND_INVALID');
  }
  return {
    canonicalPath,
    dev: stat.dev,
    ino: stat.ino,
    mode: stat.mode,
    kind: stat.isFile() ? 'file' : 'directory',
  };
}

export function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino &&
    left.mode === right.mode && left.kind === right.kind;
}

function payloadSource(safeMarker: string, changedMarker: string): string {
  return [
    "'use strict';",
    "const fs = require('node:fs');",
    "const state = fs.readFileSync(process.argv[2], 'utf8').trim();",
    `const marker = state === 'SAFE' ? ${JSON.stringify(safeMarker)} : ${JSON.stringify(changedMarker)};`,
    "fs.appendFileSync(marker, state + '\\n', 'utf8');",
    "process.stdout.write(state + '\\n');",
    '',
  ].join('\n');
}

function selectedIndex(level: ChangeLevel): number {
  if (level === 'first') return 0;
  if (level === 'middle') return 2;
  return 4;
}

export function installAncestorFixture(
  branch: TrustBranch,
  changeLevel: ChangeLevel,
  originalNodeExecutable: string,
): AncestorFixture {
  const root = createTemporaryRoot();
  const levels: readonly [string, string, string, string, string] = [
    path.join(root, 'level-1'),
    path.join(root, 'level-1', 'level-2'),
    path.join(root, 'level-1', 'level-2', 'level-3'),
    path.join(root, 'level-1', 'level-2', 'level-3', 'level-4'),
    path.join(root, 'level-1', 'level-2', 'level-3', 'level-4', 'level-5'),
  ];
  fs.mkdirSync(levels[4], {recursive: true});
  const safeMarker = path.join(root, `${branch}-safe.marker`);
  const changedMarker = path.join(root, `${branch}-changed.marker`);
  const companionPath = branch === 'companion'
    ? path.join(levels[4], 'pnpm.cjs')
    : path.join(root, 'stable-pnpm.cjs');
  const finalPath = branch === 'companion'
    ? companionPath
    : path.join(levels[4], 'node.exe');
  fs.writeFileSync(companionPath, payloadSource(safeMarker, changedMarker), 'utf8');
  if (branch === 'current-node') fs.copyFileSync(originalNodeExecutable, finalPath);

  selectedIndex(changeLevel);
  const changedDirectory = changeLevel === 'first'
    ? levels[0]
    : changeLevel === 'middle' ? levels[2] : levels[4];
  const heldDirectory = path.join(root, `held-${branch}-${changeLevel}`);
  const sentinelPath = path.join(changedDirectory, 'ancestor-state.txt');
  fs.writeFileSync(sentinelPath, 'SAFE\n', 'utf8');
  return {
    branch,
    root,
    levels,
    finalPath,
    companionPath,
    sentinelPath,
    changeLevel,
    changedDirectory,
    heldDirectory,
    preservedChildName: changeLevel === 'first'
      ? 'level-2'
      : changeLevel === 'middle' ? 'level-4' : null,
    safeMarker,
    changedMarker,
    reportDirectory: path.join(root, 'reports'),
    recorderPath: path.join(root, 'launch.recorder'),
    temporaryLaunchPath: path.join(root, 'launch.tmp'),
  };
}

export function applyAncestorChange(fixture: AncestorFixture): void {
  fs.renameSync(fixture.changedDirectory, fixture.heldDirectory);
  fs.mkdirSync(fixture.changedDirectory, {recursive: true});
  fs.writeFileSync(fixture.sentinelPath, 'CHANGED\n', 'utf8');
  if (fixture.preservedChildName !== null) {
    const target = path.join(fixture.heldDirectory, fixture.preservedChildName);
    const link = path.join(fixture.changedDirectory, fixture.preservedChildName);
    fs.symlinkSync(target, link, 'junction');
    return;
  }
  const heldFinal = path.join(fixture.heldDirectory, path.basename(fixture.finalPath));
  fs.linkSync(heldFinal, fixture.finalPath);
}

export function processRequest(fixture: AncestorFixture): ProcessRequest {
  return {
    executable: fixture.companionPath,
    args: [fixture.sentinelPath],
    cwd: fixture.root,
    env: {
      CI: '1',
      JAVA_HOME: 'C:\\approved\\jdk',
      ANDROID_HOME: 'C:\\approved\\android',
      ANDROID_SDK_ROOT: 'C:\\approved\\android',
      PATH: path.dirname(fixture.companionPath),
    },
    timeoutMs: 20_000,
  };
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

function codedValue(error: unknown, key: string): unknown {
  if (typeof error !== 'object' || error === null) return undefined;
  return Object.prototype.hasOwnProperty.call(error, key)
    ? Reflect.get(error, key)
    : undefined;
}

export function hasZeroSideEffects(fixture: AncestorFixture): boolean {
  return !fs.existsSync(fixture.safeMarker) &&
    !fs.existsSync(fixture.changedMarker) &&
    !fs.existsSync(fixture.reportDirectory) &&
    !fs.existsSync(fixture.recorderPath) &&
    !fs.existsSync(fixture.temporaryLaunchPath);
}

export function review7UnionAccepts(
  fixture: AncestorFixture,
  outcome: LaunchOutcome,
): boolean {
  if (outcome.result === null) {
    return codedValue(outcome.error, 'code') === UNSAFE_CODE &&
      codedValue(outcome.error, 'message') === UNSAFE_CODE &&
      outcome.boundaryCalls === 0 && hasZeroSideEffects(fixture);
  }
  return outcome.error === null && outcome.boundaryCalls === 1 &&
    outcome.result.exitCode === 0 && outcome.result.signal === null &&
    outcome.result.stderr === '' && outcome.result.stdout === 'SAFE\n' &&
    readUtf8IfPresent(fixture.safeMarker) === 'SAFE\n' &&
    !fs.existsSync(fixture.changedMarker) &&
    !fs.existsSync(fixture.reportDirectory) &&
    !fs.existsSync(fixture.recorderPath) &&
    !fs.existsSync(fixture.temporaryLaunchPath);
}

export async function launchSimplifiedAfterChange(
  fixture: AncestorFixture,
  originalNodeExecutable: string,
): Promise<ProcessResult> {
  const executable = fixture.branch === 'current-node'
    ? fixture.finalPath
    : originalNodeExecutable;
  const args = fixture.branch === 'current-node'
    ? [fixture.companionPath, fixture.sentinelPath]
    : [fixture.finalPath, fixture.sentinelPath];
  return new Promise((resolve, reject) => {
    const child = actualSpawn(executable, args, {
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
    child.on('close', (exitCode, signal) => resolve({
      exitCode,
      signal,
      stdout,
      stderr,
      timedOut: false,
      timeoutSource: null,
      durationMs: 0,
    }));
  });
}
