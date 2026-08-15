import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  cleanupTempDirectories,
  createTempDirectory,
  EXPECTED_BOOTSTRAP_MANIFEST_PATH,
  EXPECTED_BOOTSTRAP_SPEC_PATH,
  EXPECTED_BOOTSTRAP_TEST_ROOT,
  fixturePath,
  installSyntheticBootstrap,
  projectRoot,
  readJsonRecord,
  runRealChild,
  sha256,
  SYNTHETIC_BOOTSTRAP_EXPECTED_SELF_SHA256,
  writeText,
  type RealChildResult,
} from './qualityGateV2TestKit';

type CliFixture = Readonly<{
  root: string;
  authoritativeRegistryPath: string;
  registryPath: string;
  reportPath: string;
  summaryPath: string;
  stagePidPath: string;
  bootstrapExpectedSelfSha256: string;
  timeoutMs: number;
}>;

type RegistryEntry = Readonly<{
  manifest: string;
  status: 'accepted' | 'candidate' | 'rejected';
  ordering: 'spec-first-posix';
  specPath: string;
  inventoryRoots: readonly string[];
  testRoots: readonly string[];
  expectedSelfSha256: string | null;
}>;

type BootstrapRegistryMutation =
  | 'delete-v2-entry'
  | 'status-candidate'
  | 'status-rejected'
  | 'replace-manifest-path'
  | 'replace-registry-self'
  | 'coordinated-registry-identity';

type RegistryDocumentMutation =
  | 'wrong-schema'
  | 'missing-schema'
  | 'null-schema'
  | 'numeric-schema'
  | 'wrong-version'
  | 'missing-version'
  | 'string-version'
  | 'null-version'
  | 'missing-locks'
  | 'null-locks'
  | 'object-locks'
  | 'string-locks'
  | 'null-top-level'
  | 'array-top-level'
  | 'string-top-level';

type CreateCliFixtureOptions = Readonly<{
  bootstrapRegistryMutation?: BootstrapRegistryMutation;
  registryDocumentMutation?: RegistryDocumentMutation;
  registrySelection?: 'authoritative' | 'alternate-v2-only';
  timeoutMs?: number;
}>;

const BOOTSTRAP_REGISTRY_COUNTEREXAMPLES: readonly Readonly<{
  mutation: BootstrapRegistryMutation;
  expectedErrorCode:
    | 'QUALITY_GATE_V2_BOOTSTRAP_REGISTRY_MISMATCH'
    | 'QUALITY_GATE_V2_BOOTSTRAP_SELF_MISMATCH';
}>[] = [
  {
    mutation: 'delete-v2-entry',
    expectedErrorCode: 'QUALITY_GATE_V2_BOOTSTRAP_REGISTRY_MISMATCH',
  },
  {
    mutation: 'status-candidate',
    expectedErrorCode: 'QUALITY_GATE_V2_BOOTSTRAP_REGISTRY_MISMATCH',
  },
  {
    mutation: 'status-rejected',
    expectedErrorCode: 'QUALITY_GATE_V2_BOOTSTRAP_REGISTRY_MISMATCH',
  },
  {
    mutation: 'replace-manifest-path',
    expectedErrorCode: 'QUALITY_GATE_V2_BOOTSTRAP_REGISTRY_MISMATCH',
  },
  {
    mutation: 'replace-registry-self',
    expectedErrorCode: 'QUALITY_GATE_V2_BOOTSTRAP_REGISTRY_MISMATCH',
  },
  {
    mutation: 'coordinated-registry-identity',
    expectedErrorCode: 'QUALITY_GATE_V2_BOOTSTRAP_SELF_MISMATCH',
  },
];

