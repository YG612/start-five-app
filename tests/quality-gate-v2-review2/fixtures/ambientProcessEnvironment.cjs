'use strict';

const fs = require('node:fs');

const [cliPath, mode, evidencePath, ...cliArguments] =
  process.argv.slice(2);

const MODES = new Set([
  'production',
  'oracle-add-key',
  'oracle-path-value',
  'oracle-path-shape',
]);

if (typeof cliPath !== 'string' || cliPath.length === 0) {
  throw new Error('QUALITY_GATE_V2_REVIEW2_CLI_PATH_REQUIRED');
}
if (!MODES.has(mode)) {
  throw new Error('QUALITY_GATE_V2_REVIEW2_AMBIENT_MODE_INVALID');
}
if (typeof evidencePath !== 'string' || evidencePath.length === 0) {
  throw new Error('QUALITY_GATE_V2_REVIEW2_EVIDENCE_PATH_REQUIRED');
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function snapshotEnvironment() {
  return Object.keys(process.env)
    .sort(compareText)
    .map(key => {
      const value = process.env[key];
      if (typeof value !== 'string') {
        throw new Error(
          'QUALITY_GATE_V2_REVIEW2_ENVIRONMENT_STRING_REQUIRED: ' + key,
        );
      }
      return {key, value};
    });
}

function snapshotMap(snapshot) {
  return new Map(snapshot.map(entry => [entry.key, entry.value]));
}

function diffSnapshots(before, after) {
  const beforeMap = snapshotMap(before);
  const afterMap = snapshotMap(after);
  const keys = [...new Set([...beforeMap.keys(), ...afterMap.keys()])]
    .sort(compareText);
  const diff = [];
  for (const key of keys) {
    const beforePresent = beforeMap.has(key);
    const afterPresent = afterMap.has(key);
    const beforeValue = beforePresent ? beforeMap.get(key) : null;
    const afterValue = afterPresent ? afterMap.get(key) : null;
    if (
      beforePresent !== afterPresent ||
      beforeValue !== afterValue
    ) {
      diff.push({key, before: beforeValue, after: afterValue});
    }
  }
  return diff;
}

function pathEntries(snapshot) {
  return snapshot.filter(entry => entry.key.toUpperCase() === 'PATH');
}

function restoreEnvironment(original) {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  for (const entry of original) {
    process.env[entry.key] = entry.value;
  }
}

function writeEvidence(evidence) {
  fs.writeFileSync(evidencePath, JSON.stringify(evidence), 'utf8');
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

async function runProductionOracle() {
  const invocationPid = process.pid;
  const before = snapshotEnvironment();
  let exitCode = null;
  let exposedError = null;
  try {
    const {runCliProcess} = require(cliPath);
    exitCode = await runCliProcess(cliArguments, {
      cwd: process.cwd(),
      platform: 'win32',
      environment: {...process.env},
    });
  } catch (error) {
    exposedError = error;
  }
  const after = snapshotEnvironment();
  const evidence = {
    mode,
    invocationPid,
    beforePid: invocationPid,
    afterPid: process.pid,
    before,
    after,
    diff: diffSnapshots(before, after),
    exitCode,
    error: exposedError === null ? null : errorText(exposedError),
  };
  writeEvidence(evidence);
  if (exposedError !== null) {
    throw exposedError;
  }
  return exitCode;
}

function applyOracleMutation(original) {
  if (mode === 'oracle-add-key') {
    const key = 'QUALITY_GATE_V2_REVIEW2_ORACLE_ADDED';
    process.env[key] = 'review2-added-value';
    return {kind: 'add-key', key};
  }
  const paths = pathEntries(original);
  if (paths.length !== 1) {
    throw new Error('QUALITY_GATE_V2_REVIEW2_ONE_PATH_REQUIRED');
  }
  const current = paths[0];
  if (mode === 'oracle-path-value') {
    process.env[current.key] =
      current.value + ';C:\\review2\\oracle-path-value';
    return {kind: 'path-value', key: current.key};
  }
  delete process.env[current.key];
  const newKey = current.key === 'PATH' ? 'Path' : 'PATH';
  process.env[newKey] = current.value;
  return {kind: 'path-shape', oldKey: current.key, newKey};
}

function runMutationControl() {
  const original = snapshotEnvironment();
  let before = null;
  let after = null;
  let observedDiff = null;
  let mutation = null;
  let exposedError = null;
  try {
    before = snapshotEnvironment();
    mutation = applyOracleMutation(original);
    after = snapshotEnvironment();
    observedDiff = diffSnapshots(before, after);
    if (observedDiff.length === 0) {
      throw new Error('QUALITY_GATE_V2_REVIEW2_ORACLE_MISSED_MUTATION');
    }
  } catch (error) {
    exposedError = error;
  } finally {
    restoreEnvironment(original);
    const restored = snapshotEnvironment();
    const restoreDiff = diffSnapshots(original, restored);
    writeEvidence({
      mode,
      invocationPid: process.pid,
      original,
      before,
      after,
      diff: observedDiff,
      mutation,
      restored,
      restoreDiff,
      error: exposedError === null ? null : errorText(exposedError),
    });
    if (restoreDiff.length !== 0 && exposedError === null) {
      exposedError = new Error(
        'QUALITY_GATE_V2_REVIEW2_ENVIRONMENT_RESTORE_FAILED',
      );
    }
  }
  if (exposedError !== null) {
    throw exposedError;
  }
  return 0;
}

const operation = mode === 'production'
  ? runProductionOracle()
  : Promise.resolve().then(runMutationControl);

operation.then(
  exitCode => {
    process.exitCode = exitCode;
  },
  error => {
    process.stderr.write(errorText(error));
    process.exitCode = 1;
  },
);

