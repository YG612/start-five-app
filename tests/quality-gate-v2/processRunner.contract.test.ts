import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  cleanupTempDirectories,
  createTempDirectory,
  errorCause,
  expectRejectCode,
  fixturePath,
  loadQualityGateProduction,
  runRealChild,
  type ProcessRequest,
} from './qualityGateV2TestKit';

function baseRequest(
  cwd: string,
  args: readonly string[],
): ProcessRequest {
  return {
    executable: process.execPath,
    args: [fixturePath(), ...args],
    cwd,
    env: {
      CI: '1',
      PATH: process.env.PATH ?? '',
      TEMP: process.env.TEMP ?? cwd,
      TMP: process.env.TMP ?? cwd,
    },
    timeoutMs: 20_000,
  };
}

afterEach(() => {
  cleanupTempDirectories();
});

describe('QUALITY-GATE-V2 real Node process runner', () => {
  it('preserves cwd and every Windows-sensitive argument without a shell', async () => {
    const production = loadQualityGateProduction();
    const directory = createTempDirectory();
    const sentinel = path.join(directory, 'must-not-exist.txt');
    const runner = production.createNodeProcessRunner({
      baseEnvironment: process.env,
    });
    const tokens = [
      'plain',
      'space value',
      '"double-quoted"',
      'ampersand&value',
      'pipe|value',
      'caret^value',
      'percent%QUALITY_GATE_DO_NOT_EXPAND%',
      'semi;colon',
      'dollar$(literal)',
      '>',
      sentinel,
      '\u4e2d\u6587',
    ];

    const result = await runner.run(
      baseRequest(directory, ['argv', ...tokens]),
    );

    expect(result).toMatchObject({
      exitCode: 0,
      signal: null,
      stderr: '',
      timedOut: false,
    });
    expect(JSON.parse(result.stdout)).toEqual(tokens);
    expect(fs.existsSync(sentinel)).toBe(false);
  });

  it('executes in the exact requested working directory', async () => {
    const production = loadQualityGateProduction();
    const directory = createTempDirectory();
    const runner = production.createNodeProcessRunner({
      baseEnvironment: process.env,
    });

    const result = await runner.run(baseRequest(directory, ['cwd']));

    expect(path.resolve(result.stdout)).toBe(path.resolve(directory));
    expect(result.exitCode).toBe(0);
  });

  it('passes only allowlisted environment keys and never leaks ambient secrets', async () => {
    const production = loadQualityGateProduction();
    const directory = createTempDirectory();
    const runner = production.createNodeProcessRunner({
      baseEnvironment: {
        ...process.env,
        QUALITY_GATE_FORBIDDEN_SECRET: 'do-not-leak',
      },
    });
    const request = baseRequest(directory, [
      'environment',
      'CI',
      'JAVA_HOME',
      'QUALITY_GATE_FORBIDDEN_SECRET',
    ]);

    const result = await runner.run({
      ...request,
      env: {
        ...request.env,
        JAVA_HOME: 'C:\\fixed\\jdk-17',
      },
    });

    expect(JSON.parse(result.stdout)).toEqual({
      CI: '1',
      JAVA_HOME: 'C:\\fixed\\jdk-17',
      QUALITY_GATE_FORBIDDEN_SECRET: null,
    });
  });

  it('rejects a forbidden requested environment key before starting a child', async () => {
    const production = loadQualityGateProduction();
    const directory = createTempDirectory();
    const marker = path.join(directory, 'child-started.txt');
    const runner = production.createNodeProcessRunner({
      baseEnvironment: process.env,
    });
    const request = baseRequest(directory, ['ready-hold', marker]);

    const exposed = await expectRejectCode(
      runner.run({
        ...request,
        env: {
          ...request.env,
          QUALITY_GATE_FORBIDDEN_SECRET: 'blocked',
        },
      }),
      'QUALITY_GATE_ENV_NOT_ALLOWED',
    );

    expect(errorCause(exposed)).toBeNull();
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('returns the real nonzero exit code and exact stdout/stderr', async () => {
    const production = loadQualityGateProduction();
    const directory = createTempDirectory();
    const runner = production.createNodeProcessRunner({
      baseEnvironment: process.env,
    });

    const result = await runner.run(
      baseRequest(directory, ['exit', '17']),
    );

    expect(result).toMatchObject({
      exitCode: 17,
      signal: null,
      stdout: 'fixture stdout',
      stderr: 'fixture stderr',
      timedOut: false,
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('enforces timeoutMs itself and leaves no ready holding child alive', async () => {
    const production = loadQualityGateProduction();
    const directory = createTempDirectory();
    const marker = path.join(directory, 'deadline-ready-pid.txt');
    const runner = production.createNodeProcessRunner({
      baseEnvironment: process.env,
    });
    const request = baseRequest(directory, ['ready-pid-hold', marker]);
    let readyObserved = false;
    const watcher = fs.watch(directory, () => {
      if (fs.existsSync(marker)) {
        readyObserved = true;
      }
    });

    try {
      const result = await runner.run({
        ...request,
        timeoutMs: 10_000,
      });

      expect(readyObserved).toBe(true);
      const childPid = fs.readFileSync(marker, 'utf8');
      expect(childPid).toMatch(/^[1-9][0-9]*$/);
      expect(result.exitCode).toBeNull();
      expect(result.signal).not.toBeNull();
      expect(result.timedOut).toBe(true);
      expect(result.timeoutSource).toBe('deadline');

      const probe = await runRealChild({
        executable: process.execPath,
        args: [fixturePath(), 'pid-status', childPid],
        cwd: directory,
        environment: process.env,
        watchdogMs: 20_000,
      });
      expect(probe).toEqual({
        exitCode: 0,
        signal: null,
        stdout: 'terminated',
        stderr: '',
      });
    } finally {
      watcher.close();
    }
  });

  it('kills a ready holding child when a controlled timeout signal fires', async () => {
    const production = loadQualityGateProduction();
    const directory = createTempDirectory();
    const marker = path.join(directory, 'timeout-ready.txt');
    const timeoutController = new AbortController();
    const runner = production.createNodeProcessRunner({
      baseEnvironment: process.env,
    });
    const request = baseRequest(directory, ['ready-hold', marker]);
    const watcher = fs.watch(directory, () => {
      if (fs.existsSync(marker)) {
        timeoutController.abort('QUALITY_GATE_TEST_TIMEOUT_SIGNAL');
      }
    });

    try {
      const result = await runner.run({
        ...request,
        timeoutMs: 20_000,
        timeoutSignal: timeoutController.signal,
      });

      expect(fs.readFileSync(marker, 'utf8')).toBe('ready');
      expect(result.exitCode).toBeNull();
      expect(result.timedOut).toBe(true);
      expect(result.timeoutSource).toBe('signal');
      expect(result.signal).not.toBeNull();
      expect(result.stderr).toContain('QUALITY_GATE_TEST_TIMEOUT_SIGNAL');
    } finally {
      watcher.close();
    }
  });

  it('forwards AbortSignal and kills a running child after its ready marker', async () => {
    const production = loadQualityGateProduction();
    const directory = createTempDirectory();
    const marker = path.join(directory, 'abort-ready.txt');
    const controller = new AbortController();
    const runner = production.createNodeProcessRunner({
      baseEnvironment: process.env,
    });
    const request = baseRequest(directory, ['ready-hold', marker]);
    const watcher = fs.watch(directory, (_eventType, fileName) => {
      if (fileName === path.basename(marker)) {
        controller.abort('QUALITY_GATE_TEST_ABORT');
      }
    });

    try {
      const result = await runner.run({
        ...request,
        timeoutMs: 20_000,
        signal: controller.signal,
      });

      expect(fs.readFileSync(marker, 'utf8')).toBe('ready');
      expect(result.exitCode).toBeNull();
      expect(result.signal).not.toBeNull();
      expect(result.timedOut).toBe(false);
      expect(result.timeoutSource).toBeNull();
      expect(result.stderr).toContain('QUALITY_GATE_TEST_ABORT');
    } finally {
      watcher.close();
    }
  });
});
