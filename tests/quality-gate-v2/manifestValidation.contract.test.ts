import * as fs from 'node:fs';
import {
  cleanupTempDirectories,
  createTempDirectory,
  EXPECTED_BOOTSTRAP_MANIFEST_PATH,
  EXPECTED_BOOTSTRAP_SPEC_PATH,
  EXPECTED_BOOTSTRAP_TEST_ROOT,
  expectRejectCode,
  installSyntheticBootstrap,
  loadQualityGateProduction,
  sha256,
  SYNTHETIC_BOOTSTRAP_EXPECTED_SELF_SHA256,
  writeText,
  type LockOrdering,
  type LockRegistryStatus,
} from './qualityGateV2TestKit';

type RegistryEntry = Readonly<{
  manifest: string;
  status: LockRegistryStatus;
  ordering: LockOrdering;
  specPath: string | null;
  inventoryRoots: readonly string[];
  testRoots: readonly string[];
  expectedSelfSha256: string | null;
}>;

type CreateLockOptions = Readonly<{
  manifest: string;
  ordering: LockOrdering;
  specPath: string | null;
  inventoryRoots: readonly string[];
  testRoots: readonly string[];
  files: Readonly<Record<string, string>>;
  entryOrder: readonly string[];
  lineEnding?: '\n' | '\r\n';
}>;

function createAcceptedLock(
  root: string,
  options: CreateLockOptions,
): RegistryEntry {
  for (const [relativePath, value] of Object.entries(options.files)) {
    writeText(root, relativePath, value);
  }
  const lineEnding = options.lineEnding ?? '\n';
  const manifestText =
    options.entryOrder
      .map(
        relativePath =>
          sha256(options.files[relativePath] ?? '') +
          '  ' +
          relativePath,
      )
      .join(lineEnding) + lineEnding;
  writeText(root, options.manifest, manifestText);
  return {
    manifest: options.manifest,
    status: 'accepted',
    ordering: options.ordering,
    specPath: options.specPath,
    inventoryRoots: [...options.inventoryRoots],
    testRoots: [...options.testRoots],
    expectedSelfSha256: sha256(manifestText),
  };
}

function writeRegistry(
  root: string,
  locks: readonly object[],
  overrides: Readonly<Record<string, unknown>> = {},
): string {
  return writeText(
    root,
    'quality-gate.acceptance.json',
    JSON.stringify(
      {
        schema: 'start-five.quality-lock-registry',
        version: 1,
        locks,
        ...overrides,
      },
      null,
      2,
    ),
  );
}

function writeRawRegistry(root: string, value: unknown): string {
  const serialized = JSON.stringify(value, null, 2);
  if (serialized === undefined) {
    throw new Error('QUALITY_GATE_V2_REGISTRY_FIXTURE_SERIALIZATION_FAILED');
  }
  return writeText(root, 'quality-gate.acceptance.json', serialized);
}

function simpleAcceptedLock(
  root: string,
  manifest = 'ALPHA_LOCK.sha256',
): RegistryEntry {
  return createAcceptedLock(root, {
    manifest,
    ordering: 'spec-first-posix',
    specPath: 'ALPHA_SPEC.md',
    inventoryRoots: ['ALPHA_SPEC.md', 'tests/alpha'],
    testRoots: ['tests/alpha'],
    files: {
      'ALPHA_SPEC.md': 'alpha spec\n',
      'tests/alpha/alpha.test.ts': 'export {};\n',
    },
    entryOrder: ['ALPHA_SPEC.md', 'tests/alpha/alpha.test.ts'],
  });
}

const REGISTRY_STATUSES = [
  'accepted',
  'candidate',
  'rejected',
] as const;

