import * as crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const BOOTSTRAP_MANIFEST = 'QUALITY_GATE_V2_LOCK.sha256';
const BOOTSTRAP_SPEC = 'QUALITY_GATE_V2_TEST_SPEC.md';
const BOOTSTRAP_ROOT = 'tests/quality-gate-v2';
const BOOTSTRAP_TEST = `${BOOTSTRAP_ROOT}/bootstrap.contract.test.ts`;
const COMPANION_RECORD = 'review4-companion-records.ndjson';
const SPAWN_GUARD_READY = 'review4-spawn-guard-ready.txt';
const SPAWN_RECORD = 'review4-child-creation-attempt.txt';
const WRAPPER_MARKER = 'review4-wrapper-ran.txt';

export const COMPANION_STDOUT_JSON = '{"event":"REVIEW4_COMPANION_OK"}';

const temporaryRoots: string[] = [];
const junctions: string[] = [];

export type CompanionRecord = Readonly<{
  runtime: 'cjs' | 'mjs';
  pid: number;
  ppid: number;
  argv: readonly string[];
  cwd: string;
  execPath: string;
}>;

export type SpawnEvidence = Readonly<{
  pid: number;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
}>;

export type SyntheticProject = Readonly<{
  root: string;
  toolDirectory: string;
  reportDirectory: string;
  registryPath: string;
  expectedSelfSha256: string;
  companionRecordPath: string;
  spawnGuardReadyPath: string;
  spawnRecordPath: string;
  wrapperMarkerPath: string;
}>;

export type ReparseKind = 'wrapper' | 'cjs' | 'mjs' | 'node' | 'exe';

export type ReparseSyntheticProject = SyntheticProject & Readonly<{
  kind: ReparseKind;
  reparsePath: string;
  nodeExecutable?: string;
  pnpmExecutable?: string;
}>;

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
  parseQualityGateCliArgs(
    argv: readonly string[],
    cwd: string,
    environment?: Readonly<Record<string, string | undefined>>,
  ): Readonly<{
    pnpmExecutable: string;
    projectRoot: string;
  }>;
}>;

export type RecordingRunner = Readonly<{
  requests: ProcessRequest[];
  run(request: ProcessRequest): Promise<ProcessResult>;
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
      processRunner: RecordingRunner;
    }>,
  ): Promise<number>;
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

export function fixturePath(
  name:
    | 'fakeCli.cjs'
    | 'pnpmCompanion.cjs'
    | 'pnpmCompanion.mjs'
    | 'spawnGuard.cjs',
): string {
  return path.join(__dirname, 'fixtures', name);
}

export function projectRoot(): string {
  return path.resolve(__dirname, '..', '..');
}

export function createTemporaryRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'start-five-qgv2-review4-'));
  temporaryRoots.push(root);
  return root;
}

export function cleanupTemporaryRoots(): void {
  while (junctions.length > 0) {
    const junction = junctions.pop();
    if (junction !== undefined && fs.existsSync(junction)) fs.unlinkSync(junction);
  }
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root !== undefined) fs.rmSync(root, {recursive: true, force: true});
  }
}

function localAppDataRoot(): string {
  const value = process.env.LOCALAPPDATA;
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('QUALITY_GATE_REVIEW4_LOCALAPPDATA_REQUIRED');
  }
  return value;
}

export function createSameVolumeTemporaryRoot(): string {
  const parent = path.join(localAppDataRoot(), 'Temp');
  fs.mkdirSync(parent, {recursive: true});
  const root = fs.mkdtempSync(path.join(parent, 'start-five-qgv2-review4-'));
  temporaryRoots.push(root);
  return root;
}

