import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  cleanupTemporaryRoots,
  cliEnvironment,
  COMPANION_STDOUT_JSON,
  directRequest,
  expectedFormalArgs,
  expectedShippedCliStdout,
  fixturePath,
  installDuplicatePathProject,
  installSyntheticProjectMode,
  loadProduction,
  loadProductionCli,
  makeRecordingRunner,
  readCompanionRecord,
  readCompanionRecords,
  runnerBaseEnvironment,
  shippedCliArguments,
  spawnShippedCli,
  textSink,
  unsafeArtifacts,
  type SpawnEvidence,
} from './qualityGateV2Review4TestKit';

const UNSAFE_CODE = 'QUALITY_GATE_PNPM_LAUNCH_UNSAFE';
const AMBIGUOUS_CODE = 'QUALITY_GATE_PNPM_LAUNCH_AMBIGUOUS';

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
  cleanupTemporaryRoots();
});

describe('QUALITY-GATE-V2 Review4 preservation of qualified Review3 behavior', () => {
  it.each([
    {mode: 'mjs' as const, expectedRuntime: 'mjs' as const},
    {mode: 'both' as const, expectedRuntime: 'cjs' as const},
  ])('uses the $expectedRuntime companion for the $mode canonical layout', async control => {
    const fixture = installSyntheticProjectMode(control.mode);

    const cli = await spawnShippedCli(fixture);

    expect(cli).toMatchObject({exitCode: 0, signal: null, stderr: ''});
    const records = readCompanionRecords(fixture.root);
    expect(records).toHaveLength(1);
    expect(cli.stdout).toBe(expectedShippedCliStdout());
    expect(readCompanionRecord(fixture.root)).toMatchObject({
      runtime: control.expectedRuntime,
      argv: expectedFormalArgs(),
      cwd: fixture.root,
      execPath: process.execPath,
    });
    expect(fs.existsSync(fixture.wrapperMarkerPath)).toBe(false);
  });

  it('rejects a missing companion before child or report evidence', async () => {
    const fixture = installSyntheticProjectMode('none');

    const cli = await spawnShippedCli(fixture, {guardChildCreation: true});

    expect(fs.readFileSync(fixture.spawnGuardReadyPath, 'utf8'))
      .toBe('REVIEW4_SPAWN_GUARD_READY\n');
    expectStableCliFailure(cli, UNSAFE_CODE, fixture.root);
    expect(fs.existsSync(fixture.spawnRecordPath)).toBe(false);
    expect(unsafeArtifacts(fixture)).toEqual([]);
  });

  it('rejects two eligible PATH tool identities as ambiguous before evidence', async () => {
    const fixture = installDuplicatePathProject();

    const cli = await spawnShippedCli(fixture, {guardChildCreation: true});

    expect(fs.readFileSync(fixture.spawnGuardReadyPath, 'utf8'))
      .toBe('REVIEW4_SPAWN_GUARD_READY\n');
    expectStableCliFailure(cli, AMBIGUOUS_CODE, fixture.root);
    expect(fs.existsSync(fixture.spawnRecordPath)).toBe(false);
    expect(unsafeArtifacts(fixture)).toEqual([]);
  });

  it('rejects a non-canonical PATH traversal spelling before evidence', async () => {
    const fixture = installSyntheticProjectMode('cjs');
    const traversal = `${fixture.toolDirectory}\\..\\${path.win32.basename(fixture.toolDirectory)}`;

    const cli = await spawnShippedCli(fixture, {
      guardChildCreation: true,
      pathValue: traversal,
    });

    expect(fs.readFileSync(fixture.spawnGuardReadyPath, 'utf8'))
      .toBe('REVIEW4_SPAWN_GUARD_READY\n');
    expectStableCliFailure(cli, UNSAFE_CODE, fixture.root);
    expect(fs.existsSync(fixture.spawnRecordPath)).toBe(false);
    expect(unsafeArtifacts(fixture)).toEqual([]);
  });

  it('preserves an explicit pnpm path byte-for-byte during parsing', () => {
    const fixture = installSyntheticProjectMode('none');
    const explicitPnpm = path.join(fixture.root, 'trusted tool', 'pnpm.exe');

    const parsed = loadProduction().parseQualityGateCliArgs(
      [...shippedCliArguments(fixture), '--pnpm', explicitPnpm],
      fixture.root,
      cliEnvironment(fixture),
    );

    expect(parsed.pnpmExecutable).toBe(explicitPnpm);
    expect(parsed.projectRoot).toBe(fixture.root);
    expect(fs.existsSync(fixture.wrapperMarkerPath)).toBe(false);
  });

  it('preserves shell-free generic executable runner behavior independently of pnpm resolution', async () => {
    const fixture = installSyntheticProjectMode('none');
    const runner = loadProduction().createNodeProcessRunner({
      baseEnvironment: runnerBaseEnvironment(fixture.root, fixture.toolDirectory),
      platform: 'win32',
      nodeExecutable: process.execPath,
    });
    const literalArgs = [
      fixturePath('pnpmCompanion.cjs'),
      'review4 literal & no shell',
      '',
    ];

    const result = await runner.run(directRequest(
      fixture.root,
      process.execPath,
      literalArgs,
      fixture.toolDirectory,
    ));

    const records = readCompanionRecords(fixture.root);
    expect(records).toHaveLength(1);
    expect(result).toMatchObject({
      exitCode: 0,
      signal: null,
      stdout: `${COMPANION_STDOUT_JSON}\n`,
      stderr: '',
      timedOut: false,
      timeoutSource: null,
    });
    expect(readCompanionRecord(fixture.root)).toMatchObject({
      runtime: 'cjs',
      argv: literalArgs.slice(1),
      cwd: fixture.root,
      execPath: process.execPath,
    });
    expect(fs.existsSync(fixture.wrapperMarkerPath)).toBe(false);
  });

  it('preserves the accepted non-Windows preflight without starting a stage process', async () => {
    const fixture = installSyntheticProjectMode('none');
    const runner = makeRecordingRunner();
    const stdout = textSink();
    const stderr = textSink();

    const exitCode = await loadProductionCli().runCliProcess(
      shippedCliArguments(fixture),
      {
        cwd: fixture.root,
        platform: 'linux',
        environment: cliEnvironment(fixture),
        bootstrapExpectedSelfSha256: fixture.expectedSelfSha256,
        stdout: stdout.sink,
        stderr: stderr.sink,
        now: () => '2026-08-06T00:00:00.000Z',
        runId: 'quality-gate-v2-review4-non-windows',
        processRunner: runner,
      },
    );

    expect(exitCode).toBe(1);
    expect(stdout.read()).toBe('');
    expect(stderr.read()).toContain('QUALITY_GATE_PLATFORM_UNSUPPORTED');
    expect(runner.requests).toEqual([]);
    expect(JSON.parse(fs.readFileSync(
      path.join(fixture.reportDirectory, 'quality-gate-report.json'),
      'utf8',
    ))).toMatchObject({
      schema: 'start-five.quality-gate-report',
      mode: 'test',
      status: 'failed',
      failure: {stderr: expect.stringContaining('QUALITY_GATE_PLATFORM_UNSUPPORTED')},
    });
  });
});