const REGISTRY_TOP_LEVEL_COUNTEREXAMPLES: readonly Readonly<{
  label: string;
  value: unknown;
}>[] = [
  {
    label: 'wrong schema identity',
    value: {schema: 'wrong.schema', version: 1, locks: []},
  },
  {
    label: 'missing schema',
    value: {version: 1, locks: []},
  },
  {
    label: 'null schema',
    value: {schema: null, version: 1, locks: []},
  },
  {
    label: 'numeric schema',
    value: {schema: 1, version: 1, locks: []},
  },
  {
    label: 'wrong version identity',
    value: {
      schema: 'start-five.quality-lock-registry',
      version: 2,
      locks: [],
    },
  },
  {
    label: 'missing version',
    value: {schema: 'start-five.quality-lock-registry', locks: []},
  },
  {
    label: 'string version',
    value: {
      schema: 'start-five.quality-lock-registry',
      version: '1',
      locks: [],
    },
  },
  {
    label: 'null version',
    value: {
      schema: 'start-five.quality-lock-registry',
      version: null,
      locks: [],
    },
  },
  {
    label: 'missing locks',
    value: {schema: 'start-five.quality-lock-registry', version: 1},
  },
  {
    label: 'null locks',
    value: {
      schema: 'start-five.quality-lock-registry',
      version: 1,
      locks: null,
    },
  },
  {
    label: 'object locks',
    value: {
      schema: 'start-five.quality-lock-registry',
      version: 1,
      locks: {},
    },
  },
  {
    label: 'string locks',
    value: {
      schema: 'start-five.quality-lock-registry',
      version: 1,
      locks: 'none',
    },
  },
  {label: 'null top level', value: null},
  {label: 'array top level', value: []},
  {label: 'string top level', value: 'registry'},
];

function simpleRegistryEntry(
  root: string,
  status: LockRegistryStatus,
): RegistryEntry {
  const accepted = simpleAcceptedLock(root);
  if (status === 'candidate') {
    return {
      ...accepted,
      manifest: 'ALPHA_LOCK.sha256.draft',
      status,
      expectedSelfSha256: null,
    };
  }
  return {...accepted, status};
}

type InvalidRegistryEntryCase = Readonly<{
  label: string;
  mutate(entry: RegistryEntry): object;
}>;

const INVALID_REGISTRY_ENTRY_CASES: readonly InvalidRegistryEntryCase[] = [
  {
    label: 'unknown status',
    mutate: entry => ({...entry, status: 'future'}),
  },
  {
    label: 'missing status',
    mutate: entry => ({
      manifest: entry.manifest,
      ordering: entry.ordering,
      specPath: entry.specPath,
      inventoryRoots: entry.inventoryRoots,
      testRoots: entry.testRoots,
      expectedSelfSha256: entry.expectedSelfSha256,
    }),
  },
  {
    label: 'unknown ordering',
    mutate: entry => ({...entry, ordering: 'locale'}),
  },
  {
    label: 'missing ordering',
    mutate: entry => ({
      manifest: entry.manifest,
      status: entry.status,
      specPath: entry.specPath,
      inventoryRoots: entry.inventoryRoots,
      testRoots: entry.testRoots,
      expectedSelfSha256: entry.expectedSelfSha256,
    }),
  },
  {
    label: 'non-string manifest',
    mutate: entry => ({...entry, manifest: 42}),
  },
  {
    label: 'unsafe manifest path',
    mutate: entry => ({...entry, manifest: '../ALPHA_LOCK.sha256'}),
  },
  {
    label: 'backslash manifest path',
    mutate: entry => ({...entry, manifest: 'locks\\ALPHA_LOCK.sha256'}),
  },
  {
    label: 'status-incoherent manifest suffix',
    mutate: entry => ({
      ...entry,
      manifest:
        entry.status === 'candidate'
          ? 'ALPHA_LOCK.sha256'
          : 'ALPHA_LOCK.sha256.draft',
    }),
  },
  {
    label: 'unsafe spec path',
    mutate: entry => ({...entry, specPath: '../ALPHA_SPEC.md'}),
  },
  {
    label: 'non-string spec path',
    mutate: entry => ({...entry, specPath: 42}),
  },
  {
    label: 'missing spec path for spec-first ordering',
    mutate: entry => ({...entry, specPath: null}),
  },
  {
    label: 'non-array inventory roots',
    mutate: entry => ({...entry, inventoryRoots: 'tests/alpha'}),
  },
  {
    label: 'non-string inventory root',
    mutate: entry => ({...entry, inventoryRoots: [42]}),
  },
  {
    label: 'unsafe inventory root',
    mutate: entry => ({...entry, inventoryRoots: ['../tests/alpha']}),
  },
  {
    label: 'unsafe test root',
    mutate: entry => ({...entry, testRoots: ['C:/tests/alpha']}),
  },
  {
    label: 'non-array test roots',
    mutate: entry => ({...entry, testRoots: 'tests/alpha'}),
  },
  {
    label: 'non-string test root',
    mutate: entry => ({...entry, testRoots: [42]}),
  },
  {
    label: 'test root outside inventory',
    mutate: entry => ({...entry, testRoots: ['tests/outside']}),
  },
  {
    label: 'Windows-equivalent duplicate inventory roots',
    mutate: entry => ({
      ...entry,
      inventoryRoots: [...entry.inventoryRoots, 'tests/ALPHA'],
    }),
  },
  {
    label: 'duplicate test roots',
    mutate: entry => ({
      ...entry,
      testRoots: [...entry.testRoots, ...entry.testRoots],
    }),
  },
  {
    label: 'malformed expected self',
    mutate: entry => ({...entry, expectedSelfSha256: 'f'.repeat(63)}),
  },
  {
    label: 'non-string expected self',
    mutate: entry => ({...entry, expectedSelfSha256: 42}),
  },
  {
    label: 'uppercase expected self',
    mutate: entry => ({
      ...entry,
      expectedSelfSha256: 'A'.repeat(64),
    }),
  },
  {
    label: 'status-incoherent expected self',
    mutate: entry => ({
      ...entry,
      expectedSelfSha256:
        entry.status === 'candidate' ? 'a'.repeat(64) : null,
    }),
  },
  {
    label: 'incoherent posix ordering and spec path',
    mutate: entry => ({...entry, ordering: 'posix', specPath: entry.specPath}),
  },
  {
    label: 'unknown entry field',
    mutate: entry => ({...entry, futurePolicy: true}),
  },
  {
    label: 'missing manifest field',
    mutate: entry => ({
      status: entry.status,
      ordering: entry.ordering,
      specPath: entry.specPath,
      inventoryRoots: entry.inventoryRoots,
      testRoots: entry.testRoots,
      expectedSelfSha256: entry.expectedSelfSha256,
    }),
  },
];