const BOOTSTRAP_ENVIRONMENT_COUNTEREXAMPLES: readonly Readonly<{
  label: string;
  value: string | null;
  expectedErrorCode:
    | 'QUALITY_GATE_V2_BOOTSTRAP_TRUST_INVALID'
    | 'QUALITY_GATE_V2_BOOTSTRAP_SELF_MISMATCH';
}>[] = [
  {
    label: 'missing variable',
    value: null,
    expectedErrorCode: 'QUALITY_GATE_V2_BOOTSTRAP_TRUST_INVALID',
  },
  {
    label: 'empty value',
    value: '',
    expectedErrorCode: 'QUALITY_GATE_V2_BOOTSTRAP_TRUST_INVALID',
  },
  {
    label: '63 lowercase characters',
    value:
      '11111111' +
      '11111111' +
      '11111111' +
      '11111111' +
      '11111111' +
      '11111111' +
      '11111111' +
      '1111111',
    expectedErrorCode: 'QUALITY_GATE_V2_BOOTSTRAP_TRUST_INVALID',
  },
  {
    label: '65 lowercase characters',
    value:
      '22222222' +
      '22222222' +
      '22222222' +
      '22222222' +
      '22222222' +
      '22222222' +
      '22222222' +
      '22222222' +
      '2',
    expectedErrorCode: 'QUALITY_GATE_V2_BOOTSTRAP_TRUST_INVALID',
  },
  {
    label: '64 uppercase characters',
    value:
      'AAAAAAAA' +
      'AAAAAAAA' +
      'AAAAAAAA' +
      'AAAAAAAA' +
      'AAAAAAAA' +
      'AAAAAAAA' +
      'AAAAAAAA' +
      'AAAAAAAA',
    expectedErrorCode: 'QUALITY_GATE_V2_BOOTSTRAP_TRUST_INVALID',
  },
  {
    label: 'valid lowercase but mismatched identity',
    value:
      '00000000' +
      '00000000' +
      '00000000' +
      '00000000' +
      '00000000' +
      '00000000' +
      '00000000' +
      '00000000',
    expectedErrorCode: 'QUALITY_GATE_V2_BOOTSTRAP_SELF_MISMATCH',
  },
];

const REGISTRY_DOCUMENT_COUNTEREXAMPLES: readonly RegistryDocumentMutation[] = [
  'wrong-schema',
  'missing-schema',
  'null-schema',
  'numeric-schema',
  'wrong-version',
  'missing-version',
  'string-version',
  'null-version',
  'missing-locks',
  'null-locks',
  'object-locks',
  'string-locks',
  'null-top-level',
  'array-top-level',
  'string-top-level',
];

function registryDocument(
  locks: readonly RegistryEntry[],
  mutation: RegistryDocumentMutation | undefined,
): unknown {
  if (mutation === undefined) {
    return {schema: 'start-five.quality-lock-registry', version: 1, locks};
  }
  if (mutation === 'wrong-schema') {
    return {schema: 'wrong.schema', version: 1, locks};
  }
  if (mutation === 'missing-schema') {
    return {version: 1, locks};
  }
  if (mutation === 'null-schema') {
    return {schema: null, version: 1, locks};
  }
  if (mutation === 'numeric-schema') {
    return {schema: 1, version: 1, locks};
  }
  if (mutation === 'wrong-version') {
    return {schema: 'start-five.quality-lock-registry', version: 2, locks};
  }
  if (mutation === 'missing-version') {
    return {schema: 'start-five.quality-lock-registry', locks};
  }
  if (mutation === 'string-version') {
    return {schema: 'start-five.quality-lock-registry', version: '1', locks};
  }
  if (mutation === 'null-version') {
    return {schema: 'start-five.quality-lock-registry', version: null, locks};
  }
  if (mutation === 'missing-locks') {
    return {schema: 'start-five.quality-lock-registry', version: 1};
  }
  if (mutation === 'null-locks') {
    return {schema: 'start-five.quality-lock-registry', version: 1, locks: null};
  }
  if (mutation === 'object-locks') {
    return {schema: 'start-five.quality-lock-registry', version: 1, locks: {}};
  }
  if (mutation === 'string-locks') {
    return {schema: 'start-five.quality-lock-registry', version: 1, locks: 'none'};
  }
  if (mutation === 'null-top-level') {
    return null;
  }
  if (mutation === 'array-top-level') {
    return [];
  }
  return 'registry';
}

function serializeRegistryDocument(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error('QUALITY_GATE_V2_REGISTRY_FIXTURE_SERIALIZATION_FAILED');
  }
  return serialized;
}

