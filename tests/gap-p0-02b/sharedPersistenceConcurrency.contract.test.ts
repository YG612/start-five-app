import {createFocusSessionService} from '../../src/application/focusSessionService';
import {
  expectRejectCode,
  input,
  loadPersistentProduction,
  ManualIsoClock,
  MemoryFocusBackend,
  SequenceIdGenerator,
} from './focusSessionTestKit';

function servicesOverSharedBackend() {
  const production = loadPersistentProduction();
  const backend = new MemoryFocusBackend();
  const repositoryA = production.createRepository(
    production.createStorage(backend),
  );
  const repositoryB = production.createRepository(
    production.createStorage(backend),
  );
  const clockA = new ManualIsoClock();
  const clockB = new ManualIsoClock();
  const idsA = new SequenceIdGenerator(['focus-a']);
  const idsB = new SequenceIdGenerator(['focus-b']);
  const serviceA = createFocusSessionService({
    repository: repositoryA,
    now: clockA.now,
    idGenerator: idsA.next,
  });
  const serviceB = createFocusSessionService({
    repository: repositoryB,
    now: clockB.now,
    idGenerator: idsB.next,
  });
  return {
    production,
    backend,
    repositoryA,
    repositoryB,
    clockA,
    clockB,
    idsA,
    idsB,
    serviceA,
    serviceB,
  };
}

