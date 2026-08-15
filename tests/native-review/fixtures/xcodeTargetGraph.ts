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
};

type FileSystemApi = {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: 'utf8'): string;
  readdirSync(
    path: string,
    options: {withFileTypes: true},
  ): DirectoryEntry[];
  statSync(path: string): FileStats;
};

type PathApi = {
  join(...paths: string[]): string;
  relative(from: string, to: string): string;
  resolve(...paths: string[]): string;
};

const fs = jest.requireActual<FileSystemApi>('fs');
const path = jest.requireActual<PathApi>('path');

export const projectRoot = path.resolve(__dirname, '..', '..', '..');

export function projectPath(relativePath: string): string {
  return path.resolve(projectRoot, relativePath);
}

export function readProjectText(relativePath: string): string {
  const absolutePath = projectPath(relativePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw new Error(`Required project file is missing: ${relativePath}`);
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

export function listSharedSchemeFiles(relativeDirectory: string): string[] {
  const root = projectPath(relativeDirectory);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`Required shared-scheme directory is missing: ${relativeDirectory}`);
  }
  const results: string[] = [];

  function visit(directory: string): void {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      if (entry.isSymbolicLink()) {
        continue;
      }
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile() && entry.name.endsWith('.xcscheme')) {
        results.push(path.relative(projectRoot, absolutePath).replace(/\\/g, '/'));
      }
    }
  }

  visit(root);
  return results.sort((left, right) => left.localeCompare(right));
}

export interface OpenStepDictionary {
  [key: string]: OpenStepValue;
}

export interface OpenStepArray extends Array<OpenStepValue> {}

export type OpenStepValue = string | OpenStepArray | OpenStepDictionary;

function isDictionary(value: OpenStepValue | undefined): value is OpenStepDictionary {
  return value !== undefined && typeof value === 'object' && !Array.isArray(value);
}

function isArray(value: OpenStepValue | undefined): value is OpenStepArray {
  return Array.isArray(value);
}

class OpenStepParser {
  private index = 0;

  constructor(private readonly source: string) {}

  parseDocument(): OpenStepDictionary {
    this.skipIgnored();
    const value = this.parseValue();
    this.skipIgnored();
    if (this.index !== this.source.length) {
      this.fail('Unexpected trailing input');
    }
    if (!isDictionary(value)) {
      this.fail('The PBX document root must be a dictionary');
    }
    return value;
  }

  private fail(message: string): never {
    throw new Error(`${message} at PBX source offset ${this.index}.`);
  }

  private skipIgnored(): void {
    while (this.index < this.source.length) {
      const character = this.source[this.index];
      const next = this.source[this.index + 1];
      if (character !== undefined && /\s/.test(character)) {
        this.index += 1;
        continue;
      }
      if (character === '/' && next === '*') {
        const end = this.source.indexOf('*/', this.index + 2);
        if (end < 0) {
          this.fail('Unterminated block comment');
        }
        this.index = end + 2;
        continue;
      }
      if (character === '/' && next === '/') {
        const end = this.source.indexOf('\n', this.index + 2);
        this.index = end < 0 ? this.source.length : end + 1;
        continue;
      }
      break;
    }
  }

  private parseValue(): OpenStepValue {
    this.skipIgnored();
    const character = this.source[this.index];
    if (character === '{') {
      return this.parseDictionary();
    }
    if (character === '(') {
      return this.parseArray();
    }
    if (character === '"') {
      return this.parseQuotedString();
    }
    return this.parseBareString();
  }