function createCliFixture(
  options: CreateCliFixtureOptions = {},
): CliFixture {
  const root = createTempDirectory();
  const bootstrap = installSyntheticBootstrap(root);
  const specPath = 'FROZEN_REVIEW1_SPEC.md';
  const testPath = 'tests/review1/frozen.test.ts';
  const spec = 'frozen review1 specification\n';
  const test = 'export {};\n';
  writeText(root, specPath, spec);
  writeText(root, testPath, test);
  const manifestText = [
    sha256(spec) + '  ' + specPath,
    sha256(test) + '  ' + testPath,
    '',
  ].join('\n');
  writeText(root, 'FROZEN_REVIEW1_LOCK.sha256', manifestText);
  const frozenEntry: RegistryEntry = {
    manifest: 'FROZEN_REVIEW1_LOCK.sha256',
    status: 'accepted',
    ordering: 'spec-first-posix',
    specPath,
    inventoryRoots: [specPath, 'tests/review1'],
    testRoots: ['tests/review1'],
    expectedSelfSha256: sha256(manifestText),
  };
  let bootstrapRegistrySelf = SYNTHETIC_BOOTSTRAP_EXPECTED_SELF_SHA256;
  if (
    options.bootstrapRegistryMutation ===
    'coordinated-registry-identity'
  ) {
    const bootstrapTestPath =
      'tests/quality-gate-v2/bootstrap.contract.test.ts';
    const originalEntry =
      '8e609bb71c20b858c77f0e9f90bb1319db8477b13f9f965f1a1e18524bf50881' +
      '  ' +
      bootstrapTestPath;
    const mutatedTest = 'export const registryIdentityTampered = true;\n';
    const mutatedEntry = sha256(mutatedTest) + '  ' + bootstrapTestPath;
    const mutatedManifest = bootstrap.manifestText.replace(
      originalEntry,
      mutatedEntry,
    );
    if (mutatedManifest === bootstrap.manifestText) {
      throw new Error('QUALITY_GATE_V2_BOOTSTRAP_MUTATION_REQUIRED');
    }
    writeText(root, bootstrapTestPath, mutatedTest);
    writeText(root, EXPECTED_BOOTSTRAP_MANIFEST_PATH, mutatedManifest);
    bootstrapRegistrySelf = sha256(mutatedManifest);
  }
  const bootstrapEntry: RegistryEntry = {
    manifest: EXPECTED_BOOTSTRAP_MANIFEST_PATH,
    status: 'accepted',
    ordering: 'spec-first-posix',
    specPath: EXPECTED_BOOTSTRAP_SPEC_PATH,
    inventoryRoots: [
      EXPECTED_BOOTSTRAP_SPEC_PATH,
      EXPECTED_BOOTSTRAP_TEST_ROOT,
    ],
    testRoots: [EXPECTED_BOOTSTRAP_TEST_ROOT],
    expectedSelfSha256: bootstrapRegistrySelf,
  };
  let selectedBootstrapEntry: RegistryEntry | null = bootstrapEntry;
  if (options.bootstrapRegistryMutation === 'delete-v2-entry') {
    selectedBootstrapEntry = null;
  } else if (options.bootstrapRegistryMutation === 'status-candidate') {
    const draftPath = EXPECTED_BOOTSTRAP_MANIFEST_PATH + '.draft';
    writeText(root, draftPath, bootstrap.manifestText);
    selectedBootstrapEntry = {
      ...bootstrapEntry,
      manifest: draftPath,
      status: 'candidate',
      expectedSelfSha256: null,
    };
  } else if (options.bootstrapRegistryMutation === 'status-rejected') {
    selectedBootstrapEntry = {...bootstrapEntry, status: 'rejected'};
  } else if (
    options.bootstrapRegistryMutation === 'replace-manifest-path'
  ) {
    const replacementPath = 'REPLACED_QUALITY_GATE_V2_LOCK.sha256';
    writeText(root, replacementPath, bootstrap.manifestText);
    selectedBootstrapEntry = {
      ...bootstrapEntry,
      manifest: replacementPath,
    };
  } else if (
    options.bootstrapRegistryMutation === 'replace-registry-self'
  ) {
    selectedBootstrapEntry = {
      ...bootstrapEntry,
      expectedSelfSha256: '0'.repeat(64),
    };
  }
  const candidateEntry: RegistryEntry = {
    manifest: 'UNACCEPTED_REVIEW_LOCK.sha256.draft',
    status: 'candidate',
    ordering: 'spec-first-posix',
    specPath: 'UNACCEPTED_REVIEW_SPEC.md',
    inventoryRoots: [
      'UNACCEPTED_REVIEW_SPEC.md',
      'tests/review-unaccepted',
    ],
    testRoots: ['tests/review-unaccepted'],
    expectedSelfSha256: null,
  };
  const rejectedEntry: RegistryEntry = {
    manifest: 'QUALITY_GATE_LOCK.sha256',
    status: 'rejected',
    ordering: 'spec-first-posix',
    specPath: 'QUALITY_GATE_TEST_SPEC.md',
    inventoryRoots: [
      'QUALITY_GATE_TEST_SPEC.md',
      'tests/quality-gate',
    ],
    testRoots: ['tests/quality-gate'],
    expectedSelfSha256:
      '5f2dfc85fc0fbabdf1f2e9546fb6536fcc353fc3437a14233ea2be33571189a0',
  };
  const locks: RegistryEntry[] = [];
  if (selectedBootstrapEntry !== null) {
    locks.push(selectedBootstrapEntry);
  }
  locks.push(frozenEntry, candidateEntry, rejectedEntry);
  const authoritativeRegistryPath = writeText(
    root,
    'quality-gate.acceptance.json',
    serializeRegistryDocument(
      registryDocument(locks, options.registryDocumentMutation),
    ),
  );
  const registryPath =
    options.registrySelection === 'alternate-v2-only'
      ? writeText(
          root,
          'alternate.acceptance.json',
          serializeRegistryDocument(registryDocument([bootstrapEntry], undefined)),
        )
      : authoritativeRegistryPath;
  const recorder = fs.readFileSync(
    path.join(__dirname, 'fixtures', 'pnpmRecorder'),
    'utf8',
  );
  writeText(root, 'exec', recorder);
  return {
    root,
    authoritativeRegistryPath,
    registryPath,
    reportPath: path.join(root, 'reports', 'quality-gate-report.json'),
    summaryPath: path.join(root, 'reports', 'quality-gate-summary.txt'),
    stagePidPath: path.join(root, 'pnpm-recorder-ready-pid.txt'),
    bootstrapExpectedSelfSha256: bootstrap.expectedSelfSha256,
    timeoutMs: options.timeoutMs ?? 20_000,
  };
}

