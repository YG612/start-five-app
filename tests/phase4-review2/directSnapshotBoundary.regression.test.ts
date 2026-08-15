import {createTaskRepository} from '../../src/data/taskRepository';
import type {Task} from '../../src/domain/task';
import {makeReviewTask} from '../review1/fixtures/reviewFixtures';
import {
  captureOutcome,
  errorCode,
  InspectableKeyValueStorage,
  makeCompletedTask,
  makePendingTask,
  PHASE4_REVIEW2_DELETED_AT,
  PHASE4_REVIEW2_STORAGE_KEY,
} from './phase4Review2Fixtures';

type DirectSnapshotCase = {
  label: string;
  raw(): string;
};

function rawTasks(tasks: readonly unknown[]): string {
  return JSON.stringify(tasks);
}

function overflowScoreRaw(): string {
  const ordinary = rawTasks([
    makeCompletedTask('direct-overflow-score', {score: 15}),
  ]);
  const overflow = ordinary.replace('"score":15', '"score":1e400');
  if (overflow === ordinary) {
    throw new Error('OVERFLOW_SCORE_FIXTURE_NOT_CONSTRUCTED');
  }
  return overflow;
}

const INVALID_DIRECT_SNAPSHOTS: readonly DirectSnapshotCase[] = [
  {
    label: 'duplicate task IDs',
    raw: () =>
      rawTasks([
        makePendingTask('direct-duplicate-task'),
        makePendingTask('direct-duplicate-task', {title: 'Duplicate'}),
      ]),
  },
  {
    label: 'a whitespace-only task ID',
    raw: () => rawTasks([makePendingTask('  ')]),
  },
  {
    label: 'duplicate subtask IDs',
    raw: () => {
      const taskId = 'direct-duplicate-subtasks';
      return rawTasks([
        makePendingTask(taskId, {
          subtasks: [
            {
              id: 'same-step',
              taskId,
              title: 'First step',
              status: 'pending',
              createdAt: '2026-08-04T16:00:00.000Z',
              updatedAt: '2026-08-04T16:00:00.000Z',
              completedAt: null,
            },
            {
              id: 'same-step',
              taskId,
              title: 'Second step',
              status: 'pending',
              createdAt: '2026-08-04T16:00:00.000Z',
              updatedAt: '2026-08-04T16:00:00.000Z',
              completedAt: null,
            },
          ],
        }),
      ]);
    },
  },
  {
    label: 'a blank subtask ID',
    raw: () => {
      const taskId = 'direct-blank-subtask';
      return rawTasks([
        makePendingTask(taskId, {
          subtasks: [
            {
              id: '\t',
              taskId,
              title: 'Blank ID step',
              status: 'pending',
              createdAt: '2026-08-04T16:00:00.000Z',
              updatedAt: '2026-08-04T16:00:00.000Z',
              completedAt: null,
            },
          ],
        }),
      ]);
    },
  },
  {
    label: 'an unparseable createdAt',
    raw: () =>
      rawTasks([
        makePendingTask('direct-invalid-date', {createdAt: 'not-a-date'}),
      ]),
  },
  {
    label: 'updatedAt earlier than createdAt',
    raw: () =>
      rawTasks([
        makePendingTask('direct-reversed-update', {
          updatedAt: '2026-08-04T15:59:59.999Z',
        }),
      ]),
  },
  {
    label: 'a cancelled task carrying score data',
    raw: () =>
      rawTasks([
        makePendingTask('direct-cancelled-score', {
          status: 'cancelled',
          score: 5,
          scoreAwardedAt: '2026-08-04T16:01:00.000Z',
          updatedAt: '2026-08-04T16:01:00.000Z',
        }),
      ]),
  },
  {
    label: 'JSON numeric 1e400 parsed as Infinity',
    raw: overflowScoreRaw,
  },
];

const LEGAL_DIRECT_SNAPSHOTS: ReadonlyArray<{
  label: string;
  tasks(): readonly Task[];
}> = [
  {
    label: 'the locked Review-1 pending task shape',
    tasks: () => [makeReviewTask()],
  },
  {
    label: 'a cancelled and soft-deleted task with an aligned update time',
    tasks: () => [
      makePendingTask('direct-legal-cancelled-deleted', {
        status: 'cancelled',
        deletedAt: PHASE4_REVIEW2_DELETED_AT,
        updatedAt: PHASE4_REVIEW2_DELETED_AT,
      }),
    ],
  },
  {
    label: 'a pending soft-deleted task with no lifecycle completion data',
    tasks: () => [
      makePendingTask('direct-legal-pending-deleted', {
        deletedAt: PHASE4_REVIEW2_DELETED_AT,
        updatedAt: PHASE4_REVIEW2_DELETED_AT,
      }),
    ],
  },
];

describe('P4-HARDENING-2 direct KeyValueStorage snapshot boundary', () => {
  it.each(INVALID_DIRECT_SNAPSHOTS)(
    'rejects $label twice without changing the raw array',
    async scenario => {
      const storage = new InspectableKeyValueStorage();
      const raw = scenario.raw();
      storage.seed(PHASE4_REVIEW2_STORAGE_KEY, raw);
      const repository = createTaskRepository(storage);

      const first = await captureOutcome(
        repository.list({includeDeleted: true}),
      );
      const second = await captureOutcome(
        repository.list({includeDeleted: true}),
      );

      expect(
        [first, second].map(outcome => ({
          status: outcome.status,
          code:
            outcome.status === 'rejected'
              ? errorCode(outcome.error)
              : undefined,
        })),
      ).toEqual([
        {status: 'rejected', code: 'TASK_SNAPSHOT_INVALID'},
        {status: 'rejected', code: 'TASK_SNAPSHOT_INVALID'},
      ]);
      expect(storage.raw(PHASE4_REVIEW2_STORAGE_KEY)).toBe(raw);
      expect(storage.setCalls).toEqual([]);
      expect(storage.removeCalls).toEqual([]);
    },
  );

  it.each(LEGAL_DIRECT_SNAPSHOTS)(
    'keeps $label compatible with direct-memory hydration',
    async scenario => {
      const storage = new InspectableKeyValueStorage();
      const tasks = scenario.tasks();
      const raw = rawTasks(tasks);
      storage.seed(PHASE4_REVIEW2_STORAGE_KEY, raw);
      const repository = createTaskRepository(storage);

      await expect(
        repository.list({includeDeleted: true}),
      ).resolves.toEqual(tasks);
      expect(storage.raw(PHASE4_REVIEW2_STORAGE_KEY)).toBe(raw);
      expect(storage.setCalls).toEqual([]);
      expect(storage.removeCalls).toEqual([]);
    },
  );
});
