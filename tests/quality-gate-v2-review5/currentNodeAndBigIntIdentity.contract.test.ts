import * as path from 'node:path';
import {
  baseEnvironment,
  directRequest,
  identityRealpath,
  loadProduction,
  PROCESS_START_FAILED,
  regularStat,
  reparseDirectoryStat,
  UNSAFE_CODE,
  type VirtualStat,
} from './qualityGateV2Review5TestKit';

const HIGH_A = (1n << 60n) + 1n;
const HIGH_B = (1n << 60n) + 2n;

type BigIntOption = Readonly<{bigint?: boolean}> | undefined;

function windowsIdentity(value: string): string {
  return value.replaceAll('/', '\\').toLowerCase();
}

function installFilesystemMock(
  lstatMock: jest.Mock<VirtualStat, [string, BigIntOption]>,
): void {
  jest.doMock('node:fs', () => ({
    ...jest.requireActual<typeof import('node:fs')>('node:fs'),
    lstatSync: lstatMock,
    realpathSync: identityRealpath(),
  }));
}

function installThrowingSpawn(spawnMock: jest.Mock): void {
  jest.doMock('node:child_process', () => ({
    ...jest.requireActual<typeof import('node:child_process')>('node:child_process'),
    spawn: spawnMock,
  }));
}

afterEach(() => {
  jest.dontMock('node:fs');
  jest.dontMock('node:child_process');
  jest.resetModules();
});

describe('QUALITY-GATE-V2 Review5 current Node ancestry', () => {
  it('validates every current process.execPath ancestor even for identical selected spelling', async () => {
    const currentNodeParent = path.win32.dirname(process.execPath);
    const observedPaths: string[] = [];
    const lstatMock = jest.fn<VirtualStat, [string, BigIntOption]>((filePath) => {
      observedPaths.push(filePath);
      return windowsIdentity(filePath) === windowsIdentity(currentNodeParent)
        ? reparseDirectoryStat()
        : regularStat();
    });
    const spawnMock = jest.fn(() => {
      throw new Error('QUALITY_GATE_REVIEW5_CURRENT_NODE_ANCESTRY_BYPASSED');
    });
    installFilesystemMock(lstatMock);
    installThrowingSpawn(spawnMock);
    const runner = loadProduction().createNodeProcessRunner({
      baseEnvironment: baseEnvironment(),
      platform: 'win32',
      nodeExecutable: process.execPath,
    });

    await expect(runner.run(directRequest(
      'C:\\approved\\bin\\pnpm.cjs',
      'C:\\approved\\work',
    ))).rejects.toMatchObject({code: UNSAFE_CODE, message: UNSAFE_CODE});

    expect(observedPaths.map(windowsIdentity)).toContain(
      windowsIdentity(currentNodeParent),
    );
    expect(spawnMock).not.toHaveBeenCalled();
  });
});

describe('QUALITY-GATE-V2 Review5 lossless BigInt filesystem identities', () => {
  it('proves the hostile high-bit identities collide only after Number coercion', () => {
    expect(HIGH_A).not.toBe(HIGH_B);
    expect(Number(HIGH_A)).toBe(Number(HIGH_B));
    expect(Number.isSafeInteger(Number(HIGH_A))).toBe(false);
  });

  it('rejects a high-bit dev/ino replacement that Number-based identity checks miss', async () => {
    const executable = 'C:\\approved\\bin\\pnpm.exe';
    let targetCalls = 0;
    const lstatMock = jest.fn<VirtualStat, [string, BigIntOption]>((filePath, options) => {
      if (windowsIdentity(filePath) !== windowsIdentity(executable)) {
        return options?.bigint === true ? regularStat(41n, 43n) : regularStat(41, 43);
      }
      targetCalls += 1;
      const identity = targetCalls === 2 ? HIGH_B : HIGH_A;
      return options?.bigint === true
        ? regularStat(identity, identity)
        : regularStat(Number(identity), Number(identity));
    });
    const spawnMock = jest.fn(() => {
      throw new Error('QUALITY_GATE_REVIEW5_HIGH_BIT_COLLISION_SPAWNED');
    });
    installFilesystemMock(lstatMock);
    installThrowingSpawn(spawnMock);
    const runner = loadProduction().createNodeProcessRunner({
      baseEnvironment: baseEnvironment(),
      platform: 'win32',
      nodeExecutable: process.execPath,
    });

    await expect(runner.run(directRequest(
      executable,
      'C:\\approved\\work',
    ))).rejects.toMatchObject({code: UNSAFE_CODE, message: UNSAFE_CODE});

    expect(targetCalls).toBeGreaterThanOrEqual(2);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('accepts an unchanged equal identity and reaches shell-free spawn once', async () => {
    const lstatMock = jest.fn<VirtualStat, [string, BigIntOption]>((_filePath, options) =>
      options?.bigint === true ? regularStat(HIGH_A, HIGH_A) : regularStat(47, 47),
    );
    const spawnMock = jest.fn(() => {
      throw new Error('QUALITY_GATE_REVIEW5_EQUAL_BIGINT_CONTROL');
    });
    installFilesystemMock(lstatMock);
    installThrowingSpawn(spawnMock);
    const runner = loadProduction().createNodeProcessRunner({
      baseEnvironment: baseEnvironment(),
      platform: 'win32',
      nodeExecutable: process.execPath,
    });

    await expect(runner.run(directRequest(
      'C:\\approved\\bin\\pnpm.exe',
      'C:\\approved\\work',
    ))).rejects.toMatchObject({code: PROCESS_START_FAILED});

    expect(lstatMock).toHaveBeenCalled();
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });
});