function cliArguments(fixture: CliFixture): readonly string[] {
  return [
    path.join(
      projectRoot(),
      'scripts',
      'quality-gate-v2',
      'cli.cjs',
    ),
    'test',
    '--project-root',
    fixture.root,
    '--report-dir',
    path.join(fixture.root, 'reports'),
    '--timeout-ms',
    String(fixture.timeoutMs),
    '--node',
    process.execPath,
    '--pnpm',
    process.execPath,
    '--java-home',
    'C:\\fixture\\jdk-17',
    '--android-sdk',
    'C:\\fixture\\android-sdk',
    '--build-tools',
    '36.0.0',
    '--registry',
    fixture.registryPath,
  ];
}

function cliArgumentsWithoutRegistry(
  fixture: CliFixture,
  includeProjectRoot: boolean,
): readonly string[] {
  let args = [...cliArguments(fixture)];
  const registryIndex = args.indexOf('--registry');
  if (registryIndex < 0) {
    throw new Error('QUALITY_GATE_V2_REGISTRY_OPTION_REQUIRED');
  }
  args = [
    ...args.slice(0, registryIndex),
    ...args.slice(registryIndex + 2),
  ];
  if (!includeProjectRoot) {
    const projectRootIndex = args.indexOf('--project-root');
    if (projectRootIndex < 0) {
      throw new Error('QUALITY_GATE_V2_PROJECT_ROOT_OPTION_REQUIRED');
    }
    args = [
      ...args.slice(0, projectRootIndex),
      ...args.slice(projectRootIndex + 2),
    ];
  }
  return args;
}

function cliEnvironment(
  fixture: CliFixture,
  bootstrapEnvironmentValue: string | null,
): Record<string, string | undefined> {
  const environment: Record<string, string | undefined> = {
    ...process.env,
    QUALITY_GATE_FORBIDDEN_SECRET: 'must-not-reach-stage-child',
  };
  if (bootstrapEnvironmentValue === null) {
    delete environment.QUALITY_GATE_V2_BOOTSTRAP_SELF_SHA256;
  } else {
    environment.QUALITY_GATE_V2_BOOTSTRAP_SELF_SHA256 =
      bootstrapEnvironmentValue;
  }
  return environment;
}

function runCliArguments(
  fixture: CliFixture,
  args: readonly string[],
  cwd: string,
  bootstrapEnvironmentValue: string | null =
    fixture.bootstrapExpectedSelfSha256,
): Promise<RealChildResult> {
  return runRealChild({
    executable: process.execPath,
    args,
    cwd,
    environment: cliEnvironment(fixture, bootstrapEnvironmentValue),
    watchdogMs: 30_000,
  });
}

function runCli(
  fixture: CliFixture,
  bootstrapEnvironmentValue: string | null =
    fixture.bootstrapExpectedSelfSha256,
): Promise<RealChildResult> {
  return runCliArguments(
    fixture,
    cliArguments(fixture),
    fixture.root,
    bootstrapEnvironmentValue,
  );
}

function runAbortCli(fixture: CliFixture): Promise<RealChildResult> {
  const allArguments = cliArguments(fixture);
  const cliPath = allArguments[0];
  if (cliPath === undefined) {
    throw new Error('QUALITY_GATE_V2_CLI_PATH_REQUIRED');
  }
  return runRealChild({
    executable: process.execPath,
    args: [
      fixturePath(),
      'cli-abort-harness',
      cliPath,
      JSON.stringify(allArguments.slice(1)),
      fixture.root,
      fixture.stagePidPath,
      fixture.bootstrapExpectedSelfSha256,
    ],
    cwd: fixture.root,
    environment: {
      ...process.env,
      QUALITY_GATE_V2_BOOTSTRAP_SELF_SHA256:
        fixture.bootstrapExpectedSelfSha256,
      QUALITY_GATE_FORBIDDEN_SECRET: 'must-not-reach-stage-child',
    },
    watchdogMs: 30_000,
  });
}

