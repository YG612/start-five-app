import {spawn as actualSpawn} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  baseEnvironment,
  cleanupTemporaryRoots,
  createTemporaryRoot,
  directRequest,
  loadProduction,
  readUtf8IfPresent,
  review6UnionAccepts,
  type BoundaryFixture,
  type LaunchOutcome,
  type ProcessResult,
  type SpawnBoundaryOptions,
} from './qualityGateV2Review6TestKit';

type ChangeLevel = 'first' | 'middle' | 'parent';

type LocalChainFixture = BoundaryFixture & Readonly<{
  levels: readonly [string, string, string, string];
  changedDirectory: string;
  replacementDirectory: string;
  heldDirectoryForChange: string;
}>;

function payloadSource(markerPath: string, payloadId: string): string {
  return [
    "'use strict';",
    "const fs = require('node:fs');",
    `fs.appendFileSync(${JSON.stringify(markerPath)}, ${JSON.stringify(payloadId + '\n')}, 'utf8');`,
    `process.stdout.write(${JSON.stringify(payloadId + '\n')});`,
    '',
  ].join('\n');
}

function suffixBelow(level: ChangeLevel): readonly string[] {
  if (level === 'first') return ['level-2', 'level-3', 'level-4'];
  if (level === 'middle') return ['level-3', 'level-4'];
  return [];
}

function installLocalChain(level: ChangeLevel): LocalChainFixture {
  const root = createTemporaryRoot();
  const level1 = path.join(root, 'level-1');
  const level2 = path.join(level1, 'level-2');
  const level3 = path.join(level2, 'level-3');
  const level4 = path.join(level3, 'level-4');
  const levels: readonly [string, string, string, string] = [
    level1,
    level2,
    level3,
    level4,
  ];
  fs.mkdirSync(level4, {recursive: true});
  const safeMarker = path.join(root, 'baseline.marker');
  const changedMarker = path.join(root, 'changed.marker');
  const safePayloadId = 'REVIEW6_LOCAL_BASELINE';
  const changedPayloadId = 'REVIEW6_LOCAL_CHANGED';
  const companionPath = path.join(level4, 'pnpm.cjs');
  fs.writeFileSync(companionPath, payloadSource(safeMarker, safePayloadId), 'utf8');

  const selectedIndex = level === 'first' ? 0 : level === 'middle' ? 1 : 3;
  const changedDirectory = levels[selectedIndex];
  const replacementDirectory = path.join(root, `replacement-${level}`);
  const replacementLeaf = path.join(replacementDirectory, ...suffixBelow(level));
  fs.mkdirSync(replacementLeaf, {recursive: true});
  const replacementCompanion = path.join(replacementLeaf, 'pnpm.cjs');
  fs.writeFileSync(
    replacementCompanion,
    payloadSource(changedMarker, changedPayloadId),
    'utf8',
  );

  return {
    root,
    levels,
    changedDirectory,
    replacementDirectory,
    heldDirectoryForChange: path.join(root, `held-${level}`),
    toolDirectory: level4,
    companionPath,
    changedCompanionPath: replacementCompanion,
    heldDirectory: path.join(root, 'unused-held'),
    replacementToolDirectory: replacementDirectory,
    safeMarker,
    changedMarker,
    reportDirectory: path.join(root, 'reports'),
    recorderPath: path.join(root, 'launch.recorder'),
    launchTemporaryPath: path.join(root, 'launch.tmp'),
    safePayloadId,
    changedPayloadId,
  };
}

function applyDirectoryChange(fixture: LocalChainFixture): void {
  fs.renameSync(fixture.changedDirectory, fixture.heldDirectoryForChange);
  fs.renameSync(fixture.replacementDirectory, fixture.changedDirectory);
}

