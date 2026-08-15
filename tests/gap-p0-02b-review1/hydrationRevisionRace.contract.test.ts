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

function sharedRepositories(backend: Review1Backend) {
  const storage = createPersistentFocusSessionStorage(backend);
  return {
    repositoryA: createFocusSessionRepository(storage),
    repositoryB: createFocusSessionRepository(storage),
  };
}

describe('GAP-P0-02B Review1 hydration revision race', () => {
  it('re-reads bytes when another facade commits after an old read was captured', async () => {
    const backend = new Review1Backend();
    const {repositoryA, repositoryB} = sharedRepositories(backend);
    const fromB = completedSession('focus-from-b', 'task-b');
    const directFromA = completedSession(
      'focus-direct-a',
      'task-a',
      '2026-08-05T09:00:00.000Z',
    );
    const transactionFromA = completedSession(
      'focus-transaction-a',
      'task-a',
      '2026-08-05T10:00:00.000Z',
    );

    await expect(repositoryB.load()).resolves.toEqual([]);
    const oldReadBarrier = backend.blockNextReadAfterCapture();
    const racedHydration = repositoryA.load();
    await oldReadBarrier.entered;

    await expect(repositoryB.save(fromB)).resolves.toEqual(fromB);
    expect(backend.actions).toEqual(['get', 'get', 'set']);
    oldReadBarrier.release();

    await expect(racedHydration).resolves.toEqual([fromB]);
    await expect(repositoryA.list(fromB.taskId)).resolves.toEqual([fromB]);
    await expect(repositoryA.get(fromB.id)).resolves.toEqual(fromB);
    expect(backend.actions).toEqual(['get', 'get', 'set', 'get']);

    await expect(repositoryA.save(directFromA)).resolves.toEqual(directFromA);
    await expect(
      repositoryA.transaction(transaction =>
        transaction.save(transactionFromA),
      ),
    ).resolves.toEqual(transactionFromA);

    const expected = [fromB, directFromA, transactionFromA];
    expect(backend.actions).toEqual([
      'get',
      'get',
      'set',
      'get',
      'set',
      'set',
    ]);
    expect(JSON.parse(backend.raw(DEFAULT_FOCUS_SESSION_STORAGE_KEY) ?? '')).toEqual({
      schema: 'start-five.focus-sessions',
      version: 1,
      sessions: expected,
    });
    await expect(repositoryA.load()).resolves.toEqual(expected);
    await expect(repositoryB.load()).resolves.toEqual(expected);
    await expect(repositoryB.get(transactionFromA.id)).resolves.toEqual(
      transactionFromA,
    );
  });

  it('does not publish stale cache when the mandatory re-read fails and the mutation queue recovers', async () => {
    const backend = new Review1Backend();
    const {repositoryA, repositoryB} = sharedRepositories(backend);
    const fromB = completedSession('focus-race-b', 'task-race');
    const recovered = completedSession(
      'focus-recovered-a',
      'task-recovered',
      '2026-08-05T11:00:00.000Z',
    );

    await expect(repositoryB.load()).resolves.toEqual([]);
    const oldReadBarrier = backend.blockNextReadAfterCapture();
    const racedHydration = repositoryA.load();
    await oldReadBarrier.entered;
    await repositoryB.save(fromB);

    const readFailure = new Review1SentinelError('REHYDRATE_READ_SENTINEL');
    backend.failNextRead(readFailure);
    oldReadBarrier.release();
    const exposed = await expectRejectCode(
      racedHydration,
      'FOCUS_SESSION_STORAGE_READ_FAILED',
    );
    expect(errorCause(exposed)).toBe(readFailure);

    await expect(
      repositoryA.transaction(transaction => transaction.save(recovered)),
    ).resolves.toEqual(recovered);
    const expected = [fromB, recovered];
    expect(backend.actions).toEqual([
      'get',
      'get',
      'set',
      'get',
      'get',
      'set',
    ]);
    expect(JSON.parse(backend.raw(DEFAULT_FOCUS_SESSION_STORAGE_KEY) ?? '')).toEqual({
      schema: 'start-five.focus-sessions',
      version: 1,
      sessions: expected,
    });
    await expect(repositoryA.list()).resolves.toEqual(expected);
    await expect(repositoryA.get(fromB.id)).resolves.toEqual(fromB);
    await expect(repositoryB.load()).resolves.toEqual(expected);
  });
});
