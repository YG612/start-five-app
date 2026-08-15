declare const __dirname: string;

type DirectoryEntry = {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
};

type FileStats = {
  isDirectory(): boolean;
  isFile(): boolean;
  size: number;
};

type FileSystemApi = {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: 'utf8'): string;
  readFileSync(path: string): Uint8Array;
  readdirSync(
    path: string,
    options: {withFileTypes: true},
  ): DirectoryEntry[];
  statSync(path: string): FileStats;
};

type PathApi = {
  basename(path: string): string;
  dirname(path: string): string;
  extname(path: string): string;
  join(...paths: string[]): string;
  relative(from: string, to: string): string;
  resolve(...paths: string[]): string;
  sep: string;
};

type Hash = {
  update(data: string | Uint8Array): Hash;
  digest(encoding: 'hex'): string;
};

type CryptoApi = {
  createHash(algorithm: 'sha256'): Hash;
};

const fs = jest.requireActual<FileSystemApi>('fs');
const path = jest.requireActual<PathApi>('path');
const crypto = jest.requireActual<CryptoApi>('crypto');

export const projectRoot = path.resolve(__dirname, '..', '..', '..');

export function projectPath(relativePath: string): string {
  return path.resolve(projectRoot, relativePath);
}

export function toPosix(relativePath: string): string {
  return relativePath.replace(/\\/g, '/');
}

export function projectRelative(absolutePath: string): string {
  return toPosix(path.relative(projectRoot, absolutePath));
}

export function exists(relativePath: string): boolean {
  return fs.existsSync(projectPath(relativePath));
}

export function requireFile(relativePath: string): string {
  const absolutePath = projectPath(relativePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw new Error(`Required project file is missing: ${relativePath}`);
  }
  return absolutePath;
}

export function requireDirectory(relativePath: string): string {
  const absolutePath = projectPath(relativePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isDirectory()) {
    throw new Error(`Required project directory is missing: ${relativePath}`);
  }
  return absolutePath;
}

export function readText(relativePath: string): string {
  return fs.readFileSync(requireFile(relativePath), 'utf8');
}

export function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T;
}

export function firstExisting(relativePaths: readonly string[]): string {
  const found = relativePaths.find(candidate => exists(candidate));
  if (found === undefined) {
    throw new Error(
      `None of the required project files exists: ${relativePaths.join(', ')}`,
    );
  }
  requireFile(found);
  return found;
}

export function listRegularFiles(
  relativeDirectory: string,
  ignoredDirectoryNames: ReadonlySet<string> = new Set<string>(),
): string[] {
  const root = requireDirectory(relativeDirectory);
  const files: string[] = [];

  function visit(directory: string): void {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        if (!ignoredDirectoryNames.has(entry.name)) {
          visit(absolutePath);
        }
        continue;
      }
      if (entry.isFile()) {
        files.push(absolutePath);
      }
    }
  }

  visit(root);
  return files.sort((left, right) =>
    projectRelative(left).localeCompare(projectRelative(right)),
  );
}

export function fileSize(relativePath: string): number {
  return fs.statSync(requireFile(relativePath)).size;
}

export function readAbsoluteText(absolutePath: string): string {
  return fs.readFileSync(absolutePath, 'utf8');
}

export function baseName(absolutePath: string): string {
  return path.basename(absolutePath);
}

export function extension(absolutePath: string): string {
  return path.extname(absolutePath).toLowerCase();
}

export function sha256File(relativePath: string): string {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(requireFile(relativePath)))
    .digest('hex');
}

export type LockVerification = {
  entryCount: number;
  errors: string[];
};

export function verifyLockManifest(manifestPath: string): LockVerification {
  const errors: string[] = [];
  const lines = readText(manifestPath)
    .split(/\r?\n/)
    .filter(line => line.trim() !== '');
  const seenPaths = new Set<string>();

  for (const line of lines) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (match === null) {
      errors.push(`Malformed manifest line: ${line}`);
      continue;
    }

    const expectedHash = match[1];
    const relativePath = match[2];
    if (expectedHash === undefined || relativePath === undefined) {
      errors.push(`Incomplete manifest line: ${line}`);
      continue;
    }
    if (
      relativePath.includes('\\') ||
      relativePath.startsWith('/') ||
      relativePath.split('/').includes('..')
    ) {
      errors.push(`Unsafe or non-canonical path: ${relativePath}`);
      continue;
    }
    if (seenPaths.has(relativePath)) {
      errors.push(`Duplicate manifest path: ${relativePath}`);
      continue;
    }
    seenPaths.add(relativePath);

    if (!exists(relativePath)) {
      errors.push(`Locked file is missing: ${relativePath}`);
      continue;
    }
    const actualHash = sha256File(relativePath);
    if (actualHash !== expectedHash) {
      errors.push(
        `Hash mismatch for ${relativePath}: expected ${expectedHash}, received ${actualHash}`,
      );
    }
  }

  return {entryCount: lines.length, errors};
}

