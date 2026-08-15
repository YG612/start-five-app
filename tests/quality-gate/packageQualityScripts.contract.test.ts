import {
  classifyTerminal,
  commandTokens,
  extractUnitRoots,
  REQUIRED_UNIT_ROOTS,
  resolveScript,
  responsibilitySet,
  type QualityResponsibility,
} from './qualityCommandContract';

interface FileSystemLike {
  readFileSync(path: string, encoding: 'utf8'): string;
}

interface PathLike {
  resolve(...parts: string[]): string;
}

interface PackageShape {
  readonly scripts?: unknown;
}

declare const __dirname: string;

const fs = jest.requireActual<FileSystemLike>('fs');
const path = jest.requireActual<PathLike>('path');
const projectRoot = path.resolve(__dirname, '..', '..');

function loadScripts(): Readonly<Record<string, string>> {
  const parsed = JSON.parse(
    fs.readFileSync(path.resolve(projectRoot, 'package.json'), 'utf8'),
  ) as PackageShape;
  expect(parsed.scripts).toBeDefined();
  expect(typeof parsed.scripts).toBe('object');
  expect(parsed.scripts).not.toBeNull();

  const entries = Object.entries(parsed.scripts as Record<string, unknown>);
  expect(entries.length).toBeGreaterThan(0);
  for (const [, command] of entries) {
    expect(typeof command).toBe('string');
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

function sortedResponsibilities(
  values: ReadonlySet<QualityResponsibility>,
): QualityResponsibility[] {
  return [...values].sort();
}

describe('quality command package contract', () => {
  it('makes the default test entry resolve to a complete fail-fast quality pipeline', () => {
    const scripts = loadScripts();
    const defaultRun = resolveScript(scripts, 'test');

    expect(sortedResponsibilities(responsibilitySet(defaultRun))).toEqual([
      'locks',
      'typecheck',
      'unit',
    ]);
    expect(
      defaultRun.terminals.every(command => classifyTerminal(command) !== null),
    ).toBe(true);

    const dedicatedPipelines = Object.keys(scripts)
      .filter(name => name !== 'test')
      .map(name => resolveScript(scripts, name))
      .filter(
        resolved =>
          sortedResponsibilities(responsibilitySet(resolved)).join(',') ===
          'locks,typecheck,unit',
      );
    expect(dedicatedPipelines.length).toBeGreaterThan(0);
  });

  it('runs exactly every accepted suite plus this gate and excludes native candidates', () => {
    const defaultRun = resolveScript(loadScripts(), 'test');
    const unitCommands = defaultRun.terminals.filter(
      command => classifyTerminal(command) === 'unit',
    );

    expect(unitCommands).toHaveLength(1);
    expect(extractUnitRoots(unitCommands[0] ?? '')).toEqual(REQUIRED_UNIT_ROOTS);
    expect(unitCommands[0]).not.toContain('tests/native-scaffold');
  });

  it('keeps unit, typecheck, and lock verification independently executable', () => {
    const scripts = loadScripts();
    const isolatedResponsibilities = new Set<QualityResponsibility>();

    for (const name of Object.keys(scripts).filter(name => name !== 'test')) {
      const resolved = resolveScript(scripts, name);
      const responsibilities = sortedResponsibilities(
        responsibilitySet(resolved),
      );
      if (responsibilities.length === 1 && resolved.terminals.length === 1) {
        isolatedResponsibilities.add(responsibilities[0] as QualityResponsibility);
      }
    }

    expect(sortedResponsibilities(isolatedResponsibilities)).toEqual([
      'locks',
      'typecheck',
      'unit',
    ]);
  });

  it('uses deterministic Windows-compatible Jest and TypeScript commands', () => {
    const defaultRun = resolveScript(loadScripts(), 'test');
    const unitCommand = defaultRun.terminals.find(
      command => classifyTerminal(command) === 'unit',
    );
    const typecheckCommand = defaultRun.terminals.find(
      command => classifyTerminal(command) === 'typecheck',
    );

    expect(unitCommand).toBeDefined();
    expect(commandTokens(unitCommand ?? '')).toEqual(
      expect.arrayContaining(['--runInBand', '--ci', '--coverage=false']),
    );
    expect(typecheckCommand).toBeDefined();
    expect(commandTokens(typecheckCommand ?? '')).toContain('--noEmit');

    for (const command of defaultRun.terminals) {
      expect(command).not.toMatch(/(?:^|\s)(?:bash|sh)(?:\s|$)/iu);
      expect(command).not.toMatch(/\/dev\/|\bexport\s+|\bset\s+[A-Za-z_]+=|\$\{/u);
    }
  });

  it('contains no network, cache-clearing, test-rewrite, or destructive stage', () => {
    const scripts = loadScripts();
    const qualityEntries = Object.keys(scripts).filter(name => {
      const responsibilities = responsibilitySet(resolveScript(scripts, name));
      return responsibilities.size > 0;
    });

    for (const name of qualityEntries) {
      const resolved = resolveScript(scripts, name);
      for (const command of resolved.terminals) {
        expect(command.toLowerCase()).not.toMatch(
          /\b(?:install|add|fetch|curl|wget|invoke-webrequest|clearcache|rimraf|rmdir|del|remove-item|updateSnapshot)\b|--clearcache|--updateSnapshot|(?:^|\s)-u(?:\s|$)|>>?|\b(?:rm)\b/iu,
        );
      }
    }
  });
});