function expectedRecorderArgv(): readonly string[] {
  return [
    'jest',
    '--runInBand',
    '--ci',
    '--coverage=false',
    '--roots',
    'tests/quality-gate-v2',
    'tests/review1',
  ];
}

function expectRecorderEvidence(fixture: CliFixture): void {
  expect(readJsonRecord(path.join(fixture.root, 'pnpm-recorder.json'))).toEqual({
    argv: expectedRecorderArgv(),
    cwd: fixture.root,
    environment: {
      ANDROID_HOME: 'C:\\fixture\\android-sdk',
      ANDROID_SDK_ROOT: 'C:\\fixture\\android-sdk',
      CI: '1',
      JAVA_HOME: 'C:\\fixture\\jdk-17',
      QUALITY_GATE_V2_BOOTSTRAP_SELF_SHA256: null,
      QUALITY_GATE_FORBIDDEN_SECRET: null,
    },
  });
}

function expectExactArtifactPair(fixture: CliFixture): void {
  expect(fs.readdirSync(path.dirname(fixture.reportPath)).sort()).toEqual([
    'quality-gate-report.json',
    'quality-gate-summary.txt',
  ]);
}

function expectSummaryTokens(
  fixture: CliFixture,
  tokens: readonly string[],
): void {
  const summary = fs.readFileSync(fixture.summaryPath, 'utf8');
  for (const token of tokens) {
    expect(summary).toContain(token);
  }
  expectExactArtifactPair(fixture);
}

function expectFormalProcessFailureArtifacts(
  fixture: CliFixture,
  evidence: Readonly<{
    exitCode: number | null;
    signal: string | null;
    timedOut: boolean;
    timeoutSource: 'deadline' | 'signal' | null;
    stdoutContains: string;
    stderrContains: string;
  }>,
): void {
  const report = readJsonRecord(fixture.reportPath);
  expect(report).toMatchObject({
    schema: 'start-five.quality-gate-report',
    version: 1,
    mode: 'test',
    status: 'failed',
    stages: [
      {
        id: 'formal-tests',
        status: 'failed',
        result: {
          exitCode: evidence.exitCode,
          signal: evidence.signal,
          timedOut: evidence.timedOut,
          timeoutSource: evidence.timeoutSource,
          stdout: expect.stringContaining(evidence.stdoutContains),
          stderr: expect.stringContaining(evidence.stderrContains),
        },
      },
      {id: 'lock-manifests', status: 'skipped', result: null},
    ],
  });
  expect(report.failure).toEqual({
    stageId: 'formal-tests',
    exitCode: evidence.exitCode,
    signal: evidence.signal,
    timedOut: evidence.timedOut,
    timeoutSource: evidence.timeoutSource,
    stdout: expect.stringContaining(evidence.stdoutContains),
    stderr: expect.stringContaining(evidence.stderrContains),
  });
  expectSummaryTokens(fixture, [
    'stageId: formal-tests',
    'exitCode: ' + String(evidence.exitCode),
    'signal: ' + String(evidence.signal),
    'timedOut: ' + String(evidence.timedOut),
    'timeoutSource: ' + String(evidence.timeoutSource),
    evidence.stdoutContains,
    evidence.stderrContains,
  ]);
}

function expectPreflightFailureArtifacts(
  fixture: CliFixture,
  expectedErrorCode: string,
): void {
  const report = readJsonRecord(fixture.reportPath);
  expect(report).toMatchObject({
    schema: 'start-five.quality-gate-report',
    version: 1,
    mode: 'test',
    status: 'failed',
    stages: [
      {id: 'formal-tests', status: 'skipped', result: null},
      {id: 'lock-manifests', status: 'failed'},
    ],
  });
  expect(report.failure).toEqual({
    stageId: 'lock-manifests',
    exitCode: 1,
    signal: null,
    timedOut: false,
    timeoutSource: null,
    stdout: '',
    stderr: expect.stringContaining(expectedErrorCode),
  });
  expectSummaryTokens(fixture, [
    'stageId: lock-manifests',
    'exitCode: 1',
    'signal: null',
    'timedOut: false',
    'timeoutSource: null',
    expectedErrorCode,
  ]);
}

function expectNoStageChild(fixture: CliFixture): void {
  expect(
    fs.existsSync(path.join(fixture.root, 'pnpm-recorder.json')),
  ).toBe(false);
  expect(fs.existsSync(fixture.stagePidPath)).toBe(false);
}

