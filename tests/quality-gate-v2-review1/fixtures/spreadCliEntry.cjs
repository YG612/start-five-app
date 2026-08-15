'use strict';

const [cliPath, mode, injectedCanonicalPath, ...cliArguments] =
  process.argv.slice(2);

if (typeof cliPath !== 'string' || cliPath.length === 0) {
  throw new Error('QUALITY_GATE_V2_REVIEW1_CLI_PATH_REQUIRED');
}
if (mode !== 'spread' && mode !== 'add-canonical') {
  throw new Error('QUALITY_GATE_V2_REVIEW1_ENTRY_MODE_INVALID');
}

const pathKeys = Object.keys(process.env).filter(
  key => key.toUpperCase() === 'PATH',
);
if (pathKeys.length !== 1) {
  throw new Error('QUALITY_GATE_V2_REVIEW1_OUTER_PATH_IDENTITY_INVALID');
}

const environment = {...process.env};
if (mode === 'add-canonical') {
  if (
    typeof injectedCanonicalPath !== 'string' ||
    injectedCanonicalPath === '-'
  ) {
    throw new Error('QUALITY_GATE_V2_REVIEW1_CANONICAL_PATH_REQUIRED');
  }
  environment.PATH = injectedCanonicalPath;
}

const {runCliProcess} = require(cliPath);

runCliProcess(cliArguments, {
  cwd: process.cwd(),
  platform: 'win32',
  environment,
}).then(
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

