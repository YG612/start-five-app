import {REQUIRED_FORMAL_LOCK_FILES} from './qualityCommandContract';

interface FileSystemLike {
  existsSync(path: string): boolean;
  mkdirSync(path: string, options: {recursive: true}): unknown;
  mkdtempSync(prefix: string): string;
  readFileSync(path: string, encoding: 'utf8'): string;
  rmSync(path: string, options: {recursive: true; force: true}): void;
  writeFileSync(path: string, data: string, encoding: 'utf8'): void;
}

interface PathLike {
  dirname(path: string): string;
  join(...parts: string[]): string;
  resolve(...parts: string[]): string;
}

interface OperatingSystemLike {
  tmpdir(): string;
}

interface HashLike {
  update(value: string): HashLike;
  digest(encoding: 'hex'): string;
}

interface CryptoLike {
  createHash(algorithm: 'sha256'): HashLike;
}

interface SpawnResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

interface ChildProcessLike {
  spawnSync(
    executable: string,
    args: readonly string[],
    options: {cwd: string; encoding: 'utf8'},
  ): SpawnResult;
}

interface VerificationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

interface VerifierModule {
  readonly FORMAL_LOCK_FILES: readonly string[];
  verifyManifest(rootDir: string, manifestPath: string): VerificationResult;
  verifyAllLocks(rootDir: string): VerificationResult;
}

declare const __dirname: string;

const fs = jest.requireActual<FileSystemLike>('fs');
const path = jest.requireActual<PathLike>('path');
const os = jest.requireActual<OperatingSystemLike>('os');
const crypto = jest.requireActual<CryptoLike>('crypto');
const childProcess = jest.requireActual<ChildProcessLike>('child_process');
const projectRoot = path.resolve(__dirname, '..', '..');
const verifierPath = path.resolve(projectRoot, 'scripts', 'verifyTestLocks.cjs');
const nodeExecutable = (
  globalThis as unknown as {process: {execPath: string}}
).process.execPath;

let fixtureRoot = '';

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function write(relativePath: string, content: string): void {
  const target = path.join(fixtureRoot, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target, content, 'utf8');
}

function manifestLine(relativePath: string, content: string): string {
  return `${sha256(content)}  ${relativePath}`;
}

function writeManifest(lines: readonly string[]): string {
  const name = 'FIXTURE_LOCK.sha256';
  write(name, `${lines.join('\n')}\n`);
  return name;
}

function loadVerifier(): VerifierModule {
  expect(fs.existsSync(verifierPath)).toBe(true);
  return jest.requireActual<VerifierModule>(verifierPath);
}

function expectInvalid(manifestName: string): void {
  const result = loadVerifier().verifyManifest(fixtureRoot, manifestName);
  expect(result.ok).toBe(false);
  expect(result.errors.length).toBeGreaterThan(0);
}

beforeEach(() => {
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'start-five-lock-gate-'));
});

afterEach(() => {
  fs.rmSync(fixtureRoot, {recursive: true, force: true});
});

describe('test-lock verifier contract', () => {
  it('declares exactly every formal manifest, including Review 4 and Phase 4 review', () => {
    const verifier = loadVerifier();
    expect([...verifier.FORMAL_LOCK_FILES].sort()).toEqual(
      REQUIRED_FORMAL_LOCK_FILES,
    );
    expect(verifier.FORMAL_LOCK_FILES).not.toContain(
      'NATIVE_SCAFFOLD_LOCK.sha256',
    );

    const result = verifier.verifyAllLocks(projectRoot);
    expect(result).toEqual({ok: true, errors: []});
  });

  it('accepts a sorted POSIX manifest while leaving manifest/changelog out of the hash domain', () => {
    write('A.txt', 'alpha');
    write('nested/b.txt', 'beta');
    write('FIXTURE_LOCK_CHANGELOG.md', 'not part of the fixture lock');
    const manifestName = writeManifest([
      manifestLine('A.txt', 'alpha'),
      manifestLine('nested/b.txt', 'beta'),
    ]);

    expect(loadVerifier().verifyManifest(fixtureRoot, manifestName)).toEqual({
      ok: true,
      errors: [],
    });
  });

  it('rejects a missing listed file', () => {
    const manifestName = writeManifest([
      manifestLine('missing.txt', 'expected content'),
    ]);
    expectInvalid(manifestName);
  });

  it('rejects a SHA-256 mismatch for an existing listed file', () => {
    write('value.txt', 'actual');
    const manifestName = writeManifest([
      manifestLine('value.txt', 'different'),
    ]);
    expectInvalid(manifestName);
  });

  it.each([
    ['uppercase hash', `${'A'.repeat(64)}  value.txt`],
    ['short hash', `${'a'.repeat(63)}  value.txt`],
    ['one separator space', `${'a'.repeat(64)} value.txt`],
    ['three separator spaces', `${'a'.repeat(64)}   value.txt`],
    ['backslash path', `${'a'.repeat(64)}  nested\\value.txt`],
    ['blank record', `${'a'.repeat(64)}  value.txt\n\n`],
  ])('rejects non-canonical record format: %s', (_label, malformedRecord) => {
    write('value.txt', 'value');
    const manifestName = 'FIXTURE_LOCK.sha256';
    write(manifestName, `${malformedRecord}\n`);
    expectInvalid(manifestName);
  });

  it('rejects duplicate POSIX paths even when both records have valid hashes', () => {
    write('value.txt', 'value');
    const line = manifestLine('value.txt', 'value');
    expectInvalid(writeManifest([line, line]));
  });

  it.each([
    '/absolute.txt',
    'C:/absolute.txt',
    '//server/share.txt',
    '../outside.txt',
    'nested/../../outside.txt',
  ])('rejects absolute or root-escaping path: %s', unsafePath => {
    expectInvalid(writeManifest([manifestLine(unsafePath, 'value')]));
  });

  it('rejects records that are not sorted by POSIX relative path', () => {
    write('a.txt', 'a');
    write('b.txt', 'b');
    expectInvalid(
      writeManifest([
        manifestLine('b.txt', 'b'),
        manifestLine('a.txt', 'a'),
      ]),
    );
  });

  it('returns exit zero for a valid explicitly selected fixture lock', () => {
    write('value.txt', 'value');
    const manifestName = writeManifest([manifestLine('value.txt', 'value')]);
    expect(fs.existsSync(verifierPath)).toBe(true);

    const result = childProcess.spawnSync(
      nodeExecutable,
      [verifierPath, '--root', fixtureRoot, '--lock', manifestName],
      {cwd: projectRoot, encoding: 'utf8'},
    );
    expect(result.status).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).not.toMatch(/MODULE_NOT_FOUND/u);
  });

  it('returns non-zero for an invalid explicitly selected fixture lock', () => {
    write('value.txt', 'actual');
    const manifestName = writeManifest([
      manifestLine('value.txt', 'different'),
    ]);
    expect(fs.existsSync(verifierPath)).toBe(true);

    const result = childProcess.spawnSync(
      nodeExecutable,
      [verifierPath, '--root', fixtureRoot, '--lock', manifestName],
      {cwd: projectRoot, encoding: 'utf8'},
    );
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).not.toMatch(/MODULE_NOT_FOUND/u);
  });
});

