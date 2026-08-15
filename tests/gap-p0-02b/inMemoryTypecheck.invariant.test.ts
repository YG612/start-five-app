import {
  compileContract,
  diagnosticCodes,
  diagnosticReport,
} from './inMemoryTypecheck';

describe('GAP-P0-02B real CompilerHost controls', () => {
  it('accepts an isolated exact structural proof with no emitted file', () => {
    const compilation = compileContract(
      'harness-positive',
      `
        type Assert<T extends true> = T;
        type Equal<A, B> =
          (<T>() => T extends A ? 1 : 2) extends
          (<T>() => T extends B ? 1 : 2)
            ? true
            : false;
        type Proof = Assert<Equal<{value: string}, {value: string}>>;
        const proof: Proof = true;
        void proof;
      `,
    );

    expect(diagnosticReport(compilation)).toBe('');
    expect(compilation.diagnostics).toEqual([]);
    expect(compilation.emittedFileCount).toBe(0);
  });

  it('reports the exact diagnostic for a known invalid assignment', () => {
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
