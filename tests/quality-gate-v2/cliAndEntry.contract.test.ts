import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  cleanupTempDirectories,
  createTempDirectory,
  EXPECTED_BOOTSTRAP_MANIFEST_PATH,
  EXPECTED_BOOTSTRAP_SPEC_PATH,
  EXPECTED_BOOTSTRAP_TEST_ROOT,
  failedResult,
  installSyntheticBootstrap,
  loadQualityGateProduction,
  projectRoot,
  readJsonRecord,
  RecordingRunner,
  successResult,
  SYNTHETIC_BOOTSTRAP_EXPECTED_SELF_SHA256,
  writeText,
  type CliTextSink,
} from './qualityGateV2TestKit';

class TextBuffer implements CliTextSink {
  value = '';

  write(value: string): void {
    this.value += value;
  }
}

function installCliPreflight(root: string): string {
  const bootstrap = installSyntheticBootstrap(root);
  writeText(
    root,
    'quality-gate.acceptance.json',
    JSON.stringify({
      schema: 'start-five.quality-lock-registry',
      version: 1,
      locks: [
        {
          manifest: EXPECTED_BOOTSTRAP_MANIFEST_PATH,
          status: 'accepted',
          ordering: 'spec-first-posix',
          specPath: EXPECTED_BOOTSTRAP_SPEC_PATH,
          inventoryRoots: [
            EXPECTED_BOOTSTRAP_SPEC_PATH,
            EXPECTED_BOOTSTRAP_TEST_ROOT,
          ],
          testRoots: [EXPECTED_BOOTSTRAP_TEST_ROOT],
          expectedSelfSha256:
            SYNTHETIC_BOOTSTRAP_EXPECTED_SELF_SHA256,
        },
      ],
    }),
  );
  return bootstrap.expectedSelfSha256;
}

function fullArgs(root: string): string[] {
  return [
    'full',
    '--project-root',
    root,
    '--report-dir',
    path.win32.join(root, 'reports'),
    '--timeout-ms',
    '120000',
    '--node',
    process.execPath,
    '--pnpm',
    'C:\\runtime\\pnpm.cmd',
    '--java-home',
    'C:\\runtime\\jdk-17',
    '--android-sdk',
    'C:\\runtime\\android-sdk',
    '--build-tools',
    '36.0.0',
    '--registry',
    path.win32.join(root, 'quality-gate.acceptance.json'),
  ];
}

function fullArgsWithRegistry(root: string, registryPath: string): string[] {
  const args = fullArgs(root);
  const registryOptionIndex = args.indexOf('--registry');
  if (registryOptionIndex < 0) {
    throw new Error('QUALITY_GATE_V2_REGISTRY_OPTION_REQUIRED');
  }
  args[registryOptionIndex + 1] = registryPath;
  return args;
}

function fullArgsWithoutRegistry(root: string): string[] {
  const args = fullArgs(root);
  const registryOptionIndex = args.indexOf('--registry');
  if (registryOptionIndex < 0) {
    throw new Error('QUALITY_GATE_V2_REGISTRY_OPTION_REQUIRED');
  }
  return [
    ...args.slice(0, registryOptionIndex),
    ...args.slice(registryOptionIndex + 2),
  ];
}

type JunctionOracleEvidence = Readonly<{
  created: true;
  linkedRegistryContents: '{}';
  rejectionCode: 'QUALITY_GATE_CLI_REGISTRY_NOT_AUTHORITATIVE';
  cleaned: true;
  targetPreserved: true;
}>;

function registryErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }
  const value = Reflect.get(error, 'code');
  return typeof value === 'string' ? value : null;
}

function authorityError(): Error {
  const error = new Error('QUALITY_GATE_CLI_REGISTRY_NOT_AUTHORITATIVE');
  Object.defineProperty(error, 'code', {
    value: 'QUALITY_GATE_CLI_REGISTRY_NOT_AUTHORITATIVE',
  });
  return error;
}

