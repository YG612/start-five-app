import {
  baseEnvironment,
  directRequest,
  identityRealpath,
  loadProduction,
  PROCESS_START_FAILED,
  regularStat,
  UNSAFE_CODE,
  windowsIdentity,
  type BigIntOption,
  type VirtualStat,
} from './qualityGateV2Review6TestKit';

const HIGH_A = (1n << 60n) + 1n;
const HIGH_B = (1n << 60n) + 2n;

function installIdentityFilesystem(
  executable: string,
  changed: boolean,
): Readonly<{
  targetCalls: () => number;
  spawnMock: jest.Mock;
}> {
  let calls = 0;
  const lstatMock = jest.fn<VirtualStat, [string, BigIntOption]>((filePath, options) => {
    const bigint = options?.bigint === true;
    if (windowsIdentity(filePath) !== windowsIdentity(executable)) {
      return regularStat(bigint ? 307n : 307, bigint ? 311n : 311);
    }
    calls += 1;
    const identity = changed && calls >= 2 ? HIGH_B : HIGH_A;
    return bigint
      ? regularStat(identity, identity)
      : regularStat(Number(identity), Number(identity));
  });
  jest.doMock('node:fs', () => ({
    ...jest.requireActual<typeof import('node:fs')>('node:fs'),
    lstatSync: lstatMock,
    realpathSync: identityRealpath(),
  }));
  const spawnMock = jest.fn(() => {
    throw new Error('QUALITY_GATE_REVIEW6_BIGINT_BOUNDARY');
  });
  jest.doMock('node:child_process', () => ({
    ...jest.requireActual<typeof import('node:child_process')>('node:child_process'),
    spawn: spawnMock,
  }));
  return {targetCalls: () => calls, spawnMock};
}

afterEach(() => {
  jest.dontMock('node:fs');
  jest.dontMock('node:child_process');
  jest.resetModules();
});

describe('QUALITY-GATE-V2 Review6 lossless BigInt path identities', () => {
  it('proves the high-bit pair differs losslessly but collides after Number conversion', () => {
    expect(HIGH_A).not.toBe(HIGH_B);
    expect(Number(HIGH_A)).toBe(Number(HIGH_B));
    expect(Number.isSafeInteger(Number(HIGH_A))).toBe(false);
  });

  it('rejects a high-bit identity change that Number conversion cannot distinguish', async () => {
    const executable = 'C:\\approved\\bin\\pnpm.exe';
    const observed = installIdentityFilesystem(executable, true);
    const runner = loadProduction().createNodeProcessRunner({
      baseEnvironment: baseEnvironment(),
      platform: 'win32',
      nodeExecutable: process.execPath,
    });

    await expect(runner.run(directRequest(
      executable,
      'C:\\approved\\work',
    ))).rejects.toMatchObject({code: UNSAFE_CODE, message: UNSAFE_CODE});

    expect(observed.targetCalls()).toBeGreaterThanOrEqual(2);
    expect(observed.spawnMock).not.toHaveBeenCalled();
  });

  it('accepts an unchanged equal BigInt identity through one shell-free boundary', async () => {
    const executable = 'C:\\approved\\bin\\pnpm.exe';
    const observed = installIdentityFilesystem(executable, false);
    const runner = loadProduction().createNodeProcessRunner({
      baseEnvironment: baseEnvironment(),
      platform: 'win32',
      nodeExecutable: process.execPath,
    });

    await expect(runner.run(directRequest(
      executable,
      'C:\\approved\\work',
    ))).rejects.toMatchObject({code: PROCESS_START_FAILED});

    expect(observed.targetCalls()).toBeGreaterThanOrEqual(2);
    expect(observed.spawnMock).toHaveBeenCalledTimes(1);
    expect(observed.spawnMock).toHaveBeenCalledWith(
      executable,
      ['review6-literal-argument', ''],
      expect.objectContaining({shell: false}),
    );
  });
});
