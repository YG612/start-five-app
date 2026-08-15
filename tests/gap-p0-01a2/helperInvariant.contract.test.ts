import {createTaskRepository} from '../../src/data/taskRepository';
import {
  A2_STORAGE_KEY,
  ControlledTaskStorage,
  ManualWriteBarrier,
  PhysicalTaskBackend,
  SequenceClock,
  SequenceIds,
  StorageFault,
  makeCancelledTask,
  makeDeletedTask,
  makeTask,
} from './a2Fixtures';

describe('GAP-P0-01A2 deterministic helper invariants', () => {
  it('advances scripted clocks and fails loudly after the final instant', () => {
    const clock = new SequenceClock(['first', 'second']);

    expect(clock.now()).toBe('first');
    expect(clock.now()).toBe('second');
    expect(clock.consumed).toBe(2);
    expect(clock.now).toThrow('A2_CLOCK_SEQUENCE_EXHAUSTED');
  });

  it('advances scripted IDs and fails loudly rather than recycling an ID', () => {
    const ids = new SequenceIds(['id-a', 'id-b']);

    expect(ids.next()).toBe('id-a');
    expect(ids.next()).toBe('id-b');
    expect(ids.consumed).toBe(2);
    expect(ids.next).toThrow('A2_ID_SEQUENCE_EXHAUSTED');
  });

  it('releases a manually observed write barrier without timers or polling', async () => {
    const barrier = new ManualWriteBarrier();
    const events: string[] = [];
    const waiting = barrier.wait().then(() => events.push('released'));

    await barrier.started;
    expect(events).toEqual([]);
    barrier.release();
    await waiting;
    expect(events).toEqual(['released']);
  });

  it('keeps injected storage failures one-shot and preserves seeded bytes', async () => {
    const backend = new PhysicalTaskBackend();
    const storage = new ControlledTaskStorage(backend);
    const baseline = makeTask('helper-baseline');
    storage.seedTasks([baseline]);
    const rawBefore = storage.raw();
    storage.failNextGetWith = new StorageFault('A2_TEST_READ_FAILURE');
    const repository = createTaskRepository(storage, A2_STORAGE_KEY);

    await expect(repository.list()).rejects.toMatchObject({
      code: 'A2_TEST_READ_FAILURE',
    });
    await expect(repository.list()).resolves.toEqual([baseline]);
    expect(storage.raw()).toBe(rawBefore);
    expect(storage.setAttempts).toEqual([]);
  });

  it('proves scheduled, due-active, cancelled, and deleted fixture controls are valid snapshots', async () => {
    const backend = new PhysicalTaskBackend();
    const storage = new ControlledTaskStorage(backend);
    const fixtures = [
      makeTask('fixture-equal-schedule-due', {
        startAt: '2026-08-05T10:02:00.000Z',
        dueAt: '2026-08-05T10:02:00.000Z',
      }),
      makeTask('fixture-due-active', {
        startAt: '2026-08-05T08:00:00.000Z',
        dueAt: '2026-08-05T09:00:00.000Z',
      }),
      makeCancelledTask('fixture-cancelled'),
      makeDeletedTask('fixture-deleted'),
    ];
    storage.seedTasks(fixtures);

    await expect(
      createTaskRepository(storage, A2_STORAGE_KEY).list({includeDeleted: true}),
    ).resolves.toEqual(fixtures);
    expect(fixtures[2]).toMatchObject({status: 'cancelled', deletedAt: null});
    expect(fixtures[3]!.deletedAt).not.toBeNull();
  });
});