function seedSyntheticProject(
  root: string,
  mode: 'none' | 'cjs' | 'mjs' | 'both' = 'cjs',
): SyntheticProject {
  const bootstrapSpec = '# Review4 synthetic bootstrap\n';
  const bootstrapTest = 'export const review4Bootstrap = true;\n';
  const bootstrapManifest =
    manifestEntry(BOOTSTRAP_SPEC, bootstrapSpec) +
    manifestEntry(BOOTSTRAP_TEST, bootstrapTest);
  const expectedSelfSha256 = sha256(bootstrapManifest);
  writeText(root, BOOTSTRAP_SPEC, bootstrapSpec);
  writeText(root, BOOTSTRAP_TEST, bootstrapTest);
  writeText(root, BOOTSTRAP_MANIFEST, bootstrapManifest);
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
  const toolDirectory = path.join(root, 'review4 tool bin');
  fs.mkdirSync(toolDirectory, {recursive: true});
  if (mode === 'cjs' || mode === 'both') {
    fs.copyFileSync(
      fixturePath('pnpmCompanion.cjs'),
      path.join(toolDirectory, 'pnpm.cjs'),
    );
  }
  if (mode === 'mjs' || mode === 'both') {
    fs.copyFileSync(
      fixturePath('pnpmCompanion.mjs'),
      path.join(toolDirectory, 'pnpm.mjs'),
    );
  }
  fs.writeFileSync(
    path.join(toolDirectory, 'pnpm.cmd'),
    [
      '@echo off',
      `> "%TEMP%\\${WRAPPER_MARKER}" echo REVIEW4_WRAPPER_EXECUTED`,
      'exit /b 93',
      '',
    ].join('\r\n'),
    'utf8',
  );
  return {
    root,
    toolDirectory,
    reportDirectory: path.join(root, 'review4-reports'),
    registryPath,
    expectedSelfSha256,
    companionRecordPath: path.join(root, COMPANION_RECORD),
    spawnGuardReadyPath: path.join(root, SPAWN_GUARD_READY),
    spawnRecordPath: path.join(root, SPAWN_RECORD),
    wrapperMarkerPath: path.join(root, WRAPPER_MARKER),
  };
}

export function installSyntheticProject(): SyntheticProject {
  return seedSyntheticProject(createTemporaryRoot());
}

export function installSyntheticProjectMode(
  mode: 'none' | 'cjs' | 'mjs' | 'both',
): SyntheticProject {
  return seedSyntheticProject(createTemporaryRoot(), mode);
}

export function installDuplicatePathProject(): SyntheticProject {
  const fixture = seedSyntheticProject(createTemporaryRoot());
  const second = path.join(fixture.root, 'review4 second tool bin');
  fs.mkdirSync(second, {recursive: true});
  fs.copyFileSync(path.join(fixture.toolDirectory, 'pnpm.cmd'), path.join(second, 'pnpm.cmd'));
  fs.copyFileSync(path.join(fixture.toolDirectory, 'pnpm.cjs'), path.join(second, 'pnpm.cjs'));
  return {...fixture, toolDirectory: `${fixture.toolDirectory};${second}`};
}

function windowsAppsFileReparse(): string {
  const directory = path.join(localAppDataRoot(), 'Microsoft', 'WindowsApps');
  const candidate = fs.readdirSync(directory)
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
    .map(name => path.join(directory, name))
    .find(filePath => {
      try {
        const stat = fs.lstatSync(filePath);
        return stat.isSymbolicLink() && !stat.isDirectory();
      } catch (_error) {
        return false;
      }
    });
  if (candidate === undefined) {
    throw new Error('QUALITY_GATE_REVIEW4_FILE_REPARSE_PREREQUISITE_MISSING');
  }
  return candidate;
}

function replaceWithFileReparse(target: string): void {
  if (fs.existsSync(target)) fs.unlinkSync(target);
  fs.linkSync(windowsAppsFileReparse(), target);
  const stat = fs.lstatSync(target);
  if (!stat.isSymbolicLink() || stat.isFile()) {
    throw new Error('QUALITY_GATE_REVIEW4_FILE_REPARSE_COPY_INVALID');
  }
}

export function installReparseSyntheticProject(
  kind: ReparseKind,
): ReparseSyntheticProject {
  const fixture = seedSyntheticProject(createSameVolumeTemporaryRoot());
  let reparsePath: string;
  let nodeExecutable: string | undefined;
  let pnpmExecutable: string | undefined;
  if (kind === 'wrapper') {
    reparsePath = path.join(fixture.toolDirectory, 'pnpm.cmd');
  } else if (kind === 'cjs') {
    fs.copyFileSync(
      fixturePath('pnpmCompanion.mjs'),
      path.join(fixture.toolDirectory, 'pnpm.mjs'),
    );
    reparsePath = path.join(fixture.toolDirectory, 'pnpm.cjs');
  } else if (kind === 'mjs') {
    fs.unlinkSync(path.join(fixture.toolDirectory, 'pnpm.cjs'));
    reparsePath = path.join(fixture.toolDirectory, 'pnpm.mjs');
  } else if (kind === 'node') {
    reparsePath = path.join(fixture.root, 'review4-node.exe');
    nodeExecutable = reparsePath;
  } else {
    reparsePath = path.join(fixture.toolDirectory, 'pnpm.exe');
    pnpmExecutable = reparsePath;
  }
  replaceWithFileReparse(reparsePath);
  return {
    ...fixture,
    kind,
    reparsePath,
    ...(nodeExecutable === undefined ? {} : {nodeExecutable}),
    ...(pnpmExecutable === undefined ? {} : {pnpmExecutable}),
  };
}

