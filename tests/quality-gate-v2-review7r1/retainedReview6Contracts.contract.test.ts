import * as path from 'node:path';
import {
  PROCESS_START_FAILED,
  UNSAFE_CODE,
  baseEnvironment,
  loadProduction,
  type ProcessRequest,
} from './qualityGateV2Review7TestKit';

const HIGH_A = (1n << 60n) + 1n;
const HIGH_B = (1n << 60n) + 2n;

type BigIntOption = Readonly<{bigint?: boolean}> | undefined;
type VirtualStat = Readonly<{
  dev: number | bigint;
  ino: number | bigint;
  mode: number | bigint;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}>;

type IdentityRealpath = {
  (filePath: string): string;
  native(filePath: string): string;
};

function windowsKey(filePath: string): string {
  return filePath.replaceAll('/', '\\').toLowerCase();
}

function stat(
  kind: 'file' | 'directory',
  dev: number | bigint,
  ino: number | bigint,
): VirtualStat {
  return {
    dev,
    ino,
    mode: typeof dev === 'bigint'
      ? kind === 'file' ? 33_188n : 16_893n
      : kind === 'file' ? 33_188 : 16_893,
    isFile: () => kind === 'file',
    isDirectory: () => kind === 'directory',
    isSymbolicLink: () => false,
  };
}

function identityRealpath(): IdentityRealpath {
  const resolvePath = ((filePath: string): string => filePath) as IdentityRealpath;
  resolvePath.native = (filePath: string): string => filePath;
  return resolvePath;
}

function request(executable: string): ProcessRequest {
  return {
    executable,
    args: ['review7-literal', ''],
    cwd: 'C:\\approved\\work',
    env: {
      CI: '1',
      JAVA_HOME: 'C:\\approved\\jdk',
      ANDROID_HOME: 'C:\\approved\\android',
      ANDROID_SDK_ROOT: 'C:\\approved\\android',
      PATH: 'C:\\approved\\bin',
    },
    timeoutMs: 20_000,
  };
}

function installBigIntFilesystem(
  executable: string,
  changed: boolean,
): Readonly<{targetCalls(): number; spawnMock: jest.Mock}> {
  let calls = 0;
  const lstatSync = jest.fn<VirtualStat, [string, BigIntOption]>((filePath, options) => {
    const isTarget = windowsKey(filePath) === windowsKey(executable);
    const bigint = options?.bigint === true;
    if (!isTarget) {
      const isFile = /\.(?:exe|com|cjs|mjs)$/i.test(filePath);
      return stat(isFile ? 'file' : 'directory', bigint ? 701n : 701, bigint ? 709n : 709);
    }
    calls += 1;
    const identity = changed && calls >= 2 ? HIGH_B : HIGH_A;
    return bigint
      ? stat('file', identity, identity)
      : stat('file', Number(identity), Number(identity));
  });
  jest.doMock('node:fs', () => ({
    ...jest.requireActual<typeof import('node:fs')>('node:fs'),
    lstatSync,
    realpathSync: identityRealpath(),
  }));
  const spawnMock = jest.fn(() => {
    throw new Error('QUALITY_GATE_REVIEW7_BIGINT_BOUNDARY');
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

describe('QUALITY-GATE-V2 Review7 retained lossless identity contract', () => {
  it('keeps distinct high-bit identities distinct despite their Number collision', () => {
    expect(HIGH_A).not.toBe(HIGH_B);
    expect(Number(HIGH_A)).toBe(Number(HIGH_B));
    expect(Number.isSafeInteger(Number(HIGH_A))).toBe(false);
  });

  it('fails closed when a high-bit identity changes before launch', async () => {
    const executable = 'C:\\approved\\bin\\pnpm.exe';
    const observed = installBigIntFilesystem(executable, true);
    const runner = loadProduction().createNodeProcessRunner({
      baseEnvironment: baseEnvironment(path.win32.dirname(executable)),
      platform: 'win32',
      nodeExecutable: process.execPath,
    });

    await expect(runner.run(request(executable)))
      .rejects.toMatchObject({code: UNSAFE_CODE, message: UNSAFE_CODE});
    expect(observed.targetCalls()).toBeGreaterThanOrEqual(2);
    expect(observed.spawnMock).not.toHaveBeenCalled();
  });

  it('accepts unchanged equal high-bit identity only through one shell-free boundary', async () => {
    const executable = 'C:\\approved\\bin\\pnpm.exe';
    const observed = installBigIntFilesystem(executable, false);
    const runner = loadProduction().createNodeProcessRunner({
      baseEnvironment: baseEnvironment(path.win32.dirname(executable)),
      platform: 'win32',
      nodeExecutable: process.execPath,
    });

    await expect(runner.run(request(executable)))
      .rejects.toMatchObject({code: PROCESS_START_FAILED});
    expect(observed.targetCalls()).toBeGreaterThanOrEqual(2);
    expect(observed.spawnMock).toHaveBeenCalledTimes(1);
    expect(observed.spawnMock).toHaveBeenCalledWith(
      executable,
      ['review7-literal', ''],
      expect.objectContaining({shell: false}),
    );
  });
});