describe('GAP-P0-02B cross-repository and fresh-process behavior', () => {
  it('linearizes matching concurrent starts through one real repository facade', async () => {
    const production = loadPersistentProduction();
    const backend = new MemoryFocusBackend();
    const repository = production.createRepository(
      production.createStorage(backend),
    );
    const clock = new ManualIsoClock();
    const ids = new SequenceIdGenerator(['focus-same-facade']);
    const service = createFocusSessionService({
      repository,
      now: clock.now,
      idGenerator: ids.next,
    });

    const [left, right] = await Promise.all([
      service.start(input('task-same', 15)),
      service.start(input('task-same', 15)),
    ]);

    expect(left).toEqual(right);
    expect(backend.writes).toHaveLength(1);
    expect(JSON.parse(backend.raw(production.storageKey) ?? '')).toMatchObject({
      sessions: [left],
    });
    await expect(repository.load()).resolves.toEqual([left]);
    expect({clockCalls: clock.calls, idCalls: ids.calls}).toEqual({
      clockCalls: 2,
      idCalls: 1,
    });
  });

  it('linearizes different concurrent starts through one real repository facade', async () => {
    const production = loadPersistentProduction();
    const backend = new MemoryFocusBackend();
    const repository = production.createRepository(
      production.createStorage(backend),
    );
    const service = createFocusSessionService({
      repository,
      now: new ManualIsoClock().now,
      idGenerator: new SequenceIdGenerator(['focus-winner']).next,
    });

    const outcomes = await Promise.allSettled([
      service.start(input('task-left', 2)),
      service.start(input('task-right', 50)),
    ]);
    const fulfilled = outcomes.filter(outcome => outcome.status === 'fulfilled');
    const rejected = outcomes.filter(outcome => outcome.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      reason: {code: 'FOCUS_SESSION_ACTIVE_CONFLICT'},
    });
    expect(backend.writes).toHaveLength(1);
    const durable = JSON.parse(backend.raw(production.storageKey) ?? '');
    expect(durable).toMatchObject({sessions: [fulfilled[0]?.value]});
    await expect(repository.load()).resolves.toEqual([fulfilled[0]?.value]);
  });

  it('coordinates two persistent repository facades so matching starts commit exactly once', async () => {
    const harness = servicesOverSharedBackend();
    await expect(
      Promise.all([harness.repositoryA.load(), harness.repositoryB.load()]),
    ).resolves.toEqual([[], []]);

    const [left, right] = await Promise.all([
      harness.serviceA.start(input('task-shared', 5)),
      harness.serviceB.start(input('task-shared', 5)),
    ]);

    expect(left).toEqual(right);
    expect(harness.backend.writes).toHaveLength(1);
    await expect(harness.repositoryA.load()).resolves.toEqual([left]);
    await expect(harness.repositoryB.load()).resolves.toEqual([left]);
    expect(
      JSON.parse(harness.backend.raw(harness.production.storageKey) ?? ''),
    ).toMatchObject({sessions: [left]});
    expect(harness.clockA.calls + harness.clockB.calls).toBe(2);
    expect(harness.idsA.calls + harness.idsB.calls).toBe(1);
  });

  it('coordinates different cross-facade starts into one durable winner and one conflict', async () => {
    const harness = servicesOverSharedBackend();
    await expect(
      Promise.all([harness.repositoryA.load(), harness.repositoryB.load()]),
    ).resolves.toEqual([[], []]);

    const outcomes = await Promise.allSettled([
      harness.serviceA.start(input('task-a', 2)),
      harness.serviceB.start(input('task-b', 50)),
    ]);

    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(outcome => outcome.status === 'rejected')).toHaveLength(1);
    expect(outcomes.find(outcome => outcome.status === 'rejected')).toMatchObject({
      reason: {code: 'FOCUS_SESSION_ACTIVE_CONFLICT'},
    });
    expect(harness.backend.writes).toHaveLength(1);
    const durable = JSON.parse(
      harness.backend.raw(harness.production.storageKey) ?? '',
    );
    expect(durable.sessions).toHaveLength(1);
    await expect(harness.repositoryA.load()).resolves.toEqual(durable.sessions);
    await expect(harness.repositoryB.load()).resolves.toEqual(durable.sessions);
  });

  it('linearizes finish versus interrupt across separate repository facades', async () => {
    const harness = servicesOverSharedBackend();
    const active = await harness.serviceA.start(input('task-race', 5));
    await expect(
      Promise.all([harness.repositoryA.load(), harness.repositoryB.load()]),
    ).resolves.toEqual([[active], [active]]);
    harness.clockA.set('2026-08-05T08:01:00.000Z');
    harness.clockB.set('2026-08-05T08:01:01.000Z');
    const writesBefore = harness.backend.writes.length;

    const [left, right] = await Promise.all([
      harness.serviceA.finish(active.id),
      harness.serviceB.interrupt(active.id, 'race reason'),
    ]);

    expect(left).toEqual(right);
    expect(['completed', 'interrupted']).toContain(left.status);
    expect(harness.backend.writes).toHaveLength(writesBefore + 1);
    await expect(harness.repositoryA.get(active.id)).resolves.toEqual(left);
    await expect(harness.repositoryB.get(active.id)).resolves.toEqual(left);
    expect(
      JSON.parse(harness.backend.raw(harness.production.storageKey) ?? ''),
    ).toMatchObject({sessions: [left]});
  });

  it('restores through a genuinely fresh backend facade and reconciles overdue time durably', async () => {
    const harness = servicesOverSharedBackend();
    const active = await harness.serviceA.start(input('task-restart', 15));
    const freshBackend = harness.backend.fork();
    const freshRepository = harness.production.createRepository(
      harness.production.createStorage(freshBackend),
    );
    const freshService = createFocusSessionService({
      repository: freshRepository,
      now: new ManualIsoClock('2026-08-05T08:20:00.000Z').now,
      idGenerator: new SequenceIdGenerator(['must-not-consume']).next,
    });

    await expect(freshService.getById(active.id)).resolves.toEqual(active);
    await expect(freshService.restore()).resolves.toBeNull();

    const completed = await freshService.getById(active.id);
    expect(completed).toMatchObject({
      status: 'completed',
      endedAt: active.plannedEndAt,
      actualSeconds: 900,
    });
    const secondFreshRepository = harness.production.createRepository(
      harness.production.createStorage(harness.backend.fork()),
    );
    await expect(secondFreshRepository.get(active.id)).resolves.toEqual(completed);
  });

  it('recovers the shared mutation queue after one facade write failure', async () => {
    const harness = servicesOverSharedBackend();
    harness.backend.failNextWrite();

    await expectRejectCode(
      harness.serviceA.start(input('task-a', 5)),
      'FOCUS_SESSION_STORAGE_WRITE_FAILED',
    );
    expect(harness.backend.raw(harness.production.storageKey)).toBeNull();

    const recovered = await harness.serviceB.start(input('task-b', 5));
    await expect(harness.repositoryA.load()).resolves.toEqual([recovered]);
    await expect(harness.repositoryB.load()).resolves.toEqual([recovered]);
  });
});
