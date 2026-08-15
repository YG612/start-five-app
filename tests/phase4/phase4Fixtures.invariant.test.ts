import {
  requirePhase4Module,
  type Phase4RequireActual,
} from './phase4Fixtures';

function moduleNotFound(message: string): Error & {code: string} {
  return Object.assign(new Error(message), {code: 'MODULE_NOT_FOUND'});
}

function captureThrown(work: () => unknown): unknown {
  try {
    work();
  } catch (error: unknown) {
    return error;
  }
  throw new Error('EXPECTED_FIXTURE_THROW');
}

describe('P4-FIXTURE dynamic contract loader invariants', () => {
  it('wraps only MODULE_NOT_FOUND for the exact requested target module', () => {
    const target = '../../src/data/notImplementedTarget';
    const targetMissing = moduleNotFound(
      `Cannot find module '${target}' from 'tests/phase4/phase4Fixtures.ts'`,
    );
    const loader: Phase4RequireActual = () => {
      throw targetMissing;
    };

    const observed = captureThrown(() =>
      requirePhase4Module(target, 'target contract', loader),
    );

    expect(observed).not.toBe(targetMissing);
    expect(observed).toMatchObject({
      message: expect.stringContaining(
        'PHASE4_IMPLEMENTATION_REQUIRED: target contract',
      ),
    });
  });

  it('rethrows nested dependency, syntax, and top-level failures with exact object identity', () => {
    const requestedTarget = '../../src/data/existingTarget';
    const failures: unknown[] = [
      moduleNotFound(
        "Cannot find module 'nested-production-dependency' from 'src/data/existingTarget.ts'",
      ),
      new SyntaxError('production module syntax failure'),
      {kind: 'TOP_LEVEL_SENTINEL'},
    ];

    for (const failure of failures) {
      const loader: Phase4RequireActual = () => {
        throw failure;
      };
      const observed = captureThrown(() =>
        requirePhase4Module(requestedTarget, 'existing target', loader),
      );

      expect(observed).toBe(failure);
    }
  });
});
