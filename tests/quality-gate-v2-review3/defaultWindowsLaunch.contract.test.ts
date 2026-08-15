import * as fs from 'node:fs';
import {
  cleanupTempDirectories,
  cliOverrides,
  createWindowsRunner,
  directPnpmRequest,
  EXACT_PNPM_ARGS,
  expectSuccessfulCompanion,
  expectedCliRecordedEnvironment,
  expectedFormalArgs,
  installSyntheticCliFixture,
  installToolFixture,
  loadProductionCli,
  readCompanionRecord,
} from './qualityGateV2Review3TestKit';

afterEach(() => {
  cleanupTempDirectories();
});

describe('QUALITY-GATE-V2 Review3 safe Windows default pnpm launch', () => {
  it('runs the real default CLI through current Node and a regular CJS companion without executing the cmd lure', async () => {
    const fixture = installSyntheticCliFixture('cjs');
    const argvBefore = [...fixture.defaultArgv];
    const {overrides, stdout, stderr} = cliOverrides(fixture);

    const exitCode = await loadProductionCli().runCliProcess(
      fixture.defaultArgv,
      overrides,
    );

    expect(exitCode).toBe(0);
    expect(fixture.defaultArgv).toEqual(argvBefore);
    expect(stdout.value.startsWith('REVIEW3_CJS_COMPANION_OK')).toBe(true);
    expect(JSON.parse(
      stdout.value.slice('REVIEW3_CJS_COMPANION_OK'.length),
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
    expect(readCompanionRecord(fixture)).toEqual({
      runtime: 'cjs',
      argv: expectedFormalArgs(),
      cwd: fixture.root,
      execPath: process.execPath,
      environment: expectedCliRecordedEnvironment(fixture),
    });
    expect(fs.readFileSync(fixture.pidPath, 'utf8')).toMatch(/^[1-9][0-9]*$/);
    expect(fs.existsSync(fixture.cmdMarkerPath)).toBe(false);
    expect(fs.existsSync(fixture.shellMarkerPath)).toBe(false);
    expect(JSON.parse(fs.readFileSync(fixture.reportPath, 'utf8'))).toMatchObject({
      schema: 'start-five.quality-gate-report',
      version: 1,
      mode: 'test',
      status: 'passed',
      projectRoot: fixture.root,
      stages: [
        {id: 'formal-tests', status: 'passed'},
        {id: 'lock-manifests', status: 'passed'},
      ],
      failure: null,
    });
    expect(fs.existsSync(fixture.summaryPath)).toBe(true);
  });

  it('uses a regular MJS companion when no CJS companion exists and keeps hostile-looking argv literal', async () => {
    const fixture = installToolFixture('mjs');
    const runner = createWindowsRunner(fixture);
    const request = directPnpmRequest(fixture);
    const requestBefore = JSON.stringify(request);

    const result = await runner.run(request);

    expect(JSON.stringify(request)).toBe(requestBefore);
    expectSuccessfulCompanion(fixture, result, 'mjs', EXACT_PNPM_ARGS);
  });

  it('uses the regular CJS priority when both CJS and MJS companions exist in one canonical tool identity', async () => {
    const fixture = installToolFixture('both');
    const runner = createWindowsRunner(fixture);
    const request = directPnpmRequest(fixture);

    const result = await runner.run(request);

    expectSuccessfulCompanion(fixture, result, 'cjs', EXACT_PNPM_ARGS);
  });
});
