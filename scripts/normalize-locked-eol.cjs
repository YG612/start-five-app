'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const registry = JSON.parse(
  fs.readFileSync(path.join(root, 'quality-gate.acceptance.json'), 'utf8'),
);
const targets = new Set();

for (const lock of registry.locks) {
  targets.add(lock.manifest);
  const manifest = fs.readFileSync(path.join(root, lock.manifest), 'utf8');
  for (const line of manifest.split(/\r?\n/u)) {
    const match = /^[a-f0-9]{64}  (.+)$/u.exec(line);
    if (match !== null) targets.add(match[1]);
  }
}

let normalized = 0;
for (const relative of targets) {
  const file = path.join(root, ...relative.split('/'));
  const bytes = fs.readFileSync(file);
  const next = Buffer.from(bytes.toString('utf8').replace(/\r\n/gu, '\n'));
  if (!bytes.equals(next)) {
    fs.writeFileSync(file, next);
    normalized += 1;
  }
}

process.stdout.write(`Normalized ${normalized} locked files to LF.\n`);
