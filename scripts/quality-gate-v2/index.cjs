'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');

const QUALITY_GATE_STAGE_ORDER = Object.freeze([
  'formal-tests',
  'typecheck',
  'android-lint',
  'android-unit-tests',
  'android-assemble',
  'android-signature',
  'android-zipalign',
  'android-package-manifest',
  'lock-manifests',
  'ios-static-audit',
]);
const QUALITY_GATE_TEST_STAGE_ORDER = Object.freeze([
  'formal-tests',
  'lock-manifests',
]);
const QUALITY_GATE_ENV_ALLOWLIST = Object.freeze([
  'ANDROID_HOME',
  'ANDROID_SDK_ROOT',
  'CI',
  'ComSpec',
  'JAVA_HOME',
  'NODE_OPTIONS',
  'PATH',
  'PATHEXT',
  'SystemRoot',
  'TEMP',
  'TMP',
]);
const QUALITY_GATE_REPORT_SCHEMA = 'start-five.quality-gate-report';
const QUALITY_GATE_REPORT_VERSION = 1;
const QUALITY_GATE_PNPM_LAUNCH_UNSAFE = 'QUALITY_GATE_PNPM_LAUNCH_UNSAFE';
const QUALITY_GATE_PNPM_LAUNCH_AMBIGUOUS = 'QUALITY_GATE_PNPM_LAUNCH_AMBIGUOUS';
const QUALITY_GATE_PNPM_PREFLIGHT = Symbol('qualityGatePnpmPreflight');
const QUALITY_GATE_V2_BOOTSTRAP_MANIFEST = 'QUALITY_GATE_V2_LOCK.sha256';
const QUALITY_GATE_V2_BOOTSTRAP_SPEC = 'QUALITY_GATE_V2_TEST_SPEC.md';
const QUALITY_GATE_V2_BOOTSTRAP_TEST_ROOT = 'tests/quality-gate-v2';
const IOS_CHECK_IDS = Object.freeze([
  'xcode-project',
  'application-target',
  'shared-scheme',
  'scheme-target-graph',
  'info-plist',
  'privacy-manifest',
  'react-native-pod',
  'react-native-entry',
]);
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const REGISTRY_KEYS = Object.freeze(['locks', 'schema', 'version']);
const REGISTRY_ENTRY_KEYS = Object.freeze([
  'expectedSelfSha256',
  'inventoryRoots',
  'manifest',
  'ordering',
  'specPath',
  'status',
  'testRoots',
]);

function codedError(code, detail, cause = null) {
  const message = detail ? code + ': ' + detail : code;
  const error = new Error(message);
  Object.defineProperties(error, {
    code: {value: code, enumerable: true},
    cause: {value: cause, enumerable: true},
  });
  return error;
}

function errorText(error) {
  if (error && typeof error === 'object') {
    const code = typeof error.code === 'string' ? error.code : null;
    const message = typeof error.message === 'string' ? error.message : String(error);
    return code && !message.includes(code) ? code + ': ' + message : message;
  }
  return String(error);
}

function sha256Buffer(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function comparePosix(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareManifestPath(left, right) {
  const leftIdentity = windowsIdentity(left);
  const rightIdentity = windowsIdentity(right);
  return leftIdentity < rightIdentity
    ? -1
    : leftIdentity > rightIdentity
      ? 1
      : comparePosix(left, right);
}

function sameStringArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isWindowsPathKey(value) {
  return value.length === 4 &&
    (value[0] === 'P' || value[0] === 'p') &&
    (value[1] === 'A' || value[1] === 'a') &&
    (value[2] === 'T' || value[2] === 't') &&
    (value[3] === 'H' || value[3] === 'h');
}

function detachedEnvironment(source, platform) {
  const environment = Object.create(null);
  const pathEntries = [];
  for (const key of Object.keys(isRecord(source) ? source : {})) {
    const value = source[key];
    if (platform === 'win32' && isWindowsPathKey(key)) {
      pathEntries.push({key, value});
    } else if (typeof value === 'string') {
      environment[key] = value;
    }
  }
  if (platform === 'win32' && pathEntries.length > 0) {
    const pathValue = pathEntries[0].value;
    if (pathEntries.some(entry => entry.value !== pathValue)) {
      throw codedError(
        'QUALITY_GATE_ENV_PATH_CONFLICT',
        'Windows PATH variants must have byte-identical values.',
      );
    }
    if (typeof pathValue === 'string') {
      environment.PATH = pathValue;
    }
  }
  return environment;
}

function hasExactKeys(value, expected) {
  return sameStringArray(Object.keys(value).sort(comparePosix), [...expected].sort(comparePosix));
}

function isSafePosixRelative(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\\')) {
    return false;
  }
  if (value.startsWith('/') || /^[A-Za-z]:/.test(value)) {
    return false;
  }
  if (path.posix.normalize(value) !== value) {
    return false;
  }
  return !value.split('/').some(segment => segment === '' || segment === '.' || segment === '..');
}

function windowsIdentity(value) {
  return value.replaceAll('/', '\\').toLowerCase();
}

function assertCanonicalSha(value, code) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw codedError(code, 'Expected a canonical lowercase SHA-256 identity.');
  }
}

function readRegistryDocument(registryPath) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  } catch (error) {
    throw codedError('QUALITY_GATE_REGISTRY_INVALID', 'Registry is missing or is not valid JSON.', error);
  }
  if (
    !isRecord(parsed) ||
    !hasExactKeys(parsed, REGISTRY_KEYS) ||
    parsed.schema !== 'start-five.quality-lock-registry' ||
    parsed.version !== 1 ||
    !Array.isArray(parsed.locks)
  ) {
    throw codedError('QUALITY_GATE_REGISTRY_INVALID', 'Registry top-level schema is invalid.');
  }
  const locks = [];
  const manifestIdentities = new Set();
  const acceptedRootIdentities = new Set();
  for (const rawEntry of parsed.locks) {
    const entry = validateRegistryEntry(rawEntry);
    const manifestIdentity = windowsIdentity(entry.manifest);
    if (manifestIdentities.has(manifestIdentity)) {
      throw codedError('QUALITY_GATE_REGISTRY_DUPLICATE_MANIFEST', entry.manifest);
    }
    manifestIdentities.add(manifestIdentity);
    if (entry.status === 'accepted') {
      for (const testRoot of entry.testRoots) {
        const identity = windowsIdentity(testRoot);
        if (acceptedRootIdentities.has(identity)) {
          throw codedError('QUALITY_GATE_REGISTRY_ENTRY_INVALID', 'Duplicate accepted test root: ' + testRoot);
        }
        acceptedRootIdentities.add(identity);
      }
    }
    locks.push(entry);
  }
  return {locks};
}

function validateRegistryEntry(rawEntry) {
  if (!isRecord(rawEntry) || !hasExactKeys(rawEntry, REGISTRY_ENTRY_KEYS)) {
    throw codedError('QUALITY_GATE_REGISTRY_ENTRY_INVALID', 'Unknown or missing registry entry field.');
  }
  const {manifest, status, ordering, specPath, inventoryRoots, testRoots, expectedSelfSha256} = rawEntry;
  if (!['accepted', 'candidate', 'rejected'].includes(status)) {
    throw codedError('QUALITY_GATE_REGISTRY_ENTRY_INVALID', 'Invalid status.');
  }
  if (!['posix', 'spec-first-posix'].includes(ordering)) {
    throw codedError('QUALITY_GATE_REGISTRY_ENTRY_INVALID', 'Invalid ordering.');
  }
  if (!isSafePosixRelative(manifest)) {
    throw codedError('QUALITY_GATE_REGISTRY_ENTRY_INVALID', 'Unsafe manifest path.');
  }
  const candidateSuffix = manifest.endsWith('.sha256.draft');
  if ((status === 'candidate') !== candidateSuffix || (!candidateSuffix && !manifest.endsWith('.sha256'))) {
    throw codedError('QUALITY_GATE_REGISTRY_ENTRY_INVALID', 'Manifest suffix does not match status.');
  }
  if (ordering === 'spec-first-posix') {
    if (!isSafePosixRelative(specPath)) {
      throw codedError('QUALITY_GATE_REGISTRY_ENTRY_INVALID', 'A safe spec path is required.');
    }
  } else if (specPath !== null) {
    throw codedError('QUALITY_GATE_REGISTRY_ENTRY_INVALID', 'POSIX ordering requires a null spec path.');
  }
  if (!Array.isArray(inventoryRoots) || !Array.isArray(testRoots)) {
    throw codedError('QUALITY_GATE_REGISTRY_ENTRY_INVALID', 'Root fields must be arrays.');
  }
  if (inventoryRoots.some(root => !isSafePosixRelative(root)) || testRoots.some(root => !isSafePosixRelative(root))) {
    throw codedError('QUALITY_GATE_REGISTRY_ENTRY_INVALID', 'Root paths must be safe canonical POSIX relatives.');
  }
  if (new Set(inventoryRoots.map(windowsIdentity)).size !== inventoryRoots.length ||
      new Set(testRoots.map(windowsIdentity)).size !== testRoots.length) {
    throw codedError('QUALITY_GATE_REGISTRY_ENTRY_INVALID', 'Root paths must be unique under Windows identity.');
  }
  for (const testRoot of testRoots) {
    if (!inventoryRoots.some(root => testRoot === root || testRoot.startsWith(root + '/'))) {
      throw codedError('QUALITY_GATE_REGISTRY_ENTRY_INVALID', 'Test root is outside the declared inventory.');
    }
  }
  if (status === 'candidate') {
    if (expectedSelfSha256 !== null) {
      throw codedError('QUALITY_GATE_REGISTRY_ENTRY_INVALID', 'Candidate identities must remain null.');
    }
  } else if (typeof expectedSelfSha256 !== 'string' || !SHA256_PATTERN.test(expectedSelfSha256)) {
    throw codedError('QUALITY_GATE_REGISTRY_ENTRY_INVALID', 'Accepted and rejected identities must be canonical.');
  }
  return {
    manifest,
    status,
    ordering,
    specPath,
    inventoryRoots: [...inventoryRoots],
    testRoots: [...testRoots],
    expectedSelfSha256,
  };
}