async function observeProductionWithChainChange(
  level: ChangeLevel,
): Promise<Readonly<{
  fixture: LocalChainFixture;
  outcome: LaunchOutcome;
  changeApplied: boolean;
}>> {
  const fixture = installLocalChain(level);
  const realFs = jest.requireActual<typeof import('node:fs')>('node:fs');
  let companionChecks = 0;
  let boundaryCalls = 0;
  const lstatSync = jest.fn((
    filePath: string,
    options?: Readonly<{bigint?: boolean}>,
  ) => {
    const stat = options?.bigint === true
      ? realFs.lstatSync(filePath, {bigint: true})
      : realFs.lstatSync(filePath);
    if (filePath.toLowerCase() === fixture.companionPath.toLowerCase()) {
      companionChecks += 1;
      if (companionChecks === 2) applyDirectoryChange(fixture);
    }
    return stat;
  });
  jest.doMock('node:fs', () => ({...realFs, lstatSync}));
  const spawnMock = jest.fn((
    executable: string,
    args: readonly string[],
    options: SpawnBoundaryOptions,
  ) => {
    boundaryCalls += 1;
    return actualSpawn(executable, [...args], options);
  });
  jest.doMock('node:child_process', () => ({
    ...jest.requireActual<typeof import('node:child_process')>('node:child_process'),
    spawn: spawnMock,
  }));
  const runner = loadProduction().createNodeProcessRunner({
    baseEnvironment: baseEnvironment(fixture.toolDirectory),
    platform: 'win32',
    nodeExecutable: process.execPath,
  });
  try {
    const result = await runner.run(directRequest(
      fixture.companionPath,
      fixture.root,
      fixture.toolDirectory,
    ));
    return {
      fixture,
      outcome: {result, error: null, boundaryCalls},
      changeApplied: companionChecks >= 2,
    };
  } catch (error: unknown) {
    return {
      fixture,
      outcome: {result: null, error, boundaryCalls},
      changeApplied: companionChecks >= 2,
    };
  }
}

async function runOrdinaryChain(): Promise<Readonly<{
  fixture: LocalChainFixture;
  result: ProcessResult;
  spawnMock: jest.Mock;
}>> {
  const fixture = installLocalChain('parent');
  const spawnMock = jest.fn((
    executable: string,
    args: readonly string[],
    options: SpawnBoundaryOptions,
  ) => actualSpawn(executable, [...args], options));
  jest.doMock('node:child_process', () => ({
    ...jest.requireActual<typeof import('node:child_process')>('node:child_process'),
    spawn: spawnMock,
  }));
  const runner = loadProduction().createNodeProcessRunner({
    baseEnvironment: baseEnvironment(fixture.toolDirectory),
    platform: 'win32',
    nodeExecutable: process.execPath,
  });
  const result = await runner.run(directRequest(
    fixture.companionPath,
    fixture.root,
    fixture.toolDirectory,
  ));
  return {fixture, result, spawnMock};
}

afterEach(() => {
  jest.dontMock('node:fs');
  jest.dontMock('node:child_process');
  jest.resetModules();
  cleanupTemporaryRoots();
});

describe('QUALITY-GATE-V2 Review6 multi-level local path consistency', () => {
  it.each([
    {label: 'first level', level: 'first' as const},
    {label: 'middle level', level: 'middle' as const},
    {label: 'direct parent', level: 'parent' as const},
  ])('detects a $label inspection-to-launch state change', async ({level}) => {
    const {fixture, outcome, changeApplied} = await observeProductionWithChainChange(level);

    expect(fixture.levels).toHaveLength(4);
    expect(changeApplied).toBe(true);
    expect(fs.readFileSync(fixture.companionPath, 'utf8'))
      .toContain(fixture.changedPayloadId);
    expect(review6UnionAccepts(fixture, outcome)).toBe(true);
  });

  it('runs the inspected baseline file exactly once through an unchanged ordinary chain', async () => {
    const {fixture, result, spawnMock} = await runOrdinaryChain();

    expect(result).toMatchObject({exitCode: 0, signal: null, stderr: ''});
    expect(result.stdout).toBe(`${fixture.safePayloadId}\n`);
    expect(readUtf8IfPresent(fixture.safeMarker)).toBe(`${fixture.safePayloadId}\n`);
    expect(fs.existsSync(fixture.changedMarker)).toBe(false);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock).toHaveBeenCalledWith(
      process.execPath,
      [fixture.companionPath, 'review6-literal-argument', ''],
      expect.objectContaining({shell: false}),
    );
  });

  it('shows a direct-parent-only example misses a first-level change and the union oracle rejects it', async () => {
    const fixture = installLocalChain('first');
    const inspected = [path.dirname(fixture.companionPath), fixture.companionPath];
    for (const filePath of inspected) expect(fs.lstatSync(filePath).isSymbolicLink()).toBe(false);
    applyDirectoryChange(fixture);

    const result = await new Promise<LaunchOutcome['result']>((resolve, reject) => {
      const child = actualSpawn(process.execPath, [fixture.companionPath], {
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
    const simplifiedOutcome: LaunchOutcome = {result, error: null, boundaryCalls: 1};

    expect(result?.stdout).toBe(`${fixture.changedPayloadId}\n`);
    expect(fs.existsSync(fixture.safeMarker)).toBe(false);
    expect(readUtf8IfPresent(fixture.changedMarker))
      .toBe(`${fixture.changedPayloadId}\n`);
    expect(review6UnionAccepts(fixture, simplifiedOutcome)).toBe(false);
  });
});
