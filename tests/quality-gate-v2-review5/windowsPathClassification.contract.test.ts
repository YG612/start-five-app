import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  cleanupTemporaryRoots,
  cliArguments,
  cliEnvironment,
  identityRealpath,
  installCliFixture,
  loadProductionCli,
  regularStat,
  textSink,
  UNSAFE_CODE,
} from './qualityGateV2Review5TestKit';

function installOrdinaryVirtualFilesystem(
  fixtureRoot: string,
  untrustedLstatMock: jest.Mock,
): void {
  const realFs = jest.requireActual<typeof import('node:fs')>('node:fs');
  const rootIdentity = fixtureRoot.replaceAll('/', '\\').toLowerCase();
  const belongsToFixtureTrustChain = (filePath: string): boolean => {
    const identity = filePath.replaceAll('/', '\\').toLowerCase();
    return identity === rootIdentity ||
      identity.startsWith(rootIdentity + '\\') ||
      rootIdentity.startsWith(identity.endsWith('\\') ? identity : identity + '\\');
  };
  const lstatSync = jest.fn((
    filePath: string,
    options?: Readonly<{bigint?: boolean}>,
  ) => {
    if (!belongsToFixtureTrustChain(filePath)) {
      untrustedLstatMock(filePath, options);
      return options?.bigint === true ? regularStat(17n, 29n) : regularStat();
    }
    return options?.bigint === true
      ? realFs.lstatSync(filePath, {bigint: true})
      : realFs.lstatSync(filePath);
  });
  const realpathSync = identityRealpath();
  realpathSync.native = (filePath: string): string =>
    belongsToFixtureTrustChain(filePath)
      ? realFs.realpathSync.native(filePath)
      : filePath;
  jest.doMock('node:fs', () => ({
    ...realFs,
    lstatSync,
    realpathSync,
  }));
}

afterEach(() => {
  jest.dontMock('node:fs');
  jest.dontMock('node:child_process');
  jest.resetModules();
  cleanupTemporaryRoots();
});

