import {createPersistentTaskStorage} from '../../src/data/persistentTaskStorage';
import {createTaskRepository} from '../../src/data/taskRepository';
import type {Task} from '../../src/domain/task';
import {
  captureOutcome,
  envelopeFromTaskArrayRaw,
  errorCode,
  InspectableAsyncKeyValueBackend,
  InspectableKeyValueStorage,
  makeCompletedTask,
  makePendingTask,
  PHASE4_REVIEW2_COMPLETED_AT,
  PHASE4_REVIEW2_CREATED_AT,
  PHASE4_REVIEW2_DELETED_AT,
  PHASE4_REVIEW2_STARTED_AT,
  PHASE4_REVIEW2_STORAGE_KEY,
} from './phase4Review2Fixtures';

type LifecycleCase = {
  label: string;
  raw(): string;
};

function rawTask(task: Task): string {
  return JSON.stringify([task]);
}

function scoreTokenRaw(task: Task, token: string): string {
  const ordinary = rawTask(task);
  const changed = ordinary.replace('"score":15', `"score":${token}`);
  if (changed === ordinary) {
    throw new Error('SCORE_TOKEN_FIXTURE_NOT_CONSTRUCTED');
  }
  return changed;
}

const INVALID_LIFECYCLES: readonly LifecycleCase[] = [
  {
    label: 'a pending task with startedAt',
    raw: () =>
      rawTask(
        makePendingTask('pending-started', {
          startedAt: PHASE4_REVIEW2_STARTED_AT,
          updatedAt: PHASE4_REVIEW2_STARTED_AT,
        }),
      ),
  },
  {
    label: 'an in-progress task without startedAt',
    raw: () =>
      rawTask(
        makePendingTask('in-progress-not-started', {
          status: 'in_progress',
        }),
      ),
  },
  {
    label: 'a completed task without startedAt',
    raw: () =>
      rawTask(makeCompletedTask('completed-not-started', {startedAt: null})),
  },
  {
    label: 'updatedAt earlier than startedAt',
    raw: () =>
      rawTask(
        makePendingTask('update-before-start', {
          status: 'in_progress',
          startedAt: '2026-08-04T16:02:00.000Z',
          updatedAt: '2026-08-04T16:01:00.000Z',
        }),
      ),
  },
  {
    label: 'updatedAt earlier than completedAt',
    raw: () =>
      rawTask(
        makeCompletedTask('update-before-complete', {
          updatedAt: '2026-08-04T16:02:00.000Z',
        }),
      ),
  },
  {
    label: 'updatedAt earlier than deletedAt',
    raw: () =>
      rawTask(
        makePendingTask('update-before-delete', {
          updatedAt: PHASE4_REVIEW2_STARTED_AT,
          deletedAt: PHASE4_REVIEW2_DELETED_AT,
        }),
      ),
  },
  {
    label: 'updatedAt earlier than scoreAwardedAt',
    raw: () =>
      rawTask(
        makeCompletedTask('update-before-score-award', {
          startedAt: PHASE4_REVIEW2_STARTED_AT,
          completedAt: '2026-08-04T16:02:00.000Z',
          updatedAt: '2026-08-04T16:02:00.000Z',
          scoreAwardedAt: PHASE4_REVIEW2_COMPLETED_AT,
        }),
      ),
  },
  {
    label: 'negative zero score',
    raw: () => scoreTokenRaw(makeCompletedTask('negative-zero-score'), '-0'),
  },
  {
    label: 'an integer above Number.MAX_SAFE_INTEGER',
    raw: () =>
      scoreTokenRaw(
        makeCompletedTask('unsafe-integer-score'),
        String(Number.MAX_SAFE_INTEGER + 1),
      ),
  },
];

const LEGAL_LIFECYCLES: ReadonlyArray<{
  label: string;
  task(): Task;
}> = [
  {
    label: 'a cancelled task that was never started and is not deleted',
    task: () =>
      makePendingTask('legal-cancelled-not-started', {status: 'cancelled'}),
  },
  {
    label: 'a started, cancelled, and soft-deleted task with aligned updates',
    task: () =>
      makePendingTask('legal-cancelled-deleted', {
        status: 'cancelled',
        startedAt: PHASE4_REVIEW2_STARTED_AT,
        updatedAt: PHASE4_REVIEW2_DELETED_AT,
        deletedAt: PHASE4_REVIEW2_DELETED_AT,
      }),
  },
  {
    label: 'Number.MAX_SAFE_INTEGER at the completed-score boundary',
    task: () =>
      makeCompletedTask('legal-max-safe-score', {
        score: Number.MAX_SAFE_INTEGER,
      }),
  },
];

async function directOutcome(raw: string) {
  const storage = new InspectableKeyValueStorage();
  storage.seed(PHASE4_REVIEW2_STORAGE_KEY, raw);
  const outcome = await captureOutcome(
    createTaskRepository(storage).list({includeDeleted: true}),
  );
  return {storage, outcome};
}

async function persistentOutcome(raw: string) {
  const backend = new InspectableAsyncKeyValueBackend();
  const envelope = envelopeFromTaskArrayRaw(raw);
  backend.seed(PHASE4_REVIEW2_STORAGE_KEY, envelope);
  const outcome = await captureOutcome(
    createTaskRepository(createPersistentTaskStorage(backend)).list({
      includeDeleted: true,
    }),
  );
  return {backend, envelope, outcome};
}

describe('P4-HARDENING-2 lifecycle and score invariant matrix', () => {
  it.each(INVALID_LIFECYCLES)(
    'rejects $label at both hydration boundaries with stable code and no writes',
    async scenario => {
      const raw = scenario.raw();
      const direct = await directOutcome(raw);
      const persistent = await persistentOutcome(raw);

      expect(
        [direct.outcome, persistent.outcome].map(outcome => ({
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
      expect(direct.storage.raw(PHASE4_REVIEW2_STORAGE_KEY)).toBe(raw);
      expect(direct.storage.setCalls).toEqual([]);
      expect(direct.storage.removeCalls).toEqual([]);
      expect(persistent.backend.raw(PHASE4_REVIEW2_STORAGE_KEY)).toBe(
        persistent.envelope,
      );
      expect(persistent.backend.setAttempts).toEqual([]);
      expect(persistent.backend.removeCalls).toEqual([]);
    },
  );

  it.each(LEGAL_LIFECYCLES)(
    'accepts $label at both hydration boundaries without rewriting it',
    async scenario => {
      const task = scenario.task();
      const raw = rawTask(task);
      const direct = await directOutcome(raw);
      const persistent = await persistentOutcome(raw);

      expect(direct.outcome).toEqual({status: 'fulfilled', value: [task]});
      expect(persistent.outcome).toEqual({
        status: 'fulfilled',
        value: [task],
      });
      expect(direct.storage.raw(PHASE4_REVIEW2_STORAGE_KEY)).toBe(raw);
      expect(direct.storage.setCalls).toEqual([]);
      expect(direct.storage.removeCalls).toEqual([]);
      expect(persistent.backend.raw(PHASE4_REVIEW2_STORAGE_KEY)).toBe(
        persistent.envelope,
      );
      expect(persistent.backend.setAttempts).toEqual([]);
      expect(persistent.backend.removeCalls).toEqual([]);
    },
  );
});
