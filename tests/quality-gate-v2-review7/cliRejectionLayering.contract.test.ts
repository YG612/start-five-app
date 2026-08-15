import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CLI_USAGE_CODE,
  UNSAFE_CODE,
  cleanupTemporaryRoots,
  cliArguments,
  installCliFixture,
  loadProductionCli,
  textSink,
} from './qualityGateV2Review7TestKit';

type RejectionObservation = Readonly<{
  fixture: ReturnType<typeof installCliFixture>;
  exitCode: number;
  stdout: string;
  stderr: string;
  allLstatPaths: readonly string[];
  untrustedLstatPaths: readonly string[];
  spawnMock: jest.Mock;
}>;

function belongsToFixture(filePath: string, fixtureRoot: string): boolean {
  const resolved = path.resolve(filePath).toLowerCase();
  const root = path.resolve(fixtureRoot).toLowerCase();
  return resolved === root || resolved.startsWith(root + path.sep) ||
    root.startsWith(resolved.endsWith(path.sep) ? resolved : resolved + path.sep);
}

async function observeRejectedToken(token: string): Promise<RejectionObservation> {
  const fixture = installCliFixture();
  const realFs = jest.requireActual<typeof import('node:fs')>('node:fs');
  const allLstatPaths: string[] = [];
  const untrustedLstatPaths: string[] = [];
  const lstatSync = jest.fn((filePath: string) => {
    allLstatPaths.push(filePath);
    if (!belongsToFixture(filePath, fixture.root)) untrustedLstatPaths.push(filePath);
    return realFs.lstatSync(filePath);
  });
  jest.doMock('node:fs', () => ({...realFs, lstatSync}));
  const spawnMock = jest.fn(() => {
    throw new Error('QUALITY_GATE_REVIEW7_REJECTED_TOKEN_REACHED_CHILD');
  });
  jest.doMock('node:child_process', () => ({
    ...jest.requireActual<typeof import('node:child_process')>('node:child_process'),
    spawn: spawnMock,
  }));
  const stdout = textSink();
  const stderr = textSink();
  const exitCode = await loadProductionCli().runCliProcess(
    cliArguments(fixture, token),
    {
      cwd: 'D:\\review7-cli-layering',
      platform: 'win32',
      environment: {PATH: 'C:\\approved\\bin', PATHEXT: '.COM;.EXE;.BAT;.CMD'},
      bootstrapExpectedSelfSha256: fixture.expectedSelfSha256,
      stdout: stdout.sink,
      stderr: stderr.sink,
      now: () => '2026-08-08T00:00:00.000Z',
      runId: 'quality-gate-v2-review7-cli-rejection',
    },
  );
  return {
    fixture,
    exitCode,
    stdout: stdout.read(),
    stderr: stderr.read(),
    allLstatPaths,
    untrustedLstatPaths,
    spawnMock,
  };
}

function expectZeroLaunchSideEffects(observed: RejectionObservation): void {
  expect(observed.spawnMock).not.toHaveBeenCalled();
  expect(fs.existsSync(observed.fixture.reportDirectory)).toBe(false);
  expect(fs.existsSync(observed.fixture.recorderPath)).toBe(false);
  expect(fs.existsSync(observed.fixture.temporaryLaunchPath)).toBe(false);
}

afterEach(() => {
  jest.dontMock('node:fs');
  jest.dontMock('node:child_process');
  jest.resetModules();
  cleanupTemporaryRoots();
});

describe('QUALITY-GATE-V2 Review7 public CLI rejection layering', () => {
  it('owns an explicit empty --pnpm at CLI_USAGE before every filesystem boundary', async () => {
    const observed = await observeRejectedToken('');

    expect(observed.exitCode).toBe(1);
    expect(observed.stdout).toBe('');
    expect(observed.stderr).toBe(CLI_USAGE_CODE);
    expect(observed.allLstatPaths).toHaveLength(0);
    expectZeroLaunchSideEffects(observed);
  });

  it.each([
    {label: 'quoted', token: '"C:\\approved\\bin\\pnpm.exe"'},
    {label: 'leading whitespace', token: ' C:\\approved\\bin\\pnpm.exe'},
    {label: 'trailing whitespace', token: 'C:\\approved\\bin\\pnpm.exe '},
  ])('safely rejects a $label token at either legitimate public layer', async ({token}) => {
    const observed = await observeRejectedToken(token);

    expect(observed.exitCode).toBe(1);
    expect(observed.stdout).toBe('');
    expect([CLI_USAGE_CODE, UNSAFE_CODE]).toContain(observed.stderr);
    if (observed.stderr === CLI_USAGE_CODE) {
      expect(observed.allLstatPaths).toHaveLength(0);
    } else {
      expect(observed.untrustedLstatPaths.every(filePath =>
        filePath.includes(token) || token.includes(filePath),
      )).toBe(true);
    }
    expectZeroLaunchSideEffects(observed);
  });

  it.each([
    {label: 'root-relative backslash', token: '\\review7\\bin\\pnpm.exe'},
    {label: 'root-relative forward slash', token: '/review7/bin/pnpm.exe'},
    {label: 'drive-relative', token: 'C:review7\\bin\\pnpm.exe'},
    {label: 'incomplete UNC', token: '\\\\approved-server\\'},
    {label: 'extended device namespace', token: '\\\\?\\C:\\approved\\pnpm.exe'},
    {label: 'Win32 device namespace', token: '\\\\.\\C:\\approved\\pnpm.exe'},
  ])('returns exact launch-unsafe code-only rejection for $label', async ({token}) => {
    const observed = await observeRejectedToken(token);

    expect(observed.exitCode).toBe(1);
    expect(observed.stdout).toBe('');
    expect(observed.stderr).toBe(UNSAFE_CODE);
    expect(observed.untrustedLstatPaths).toHaveLength(0);
    expectZeroLaunchSideEffects(observed);
  });
});
