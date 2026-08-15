import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  PROCESS_START_FAILED,
  cleanupTemporaryRoots,
  cliArguments,
  installCliFixture,
  loadProductionCli,
  textSink,
  type FileIdentity,
  type SpawnBoundaryOptions,
} from './qualityGateV2Review7TestKit';

type VirtualStat = Readonly<{
  dev: number;
  ino: number;
  mode: number;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}>;

type ValidationEvent = Readonly<{
  requestedPath: string;
  canonicalPath: string;
  identity: FileIdentity;
}>;

type RecordedSpawn = Readonly<{
  executable: string;
  args: readonly string[];
  options: SpawnBoundaryOptions;
}>;

function canonicalWindows(filePath: string): string {
  return filePath.replaceAll('/', '\\');
}

function pathKey(filePath: string): string {
  return canonicalWindows(filePath).toLowerCase();
}

function virtualStat(filePath: string): VirtualStat {
  const canonical = canonicalWindows(filePath);
  const isFile = /\.[a-z0-9]+$/i.test(canonical);
  const digest = crypto.createHash('sha256')
    .update(pathKey(canonical), 'utf8')
    .digest('hex');
  const ino = Number.parseInt(digest.slice(0, 12), 16);
  return {
    dev: 907,
    ino,
    mode: isFile ? 33_188 : 16_893,
    isFile: () => isFile,
    isDirectory: () => !isFile,
    isSymbolicLink: () => false,
  };
}

function identityOf(filePath: string, stat = virtualStat(filePath)): FileIdentity {
  return {
    canonicalPath: canonicalWindows(filePath),
    dev: BigInt(stat.dev),
    ino: BigInt(stat.ino),
    mode: BigInt(stat.mode),
    kind: stat.isFile() ? 'file' : 'directory',
  };
}

function expectedChain(filePath: string): readonly string[] {
  const normalized = canonicalWindows(filePath);
  let root: string;
  let remaining: string;
  if (normalized.startsWith('\\\\')) {
    const parts = normalized.slice(2).split('\\').filter(Boolean);
    const server = parts[0] ?? '';
    const share = parts[1] ?? '';
    root = `\\\\${server}\\${share}\\`;
    remaining = parts.slice(2).join('\\');
  } else {
    root = normalized.slice(0, 3);
    remaining = normalized.slice(3);
  }
  const segments = remaining.split('\\').filter(Boolean);
  const chain: string[] = [root];
  let cursor = root;
  for (const segment of segments) {
    cursor = path.win32.join(cursor, segment);
    chain.push(cursor);
  }
  return chain;
}

function hasCompleteOrderedValidation(
  trace: readonly ValidationEvent[],
  target: string,
): boolean {
  let previousIndex = -1;
  for (const expected of expectedChain(target)) {
    const matching = trace
      .map((event, index) => ({event, index}))
      .filter(({event, index}) => index > previousIndex &&
        pathKey(event.canonicalPath) === pathKey(expected));
    if (matching.length < 3) return false;
    const first = matching[0];
    const identity = first?.event.identity;
    if (first === undefined || identity === undefined) return false;
    const sameObjectChecks = matching.slice(0, 3).every(({event}) =>
      event.identity.dev === identity.dev &&
      event.identity.ino === identity.ino &&
      event.identity.mode === identity.mode &&
      event.identity.kind === identity.kind,
    );
    if (!sameObjectChecks) return false;
    previousIndex = matching[2]?.index ?? -1;
  }
  return previousIndex >= 0;
}

function traceBindsSpawnTarget(
  trace: readonly ValidationEvent[],
  spawnPath: string,
  expectedKind: FileIdentity['kind'],
): boolean {
  if (!hasCompleteOrderedValidation(trace, spawnPath)) return false;
  const targetIdentity = identityOf(spawnPath);
  const finalEvents = trace.filter(event =>
    pathKey(event.canonicalPath) === pathKey(spawnPath));
  return finalEvents.some(event =>
    event.identity.canonicalPath.toLowerCase() === targetIdentity.canonicalPath.toLowerCase() &&
    event.identity.dev === targetIdentity.dev &&
    event.identity.ino === targetIdentity.ino &&
    event.identity.mode === targetIdentity.mode &&
    event.identity.kind === expectedKind,
  );
}

function completeSyntheticTrace(target: string): readonly ValidationEvent[] {
  return expectedChain(target).flatMap(filePath => {
    const stat = virtualStat(filePath);
    const event: ValidationEvent = {
      requestedPath: filePath,
      canonicalPath: canonicalWindows(filePath),
      identity: identityOf(filePath, stat),
    };
    return [event, event, event];
  });
}