function parseManifestBytes(bytes, manifestRelativePath, errorPrefix = 'QUALITY_GATE_MANIFEST') {
  const text = bytes.toString('utf8');
  if (text.length === 0 || (!text.endsWith('\n'))) {
    throw codedError(errorPrefix + '_FORMAT_INVALID', 'Manifest must be non-empty and end in LF or CRLF.');
  }
  const rawLines = text.split('\n');
  rawLines.pop();
  const entries = [];
  const identities = new Set();
  for (const rawLine of rawLines) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    if (!match) {
      throw codedError(errorPrefix + '_FORMAT_INVALID', 'Malformed manifest line.');
    }
    const relativePath = match[2];
    if (!isSafePosixRelative(relativePath)) {
      throw codedError(errorPrefix + '_UNSAFE_PATH', relativePath);
    }
    if (windowsIdentity(relativePath) === windowsIdentity(manifestRelativePath)) {
      throw codedError(errorPrefix + '_SELF_ENTRY', relativePath);
    }
    const identity = windowsIdentity(relativePath);
    if (identities.has(identity)) {
      throw codedError(errorPrefix + '_DUPLICATE_PATH', relativePath);
    }
    identities.add(identity);
    entries.push({sha256: match[1], path: relativePath});
  }
  return entries;
}

function listInventoryFiles(projectRoot, inventoryRoots) {
  const files = new Set();
  function visit(absolutePath, relativePath) {
    let stat;
    try {
      stat = fs.lstatSync(absolutePath);
    } catch (_error) {
      return;
    }
    if (stat.isSymbolicLink()) {
      throw codedError('QUALITY_GATE_MANIFEST_UNSAFE_PATH', 'Reparse inventory path: ' + relativePath);
    }
    if (stat.isFile()) {
      files.add(relativePath);
      return;
    }
    if (!stat.isDirectory()) {
      return;
    }
    const names = fs.readdirSync(absolutePath).sort(comparePosix);
    for (const name of names) {
      const childRelative = relativePath + '/' + name;
      visit(path.join(absolutePath, name), childRelative);
    }
  }
  for (const root of inventoryRoots) {
    visit(path.join(projectRoot, ...root.split('/')), root);
  }
  return files;
}

function pathCoveredByInventory(relativePath, inventoryRoots) {
  return inventoryRoots.some(root => relativePath === root || relativePath.startsWith(root + '/'));
}

function validateAcceptedManifest(projectRoot, entry) {
  const manifestPath = path.join(projectRoot, ...entry.manifest.split('/'));
  let bytes;
  try {
    bytes = fs.readFileSync(manifestPath);
  } catch (error) {
    throw codedError('QUALITY_GATE_MANIFEST_FILE_MISSING', entry.manifest, error);
  }
  if (sha256Buffer(bytes) !== entry.expectedSelfSha256) {
    throw codedError('QUALITY_GATE_MANIFEST_SELF_HASH_MISMATCH', entry.manifest);
  }
  const entries = parseManifestBytes(bytes, entry.manifest);
  const paths = entries.map(item => item.path);
  const expectedOrder = entry.ordering === 'spec-first-posix'
    ? [entry.specPath, ...paths.filter(item => item !== entry.specPath).sort(compareManifestPath)]
    : [...paths].sort(compareManifestPath);
  if (!sameStringArray(paths, expectedOrder)) {
    throw codedError('QUALITY_GATE_MANIFEST_ORDER_INVALID', entry.manifest);
  }
  if (entry.ordering === 'spec-first-posix' && paths[0] !== entry.specPath) {
    throw codedError('QUALITY_GATE_MANIFEST_ORDER_INVALID', entry.manifest);
  }
  for (const item of entries) {
    if (!pathCoveredByInventory(item.path, entry.inventoryRoots)) {
      throw codedError('QUALITY_GATE_MANIFEST_INVENTORY_UNEXPECTED', item.path);
    }
    const absolutePath = path.join(projectRoot, ...item.path.split('/'));
    let fileBytes;
    try {
      const stat = fs.lstatSync(absolutePath);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error('Not a regular file.');
      }
      fileBytes = fs.readFileSync(absolutePath);
    } catch (error) {
      throw codedError('QUALITY_GATE_MANIFEST_FILE_MISSING', item.path, error);
    }
    if (sha256Buffer(fileBytes) !== item.sha256) {
      throw codedError('QUALITY_GATE_MANIFEST_SHA_MISMATCH', item.path);
    }
  }
  const inventory = listInventoryFiles(projectRoot, entry.inventoryRoots);
  const listed = new Set(paths);
  for (const inventoryPath of inventory) {
    if (!listed.has(inventoryPath)) {
      throw codedError('QUALITY_GATE_MANIFEST_INVENTORY_MISSING', inventoryPath);
    }
  }
  return entries.length;
}

async function discoverAcceptedTestRoots(options) {
  const registry = readRegistryDocument(options.registryPath);
  return [...new Set(registry.locks
    .filter(entry => entry.status === 'accepted')
    .flatMap(entry => entry.testRoots))].sort(comparePosix);
}

async function validateLockManifests(options) {
  const registry = readRegistryDocument(options.registryPath);
  const accepted = registry.locks.filter(entry => entry.status === 'accepted');
  let entries = 0;
  for (const entry of accepted) {
    entries += validateAcceptedManifest(options.projectRoot, entry);
  }
  return {
    validatedManifests: accepted.length,
    entries,
    acceptedTestRoots: [...new Set(accepted.flatMap(entry => entry.testRoots))].sort(comparePosix),
    acceptedManifests: accepted.map(entry => entry.manifest).sort(comparePosix),
    excludedManifests: registry.locks
      .filter(entry => entry.status !== 'accepted')
      .map(entry => ({manifest: entry.manifest, status: entry.status}))
      .sort((left, right) => comparePosix(left.manifest, right.manifest)),
  };
}

async function validateQualityGateV2Bootstrap(options) {
  assertCanonicalSha(options.expectedSelfSha256, 'QUALITY_GATE_V2_BOOTSTRAP_TRUST_INVALID');
  const manifestPath = path.join(options.projectRoot, QUALITY_GATE_V2_BOOTSTRAP_MANIFEST);
  let bytes;
  try {
    const stat = fs.lstatSync(manifestPath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error('Not a regular manifest file.');
    }
    bytes = fs.readFileSync(manifestPath);
  } catch (error) {
    throw codedError('QUALITY_GATE_V2_BOOTSTRAP_MANIFEST_REQUIRED', QUALITY_GATE_V2_BOOTSTRAP_MANIFEST, error);
  }
  const actualSelf = sha256Buffer(bytes);
  if (actualSelf !== options.expectedSelfSha256) {
    throw codedError('QUALITY_GATE_V2_BOOTSTRAP_SELF_MISMATCH', actualSelf);
  }
  let entries;
  try {
    entries = parseManifestBytes(bytes, QUALITY_GATE_V2_BOOTSTRAP_MANIFEST, 'QUALITY_GATE_V2_BOOTSTRAP');
  } catch (error) {
    if (error && error.code === 'QUALITY_GATE_V2_BOOTSTRAP_UNSAFE_PATH') {
      throw codedError('QUALITY_GATE_V2_BOOTSTRAP_INVENTORY_MISMATCH', errorText(error), error);
    }
    throw error;
  }
  const listedPaths = entries.map(entry => entry.path);
  const expectedOrder = [
    QUALITY_GATE_V2_BOOTSTRAP_SPEC,
    ...listedPaths.filter(value => value !== QUALITY_GATE_V2_BOOTSTRAP_SPEC).sort(comparePosix),
  ];
  if (!sameStringArray(listedPaths, expectedOrder)) {
    throw codedError('QUALITY_GATE_V2_BOOTSTRAP_INVENTORY_MISMATCH', 'Bootstrap ordering or spec entry is invalid.');
  }
  for (const entry of entries) {
    if (!(entry.path === QUALITY_GATE_V2_BOOTSTRAP_SPEC || entry.path.startsWith(QUALITY_GATE_V2_BOOTSTRAP_TEST_ROOT + '/'))) {
      throw codedError('QUALITY_GATE_V2_BOOTSTRAP_INVENTORY_MISMATCH', entry.path);
    }
    let content;
    try {
      const absolutePath = path.join(options.projectRoot, ...entry.path.split('/'));
      const stat = fs.lstatSync(absolutePath);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error('Not a regular file.');
      }
      content = fs.readFileSync(absolutePath);
    } catch (error) {
      throw codedError('QUALITY_GATE_V2_BOOTSTRAP_INVENTORY_MISMATCH', entry.path, error);
    }
    if (sha256Buffer(content) !== entry.sha256) {
      throw codedError('QUALITY_GATE_V2_BOOTSTRAP_SHA_MISMATCH', entry.path);
    }
  }
  const inventory = listInventoryFiles(options.projectRoot, [
    QUALITY_GATE_V2_BOOTSTRAP_SPEC,
    QUALITY_GATE_V2_BOOTSTRAP_TEST_ROOT,
  ]);
  const listed = new Set(listedPaths);
  if (inventory.size !== listed.size || [...inventory].some(item => !listed.has(item))) {
    throw codedError('QUALITY_GATE_V2_BOOTSTRAP_INVENTORY_MISMATCH', 'Bootstrap inventory is incomplete.');
  }
  return {
    manifest: QUALITY_GATE_V2_BOOTSTRAP_MANIFEST,
    validatedSelfSha256: actualSelf,
    entries: entries.length,
    specPath: QUALITY_GATE_V2_BOOTSTRAP_SPEC,
    inventoryRoots: [QUALITY_GATE_V2_BOOTSTRAP_SPEC, QUALITY_GATE_V2_BOOTSTRAP_TEST_ROOT],
    testRoots: [QUALITY_GATE_V2_BOOTSTRAP_TEST_ROOT],
  };
}

