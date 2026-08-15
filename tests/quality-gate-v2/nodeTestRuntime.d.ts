/**
 * Minimal Node runtime declarations used only by the QUALITY-GATE-V2 tests.
 *
 * The application deliberately does not opt into the global Node type set.
 * Keeping this strict subset beside the tests lets the real Node fixtures run
 * without changing the product tsconfig or exposing Node APIs to production.
 */

declare const __dirname: string;

declare const process: Readonly<{
  env: Readonly<Record<string, string | undefined>>;
  execPath: string;
}>;

interface AbortController {
  abort(reason?: string): void;
}

declare module 'node:crypto' {
  type Hash = {
    update(value: string, encoding: 'utf8'): Hash;
    digest(encoding: 'hex'): string;
  };

  export function createHash(algorithm: 'sha256'): Hash;
}

declare module 'node:child_process' {
  type ChildData = {
    toString(encoding: 'utf8'): string;
  };

  type ChildReadable = {
    on(event: 'data', listener: (chunk: ChildData) => void): ChildReadable;
  };

  type SpawnedChild = {
    readonly stdout: ChildReadable;
    readonly stderr: ChildReadable;
    kill(signal: 'SIGTERM'): boolean;
    on(event: 'error', listener: (error: Error) => void): SpawnedChild;
    on(
      event: 'close',
      listener: (exitCode: number | null, signal: string | null) => void,
    ): SpawnedChild;
  };

  type SpawnOptions = Readonly<{
    cwd: string;
    env: Readonly<Record<string, string | undefined>>;
    windowsHide: true;
    stdio: readonly ['ignore', 'pipe', 'pipe'];
  }>;

  export function spawn(
    executable: string,
    args: readonly string[],
    options: SpawnOptions,
  ): SpawnedChild;
}

declare module 'node:fs' {
  type FsWatcher = {
    close(): void;
  };

  export function existsSync(filePath: string): boolean;
  export function mkdirSync(
    directoryPath: string,
    options: Readonly<{recursive: true}>,
  ): string | undefined;
  export function mkdtempSync(prefix: string): string;
  export function readFileSync(filePath: string, encoding: 'utf8'): string;
  export function readdirSync(directoryPath: string): string[];
  export function rmSync(
    targetPath: string,
    options: Readonly<{recursive: true; force: true}>,
  ): void;
  export function symlinkSync(
    targetPath: string,
    linkPath: string,
    type: 'junction',
  ): void;
  export function watch(
    directoryPath: string,
    listener: (
      eventType: 'change' | 'rename',
      fileName: string | null,
    ) => void,
  ): FsWatcher;
  export function writeFileSync(
    filePath: string,
    content: string,
    encoding: 'utf8',
  ): void;
}

declare module 'node:os' {
  export function tmpdir(): string;
}

declare module 'node:path' {
  type PathApi = Readonly<{
    basename(filePath: string): string;
    dirname(filePath: string): string;
    join(...parts: string[]): string;
    resolve(...parts: string[]): string;
  }>;

  export function basename(filePath: string): string;
  export function dirname(filePath: string): string;
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
  export const win32: PathApi;
}
