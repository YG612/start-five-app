import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  cleanupTempDirectories,
  expectedLockValidationSummary,
  expectedProbeArgv,
  fixturePath,
  installSyntheticFixture,
  PATH_CONFLICT_CODE,
  projectRoot,
  readJsonRecord,
  runRealChild,
  SHELL_ESCAPE_MARKER,
  windowsBaseEnvironment,
  type SyntheticFixture,
} from './qualityGateV2Review2TestKit';

type EntryMode = 'spread' | 'add-canonical';

function realCliArgs(
  fixture: SyntheticFixture,
  mode: EntryMode,
  injectedCanonicalPath: string | null,
): readonly string[] {
  return [
    fixturePath('spreadCliEntry.cjs'),
    path.join(
      projectRoot(),
      'scripts',
      'quality-gate-v2',
      'cli.cjs',
    ),
    mode,
    injectedCanonicalPath ?? '-',
    ...fixture.argv,
  ];
}

function expectedAllowedEnvironment(
  fixture: SyntheticFixture,
  pathValue: string,
): Readonly<Record<string, unknown>> {
  return {
    ANDROID_HOME: 'C:\\review2\\android-sdk',
    ANDROID_SDK_ROOT: 'C:\\review2\\android-sdk',
    CI: '1',
    ComSpec: process.env.ComSpec ??
      'C:\\Windows\\System32\\cmd.exe',
    JAVA_HOME: 'C:\\review2\\jdk-17',
    NODE_OPTIONS: '--no-warnings',
    PATH: pathValue,
    PATHEXT: process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD',
    SystemRoot: process.env.SystemRoot ?? 'C:\\Windows',
    TEMP: fixture.root,
    TMP: fixture.root,
    bootstrapSecret: null,
    forbiddenSecret: null,
    pathKeys: ['PATH'],
  };
}

function expectSuccessfulProbe(
  fixture: SyntheticFixture,
  pathValue: string,
  child: Readonly<{
    exitCode: number | null;
    signal: string | null;
    stdout: string;
    stderr: string;
  }>,
): void {
  expect(child.exitCode).toBe(0);
  expect(child.signal).toBeNull();
  expect(child.stderr).toBe('');
  expect(child.stdout.startsWith('FAST_PROBE_STDOUT')).toBe(true);
  const summaryText = child.stdout.slice('FAST_PROBE_STDOUT'.length);
  expect(JSON.parse(summaryText)).toEqual(expectedLockValidationSummary());
  expect(
    fs.existsSync(path.join(fixture.root, SHELL_ESCAPE_MARKER)),
  ).toBe(false);
  expect(readJsonRecord(fixture.recorderPath)).toEqual({
    argv: expectedProbeArgv(),
    cwd: fixture.root,
    environment: expectedAllowedEnvironment(fixture, pathValue),
  });
  expect(fs.readFileSync(fixture.pidPath, 'utf8')).toMatch(/^[1-9][0-9]*$/);
  expect(readJsonRecord(fixture.reportPath)).toMatchObject({
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
}

afterEach(() => {
  cleanupTempDirectories();
});

describe('QUALITY-GATE-V2 Review2 real spread CLI environment', () => {
  it('starts the real shell-free stage with only Path and preserves exact allowed environment', async () => {
    const fixture = installSyntheticFixture();
    const pathValue = path.dirname(process.execPath);

    const child = await runRealChild({
      args: realCliArgs(fixture, 'spread', null),
      cwd: fixture.root,
      environment: windowsBaseEnvironment(fixture, {Path: pathValue}),
    });

    expectSuccessfulProbe(fixture, pathValue, child);
  });

  it('keeps canonical PATH as an independent real process-start control', async () => {
    const fixture = installSyntheticFixture();
    const pathValue = path.dirname(process.execPath);

    const child = await runRealChild({
      args: realCliArgs(fixture, 'spread', null),
      cwd: fixture.root,
      environment: windowsBaseEnvironment(fixture, {PATH: pathValue}),
    });

    expectSuccessfulProbe(fixture, pathValue, child);
  });

  it('accepts identical Path and PATH values and emits only canonical PATH downstream', async () => {
    const fixture = installSyntheticFixture();
    const pathValue = path.dirname(process.execPath);

    const child = await runRealChild({
      args: realCliArgs(fixture, 'add-canonical', pathValue),
      cwd: fixture.root,
      environment: windowsBaseEnvironment(fixture, {Path: pathValue}),
    });

    expectSuccessfulProbe(fixture, pathValue, child);
  });

  it('rejects a real conflicting spread before report, recorder, or stage PID', async () => {
    const fixture = installSyntheticFixture();
    const pathValue = path.dirname(process.execPath);
    const conflictingValue =
      `${pathValue};C:\\review2\\conflicting-path`;

    const child = await runRealChild({
      args: realCliArgs(fixture, 'add-canonical', conflictingValue),
      cwd: fixture.root,
      environment: windowsBaseEnvironment(fixture, {Path: pathValue}),
    });

    expect(child.exitCode).toBe(1);
    expect(child.signal).toBeNull();
    expect(child.stdout).toBe('');
    expect(child.stderr).toContain(PATH_CONFLICT_CODE);
    expect(child.stderr).not.toContain('QUALITY_GATE_PROCESS_START_FAILED');
    expect(fs.existsSync(fixture.reportDirectory)).toBe(false);
    expect(fs.existsSync(fixture.reportPath)).toBe(false);
    expect(fs.existsSync(fixture.summaryPath)).toBe(false);
    expect(fs.existsSync(fixture.recorderPath)).toBe(false);
    expect(fs.existsSync(fixture.pidPath)).toBe(false);
  });
});

