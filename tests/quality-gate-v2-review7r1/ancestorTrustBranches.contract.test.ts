import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  applyAncestorChange,
  baseEnvironment,
  captureIdentity,
  cleanupTemporaryRoots,
  installAncestorFixture,
  launchSimplifiedAfterChange,
  loadProduction,
  processRequest,
  readUtf8IfPresent,
  review7UnionAccepts,
  sameIdentity,
  spawnActual,
  type AncestorFixture,
  type ChangeLevel,
  type LaunchOutcome,
  type SpawnBoundaryOptions,
  type TrustBranch,
} from './qualityGateV2Review7TestKit';

const originalNodeExecutable = process.execPath;
const originalExecPathDescriptor = Object.getOwnPropertyDescriptor(process, 'execPath');

function replaceProcessExecPath(value: string): void {
  Object.defineProperty(process, 'execPath', {
    configurable: true,
    enumerable: originalExecPathDescriptor?.enumerable ?? true,
    writable: true,
    value,
  });
}

function restoreProcessExecPath(): void {
  if (originalExecPathDescriptor === undefined) {
    throw new Error('QUALITY_GATE_REVIEW7_EXEC_PATH_DESCRIPTOR_MISSING');
  }
  Object.defineProperty(process, 'execPath', originalExecPathDescriptor);
}

async function observeProduction(
  branch: TrustBranch,
  changeLevel: ChangeLevel,
): Promise<Readonly<{
  fixture: AncestorFixture;
  outcome: LaunchOutcome;
  beforeFile: ReturnType<typeof captureIdentity>;
  beforeParent: ReturnType<typeof captureIdentity>;
  afterFile: ReturnType<typeof captureIdentity>;
  afterParent: ReturnType<typeof captureIdentity>;
}>> {
  const fixture = installAncestorFixture(branch, changeLevel, originalNodeExecutable);
  const beforeFile = captureIdentity(fixture.finalPath);
  const beforeParent = captureIdentity(path.dirname(fixture.finalPath));
  let afterFile = beforeFile;
  let afterParent = beforeParent;
  let boundaryCalls = 0;
  const spawnMock = jest.fn((
    executable: string,
    args: readonly string[],
    options: SpawnBoundaryOptions,
  ) => {
    boundaryCalls += 1;
    applyAncestorChange(fixture);
    afterFile = captureIdentity(fixture.finalPath);
    afterParent = captureIdentity(path.dirname(fixture.finalPath));
    return spawnActual(executable, args, options);
  });
  jest.doMock('node:child_process', () => ({
    ...jest.requireActual<typeof import('node:child_process')>('node:child_process'),
    spawn: spawnMock,
  }));
  if (branch === 'current-node') replaceProcessExecPath(fixture.finalPath);
  try {
    const runner = loadProduction().createNodeProcessRunner({
      baseEnvironment: baseEnvironment(path.dirname(fixture.companionPath)),
      platform: 'win32',
      nodeExecutable: branch === 'current-node' ? fixture.finalPath : originalNodeExecutable,
    });
    try {
      const result = await runner.run(processRequest(fixture));
      return {
        fixture,
        outcome: {result, error: null, boundaryCalls},
        beforeFile,
        beforeParent,
        afterFile,
        afterParent,
      };
    } catch (error: unknown) {
      return {
        fixture,
        outcome: {result: null, error, boundaryCalls},
        beforeFile,
        beforeParent,
        afterFile,
        afterParent,
      };
    }
  } finally {
    if (branch === 'current-node') restoreProcessExecPath();
  }
}

afterEach(() => {
  jest.dontMock('node:child_process');
  jest.resetModules();
  if (process.execPath !== originalNodeExecutable) restoreProcessExecPath();
  cleanupTemporaryRoots();
});

describe.each([
  {label: 'selected companion', branch: 'companion' as const},
  {label: 'current Node executable', branch: 'current-node' as const},
])('QUALITY-GATE-V2 Review7 complete $label ancestor chain', ({branch}) => {
  it.each([
    {label: 'first', level: 'first' as const},
    {label: 'middle', level: 'middle' as const},
    {label: 'direct parent', level: 'parent' as const},
  ])('rejects an unbound $label ancestor change across all five levels', async ({level}) => {
    const observed = await observeProduction(branch, level);

    expect(observed.fixture.levels).toHaveLength(5);
    expect(sameIdentity(observed.beforeFile, observed.afterFile)).toBe(true);
    if (level !== 'parent') {
      expect(sameIdentity(observed.beforeParent, observed.afterParent)).toBe(true);
    }
    expect(review7UnionAccepts(observed.fixture, observed.outcome)).toBe(true);
  });

  it.each([
    {label: 'first', level: 'first' as const},
    {label: 'middle', level: 'middle' as const},
  ])('proves a final-plus-parent-only control misses the $label ancestor', async ({level}) => {
    const fixture = installAncestorFixture(branch, level, originalNodeExecutable);
    const beforeFile = captureIdentity(fixture.finalPath);
    const beforeParent = captureIdentity(path.dirname(fixture.finalPath));

    applyAncestorChange(fixture);

    const afterFile = captureIdentity(fixture.finalPath);
    const afterParent = captureIdentity(path.dirname(fixture.finalPath));
    expect(sameIdentity(beforeFile, afterFile)).toBe(true);
    expect(sameIdentity(beforeParent, afterParent)).toBe(true);
    const result = await launchSimplifiedAfterChange(fixture, originalNodeExecutable);
    const simplified: LaunchOutcome = {result, error: null, boundaryCalls: 1};

    expect(result).toMatchObject({exitCode: 0, signal: null, stderr: ''});
    expect(result.stdout).toBe('CHANGED\n');
    expect(fs.existsSync(fixture.safeMarker)).toBe(false);
    expect(readUtf8IfPresent(fixture.changedMarker)).toBe('CHANGED\n');
    expect(review7UnionAccepts(fixture, simplified)).toBe(false);
  });
});