function exerciseRealJunctionOracle(
  parseRegistryPath: (registryPath: string, root: string) => void,
): JunctionOracleEvidence {
  const root = createTempDirectory();
  const redirected = createTempDirectory();
  const targetRegistryPath = writeText(
    redirected,
    'quality-gate.acceptance.json',
    '{}',
  );
  const registryLink = path.join(root, 'registry-link');
  let deferredError: unknown = null;
  let rejectionCode: string | null = null;
  let created = false;
  let linkedRegistryContents: string | null = null;
  let cleaned = false;
  let targetPreserved = false;

  try {
    fs.symlinkSync(redirected, registryLink, 'junction');
    created = fs.existsSync(registryLink);
    linkedRegistryContents = fs.readFileSync(
      path.join(registryLink, 'quality-gate.acceptance.json'),
      'utf8',
    );
    try {
      parseRegistryPath(
        path.join(registryLink, 'quality-gate.acceptance.json'),
        root,
      );
    } catch (error) {
      rejectionCode = registryErrorCode(error);
      if (rejectionCode === null) {
        deferredError = error;
      }
    }
  } finally {
    fs.rmSync(registryLink, {recursive: true, force: true});
    cleaned = !fs.existsSync(registryLink);
    targetPreserved =
      fs.existsSync(targetRegistryPath) &&
      fs.readFileSync(targetRegistryPath, 'utf8') === '{}';
  }

  if (deferredError !== null) {
    throw deferredError;
  }
  if (
    !created ||
    linkedRegistryContents !== '{}' ||
    rejectionCode !== 'QUALITY_GATE_CLI_REGISTRY_NOT_AUTHORITATIVE' ||
    !cleaned ||
    !targetPreserved
  ) {
    throw new Error('QUALITY_GATE_V2_JUNCTION_ORACLE_INCOMPLETE');
  }
  return {
    created: true,
    linkedRegistryContents: '{}',
    rejectionCode: 'QUALITY_GATE_CLI_REGISTRY_NOT_AUTHORITATIVE',
    cleaned: true,
    targetPreserved: true,
  };
}

afterEach(() => {
  cleanupTempDirectories();
});

