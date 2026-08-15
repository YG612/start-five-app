import {createFocusSessionService} from '../../src/application/focusSessionService';
import {
  expectRejectCode,
  loadPersistentProduction,
  makeSession,
  ManualIsoClock,
  MemoryFocusBackend,
  SequenceIdGenerator,
} from './focusSessionTestKit';

describe('GAP-P0-02B service read-failure behavior over the real persistent repository', () => {
  it.each(['getActive', 'restore', 'getById', 'finish', 'interrupt'])(
    'propagates and retries a durable read failure from %s',
    async method => {
      const production = loadPersistentProduction();
      const durableBackend = new MemoryFocusBackend();
      const writer = production.createRepository(
        production.createStorage(durableBackend),
      );
      const active = makeSession();
      await writer.save(active);
      const rawBefore = durableBackend.raw(production.storageKey);

      const freshBackend = durableBackend.fork();
      freshBackend.failNextRead();
      const repository = production.createRepository(
        production.createStorage(freshBackend),
      );
      const clock = new ManualIsoClock('2026-08-05T08:01:00.000Z');
      const service = createFocusSessionService({
        repository,
        now: clock.now,
        idGenerator: new SequenceIdGenerator(['must-not-consume']).next,
      });
      const invoke = () =>
        method === 'getActive'
          ? service.getActive()
          : method === 'restore'
            ? service.restore()
            : method === 'getById'
              ? service.getById(active.id)
              : method === 'finish'
                ? service.finish(active.id)
                : service.interrupt(active.id, 'retry reason');

      await expectRejectCode(
        invoke(),
        'FOCUS_SESSION_STORAGE_READ_FAILED',
      );
      expect(freshBackend.raw(production.storageKey)).toBe(rawBefore);
      expect(freshBackend.writes).toEqual([]);
      expect(clock.calls).toBe(0);

      const retry = await invoke();
      expect(retry).toMatchObject({id: active.id});
      if (method === 'finish' || method === 'interrupt') {
        expect(retry?.status).not.toBe('running');
        expect(freshBackend.writes).toHaveLength(1);
      } else {
        expect(retry).toEqual(active);
        expect(freshBackend.writes).toEqual([]);
      }
      expect(freshBackend.reads).toEqual([
        production.storageKey,
        production.storageKey,
      ]);
    },
  );
});
