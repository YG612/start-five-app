import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CLI_USAGE_CODE,
  cleanupTemporaryRoots,
  cliArguments,
  cliEnvironment,
  directoryStat,
  identityRealpath,
  installCliFixture,
  loadProductionCli,
  PROCESS_START_FAILED,
  regularStat,
  textSink,
  UNSAFE_CODE,
  windowsIdentity,
} from './qualityGateV2Review6TestKit';

type CliFilesystemObservation = Readonly<{
  allLstatPaths: string[];
  launchLstatPaths: string[];
}>;

function installObservedCliFilesystem(fixtureRoot: string): CliFilesystemObservation {
  const realFs = jest.requireActual<typeof import('node:fs')>('node:fs');
  const rootIdentity = windowsIdentity(fixtureRoot);
  const allLstatPaths: string[] = [];
  const launchLstatPaths: string[] = [];
  const belongsToFixtureChain = (filePath: string): boolean => {
    const identity = windowsIdentity(filePath);
    return identity === rootIdentity ||
      identity.startsWith(rootIdentity + '\\') ||
      rootIdentity.startsWith(identity.endsWith('\\') ? identity : identity + '\\');
  };
  const lstatSync = jest.fn((
    filePath: string,
    options?: Readonly<{bigint?: boolean}>,
  ) => {
    allLstatPaths.push(filePath);
    if (belongsToFixtureChain(filePath)) {
      return options?.bigint === true
        ? realFs.lstatSync(filePath, {bigint: true})
        : realFs.lstatSync(filePath);
    }
    launchLstatPaths.push(filePath);
    const bigint = options?.bigint === true;
    const fileExtension = /\.(?:exe|com|cjs|mjs)$/i.test(filePath);
    return fileExtension
      ? regularStat(bigint ? 211n : 211, bigint ? 223n : 223)
      : directoryStat(bigint ? 227n : 227, bigint ? 229n : 229);
  });
  const realpathSync = identityRealpath();
  realpathSync.native = (filePath: string): string =>
    belongsToFixtureChain(filePath)
      ? realFs.realpathSync.native(filePath)
      : filePath;
  jest.doMock('node:fs', () => ({...realFs, lstatSync, realpathSync}));
  return {allLstatPaths, launchLstatPaths};
}

function installBoundaryRecorder(): jest.Mock {
  const spawnMock = jest.fn(() => {
    throw new Error('QUALITY_GATE_REVIEW6_CLI_BOUNDARY');
  });
  jest.doMock('node:child_process', () => ({
    ...jest.requireActual<typeof import('node:child_process')>('node:child_process'),
    spawn: spawnMock,
  }));
  return spawnMock;
}

async function runPublicCli(
  pnpmExecutable: string,
): Promise<Readonly<{
  fixture: ReturnType<typeof installCliFixture>;
  exitCode: number;
  stdout: string;
  stderr: string;
  allLstatPaths: readonly string[];
  launchLstatPaths: readonly string[];
  spawnMock: jest.Mock;
}>> {
  const fixture = installCliFixture();
  const {allLstatPaths, launchLstatPaths} = installObservedCliFilesystem(fixture.root);
  const spawnMock = installBoundaryRecorder();
  const stdout = textSink();
  const stderr = textSink();
  const exitCode = await loadProductionCli().runCliProcess(
    cliArguments(fixture, pnpmExecutable),
    {
      cwd: 'D:\\review6-launch-cwd',
      platform: 'win32',
      environment: cliEnvironment(),
      bootstrapExpectedSelfSha256: fixture.expectedSelfSha256,
      stdout: stdout.sink,
      stderr: stderr.sink,
      now: () => '2026-08-08T00:00:00.000Z',
      runId: 'quality-gate-v2-review6-cli-layering',
    },
  );
  return {
    fixture,
    exitCode,
    stdout: stdout.read(),
    stderr: stderr.read(),
    allLstatPaths,
    launchLstatPaths,
    spawnMock,
  };
}

afterEach(() => {
  jest.dontMock('node:fs');
  jest.dontMock('node:child_process');
  jest.resetModules();
  cleanupTemporaryRoots();
});

