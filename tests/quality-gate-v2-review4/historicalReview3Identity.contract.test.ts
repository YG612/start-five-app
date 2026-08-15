import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {projectRoot} from './qualityGateV2Review4TestKit';

const REVIEW3_SELF =
  '80e449728730919df121e07733add05c112a288e7ee0896e5f2f36ce26a2e012';

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function inventory(root: string): readonly string[] {
  const base = path.join(root, 'tests', 'quality-gate-v2-review3');
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const name of fs.readdirSync(directory)) {
      const absolute = path.join(directory, name);
      const stat = fs.lstatSync(absolute);
      if (stat.isDirectory()) visit(absolute);
      else if (stat.isFile()) {
        files.push(absolute.substring(root.length + 1).replaceAll('\\', '/'));
      }
    }
  };
  visit(base);
  return ['QUALITY_GATE_V2_REVIEW3_TEST_SPEC.md', ...files.sort()];
}

describe('QUALITY-GATE-V2 Review4 immutable rejected Review3 history', () => {
  it('keeps the rejected nine-entry Review3 identity byte-exact without executing it', () => {
    const root = projectRoot();
    const manifestPath = path.join(root, 'QUALITY_GATE_V2_REVIEW3_LOCK.sha256');
    const bytes = fs.readFileSync(manifestPath, 'utf8');
    const lines = bytes.split('\n').filter(Boolean);
    const listedPaths: string[] = [];

    expect(sha256(bytes)).toBe(REVIEW3_SELF);
    expect(lines).toHaveLength(9);
    for (const line of lines) {
      const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
      expect(match).not.toBeNull();
      const expected = match?.[1] ?? '';
      const relativePath = match?.[2] ?? '';
      listedPaths.push(relativePath);
      expect(sha256(fs.readFileSync(
        path.join(root, ...relativePath.split('/')),
        'utf8',
      ))).toBe(expected);
    }
    expect(listedPaths).toEqual(inventory(root));
  });

  it('retains the independent REVIEW FAILED and NEVER ACCEPTED decision', () => {
    const changelog = fs.readFileSync(
      path.join(projectRoot(), 'QUALITY_GATE_V2_REVIEW3_LOCK_CHANGELOG.md'),
      'utf8',
    );

    expect(changelog).toContain('REVIEW FAILED / NEVER ACCEPTED');
    expect(changelog).toContain(REVIEW3_SELF);
  });
});
