/** Review7-only additions to the project's deliberately minimal Node types. */

declare module 'node:fs' {
  type Review7BigIntStat = Readonly<{
    dev: bigint;
    ino: bigint;
    mode: bigint;
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
  }>;

  export function lstatSync(
    filePath: string,
    options: Readonly<{bigint: true}>,
  ): Review7BigIntStat;
  export function linkSync(existingPath: string, newPath: string): void;
  export function symlinkSync(
    target: string,
    path: string,
    type: 'junction',
  ): void;
}

declare module 'node:child_process' {
  type Review7SpawnOptions = Readonly<{
    cwd: string;
    env: Readonly<Record<string, string | undefined>>;
    shell?: false;
    windowsHide: true;
    stdio: readonly ['pipe', 'pipe', 'pipe'];
  }>;

  export function spawn(
    executable: string,
    args: readonly string[],
    options: Review7SpawnOptions,
  ): SpawnedChild;
}