export function installJunctionSyntheticProject(): SyntheticProject {
  const fixture = seedSyntheticProject(createSameVolumeTemporaryRoot());
  const physical = path.join(fixture.root, 'physical-review4-tool');
  fs.renameSync(fixture.toolDirectory, physical);
  fs.symlinkSync(physical, fixture.toolDirectory, 'junction');
  junctions.push(fixture.toolDirectory);
  if (!fs.lstatSync(fixture.toolDirectory).isSymbolicLink()) {
    throw new Error('QUALITY_GATE_REVIEW4_JUNCTION_PREREQUISITE_INVALID');
  }
  return fixture;
}

export function createOrdinaryHardlinkFixture(): Readonly<{
  root: string;
  executable: string;
}> {
  const root = createSameVolumeTemporaryRoot();
  const source = path.join(root, 'ordinary-source.bin');
  fs.writeFileSync(source, 'REVIEW4_ORDINARY_HARDLINK_CONTROL\n', 'utf8');
  const executable = path.join(root, 'ordinary-executable-hardlink.exe');
  fs.linkSync(source, executable);
  const stat = fs.lstatSync(executable);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('QUALITY_GATE_REVIEW4_ORDINARY_HARDLINK_INVALID');
  }
  return {root, executable};
}

function childEnvironment(
  temporaryRoot: string,
  pathValue: string,
  bootstrapSelf?: string,
): Readonly<Record<string, string>> {
  const systemRoot = process.env.SystemRoot;
  const commandProcessor = process.env.ComSpec;
  if (typeof systemRoot !== 'string' || systemRoot.length === 0) {
    throw new Error('QUALITY_GATE_REVIEW4_SYSTEMROOT_REQUIRED');
  }
  if (typeof commandProcessor !== 'string' || commandProcessor.length === 0) {
    throw new Error('QUALITY_GATE_REVIEW4_COMSPEC_REQUIRED');
  }
  const environment: Record<string, string> = {
    PATH: pathValue,
    PATHEXT: process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD',
    SystemRoot: systemRoot,
    ComSpec: commandProcessor,
    TEMP: temporaryRoot,
    TMP: temporaryRoot,
  };
  if (bootstrapSelf !== undefined) {
    environment.QUALITY_GATE_V2_BOOTSTRAP_SELF_SHA256 = bootstrapSelf;
  }
  return environment;
}

export function shippedCliArguments(
  fixture: SyntheticProject,
  overrides: Readonly<{
    nodeExecutable?: string;
    pnpmExecutable?: string;
  }> = {},
): readonly string[] {
  const result = [
    'test',
    '--project-root', fixture.root,
    '--report-dir', fixture.reportDirectory,
    '--timeout-ms', '20000',
    '--node', overrides.nodeExecutable ?? process.execPath,
    '--java-home', path.join(fixture.root, 'review4-jdk'),
    '--android-sdk', path.join(fixture.root, 'review4-android-sdk'),
    '--build-tools', '36.0.0',
    '--registry', fixture.registryPath,
  ];
  if (overrides.pnpmExecutable !== undefined) {
    result.push('--pnpm', overrides.pnpmExecutable);
  }
  return result;
}

export function spawnNodeScript(
  scriptPath: string,
  args: readonly string[],
  cwd: string,
  environment: Readonly<Record<string, string>>,
): Promise<SpawnEvidence> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd,
      env: environment,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const pid = (child as typeof child & Readonly<{pid?: number}>).pid;
    if (pid === undefined) {
      reject(new Error('REVIEW4_CHILD_PID_MISSING'));
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('close', (exitCode, signal) => {
      resolve({pid, exitCode, signal, stdout, stderr});
    });
  });
}