describe('QUALITY-GATE-V2 CLI and default entrypoints', () => {
  it('parses the exact argv array without shell reconstruction', () => {
    const production = loadQualityGateProduction();
    const root = 'C:\\workspace with spaces\\start-five';

    expect(production.parseQualityGateCliArgs(fullArgs(root), root)).toEqual({
      mode: 'full',
      projectRoot: root,
      reportDirectory: path.win32.join(root, 'reports'),
      timeoutMs: 120_000,
      nodeExecutable: process.execPath,
      pnpmExecutable: 'C:\\runtime\\pnpm.cmd',
      javaHome: 'C:\\runtime\\jdk-17',
      androidSdkRoot: 'C:\\runtime\\android-sdk',
      androidBuildToolsVersion: '36.0.0',
      registryPath: path.win32.join(
        root,
        'quality-gate.acceptance.json',
      ),
    });
  });

  it.each([
    {
      label: 'forward separators and dot segments',
      registryPath:
        'C:/workspace with spaces/start-five/registry/.././quality-gate.acceptance.json',
    },
    {
      label: 'Windows case-insensitive spelling',
      registryPath:
        'c:\\WORKSPACE WITH SPACES\\START-FIVE\\QUALITY-GATE.ACCEPTANCE.JSON',
    },
    {
      label: 'relative default path resolved from the project root cwd',
      registryPath: '.\\quality-gate.acceptance.json',
    },
  ])(
    'accepts only the normalized authoritative registry identity: $label',
    fixture => {
      const production = loadQualityGateProduction();
      const root = 'C:\\workspace with spaces\\start-five';

      expect(
        production.parseQualityGateCliArgs(
          fullArgsWithRegistry(root, fixture.registryPath),
          root,
        ),
      ).toMatchObject({
        projectRoot: root,
        registryPath: path.win32.join(
          root,
          'quality-gate.acceptance.json',
        ),
      });
    },
  );

  it('binds an omitted registry to explicit project-root even when cwd differs', () => {
    const production = loadQualityGateProduction();
    const root = 'C:\\workspace with spaces\\start-five';
    const attackerCwd = 'C:\\attacker cwd with alternate registry';

    expect(
      production.parseQualityGateCliArgs(
        fullArgsWithoutRegistry(root),
        attackerCwd,
      ),
    ).toMatchObject({
      projectRoot: root,
      registryPath: path.win32.join(
        root,
        'quality-gate.acceptance.json',
      ),
    });
  });

  it('binds omitted project-root and registry defaults to the entry cwd', () => {
    const production = loadQualityGateProduction();
    const entryCwd = 'C:\\workspace with spaces\\start-five';

    expect(production.parseQualityGateCliArgs(['test'], entryCwd)).toMatchObject({
      mode: 'test',
      projectRoot: entryCwd,
      registryPath: path.win32.join(
        entryCwd,
        'quality-gate.acceptance.json',
      ),
    });
  });

  it.each([
    {
      label: 'same-project alternate file',
      registryPath:
        'C:\\workspace with spaces\\start-five\\alternate.acceptance.json',
    },
    {
      label: 'parent traversal to a sibling registry',
      registryPath:
        'C:\\workspace with spaces\\start-five\\..\\other\\quality-gate.acceptance.json',
    },
  ])(
    'rejects a non-authoritative CLI registry before orchestration: $label',
    fixture => {
      const production = loadQualityGateProduction();
      const root = 'C:\\workspace with spaces\\start-five';

      expect(() =>
        production.parseQualityGateCliArgs(
          fullArgsWithRegistry(root, fixture.registryPath),
          root,
        ),
      ).toThrow(
        expect.objectContaining({
          code: 'QUALITY_GATE_CLI_REGISTRY_NOT_AUTHORITATIVE',
        }),
      );
    },
  );

  it('proves the real Windows junction fixture create-access-reject-finally-cleanup path with an independent control', () => {
    expect(
      exerciseRealJunctionOracle(() => {
        throw authorityError();
      }),
    ).toEqual({
      created: true,
      linkedRegistryContents: '{}',
      rejectionCode: 'QUALITY_GATE_CLI_REGISTRY_NOT_AUTHORITATIVE',
      cleaned: true,
      targetPreserved: true,
    });
  });

  it('rejects a registry reached through a real Windows directory reparse point after creating and accessing it', () => {
    expect(
      exerciseRealJunctionOracle((registryPath, root) => {
        const production = loadQualityGateProduction();
        production.parseQualityGateCliArgs(
          fullArgsWithRegistry(root, registryPath),
          root,
        );
      }),
    ).toEqual({
      created: true,
      linkedRegistryContents: '{}',
      rejectionCode: 'QUALITY_GATE_CLI_REGISTRY_NOT_AUTHORITATIVE',
      cleaned: true,
      targetPreserved: true,
    });
  });

  it.each([
    {argv: ['full', '--unknown', 'value']},
    {argv: ['full', '--timeout-ms', '0']},
    {argv: ['full', '--timeout-ms', 'not-a-number']},
    {argv: ['full', '--project-root']},
  ])('rejects invalid CLI argv %# with a stable usage error', ({argv}) => {
    const production = loadQualityGateProduction();

    expect(() =>
      production.parseQualityGateCliArgs(argv, 'C:\\workspace'),
    ).toThrow(expect.objectContaining({code: 'QUALITY_GATE_CLI_USAGE'}));
  });

  it('supports help without starting the process runner', async () => {
    const production = loadQualityGateProduction();
    const stdout = new TextBuffer();
    const stderr = new TextBuffer();
    const runner = new RecordingRunner();

    const exitCode = await production.runQualityGateCli(['--help'], {
      cwd: 'C:\\workspace',
      platform: 'win32',
      environment: process.env,
      bootstrapExpectedSelfSha256:
        SYNTHETIC_BOOTSTRAP_EXPECTED_SELF_SHA256,
      stdout,
      stderr,
      now: () => '2026-08-05T12:00:00.000Z',
      runId: 'help-run',
      processRunner: runner,
    });

    expect(exitCode).toBe(0);
    expect(stdout.value).toContain('quality-gate-v2');
    expect(stdout.value).toContain('test');
    expect(stdout.value).toContain('full');
    expect(stderr.value).toBe('');
    expect(runner.calls).toEqual([]);
  });

  it('returns the failing child exit code and forwards exact human evidence', async () => {
    const production = loadQualityGateProduction();
    const root = createTempDirectory();
    const bootstrapExpectedSelfSha256 = installCliPreflight(root);
    const stdout = new TextBuffer();
    const stderr = new TextBuffer();
    const runner = new RecordingRunner([
      failedResult(23, 'formal stdout', 'formal stderr'),
    ]);

    const exitCode = await production.runQualityGateCli(fullArgs(root), {
      cwd: root,
      platform: 'win32',
      environment: process.env,
      bootstrapExpectedSelfSha256,
      stdout,
      stderr,
      now: () => '2026-08-05T12:00:00.000Z',
      runId: 'failed-cli-run',
      processRunner: runner,
    });

    expect(exitCode).toBe(23);
    expect(runner.calls).toHaveLength(1);
    expect(stdout.value).toContain('formal stdout');
    expect(stderr.value).toContain('formal stderr');
    expect(
      fs.existsSync(path.join(root, 'reports', 'quality-gate-report.json')),
    ).toBe(true);
  });

  it.each([
    {
      result: successResult({
        exitCode: null,
        signal: 'SIGTERM',
        timedOut: true,
        timeoutSource: 'deadline',
        stderr: 'timed out',
      }),
      expectedExit: 124,
    },
    {
      result: successResult({
        exitCode: null,
        signal: 'SIGINT',
        stderr: 'aborted',
      }),
      expectedExit: 130,
    },
  ])('maps timeout/signal evidence to exit $expectedExit', async fixture => {
    const production = loadQualityGateProduction();
    const root = createTempDirectory();
    const bootstrapExpectedSelfSha256 = installCliPreflight(root);
    const stdout = new TextBuffer();
    const stderr = new TextBuffer();
    const runner = new RecordingRunner([fixture.result]);

    const exitCode = await production.runQualityGateCli(fullArgs(root), {
      cwd: root,
      platform: 'win32',
      environment: process.env,
      bootstrapExpectedSelfSha256,
      stdout,
      stderr,
      now: () => '2026-08-05T12:00:00.000Z',
      runId: 'signal-cli-run',
      processRunner: runner,
    });

    expect(exitCode).toBe(fixture.expectedExit);
    expect(runner.calls).toHaveLength(1);
    expect(stderr.value).toContain(fixture.result.stderr);
    const reportDirectory = path.join(root, 'reports');
    const machine = readJsonRecord(
      path.join(reportDirectory, 'quality-gate-report.json'),
    );
    expect(machine).toMatchObject({
      status: 'failed',
      stages: [
        {
          id: 'formal-tests',
          status: 'failed',
          result: {
            exitCode: fixture.result.exitCode,
            signal: fixture.result.signal,
            timedOut: fixture.result.timedOut,
            timeoutSource: fixture.result.timeoutSource,
          },
        },
      ],
      failure: {
        stageId: 'formal-tests',
        exitCode: fixture.result.exitCode,
        signal: fixture.result.signal,
        timedOut: fixture.result.timedOut,
        timeoutSource: fixture.result.timeoutSource,
      },
    });
    const summary = fs.readFileSync(
      path.join(reportDirectory, 'quality-gate-summary.txt'),
      'utf8',
    );
    expect(summary).toContain('exitCode: ' + String(fixture.result.exitCode));
    expect(summary).toContain('signal: ' + String(fixture.result.signal));
    expect(summary).toContain('timedOut: ' + String(fixture.result.timedOut));
    expect(summary).toContain(
      'timeoutSource: ' + String(fixture.result.timeoutSource),
    );
    expect(fs.readdirSync(reportDirectory).sort()).toEqual([
      'quality-gate-report.json',
      'quality-gate-summary.txt',
    ]);
  });

  it('routes default pnpm test and the full quality script through V2', () => {
    const packageJson = readJsonRecord(
      path.join(projectRoot(), 'package.json'),
    );
    const scripts = packageJson.scripts;
    if (
      typeof scripts !== 'object' ||
      scripts === null ||
      Array.isArray(scripts) ||
      !('test' in scripts)
    ) {
      throw new Error('QUALITY_GATE_V2_PACKAGE_SCRIPTS_REQUIRED');
    }

    expect(scripts).toMatchObject({
      test: 'node scripts/quality-gate-v2/cli.cjs test',
      'quality:gate': 'node scripts/quality-gate-v2/cli.cjs full',
    });
    expect(scripts.test).not.toBe('jest');
  });

  it('locks the complete accepted manifest/root inventory in the real registry', async () => {
    const production = loadQualityGateProduction();
    const root = projectRoot();
    const registryPath = path.join(
      root,
      'quality-gate.acceptance.json',
    );
    const expectedManifests = [
      'GAP_P0_01A_LOCK.sha256',
      'GAP_P0_02A_LOCK.sha256',
      'GAP_P0_02B_LOCK.sha256',
      'NATIVE_REVIEW_LOCK.sha256',
      'NATIVE_SCAFFOLD_LOCK.sha256',
      'PHASE4_LOCK.sha256',
      'PHASE4_REVIEW_LOCK.sha256',
      'PHASE4_REVIEW2_LOCK.sha256',
      'PHASE4_REVIEW3_LOCK.sha256',
      'PHASE4_REVIEW4_LOCK.sha256',
      'PHASE4_REVIEW5_LOCK.sha256',
      'QUALITY_GATE_V2_LOCK.sha256',
      'REVIEW1_LOCK.sha256',
      'REVIEW2_LOCK.sha256',
      'REVIEW3_LOCK.sha256',
      'REVIEW4_LOCK.sha256',
      'TEST_LOCK.sha256',
    ].sort();
    const expectedRoots = [
      'tests/gap-p0-01a',
      'tests/gap-p0-02a',
      'tests/gap-p0-02b',
      'tests/locked',
      'tests/native-review',
      'tests/native-scaffold',
      'tests/phase4',
      'tests/phase4-review',
      'tests/phase4-review2',
      'tests/phase4-review3',
      'tests/phase4-review4',
      'tests/phase4-review5',
      'tests/quality-gate-v2',
      'tests/review1',
      'tests/review2',
      'tests/review3',
      'tests/review4',
    ].sort();

    await expect(
      production.discoverAcceptedTestRoots({
        projectRoot: root,
        registryPath,
      }),
    ).resolves.toEqual(expectedRoots);
    await expect(
      production.validateLockManifests({
        projectRoot: root,
        registryPath,
      }),
    ).resolves.toEqual({
      validatedManifests: 17,
      entries: 116,
      acceptedTestRoots: expectedRoots,
      acceptedManifests: expectedManifests,
      excludedManifests: [
        {manifest: 'QUALITY_GATE_LOCK.sha256', status: 'rejected'},
      ],
    });

    const registry = readJsonRecord(registryPath);
    expect(JSON.stringify(registry)).toContain(
      '5f2dfc85fc0fbabdf1f2e9546fb6536fcc353fc3437a14233ea2be33571189a0',
    );
    const roots = await production.discoverAcceptedTestRoots({
      projectRoot: root,
      registryPath,
    });
    expect(roots).toContain('tests/review1');
    expect(roots).toContain('tests/quality-gate-v2');
    expect(roots).not.toContain('tests/quality-gate');
    expect(roots).not.toContain('tests/gap-p0-02b-review1');
  });
});