describe('QUALITY-GATE-V2 Review5 canonical Windows path classification', () => {
  it.each([
    {label: 'empty', token: ''},
    {label: 'quoted drive path', token: '"C:\\approved\\pnpm.exe"'},
    {label: 'drive relative', token: 'C:approved\\pnpm.exe'},
    {label: 'root relative backslash', token: '\\qg\\bin\\pnpm.exe'},
    {label: 'root relative slash', token: '/qg/bin/pnpm.exe'},
    {label: 'incomplete UNC server', token: '\\\\approved-server\\'},
    {label: 'NT extended device namespace', token: '\\\\?\\C:\\approved\\pnpm.exe'},
    {label: 'Win32 device namespace', token: '\\\\.\\C:\\approved\\pnpm.exe'},
    {label: 'leading whitespace', token: ' C:\\approved\\pnpm.exe'},
    {label: 'trailing whitespace', token: 'C:\\approved\\pnpm.exe '},
    {label: 'non-canonical slash spelling', token: 'C:/approved/pnpm.exe'},
  ])('rejects $label code-only before filesystem or child access', async ({token}) => {
    const fixture = installCliFixture();
    const untrustedLstatMock = jest.fn();
    const spawnMock = jest.fn(() => {
      throw new Error('QUALITY_GATE_REVIEW5_INVALID_PATH_SPAWNED');
    });
    installOrdinaryVirtualFilesystem(fixture.root, untrustedLstatMock);
    jest.doMock('node:child_process', () => ({
      ...jest.requireActual<typeof import('node:child_process')>('node:child_process'),
      spawn: spawnMock,
    }));
    const stdout = textSink();
    const stderr = textSink();

    const exitCode = await loadProductionCli().runCliProcess(
      cliArguments(fixture, token),
      {
        cwd: 'D:\\launch-cwd',
        platform: 'win32',
        environment: cliEnvironment(),
        bootstrapExpectedSelfSha256: fixture.expectedSelfSha256,
        stdout: stdout.sink,
        stderr: stderr.sink,
        now: () => '2026-08-08T00:00:00.000Z',
        runId: 'quality-gate-v2-review5-invalid-path',
      },
    );

    expect(exitCode).toBe(1);
    expect(stdout.read()).toBe('');
    expect(stderr.read()).toBe(UNSAFE_CODE);
    expect(untrustedLstatMock).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
    expect(fs.existsSync(fixture.reportDirectory)).toBe(false);
  });

  it.each([
    {label: 'drive-qualified', token: 'C:\\approved\\bin\\pnpm.exe'},
    {label: 'complete UNC', token: '\\\\approved-server\\approved-share\\bin\\pnpm.exe'},
  ])('accepts the $label counterexample through shell-free spawn exactly once', async ({token}) => {
    const fixture = installCliFixture();
    const untrustedLstatMock = jest.fn();
    const spawnMock = jest.fn(() => {
      throw new Error('QUALITY_GATE_REVIEW5_APPROVED_CONTROL');
    });
    installOrdinaryVirtualFilesystem(fixture.root, untrustedLstatMock);
    jest.doMock('node:child_process', () => ({
      ...jest.requireActual<typeof import('node:child_process')>('node:child_process'),
      spawn: spawnMock,
    }));
    const stdout = textSink();
    const stderr = textSink();

    const exitCode = await loadProductionCli().runCliProcess(
      cliArguments(fixture, token),
      {
        cwd: 'D:\\launch-cwd',
        platform: 'win32',
        environment: cliEnvironment(),
        bootstrapExpectedSelfSha256: fixture.expectedSelfSha256,
        stdout: stdout.sink,
        stderr: stderr.sink,
        now: () => '2026-08-08T00:00:00.000Z',
        runId: 'quality-gate-v2-review5-approved-path',
      },
    );

    expect(exitCode).toBe(1);
    expect(stderr.read()).toContain('QUALITY_GATE_PROCESS_START_FAILED');
    expect(untrustedLstatMock).toHaveBeenCalled();
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock).toHaveBeenCalledWith(
      token,
      [
        'exec',
        'jest',
        '--runInBand',
        '--ci',
        '--coverage=false',
        '--roots',
        'tests/quality-gate-v2',
      ],
      expect.objectContaining({cwd: fixture.root, shell: false}),
    );
  });

  it('proves cross-drive root-relative validation and launch objects diverge and rejects both', async () => {
    const rootRelative = '\\qg\\bin\\pnpm.exe';
    const validatorObject = path.win32.resolve('C:\\validator-base', rootRelative);
    const launchObject = path.win32.resolve('D:\\launcher-cwd', rootRelative);
    expect(validatorObject).toBe('C:\\qg\\bin\\pnpm.exe');
    expect(launchObject).toBe('D:\\qg\\bin\\pnpm.exe');
    expect(validatorObject).not.toBe(launchObject);

    const fixture = installCliFixture();
    const untrustedLstatMock = jest.fn();
    const spawnMock = jest.fn(() => {
      throw new Error('QUALITY_GATE_REVIEW5_CROSS_DRIVE_SPAWNED');
    });
    installOrdinaryVirtualFilesystem(fixture.root, untrustedLstatMock);
    jest.doMock('node:child_process', () => ({
      ...jest.requireActual<typeof import('node:child_process')>('node:child_process'),
      spawn: spawnMock,
    }));
    const stdout = textSink();
    const stderr = textSink();

    const exitCode = await loadProductionCli().runCliProcess(
      cliArguments(fixture, rootRelative),
      {
        cwd: 'D:\\launcher-cwd',
        platform: 'win32',
        environment: cliEnvironment(),
        bootstrapExpectedSelfSha256: fixture.expectedSelfSha256,
        stdout: stdout.sink,
        stderr: stderr.sink,
        now: () => '2026-08-08T00:00:00.000Z',
        runId: 'quality-gate-v2-review5-cross-drive',
      },
    );

    expect(exitCode).toBe(1);
    expect(stdout.read()).toBe('');
    expect(stderr.read()).toBe(UNSAFE_CODE);
    expect(untrustedLstatMock).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
    expect(fs.existsSync(fixture.reportDirectory)).toBe(false);
  });
});
