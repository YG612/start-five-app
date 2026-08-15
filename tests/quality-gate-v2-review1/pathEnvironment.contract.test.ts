import * as fs from 'node:fs';
import {
  cleanupTempDirectories,
  cliOverrides,
  errorCode,
  installSyntheticFixture,
  loadProductionCli,
  PATH_CONFLICT_CODE,
  PLATFORM_UNSUPPORTED_CODE,
  RecordingRunner,
} from './qualityGateV2Review1TestKit';

afterEach(() => {
  cleanupTempDirectories();
});

describe('QUALITY-GATE-V2 Review1 Windows PATH identity', () => {
  it.each(['Path', 'pAtH', 'PaTh'])(
    'canonicalizes the unique Windows %s spelling into exact stage PATH',
    async pathKey => {
      const production = loadProductionCli();
      const fixture = installSyntheticFixture();
      const runner = new RecordingRunner();
      const pathValue = 'C:\\review1\\node-bin;D:\\review1\\tools';
      const environment = Object.freeze({
        [pathKey]: pathValue,
        QUALITY_GATE_V2_BOOTSTRAP_SELF_SHA256:
          fixture.expectedSelfSha256,
      });
      const boundary = cliOverrides(fixture, environment, runner);

      const exitCode = await production.runCliProcess(
        fixture.argv,
        boundary.overrides,
      );

      expect(exitCode).toBe(0);
      expect(runner.requests).toHaveLength(1);
      expect(runner.requests[0]?.env).toEqual({
        ANDROID_HOME: 'C:\\review1\\android-sdk',
        ANDROID_SDK_ROOT: 'C:\\review1\\android-sdk',
        CI: '1',
        JAVA_HOME: 'C:\\review1\\jdk-17',
        PATH: pathValue,
      });
      expect(Object.keys(environment)).toEqual([
        pathKey,
        'QUALITY_GATE_V2_BOOTSTRAP_SELF_SHA256',
      ]);
    },
  );

  it('keeps canonical PATH as an independent control without mutating the frozen input', async () => {
    const production = loadProductionCli();
    const fixture = installSyntheticFixture();
    const runner = new RecordingRunner();
    const pathValue = 'C:\\review1\\canonical-node';
    const environment = Object.freeze({
      PATH: pathValue,
      QUALITY_GATE_V2_BOOTSTRAP_SELF_SHA256:
        fixture.expectedSelfSha256,
    });
    const originalEntries = Object.entries(environment);
    const boundary = cliOverrides(fixture, environment, runner);

    const exitCode = await production.runCliProcess(
      fixture.argv,
      boundary.overrides,
    );

    expect(exitCode).toBe(0);
    expect(runner.requests).toHaveLength(1);
    expect(runner.requests[0]?.env.PATH).toBe(pathValue);
    expect(Object.entries(environment)).toEqual(originalEntries);
    expect(boundary.stderr.value).toBe('');
  });

  it('collapses equal noncanonical Windows variants into one canonical stage PATH', async () => {
    const production = loadProductionCli();
    const fixture = installSyntheticFixture();
    const runner = new RecordingRunner();
    const pathValue = 'C:\\review1\\same-value';
    const environment = Object.freeze({
      Path: pathValue,
      pAtH: pathValue,
      QUALITY_GATE_V2_BOOTSTRAP_SELF_SHA256:
        fixture.expectedSelfSha256,
    });
    const boundary = cliOverrides(fixture, environment, runner);

    const exitCode = await production.runCliProcess(
      fixture.argv,
      boundary.overrides,
    );

    expect(exitCode).toBe(0);
    expect(runner.requests).toHaveLength(1);
    expect(runner.requests[0]?.env).toMatchObject({PATH: pathValue});
    expect(
      Object.keys(runner.requests[0]?.env ?? {}).filter(
        key => key.toUpperCase() === 'PATH',
      ),
    ).toEqual(['PATH']);
    expect(Object.keys(environment)).toEqual([
      'Path',
      'pAtH',
      'QUALITY_GATE_V2_BOOTSTRAP_SELF_SHA256',
    ]);
  });

  it('rejects conflicting Windows variants before runner, report, recorder, or PID side effects', async () => {
    const production = loadProductionCli();
    const fixture = installSyntheticFixture();
    const runner = new RecordingRunner();
    const environment = Object.freeze({
      PATH: 'C:\\review1\\trusted',
      Path: 'C:\\review1\\conflicting',
      QUALITY_GATE_V2_BOOTSTRAP_SELF_SHA256:
        fixture.expectedSelfSha256,
    });
    const boundary = cliOverrides(fixture, environment, runner);
    let exposed: unknown = null;

    try {
      await production.runCliProcess(fixture.argv, boundary.overrides);
    } catch (error) {
      exposed = error;
    }

    expect(errorCode(exposed)).toBe(PATH_CONFLICT_CODE);
    expect(runner.requests).toHaveLength(0);
    expect(fs.existsSync(fixture.reportDirectory)).toBe(false);
    expect(fs.existsSync(fixture.reportPath)).toBe(false);
    expect(fs.existsSync(fixture.summaryPath)).toBe(false);
    expect(fs.existsSync(fixture.recorderPath)).toBe(false);
    expect(fs.existsSync(fixture.pidPath)).toBe(false);
    expect(Object.keys(environment)).toEqual([
      'PATH',
      'Path',
      'QUALITY_GATE_V2_BOOTSTRAP_SELF_SHA256',
    ]);
  });

  it('does not apply Windows case folding to a non-win32 unsupported invocation', async () => {
    const production = loadProductionCli();
    const fixture = installSyntheticFixture();
    const runner = new RecordingRunner();
    const environment = Object.freeze({
      PATH: '/review1/trusted',
      Path: '/review1/distinct-posix-key',
      QUALITY_GATE_V2_BOOTSTRAP_SELF_SHA256:
        fixture.expectedSelfSha256,
    });
    const boundary = cliOverrides(
      fixture,
      environment,
      runner,
      'linux',
    );

    const exitCode = await production.runCliProcess(
      fixture.argv,
      boundary.overrides,
    );

    expect(exitCode).toBe(1);
    expect(boundary.stderr.value).toContain(PLATFORM_UNSUPPORTED_CODE);
    expect(boundary.stderr.value).not.toContain(PATH_CONFLICT_CODE);
    expect(runner.requests).toHaveLength(0);
    expect(fs.existsSync(fixture.reportPath)).toBe(true);
    expect(fs.existsSync(fixture.summaryPath)).toBe(true);
  });
});

