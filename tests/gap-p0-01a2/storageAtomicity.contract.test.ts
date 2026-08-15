import type {TaskLifecycleService} from '../../src/application/coreAppService';
import type {Task} from '../../src/domain/task';
import {
  A2_LATER,
  SequenceClock,
  SequenceIds,
  StorageFault,
  createA2Harness,
  expectErrorCode,
  makeInProgressTask,
  makeTask,
  operation,
  readFreshTasks,
} from './a2Fixtures';

type AtomicMutationScenario = {
  name: string;
  tasks: readonly Task[];
  invoke(service: TaskLifecycleService): Promise<unknown>;
};

const ATOMIC_MUTATIONS: readonly AtomicMutationScenario[] = [
  {
    name: 'create',
    tasks: [],
    invoke: service =>
      service.create(
        {title: 'Atomic create', important: true, urgent: false},
        operation('atomic:create'),
      ),
  },
  {
    name: 'update',
    tasks: [makeTask('atomic-update')],
    invoke: service =>
      service.update(
        'atomic-update',
        {title: 'Atomic updated title'},
        operation('atomic:update'),
      ),
  },
  {
    name: 'softDelete',
    tasks: [makeTask('atomic-delete')],
    invoke: service =>
      service.softDelete('atomic-delete', operation('atomic:delete')),
  },
  {
    name: 'complete',
    tasks: [makeInProgressTask('atomic-complete')],
    invoke: service =>
      service.complete('atomic-complete', operation('atomic:complete')),
  },
  {
    name: 'reschedule',
    tasks: [makeTask('atomic-reschedule')],
    invoke: service =>
      service.reschedule(
        'atomic-reschedule',
        {scheduledStartAt: A2_LATER},
        operation('atomic:reschedule'),
      ),
  },
  {
    name: 'delay',
    tasks: [makeTask('atomic-delay')],
    invoke: service =>
      service.delay(
        'atomic-delay',
        {minutes: 5},
        operation('atomic:delay'),
      ),
  },
];

const FAILED_ATTEMPT_AT = '2026-08-05T10:10:00.000Z';
const RETRY_ATTEMPT_AT = '2026-08-05T10:11:00.000Z';

async function expectRetryAttemptPersisted(
  scenario: AtomicMutationScenario,
  backend: Parameters<typeof readFreshTasks>[0],
  failedId: string,
  retryId: string,
): Promise<void> {
  const durable = await readFreshTasks(backend);
  expect(JSON.stringify(durable)).not.toContain(FAILED_ATTEMPT_AT);
  expect(durable.some(task => task.id === failedId)).toBe(false);
  if (scenario.name === 'create') {
    expect(durable).toHaveLength(1);
    expect(durable[0]).toMatchObject({
      id: retryId,
      createdAt: RETRY_ATTEMPT_AT,
      updatedAt: RETRY_ATTEMPT_AT,
    });
    return;
  }
  const targetId = scenario.tasks[0]?.id;
  expect(targetId).toBeDefined();
  expect(durable.find(task => task.id === targetId)?.updatedAt).toBe(
    RETRY_ATTEMPT_AT,
  );
}

describe('GAP-P0-01A2 storage failure atomicity and retry contract', () => {
  it.each(ATOMIC_MUTATIONS)(
    'keeps $name read failure write-free and retries the same operation',
    async scenario => {
      const clock = new SequenceClock([FAILED_ATTEMPT_AT, RETRY_ATTEMPT_AT]);
      const failedId = `read-${scenario.name}-attempt-1`;
      const retryId = `read-${scenario.name}-attempt-2`;
      const ids = new SequenceIds([failedId, retryId]);
      const {service, storage, backend} = createA2Harness({
        tasks: scenario.tasks,
        now: clock.now,
        idGenerator: ids.next,
      });
      const rawBefore = storage.raw();
      storage.failNextGetWith = new StorageFault('A2_STORAGE_READ_FAILED');

      const readError = await expectErrorCode(
        () => scenario.invoke(service),
        'A2_STORAGE_READ_FAILED',
      );

      expect(readError).toMatchObject({
        code: 'A2_STORAGE_READ_FAILED',
        message: 'A2_STORAGE_READ_FAILED',
      });
      expect(storage.raw()).toBe(rawBefore);
      expect(storage.setAttempts).toEqual([]);
      expect(storage.setCommits).toEqual([]);
      expect(clock.consumed).toBe(1);
      expect(ids.consumed).toBe(scenario.name === 'create' ? 1 : 0);
      await expect(scenario.invoke(service)).resolves.toBeDefined();
      expect(storage.setCommits).toHaveLength(1);
      expect(clock.consumed).toBe(2);
      expect(ids.consumed).toBe(scenario.name === 'create' ? 2 : 0);
      await expectRetryAttemptPersisted(
        scenario,
        backend,
        failedId,
        retryId,
      );
    },
  );

  it.each(ATOMIC_MUTATIONS)(
    'rolls back $name cache and durable state after a failed write, then retries',
    async scenario => {
      const clock = new SequenceClock([FAILED_ATTEMPT_AT, RETRY_ATTEMPT_AT]);
      const failedId = `write-${scenario.name}-attempt-1`;
      const retryId = `write-${scenario.name}-attempt-2`;
      const ids = new SequenceIds([failedId, retryId]);
      const {service, storage, backend} = createA2Harness({
        tasks: scenario.tasks,
        now: clock.now,
        idGenerator: ids.next,
      });
      const rawBefore = storage.raw();
      const writeFailure = new StorageFault('A2_STORAGE_WRITE_FAILED');
      storage.failNextSetWith = writeFailure;

      const writeError = await expectErrorCode(
        () => scenario.invoke(service),
        'A2_STORAGE_WRITE_FAILED',
      );

      expect(writeError).toMatchObject({
        code: 'A2_STORAGE_WRITE_FAILED',
        message: 'A2_STORAGE_WRITE_FAILED',
      });
      expect(storage.raw()).toBe(rawBefore);
      expect(storage.setAttempts).toHaveLength(1);
      expect(storage.setCommits).toEqual([]);
      await expect(service.list({includeDeleted: true})).resolves.toEqual(
        scenario.tasks,
      );
      await expect(readFreshTasks(backend)).resolves.toEqual(scenario.tasks);
      expect(clock.consumed).toBe(1);
      expect(ids.consumed).toBe(scenario.name === 'create' ? 1 : 0);

      await expect(scenario.invoke(service)).resolves.toBeDefined();
      expect(storage.setAttempts).toHaveLength(2);
      expect(storage.setCommits).toHaveLength(1);
      expect(storage.raw()).not.toBe(rawBefore);
      expect(clock.consumed).toBe(2);
      expect(ids.consumed).toBe(scenario.name === 'create' ? 2 : 0);
      await expectRetryAttemptPersisted(
        scenario,
        backend,
        failedId,
        retryId,
      );
    },
  );
});