export function spawnShippedCli(
  fixture: SyntheticProject,
  overrides: Readonly<{
    guardChildCreation?: boolean;
    nodeExecutable?: string;
    pnpmExecutable?: string;
    pathValue?: string;
  }> = {},
): Promise<SpawnEvidence> {
  const environment = childEnvironment(
    fixture.root,
    overrides.pathValue ?? fixture.toolDirectory,
    fixture.expectedSelfSha256,
  );
  const guardedEnvironment = overrides.guardChildCreation === true
    ? {
        ...environment,
        NODE_OPTIONS: `--require=${JSON.stringify(
          fixturePath('spawnGuard.cjs').replace(/\\/g, '/'),
        )}`,
        REVIEW4_SPAWN_GUARD_READY_PATH: fixture.spawnGuardReadyPath,
        REVIEW4_SPAWN_RECORD_PATH: fixture.spawnRecordPath,
      }
    : environment;
  return spawnNodeScript(
    path.join(projectRoot(), 'scripts', 'quality-gate-v2', 'cli.cjs'),
    shippedCliArguments(fixture, overrides),
    fixture.root,
    guardedEnvironment,
  );
}

export function runnerBaseEnvironment(
  root: string,
  pathValue: string,
): Readonly<Record<string, string | undefined>> {
  return childEnvironment(root, pathValue);
}

export function directRequest(
  root: string,
  executable: string,
  args: readonly string[],
  pathValue: string,
): ProcessRequest {
  return {
    executable,
    args: [...args],
    cwd: root,
    env: {
      ANDROID_HOME: path.join(root, 'review4-android-sdk'),
      ANDROID_SDK_ROOT: path.join(root, 'review4-android-sdk'),
      CI: '1',
      JAVA_HOME: path.join(root, 'review4-jdk'),
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

export function expectedFormalArgs(): readonly string[] {
  return [
    'exec',
    'jest',
    '--runInBand',
    '--ci',
    '--coverage=false',
    '--roots',
    BOOTSTRAP_ROOT,
  ];
}

export function expectedShippedCliStdout(): string {
  return `${COMPANION_STDOUT_JSON}\n${JSON.stringify({
    validatedManifests: 1,
    entries: 2,
    acceptedTestRoots: [BOOTSTRAP_ROOT],
    acceptedManifests: [BOOTSTRAP_MANIFEST],
    excludedManifests: [],
  })}`;
}

export function makeRecordingRunner(): RecordingRunner {
  const requests: ProcessRequest[] = [];
  return {
    requests,
    async run(request: ProcessRequest): Promise<ProcessResult> {
      requests.push(request);
      return {
        exitCode: 0,
        signal: null,
        stdout: 'REVIEW4_RECORDING_RUNNER_OK',
        stderr: '',
        timedOut: false,
        timeoutSource: null,
        durationMs: 1,
      };
    },
  };
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

export function cliEnvironment(
  fixture: SyntheticProject,
  pathValue = fixture.toolDirectory,
): Readonly<Record<string, string | undefined>> {
  return childEnvironment(fixture.root, pathValue, fixture.expectedSelfSha256);
}

export function unsafeArtifacts(fixture: SyntheticProject): readonly string[] {
  const candidates = [
    fixture.companionRecordPath,
    fixture.spawnRecordPath,
    fixture.wrapperMarkerPath,
    fixture.reportDirectory,
  ];
  const found = candidates.filter(candidate => fs.existsSync(candidate));
  const pending = fs.readdirSync(fixture.root)
    .filter(name => {
      const candidate = path.join(fixture.root, name);
      return fs.lstatSync(candidate).isFile() && name.endsWith('.tmp');
    });
  return [...found, ...pending];
}

export function spawnFakeDoubleHop(root: string): Promise<SpawnEvidence> {
  return spawnNodeScript(
    fixturePath('fakeCli.cjs'),
    ['review4-lineage-control'],
    root,
    childEnvironment(root, process.env.PATH ?? ''),
  );
}

export function readCompanionRecords(root: string): readonly CompanionRecord[] {
  const raw = fs.readFileSync(path.join(root, COMPANION_RECORD), 'utf8');
  if (!raw.endsWith('\n')) {
    throw new Error('QUALITY_GATE_REVIEW4_COMPANION_RECORD_TRUNCATED');
  }
  return raw
    .slice(0, -1)
    .split('\n')
    .map(line => JSON.parse(line.replace(/\r$/, '')) as CompanionRecord);
}

export function readCompanionRecord(root: string): CompanionRecord {
  const records = readCompanionRecords(root);
  if (records.length !== 1) {
    throw new Error('QUALITY_GATE_REVIEW4_COMPANION_COUNT_INVALID');
  }
  return records[0] as CompanionRecord;
}

export function assertDirectCliParent(
  cliPid: number,
  companion: CompanionRecord,
): void {
  if (companion.ppid !== cliPid) {
    throw new Error('QUALITY_GATE_REVIEW4_LINEAGE_NOT_DIRECT');
  }
}
