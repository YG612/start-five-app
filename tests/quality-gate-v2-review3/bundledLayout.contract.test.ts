import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  cleanupTempDirectories,
  createWindowsRunner,
  directPnpmRequest,
  discoverCurrentBundledPnpmLayout,
  expectNoExecutionArtifacts,
  installToolFixture,
  snapshotTree,
  windowsIdentity,
} from './qualityGateV2Review3TestKit';

function fileIdentity(filePath: string): Readonly<{
  size: number;
  mtimeMs: number;
  sha256: string;
}> {
  const stat = fs.lstatSync(filePath);
  const text = fs.readFileSync(filePath, 'utf8');
  return {
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    sha256: crypto.createHash('sha256').update(text, 'utf8').digest('hex'),
  };
}

afterEach(() => {
  cleanupTempDirectories();
});

describe('QUALITY-GATE-V2 Review3 current bundled pnpm integration', () => {
  it('dynamically discovers one regular wrapper, current Node, and safe JS companion without an author-machine path', () => {
    const layout = discoverCurrentBundledPnpmLayout();

    expect(path.win32.basename(layout.commandWrapper).toLowerCase()).toBe(
      'pnpm.cmd',
    );
    expect(['.cjs', '.mjs']).toContain(
      path.extname(layout.companion).toLowerCase(),
    );
    expect(windowsIdentity(layout.nodeExecutable)).toBe(
      windowsIdentity(process.execPath),
    );
    for (const filePath of [
      layout.commandWrapper,
      layout.nodeExecutable,
      layout.companion,
    ]) {
      const stat = fs.lstatSync(filePath);
      expect(stat.isFile()).toBe(true);
      expect(stat.isSymbolicLink()).toBe(false);
    }
    expect(path.relative(layout.runtimeRoot, layout.nodeExecutable)).not.toMatch(
      /^\.\.(?:[\\/]|$)/,
    );
    expect(path.relative(layout.runtimeRoot, layout.companion)).not.toMatch(
      /^\.\.(?:[\\/]|$)/,
    );
  });

  it('launches read-only bundled pnpm --version through the safe JS path and leaves runtime plus cwd unchanged', async () => {
    const layout = discoverCurrentBundledPnpmLayout();
    const runtimeBefore = {
      wrapper: fileIdentity(layout.commandWrapper),
      node: fileIdentity(layout.nodeExecutable),
      companion: fileIdentity(layout.companion),
    };
    const fixture = installToolFixture('none');
    const fixtureBefore = snapshotTree(fixture.root);
    const runner = createWindowsRunner(fixture, layout.toolDirectory);
    const request = directPnpmRequest(
      fixture,
      'pnpm',
      ['--version'],
      layout.toolDirectory,
    );

    const result = await runner.run(request);

    expect(result).toMatchObject({
      exitCode: 0,
      signal: null,
      timedOut: false,
      timeoutSource: null,
      stderr: '',
    });
    expect(result.stdout.trim()).toMatch(/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+].*)?$/);
    expectNoExecutionArtifacts(fixture, fixtureBefore);
    expect({
      wrapper: fileIdentity(layout.commandWrapper),
      node: fileIdentity(layout.nodeExecutable),
      companion: fileIdentity(layout.companion),
    }).toEqual(runtimeBefore);
  });
});
