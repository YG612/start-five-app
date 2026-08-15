import * as path from 'node:path';
import {
  cleanupTempDirectories,
  cliOverrides,
  createWindowsRunner,
  directPnpmRequest,
  errorCode,
  expectNoExecutionArtifacts,
  installDuplicateToolFixture,
  installReparseToolFixture,
  installSyntheticCliFixture,
  installToolFixture,
  installTraversalFixture,
  loadProductionCli,
  PNPM_LAUNCH_AMBIGUOUS_CODE,
  PNPM_LAUNCH_UNSAFE_CODE,
  snapshotTree,
  type ToolFixture,
} from './qualityGateV2Review3TestKit';

async function expectRejectedBeforeLaunch(
  fixture: ToolFixture,
  expectedCode: string,
  pathValue = fixture.pathValue,
): Promise<void> {
  const before = snapshotTree(fixture.root);
  const runner = createWindowsRunner(fixture, pathValue);
  const request = directPnpmRequest(fixture, 'pnpm', undefined, pathValue);
  let observed: unknown = null;
  try {
    await runner.run(request);
  } catch (error) {
    observed = error;
  }

  expectNoExecutionArtifacts(fixture, before);
  expect(errorCode(observed)).toBe(expectedCode);
}

afterEach(() => {
  cleanupTempDirectories();
});

describe('QUALITY-GATE-V2 Review3 fail-closed Windows pnpm candidates', () => {
  it('rejects a missing companion at the real CLI boundary without producing a failure report or temp file', async () => {
    const fixture = installSyntheticCliFixture('none');
    const before = snapshotTree(fixture.root);
    const {overrides, stdout, stderr} = cliOverrides(fixture);
    let observed: unknown = null;
    let exitCode: number | null = null;
    try {
      exitCode = await loadProductionCli().runCliProcess(
        fixture.defaultArgv,
        overrides,
      );
    } catch (error) {
      observed = error;
    }

    expectNoExecutionArtifacts(fixture, before);
    expect(exitCode).not.toBe(0);
    expect(stdout.value).toBe('');
    expect(`${errorCode(observed) ?? ''}\n${stderr.value}`).toContain(
      PNPM_LAUNCH_UNSAFE_CODE,
    );
  });

  it('rejects a wrapper whose only apparent companion traverses outside the tool root', async () => {
    const fixture = installTraversalFixture();

    await expectRejectedBeforeLaunch(fixture, PNPM_LAUNCH_UNSAFE_CODE);
  });

  it('rejects a non-regular higher-priority CJS candidate instead of downgrading to MJS', async () => {
    const fixture = installToolFixture('directory-cjs');

    await expectRejectedBeforeLaunch(fixture, PNPM_LAUNCH_UNSAFE_CODE);
  });

  it('rejects a tool identity reached through a junction before any companion or wrapper runs', async () => {
    const fixture = installReparseToolFixture();

    await expectRejectedBeforeLaunch(fixture, PNPM_LAUNCH_UNSAFE_CODE);
  });

  it('rejects a non-canonical PATH traversal spelling even when it resolves back to the seeded tool directory', async () => {
    const fixture = installToolFixture('cjs');
    const traversalPath =
      `${fixture.toolDirectory}\\..\\` +
      path.win32.basename(fixture.toolDirectory);

    await expectRejectedBeforeLaunch(
      fixture,
      PNPM_LAUNCH_UNSAFE_CODE,
      traversalPath,
    );
  });

  it('rejects two distinct eligible tool directories instead of selecting by PATH order', async () => {
    const {fixture} = installDuplicateToolFixture();

    await expectRejectedBeforeLaunch(
      fixture,
      PNPM_LAUNCH_AMBIGUOUS_CODE,
    );
  });

  it('rejects an exactly repeated candidate identity instead of silently deduplicating it', async () => {
    const fixture = installToolFixture('cjs');
    const repeatedPath =
      `${fixture.toolDirectory};${fixture.toolDirectory}`;

    await expectRejectedBeforeLaunch(
      fixture,
      PNPM_LAUNCH_AMBIGUOUS_CODE,
      repeatedPath,
    );
  });

  it('rejects a Windows-case variant of the same candidate identity as an ambiguity', async () => {
    const fixture = installToolFixture('cjs');
    const caseConflictPath =
      `${fixture.toolDirectory};` +
      fixture.toolDirectory.toUpperCase();

    await expectRejectedBeforeLaunch(
      fixture,
      PNPM_LAUNCH_AMBIGUOUS_CODE,
      caseConflictPath,
    );
  });
});