  private parseDictionary(): OpenStepDictionary {
    this.index += 1;
    const dictionary: OpenStepDictionary = {};
    while (true) {
      this.skipIgnored();
      if (this.source[this.index] === '}') {
        this.index += 1;
        return dictionary;
      }
      const key = this.parseScalar();
      this.skipIgnored();
      if (this.source[this.index] !== '=') {
        this.fail(`Expected '=' after dictionary key ${key}`);
      }
      this.index += 1;
      const value = this.parseValue();
      this.skipIgnored();
      if (this.source[this.index] !== ';') {
        this.fail(`Expected ';' after dictionary key ${key}`);
      }
      this.index += 1;
      if (Object.prototype.hasOwnProperty.call(dictionary, key)) {
        this.fail(`Duplicate dictionary key ${key}`);
      }
      dictionary[key] = value;
    }
  }

  private parseArray(): OpenStepArray {
    this.index += 1;
    const values: OpenStepValue[] = [];
    while (true) {
      this.skipIgnored();
      if (this.source[this.index] === ')') {
        this.index += 1;
        return values;
      }
      values.push(this.parseValue());
      this.skipIgnored();
      if (this.source[this.index] === ',') {
        this.index += 1;
        continue;
      }
      if (this.source[this.index] !== ')') {
        this.fail("Expected ',' or ')' in array");
      }
    }
  }

  private parseScalar(): string {
    this.skipIgnored();
    return this.source[this.index] === '"'
      ? this.parseQuotedString()
      : this.parseBareString();
  }

  private parseQuotedString(): string {
    this.index += 1;
    let result = '';
    while (this.index < this.source.length) {
      const character = this.source[this.index];
      this.index += 1;
      if (character === '"') {
        return result;
      }
      if (character !== '\\') {
        result += character;
        continue;
      }
      const escaped = this.source[this.index];
      if (escaped === undefined) {
        this.fail('Unterminated quoted escape');
      }
      this.index += 1;
      if (escaped === 'n') {
        result += '\n';
      } else if (escaped === 'r') {
        result += '\r';
      } else if (escaped === 't') {
        result += '\t';
      } else {
        result += escaped;
      }
    }
    this.fail('Unterminated quoted string');
  }

  private parseBareString(): string {
    const start = this.index;
    while (this.index < this.source.length) {
      const character = this.source[this.index];
      if (
        character === undefined ||
        /\s/.test(character) ||
        '{}()=;,'.includes(character)
      ) {
        break;
      }
      if (
        character === '/' &&
        (this.source[this.index + 1] === '/' ||
          this.source[this.index + 1] === '*')
      ) {
        break;
      }
      this.index += 1;
    }
    if (this.index === start) {
      this.fail('Expected a scalar value');
    }
    return this.source.slice(start, this.index);
  }
}

function requireDictionary(
  value: OpenStepValue | undefined,
  label: string,
): OpenStepDictionary {
  if (!isDictionary(value)) {
    throw new Error(`${label} must be an OpenStep dictionary.`);
  }
  return value;
}

