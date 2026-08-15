import fs from 'node:fs';
import path from 'node:path';

const temporaryRoot = process.env.TEMP;
if (typeof temporaryRoot !== 'string' || temporaryRoot.length === 0) {
  throw new Error('REVIEW4_TEMP_REQUIRED');
}

const record = {
  runtime: 'mjs',
  pid: process.pid,
  ppid: process.ppid,
  argv: process.argv.slice(2),
  cwd: process.cwd(),
  execPath: process.execPath,
};
fs.appendFileSync(
  path.join(temporaryRoot, 'review4-companion-records.ndjson'),
  `${JSON.stringify(record)}\n`,
  'utf8',
);
process.stdout.write('{"event":"REVIEW4_COMPANION_OK"}\n');