export function normalizeSource(source: string): string {
  return source.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
}

export function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function xmlStringValue(xml: string, key: string): string | null {
  const expression = new RegExp(
    `<key>\\s*${escapeRegularExpression(key)}\\s*</key>\\s*<string>([\\s\\S]*?)</string>`,
  );
  const match = expression.exec(xml);
  return match?.[1]?.trim() ?? null;
}

export function propertyValue(
  propertiesSource: string,
  key: string,
): string | null {
  for (const line of propertiesSource.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex < 0) {
      continue;
    }
    if (trimmed.slice(0, separatorIndex).trim() === key) {
      return trimmed.slice(separatorIndex + 1).trim();
    }
  }
  return null;
}

export function numericAssignment(
  source: string,
  names: readonly string[],
): number | null {
  for (const name of names) {
    const expression = new RegExp(
      `\\b${escapeRegularExpression(name)}\\b\\s*(?:=)?\\s*["']?(\\d+)["']?`,
    );
    const match = expression.exec(source);
    if (match?.[1] !== undefined) {
      return Number(match[1]);
    }
  }
  return null;
}

export function packageMajor(versionRange: string): number | null {
  const match = /(\d+)/.exec(versionRange);
  return match?.[1] === undefined ? null : Number(match[1]);
}

export type PnpmImporterEntry = {
  specifier: string;
  version: string;
};

function yamlScalar(source: string): string {
  const trimmed = source.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"')))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function yamlKey(source: string): string | null {
  const match = /^(.*?)\s*:\s*$/.exec(source.trim());
  return match?.[1] === undefined ? null : yamlScalar(match[1]);
}

function indentation(line: string): number {
  return /^ */.exec(line)?.[0].length ?? 0;
}

export function readPnpmImporterEntry(
  lockSource: string,
  group: 'dependencies' | 'devDependencies',
  packageName: string,
): PnpmImporterEntry | null {
  const lines = lockSource.replace(/\r\n/g, '\n').split('\n');
  let inImporters = false;
  let inRootImporter = false;
  let inGroup = false;
  let inPackage = false;
  let specifier: string | null = null;
  let version: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const depth = indentation(line);

    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    if (depth === 0) {
      inImporters = trimmed === 'importers:';
      inRootImporter = false;
      inGroup = false;
      inPackage = false;
      continue;
    }
    if (!inImporters) {
      continue;
    }
    if (depth === 2) {
      inRootImporter = yamlKey(trimmed) === '.';
      inGroup = false;
      inPackage = false;
      continue;
    }
    if (!inRootImporter) {
      continue;
    }
    if (depth === 4) {
      inGroup = yamlKey(trimmed) === group;
      inPackage = false;
      continue;
    }
    if (!inGroup) {
      continue;
    }
    if (depth === 6) {
      if (inPackage && specifier !== null && version !== null) {
        return {specifier, version};
      }
      inPackage = yamlKey(trimmed) === packageName;
      specifier = null;
      version = null;
      continue;
    }
    if (!inPackage || depth !== 8) {
      continue;
    }
    const assignment = /^([^:]+):\s*(.+)$/.exec(trimmed);
    if (assignment?.[1] === 'specifier' && assignment[2] !== undefined) {
      specifier = yamlScalar(assignment[2]);
    }
    if (assignment?.[1] === 'version' && assignment[2] !== undefined) {
      version = yamlScalar(assignment[2]);
    }
  }

  return inPackage && specifier !== null && version !== null
    ? {specifier, version}
    : null;
}

