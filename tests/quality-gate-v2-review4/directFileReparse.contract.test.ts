import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  cleanupTemporaryRoots,
  createOrdinaryHardlinkFixture,
  directRequest,
  installJunctionSyntheticProject,
  installReparseSyntheticProject,
  runnerBaseEnvironment,
  spawnShippedCli,
  unsafeArtifacts,
  type ProductionModule,
  type ReparseKind,
  type SpawnEvidence,
} from './qualityGateV2Review4TestKit';

const UNSAFE_CODE = 'QUALITY_GATE_PNPM_LAUNCH_UNSAFE';

function expectStableCliFailure(
  evidence: SpawnEvidence,
  code: string,
  temporaryRoot: string,
): void {
  expect(evidence.exitCode).toBe(1);
  expect(evidence.signal).toBeNull();
  expect(evidence.stdout).toBe('');
  expect(evidence.stderr).toBe(code);
  expect(evidence.stderr).not.toContain(temporaryRoot);
  expect(evidence.stderr).not.toContain(path.dirname(temporaryRoot));
  expect(evidence.stderr).not.toContain(String(evidence.pid));
  expect(evidence.stderr).not.toMatch(/\b(?:pid|ppid)\b/i);
}

afterEach(() => {
  jest.dontMock('node:child_process');
  jest.resetModules();
  cleanupTemporaryRoots();
});

describe('QUALITY-GATE-V2 Review4 direct-file reparse fail-closed matrix', () => {
  it.each<ReparseKind>(['wrapper', 'cjs', 'mjs', 'node'])(
    'rejects a direct-file %s reparse before child, recorder, report, or temp evidence',
    async kind => {
      const fixture = installReparseSyntheticProject(kind);
      expect(fs.lstatSync(fixture.reparsePath).isSymbolicLink()).toBe(true);

      const cli = await spawnShippedCli(
        fixture,
        {
          guardChildCreation: true,
          ...(fixture.nodeExecutable === undefined
            ? {}
            : {nodeExecutable: fixture.nodeExecutable}),
        },
      );

      expect(fs.readFileSync(fixture.spawnGuardReadyPath, 'utf8'))
        .toBe('REVIEW4_SPAWN_GUARD_READY\n');
      expectStableCliFailure(cli, UNSAFE_CODE, fixture.root);
      expect(fs.existsSync(fixture.spawnRecordPath)).toBe(false);
      expect(unsafeArtifacts(fixture)).toEqual([]);
    },
  );

  it('rejects a high-priority reparse CJS instead of falling through to a valid lower-priority MJS', async () => {
    const fixture = installReparseSyntheticProject('cjs');
    expect(fs.lstatSync(fixture.reparsePath).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(
      fixture.reparsePath.replace(/pnpm\.cjs$/, 'pnpm.mjs'),
    ).isFile()).toBe(true);

    const cli = await spawnShippedCli(fixture, {guardChildCreation: true});

    expect(fs.readFileSync(fixture.spawnGuardReadyPath, 'utf8'))
      .toBe('REVIEW4_SPAWN_GUARD_READY\n');
    expectStableCliFailure(cli, UNSAFE_CODE, fixture.root);
    expect(fs.existsSync(fixture.spawnRecordPath)).toBe(false);
    expect(unsafeArtifacts(fixture)).toEqual([]);
  });

  it('rejects an explicit executable-file reparse before the process spawn boundary', async () => {
    const fixture = installReparseSyntheticProject('exe');
    const spawnMock = jest.fn(() => {
      throw new Error('QUALITY_GATE_REVIEW4_SPAWN_MUST_NOT_RUN');
    });
    jest.doMock('node:child_process', () => ({
      ...jest.requireActual('node:child_process'),
      spawn: spawnMock,
    }));
    const production = jest.requireActual<ProductionModule>(
      '../../scripts/quality-gate-v2/index.cjs',
    );
    const runner = production.createNodeProcessRunner({
      baseEnvironment: runnerBaseEnvironment(fixture.root, fixture.toolDirectory),
      platform: 'win32',
      nodeExecutable: process.execPath,
    });

    await expect(runner.run(directRequest(
      fixture.root,
      fixture.pnpmExecutable ?? fixture.reparsePath,
      ['review4-explicit-reparse-control'],
      fixture.toolDirectory,
    ))).rejects.toMatchObject({code: UNSAFE_CODE, message: UNSAFE_CODE});
    expect(spawnMock).not.toHaveBeenCalled();
    expect(unsafeArtifacts(fixture)).toEqual([]);
  });

  it('accepts an ordinary hard link through resolution and reaches the mocked spawn boundary exactly once', async () => {
    const fixture = createOrdinaryHardlinkFixture();
    const spawnMock = jest.fn(() => {
      throw new Error('QUALITY_GATE_REVIEW4_ORDINARY_SPAWN_CONTROL');
    });
    jest.doMock('node:child_process', () => ({
      ...jest.requireActual('node:child_process'),
      spawn: spawnMock,
    }));
    const production = jest.requireActual<ProductionModule>(
      '../../scripts/quality-gate-v2/index.cjs',
    );
    const runner = production.createNodeProcessRunner({
      baseEnvironment: runnerBaseEnvironment(fixture.root, fixture.root),
      platform: 'win32',
      nodeExecutable: process.execPath,
    });

    await expect(runner.run(directRequest(
      fixture.root,
      fixture.executable,
      ['review4-ordinary-hardlink-control'],
      fixture.root,
    ))).rejects.toMatchObject({code: 'QUALITY_GATE_PROCESS_START_FAILED'});

    expect(fs.lstatSync(fixture.executable).isFile()).toBe(true);
    expect(fs.lstatSync(fixture.executable).isSymbolicLink()).toBe(false);
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('preserves fail-closed rejection for a PATH directory junction', async () => {
    const fixture = installJunctionSyntheticProject();
    expect(fs.lstatSync(fixture.toolDirectory).isSymbolicLink()).toBe(true);

    const cli = await spawnShippedCli(fixture, {guardChildCreation: true});

    expect(fs.readFileSync(fixture.spawnGuardReadyPath, 'utf8'))
      .toBe('REVIEW4_SPAWN_GUARD_READY\n');
    expectStableCliFailure(cli, UNSAFE_CODE, fixture.root);
    expect(fs.existsSync(fixture.spawnRecordPath)).toBe(false);
    expect(unsafeArtifacts(fixture)).toEqual([]);
  });
});
