export const REQUIRED_UNIT_ROOTS = Object.freeze([
  'tests/locked',
  'tests/phase4',
  'tests/phase4-review',
  'tests/quality-gate',
  'tests/review1',
  'tests/review2',
  'tests/review3',
  'tests/review4',
]);

export const REQUIRED_FORMAL_LOCK_FILES = Object.freeze([
  'PHASE4_LOCK.sha256',
  'PHASE4_REVIEW_LOCK.sha256',
  'QUALITY_GATE_LOCK.sha256',
  'REVIEW1_LOCK.sha256',
  'REVIEW2_LOCK.sha256',
  'REVIEW3_LOCK.sha256',
  'REVIEW4_LOCK.sha256',
  'TEST_LOCK.sha256',
]);

export type QualityResponsibility = 'unit' | 'typecheck' | 'locks';

export interface ResolvedScript {
  readonly aliases: readonly string[];
  readonly terminals: readonly string[];
}

function splitFailFastStages(command: string, scriptName: string): string[] {
  if (/\r|\n|;|\|/.test(command) || /(^|[^&])&($|[^&])/.test(command)) {
    throw new Error(
      `QUALITY_SCRIPT_UNSAFE_OPERATOR: ${scriptName} must compose stages only with &&`,
    );
  }

  const stages = command
    .split(/\s*&&\s*/u)
    .map(stage => stage.trim())
    .filter(stage => stage.length > 0);
  if (stages.length === 0) {
    throw new Error(`QUALITY_SCRIPT_EMPTY: ${scriptName}`);
  }
  return stages;
}

function referencedScript(stage: string): string | null {
  const match = stage.match(
    /^(?:pnpm|npm|yarn)(?:\.cmd)?\s+(?:run\s+)?([A-Za-z0-9:_-]+)$/u,
  );
  return match?.[1] ?? null;
}

export function resolveScript(
  scripts: Readonly<Record<string, string>>,
  entry: string,
): ResolvedScript {
  const active = new Set<string>();
  const aliases: string[] = [];
  const terminals: string[] = [];

  const visit = (scriptName: string): void => {
    const command = scripts[scriptName];
    if (command === undefined) {
      throw new Error(`QUALITY_SCRIPT_MISSING: ${scriptName}`);
    }
    if (active.has(scriptName)) {
      throw new Error(`QUALITY_SCRIPT_CYCLE: ${scriptName}`);
    }

    active.add(scriptName);
    aliases.push(scriptName);
    for (const stage of splitFailFastStages(command, scriptName)) {
      const alias = referencedScript(stage);
      if (alias !== null && scripts[alias] !== undefined) {
        visit(alias);
      } else {
        terminals.push(stage);
      }
    }
    active.delete(scriptName);
  };

  visit(entry);
  return {aliases, terminals};
}

export function commandTokens(command: string): string[] {
  return (
    command.match(/"(?:[^"\\]|\\.)*"|'[^']*'|\S+/gu)?.map(token =>
      token.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/u, '$1$2'),
    ) ?? []
  );
}

function normalizedExecutable(token: string): string {
  return token.replace(/\\/gu, '/').toLowerCase();
}

function hasExecutable(tokens: readonly string[], executable: string): boolean {
  return tokens.some(token => {
    const normalized = normalizedExecutable(token);
    return (
      normalized === executable ||
      normalized === `${executable}.cmd` ||
      normalized.endsWith(`/${executable}`) ||
      normalized.endsWith(`/${executable}.cmd`)
    );
  });
}

export function classifyTerminal(
  command: string,
): QualityResponsibility | null {
  const tokens = commandTokens(command);
  if (hasExecutable(tokens, 'jest')) {
    return 'unit';
  }
  if (hasExecutable(tokens, 'tsc') && tokens.includes('--noEmit')) {
    return 'typecheck';
  }
  if (
    tokens.some(token =>
      normalizedExecutable(token).endsWith('/scripts/verifytestlocks.cjs'),
    )
  ) {
    return 'locks';
  }
  return null;
}

export function extractUnitRoots(command: string): string[] {
  const roots = new Set<string>();
  for (const token of commandTokens(command)) {
    const candidate = token.startsWith('--roots=')
      ? token.slice('--roots='.length)
      : token;
    const normalized = candidate
      .replace(/\\/gu, '/')
      .replace(/^\.\//u, '')
      .replace(/\/+$/u, '');
    if (normalized.startsWith('tests/')) {
      roots.add(normalized);
    }
  }
  return [...roots].sort();
}

export function responsibilitySet(
  resolved: ResolvedScript,
): ReadonlySet<QualityResponsibility> {
  const responsibilities = new Set<QualityResponsibility>();
  for (const command of resolved.terminals) {
    const responsibility = classifyTerminal(command);
    if (responsibility !== null) {
      responsibilities.add(responsibility);
    }
  }
  return responsibilities;
}