export function pnpmPackageHasIntegrity(
  lockSource: string,
  packageName: string,
  resolvedVersion: string,
): boolean {
  const peerSuffix = resolvedVersion.indexOf('(');
  const bareVersion =
    peerSuffix < 0 ? resolvedVersion : resolvedVersion.slice(0, peerSuffix);
  const expectedKey = `${packageName}@${bareVersion}`;
  const lines = lockSource.replace(/\r\n/g, '\n').split('\n');
  let inPackages = false;
  let inExpectedPackage = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const depth = indentation(line);
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    if (depth === 0) {
      inPackages = trimmed === 'packages:';
      inExpectedPackage = false;
      continue;
    }
    if (!inPackages) {
      continue;
    }
    if (depth === 2) {
      inExpectedPackage = yamlKey(trimmed) === expectedKey;
      continue;
    }
    if (
      inExpectedPackage &&
      depth === 4 &&
      /^resolution:\s*\{[\s\S]*\bintegrity:\s*sha512-[A-Za-z0-9+/=]+[\s\S]*\}$/.test(
        trimmed,
      )
    ) {
      return true;
    }
  }
  return false;
}

function matchingBrace(source: string, openingIndex: number): number | null {
  let depth = 0;
  let quote: "'" | '"' | '`' | null = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = openingIndex; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (character === '\n') {
        lineComment = false;
      }
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote !== null) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return null;
}

function isCodePosition(source: string, targetIndex: number): boolean {
  let quote: "'" | '"' | '`' | null = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < targetIndex; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === '\n') {
        lineComment = false;
      }
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote !== null) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '/' && next === '/') {
      lineComment = true;
      index += 1;
    } else if (character === '/' && next === '*') {
      blockComment = true;
      index += 1;
    } else if (
      character === "'" ||
      character === '"' ||
      character === '`'
    ) {
      quote = character;
    }
  }
  return !lineComment && !blockComment && quote === null;
}

export function extractBlocks(source: string, header: RegExp): string[] {
  const flags = header.flags.includes('g') ? header.flags : `${header.flags}g`;
  const expression = new RegExp(header.source, flags);
  const blocks: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = expression.exec(source)) !== null) {
    const openingOffset = match[0].lastIndexOf('{');
    if (openingOffset < 0) {
      throw new Error('Block header must include its opening brace.');
    }
    const openingIndex = match.index + openingOffset;
    if (!isCodePosition(source, openingIndex)) {
      expression.lastIndex = openingIndex + 1;
      continue;
    }
    const closingIndex = matchingBrace(source, openingIndex);
    if (closingIndex === null) {
      throw new Error(`Unterminated block at source offset ${openingIndex}.`);
    }
    blocks.push(source.slice(openingIndex + 1, closingIndex));
    expression.lastIndex = closingIndex + 1;
  }
  return blocks;
}

export type PbxObject = {
  id: string;
  comment: string | null;
  body: string;
};

