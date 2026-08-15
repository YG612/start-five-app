import type {FocusSessionTransaction} from '../../src/data/focusSessionRepository';
import {
  createFocusSessionRepository,
  DEFAULT_FOCUS_SESSION_STORAGE_KEY,
} from '../../src/data/focusSessionRepository';
import {createPersistentFocusSessionStorage} from '../../src/data/persistentFocusSessionStorage';
import {
  completedSession,
  errorCause,
  expectRejectCode,
  Review1Backend,
  Review1SentinelError,
} from './review1TestKit';

function requireLeaked(
  transaction: FocusSessionTransaction | undefined,
): FocusSessionTransaction {
  if (transaction === undefined) {
    throw new Error('GAP_P0_02B_REVIEW1_TRANSACTION_NOT_CAPTURED');
  }
  return transaction;
}

async function invokeEveryMethodAfterCallback(
  transaction: FocusSessionTransaction,
) {
  const late = completedSession(
    'focus-late-surface',
    'task-late',
    '2026-08-05T12:00:00.000Z',
  );
  return Promise.allSettled([
    transaction.load(),
    transaction.list(),
    transaction.get('focus-first'),
    transaction.save(late),
  ]);
}

function expectEveryMethodExpired(
  outcomes: readonly PromiseSettledResult<unknown>[],
): void {
  expect(outcomes).toHaveLength(4);
  for (const outcome of outcomes) {
    expect(outcome).toMatchObject({
      status: 'rejected',
      reason: {code: 'FOCUS_SESSION_REPOSITORY_TRANSACTION_EXPIRED'},
    });
  }
}

describe('GAP-P0-02B Review1 transaction callback lifetime', () => {
  it('expires all leaked methods before a successful commit is released', async () => {
    const backend = new Review1Backend();
    const repository = createFocusSessionRepository(
      createPersistentFocusSessionStorage(backend),
    );
    const first = completedSession('focus-first', 'task-first');
    const writeBarrier = backend.blockNextWriteBeforeEffect();
    let leaked: FocusSessionTransaction | undefined;
    let operationSettled = false;

    const operation = repository.transaction(async transaction => {
      leaked = transaction;
      await transaction.save(first);
      return 'callback-result';
    });
    operation.then(
      () => {
        operationSettled = true;
      },
      () => {
        operationSettled = true;
      },
    );

    await writeBarrier.entered;
    expect(operationSettled).toBe(false);
    const outcomes = await invokeEveryMethodAfterCallback(requireLeaked(leaked));
    writeBarrier.release();

    await expect(operation).resolves.toBe('callback-result');
    expectEveryMethodExpired(outcomes);
    const expected = [first];
    expect(JSON.parse(backend.raw(DEFAULT_FOCUS_SESSION_STORAGE_KEY) ?? '')).toEqual({
      schema: 'start-five.focus-sessions',
      version: 1,
      sessions: expected,
    });
    await expect(repository.load()).resolves.toEqual(expected);
    const fresh = createFocusSessionRepository(
      createPersistentFocusSessionStorage(backend.fork()),
    );
    await expect(fresh.load()).resolves.toEqual(expected);
    expect(backend.writes).toHaveLength(1);
  });

  it('expires all leaked methods during a failing commit and then recovers the queue', async () => {
    const backend = new Review1Backend();
    const repository = createFocusSessionRepository(
      createPersistentFocusSessionStorage(backend),
    );
    const first = completedSession('focus-failed-first', 'task-first');
    const recovery = completedSession(
      'focus-after-failure',
      'task-recovery',
      '2026-08-05T13:00:00.000Z',
    );
    const writeFailure = new Review1SentinelError('COMMIT_FAILURE_SENTINEL');
    const writeBarrier = backend.blockNextWriteBeforeEffect(writeFailure);
    let leaked: FocusSessionTransaction | undefined;

    const operation = repository.transaction(async transaction => {
      leaked = transaction;
      await transaction.save(first);
    });

    await writeBarrier.entered;
    const outcomes = await invokeEveryMethodAfterCallback(requireLeaked(leaked));
    writeBarrier.release();
    const exposed = await expectRejectCode(
      operation,
      'FOCUS_SESSION_STORAGE_WRITE_FAILED',
    );

    expect(errorCause(exposed)).toBe(writeFailure);
    expectEveryMethodExpired(outcomes);
    expect(backend.raw(DEFAULT_FOCUS_SESSION_STORAGE_KEY)).toBeNull();
    await expect(repository.load()).resolves.toEqual([]);

    await expect(repository.save(recovery)).resolves.toEqual(recovery);
    expect(JSON.parse(backend.raw(DEFAULT_FOCUS_SESSION_STORAGE_KEY) ?? '')).toEqual({
      schema: 'start-five.focus-sessions',
      version: 1,
      sessions: [recovery],
    });
    await expect(repository.load()).resolves.toEqual([recovery]);
    const fresh = createFocusSessionRepository(
      createPersistentFocusSessionStorage(backend.fork()),
    );
    await expect(fresh.load()).resolves.toEqual([recovery]);
    expect(backend.writes).toHaveLength(2);
  });
});
