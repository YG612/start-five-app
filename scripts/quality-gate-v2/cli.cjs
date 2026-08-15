'use strict';

const crypto = require('node:crypto');
const qualityGate = require('./index.cjs');

async function runCliProcess(argv, overrides = {}) {
  const environment = overrides.environment || process.env;
  const dependencies = {
    cwd: overrides.cwd || process.cwd(),
    platform: overrides.platform || process.platform,
    environment,
    bootstrapExpectedSelfSha256:
      overrides.bootstrapExpectedSelfSha256 !== undefined
        ? overrides.bootstrapExpectedSelfSha256
        : environment.QUALITY_GATE_V2_BOOTSTRAP_SELF_SHA256,
    signal: overrides.signal,
    stdout: overrides.stdout || process.stdout,
    stderr: overrides.stderr || process.stderr,
    now: overrides.now || (() => new Date().toISOString()),
    runId: overrides.runId || crypto.randomUUID(),
    processRunner:
      overrides.processRunner ||
      qualityGate.createNodeProcessRunner({baseEnvironment: environment}),
  };
  return qualityGate.runQualityGateCli(argv, dependencies);
}

module.exports = {runCliProcess};

if (require.main === module) {
  runCliProcess(process.argv.slice(2)).then(
    exitCode => {
      process.exitCode = exitCode;
    },
    error => {
      process.stderr.write(
        error instanceof Error ? error.message : String(error),
      );
      process.exitCode = 1;
    },
  );
}
