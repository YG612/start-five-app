/** Review4-only additions to the project's deliberately minimal Node types. */

declare module 'node:fs' {
  type Review4FileStat = Readonly<{
    size: number;
    mtimeMs: number;
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
  }>;

  export function copyFileSync(sourcePath: string, targetPath: string): void;
  export function linkSync(existingPath: string, newPath: string): void;
  export function lstatSync(filePath: string): Review4FileStat;
  export function renameSync(oldPath: string, newPath: string): void;
  export function unlinkSync(filePath: string): void;
}
