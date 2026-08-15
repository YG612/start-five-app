import * as fs from 'node:fs';
import {
  baseEnvironment,
  cleanupTemporaryRoots,
  directRequest,
  installBoundaryFixture,
  launchWithSimplifiedPathCheck,
  loadProduction,
  readUtf8IfPresent,
  replaceAncestorAtBoundary,
  replaceCompanionAtBoundary,
  review6UnionAccepts,
  spawnActual,
  type BoundaryFixture,
  type LaunchOutcome,
  type SpawnBoundaryOptions,
} from './qualityGateV2Review6TestKit';

type BoundaryReplacement = (fixture: BoundaryFixture) => void;

async function observeProductionAcrossBoundary(
  replacement: BoundaryReplacement,
): Promise<Readonly<{fixture: BoundaryFixture; outcome: LaunchOutcome}>> {
  const fixture = installBoundaryFixture();
  let boundaryCalls = 0;
  const spawnMock = jest.fn((
    executable: string,
    args: readonly string[],
    options: SpawnBoundaryOptions,
  ) => {
    boundaryCalls += 1;
    if (boundaryCalls !== 1) {
      throw new Error('QUALITY_GATE_REVIEW6_MULTIPLE_BOUNDARY_CALLS');
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
  try {
    const result = await runner.run(directRequest(
      fixture.companionPath,
      fixture.root,
      fixture.toolDirectory,
    ));
    return {
      fixture,
      outcome: {result, error: null, boundaryCalls},
    };
  } catch (error: unknown) {
    return {
      fixture,
      outcome: {result: null, error, boundaryCalls},
    };
  }
}

afterEach(() => {
  jest.dontMock('node:child_process');
  jest.resetModules();
  cleanupTemporaryRoots();
});

describe('QUALITY-GATE-V2 Review6 validation-to-launch union oracle', () => {
  it.each([
    {label: 'companion bytes', replacement: replaceCompanionAtBoundary},
    {label: 'containing ancestor identity', replacement: replaceAncestorAtBoundary},
  ])('accepts only fail-closed or bound-safe execution after $label replacement', async ({replacement}) => {
    const {fixture, outcome} = await observeProductionAcrossBoundary(replacement);

    expect(review6UnionAccepts(fixture, outcome)).toBe(true);
  });

  it('rejects a simplified path launch that deterministically executes changed replacement bytes', async () => {
    const fixture = installBoundaryFixture();

    const result = await launchWithSimplifiedPathCheck(
      fixture,
      replaceCompanionAtBoundary,
    );
    const simplifiedOutcome: LaunchOutcome = {
      result,
      error: null,
      boundaryCalls: 1,
    };

    expect(result).toMatchObject({exitCode: 0, signal: null, stderr: ''});
    expect(result.stdout).toBe(`${fixture.changedPayloadId}\n`);
    expect(fs.existsSync(fixture.safeMarker)).toBe(false);
    expect(readUtf8IfPresent(fixture.changedMarker))
      .toBe(`${fixture.changedPayloadId}\n`);
    expect(review6UnionAccepts(fixture, simplifiedOutcome)).toBe(false);
  });
});