function installObservedFilesystem(fixtureRoot: string): ValidationEvent[] {
  const realFs = jest.requireActual<typeof import('node:fs')>('node:fs');
  const fixtureCanonical = realFs.realpathSync.native(fixtureRoot).toLowerCase();
  const trace: ValidationEvent[] = [];
  const belongsToFixture = (filePath: string): boolean => {
    const resolved = path.resolve(filePath).toLowerCase();
    return resolved === fixtureCanonical || resolved.startsWith(fixtureCanonical + path.sep);
  };
  const lstatSync = jest.fn((filePath: string) => {
    if (belongsToFixture(filePath)) return realFs.lstatSync(filePath);
    const canonicalPath = canonicalWindows(filePath);
    const stat = virtualStat(canonicalPath);
    trace.push({
      requestedPath: filePath,
      canonicalPath,
      identity: identityOf(canonicalPath, stat),
    });
    return stat;
  });
  const realpathSync = ((filePath: string): string =>
    belongsToFixture(filePath)
      ? realFs.realpathSync(filePath)
      : canonicalWindows(filePath)) as typeof fs.realpathSync;
  realpathSync.native = (filePath: string): string =>
    belongsToFixture(filePath)
      ? realFs.realpathSync.native(filePath)
      : canonicalWindows(filePath);
  jest.doMock('node:fs', () => ({...realFs, lstatSync, realpathSync}));
  return trace;
}

async function runSafeControl(token: string): Promise<Readonly<{
  exitCode: number;
  stderr: string;
  trace: readonly ValidationEvent[];
  fixture: ReturnType<typeof installCliFixture>;
  spawn: RecordedSpawn | null;
}>> {
  const fixture = installCliFixture();
  const trace = installObservedFilesystem(fixture.root);
  let recorded: RecordedSpawn | null = null;
  const spawnMock = jest.fn((
    executable: string,
    args: readonly string[],
    options: SpawnBoundaryOptions,
  ) => {
    recorded = {executable, args, options};
    throw new Error('QUALITY_GATE_REVIEW7_SAFE_BOUNDARY');
  });
  jest.doMock('node:child_process', () => ({
    ...jest.requireActual<typeof import('node:child_process')>('node:child_process'),
    spawn: spawnMock,
  }));
  const stdout = textSink();
  const stderr = textSink();
  const exitCode = await loadProductionCli().runCliProcess(
    cliArguments(fixture, token),
    {
      cwd: 'D:\\review7-launch-cwd',
      platform: 'win32',
      environment: {PATH: 'C:\\approved\\bin', PATHEXT: '.COM;.EXE;.BAT;.CMD'},
      bootstrapExpectedSelfSha256: fixture.expectedSelfSha256,
      stdout: stdout.sink,
      stderr: stderr.sink,
      now: () => '2026-08-08T00:00:00.000Z',
      runId: 'quality-gate-v2-review7-safe-binding',
    },
  );
  return {exitCode, stderr: stderr.read(), trace, fixture, spawn: recorded};
}

afterEach(() => {
  jest.dontMock('node:fs');
  jest.dontMock('node:child_process');
  jest.resetModules();
  cleanupTemporaryRoots();
});

describe('QUALITY-GATE-V2 Review7 safe Windows validation sequence and spawn binding', () => {
  it.each([
    {label: 'drive backslash', token: 'C:\\approved\\bin\\pnpm.cjs', expected: 'C:\\approved\\bin\\pnpm.cjs'},
    {label: 'drive forward slash', token: 'C:/approved/bin/pnpm.cjs', expected: 'C:\\approved\\bin\\pnpm.cjs'},
    {label: 'complete UNC', token: '\\\\approved-server\\approved-share\\bin\\pnpm.cjs', expected: '\\\\approved-server\\approved-share\\bin\\pnpm.cjs'},
  ])('binds complete root-to-target validation to both spawn objects for $label', async ({token, expected}) => {
    const observed = await runSafeControl(token);

    expect(observed.exitCode).toBe(1);
    expect(observed.stderr).toContain(PROCESS_START_FAILED);
    expect(observed.spawn).not.toBeNull();
    const spawned = observed.spawn as RecordedSpawn | null;
    expect(spawned).not.toBeNull();
    const executable = spawned?.executable ?? '';
    const companion = spawned?.args[0] ?? '';
    expect(pathKey(companion)).toBe(pathKey(expected));
    expect(spawned?.options.shell).toBe(false);
    expect(traceBindsSpawnTarget(observed.trace, executable, 'file')).toBe(true);
    expect(traceBindsSpawnTarget(observed.trace, companion, 'file')).toBe(true);
    expect(spawned?.args.slice(1)).toEqual([
      'exec', 'jest', '--runInBand', '--ci', '--coverage=false',
      '--roots', 'tests/quality-gate-v2',
    ]);
  });

  it.each([
    'C:\\approved\\bin\\pnpm.cjs',
    'C:/approved/bin/pnpm.cjs',
    '\\\\approved-server\\approved-share\\bin\\pnpm.cjs',
  ])('accepts a complete ordered synthetic trace for %s', target => {
    const trace = completeSyntheticTrace(target);
    expect(traceBindsSpawnTarget(trace, target, 'file')).toBe(true);
    const ordered = expectedChain(target).map(expected =>
      trace.findIndex(event => pathKey(event.canonicalPath) === pathKey(expected)),
    );
    expect(ordered).toEqual([...ordered].sort((left, right) => left - right));
  });

  it('rejects validation of an unrelated safe object as authority for the spawned target', () => {
    const unrelated = 'C:\\approved\\unrelated\\pnpm.cjs';
    const expectedSpawn = 'C:\\approved\\bin\\pnpm.cjs';
    const trace = completeSyntheticTrace(unrelated);

    expect(traceBindsSpawnTarget(trace, unrelated, 'file')).toBe(true);
    expect(traceBindsSpawnTarget(trace, expectedSpawn, 'file')).toBe(false);
  });
});