function pnpmLaunchError(code) {
  return codedError(code);
}

function throwUnsafePnpmLaunch() {
  throw pnpmLaunchError(QUALITY_GATE_PNPM_LAUNCH_UNSAFE);
}

function isMissingPathError(error) {
  return error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}

function candidateLstat(filePath) {
  try {
    return fs.lstatSync(filePath, {bigint: true});
  } catch (error) {
    if (isMissingPathError(error)) return null;
    throwUnsafePnpmLaunch();
  }
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode;
}

function canonicalWindowsAbsolute(filePath) {
  const separatorNormalized = typeof filePath === 'string'
    ? filePath.replaceAll('/', '\\')
    : '';
  const deviceNormalized = separatorNormalized.toLowerCase();
  const isDriveQualified = /^[a-z]:\\/i.test(separatorNormalized);
  const isCompleteUnc = /^\\\\[^\\]+\\[^\\]+(?:\\.*)?$/.test(separatorNormalized);
  if (
    typeof filePath !== 'string' ||
    filePath.length === 0 ||
    filePath.trim() !== filePath ||
    filePath.includes('\0') ||
    filePath.includes('"') ||
    deviceNormalized.startsWith('\\\\?\\') ||
    deviceNormalized.startsWith('\\\\.\\') ||
    deviceNormalized.startsWith('\\??\\') ||
    (!isDriveQualified && !isCompleteUnc)
  ) {
    throwUnsafePnpmLaunch();
  }
  const normalized = path.win32.normalize(separatorNormalized);
  const parsed = path.win32.parse(normalized);
  const normalizedCompleteUnc = normalized.startsWith('\\\\') &&
    /^\\\\[^\\]+\\[^\\]+\\/.test(parsed.root);
  if (
    windowsIdentity(normalized) !== windowsIdentity(separatorNormalized) ||
    (!/^[a-z]:\\/i.test(normalized) && !normalizedCompleteUnc)
  ) {
    throwUnsafePnpmLaunch();
  }
  return normalized;
}

function validateOrdinaryWindowsPath(filePath, expectedKind) {
  const normalized = canonicalWindowsAbsolute(filePath);
  const parsed = path.win32.parse(normalized);
  const segments = normalized.slice(parsed.root.length).split('\\').filter(Boolean);
  let cursor = parsed.root;
  let finalStat = null;
  const chain = [];
  for (let index = 0; index <= segments.length; index += 1) {
    if (index > 0) cursor = path.win32.join(cursor, segments[index - 1]);
    let before;
    let real;
    let realStat;
    let after;
    try {
      before = fs.lstatSync(cursor, {bigint: true});
      if (before.isSymbolicLink()) throwUnsafePnpmLaunch();
      real = fs.realpathSync.native(cursor);
      realStat = fs.lstatSync(real, {bigint: true});
      after = fs.lstatSync(cursor, {bigint: true});
    } catch (error) {
      if (error && error.code === QUALITY_GATE_PNPM_LAUNCH_UNSAFE) throw error;
      throwUnsafePnpmLaunch();
    }
    if (
      realStat.isSymbolicLink() ||
      !sameFileIdentity(before, realStat) ||
      !sameFileIdentity(before, after)
    ) {
      throwUnsafePnpmLaunch();
    }
    finalStat = after;
    chain.push(Object.freeze({path: cursor, stat: after}));
  }
  if (
    finalStat === null ||
    (expectedKind === 'file' && !finalStat.isFile()) ||
    (expectedKind === 'directory' && !finalStat.isDirectory())
  ) {
    throwUnsafePnpmLaunch();
  }
  return {path: normalized, stat: finalStat, chain: Object.freeze(chain)};
}

function withinWindowsRoot(root, candidate) {
  const relative = path.win32.relative(root, candidate);
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith('..\\') &&
    !path.win32.isAbsolute(relative)
  );
}

function validateCurrentNode(selectedNodeExecutable) {
  const selectedPath = canonicalWindowsAbsolute(selectedNodeExecutable);
  const currentPath = canonicalWindowsAbsolute(process.execPath);
  const actualProcessPath = canonicalWindowsAbsolute(process.argv[0]);
  const selected = validateOrdinaryWindowsPath(selectedPath, 'file');
  const current = validateOrdinaryWindowsPath(currentPath, 'file');
  const actualProcess = validateOrdinaryWindowsPath(actualProcessPath, 'file');
  if (
    !sameFileIdentity(selected.stat, current.stat) ||
    !sameFileIdentity(current.stat, actualProcess.stat)
  ) {
    throwUnsafePnpmLaunch();
  }
  return current.path;
}

function sameValidatedWindowsPath(left, right) {
  if (
    windowsIdentity(left.path) !== windowsIdentity(right.path) ||
    !sameFileIdentity(left.stat, right.stat) ||
    left.chain.length !== right.chain.length
  ) {
    return false;
  }
  return left.chain.every((entry, index) => {
    const other = right.chain[index];
    return other !== undefined &&
      windowsIdentity(entry.path) === windowsIdentity(other.path) &&
      sameFileIdentity(entry.stat, other.stat);
  });
}

function captureWindowsLaunchPlan(launch) {
  const executable = validateOrdinaryWindowsPath(launch.executable, 'file');
  const companion = launch.argsPrefix.length === 0
    ? null
    : validateOrdinaryWindowsPath(launch.argsPrefix[0], 'file');
  return Object.freeze({
    executable,
    companion,
    argsPrefix: Object.freeze(companion === null ? [] : [companion.path]),
  });
}

function assertWindowsLaunchPlanUnchanged(plan) {
  const executable = validateOrdinaryWindowsPath(plan.executable.path, 'file');
  if (!sameValidatedWindowsPath(plan.executable, executable)) throwUnsafePnpmLaunch();
  if (plan.companion !== null) {
    const companion = validateOrdinaryWindowsPath(plan.companion.path, 'file');
    if (!sameValidatedWindowsPath(plan.companion, companion)) throwUnsafePnpmLaunch();
  }
}

function removePrivateLaunchBinding(binding) {
  if (binding === null) return;
  try {
    fs.rmSync(binding.root, {recursive: true, force: true});
  } catch (_error) {
    throwUnsafePnpmLaunch();
  }
}

function readStableBoundSource(boundPath) {
  try {
    const before = fs.lstatSync(boundPath, {bigint: true});
    if (!before.isFile() || before.isSymbolicLink()) throwUnsafePnpmLaunch();
    const bytes = fs.readFileSync(boundPath);
    const after = fs.lstatSync(boundPath, {bigint: true});
    if (!sameFileIdentity(before, after)) throwUnsafePnpmLaunch();
    return bytes;
  } catch (error) {
    if (error && error.code === QUALITY_GATE_PNPM_LAUNCH_UNSAFE) throw error;
    throwUnsafePnpmLaunch();
  }
}

