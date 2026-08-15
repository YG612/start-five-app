import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  cleanupTempDirectories,
  fixturePath,
  installSyntheticFixture,
  projectRoot,
  readJsonRecord,
  runRealChild,
  windowsBaseEnvironment,
  type RealChildResult,
  type SyntheticFixture,
} from './qualityGateV2Review2TestKit';

type AmbientMode =
  | 'production'
  | 'oracle-add-key'
  | 'oracle-path-value'
  | 'oracle-path-shape';

type AmbientRun = Readonly<{
  child: RealChildResult;
  evidence: object;
}>;

function field(record: object, key: string): unknown {
  return Reflect.get(record, key);
}

function arrayField(record: object, key: string): readonly unknown[] {
  const value = field(record, key);
  if (!Array.isArray(value)) {
    throw new Error(
      `QUALITY_GATE_V2_REVIEW2_ARRAY_EVIDENCE_REQUIRED: ${key}`,
    );
  }
  return value;
}

function snapshotKeys(snapshot: readonly unknown[]): string[] {
  return snapshot.map(entry => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('QUALITY_GATE_V2_REVIEW2_SNAPSHOT_ENTRY_REQUIRED');
    }
    const key = Reflect.get(entry, 'key');
    if (typeof key !== 'string') {
      throw new Error('QUALITY_GATE_V2_REVIEW2_SNAPSHOT_KEY_REQUIRED');
    }
    return key;
  });
}

function expectStableSnapshot(snapshot: readonly unknown[]): void {
  const keys = snapshotKeys(snapshot);
  expect(keys).toEqual([...keys].sort());
  expect(new Set(keys).size).toBe(keys.length);
}

function expectExactRestoration(evidence: object): void {
  const original = arrayField(evidence, 'original');
  const restored = arrayField(evidence, 'restored');
  expectStableSnapshot(original);
  expectStableSnapshot(restored);
  expect(JSON.stringify(restored)).toBe(JSON.stringify(original));
  expect(arrayField(evidence, 'restoreDiff')).toHaveLength(0);
  expect(field(evidence, 'error')).toBeNull();
}

async function runAmbient(
  fixture: SyntheticFixture,
  mode: AmbientMode,
  pathEntries: Readonly<Record<string, string>>,
): Promise<AmbientRun> {
  const evidencePath = path.join(
    fixture.root,
    `ambient-${mode}-evidence.json`,
  );
  const child = await runRealChild({
    args: [
      fixturePath('ambientProcessEnvironment.cjs'),
      path.join(
        projectRoot(),
        'scripts',
        'quality-gate-v2',
        'cli.cjs',
      ),
      mode,
      evidencePath,
      ...fixture.argv,
    ],
    cwd: fixture.root,
    environment: windowsBaseEnvironment(fixture, pathEntries),
  });
  expect(fs.existsSync(evidencePath)).toBe(true);
  return {child, evidence: readJsonRecord(evidencePath)};
}

function expectProductionAmbientUnchanged(
  evidence: object,
  expectedPathKey: string,
): void {
  const before = arrayField(evidence, 'before');
  const after = arrayField(evidence, 'after');
  expectStableSnapshot(before);
  expectStableSnapshot(after);
  expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  expect(arrayField(evidence, 'diff')).toHaveLength(0);
  expect(field(evidence, 'beforePid')).toBe(field(evidence, 'invocationPid'));
  expect(field(evidence, 'afterPid')).toBe(field(evidence, 'invocationPid'));
  expect(
    snapshotKeys(before).filter(key => key.toUpperCase() === 'PATH'),
  ).toEqual([expectedPathKey]);
  expect(field(evidence, 'error')).toBeNull();
}

afterEach(() => {
  cleanupTempDirectories();
});

describe('QUALITY-GATE-V2 Review2 same-process ambient environment oracle', () => {
  it('keeps the complete ambient environment unchanged while repairing an only-Path production call', async () => {
    const fixture = installSyntheticFixture();
    const pathValue = path.dirname(process.execPath);

    const result = await runAmbient(
      fixture,
      'production',
      {Path: pathValue},
    );

    expectProductionAmbientUnchanged(result.evidence, 'Path');
    expect(field(result.evidence, 'exitCode')).toBe(0);
    expect(result.child.exitCode).toBe(0);
    expect(result.child.signal).toBeNull();
    expect(result.child.stderr).toBe('');
  });

  it('proves the same-process full snapshot is stable for canonical PATH', async () => {
    const fixture = installSyntheticFixture();
    const pathValue = path.dirname(process.execPath);

    const result = await runAmbient(
      fixture,
      'production',
      {PATH: pathValue},
    );

    expectProductionAmbientUnchanged(result.evidence, 'PATH');
    expect(field(result.evidence, 'exitCode')).toBe(0);
    expect(result.child.exitCode).toBe(0);
    expect(result.child.signal).toBeNull();
    expect(result.child.stderr).toBe('');
  });

  it('detects an added key exactly and restores the complete original environment in finally', async () => {
    const fixture = installSyntheticFixture();
    const pathValue = path.dirname(process.execPath);

    const result = await runAmbient(
      fixture,
      'oracle-add-key',
      {PATH: pathValue},
    );

    expect(result.child).toEqual({
      exitCode: 0,
      signal: null,
      stdout: '',
      stderr: '',
    });
    expect(arrayField(result.evidence, 'diff')).toEqual([
      {
        key: 'QUALITY_GATE_V2_REVIEW2_ORACLE_ADDED',
        before: null,
        after: 'review2-added-value',
      },
    ]);
    expectExactRestoration(result.evidence);
  });

  it('detects a PATH value change exactly and restores every original key/value in finally', async () => {
    const fixture = installSyntheticFixture();
    const pathValue = path.dirname(process.execPath);

    const result = await runAmbient(
      fixture,
      'oracle-path-value',
      {PATH: pathValue},
    );

    expect(result.child).toEqual({
      exitCode: 0,
      signal: null,
      stdout: '',
      stderr: '',
    });
    expect(arrayField(result.evidence, 'diff')).toEqual([
      {
        key: 'PATH',
        before: pathValue,
        after: `${pathValue};C:\\review2\\oracle-path-value`,
      },
    ]);
    expectExactRestoration(result.evidence);
  });

  it('detects PATH key-casing shape changes and restores exact key casing in finally', async () => {
    const fixture = installSyntheticFixture();
    const pathValue = path.dirname(process.execPath);

    const result = await runAmbient(
      fixture,
      'oracle-path-shape',
      {PATH: pathValue},
    );

    expect(result.child).toEqual({
      exitCode: 0,
      signal: null,
      stdout: '',
      stderr: '',
    });
    expect(arrayField(result.evidence, 'diff')).toEqual([
      {key: 'PATH', before: pathValue, after: null},
      {key: 'Path', before: null, after: pathValue},
    ]);
    expectExactRestoration(result.evidence);
  });
});