function optionalString(value: OpenStepValue | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

function stringArray(value: OpenStepValue | undefined, label: string): string[] {
  if (!isArray(value) || !value.every(item => typeof item === 'string')) {
    throw new Error(`${label} must be an array of object identifiers.`);
  }
  return value;
}

export type PbxNativeTarget = {
  id: string;
  name: string;
  productName: string | null;
  productType: string;
  productReference: string | null;
  productReferenceIsa: string | null;
  productReferenceStatus:
    | 'valid'
    | 'missing-reference'
    | 'missing-object'
    | 'missing-object-type'
    | 'wrong-object-type'
    | 'missing-file-name';
  buildableName: string | null;
};

export type PbxProjectGraph = {
  objects: ReadonlyMap<string, OpenStepDictionary>;
  nativeTargets: ReadonlyMap<string, PbxNativeTarget>;
  projectTargetIds: ReadonlySet<string>;
  projectObjectIds: readonly string[];
};

export function parsePbxProject(source: string): PbxProjectGraph {
  const root = new OpenStepParser(source.replace(/^\uFEFF/, '')).parseDocument();
  const objectsDictionary = requireDictionary(root.objects, 'PBX objects');
  const objects = new Map<string, OpenStepDictionary>();
  for (const [id, value] of Object.entries(objectsDictionary)) {
    objects.set(id, requireDictionary(value, `PBX object ${id}`));
  }

  const projectObjects = Array.from(objects.entries()).filter(
    ([, object]) => optionalString(object.isa) === 'PBXProject',
  );
  if (projectObjects.length !== 1 || projectObjects[0] === undefined) {
    throw new Error('Expected exactly one PBXProject object.');
  }
  const projectTargetIds = new Set(
    stringArray(projectObjects[0][1].targets, 'PBXProject.targets'),
  );
  const nativeTargets = new Map<string, PbxNativeTarget>();

  for (const [id, object] of objects) {
    if (optionalString(object.isa) !== 'PBXNativeTarget') {
      continue;
    }
    const name = optionalString(object.name);
    const productType = optionalString(object.productType);
    if (name === null || productType === null) {
      throw new Error(`PBXNativeTarget ${id} lacks name or productType.`);
    }
    const productReference = optionalString(object.productReference);
    const productObject =
      productReference === null ? undefined : objects.get(productReference);
    const productReferenceIsa =
      productObject === undefined ? null : optionalString(productObject.isa);
    let productReferenceStatus: PbxNativeTarget['productReferenceStatus'];
    let buildableName: string | null = null;
    if (productReference === null) {
      productReferenceStatus = 'missing-reference';
    } else if (productObject === undefined) {
      productReferenceStatus = 'missing-object';
    } else if (productReferenceIsa === null) {
      productReferenceStatus = 'missing-object-type';
    } else if (productReferenceIsa !== 'PBXFileReference') {
      productReferenceStatus = 'wrong-object-type';
    } else {
      buildableName =
        optionalString(productObject.path) ?? optionalString(productObject.name);
      productReferenceStatus =
        buildableName === null ? 'missing-file-name' : 'valid';
    }
    nativeTargets.set(id, {
      id,
      name,
      productName: optionalString(object.productName),
      productType,
      productReference,
      productReferenceIsa,
      productReferenceStatus,
      buildableName,
    });
  }

  return {
    objects,
    nativeTargets,
    projectTargetIds,
    projectObjectIds: [projectObjects[0][0]],
  };
}

export type XmlNode = {
  name: string;
  attributes: Readonly<Record<string, string>>;
  children: readonly XmlNode[];
};

class XmlParser {
  private index = 0;

  constructor(private readonly source: string) {}

  parseDocument(): XmlNode {
    this.skipMisc();
    const root = this.parseElement();
    this.skipMisc();
    if (this.index !== this.source.length) {
      this.fail('Unexpected trailing XML input');
    }
    return root;
  }

  private fail(message: string): never {
    throw new Error(`${message} at XML source offset ${this.index}.`);
  }

  private skipWhitespace(): void {
    while (this.index < this.source.length) {
      const character = this.source[this.index];
      if (character === undefined || !/\s/.test(character)) {
        break;
      }
      this.index += 1;
    }
  }

  private skipMisc(): void {
    while (true) {
      this.skipWhitespace();
      if (this.source.startsWith('<?', this.index)) {
        const end = this.source.indexOf('?>', this.index + 2);
        if (end < 0) {
          this.fail('Unterminated XML processing instruction');
        }
        this.index = end + 2;
        continue;
      }
      if (this.source.startsWith('<!--', this.index)) {
        const end = this.source.indexOf('-->', this.index + 4);
        if (end < 0) {
          this.fail('Unterminated XML comment');
        }
        this.index = end + 3;
        continue;
      }
      break;
    }
  }

  private parseName(): string {
    const start = this.index;
    while (this.index < this.source.length) {
      const character = this.source[this.index];
      if (
        character === undefined ||
        /\s/.test(character) ||
        '<>/='.includes(character)
      ) {
        break;
      }
      this.index += 1;
    }
    if (this.index === start) {
      this.fail('Expected an XML name');
    }
    return this.source.slice(start, this.index);
  }

  private decodeEntities(value: string): string {
    return value.replace(
      /&(?:quot|apos|lt|gt|amp|#\d+|#x[0-9a-fA-F]+);/g,
      entity => {
        if (entity === '&quot;') return '"';
        if (entity === '&apos;') return "'";
        if (entity === '&lt;') return '<';
        if (entity === '&gt;') return '>';
        if (entity === '&amp;') return '&';
        const radix = entity.startsWith('&#x') ? 16 : 10;
        const digits = entity.slice(radix === 16 ? 3 : 2, -1);
        return String.fromCodePoint(Number.parseInt(digits, radix));
      },
    );
  }

  private parseAttributeValue(): string {
    const quote = this.source[this.index];
    if (quote !== '"' && quote !== "'") {
      this.fail('Expected a quoted XML attribute value');
    }
    this.index += 1;
    const start = this.index;
    const end = this.source.indexOf(quote, start);
    if (end < 0) {
      this.fail('Unterminated XML attribute value');
    }
    this.index = end + 1;
    return this.decodeEntities(this.source.slice(start, end));
  }

  private parseElement(): XmlNode {
    if (this.source[this.index] !== '<') {
      this.fail("Expected '<'");
    }
    this.index += 1;
    const name = this.parseName();
    const attributes: Record<string, string> = {};

    while (true) {
      this.skipWhitespace();
      if (this.source.startsWith('/>', this.index)) {
        this.index += 2;
        return {name, attributes, children: []};
      }
      if (this.source[this.index] === '>') {
        this.index += 1;
        break;
      }
      const attributeName = this.parseName();
      this.skipWhitespace();
      if (this.source[this.index] !== '=') {
        this.fail(`Expected '=' after XML attribute ${attributeName}`);
      }
      this.index += 1;
      this.skipWhitespace();
      if (Object.prototype.hasOwnProperty.call(attributes, attributeName)) {
        this.fail(`Duplicate XML attribute ${attributeName}`);
      }
      attributes[attributeName] = this.parseAttributeValue();
    }

    const children: XmlNode[] = [];
    while (true) {
      if (this.source.startsWith(`</${name}`, this.index)) {
        this.index += name.length + 2;
        this.skipWhitespace();
        if (this.source[this.index] !== '>') {
          this.fail(`Malformed closing tag for ${name}`);
        }
        this.index += 1;
        return {name, attributes, children};
      }
      if (this.source.startsWith('<!--', this.index)) {
        const end = this.source.indexOf('-->', this.index + 4);
        if (end < 0) {
          this.fail('Unterminated XML comment');
        }
        this.index = end + 3;
        continue;
      }
      if (this.source.startsWith('<?', this.index)) {
        const end = this.source.indexOf('?>', this.index + 2);
        if (end < 0) {
          this.fail('Unterminated XML processing instruction');
        }
        this.index = end + 2;
        continue;
      }
      if (this.source.startsWith('<![CDATA[', this.index)) {
        const end = this.source.indexOf(']]>', this.index + 9);
        if (end < 0) {
          this.fail('Unterminated XML CDATA section');
        }
        this.index = end + 3;
        continue;
      }
      if (this.source[this.index] === '<') {
        if (this.source[this.index + 1] === '/') {
          this.fail(`Mismatched closing tag inside ${name}`);
        }
        children.push(this.parseElement());
        continue;
      }
      if (this.index >= this.source.length) {
        this.fail(`Unterminated XML element ${name}`);
      }
      this.index += 1;
    }
  }
}

export function parseSchemeXml(source: string): XmlNode {
  const root = new XmlParser(source.replace(/^\uFEFF/, '')).parseDocument();
  if (root.name !== 'Scheme') {
    throw new Error(`Expected Scheme XML root, received ${root.name}.`);
  }
  return root;
}

export function descendantNodes(node: XmlNode, name: string): XmlNode[] {
  const results: XmlNode[] = [];
  function visit(current: XmlNode): void {
    if (current.name === name) {
      results.push(current);
    }
    current.children.forEach(visit);
  }
  visit(node);
  return results;
}

export type SchemeBuildableReference = {
  action: string | null;
  insideTestable: boolean;
  attributes: Readonly<Record<string, string>>;
};

function collectBuildableReferences(root: XmlNode): SchemeBuildableReference[] {
  const references: SchemeBuildableReference[] = [];
  function visit(node: XmlNode, ancestors: readonly string[]): void {
    if (node.name === 'BuildableReference') {
      const action = [...ancestors]
        .reverse()
        .find(name => name.endsWith('Action')) ?? null;
      references.push({
        action,
        insideTestable: ancestors.includes('TestableReference'),
        attributes: node.attributes,
      });
    }
    const nextAncestors = [...ancestors, node.name];
    node.children.forEach(child => visit(child, nextAncestors));
  }
  visit(root, []);
  return references;
}

export type SchemeGraphIssueCode =
  | 'MISSING_REFERENCE_ATTRIBUTE'
  | 'WRONG_REFERENCED_CONTAINER'
  | 'UNKNOWN_BLUEPRINT_IDENTIFIER'
  | 'BLUEPRINT_NOT_NATIVE_TARGET'
  | 'NATIVE_TARGET_NOT_IN_PROJECT'
  | 'BLUEPRINT_NAME_MISMATCH'
  | 'TARGET_PRODUCT_REFERENCE_MISSING'
  | 'TARGET_PRODUCT_OBJECT_MISSING'
  | 'TARGET_PRODUCT_REFERENCE_TYPE_MISSING'
  | 'TARGET_PRODUCT_NOT_FILE_REFERENCE'
  | 'TARGET_PRODUCT_FILE_NAME_MISSING'
  | 'BUILDABLE_NAME_MISMATCH'
  | 'TESTABLE_NOT_TEST_TARGET'
  | 'TESTABLE_WITHOUT_BUILDABLE_REFERENCE'
  | 'TESTABLE_WITH_MULTIPLE_BUILDABLE_REFERENCES';

export type SchemeGraphIssue = {
  code: SchemeGraphIssueCode;
  message: string;
};

export type SchemeGraphReport = {
  issues: readonly SchemeGraphIssue[];
  buildableReferenceCount: number;
  testableReferenceCount: number;
};

export function validateSchemeTargetGraph(
  project: PbxProjectGraph,
  scheme: XmlNode,
  expectedContainer: string,
): SchemeGraphReport {
  const issues: SchemeGraphIssue[] = [];
  const references = collectBuildableReferences(scheme);
  const testableNodes = descendantNodes(scheme, 'TestableReference');

  for (const testable of testableNodes) {
    const nested = descendantNodes(testable, 'BuildableReference');
    if (nested.length === 0) {
      issues.push({
        code: 'TESTABLE_WITHOUT_BUILDABLE_REFERENCE',
        message: 'A TestableReference has no BuildableReference.',
      });
    } else if (nested.length > 1) {
      issues.push({
        code: 'TESTABLE_WITH_MULTIPLE_BUILDABLE_REFERENCES',
        message: 'A TestableReference has multiple BuildableReference children.',
      });
    }
  }

  for (const reference of references) {
    const blueprintIdentifier = reference.attributes.BlueprintIdentifier;
    const blueprintName = reference.attributes.BlueprintName;
    const buildableName = reference.attributes.BuildableName;
    const referencedContainer = reference.attributes.ReferencedContainer;
    const context = `${reference.action ?? 'UnknownAction'}${
      reference.insideTestable ? '/TestableReference' : ''
    }`;
    if (
      blueprintIdentifier === undefined ||
      blueprintName === undefined ||
      buildableName === undefined ||
      referencedContainer === undefined
    ) {
      issues.push({
        code: 'MISSING_REFERENCE_ATTRIBUTE',
        message: `${context} lacks a required BuildableReference attribute.`,
      });
      continue;
    }
    if (referencedContainer !== expectedContainer) {
      issues.push({
        code: 'WRONG_REFERENCED_CONTAINER',
        message: `${context} references ${referencedContainer}, expected ${expectedContainer}.`,
      });
    }
    const target = project.nativeTargets.get(blueprintIdentifier);
    if (target === undefined) {
      issues.push({
        code: project.objects.has(blueprintIdentifier)
          ? 'BLUEPRINT_NOT_NATIVE_TARGET'
          : 'UNKNOWN_BLUEPRINT_IDENTIFIER',
        message: `${context} BlueprintIdentifier ${blueprintIdentifier} does not resolve to a PBXNativeTarget.`,
      });
      continue;
    }
    if (!project.projectTargetIds.has(target.id)) {
      issues.push({
        code: 'NATIVE_TARGET_NOT_IN_PROJECT',
        message: `${context} resolves to PBXNativeTarget ${target.id}, but PBXProject.targets does not contain it.`,
      });
    }
    if (blueprintName !== target.name) {
      issues.push({
        code: 'BLUEPRINT_NAME_MISMATCH',
        message: `${context} BlueprintName ${blueprintName} does not match target ${target.name}.`,
      });
    }
    if (target.productReferenceStatus === 'missing-reference') {
      issues.push({
        code: 'TARGET_PRODUCT_REFERENCE_MISSING',
        message: `${context} target ${target.name} has no productReference.`,
      });
    } else if (target.productReferenceStatus === 'missing-object') {
      issues.push({
        code: 'TARGET_PRODUCT_OBJECT_MISSING',
        message: `${context} target ${target.name} productReference ${
          target.productReference ?? '<missing>'
        } does not resolve to a PBX object.`,
      });
    } else if (target.productReferenceStatus === 'missing-object-type') {
      issues.push({
        code: 'TARGET_PRODUCT_REFERENCE_TYPE_MISSING',
        message: `${context} target ${target.name} productReference ${
          target.productReference ?? '<missing>'
        } resolves to an object without isa.`,
      });
    } else if (target.productReferenceStatus === 'wrong-object-type') {
      issues.push({
        code: 'TARGET_PRODUCT_NOT_FILE_REFERENCE',
        message: `${context} target ${target.name} productReference ${
          target.productReference ?? '<missing>'
        } resolves to ${target.productReferenceIsa ?? '<missing>'}, not PBXFileReference.`,
      });
    } else if (target.productReferenceStatus === 'missing-file-name') {
      issues.push({
        code: 'TARGET_PRODUCT_FILE_NAME_MISSING',
        message: `${context} target ${target.name} product PBXFileReference has neither path nor name.`,
      });
    } else if (buildableName !== target.buildableName) {
      issues.push({
        code: 'BUILDABLE_NAME_MISMATCH',
        message: `${context} BuildableName ${buildableName} does not match target product ${
          target.buildableName ?? '<missing>'
        }.`,
      });
    }
    if (
      reference.insideTestable &&
      target.productType !== 'com.apple.product-type.bundle.unit-test' &&
      target.productType !== 'com.apple.product-type.bundle.ui-testing'
    ) {
      issues.push({
        code: 'TESTABLE_NOT_TEST_TARGET',
        message: `${context} resolves to non-test target ${target.name}.`,
      });
    }
  }

  return {
    issues,
    buildableReferenceCount: references.length,
    testableReferenceCount: testableNodes.length,
  };
}

export function buildableReferencesByAction(
  scheme: XmlNode,
  action: string,
): SchemeBuildableReference[] {
  return collectBuildableReferences(scheme).filter(
    reference => reference.action === action,
  );
}
