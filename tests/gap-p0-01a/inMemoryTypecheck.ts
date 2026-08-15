import type {
  CompilerHost,
  CompilerOptions,
  Diagnostic,
} from 'typescript';

declare const __dirname: string;

type TypeScriptApi = typeof import('typescript');

type PathApi = {
  resolve(...paths: string[]): string;
};

const ts = jest.requireActual<TypeScriptApi>('typescript');
const path = jest.requireActual<PathApi>('path');

export type ContractDiagnostic = {
  code: number;
  message: string;
  fileName: string | null;
  line: number | null;
  character: number | null;
};

export type ContractCompilation = {
  contractName: string;
  diagnostics: ContractDiagnostic[];
  emittedFileCount: number;
};

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function canonicalPath(fileName: string): string {
  return path.resolve(fileName).toLocaleLowerCase('en-US');
}

function diagnosticRecord(diagnostic: Diagnostic): ContractDiagnostic {
  const position =
    diagnostic.file === undefined || diagnostic.start === undefined
      ? null
      : diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);

  return {
    code: diagnostic.code,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    fileName: diagnostic.file?.fileName ?? null,
    line: position === null ? null : position.line + 1,
    character: position === null ? null : position.character + 1,
  };
}

export function compileContract(
  contractName: string,
  source: string,
): ContractCompilation {
  if (!/^[a-z0-9-]+$/.test(contractName)) {
    throw new Error('INVALID_TEST_CONTRACT_NAME');
  }

  const virtualFileName = path.resolve(
    PROJECT_ROOT,
    'tests',
    'gap-p0-01a',
    '__virtual__',
    `${contractName}.ts`,
  );
  const virtualIdentity = canonicalPath(virtualFileName);
  const options: CompilerOptions = {
    exactOptionalPropertyTypes: true,
    forceConsistentCasingInFileNames: true,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    noEmit: true,
    noUncheckedIndexedAccess: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    types: [],
  };
  const baseHost = ts.createCompilerHost(options, true);
  let emittedFileCount = 0;

  const host: CompilerHost = {
    ...baseHost,
    fileExists(fileName) {
      return (
        canonicalPath(fileName) === virtualIdentity ||
        baseHost.fileExists(fileName)
      );
    },
    readFile(fileName) {
      return canonicalPath(fileName) === virtualIdentity
        ? source
        : baseHost.readFile(fileName);
    },
    getSourceFile(
      fileName,
      languageVersion,
      onError,
      shouldCreateNewSourceFile,
    ) {
      if (canonicalPath(fileName) === virtualIdentity) {
        return ts.createSourceFile(
          virtualFileName,
          source,
          languageVersion,
          true,
          ts.ScriptKind.TS,
        );
      }
      return baseHost.getSourceFile(
        fileName,
        languageVersion,
        onError,
        shouldCreateNewSourceFile,
      );
    },
    writeFile() {
      emittedFileCount += 1;
    },
  };

  const program = ts.createProgram({
    rootNames: [virtualFileName],
    options,
    host,
  });
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error)
    .map(diagnosticRecord);

  return {contractName, diagnostics, emittedFileCount};
}

export function diagnosticCodes(
  compilation: ContractCompilation,
): number[] {
  return compilation.diagnostics.map(diagnostic => diagnostic.code);
}

export function diagnosticReport(
  compilation: ContractCompilation,
): string {
  return compilation.diagnostics
    .map(diagnostic => {
      const location =
        diagnostic.fileName === null
          ? '<global>'
          : `${diagnostic.fileName}:${String(diagnostic.line)}:${String(
              diagnostic.character,
            )}`;
      return `TS${String(diagnostic.code)} ${location} ${diagnostic.message}`;
    })
    .join('\n');
}
