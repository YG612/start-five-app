/** Review3-only additions to the project's deliberately minimal Node types. */

declare module 'node:fs' {
  type Review3FileStat = Readonly<{
    size: number;
    mtimeMs: number;
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
  }>;

  export function copyFileSync(sourcePath: string, targetPath: string): void;
  export function linkSync(existingPath: string, newPath: string): void;
  export function lstatSync(filePath: string): Review3FileStat;
  export function readlinkSync(filePath: string): string;
  export function unlinkSync(filePath: string): void;
}

declare module 'node:path' {
  export function extname(filePath: string): string;
  export function isAbsolute(filePath: string): boolean;
  export function relative(from: string, to: string): string;
  export const sep: string;
}
