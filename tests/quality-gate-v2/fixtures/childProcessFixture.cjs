'use strict';

const fs = require('node:fs');

const mode = process.argv[2];

if (mode === 'argv') {
  process.stdout.write(JSON.stringify(process.argv.slice(3)));
} else if (mode === 'environment') {
  const keys = process.argv.slice(3);
  const selected = {};
  for (const key of keys) {
    selected[key] = Object.prototype.hasOwnProperty.call(process.env, key)
      ? process.env[key]
      : null;
  }
  process.stdout.write(JSON.stringify(selected));
} else if (mode === 'cwd') {
  process.stdout.write(process.cwd());
} else if (mode === 'exit') {
  process.stdout.write('fixture stdout');
  process.stderr.write('fixture stderr');
  process.exitCode = Number(process.argv[3]);
} else if (mode === 'ready-hold') {
  const markerPath = process.argv[3];
  fs.writeFileSync(markerPath, 'ready', 'utf8');
  process.stdin.resume();
} else if (mode === 'ready-pid-hold') {
  const markerPath = process.argv[3];
  fs.writeFileSync(markerPath, String(process.pid), 'utf8');
  process.stdin.resume();
} else if (mode === 'pid-status') {
  const pid = Number(process.argv[3]);
  if (!Number.isInteger(pid) || pid <= 0) {
    process.stderr.write('invalid pid');
    process.exitCode = 64;
  } else {
    try {
      process.kill(pid, 0);
      process.stdout.write('alive');
      process.exitCode = 1;
    } catch (error) {
      if (error && error.code === 'ESRCH') {
        process.stdout.write('terminated');
      } else {
        process.stderr.write(
          error instanceof Error ? error.message : 'pid probe failed',
        );
        process.exitCode = 2;
      }
    }
  }
} else if (mode === 'cli-abort-harness') {
  const cliPath = process.argv[3];
  const cliArgv = JSON.parse(process.argv[4]);
  const projectRoot = process.argv[5];
  const readyMarkerPath = process.argv[6];
  const bootstrapExpectedSelfSha256 = process.argv[7];
  const cliModule = require(cliPath);
  if (typeof cliModule.runCliProcess !== 'function') {
    process.stderr.write('QUALITY_GATE_V2_CLI_PROCESS_EXPORT_REQUIRED');
    process.exitCode = 65;
  } else {
    const controller = new AbortController();
    const watcher = fs.watch(projectRoot, () => {
      if (fs.existsSync(readyMarkerPath)) {
        controller.abort('QUALITY_GATE_V2_REAL_CLI_ABORT');
      }
    });
    Promise.resolve(
      cliModule.runCliProcess(cliArgv, {
        cwd: projectRoot,
        platform: 'win32',
        environment: process.env,
        bootstrapExpectedSelfSha256,
        signal: controller.signal,
        stdout: process.stdout,
        stderr: process.stderr,
        now: () => '2026-08-05T12:00:00.000Z',
        runId: 'real-abort-cli-run',
      }),
    ).then(
      exitCode => {
        watcher.close();
        process.exitCode = exitCode;
      },
      error => {
        watcher.close();
        process.stderr.write(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 66;
      },
    );
  }
} else {
  process.stderr.write('unknown fixture mode');
  process.exitCode = 64;
}
