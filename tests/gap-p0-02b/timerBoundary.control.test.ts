import {createFocusSessionService} from '../../src/application/focusSessionService';
import {createDefaultCoreFlowTimerController} from '../../src/screens/CoreFlowScreen';
import {
  createServiceHarness,
  input,
  ManualIsoClock,
  SequenceIdGenerator,
  TransactionalMemoryFocusRepository,
} from './focusSessionTestKit';

const MICROTASK_ROUNDS = 12;

async function drainMicrotasks(): Promise<void> {
  for (let round = 0; round < MICROTASK_ROUNDS; round += 1) {
    await Promise.resolve();
  }
}

describe('GAP-P0-02B timer ownership and CoreFlow integration boundary', () => {
  it('keeps focus service construction side-effect free through deferred microtasks', async () => {
    const repository = new TransactionalMemoryFocusRepository();
    const clock = new ManualIsoClock();
    const ids = new SequenceIdGenerator();

    const service = createFocusSessionService({
      repository,
      now: clock.now,
      idGenerator: ids.next,
    });
    expect(Object.keys(service).sort()).toEqual([
      'finish',
      'getActive',
      'getById',
      'interrupt',
      'listForTask',
      'restore',
      'start',
    ]);
    await drainMicrotasks();

    expect(repository.counters).toEqual({
      facadeLoad: 0,
      facadeList: 0,
      facadeGet: 0,
      facadeSave: 0,
      transactions: 0,
      transactionLoad: 0,
      transactionList: 0,
      transactionGet: 0,
      transactionSave: 0,
      commits: 0,
    });
    expect({clock: clock.calls, ids: ids.calls}).toEqual({clock: 0, ids: 0});
  });

  it('uses the injected wall clock for persisted behavior without owning timers or scheduler handles', async () => {
    const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout');
    const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');
    const setIntervalSpy = jest.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = jest.spyOn(globalThis, 'clearInterval');
    const {service, clock} = createServiceHarness();
    const controller = createDefaultCoreFlowTimerController();

    const started = await service.start(input('task-timer-boundary', 2));
    clock.set('2026-08-05T08:01:00.000Z');
    const interrupted = await service.interrupt(started.id, 'manual stop');
    await service.getById(started.id);
    await service.listForTask(started.taskId);
    await service.getActive();
    await service.restore();

    expect(interrupted).toMatchObject({
      status: 'interrupted',
      actualSeconds: 60,
    });
    expect(controller.getSnapshot()).toEqual({
      state: 'idle',
      durationMs: 300_000,
      remainingMs: 300_000,
    });
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    expect(clearTimeoutSpy).not.toHaveBeenCalled();
    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(clearIntervalSpy).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('reconciles a background-sized wall-clock gap exactly once without double counting', async () => {
    const {service, repository, clock} = createServiceHarness();
    const started = await service.start(input('task-background', 5));
    const writesAfterStart = repository.counters.commits;

    clock.set('2026-08-05T08:04:59.999Z');
    await expect(service.restore()).resolves.toEqual(started);
    expect(repository.counters.commits).toBe(writesAfterStart);

    clock.set('2026-08-05T08:45:00.000Z');
    await expect(service.restore()).resolves.toBeNull();
    const afterDeadline = repository.snapshot()[0];
    expect(afterDeadline).toMatchObject({
      status: 'completed',
      endedAt: started.plannedEndAt,
      actualSeconds: 300,
    });
    expect(repository.counters.commits).toBe(writesAfterStart + 1);

    const clockCallsBeforeReplay = clock.calls;
    await expect(service.restore()).resolves.toBeNull();
    expect(repository.snapshot()[0]).toEqual(afterDeadline);
    expect(repository.counters.commits).toBe(writesAfterStart + 1);
    expect(clock.calls).toBe(clockCallsBeforeReplay);
  });

  it('keeps the legacy default controller as a five-minute UI clock with no implicit focus-service I/O', () => {
    const repository = new TransactionalMemoryFocusRepository();
    const focusService = createFocusSessionService({
      repository,
      now: new ManualIsoClock().now,
      idGenerator: new SequenceIdGenerator().next,
    });
    const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout');
    const setIntervalSpy = jest.spyOn(globalThis, 'setInterval');

    const controller = createDefaultCoreFlowTimerController();
    expect(controller.getSnapshot()).toEqual({
      state: 'idle',
      durationMs: 300_000,
      remainingMs: 300_000,
    });
    expect(Object.keys(focusService).sort()).toEqual([
      'finish',
      'getActive',
      'getById',
      'interrupt',
      'listForTask',
      'restore',
      'start',
    ]);
    expect(repository.counters.transactions).toBe(0);
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    expect(setIntervalSpy).not.toHaveBeenCalled();

    controller.dispose();
    expect(repository.counters.transactions).toBe(0);
  });
});