const INVALID_REGISTRY_ENTRY_MATRIX: readonly Readonly<{
  status: LockRegistryStatus;
  label: string;
  mutate(entry: RegistryEntry): object;
}>[] = REGISTRY_STATUSES.flatMap(status =>
  INVALID_REGISTRY_ENTRY_CASES.map(testCase => ({
    status,
    label: testCase.label,
    mutate: testCase.mutate,
  })),
);

afterEach(() => {
  cleanupTempDirectories();
});

describe('QUALITY-GATE-V2 lock manifest validation', () => {
  it('validates the fixed bootstrap path, complete inventory, and external trust input', async () => {
    const production = loadQualityGateProduction();
    const root = createTempDirectory();
    const fixture = installSyntheticBootstrap(root);

    expect(sha256(fixture.manifestText)).toBe(
      SYNTHETIC_BOOTSTRAP_EXPECTED_SELF_SHA256,
    );
    await expect(
      production.validateQualityGateV2Bootstrap({
        projectRoot: root,
        expectedSelfSha256: fixture.expectedSelfSha256,
      }),
    ).resolves.toEqual({
      manifest: EXPECTED_BOOTSTRAP_MANIFEST_PATH,
      validatedSelfSha256: SYNTHETIC_BOOTSTRAP_EXPECTED_SELF_SHA256,
      entries: 2,
      specPath: EXPECTED_BOOTSTRAP_SPEC_PATH,
      inventoryRoots: [
        EXPECTED_BOOTSTRAP_SPEC_PATH,
        EXPECTED_BOOTSTRAP_TEST_ROOT,
      ],
      testRoots: [EXPECTED_BOOTSTRAP_TEST_ROOT],
    });
  });

  it.each([
    '',
    'f'.repeat(63),
    'F'.repeat(64),
  ])('rejects malformed external bootstrap trust identity %#', async identity => {
    const production = loadQualityGateProduction();
    const root = createTempDirectory();
    installSyntheticBootstrap(root);

    await expectRejectCode(
      production.validateQualityGateV2Bootstrap({
        projectRoot: root,
        expectedSelfSha256: identity,
      }),
      'QUALITY_GATE_V2_BOOTSTRAP_TRUST_INVALID',
    );
  });

  it('rejects a bootstrap entry content mutation against its fixed manifest', async () => {
    const production = loadQualityGateProduction();
    const root = createTempDirectory();
    const fixture = installSyntheticBootstrap(root);
    writeText(
      root,
      'tests/quality-gate-v2/bootstrap.contract.test.ts',
      'export const mutated = true;\n',
    );

    await expectRejectCode(
      production.validateQualityGateV2Bootstrap({
        projectRoot: root,
        expectedSelfSha256: fixture.expectedSelfSha256,
      }),
      'QUALITY_GATE_V2_BOOTSTRAP_SHA_MISMATCH',
    );
  });

  it('rejects coordinated manifest and registry-style self replacement against the external trust identity', async () => {
    const production = loadQualityGateProduction();
    const root = createTempDirectory();
    const fixture = installSyntheticBootstrap(root);
    const testPath = 'tests/quality-gate-v2/bootstrap.contract.test.ts';
    const mutatedTest = 'export const coordinatedMutation = true;\n';
    const originalEntry =
      '8e609bb71c20b858c77f0e9f90bb1319db8477b13f9f965f1a1e18524bf50881' +
      '  ' +
      testPath;
    const mutatedEntry = sha256(mutatedTest) + '  ' + testPath;
    const mutatedManifest = fixture.manifestText.replace(
      originalEntry,
      mutatedEntry,
    );
    expect(mutatedManifest).not.toBe(fixture.manifestText);
    writeText(root, testPath, mutatedTest);
    writeText(root, EXPECTED_BOOTSTRAP_MANIFEST_PATH, mutatedManifest);

    await expectRejectCode(
      production.validateQualityGateV2Bootstrap({
        projectRoot: root,
        expectedSelfSha256: fixture.expectedSelfSha256,
      }),
      'QUALITY_GATE_V2_BOOTSTRAP_SELF_MISMATCH',
    );
  });

  it('rejects an unlisted file under the fixed bootstrap inventory root', async () => {
    const production = loadQualityGateProduction();
    const root = createTempDirectory();
    const fixture = installSyntheticBootstrap(root);
    writeText(
      root,
      'tests/quality-gate-v2/unlisted.contract.test.ts',
      'export {};\n',
    );

    await expectRejectCode(
      production.validateQualityGateV2Bootstrap({
        projectRoot: root,
        expectedSelfSha256: fixture.expectedSelfSha256,
      }),
      'QUALITY_GATE_V2_BOOTSTRAP_INVENTORY_MISMATCH',
    );
  });

  it('rejects an alternate bootstrap manifest location when the fixed path is absent', async () => {
    const production = loadQualityGateProduction();
    const root = createTempDirectory();
    const fixture = installSyntheticBootstrap(root);
    fs.rmSync(fixture.manifestPath, {recursive: true, force: true});
    writeText(
      root,
      'alternate/QUALITY_GATE_V2_LOCK.sha256',
      fixture.manifestText,
    );

    await expectRejectCode(
      production.validateQualityGateV2Bootstrap({
        projectRoot: root,
        expectedSelfSha256: fixture.expectedSelfSha256,
      }),
      'QUALITY_GATE_V2_BOOTSTRAP_MANIFEST_REQUIRED',
    );
  });

  it('accepts frozen review1 roots and excludes candidate, rejected, and unregistered review roots by status', async () => {
    const production = loadQualityGateProduction();
    const root = createTempDirectory();
    const frozenReview1 = createAcceptedLock(root, {
      manifest: 'ALPHA_FROZEN_REVIEW1_LOCK.sha256',
      ordering: 'spec-first-posix',
      specPath: 'FROZEN_REVIEW1_SPEC.md',
      inventoryRoots: ['FROZEN_REVIEW1_SPEC.md', 'tests/review1'],
      testRoots: ['tests/review1'],
      files: {
        'FROZEN_REVIEW1_SPEC.md': 'frozen review one\n',
        'tests/review1/frozen.test.ts': 'export {};\n',
      },
      entryOrder: [
        'FROZEN_REVIEW1_SPEC.md',
        'tests/review1/frozen.test.ts',
      ],
    });
    const frozenReview10 = createAcceptedLock(root, {
      manifest: 'BETA_FROZEN_REVIEW10_LOCK.sha256',
      ordering: 'spec-first-posix',
      specPath: 'FROZEN_REVIEW10_SPEC.md',
      inventoryRoots: ['FROZEN_REVIEW10_SPEC.md', 'tests/review10'],
      testRoots: ['tests/review10'],
      files: {
        'FROZEN_REVIEW10_SPEC.md': 'frozen review ten\n',
        'tests/review10/frozen.test.ts': 'export {};\n',
      },
      entryOrder: [
        'FROZEN_REVIEW10_SPEC.md',
        'tests/review10/frozen.test.ts',
      ],
    });
    writeText(
      root,
      'tests/review-unregistered/unregistered.test.ts',
      'export {};\n',
    );
    const candidate: RegistryEntry = {
      manifest: 'UNACCEPTED_REVIEW_LOCK.sha256.draft',
      status: 'candidate',
      ordering: 'spec-first-posix',
      specPath: 'UNACCEPTED_REVIEW_SPEC.md',
      inventoryRoots: [
        'UNACCEPTED_REVIEW_SPEC.md',
        'tests/review-candidate',
      ],
      testRoots: ['tests/review-candidate'],
      expectedSelfSha256: null,
    };
    const rejected: RegistryEntry = {
      manifest: 'REJECTED_REVIEW_LOCK.sha256',
      status: 'rejected',
      ordering: 'spec-first-posix',
      specPath: 'REJECTED_REVIEW_SPEC.md',
      inventoryRoots: ['REJECTED_REVIEW_SPEC.md', 'tests/review-rejected'],
      testRoots: ['tests/review-rejected'],
      expectedSelfSha256: 'e'.repeat(64),
    };
    const registryPath = writeRegistry(root, [
      frozenReview1,
      frozenReview10,
      candidate,
      rejected,
    ]);

    await expect(
      production.discoverAcceptedTestRoots({projectRoot: root, registryPath}),
    ).resolves.toEqual(['tests/review1', 'tests/review10']);
    await expect(
      production.validateLockManifests({projectRoot: root, registryPath}),
    ).resolves.toEqual({
      validatedManifests: 2,
      entries: 4,
      acceptedTestRoots: ['tests/review1', 'tests/review10'],
      acceptedManifests: [
        'ALPHA_FROZEN_REVIEW1_LOCK.sha256',
        'BETA_FROZEN_REVIEW10_LOCK.sha256',
      ],
      excludedManifests: [
        {manifest: 'REJECTED_REVIEW_LOCK.sha256', status: 'rejected'},
        {
          manifest: 'UNACCEPTED_REVIEW_LOCK.sha256.draft',
          status: 'candidate',
        },
      ],
    });
  });

  it.each(INVALID_REGISTRY_ENTRY_MATRIX)(
    'rejects $status registry entry shape in discovery and validation: $label',
    async ({status, mutate}) => {
      const production = loadQualityGateProduction();
      const root = createTempDirectory();
      const entry = simpleRegistryEntry(root, status);
      const registryPath = writeRegistry(root, [mutate(entry)]);

      await expectRejectCode(
        production.discoverAcceptedTestRoots({projectRoot: root, registryPath}),
        'QUALITY_GATE_REGISTRY_ENTRY_INVALID',
      );
      await expectRejectCode(
        production.validateLockManifests({projectRoot: root, registryPath}),
        'QUALITY_GATE_REGISTRY_ENTRY_INVALID',
      );
    },
  );

  it('rejects an unknown registry status during discovery instead of silently excluding it', async () => {
    const production = loadQualityGateProduction();
    const root = createTempDirectory();
    const entry = simpleAcceptedLock(root);
    const registryPath = writeRegistry(root, [
      {...entry, status: 'future'},
    ]);

    await expectRejectCode(
      production.discoverAcceptedTestRoots({projectRoot: root, registryPath}),
      'QUALITY_GATE_REGISTRY_ENTRY_INVALID',
    );
  });

  it('rejects unknown top-level registry fields by explicit fail-closed policy', async () => {
    const production = loadQualityGateProduction();
    const root = createTempDirectory();
    const registryPath = writeRegistry(root, [], {futurePolicy: true});

    await expectRejectCode(
      production.discoverAcceptedTestRoots({projectRoot: root, registryPath}),
      'QUALITY_GATE_REGISTRY_INVALID',
    );
    await expectRejectCode(
      production.validateLockManifests({projectRoot: root, registryPath}),
      'QUALITY_GATE_REGISTRY_INVALID',
    );
  });

  it('rejects duplicate Windows-equivalent manifest registrations', async () => {
    const production = loadQualityGateProduction();
    const root = createTempDirectory();
    const entry = simpleAcceptedLock(root);
    const registryPath = writeRegistry(root, [
      entry,
      {...entry, manifest: 'alpha_lock.sha256'},
    ]);

    await expectRejectCode(
      production.discoverAcceptedTestRoots({projectRoot: root, registryPath}),
      'QUALITY_GATE_REGISTRY_DUPLICATE_MANIFEST',
    );
    await expectRejectCode(
      production.validateLockManifests({projectRoot: root, registryPath}),
      'QUALITY_GATE_REGISTRY_DUPLICATE_MANIFEST',
    );
  });

  it('validates multiple LF/CRLF locks with their declared legacy ordering conventions', async () => {
    const production = loadQualityGateProduction();
    const root = createTempDirectory();
    const specFirst = createAcceptedLock(root, {
      manifest: 'ALPHA_LOCK.sha256',
      ordering: 'spec-first-posix',
      specPath: 'Z_ALPHA_SPEC.md',
      inventoryRoots: ['Z_ALPHA_SPEC.md', 'tests/alpha'],
      testRoots: ['tests/alpha'],
      files: {
        'Z_ALPHA_SPEC.md': 'alpha spec\n',
        'tests/alpha/a.test.ts': 'export {};\n',
      },
      entryOrder: ['Z_ALPHA_SPEC.md', 'tests/alpha/a.test.ts'],
      lineEnding: '\r\n',
    });
    const posix = createAcceptedLock(root, {
      manifest: 'BETA_LOCK.sha256',
      ordering: 'posix',
      specPath: null,
      inventoryRoots: ['docs/beta.md', 'tests/beta'],
      testRoots: ['tests/beta'],
      files: {
        'docs/beta.md': 'beta docs\n',
        'tests/beta/b.test.ts': 'export {};\n',
      },
      entryOrder: ['docs/beta.md', 'tests/beta/b.test.ts'],
      lineEnding: '\n',
    });
    const registryPath = writeRegistry(root, [specFirst, posix]);

    await expect(
      production.validateLockManifests({
        projectRoot: root,
        registryPath,
      }),
    ).resolves.toEqual({
      validatedManifests: 2,
      entries: 4,
      acceptedTestRoots: ['tests/alpha', 'tests/beta'],
      acceptedManifests: ['ALPHA_LOCK.sha256', 'BETA_LOCK.sha256'],
      excludedManifests: [],
    });
  });

  it('excludes rejected and candidate locks, including the old rejected QUALITY_GATE identity', async () => {
    const production = loadQualityGateProduction();
    const root = createTempDirectory();
    const accepted = simpleAcceptedLock(root);
    const rejected: RegistryEntry = {
      manifest: 'QUALITY_GATE_LOCK.sha256',
      status: 'rejected',
      ordering: 'spec-first-posix',
      specPath: 'QUALITY_GATE_TEST_SPEC.md',
      inventoryRoots: ['QUALITY_GATE_TEST_SPEC.md', 'tests/quality-gate'],
      testRoots: ['tests/quality-gate'],
      expectedSelfSha256:
        '5f2dfc85fc0fbabdf1f2e9546fb6536fcc353fc3437a14233ea2be33571189a0',
    };
    const candidate: RegistryEntry = {
      manifest: 'QUALITY_GATE_V2_LOCK.sha256.draft',
      status: 'candidate',
      ordering: 'spec-first-posix',
      specPath: 'QUALITY_GATE_V2_TEST_SPEC.md',
      inventoryRoots: ['QUALITY_GATE_V2_TEST_SPEC.md', 'tests/quality-gate-v2'],
      testRoots: ['tests/quality-gate-v2'],
      expectedSelfSha256: null,
    };
    const registryPath = writeRegistry(root, [
      accepted,
      rejected,
      candidate,
    ]);

    await expect(
      production.discoverAcceptedTestRoots({
        projectRoot: root,
        registryPath,
      }),
    ).resolves.toEqual(['tests/alpha']);
    await expect(
      production.validateLockManifests({
        projectRoot: root,
        registryPath,
      }),
    ).resolves.toMatchObject({
      validatedManifests: 1,
      entries: 2,
      acceptedTestRoots: ['tests/alpha'],
      acceptedManifests: ['ALPHA_LOCK.sha256'],
      excludedManifests: [
        {manifest: 'QUALITY_GATE_LOCK.sha256', status: 'rejected'},
        {
          manifest: 'QUALITY_GATE_V2_LOCK.sha256.draft',
          status: 'candidate',
        },
      ],
    });
  });

  it('rejects malformed line syntax instead of partially parsing it', async () => {
    const production = loadQualityGateProduction();
    const root = createTempDirectory();
    const entry = simpleAcceptedLock(root);
    const malformed = 'a'.repeat(64) + ' ALPHA_SPEC.md\n';
    writeText(root, entry.manifest, malformed);
    const registryPath = writeRegistry(root, [
      {...entry, expectedSelfSha256: sha256(malformed)},
    ]);

    await expectRejectCode(
      production.validateLockManifests({projectRoot: root, registryPath}),
      'QUALITY_GATE_MANIFEST_FORMAT_INVALID',
    );
  });

  it.each([
    '../escape.txt',
    './dot.txt',
    '/absolute.txt',
    'C:/drive.txt',
    'tests\\backslash\\file.ts',
  ])('rejects unsafe or noncanonical manifest path %s', async unsafePath => {
    const production = loadQualityGateProduction();
    const root = createTempDirectory();
    writeText(root, 'ALPHA_SPEC.md', 'alpha\n');
    const manifestText =
      sha256('alpha\n') +
      '  ALPHA_SPEC.md\n' +
      '0'.repeat(64) +
      '  ' +
      unsafePath +
      '\n';
    writeText(root, 'ALPHA_LOCK.sha256', manifestText);
    const registryPath = writeRegistry(root, [
      {
        manifest: 'ALPHA_LOCK.sha256',
        status: 'accepted',
        ordering: 'spec-first-posix',
        specPath: 'ALPHA_SPEC.md',
        inventoryRoots: ['ALPHA_SPEC.md'],
        testRoots: [],
        expectedSelfSha256: sha256(manifestText),
      },
    ]);

    await expectRejectCode(
      production.validateLockManifests({projectRoot: root, registryPath}),
      'QUALITY_GATE_MANIFEST_UNSAFE_PATH',
    );
  });

  it.each([
    ['ALPHA_SPEC.md', 'ALPHA_SPEC.md'],
    ['tests/alpha/A.test.ts', 'tests/alpha/a.test.ts'],
  ])('rejects duplicate Windows-equivalent entry paths', async (left, right) => {
    const production = loadQualityGateProduction();
    const root = createTempDirectory();
    writeText(root, 'ALPHA_SPEC.md', 'alpha\n');
    writeText(root, 'tests/alpha/a.test.ts', 'export {};\n');
    const manifestText = [
      sha256('alpha\n') + '  ALPHA_SPEC.md',
      sha256('export {};\n') + '  ' + left,
      sha256('export {};\n') + '  ' + right,
      '',
    ].join('\n');
    writeText(root, 'ALPHA_LOCK.sha256', manifestText);
    const registryPath = writeRegistry(root, [
      {
        manifest: 'ALPHA_LOCK.sha256',
        status: 'accepted',
        ordering: 'spec-first-posix',
        specPath: 'ALPHA_SPEC.md',
        inventoryRoots: ['ALPHA_SPEC.md', 'tests/alpha'],
        testRoots: ['tests/alpha'],
        expectedSelfSha256: sha256(manifestText),
      },
    ]);

    await expectRejectCode(
      production.validateLockManifests({projectRoot: root, registryPath}),
      'QUALITY_GATE_MANIFEST_DUPLICATE_PATH',
    );
  });

  it('rejects a manifest that attempts to list itself', async () => {
    const production = loadQualityGateProduction();
    const root = createTempDirectory();
    const manifestText =
      '0'.repeat(64) + '  ALPHA_LOCK.sha256\n';
    writeText(root, 'ALPHA_LOCK.sha256', manifestText);
    const registryPath = writeRegistry(root, [
      {
        manifest: 'ALPHA_LOCK.sha256',
        status: 'accepted',
        ordering: 'posix',
        specPath: null,
        inventoryRoots: [],
        testRoots: [],
        expectedSelfSha256: sha256(manifestText),
      },
    ]);

    await expectRejectCode(
      production.validateLockManifests({projectRoot: root, registryPath}),
      'QUALITY_GATE_MANIFEST_SELF_ENTRY',
    );
  });

  it.each([
    {
      ordering: 'posix' as const,
      specPath: null,
      order: ['tests/alpha/z.test.ts', 'docs/a.md'],
    },
    {
      ordering: 'spec-first-posix' as const,
      specPath: 'Z_SPEC.md',
      order: ['tests/alpha/a.test.ts', 'Z_SPEC.md'],
    },
  ])('rejects entries violating $ordering ordering', async fixture => {
    const production = loadQualityGateProduction();
    const root = createTempDirectory();
    const files: Readonly<Record<string, string>> = {
      'docs/a.md': 'docs\n',
      'tests/alpha/a.test.ts': 'export {};\n',
      'tests/alpha/z.test.ts': 'export {};\n',
      'Z_SPEC.md': 'spec\n',
    };
    for (const [relativePath, value] of Object.entries(files)) {
      writeText(root, relativePath, value);
    }
    const manifestText =
      fixture.order
        .map(
          relativePath =>
            sha256(files[relativePath] ?? '') + '  ' + relativePath,
        )
        .join('\n') + '\n';
    writeText(root, 'ORDER_LOCK.sha256', manifestText);
    const registryPath = writeRegistry(root, [
      {
        manifest: 'ORDER_LOCK.sha256',
        status: 'accepted',
        ordering: fixture.ordering,
        specPath: fixture.specPath,
        inventoryRoots: fixture.order,
        testRoots: [],
        expectedSelfSha256: sha256(manifestText),
      },
    ]);

    await expectRejectCode(
      production.validateLockManifests({projectRoot: root, registryPath}),
      'QUALITY_GATE_MANIFEST_ORDER_INVALID',
    );
  });

  it('rejects listed content whose SHA-256 does not match', async () => {
    const production = loadQualityGateProduction();
    const root = createTempDirectory();
    const entry = simpleAcceptedLock(root);
    writeText(root, 'ALPHA_SPEC.md', 'mutated\n');
    const registryPath = writeRegistry(root, [entry]);

    await expectRejectCode(
      production.validateLockManifests({projectRoot: root, registryPath}),
      'QUALITY_GATE_MANIFEST_SHA_MISMATCH',
    );
  });

  it('rejects a listed file that is missing', async () => {
    const production = loadQualityGateProduction();
    const root = createTempDirectory();
    const manifestText =
      sha256('missing\n') + '  tests/alpha/missing.test.ts\n';
    writeText(root, 'ALPHA_LOCK.sha256', manifestText);
    const registryPath = writeRegistry(root, [
      {
        manifest: 'ALPHA_LOCK.sha256',
        status: 'accepted',
        ordering: 'posix',
        specPath: null,
        inventoryRoots: ['tests/alpha'],
        testRoots: ['tests/alpha'],
        expectedSelfSha256: sha256(manifestText),
      },
    ]);

    await expectRejectCode(
      production.validateLockManifests({projectRoot: root, registryPath}),
      'QUALITY_GATE_MANIFEST_FILE_MISSING',
    );
  });

  it('rejects an inventory file omitted from the manifest', async () => {
    const production = loadQualityGateProduction();
    const root = createTempDirectory();
    const entry = simpleAcceptedLock(root);
    writeText(root, 'tests/alpha/unlisted.test.ts', 'export {};\n');
    const registryPath = writeRegistry(root, [entry]);

    await expectRejectCode(
      production.validateLockManifests({projectRoot: root, registryPath}),
      'QUALITY_GATE_MANIFEST_INVENTORY_MISSING',
    );
  });

  it('rejects a listed file outside every declared inventory root', async () => {
    const production = loadQualityGateProduction();
    const root = createTempDirectory();
    writeText(root, 'ALPHA_SPEC.md', 'alpha\n');
    writeText(root, 'outside.txt', 'outside\n');
    const manifestText = [
      sha256('alpha\n') + '  ALPHA_SPEC.md',
      sha256('outside\n') + '  outside.txt',
      '',
    ].join('\n');
    writeText(root, 'ALPHA_LOCK.sha256', manifestText);
    const registryPath = writeRegistry(root, [
      {
        manifest: 'ALPHA_LOCK.sha256',
        status: 'accepted',
        ordering: 'spec-first-posix',
        specPath: 'ALPHA_SPEC.md',
        inventoryRoots: ['ALPHA_SPEC.md'],
        testRoots: [],
        expectedSelfSha256: sha256(manifestText),
      },
    ]);

    await expectRejectCode(
      production.validateLockManifests({projectRoot: root, registryPath}),
      'QUALITY_GATE_MANIFEST_INVENTORY_UNEXPECTED',
    );
  });

  it('rejects a registry self identity that differs from the manifest bytes', async () => {
    const production = loadQualityGateProduction();
    const root = createTempDirectory();
    const entry = simpleAcceptedLock(root);
    const registryPath = writeRegistry(root, [
      {...entry, expectedSelfSha256: 'f'.repeat(64)},
    ]);

    await expectRejectCode(
      production.validateLockManifests({projectRoot: root, registryPath}),
      'QUALITY_GATE_MANIFEST_SELF_HASH_MISMATCH',
    );
  });

  it.each(REGISTRY_TOP_LEVEL_COUNTEREXAMPLES)(
    'rejects registry top-level counterexample $label through discovery and validation',
    async fixture => {
      const production = loadQualityGateProduction();
      const root = createTempDirectory();
      const registryPath = writeRawRegistry(root, fixture.value);

      await expectRejectCode(
        production.discoverAcceptedTestRoots({projectRoot: root, registryPath}),
        'QUALITY_GATE_REGISTRY_INVALID',
      );
      await expectRejectCode(
        production.validateLockManifests({projectRoot: root, registryPath}),
        'QUALITY_GATE_REGISTRY_INVALID',
      );
    },
  );
});
