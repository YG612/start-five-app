import * as fs from 'node:fs';
import {
  cleanupTempDirectories,
  cliOverrides,
  createRegularPnpmExeFixture,
  createWindowsRunner,
  directPnpmRequest,
  EXACT_PNPM_ARGS,
  expectedChildEnvironment,
  expectedRecordedEnvironment,
  expectedFormalArgs,
  explicitCliArgv,
  fixturePath,
  installSyntheticCliFixture,
  installToolFixture,
  invokeFixtureDirectly,
  loadProduction,
  loadProductionCli,
  orchestratorOptions,
  PLATFORM_UNSUPPORTED_CODE,
  readCompanionRecord,
  RecordingRunner,
  windowsBaseEnvironment,
} from './qualityGateV2Review3TestKit';

afterEach(() => {
  cleanupTempDirectories();
});

describe('QUALITY-GATE-V2 Review3 independent fixtures and compatibility controls', () => {
  it('proves the CJS companion fixture independently through current Node with literal argv', () => {
    const fixture = installToolFixture('none');

    const result = invokeFixtureDirectly(fixture, 'cjs');

    expect(result).toEqual({
      status: 0,
      signal: null,
      stdout: 'REVIEW3_CJS_COMPANION_OK',
      stderr: '',
    });
    expect(readCompanionRecord(fixture)).toEqual({
      runtime: 'cjs',
      argv: EXACT_PNPM_ARGS,
      cwd: fixture.root,
      execPath: process.execPath,
      environment: expectedRecordedEnvironment(fixture),
    });
  });

  it('proves the MJS companion fixture independently through current Node with literal argv', () => {
    const fixture = installToolFixture('none');

    const result = invokeFixtureDirectly(fixture, 'mjs');

    expect(result).toEqual({
      status: 0,
      signal: null,
      stdout: 'REVIEW3_MJS_COMPANION_OK',
      stderr: '',
    });
    expect(readCompanionRecord(fixture)).toEqual({
      runtime: 'mjs',
      argv: EXACT_PNPM_ARGS,
      cwd: fixture.root,
      execPath: process.execPath,
      environment: expectedRecordedEnvironment(fixture),
    });
  });

  it('preserves a genuine regular pnpm.exe as a direct shell-free executable', async () => {
    const {fixture, executable} = createRegularPnpmExeFixture();
    const runner = createWindowsRunner(fixture);
    const request = directPnpmRequest(
      fixture,
      'pnpm.exe',
      [fixturePath('pnpmCompanion.cjs'), ...EXACT_PNPM_ARGS],
    );

    const result = await runner.run(request);

    expect(fs.lstatSync(executable).isFile()).toBe(true);
    expect(fs.lstatSync(executable).isSymbolicLink()).toBe(false);
    expect(result).toMatchObject({
      exitCode: 0,
      signal: null,
      stdout: 'REVIEW3_CJS_COMPANION_OK',
      stderr: '',
      timedOut: false,
      timeoutSource: null,
    });
    expect(readCompanionRecord(fixture)).toMatchObject({
      runtime: 'cjs',
      argv: EXACT_PNPM_ARGS,
      cwd: fixture.root,
      environment: expectedRecordedEnvironment(fixture),
    });
    expect(fs.existsSync(fixture.cmdMarkerPath)).toBe(false);
  });

  it('preserves an explicit --pnpm value exactly during CLI parsing', () => {
    const fixture = installSyntheticCliFixture('none');
    const explicitPnpm = 'C:\\trusted tools & literal\\pnpm.exe';

    const parsed = loadProduction().parseQualityGateCliArgs(
      explicitCliArgv(fixture, explicitPnpm),
      fixture.root,
      windowsBaseEnvironment(fixture),
    );

    expect(parsed.pnpmExecutable).toBe(explicitPnpm);
    expect(parsed.projectRoot).toBe(fixture.root);
    expect(fs.existsSync(fixture.cmdMarkerPath)).toBe(false);
  });

  it('preserves explicit --pnpm through the real CLI plan without default resolution', async () => {
    const fixture = installSyntheticCliFixture('none');
    const explicitPnpm = 'C:\\trusted tools & literal\\pnpm.exe';
    const runner = new RecordingRunner();
    const {overrides, stdout, stderr} = cliOverrides(fixture, runner);

    const exitCode = await loadProductionCli().runCliProcess(
      explicitCliArgv(fixture, explicitPnpm),
      overrides,
    );

    expect(exitCode).toBe(0);
    expect(stdout.value.startsWith('REVIEW3_RECORDING_RUNNER_OK')).toBe(true);
    expect(JSON.parse(
      stdout.value.slice('REVIEW3_RECORDING_RUNNER_OK'.length),
    )).toEqual({
      validatedManifests: 2,
      entries: 4,
      acceptedTestRoots: [
        'tests/quality-gate-v2',
        'tests/review3-root&mkdir qgv2-review3-shell-marker',
      ],
      acceptedManifests: [
        'QUALITY_GATE_V2_LOCK.sha256',
        'REVIEW3_FAST_LOCK.sha256',
      ],
      excludedManifests: [],
    });
    expect(stderr.value).toBe('');
    expect(runner.requests).toHaveLength(1);
    expect(runner.requests[0]).toEqual({
      executable: explicitPnpm,
      args: expectedFormalArgs(),
      cwd: fixture.root,
      env: {
        ANDROID_HOME: 'C:\\review3 android sdk & literal',
        ANDROID_SDK_ROOT: 'C:\\review3 android sdk & literal',
        CI: '1',
        JAVA_HOME: 'C:\\review3 jdk & literal',
        PATH: fixture.pathValue,
      },
      timeoutMs: 20_000,
    });
    expect(fs.existsSync(fixture.cmdMarkerPath)).toBe(false);
  });

  it('keeps the explicit pnpm executable exact in both full-mode pnpm stages', () => {
    const fixture = installToolFixture('none');
    const explicitPnpm = 'C:\\trusted tools & literal\\pnpm.exe';
    const runner = new RecordingRunner();
    const orchestrator = loadProduction().createQualityGateOrchestrator(
      orchestratorOptions(fixture, explicitPnpm, runner),
    );

    const stages = orchestrator.plan('full');

    expect(stages.slice(0, 2).map(stage => ({
      id: stage.id,
      executable: stage.request?.executable,
    }))).toEqual([
      {id: 'formal-tests', executable: explicitPnpm},
      {id: 'typecheck', executable: explicitPnpm},
    ]);
  });

  it('preserves the accepted non-Windows unsupported preflight and starts no stage process', async () => {
    const fixture = installSyntheticCliFixture('none');
    const runner = new RecordingRunner();
    const {overrides, stdout, stderr} = cliOverrides(
      fixture,
      runner,
      'linux',
    );

    const exitCode = await loadProductionCli().runCliProcess(
      fixture.defaultArgv,
      overrides,
    );

    expect(exitCode).toBe(1);
    expect(stdout.value).toBe('');
    expect(stderr.value).toContain(PLATFORM_UNSUPPORTED_CODE);
    expect(runner.requests).toHaveLength(0);
    expect(JSON.parse(fs.readFileSync(fixture.reportPath, 'utf8'))).toMatchObject({
      schema: 'start-five.quality-gate-report',
      mode: 'test',
      status: 'failed',
      failure: {stderr: expect.stringContaining(PLATFORM_UNSUPPORTED_CODE)},
    });
    expect(fs.existsSync(fixture.cmdMarkerPath)).toBe(false);
  });

  it('keeps generic explicit executable runner semantics independent of pnpm resolution', async () => {
    const fixture = installToolFixture('none');
    const runner = createWindowsRunner(fixture);
    const request = directPnpmRequest(
      fixture,
      process.execPath,
      [fixturePath('pnpmCompanion.cjs'), ...EXACT_PNPM_ARGS],
    );

    const result = await runner.run(request);

    expect(result).toMatchObject({
      exitCode: 0,
      signal: null,
      stdout: 'REVIEW3_CJS_COMPANION_OK',
      stderr: '',
      timedOut: false,
      timeoutSource: null,
    });
    expect(readCompanionRecord(fixture)).toEqual({
      runtime: 'cjs',
      argv: EXACT_PNPM_ARGS,
      cwd: fixture.root,
      execPath: process.execPath,
      environment: expectedRecordedEnvironment(fixture),
    });
  });
});