describe('QUALITY-GATE-V2 Review6 public CLI grammar ownership', () => {
  it('returns exact CLI_USAGE for an explicit empty --pnpm before filesystem, child, or report output', async () => {
    const observed = await runPublicCli('');

    expect(observed.exitCode).toBe(1);
    expect(observed.stdout).toBe('');
    expect(observed.stderr).toBe(CLI_USAGE_CODE);
    expect(observed.allLstatPaths).toHaveLength(0);
    expect(observed.spawnMock).not.toHaveBeenCalled();
    expect(fs.existsSync(observed.fixture.reportDirectory)).toBe(false);
  });

  it.each([
    {label: 'quoted', token: '"C:\\approved\\bin\\pnpm.exe"'},
    {label: 'leading whitespace', token: ' C:\\approved\\bin\\pnpm.exe'},
    {label: 'trailing whitespace', token: 'C:\\approved\\bin\\pnpm.exe '},
  ])('rejects a $label value at the CLI layer without lower-layer activity', async ({token}) => {
    const observed = await runPublicCli(token);

    expect(observed.exitCode).toBe(1);
    expect(observed.stdout).toBe('');
    expect(observed.stderr).toBe(CLI_USAGE_CODE);
    expect(observed.allLstatPaths).toHaveLength(0);
    expect(observed.spawnMock).not.toHaveBeenCalled();
    expect(fs.existsSync(observed.fixture.reportDirectory)).toBe(false);
  });
});

describe('QUALITY-GATE-V2 Review6 Windows launch path classification', () => {
  it.each([
    {label: 'root-relative backslash', token: '\\review6\\bin\\pnpm.exe'},
    {label: 'root-relative forward slash', token: '/review6/bin/pnpm.exe'},
    {label: 'drive-relative', token: 'C:review6\\bin\\pnpm.exe'},
    {label: 'incomplete UNC', token: '\\\\approved-server\\'},
    {label: 'extended device namespace', token: '\\\\?\\C:\\approved\\pnpm.exe'},
    {label: 'Win32 device namespace', token: '\\\\.\\C:\\approved\\pnpm.exe'},
  ])('rejects $label with exact launch code before launch filesystem or child activity', async ({token}) => {
    const observed = await runPublicCli(token);

    expect(observed.exitCode).toBe(1);
    expect(observed.stdout).toBe('');
    expect(observed.stderr).toBe(UNSAFE_CODE);
    expect(observed.launchLstatPaths).toHaveLength(0);
    expect(observed.spawnMock).not.toHaveBeenCalled();
    expect(fs.existsSync(observed.fixture.reportDirectory)).toBe(false);
  });

  it.each([
    {
      label: 'backslash drive-qualified',
      token: 'C:\\approved\\bin\\pnpm.exe',
      expectedLaunch: 'C:\\approved\\bin\\pnpm.exe',
    },
    {
      label: 'forward-slash drive-qualified',
      token: 'C:/approved/bin/pnpm.exe',
      expectedLaunch: 'C:\\approved\\bin\\pnpm.exe',
    },
    {
      label: 'complete approved UNC',
      token: '\\\\approved-server\\approved-share\\bin\\pnpm.exe',
      expectedLaunch: '\\\\approved-server\\approved-share\\bin\\pnpm.exe',
    },
  ])('launches the same fully qualified object validated for $label', async ({token, expectedLaunch}) => {
    const observed = await runPublicCli(token);

    expect(observed.exitCode).toBe(1);
    expect(observed.stderr).toContain(PROCESS_START_FAILED);
    expect(observed.launchLstatPaths.length).toBeGreaterThan(0);
    expect(observed.spawnMock).toHaveBeenCalledTimes(1);
    expect(observed.spawnMock).toHaveBeenCalledWith(
      expectedLaunch,
      [
        'exec',
        'jest',
        '--runInBand',
        '--ci',
        '--coverage=false',
        '--roots',
        'tests/quality-gate-v2',
      ],
      expect.objectContaining({cwd: observed.fixture.root, shell: false}),
    );
    const launchedExecutable = observed.spawnMock.mock.calls[0]?.[0];
    expect(typeof launchedExecutable).toBe('string');
    expect(windowsIdentity(String(launchedExecutable)))
      .toBe(windowsIdentity(expectedLaunch));
    expect(
      /^[A-Za-z]:\\/.test(expectedLaunch) || /^\\\\[^\\]+\\[^\\]+\\/.test(expectedLaunch),
    ).toBe(true);
    expect(path.win32.resolve(expectedLaunch)).toBe(expectedLaunch);
  });
});
