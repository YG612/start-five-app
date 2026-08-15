import {createPersistentTaskStorage} from '../../src/data/persistentTaskStorage';
import {createTaskRepository} from '../../src/data/taskRepository';
import type {Task} from '../../src/domain/task';
import {
  captureOutcome,
  envelopeFromTaskArrayRaw,
  InspectableBackend,
  InspectableDirectStorage,
  makeCompletedTask,
  outcomeIdentity,
  PHASE4_REVIEW3_COMPLETED_AT,
  PHASE4_REVIEW3_CREATED_AT,
  PHASE4_REVIEW3_STORAGE_KEY,
} from './phase4Review3Fixtures';

type TemporalBoundaryCase = {
  label: string;
  task(): Task;
};

const INVALID_PARENT_SUBTASK_RELATIONS: readonly TemporalBoundaryCase[] = [
  {
    label: 'subtask.createdAt earlier than parent createdAt',
    task: () => {
      const parent = makeCompletedTask('subtask-created-before-parent');
      return {
        ...parent,
        subtasks: parent.subtasks.map(subtask => ({
          ...subtask,
          createdAt: '2026-08-04T17:59:59.999Z',
        })),
      };
    },
  },
  {
    label: 'subtask.completedAt later than parent completedAt',
    task: () => {
      const parent = makeCompletedTask('subtask-completed-after-parent', {
        // Keep parent.updatedAt later than the child so this fixture violates
        // only the completedAt aggregate boundary.
        updatedAt: '2026-08-04T18:04:00.000Z',
      });
      return {
        ...parent,
        subtasks: parent.subtasks.map(subtask => ({
          ...subtask,
          updatedAt: '2026-08-04T18:03:00.001Z',
          completedAt: '2026-08-04T18:03:00.001Z',
        })),
      };
    },
  },
  {
    label: 'subtask.updatedAt later than parent updatedAt',
    task: () => {
      const parent = makeCompletedTask('subtask-updated-after-parent');
      return {
        ...parent,
        subtasks: parent.subtasks.map(subtask => ({
          ...subtask,
          updatedAt: '2026-08-04T18:03:00.001Z',
          completedAt: PHASE4_REVIEW3_COMPLETED_AT,
        })),
      };
    },
  },
];

async function directOutcome(raw: string) {
  const storage = new InspectableDirectStorage();
  storage.seed(PHASE4_REVIEW3_STORAGE_KEY, raw);
  const outcome = await captureOutcome(
    createTaskRepository(storage).list({includeDeleted: true}),
  );
  return {storage, outcome};
}

async function persistentOutcome(raw: string) {
  const backend = new InspectableBackend();
  const envelope = envelopeFromTaskArrayRaw(raw);
  backend.seed(PHASE4_REVIEW3_STORAGE_KEY, envelope);
  const outcome = await captureOutcome(
    createTaskRepository(createPersistentTaskStorage(backend)).list({
      includeDeleted: true,
    }),
  );
  return {backend, envelope, outcome};
}

describe('P4-HARDENING-3 parent/subtask aggregate temporal bounds', () => {
  it.each(INVALID_PARENT_SUBTASK_RELATIONS)(
    'rejects $label at direct and persistent hydration boundaries without rewriting bytes',
    async scenario => {
      const task = scenario.task();
      const raw = JSON.stringify([task]);
      const direct = await directOutcome(raw);
      const persistent = await persistentOutcome(raw);

      expect(
        [direct.outcome, persistent.outcome].map(outcomeIdentity),
      ).toEqual([
        {
          status: 'rejected',
          code: 'TASK_SNAPSHOT_INVALID',
          message: 'TASK_SNAPSHOT_INVALID',
        },
        {
          status: 'rejected',
          code: 'TASK_SNAPSHOT_INVALID',
          message: 'TASK_SNAPSHOT_INVALID',
        },
      ]);
      expect(direct.storage.raw(PHASE4_REVIEW3_STORAGE_KEY)).toBe(raw);
      expect(direct.storage.setCalls).toEqual([]);
      expect(direct.storage.removeCalls).toEqual([]);
      expect(persistent.backend.raw(PHASE4_REVIEW3_STORAGE_KEY)).toBe(
        persistent.envelope,
      );
      expect(persistent.backend.setAttempts).toEqual([]);
      expect(persistent.backend.removeCalls).toEqual([]);
    },
  );

  it('accepts equality at every parent/subtask created, completed, and updated boundary', async () => {
    const parent = makeCompletedTask('subtask-equality-boundaries');
    const task: Task = {
      ...parent,
      subtasks: parent.subtasks.map(subtask => ({
        ...subtask,
        createdAt: PHASE4_REVIEW3_CREATED_AT,
        updatedAt: PHASE4_REVIEW3_COMPLETED_AT,
        completedAt: PHASE4_REVIEW3_COMPLETED_AT,
      })),
    };
    const raw = JSON.stringify([task]);
    const direct = await directOutcome(raw);
    const persistent = await persistentOutcome(raw);

    expect(direct.outcome).toEqual({status: 'fulfilled', value: [task]});
    expect(persistent.outcome).toEqual({status: 'fulfilled', value: [task]});
    expect(direct.storage.raw(PHASE4_REVIEW3_STORAGE_KEY)).toBe(raw);
    expect(direct.storage.setCalls).toEqual([]);
    expect(direct.storage.removeCalls).toEqual([]);
    expect(persistent.backend.raw(PHASE4_REVIEW3_STORAGE_KEY)).toBe(
      persistent.envelope,
    );
    expect(persistent.backend.setAttempts).toEqual([]);
    expect(persistent.backend.removeCalls).toEqual([]);
  });
});