function bindValidatedWindowsFile(bindingRoot, validated, label) {
  const extension = path.win32.extname(validated.path).toLowerCase();
  const destination = path.win32.join(
    bindingRoot,
    label + '-' + crypto.randomBytes(12).toString('hex') + extension,
  );
  try {
    fs.linkSync(validated.path, destination);
    const linked = fs.lstatSync(destination, {bigint: true});
    if (!linked.isFile() || linked.isSymbolicLink() || !sameFileIdentity(validated.stat, linked)) {
      throwUnsafePnpmLaunch();
    }
  } catch (linkError) {
    if (linkError && linkError.code === QUALITY_GATE_PNPM_LAUNCH_UNSAFE) throw linkError;
    let descriptor = null;
    try {
      descriptor = fs.openSync(validated.path, 'r');
      const before = fs.fstatSync(descriptor, {bigint: true});
      if (!before.isFile() || !sameFileIdentity(validated.stat, before)) throwUnsafePnpmLaunch();
      const bytes = fs.readFileSync(descriptor);
      const after = fs.fstatSync(descriptor, {bigint: true});
      if (!sameFileIdentity(before, after)) throwUnsafePnpmLaunch();
      fs.writeFileSync(destination, bytes, {flag: 'wx'});
      const copied = readStableBoundSource(destination);
      if (sha256(bytes) !== sha256(copied)) throwUnsafePnpmLaunch();
    } catch (copyError) {
      if (copyError && copyError.code === QUALITY_GATE_PNPM_LAUNCH_UNSAFE) throw copyError;
      throwUnsafePnpmLaunch();
    } finally {
      if (descriptor !== null) {
        try { fs.closeSync(descriptor); } catch (_error) { throwUnsafePnpmLaunch(); }
      }
    }
  }
  return destination;
}

function createPrivateLaunchBinding(plan) {
  let root = null;
  try {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'start-five-qgv2-launch-'));
    const validatedRoot = validateOrdinaryWindowsPath(root, 'directory');
    const originalParent = path.win32.dirname(plan.companion.path);
    const executableParent = path.win32.dirname(plan.executable.path);
    if (
      withinWindowsRoot(originalParent, validatedRoot.path) ||
      withinWindowsRoot(validatedRoot.path, originalParent) ||
      withinWindowsRoot(executableParent, validatedRoot.path) ||
      withinWindowsRoot(validatedRoot.path, executableParent)
    ) {
      throwUnsafePnpmLaunch();
    }
    const companionPath = bindValidatedWindowsFile(validatedRoot.path, plan.companion, 'companion');
    const executablePath = bindValidatedWindowsFile(validatedRoot.path, plan.executable, 'node-runtime');
    return {root: validatedRoot.path, companionPath, executablePath};
  } catch (error) {
    if (root !== null) {
      try { fs.rmSync(root, {recursive: true, force: true}); } catch (_cleanupError) {}
    }
    if (error && error.code === QUALITY_GATE_PNPM_LAUNCH_UNSAFE) throw error;
    throwUnsafePnpmLaunch();
  }
}

function isWindowsAbsoluteFileToken(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  const normalized = value.replaceAll('/', '\\');
  return /^[a-z]:\\/i.test(normalized) || /^\\\\[^\\]+\\[^\\]+(?:\\.*)?$/.test(normalized);
}

function bindExistingWindowsFileArgument(binding, value, index) {
  if (!isWindowsAbsoluteFileToken(value)) return value;
  const normalized = canonicalWindowsAbsolute(value);
  const stat = candidateLstat(normalized);
  if (stat === null || !stat.isFile()) return value;
  if (stat.isSymbolicLink()) throwUnsafePnpmLaunch();
  const validated = validateOrdinaryWindowsPath(normalized, 'file');
  return bindValidatedWindowsFile(binding.root, validated, 'arg-' + String(index));
}

