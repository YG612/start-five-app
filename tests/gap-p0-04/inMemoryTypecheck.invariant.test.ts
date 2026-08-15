import {
  compileContract,
  diagnosticCodes,
  diagnosticReport,
} from './inMemoryTypecheck';

describe('GAP-P0-04 real-filesystem TypeScript compiler-host controls', () => {
  it('resolves the real TSX app composition with React JSX and zero diagnostics', () => {
    const compilation = compileContract(
      'p0-04-real-start-five-app-positive',
      `
        import type {StartFiveAppComposition} from '../../../src/app/startFiveApp';
        declare const app: StartFiveAppComposition;
        void app;
      `,
    );

    expect(diagnosticReport(compilation)).toBe('');
    expect(compilation.diagnostics).toEqual([]);
    expect(diagnosticCodes(compilation)).not.toContain(6142);
    expect(compilation.emittedFileCount).toBe(0);
  });

  it('does not shadow a nonexistent production module', () => {
    const compilation = compileContract(
      'p0-04-real-filesystem-missing-module-control',
      `
        import type {MissingControl} from '../../../src/app/p0-04-harness-missing-control';
        declare const value: MissingControl;
        void value;
      `,
    );

    expect(diagnosticCodes(compilation)).toEqual([2307]);
    expect(compilation.diagnostics[0]?.message).toContain(
      "Cannot find module '../../../src/app/p0-04-harness-missing-control'",
    );
    expect(compilation.emittedFileCount).toBe(0);
  });

  it('reports a real semantic type error without suppressing diagnostics', () => {
    const compilation = compileContract(
      'p0-04-real-semantic-negative-control',
      `
        const value: string = 42;
        void value;
      `,
    );

    expect(diagnosticCodes(compilation)).toEqual([2322]);
    expect(compilation.diagnostics[0]?.message).toContain(
      "Type 'number' is not assignable to type 'string'",
    );
    expect(compilation.emittedFileCount).toBe(0);
  });
});
