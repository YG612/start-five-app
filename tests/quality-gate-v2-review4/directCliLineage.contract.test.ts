import * as fs from 'node:fs';
import {
  assertDirectCliParent,
  cleanupTemporaryRoots,
  COMPANION_STDOUT_JSON,
  createTemporaryRoot,
  expectedFormalArgs,
  expectedShippedCliStdout,
  installSyntheticProject,
  readCompanionRecord,
  readCompanionRecords,
  spawnFakeDoubleHop,
  spawnShippedCli,
} from './qualityGateV2Review4TestKit';

afterEach(() => {
  cleanupTemporaryRoots();
});

describe('QUALITY-GATE-V2 Review4 direct shipped-CLI process lineage', () => {
  it('proves the final JavaScript companion is a direct child of the shipped CLI process', async () => {
    const fixture = installSyntheticProject();

    const cli = await spawnShippedCli(fixture);

    expect(cli).toMatchObject({exitCode: 0, signal: null, stderr: ''});
    expect(fs.existsSync(fixture.wrapperMarkerPath)).toBe(false);
    const records = readCompanionRecords(fixture.root);
    expect(records).toHaveLength(1);
    expect(new Set(records.map(record => record.pid)).size).toBe(1);
    expect(new Set(records.map(record => record.ppid)).size).toBe(1);
    expect(new Set(records.map(record => JSON.stringify(record.argv))).size).toBe(1);
    const companion = readCompanionRecord(fixture.root);
    expect(cli.stdout).toBe(expectedShippedCliStdout());
    expect(companion.pid).toBeGreaterThan(0);
    expect(companion.ppid).toBe(cli.pid);
    expect(companion.argv).toEqual(expectedFormalArgs());
    expect(companion.cwd).toBe(fixture.root);
    expect(companion.execPath).toBe(process.execPath);
    assertDirectCliParent(cli.pid, companion);
  });

  it('proves the same oracle rejects fake CLI A to intermediate Node B to companion C', async () => {
    const root = createTemporaryRoot();

    const cli = await spawnFakeDoubleHop(root);

    expect(cli).toMatchObject({exitCode: 0, signal: null, stderr: ''});
    expect(cli.stdout).toBe(`${COMPANION_STDOUT_JSON}\n`);
    const records = readCompanionRecords(root);
    expect(records).toHaveLength(1);
    expect(new Set(records.map(record => record.pid)).size).toBe(1);
    expect(new Set(records.map(record => record.ppid)).size).toBe(1);
    expect(new Set(records.map(record => JSON.stringify(record.argv))).size).toBe(1);
    const companion = readCompanionRecord(root);
    expect(companion.pid).toBeGreaterThan(0);
    expect(companion.ppid).not.toBe(cli.pid);
    expect(() => assertDirectCliParent(cli.pid, companion)).toThrow(
      'QUALITY_GATE_REVIEW4_LINEAGE_NOT_DIRECT',
    );
  });
});
