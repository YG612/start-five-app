/** Review5-only additions to the project's deliberately minimal Node types. */

declare module 'node:child_process' {
  type Review5SpawnOptions = Readonly<{
    cwd: string;
    env: Readonly<Record<string, string | undefined>>;
    shell?: false;
    windowsHide: true;
    stdio: readonly ['pipe', 'pipe', 'pipe'];
  }>;

  export function spawn(
    executable: string,
    args: readonly string[],
    options: Review5SpawnOptions,
  ): SpawnedChild;
}

declare module 'node:fs' {
  type Review5FileStat = Readonly<{
    dev: number | bigint;
    ino: number | bigint;
    mode: number | bigint;
    size: number;
    mtimeMs: number;
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
  }>;

  type Review5Realpath = {
    (filePath: string): string;
    native(filePath: string): string;
  };

  export function lstatSync(
    filePath: string,
    options?: Readonly<{bigint?: boolean}>,
  ): Review5FileStat;
  export const realpathSync: Review5Realpath;
  export function renameSync(oldPath: string, newPath: string): void;
}
