'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const environment = {
  ANDROID_HOME: process.env.ANDROID_HOME ?? null,
  ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT ?? null,
  CI: process.env.CI ?? null,
  ComSpec: process.env.ComSpec ?? null,
  JAVA_HOME: process.env.JAVA_HOME ?? null,
  NODE_OPTIONS: process.env.NODE_OPTIONS ?? null,
  PATH: process.env.PATH ?? null,
  PATHEXT: process.env.PATHEXT ?? null,
  SystemRoot: process.env.SystemRoot ?? null,
  TEMP: process.env.TEMP ?? null,
  TMP: process.env.TMP ?? null,
  forbiddenSecret: process.env.QUALITY_GATE_FORBIDDEN_SECRET ?? null,
  pathKeys: Object.keys(process.env)
    .filter(key => key.toUpperCase() === 'PATH')
    .sort(),
};

fs.writeFileSync(
  path.join(root, 'review3-companion-recorder.json'),
  JSON.stringify({
    runtime: 'cjs',
    argv: process.argv.slice(2),
    cwd: root,
    execPath: process.execPath,
    environment,
  }),
  'utf8',
);
fs.writeFileSync(
  path.join(root, 'review3-companion-pid.txt'),
  String(process.pid),
  'utf8',
);
process.stdout.write('REVIEW3_CJS_COMPANION_OK');