function assertSelfContainedBoundModule(source, extension) {
  const text = source.toString('utf8');
  const relativeCjs = /(?:require(?:\.resolve)?|import)\s*\(\s*['"]\.{1,2}[\\/]/m;
  const relativeEsm = /(?:import|export)\s+(?:[^'";]*?\sfrom\s*)?['"]\.{1,2}[\\/]/m;
  if (relativeCjs.test(text) || (extension === '.mjs' && relativeEsm.test(text))) {
    throwUnsafePnpmLaunch();
  }
}

const BOUND_CJS_BOOTSTRAP = [
  "'use strict';",
  "const fs=require('node:fs');",
  "const path=require('node:path');",
  "const Module=require('node:module');",
  'const trustedExec=process.argv[1];',
  'const original=process.argv[2];',
  'const bound=process.argv[3];',
  'const business=process.argv.slice(4);',
  "Object.defineProperty(process,'execPath',{configurable:true,enumerable:true,writable:false,value:trustedExec});",
  'process.argv=[trustedExec,original,...business];',
  "const loaded=new Module(original,module);",
  "loaded.id='.';",
  'loaded.filename=original;',
  'loaded.paths=Module._nodeModulePaths(path.dirname(original));',
  'process.mainModule=loaded;',
  "loaded._compile(fs.readFileSync(bound,'utf8'),original);",
].join('');

const BOUND_MJS_BOOTSTRAP = [
  "import {pathToFileURL} from 'node:url';",
  'const trustedExec=process.argv[1];',
  'const original=process.argv[2];',
  'const bound=process.argv[3];',
  'const business=process.argv.slice(4);',
  "Object.defineProperty(process,'execPath',{configurable:true,enumerable:true,writable:false,value:trustedExec});",
  'process.argv=[trustedExec,original,...business];',
  'await import(pathToFileURL(bound).href);',
].join('');

function bindWindowsCompanionLaunch(plan, requestArgs) {
  const hostIdentity = plan.companion !== null &&
    typeof plan.companion.stat.dev === 'bigint' &&
    typeof plan.companion.stat.ino === 'bigint' &&
    typeof plan.companion.stat.mode === 'bigint';
  if (!hostIdentity) {
    return {
      binding: null,
      executable: plan.executable.path,
      args: [...plan.argsPrefix, ...requestArgs],
    };
  }
  const binding = createPrivateLaunchBinding(plan);
  try {
    const extension = path.win32.extname(plan.companion.path).toLowerCase();
    if (extension !== '.cjs' && extension !== '.mjs') throwUnsafePnpmLaunch();
    const source = readStableBoundSource(binding.companionPath);
    assertSelfContainedBoundModule(source, extension);
    const boundRequestArgs = requestArgs.map((value, index) =>
      bindExistingWindowsFileArgument(binding, value, index)
    );
    const args = extension === '.cjs'
      ? [
          '-e', BOUND_CJS_BOOTSTRAP,
          plan.executable.path, plan.companion.path, binding.companionPath,
          ...boundRequestArgs,
        ]
      : [
          '--input-type=module', '--eval', BOUND_MJS_BOOTSTRAP,
          plan.executable.path, plan.companion.path, binding.companionPath,
          ...boundRequestArgs,
        ];
    return {binding, executable: binding.executablePath, args};
  } catch (error) {
    removePrivateLaunchBinding(binding);
    if (error && error.code === QUALITY_GATE_PNPM_LAUNCH_UNSAFE) throw error;
    throwUnsafePnpmLaunch();
  }
}

function existingCompanion(filePath) {
  const stat = candidateLstat(filePath);
  if (stat === null) return null;
  if (!stat.isFile() || stat.isSymbolicLink()) throwUnsafePnpmLaunch();
  return validateOrdinaryWindowsPath(filePath, 'file').path;
}

function resolveCompanionInToolIdentity(toolDirectory, stem, selectedNodeExecutable) {
  const nodeExecutable = validateCurrentNode(selectedNodeExecutable);
  const localCjs = existingCompanion(path.win32.join(toolDirectory, stem + '.cjs'));
  if (localCjs !== null) return {executable: nodeExecutable, argsPrefix: [localCjs]};
  const localMjs = existingCompanion(path.win32.join(toolDirectory, stem + '.mjs'));
  if (localMjs !== null) return {executable: nodeExecutable, argsPrefix: [localMjs]};

  const roots = [
    toolDirectory,
    path.win32.dirname(toolDirectory),
    path.win32.dirname(path.win32.dirname(toolDirectory)),
  ].filter((value, index, values) =>
    values.findIndex(other => windowsIdentity(other) === windowsIdentity(value)) === index
  );
  const cjsCandidates = [];
  const mjsCandidates = [];
  for (const runtimeRoot of roots) {
    if (!withinWindowsRoot(runtimeRoot, toolDirectory) || !withinWindowsRoot(runtimeRoot, nodeExecutable)) continue;
    for (const extension of ['cjs', 'mjs']) {
      for (const candidate of [
        path.win32.join(runtimeRoot, 'node', 'node_modules', 'pnpm', 'bin', 'pnpm.' + extension),
        path.win32.join(runtimeRoot, 'node_modules', 'pnpm', 'bin', 'pnpm.' + extension),
      ]) {
        const companion = existingCompanion(candidate);
        if (companion === null) continue;
        const collection = extension === 'cjs' ? cjsCandidates : mjsCandidates;
        if (!collection.some(value => windowsIdentity(value) === windowsIdentity(companion))) {
          collection.push(companion);
        }
      }
    }
  }
  if (cjsCandidates.length > 1 || (cjsCandidates.length === 0 && mjsCandidates.length > 1)) {
    throwUnsafePnpmLaunch();
  }
  if (cjsCandidates.length === 1) return {executable: nodeExecutable, argsPrefix: [cjsCandidates[0]]};
  if (mjsCandidates.length === 1) return {executable: nodeExecutable, argsPrefix: [mjsCandidates[0]]};
  throwUnsafePnpmLaunch();
}

function resolveToolDirectoryLaunch(toolDirectory, commandName, selectedNodeExecutable) {
  const stem = path.win32.basename(commandName, path.win32.extname(commandName));
  const extension = path.win32.extname(commandName).toLowerCase();
  const exact = path.win32.join(toolDirectory, commandName);
  if (extension === '.exe' || extension === '.com') {
    if (candidateLstat(exact) === null) return null;
    return {executable: validateOrdinaryWindowsPath(exact, 'file').path, argsPrefix: []};
  }
  if (extension === '.cjs' || extension === '.mjs') {
    const companion = existingCompanion(exact);
    if (companion === null) return null;
    return {executable: validateCurrentNode(selectedNodeExecutable), argsPrefix: [companion]};
  }
  if (extension === '.cmd' || extension === '.bat') {
    if (candidateLstat(exact) === null) return null;
    validateOrdinaryWindowsPath(exact, 'file');
    return resolveCompanionInToolIdentity(toolDirectory, stem, selectedNodeExecutable);
  }
  if (extension !== '') throwUnsafePnpmLaunch();

  for (const nativeExtension of ['.com', '.exe']) {
    const native = path.win32.join(toolDirectory, stem + nativeExtension);
    if (candidateLstat(native) !== null) {
      return {executable: validateOrdinaryWindowsPath(native, 'file').path, argsPrefix: []};
    }
  }
  for (const wrapperExtension of ['.cmd', '.bat']) {
    const wrapper = path.win32.join(toolDirectory, stem + wrapperExtension);
    if (candidateLstat(wrapper) !== null) {
      validateOrdinaryWindowsPath(wrapper, 'file');
      return resolveCompanionInToolIdentity(toolDirectory, stem, selectedNodeExecutable);
    }
  }
  if (
    candidateLstat(path.win32.join(toolDirectory, stem + '.cjs')) !== null ||
    candidateLstat(path.win32.join(toolDirectory, stem + '.mjs')) !== null
  ) {
    return resolveCompanionInToolIdentity(toolDirectory, stem, selectedNodeExecutable);
  }
  return null;
}

function resolveWindowsPnpmLaunch(executable, pathValue, selectedNodeExecutable) {
  if (typeof executable !== 'string' || executable.length === 0) throwUnsafePnpmLaunch();
  const hasSeparator = executable.includes('\\') || executable.includes('/');
  if (path.win32.isAbsolute(executable)) {
    const explicit = canonicalWindowsAbsolute(executable);
    const extension = path.win32.extname(explicit).toLowerCase();
    if (extension === '.exe' || extension === '.com') {
      return {executable: validateOrdinaryWindowsPath(explicit, 'file').path, argsPrefix: []};
    }
    if (extension === '.cjs' || extension === '.mjs') {
      return {
        executable: validateCurrentNode(selectedNodeExecutable),
        argsPrefix: [validateOrdinaryWindowsPath(explicit, 'file').path],
      };
    }
    if (extension === '.cmd' || extension === '.bat') {
      validateOrdinaryWindowsPath(explicit, 'file');
      return resolveCompanionInToolIdentity(
        path.win32.dirname(explicit),
        path.win32.basename(explicit, extension),
        selectedNodeExecutable,
      );
    }
    if (extension === '') {
      const launch = resolveToolDirectoryLaunch(
        path.win32.dirname(explicit),
        path.win32.basename(explicit),
        selectedNodeExecutable,
      );
      if (launch !== null) return launch;
    }
    throwUnsafePnpmLaunch();
  }
  if (hasSeparator || path.win32.isAbsolute(path.win32.normalize(executable))) throwUnsafePnpmLaunch();
  if (typeof pathValue !== 'string' || pathValue.length === 0) throwUnsafePnpmLaunch();
  const matches = [];
  for (const rawEntry of pathValue.split(';')) {
    if (rawEntry.length === 0) continue;
    const toolDirectory = canonicalWindowsAbsolute(rawEntry);
    const launch = resolveToolDirectoryLaunch(toolDirectory, executable, selectedNodeExecutable);
    if (launch !== null) matches.push(launch);
  }
  if (matches.length === 0) throwUnsafePnpmLaunch();
  if (matches.length !== 1) throw pnpmLaunchError(QUALITY_GATE_PNPM_LAUNCH_AMBIGUOUS);
  return matches[0];
}

function isPnpmExecutableToken(executable) {
  if (typeof executable !== 'string' || executable.length === 0) return false;
  const base = path.win32.basename(executable).toLowerCase();
  return ['pnpm', 'pnpm.com', 'pnpm.exe', 'pnpm.cmd', 'pnpm.bat', 'pnpm.cjs', 'pnpm.mjs'].includes(base);
}

function isWindowsAbsoluteModuleToken(executable) {
  if (typeof executable !== 'string' || executable.length === 0) return false;
  const extension = path.win32.extname(executable).toLowerCase();
  if (extension !== '.cjs' && extension !== '.mjs') return false;
  const normalized = executable.replaceAll('/', '\\');
  return /^[a-z]:\\/i.test(normalized) ||
    /^\\\\[^\\]+\\[^\\]+(?:\\.*)?$/.test(normalized);
}

function createNodeProcessRunner(options) {
  const sourceEnvironment = options && isRecord(options.baseEnvironment) ? options.baseEnvironment : {};
  const baseEnvironment = detachedEnvironment(sourceEnvironment, 'exact');
  const platform = options && typeof options.platform === 'string' ? options.platform : process.platform;
  const defaultNodeExecutable = options && typeof options.nodeExecutable === 'string'
    ? options.nodeExecutable
    : process.execPath;
  let configuredPnpm = null;
  const runner = {
    run(request) {
      for (const key of Object.keys(request.env)) {
        if (!QUALITY_GATE_ENV_ALLOWLIST.includes(key)) {
          return Promise.reject(codedError('QUALITY_GATE_ENV_NOT_ALLOWED', key));
        }
      }
      const environment = {};
      for (const key of QUALITY_GATE_ENV_ALLOWLIST) {
        const baseValue = baseEnvironment[key];
        if (typeof baseValue === 'string') {
          environment[key] = baseValue;
        }
      }
      for (const [key, value] of Object.entries(request.env)) {
        environment[key] = value;
      }
      let launchExecutable = request.executable;
      let launchArgs = [...request.args];
      let launchPlan = null;
      let launchBinding = null;
      const configured = configuredPnpm !== null && request.executable === configuredPnpm.executable;
      if (
        platform === 'win32' &&
        (configured ||
          isPnpmExecutableToken(request.executable) ||
          isWindowsAbsoluteModuleToken(request.executable))
      ) {
        try {
          if (configured) {
            if ((environment.PATH || '') !== configuredPnpm.pathValue) throwUnsafePnpmLaunch();
            launchPlan = configuredPnpm.plan;
          } else {
            const launch = resolveWindowsPnpmLaunch(
              request.executable,
              environment.PATH || '',
              defaultNodeExecutable,
            );
            launchPlan = captureWindowsLaunchPlan(launch);
          }
          assertWindowsLaunchPlanUnchanged(launchPlan);
          launchExecutable = launchPlan.executable.path;
          launchArgs = [...launchPlan.argsPrefix, ...request.args];
          if (launchPlan.companion !== null) {
            const boundLaunch = bindWindowsCompanionLaunch(launchPlan, request.args);
            launchBinding = boundLaunch.binding;
            launchExecutable = boundLaunch.executable;
            launchArgs = boundLaunch.args;
          }
        } catch (error) {
          if (launchBinding !== null) {
            try { removePrivateLaunchBinding(launchBinding); } catch (_cleanupError) {}
          }
          return Promise.reject(error);
        }
      }
      return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        let child;
        try {
          if (launchPlan !== null && launchBinding === null) assertWindowsLaunchPlanUnchanged(launchPlan);
          child = spawn(launchExecutable, launchArgs, {
            cwd: request.cwd,
            env: environment,
            shell: false,
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe'],
          });
        } catch (error) {
          try {
            removePrivateLaunchBinding(launchBinding);
            launchBinding = null;
          } catch (cleanupError) {
            reject(cleanupError);
            return;
          }
          reject(codedError('QUALITY_GATE_PROCESS_START_FAILED', request.executable, error));
          return;
        }
        let stdout = '';
        let stderr = '';
        let completed = false;
        let terminationKind = null;
        const listeners = [];
        const appendReason = signal => {
          const reason = signal && signal.reason !== undefined ? String(signal.reason) : 'aborted';
          if (reason.length > 0 && !stderr.includes(reason)) {
            stderr += (stderr.length > 0 ? '\n' : '') + reason;
          }
        };
        const terminate = (kind, signal) => {
          if (completed || terminationKind !== null) {
            return;
          }
          terminationKind = kind;
          appendReason(signal);
          child.kill('SIGTERM');
        };
        const deadline = setTimeout(() => terminate('deadline', null), request.timeoutMs);
        if (request.timeoutSignal) {
          const listener = () => terminate('signal', request.timeoutSignal);
          request.timeoutSignal.addEventListener('abort', listener, {once: true});
          listeners.push([request.timeoutSignal, listener]);
          if (request.timeoutSignal.aborted) {
            listener();
          }
        }
        if (request.signal) {
          const listener = () => terminate('abort', request.signal);
          request.signal.addEventListener('abort', listener, {once: true});
          listeners.push([request.signal, listener]);
          if (request.signal.aborted) {
            listener();
          }
        }
        child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
        child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
        child.on('error', error => {
          if (completed) return;
          completed = true;
          clearTimeout(deadline);
          for (const [signal, listener] of listeners) signal.removeEventListener('abort', listener);
          try {
            removePrivateLaunchBinding(launchBinding);
            launchBinding = null;
          } catch (cleanupError) {
            reject(cleanupError);
            return;
          }
          reject(codedError('QUALITY_GATE_PROCESS_START_FAILED', request.executable, error));
        });
        child.on('close', (exitCode, signal) => {
          if (completed) return;
          completed = true;
          clearTimeout(deadline);
          for (const [abortSignal, listener] of listeners) abortSignal.removeEventListener('abort', listener);
          try {
            removePrivateLaunchBinding(launchBinding);
            launchBinding = null;
          } catch (cleanupError) {
            reject(cleanupError);
            return;
          }
          resolve({
            exitCode: terminationKind === null ? exitCode : null,
            signal: terminationKind === null ? signal : (signal || 'SIGTERM'),
            stdout,
            stderr,
            timedOut: terminationKind === 'deadline' || terminationKind === 'signal',
            timeoutSource: terminationKind === 'deadline' ? 'deadline' : terminationKind === 'signal' ? 'signal' : null,
            durationMs: Math.max(0, Date.now() - startedAt),
          });
        });
      });
    },
  };
  Object.defineProperty(runner, QUALITY_GATE_PNPM_PREFLIGHT, {
    value(executable, pathValue, nodeExecutable) {
      if (platform !== 'win32') return null;
      const launch = resolveWindowsPnpmLaunch(executable, pathValue, nodeExecutable);
      const plan = captureWindowsLaunchPlan(launch);
      configuredPnpm = {executable, nodeExecutable, pathValue, plan};
      return {executable: plan.executable.path, argsPrefix: [...plan.argsPrefix]};
    },
  });
  return runner;
}

function runtimeEnvironment(runtime) {
  return {
    ANDROID_HOME: runtime.androidSdkRoot,
    ANDROID_SDK_ROOT: runtime.androidSdkRoot,
    CI: '1',
    JAVA_HOME: runtime.javaHome,
    PATH: runtime.path,
  };
}

function processRequest(options, executable, args, cwd) {
  const request = {
    executable,
    args,
    cwd,
    env: runtimeEnvironment(options.runtime),
    timeoutMs: options.timeoutMs,
  };
  if (options.signal !== undefined) request.signal = options.signal;
  return request;
}

function createQualityGateOrchestrator(options) {
  function plan(mode) {
    if (mode !== 'test' && mode !== 'full') {
      throw codedError('QUALITY_GATE_MODE_INVALID', String(mode));
    }
    const formal = {
      id: 'formal-tests',
      kind: 'process',
      request: processRequest(options, options.runtime.pnpmExecutable, [
        'exec', 'jest', '--runInBand', '--ci', '--coverage=false', '--roots', ...options.acceptedTestRoots,
      ], options.projectRoot),
    };
    if (mode === 'test') {
      return [formal, {id: 'lock-manifests', kind: 'internal', request: null}];
    }
    const androidRoot = path.win32.join(options.projectRoot, 'android');
    const gradle = path.win32.join(androidRoot, 'gradlew.bat');
    const gradleArgs = task => ['--offline', '--no-daemon', '--stacktrace', task];
    const buildTools = path.win32.join(options.runtime.androidSdkRoot, 'build-tools', options.runtime.androidBuildToolsVersion);
    const apk = path.win32.join(options.projectRoot, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
    return [
      formal,
      {id: 'typecheck', kind: 'process', request: processRequest(options, options.runtime.pnpmExecutable, ['exec', 'tsc', '--noEmit'], options.projectRoot)},
      {id: 'android-lint', kind: 'process', request: processRequest(options, gradle, gradleArgs(':app:lintDebug'), androidRoot)},
      {id: 'android-unit-tests', kind: 'process', request: processRequest(options, gradle, gradleArgs(':app:testDebugUnitTest'), androidRoot)},
      {id: 'android-assemble', kind: 'process', request: processRequest(options, gradle, gradleArgs(':app:assembleDebug'), androidRoot)},
      {id: 'android-signature', kind: 'process', request: processRequest(options, path.win32.join(buildTools, 'apksigner.bat'), ['verify', '--verbose', '--print-certs', apk], options.projectRoot)},
      {id: 'android-zipalign', kind: 'process', request: processRequest(options, path.win32.join(buildTools, 'zipalign.exe'), ['-c', '-P', '16', '-v', '4', apk], options.projectRoot)},
      {id: 'android-package-manifest', kind: 'process', request: processRequest(options, path.win32.join(buildTools, 'aapt.exe'), ['dump', 'badging', apk], options.projectRoot)},
      {id: 'lock-manifests', kind: 'internal', request: null},
      {id: 'ios-static-audit', kind: 'internal', request: null},
    ];
  }

  async function run(mode) {
    const stagePlan = plan(mode);
    const startedAt = options.now();
    const evidence = stagePlan.map(stage => ({
      id: stage.id,
      status: 'skipped',
      request: stage.request,
      result: null,
      startedAt: null,
      finishedAt: null,
    }));
    let failure = null;
    for (let index = 0; index < stagePlan.length; index += 1) {
      const stage = stagePlan[index];
      const started = options.now();
      let result;
      if (stage.kind === 'process') {
        try {
          result = await options.processRunner.run(stage.request);
        } catch (error) {
          if (
            error &&
            (error.code === QUALITY_GATE_PNPM_LAUNCH_UNSAFE ||
              error.code === QUALITY_GATE_PNPM_LAUNCH_AMBIGUOUS)
          ) {
            throw error;
          }
          result = internalResult(false, errorText(error));
        }
      } else if (stage.id === 'lock-manifests') {
        try {
          const summary = await options.lockValidator.validate();
          result = internalResult(true, JSON.stringify(summary));
        } catch (error) {
          result = internalResult(false, errorText(error));
        }
      } else {
        try {
          const audit = await options.iosAuditor.audit();
          result = internalResult(audit.status === 'passed', audit.detail + '\n' + JSON.stringify(audit.checks));
        } catch (error) {
          result = internalResult(false, errorText(error));
        }
      }
      const failed = result.exitCode !== 0 || result.signal !== null || result.timedOut;
      evidence[index] = {
        id: stage.id,
        status: failed ? 'failed' : 'passed',
        request: stage.request,
        result,
        startedAt: started,
        finishedAt: options.now(),
      };
      if (failed) {
        failure = {
          stageId: stage.id,
          exitCode: result.exitCode,
          signal: result.signal,
          timedOut: result.timedOut,
          timeoutSource: result.timeoutSource,
          stdout: result.stdout,
          stderr: result.stderr,
        };
        break;
      }
    }
    const report = {
      schema: QUALITY_GATE_REPORT_SCHEMA,
      version: QUALITY_GATE_REPORT_VERSION,
      runId: options.runId,
      mode,
      platform: options.platform,
      status: failure === null ? 'passed' : 'failed',
      projectRoot: options.projectRoot,
      startedAt,
      finishedAt: options.now(),
      stages: evidence,
      failure,
    };
    try {
      await options.reportWriter.write(report);
    } catch (error) {
      if (error && error.code === 'QUALITY_GATE_REPORT_WRITE_FAILED') throw error;
      throw codedError('QUALITY_GATE_REPORT_WRITE_FAILED', errorText(error), error);
    }
    return report;
  }
  return {plan, run};
}

function internalResult(passed, detail) {
  return {
    exitCode: passed ? 0 : 1,
    signal: null,
    stdout: passed ? detail : '',
    stderr: passed ? '' : detail,
    timedOut: false,
    timeoutSource: null,
    durationMs: 0,
  };
}

function renderSummary(report) {
  const lines = [
    'Start Five Quality Gate V2',
    'runId: ' + report.runId,
    'mode: ' + report.mode,
    'status: ' + report.status,
    'result: ' + report.status.toUpperCase(),
    'projectRoot: ' + report.projectRoot,
  ];
  for (const stage of report.stages) {
    lines.push(stage.id + ': ' + stage.status);
  }
  if (report.failure) {
    lines.push('stageId: ' + report.failure.stageId);
    lines.push('exitCode: ' + String(report.failure.exitCode));
    lines.push('signal: ' + String(report.failure.signal));
    lines.push('timedOut: ' + String(report.failure.timedOut));
    lines.push('timeoutSource: ' + String(report.failure.timeoutSource));
    lines.push('stdout: ' + report.failure.stdout);
    lines.push('stderr: ' + report.failure.stderr);
  }
  return lines.join('\n') + '\n';
}

function createAtomicQualityGateReportWriter(options) {
  let queue = Promise.resolve();
  const jsonPath = path.join(options.reportDirectory, 'quality-gate-report.json');
  const summaryPath = path.join(options.reportDirectory, 'quality-gate-summary.txt');
  async function writeNow(report) {
    const nonce = process.pid + '-' + crypto.randomBytes(12).toString('hex');
    const jsonTemp = jsonPath + '.' + nonce + '.tmp';
    const summaryTemp = summaryPath + '.' + nonce + '.tmp';
    try {
      fs.mkdirSync(options.reportDirectory, {recursive: true});
      fs.writeFileSync(jsonTemp, JSON.stringify(report, null, 2) + '\n', {encoding: 'utf8', flag: 'wx'});
      fs.writeFileSync(summaryTemp, renderSummary(report), {encoding: 'utf8', flag: 'wx'});
      fs.renameSync(jsonTemp, jsonPath);
      fs.renameSync(summaryTemp, summaryPath);
      return {jsonPath, summaryPath};
    } catch (error) {
      try { fs.rmSync(jsonTemp, {force: true}); } catch (_cleanupError) {}
      try { fs.rmSync(summaryTemp, {force: true}); } catch (_cleanupError) {}
      throw codedError('QUALITY_GATE_REPORT_WRITE_FAILED', 'Unable to atomically write evidence.', error);
    }
  }
  return {
    write(report) {
      const operation = queue.then(() => writeNow(report));
      queue = operation.catch(() => undefined);
      return operation;
    },
  };
}

function readTextIfFile(filePath) {
  try {
    const stat = fs.lstatSync(filePath);
    return stat.isFile() && !stat.isSymbolicLink() ? fs.readFileSync(filePath, 'utf8') : null;
  } catch (_error) {
    return null;
  }
}

async function auditIosProjectStatic(options) {
  const appJsonText = readTextIfFile(path.join(options.projectRoot, 'app.json'));
  let appName = 'StartFive';
  try {
    const parsed = JSON.parse(appJsonText || '{}');
    if (isRecord(parsed) && typeof parsed.name === 'string' && parsed.name.length > 0) appName = parsed.name;
  } catch (_error) {}
  const projectPath = path.join(options.projectRoot, 'ios', appName + '.xcodeproj', 'project.pbxproj');
  const schemePath = path.join(options.projectRoot, 'ios', appName + '.xcodeproj', 'xcshareddata', 'xcschemes', appName + '.xcscheme');
  const project = readTextIfFile(projectPath);
  const scheme = readTextIfFile(schemePath);
  const info = readTextIfFile(path.join(options.projectRoot, 'ios', appName, 'Info.plist'));
  const privacy = readTextIfFile(path.join(options.projectRoot, 'ios', appName, 'PrivacyInfo.xcprivacy'));
  const podfile = readTextIfFile(path.join(options.projectRoot, 'ios', 'Podfile'));
  const delegate = readTextIfFile(path.join(options.projectRoot, 'ios', appName, 'AppDelegate.swift'));
  const nativeTargetPattern = /([A-Fa-f0-9]{24})\s+\/\*\s*([^*]+?)\s*\*\/\s*=\s*\{\s*isa\s*=\s*PBXNativeTarget;([\s\S]*?)\n\s*\};/g;
  let targetMatch = null;
  if (project) {
    for (const match of project.matchAll(nativeTargetPattern)) {
      if (match[2].trim() === appName || new RegExp('name\\s*=\\s*' + escapeRegExp(appName) + '\\s*;').test(match[3])) {
        targetMatch = match;
        break;
      }
    }
  }
  const anyApplicationTarget = !!(targetMatch && /productType\s*=\s*"com\.apple\.product-type\.application";/.test(targetMatch[3]));
  const blueprintMatch = scheme ? /BlueprintIdentifier\s*=\s*"([A-Fa-f0-9]{24})"/.exec(scheme) : null;
  const projectExists = project !== null;
  const schemeExists = scheme !== null;
  const checksById = {
    'xcode-project': projectExists,
    'application-target': projectExists && anyApplicationTarget,
    'shared-scheme': schemeExists,
    'scheme-target-graph': projectExists && schemeExists && targetMatch !== null && blueprintMatch !== null && targetMatch[1].toLowerCase() === blueprintMatch[1].toLowerCase(),
    'info-plist': !!(info && /<key>CFBundleIdentifier<\/key>/.test(info) && /<key>UILaunchStoryboardName<\/key>/.test(info) && /<key>NSAllowsArbitraryLoads<\/key>\s*<false\s*\/>/.test(info)),
    'privacy-manifest': !!(privacy && /<key>NSPrivacyTracking<\/key>\s*<false\s*\/>/.test(privacy) && /<key>NSPrivacyCollectedDataTypes<\/key>/.test(privacy) && /<key>NSPrivacyAccessedAPITypes<\/key>/.test(privacy)),
    'react-native-pod': !!(podfile && /use_react_native!\s*\(/.test(podfile) && new RegExp("target\\s+['\"]" + escapeRegExp(appName) + "['\"]\\s+do").test(podfile)),
    'react-native-entry': !!(delegate && new RegExp('withModuleName:\\s*"' + escapeRegExp(appName) + '"').test(delegate)),
  };
  const checks = IOS_CHECK_IDS.map(id => ({
    id,
    status: checksById[id] ? 'passed' : 'failed',
    detail: (checksById[id] ? 'Passed' : 'Failed') + ' Windows static check: ' + id + '.',
  }));
  const passed = checks.every(check => check.status === 'passed');
  return {
    status: passed ? 'passed' : 'failed',
    scope: 'windows-static-only',
    detail: passed
      ? 'Static iOS project audit passed; no Windows iOS build is claimed.'
      : 'Windows static audit failed; no iOS build is claimed.',
    checks,
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function authoritativeRegistryPath(projectRoot) {
  return path.win32.join(projectRoot, 'quality-gate.acceptance.json');
}

function pathHasReparseIdentity(value) {
  try {
    const resolved = path.resolve(value);
    let cursor = resolved;
    while (true) {
      const stat = fs.lstatSync(cursor);
      if (stat.isSymbolicLink()) return true;
      const parent = path.dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }
  } catch (_error) {
    return false;
  }
  return false;
}

function parseQualityGateCliArgs(argv, cwd, environment = process.env) {
  if (!Array.isArray(argv)) throw codedError('QUALITY_GATE_CLI_USAGE', 'argv must be an array.');
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
    return defaultCliArguments('help', cwd, environment);
  }
  const mode = argv[0];
  if (!['test', 'full', 'validate-locks'].includes(mode)) {
    throw codedError('QUALITY_GATE_CLI_USAGE', 'Expected test, full, validate-locks, or --help.');
  }
  const values = new Map();
  const known = new Set(['--project-root', '--report-dir', '--timeout-ms', '--node', '--pnpm', '--java-home', '--android-sdk', '--build-tools', '--registry']);
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!known.has(key) || typeof value !== 'string' || value.length === 0 || values.has(key)) {
      throw codedError('QUALITY_GATE_CLI_USAGE', 'Invalid option: ' + String(key));
    }
    values.set(key, value);
  }
  const projectRoot = values.get('--project-root') || cwd;
  const result = defaultCliArguments(mode, projectRoot, environment);
  result.projectRoot = projectRoot;
  result.reportDirectory = values.get('--report-dir') || path.win32.join(projectRoot, 'quality-reports');
  const timeoutText = values.get('--timeout-ms');
  if (timeoutText !== undefined) {
    const timeoutMs = Number(timeoutText);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw codedError('QUALITY_GATE_CLI_USAGE', 'timeout-ms must be a positive safe integer.');
    result.timeoutMs = timeoutMs;
  }
  result.nodeExecutable = values.get('--node') || result.nodeExecutable;
  result.pnpmExecutable = values.get('--pnpm') || result.pnpmExecutable;
  result.javaHome = values.get('--java-home') || result.javaHome;
  result.androidSdkRoot = values.get('--android-sdk') || result.androidSdkRoot;
  result.androidBuildToolsVersion = values.get('--build-tools') || result.androidBuildToolsVersion;
  const canonicalRegistry = authoritativeRegistryPath(projectRoot);
  const selected = values.get('--registry');
  const selectedResolved = selected === undefined
    ? canonicalRegistry
    : path.win32.isAbsolute(selected) ? path.win32.normalize(selected) : path.win32.resolve(projectRoot, selected);
  if (windowsIdentity(path.win32.normalize(selectedResolved)) !== windowsIdentity(path.win32.normalize(canonicalRegistry)) || pathHasReparseIdentity(projectRoot)) {
    throw codedError('QUALITY_GATE_CLI_REGISTRY_NOT_AUTHORITATIVE', selectedResolved);
  }
  result.registryPath = canonicalRegistry;
  return result;
}

function defaultCliArguments(mode, projectRoot, environment = process.env) {
  return {
    mode,
    projectRoot,
    reportDirectory: path.win32.join(projectRoot, 'quality-reports'),
    timeoutMs: 120000,
    nodeExecutable: process.execPath,
    pnpmExecutable: 'pnpm',
    javaHome: environment.JAVA_HOME || '',
    androidSdkRoot: environment.ANDROID_SDK_ROOT || environment.ANDROID_HOME || '',
    androidBuildToolsVersion: '36.0.0',
    registryPath: authoritativeRegistryPath(projectRoot),
  };
}

function assertBootstrapRegistryBinding(registryPath, expectedSelfSha256) {
  const registry = readRegistryDocument(registryPath);
  const matching = registry.locks.filter(entry =>
    entry.status === 'accepted' &&
    entry.manifest === QUALITY_GATE_V2_BOOTSTRAP_MANIFEST &&
    entry.ordering === 'spec-first-posix' &&
    entry.specPath === QUALITY_GATE_V2_BOOTSTRAP_SPEC &&
    sameStringArray(entry.inventoryRoots, [QUALITY_GATE_V2_BOOTSTRAP_SPEC, QUALITY_GATE_V2_BOOTSTRAP_TEST_ROOT]) &&
    sameStringArray(entry.testRoots, [QUALITY_GATE_V2_BOOTSTRAP_TEST_ROOT]) &&
    entry.expectedSelfSha256 === expectedSelfSha256
  );
  if (matching.length !== 1) {
    throw codedError('QUALITY_GATE_V2_BOOTSTRAP_REGISTRY_MISMATCH', 'Registry must contain exactly one accepted fixed V2 identity.');
  }
}

function preflightFailureReport(mode, projectRoot, runId, now, error) {
  const stageIds = mode === 'full' ? QUALITY_GATE_STAGE_ORDER : QUALITY_GATE_TEST_STAGE_ORDER;
  const stages = stageIds.map(id => ({
    id,
    status: id === 'lock-manifests' ? 'failed' : 'skipped',
    request: null,
    result: id === 'lock-manifests' ? internalResult(false, errorText(error)) : null,
    startedAt: id === 'lock-manifests' ? now() : null,
    finishedAt: id === 'lock-manifests' ? now() : null,
  }));
  return {
    schema: QUALITY_GATE_REPORT_SCHEMA,
    version: QUALITY_GATE_REPORT_VERSION,
    runId,
    mode: mode === 'full' ? 'full' : 'test',
    platform: 'win32',
    status: 'failed',
    projectRoot,
    startedAt: now(),
    finishedAt: now(),
    stages,
    failure: {
      stageId: 'lock-manifests', exitCode: 1, signal: null, timedOut: false,
      timeoutSource: null, stdout: '', stderr: errorText(error),
    },
  };
}

function looseCliPaths(argv, cwd) {
  let projectRoot = cwd;
  let reportDirectory = null;
  for (let index = 1; index < argv.length - 1; index += 1) {
    if (argv[index] === '--project-root') projectRoot = argv[index + 1];
    if (argv[index] === '--report-dir') reportDirectory = argv[index + 1];
  }
  return {projectRoot, reportDirectory: reportDirectory || path.win32.join(projectRoot, 'quality-reports')};
}

async function writePreflightFailure(argv, dependencies, error) {
  const loose = looseCliPaths(argv, dependencies.cwd);
  const mode = argv[0] === 'full' ? 'full' : 'test';
  const report = preflightFailureReport(mode, loose.projectRoot, dependencies.runId, dependencies.now, error);
  const writer = createAtomicQualityGateReportWriter({reportDirectory: loose.reportDirectory});
  await writer.write(report);
  dependencies.stderr.write(errorText(error));
  return 1;
}

async function runQualityGateCli(argv, dependencies) {
  const environment = detachedEnvironment(
    dependencies.environment,
    dependencies.platform,
  );
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
    dependencies.stdout.write('quality-gate-v2 <test|full|validate-locks> [options]\n');
    return 0;
  }
  let parsed;
  try {
    parsed = parseQualityGateCliArgs(argv, dependencies.cwd, environment);
    if (dependencies.platform !== 'win32') throw codedError('QUALITY_GATE_PLATFORM_UNSUPPORTED', dependencies.platform);
    await validateQualityGateV2Bootstrap({
      projectRoot: parsed.projectRoot,
      expectedSelfSha256: dependencies.bootstrapExpectedSelfSha256,
    });
    assertBootstrapRegistryBinding(parsed.registryPath, dependencies.bootstrapExpectedSelfSha256);
  } catch (error) {
    if (
      error &&
      error.code === 'QUALITY_GATE_CLI_USAGE' &&
      argv.some((value, index) => value === '--pnpm' && argv[index + 1] === '')
    ) {
      dependencies.stderr.write('QUALITY_GATE_CLI_USAGE');
      return 1;
    }
    return writePreflightFailure(argv, dependencies, error);
  }
  const pnpmPreflight = dependencies.processRunner && dependencies.processRunner[QUALITY_GATE_PNPM_PREFLIGHT];
  if ((parsed.mode === 'test' || parsed.mode === 'full') && typeof pnpmPreflight === 'function') {
    try {
      pnpmPreflight.call(
        dependencies.processRunner,
        parsed.pnpmExecutable,
        environment.PATH || '',
        parsed.nodeExecutable,
      );
    } catch (error) {
      if (
        error &&
        (error.code === QUALITY_GATE_PNPM_LAUNCH_UNSAFE ||
          error.code === QUALITY_GATE_PNPM_LAUNCH_AMBIGUOUS)
      ) {
        dependencies.stderr.write(errorText(error));
        return 1;
      }
      throw error;
    }
  }
  const acceptedTestRoots = await discoverAcceptedTestRoots({projectRoot: parsed.projectRoot, registryPath: parsed.registryPath});
  const atomicReportWriter = createAtomicQualityGateReportWriter({reportDirectory: parsed.reportDirectory});
  const reportWriter = {
    write(report) {
      const persistedReport =
        parsed.mode === 'full' &&
        report.status === 'failed' &&
        report.stages[0] &&
        report.stages[0].status === 'failed'
          ? {...report, stages: [report.stages[0]]}
          : report;
      return atomicReportWriter.write(persistedReport);
    },
  };
  if (parsed.mode === 'validate-locks') {
    try {
      const summary = await validateLockManifests({projectRoot: parsed.projectRoot, registryPath: parsed.registryPath});
      dependencies.stdout.write(JSON.stringify(summary) + '\n');
      return 0;
    } catch (error) {
      return writePreflightFailure(argv, dependencies, error);
    }
  }
  const runtime = {
    nodeExecutable: parsed.nodeExecutable,
    pnpmExecutable: parsed.pnpmExecutable,
    javaHome: parsed.javaHome,
    androidSdkRoot: parsed.androidSdkRoot,
    androidBuildToolsVersion: parsed.androidBuildToolsVersion,
    path: environment.PATH || '',
  };
  const orchestrator = createQualityGateOrchestrator({
    projectRoot: parsed.projectRoot,
    reportDirectory: parsed.reportDirectory,
    platform: 'win32',
    runtime,
    acceptedTestRoots,
    timeoutMs: parsed.timeoutMs,
    runId: dependencies.runId,
    now: dependencies.now,
    signal: dependencies.signal,
    processRunner: dependencies.processRunner,
    lockValidator: {validate: () => validateLockManifests({projectRoot: parsed.projectRoot, registryPath: parsed.registryPath})},
    iosAuditor: {audit: () => auditIosProjectStatic({projectRoot: parsed.projectRoot})},
    reportWriter,
  });
  const report = await orchestrator.run(parsed.mode);
  for (const stage of report.stages) {
    if (stage.result) {
      if (stage.result.stdout) dependencies.stdout.write(stage.result.stdout);
      if (stage.result.stderr) dependencies.stderr.write(stage.result.stderr);
    }
  }
  if (report.status === 'passed') return 0;
  if (report.failure.timedOut) return 124;
  if (typeof report.failure.exitCode === 'number') return report.failure.exitCode;
  if (report.failure.signal !== null) return 130;
  return 1;
}

module.exports = {
  QUALITY_GATE_ENV_ALLOWLIST,
  QUALITY_GATE_REPORT_SCHEMA,
  QUALITY_GATE_REPORT_VERSION,
  QUALITY_GATE_STAGE_ORDER,
  QUALITY_GATE_TEST_STAGE_ORDER,
  QUALITY_GATE_V2_BOOTSTRAP_MANIFEST,
  QUALITY_GATE_V2_BOOTSTRAP_SPEC,
  QUALITY_GATE_V2_BOOTSTRAP_TEST_ROOT,
  auditIosProjectStatic,
  createAtomicQualityGateReportWriter,
  createNodeProcessRunner,
  createQualityGateOrchestrator,
  discoverAcceptedTestRoots,
  parseQualityGateCliArgs,
  runQualityGateCli,
  validateLockManifests,
  validateQualityGateV2Bootstrap,
};