async function expectStageProcessTerminated(
  fixture: CliFixture,
): Promise<void> {
  const childPid = fs.readFileSync(fixture.stagePidPath, 'utf8').trim();
  expect(childPid).toMatch(/^[1-9][0-9]*$/);
  const probe = await runRealChild({
    executable: process.execPath,
    args: [fixturePath(), 'pid-status', childPid],
    cwd: fixture.root,
    environment: process.env,
    watchdogMs: 20_000,
  });
  expect(probe).toEqual({
    exitCode: 0,
    signal: null,
    stdout: 'terminated',
    stderr: '',
  });
}

afterEach(() => {
  cleanupTempDirectories();
});

describe('QUALITY-GATE-V2 real CLI child entry', () => {
  it('executes the real final test entry without --registry and binds both defaults to entry cwd', async () => {
    const fixture = createCliFixture();
    const args = cliArgumentsWithoutRegistry(fixture, false);

    expect(args[0]).toBe(
      path.join(
        projectRoot(),
        'scripts',
        'quality-gate-v2',
        'cli.cjs',
      ),
    );
    expect(args[1]).toBe('test');
    expect(args).not.toContain('--registry');
    expect(args).not.toContain('--project-root');

    const child = await runCliArguments(fixture, args, fixture.root);

    expect(child.exitCode).toBe(0);
    expect(child.signal).toBeNull();
    expectRecorderEvidence(fixture);
    expect(readJsonRecord(fixture.reportPath)).toMatchObject({
      mode: 'test',
      status: 'passed',
      projectRoot: fixture.root,
      stages: [
        {id: 'formal-tests', status: 'passed'},
        {id: 'lock-manifests', status: 'passed'},
      ],
      failure: null,
    });
    expectSummaryTokens(fixture, [
      'mode: test',
      'status: passed',
      'formal-tests: passed',
      'lock-manifests: passed',
    ]);
  });

  it('ignores an attacker cwd default registry when --project-root differs and --registry is omitted', async () => {
    const fixture = createCliFixture({registrySelection: 'alternate-v2-only'});
    const attackerCwd = createTempDirectory();
    writeText(
      attackerCwd,
      'quality-gate.acceptance.json',
      fs.readFileSync(fixture.registryPath, 'utf8'),
    );
    const args = cliArgumentsWithoutRegistry(fixture, true);

    expect(args).toContain('--project-root');
    expect(args).not.toContain('--registry');
    expect(JSON.stringify(readJsonRecord(
      path.join(attackerCwd, 'quality-gate.acceptance.json'),
    ))).not.toContain('FROZEN_REVIEW1_LOCK.sha256');

    const child = await runCliArguments(fixture, args, attackerCwd);

    expect(child.exitCode).toBe(0);
    expect(child.signal).toBeNull();
    expectRecorderEvidence(fixture);
    expect(readJsonRecord(fixture.reportPath)).toMatchObject({
      mode: 'test',
      status: 'passed',
      projectRoot: fixture.root,
      stages: [
        {id: 'formal-tests', status: 'passed'},
        {id: 'lock-manifests', status: 'passed'},
      ],
      failure: null,
    });
    expectExactArtifactPair(fixture);
  });

  it('rejects an omitted-registry default reached through a real project-root junction before excluding product locks', async () => {
    const fixture = createCliFixture({registrySelection: 'alternate-v2-only'});
    fs.writeFileSync(
      fixture.authoritativeRegistryPath,
      fs.readFileSync(fixture.registryPath, 'utf8'),
      'utf8',
    );
    const junctionContainer = createTempDirectory();
    const attackerCwd = createTempDirectory();
    const linkedProjectRoot = path.join(junctionContainer, 'linked-project');
    fs.symlinkSync(fixture.root, linkedProjectRoot, 'junction');
    const args = [...cliArgumentsWithoutRegistry(fixture, true)];
    const projectRootIndex = args.indexOf('--project-root');
    if (projectRootIndex < 0) {
      throw new Error('QUALITY_GATE_V2_PROJECT_ROOT_OPTION_REQUIRED');
    }
    args[projectRootIndex + 1] = linkedProjectRoot;

    expect(args).not.toContain('--registry');
    expect(fs.readFileSync(
      path.join(linkedProjectRoot, 'quality-gate.acceptance.json'),
      'utf8',
    )).toBe(fs.readFileSync(fixture.registryPath, 'utf8'));
    expect(JSON.stringify(readJsonRecord(
      path.join(linkedProjectRoot, 'quality-gate.acceptance.json'),
    ))).not.toContain('FROZEN_REVIEW1_LOCK.sha256');

    const child = await runCliArguments(fixture, args, attackerCwd);

    expect(child.exitCode).toBe(1);
    expect(child.signal).toBeNull();
    expect(child.stderr).toContain(
      'QUALITY_GATE_CLI_REGISTRY_NOT_AUTHORITATIVE',
    );
    expectNoStageChild(fixture);
    expectPreflightFailureArtifacts(
      fixture,
      'QUALITY_GATE_CLI_REGISTRY_NOT_AUTHORITATIVE',
    );
  });

  it('executes cli.cjs, the real test-mode orchestrator, and exact child argv/cwd/env', async () => {
    const fixture = createCliFixture();

    const child = await runCli(fixture);

    expect(child).toEqual({
      exitCode: 0,
      signal: null,
      stdout: expect.stringContaining('PNPM_RECORDER_STDOUT:0'),
      stderr: expect.stringContaining('PNPM_RECORDER_STDERR:0'),
    });
    expectRecorderEvidence(fixture);
    expect(readJsonRecord(fixture.reportPath)).toMatchObject({
      schema: 'start-five.quality-gate-report',
      version: 1,
      mode: 'test',
      status: 'passed',
      stages: [
        {id: 'formal-tests', status: 'passed'},
        {id: 'lock-manifests', status: 'passed'},
      ],
      failure: null,
    });
    expectSummaryTokens(fixture, [
      'mode: test',
      'status: passed',
      'formal-tests: passed',
      'lock-manifests: passed',
    ]);
  });

  it('propagates a real stage-child exit code and exact output through cli.cjs', async () => {
    const fixture = createCliFixture();
    writeText(fixture.root, 'pnpm-recorder-exit.txt', '23');

    const child = await runCli(fixture);

    expect(child.exitCode).toBe(23);
    expect(child.signal).toBeNull();
    expect(child.stdout).toContain('PNPM_RECORDER_STDOUT:23');
    expect(child.stderr).toContain('PNPM_RECORDER_STDERR:23');
    expectRecorderEvidence(fixture);
    expect(readJsonRecord(fixture.reportPath)).toMatchObject({
      mode: 'test',
      status: 'failed',
      stages: [
        {id: 'formal-tests', status: 'failed'},
        {id: 'lock-manifests', status: 'skipped'},
      ],
      failure: {
        stageId: 'formal-tests',
        exitCode: 23,
        signal: null,
        timedOut: false,
        timeoutSource: null,
        stdout: 'PNPM_RECORDER_STDOUT:23',
        stderr: 'PNPM_RECORDER_STDERR:23',
      },
    });
    expectSummaryTokens(fixture, [
      'stageId: formal-tests',
      'exitCode: 23',
      'signal: null',
      'timedOut: false',
      'timeoutSource: null',
      'PNPM_RECORDER_STDOUT:23',
      'PNPM_RECORDER_STDERR:23',
    ]);
  });

  it('runs internal lock validation after the real child and fails a mutated lock', async () => {
    const fixture = createCliFixture();
    writeText(
      fixture.root,
      'tests/review1/frozen.test.ts',
      'export const mutated = true;\n',
    );

    const child = await runCli(fixture);

    expect(child.exitCode).toBe(1);
    expect(child.signal).toBeNull();
    expect(child.stdout).toContain('PNPM_RECORDER_STDOUT:0');
    expect(child.stderr).toContain('QUALITY_GATE_MANIFEST_SHA_MISMATCH');
    expectRecorderEvidence(fixture);
    expect(readJsonRecord(fixture.reportPath)).toMatchObject({
      mode: 'test',
      status: 'failed',
      stages: [
        {id: 'formal-tests', status: 'passed'},
        {id: 'lock-manifests', status: 'failed'},
      ],
      failure: {
        stageId: 'lock-manifests',
        exitCode: 1,
        signal: null,
        timedOut: false,
        timeoutSource: null,
      },
    });
    expectSummaryTokens(fixture, [
      'stageId: lock-manifests',
      'exitCode: 1',
      'signal: null',
      'timedOut: false',
      'timeoutSource: null',
      'QUALITY_GATE_MANIFEST_SHA_MISMATCH',
    ]);
  });

  it.each(BOOTSTRAP_REGISTRY_COUNTEREXAMPLES)(
    'fails closed through cli.cjs for bootstrap/registry counterexample $mutation',
    async fixtureCase => {
      const fixture = createCliFixture({
        bootstrapRegistryMutation: fixtureCase.mutation,
      });

      const child = await runCli(fixture);

      expect(child.exitCode).toBe(1);
      expect(child.signal).toBeNull();
      expect(child.stderr).toContain(fixtureCase.expectedErrorCode);
      expectNoStageChild(fixture);
      expectPreflightFailureArtifacts(
        fixture,
        fixtureCase.expectedErrorCode,
      );
    },
  );

  it.each(BOOTSTRAP_ENVIRONMENT_COUNTEREXAMPLES)(
    'fails closed through real cli.cjs for bootstrap environment counterexample $label',
    async fixtureCase => {
      const fixture = createCliFixture();

      const child = await runCli(fixture, fixtureCase.value);

      expect(child.exitCode).toBe(1);
      expect(child.signal).toBeNull();
      expect(child.stderr).toContain(fixtureCase.expectedErrorCode);
      expectNoStageChild(fixture);
      expectPreflightFailureArtifacts(
        fixture,
        fixtureCase.expectedErrorCode,
      );
    },
  );

  it.each(REGISTRY_DOCUMENT_COUNTEREXAMPLES)(
    'fails closed through real cli.cjs for registry top-level counterexample %s',
    async mutation => {
      const fixture = createCliFixture({
        registryDocumentMutation: mutation,
      });

      const child = await runCli(fixture);

      expect(child.exitCode).toBe(1);
      expect(child.signal).toBeNull();
      expect(child.stderr).toContain('QUALITY_GATE_REGISTRY_INVALID');
      expectNoStageChild(fixture);
      expectPreflightFailureArtifacts(
        fixture,
        'QUALITY_GATE_REGISTRY_INVALID',
      );
    },
  );

  it('rejects a same-project alternate registry that preserves exact V2 identity but removes product locks', async () => {
    const fixture = createCliFixture({registrySelection: 'alternate-v2-only'});
    const alternate = readJsonRecord(fixture.registryPath);

    expect(fixture.registryPath).not.toBe(fixture.authoritativeRegistryPath);
    expect(JSON.stringify(alternate)).toContain(
      SYNTHETIC_BOOTSTRAP_EXPECTED_SELF_SHA256,
    );
    expect(JSON.stringify(alternate)).not.toContain(
      'FROZEN_REVIEW1_LOCK.sha256',
    );

    const child = await runCli(fixture);

    expect(child.exitCode).toBe(1);
    expect(child.signal).toBeNull();
    expect(child.stderr).toContain(
      'QUALITY_GATE_CLI_REGISTRY_NOT_AUTHORITATIVE',
    );
    expectNoStageChild(fixture);
    expectPreflightFailureArtifacts(
      fixture,
      'QUALITY_GATE_CLI_REGISTRY_NOT_AUTHORITATIVE',
    );
  });

  it('returns real CLI exit 124 with deadline evidence, reports, and no leftover stage PID', async () => {
    const fixture = createCliFixture({timeoutMs: 10_000});
    writeText(fixture.root, 'pnpm-recorder-mode.txt', 'ready-pid-hold');

    const child = await runCli(fixture);

    expect(child.exitCode).toBe(124);
    expect(child.signal).toBeNull();
    expect(child.stdout).toContain('PNPM_RECORDER_STDOUT:0');
    expect(child.stderr).toContain('PNPM_RECORDER_STDERR:0');
    expectRecorderEvidence(fixture);
    await expectStageProcessTerminated(fixture);
    expectFormalProcessFailureArtifacts(fixture, {
      exitCode: null,
      signal: 'SIGTERM',
      timedOut: true,
      timeoutSource: 'deadline',
      stdoutContains: 'PNPM_RECORDER_STDOUT:0',
      stderrContains: 'PNPM_RECORDER_STDERR:0',
    });
  });

  it('returns real CLI exit 130 for external abort with exact evidence, reports, and no leftover stage PID', async () => {
    const fixture = createCliFixture({timeoutMs: 20_000});
    writeText(fixture.root, 'pnpm-recorder-mode.txt', 'ready-pid-hold');

    const child = await runAbortCli(fixture);

    expect(child.exitCode).toBe(130);
    expect(child.signal).toBeNull();
    expect(child.stdout).toContain('PNPM_RECORDER_STDOUT:0');
    expect(child.stderr).toContain('PNPM_RECORDER_STDERR:0');
    expect(child.stderr).toContain('QUALITY_GATE_V2_REAL_CLI_ABORT');
    expectRecorderEvidence(fixture);
    await expectStageProcessTerminated(fixture);
    expectFormalProcessFailureArtifacts(fixture, {
      exitCode: null,
      signal: 'SIGTERM',
      timedOut: false,
      timeoutSource: null,
      stdoutContains: 'PNPM_RECORDER_STDOUT:0',
      stderrContains: 'QUALITY_GATE_V2_REAL_CLI_ABORT',
    });
  });
});
