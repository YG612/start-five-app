'use strict';

const fs = require('node:fs');
const childProcess = require('node:child_process');

const recordPath = process.env.REVIEW4_SPAWN_RECORD_PATH;
if (typeof recordPath !== 'string' || recordPath.length === 0) {
  throw new Error('QUALITY_GATE_REVIEW4_SPAWN_RECORD_REQUIRED');
}
const readyPath = process.env.REVIEW4_SPAWN_GUARD_READY_PATH;
if (typeof readyPath !== 'string' || readyPath.length === 0) {
  throw new Error('QUALITY_GATE_REVIEW4_SPAWN_GUARD_READY_REQUIRED');
}
fs.writeFileSync(readyPath, 'REVIEW4_SPAWN_GUARD_READY\n', 'utf8');

function blockChildCreation() {
  fs.appendFileSync(recordPath, 'REVIEW4_CHILD_CREATION_ATTEMPT\n', 'utf8');
  const error = new Error('QUALITY_GATE_REVIEW4_SPAWN_GUARD_BLOCKED');
  error.code = 'QUALITY_GATE_REVIEW4_SPAWN_GUARD_BLOCKED';
  throw error;
}

for (const api of [
  'spawn',
  'spawnSync',
  'exec',
  'execSync',
  'execFile',
  'execFileSync',
  'fork',
]) {
  childProcess[api] = blockChildCreation;
}
