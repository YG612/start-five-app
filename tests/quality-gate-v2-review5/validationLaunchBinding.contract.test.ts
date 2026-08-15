import * as fs from 'node:fs';
import {
  assertSafePayloadOnly,
  baseEnvironment,
  cleanupTemporaryRoots,
  directRequest,
  installBoundaryFixture,
  launchVulnerablyAfterReplacement,
  loadProduction,
  readUtf8IfPresent,
  replaceAncestorAtBoundary,
  replaceCompanionAtBoundary,
  safePayloadExecutedOnly,
  spawnActual,
  type BoundaryFixture,
  type SpawnBoundaryOptions,
} from './qualityGateV2Review5TestKit';

type BoundaryReplacement = (fixture: BoundaryFixture) => void;

async function runProductionAcrossBoundary(
  replacement: BoundaryReplacement,
): Promise<void> {
  const fixture = installBoundaryFixture();
  let boundaryCalls = 0;
  const spawnMock = jest.fn((
    executable: string,
    args: readonly string[],
    options: SpawnBoundaryOptions,
  ) => {
    boundaryCalls += 1;
    if (boundaryCalls !== 1) {
      throw new Error('QUALITY_GATE_REVIEW5_MULTIPLE_BOUNDARY_CALLS');
    }
    replacement(fixture);
    return spawnActual(executable, args, options);
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

  const result = await runner.run(directRequest(
    fixture.companionPath,
    fixture.root,
    fixture.toolDirectory,
  ));

  expect(boundaryCalls).toBe(1);
  expect(spawnMock).toHaveBeenCalledTimes(1);
  assertSafePayloadOnly(fixture, result);
}

afterEach(() => {
  jest.dontMock('node:child_process');
  jest.resetModules();
  cleanupTemporaryRoots();
});

describe('QUALITY-GATE-V2 Review5 validation-to-launch binding', () => {
  it('executes only validated companion bytes when the pathname is replaced at spawn boundary', async () => {
    await runProductionAcrossBoundary(replaceCompanionAtBoundary);
  });

  it('executes only validated companion identity when its ancestor is replaced at spawn boundary', async () => {
    await runProductionAcrossBoundary(replaceAncestorAtBoundary);
  });

  it('proves the hostile oracle catches a deliberately vulnerable check-then-spawn path launch', async () => {
    const fixture = installBoundaryFixture();

    const result = await launchVulnerablyAfterReplacement(
      fixture,
      replaceCompanionAtBoundary,
    );

    expect(safePayloadExecutedOnly(fixture, result)).toBe(false);
    expect(result).toMatchObject({exitCode: 0, signal: null, stderr: ''});
    expect(result.stdout).toBe(`${fixture.hostilePayloadId}\n`);
    expect(fs.existsSync(fixture.safeMarker)).toBe(false);
    expect(readUtf8IfPresent(fixture.hostileMarker))
      .toBe(`${fixture.hostilePayloadId}\n`);
  });
});
