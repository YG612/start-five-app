import {
  compileContract,
  diagnosticCodes,
  diagnosticReport,
} from './inMemoryTypecheck';

describe('GAP-P0-01A-A1 in-memory TypeScript compiler harness', () => {
  it('accepts a valid isolated contract without emitting a file', () => {
    const compilation = compileContract(
      'harness-positive',
      `
        type Assert<T extends true> = T;
        type Equal<A, B> =
          (<T>() => T extends A ? 1 : 2) extends
          (<T>() => T extends B ? 1 : 2)
            ? true
            : false;
        type Proof = Assert<Equal<string | null, string | null>>;
        const proof: Proof = true;
        void proof;
      `,
    );

    expect(diagnosticReport(compilation)).toBe('');
    expect(compilation.diagnostics).toEqual([]);
    expect(compilation.emittedFileCount).toBe(0);
  });

  it('detects an isolated negative contract with the real compiler diagnostic', () => {
    const compilation = compileContract(
      'harness-negative',
      `
        const mustBeText: string = 42;
        void mustBeText;
      `,
    );

    expect(diagnosticCodes(compilation)).toEqual([2322]);
    expect(compilation.diagnostics[0]?.message).toContain(
      "Type 'number' is not assignable to type 'string'",
    );
    expect(compilation.emittedFileCount).toBe(0);
  });
});
