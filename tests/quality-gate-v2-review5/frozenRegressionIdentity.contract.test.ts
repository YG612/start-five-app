import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {projectRoot} from './qualityGateV2Review5TestKit';

const REVIEW4_SELF =
  'a3425a6fd3717cd76a35535ef9f078daf2bcf6a4bfd260e59ae45b6da659c05a';
const REVIEW2_SELF =
  '1c6d556b011f1778b33938bbb6f91d35eaeed959b43bdfad0fd4c7e20a507937';

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function readProject(relativePath: string): string {
  return fs.readFileSync(
    path.join(projectRoot(), ...relativePath.split('/')),
    'utf8',
  );
}

function inventory(relativeRoot: string): readonly string[] {
  const root = projectRoot();
  const start = path.join(root, ...relativeRoot.split('/'));
  const found: string[] = [];
  const visit = (directory: string): void => {
    for (const name of fs.readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const stat = fs.lstatSync(absolute);
      if (stat.isDirectory()) visit(absolute);
      else if (stat.isFile()) {
        found.push(absolute.substring(root.length + 1).replaceAll('\\', '/'));
      }
    }
  };
  visit(start);
  return found.sort();
}

function verifyManifest(
  relativeManifest: string,
  expectedSelf: string,
  expectedEntries?: number,
): readonly string[] {
  const manifest = readProject(relativeManifest);
  expect(sha256(manifest)).toBe(expectedSelf);
  const lines = manifest.split('\n').filter(Boolean);
  if (expectedEntries !== undefined) expect(lines).toHaveLength(expectedEntries);
  const listed: string[] = [];
  for (const line of lines) {
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    expect(match).not.toBeNull();
    const expected = match?.[1] ?? '';
    const relativePath = match?.[2] ?? '';
    listed.push(relativePath);
    expect(sha256(readProject(relativePath))).toBe(expected);
  }
  return listed;
}

describe('QUALITY-GATE-V2 Review5 frozen regression identities', () => {
  it('keeps the independently qualified Review4 candidate and all 12 assets byte-exact', () => {
    const listed = verifyManifest(
      'QUALITY_GATE_V2_REVIEW4_LOCK.sha256.candidate',
      REVIEW4_SELF,
      12,
    );
    expect(listed).toEqual([
      'QUALITY_GATE_V2_REVIEW4_TEST_SPEC.md',
      ...inventory('tests/quality-gate-v2-review4'),
    ]);
  });

  it('keeps the accepted Review2 PATH normalization generation byte-exact', () => {
    verifyManifest('QUALITY_GATE_V2_REVIEW2_LOCK.sha256', REVIEW2_SELF, 8);
  });

  it('keeps production, accepted locks, package, and registry at the authoring baseline', () => {
    expect(sha256(readProject('scripts/quality-gate-v2/index.cjs'))).toBe(
      '45a6e9d3fd0aa742b8c4b14084114835088e71ebe04fbff5ae567978f84a3da2',
    );
    expect(sha256(readProject('QUALITY_GATE_V2_LOCK.sha256'))).toBe(
      '3436439e37e461dc5a1141f61613e67e9eb5566538585bc0a956e2256e44d664',
    );
    expect(sha256(readProject('NATIVE_SCAFFOLD_LOCK.sha256'))).toBe(
      '12958a547ebb739bb0d4dafe7029e3dc6274f9bfef763994afd892b249bb23db',
    );
    expect(sha256(readProject('quality-gate.acceptance.json'))).toBe(
      'd1ca79bae09382942056b233aadf754ca4cf27c98c5ff2841481e6207641f075',
    );
    expect(sha256(readProject('package.json'))).toBe(
      'db3e71219f55e03a27c3af8ed81d34478fa03d662441b4d588793720ceb6ac35',
    );
  });

  it('does not mutate either canonical generated report during test authoring', () => {
    expect(sha256(readProject('quality-reports/quality-gate-report.json'))).toBe(
      'f89ef0ce96c777991180892fda033239ce677b2229bc93d0c5f132e31b08425a',
    );
    expect(sha256(readProject('quality-reports/quality-gate-summary.txt'))).toBe(
      '250c25bc006f102d9c2ffe508a209f81ad38a8432a02d3c99fff31e6d9229e15',
    );
  });
});
