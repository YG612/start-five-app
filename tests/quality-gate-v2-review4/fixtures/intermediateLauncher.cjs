'use strict';

const path = require('node:path');
const {spawnSync} = require('node:child_process');

const companion = path.join(__dirname, 'pnpmCompanion.cjs');
const result = spawnSync(process.execPath, [companion, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: process.env,
  shell: false,
  windowsHide: true,
  encoding: 'utf8',
});
if (result.error) throw result.error;
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exitCode = result.status === null ? 1 : result.status;