export function parsePbxObjects(source: string): PbxObject[] {
  const expression =
    /(?:^|\n)\s*([A-Fa-f0-9]{8,})\s*(?:\/\*([^\n]*?)\*\/\s*)?=\s*\{/g;
  const objects: PbxObject[] = [];
  let match: RegExpExecArray | null;

  while ((match = expression.exec(source)) !== null) {
    const id = match[1];
    if (id === undefined) {
      continue;
    }
    const openingOffset = match[0].lastIndexOf('{');
    const openingIndex = match.index + openingOffset;
    if (openingOffset < 0 || !isCodePosition(source, openingIndex)) {
      expression.lastIndex = openingIndex + 1;
      continue;
    }
    const closingIndex = matchingBrace(source, openingIndex);
    if (closingIndex === null) {
      throw new Error(`Unterminated PBX object ${id}.`);
    }
    objects.push({
      id,
      comment: match[2]?.trim() ?? null,
      body: source.slice(openingIndex + 1, closingIndex),
    });
    expression.lastIndex = closingIndex + 1;
  }
  return objects;
}

function pbxIsa(object: PbxObject): string | null {
  return assignmentValue(object.body, 'isa');
}

export function extractPbxObjects(source: string, isa: string): string[] {
  return parsePbxObjects(source)
    .filter(object => pbxIsa(object) === isa)
    .map(object => object.body);
}

export function assignmentValue(source: string, key: string): string | null {
  const expression = new RegExp(
    `(?:^|\\n)\\s*${escapeRegularExpression(key)}\\s*=\\s*([^;]+);`,
  );
  const match = expression.exec(source);
  if (match?.[1] === undefined) {
    return null;
  }
  return yamlScalar(match[1]);
}

export function pbxReferenceValue(source: string, key: string): string | null {
  const value = assignmentValue(source, key);
  const match = value === null ? null : /^([A-Fa-f0-9]{8,})\b/.exec(value);
  return match?.[1] ?? null;
}

export function pbxReferenceList(
  source: string,
  key: string,
): string[] | null {
  const expression = new RegExp(
    `(?:^|\\n)\\s*${escapeRegularExpression(key)}\\s*=\\s*\\(([\\s\\S]*?)\\)\\s*;`,
  );
  const body = expression.exec(source)?.[1];
  if (body === undefined) {
    return null;
  }
  return Array.from(
    body.matchAll(/(?:^|\n)\s*([A-Fa-f0-9]{8,})\b/g),
    match => match[1] ?? '',
  );
}

export type PbxTargetConfigurationChain = {
  project: PbxObject;
  target: PbxObject;
  configurationList: PbxObject;
  configurations: PbxObject[];
};

export function resolvePbxTargetConfigurationChain(
  source: string,
  targetName: string,
): PbxTargetConfigurationChain {
  const objects = parsePbxObjects(source);
  const projects = objects.filter(object => pbxIsa(object) === 'PBXProject');
  if (projects.length !== 1 || projects[0] === undefined) {
    throw new Error('Expected exactly one PBXProject object.');
  }
  const matchingTargets = objects.filter(
    object =>
      pbxIsa(object) === 'PBXNativeTarget' &&
      assignmentValue(object.body, 'name') === targetName &&
      assignmentValue(object.body, 'productType') ===
        'com.apple.product-type.application',
  );
  if (matchingTargets.length !== 1 || matchingTargets[0] === undefined) {
    throw new Error(`Expected exactly one ${targetName} application target.`);
  }
  const project = projects[0];
  const target = matchingTargets[0];
  const projectTargetIds = pbxReferenceList(project.body, 'targets');
  if (projectTargetIds === null || !projectTargetIds.includes(target.id)) {
    throw new Error(`${targetName} target is not referenced by PBXProject.targets.`);
  }
  const configurationListId = pbxReferenceValue(
    target.body,
    'buildConfigurationList',
  );
  const configurationList = objects.find(
    object =>
      object.id === configurationListId &&
      pbxIsa(object) === 'XCConfigurationList',
  );
  if (configurationList === undefined) {
    throw new Error(`${targetName} target configuration list is missing.`);
  }
  const configurationIds = pbxReferenceList(
    configurationList.body,
    'buildConfigurations',
  );
  if (
    configurationIds === null ||
    configurationIds.length !== 2 ||
    new Set(configurationIds).size !== 2
  ) {
    throw new Error(`${targetName} must reference exactly two build configurations.`);
  }
  const configurations = configurationIds.map(id => {
    const configuration = objects.find(
      object => object.id === id && pbxIsa(object) === 'XCBuildConfiguration',
    );
    if (configuration === undefined) {
      throw new Error(`Referenced XCBuildConfiguration ${id} is missing.`);
    }
    return configuration;
  });
  const referencedConfigurationIds = new Set(configurationIds);
  const orphanBundleConfigurations = objects.filter(
    object =>
      pbxIsa(object) === 'XCBuildConfiguration' &&
      assignmentValue(object.body, 'PRODUCT_BUNDLE_IDENTIFIER') !== null &&
      !referencedConfigurationIds.has(object.id),
  );
  if (orphanBundleConfigurations.length > 0) {
    throw new Error('Found an orphan bundle-bearing XCBuildConfiguration.');
  }
  return {project, target, configurationList, configurations};
}

export function containsDebugSigningReference(source: string): boolean {
  const expression =
    /signingConfig\s*(?:=)?\s*signingConfigs\s*(?:\.\s*debug\b|\[\s*["']debug["']\s*\]|\.\s*(?:getByName|findByName|named|getAt|maybeCreate|create)\s*\(\s*["']debug["']\s*\))/gi;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(source)) !== null) {
    if (isCodePosition(source, match.index)) {
      return true;
    }
  }
  return false;
}

export function xmlArrayStringValues(xml: string, key: string): string[] | null {
  const expression = new RegExp(
    `<key>\\s*${escapeRegularExpression(key)}\\s*</key>\\s*<array>([\\s\\S]*?)</array>`,
  );
  const body = expression.exec(xml)?.[1];
  if (body === undefined) {
    return null;
  }
  const stringElement = /<string>\s*([\s\S]*?)\s*<\/string>/g;
  const values = Array.from(
    body.matchAll(stringElement),
    match => match[1]?.trim() ?? '',
  );
  const nonStringChildren = body
    .replace(stringElement, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
  if (nonStringChildren !== '') {
    throw new Error(`Plist array ${key} contains a non-string child.`);
  }
  return values;
}
