import {createPersistentTaskStorage} from '../../src/data/persistentTaskStorage';
import {createTaskRepository} from '../../src/data/taskRepository';
import {
  captureOutcome,
  ControlledAsyncKeyValueBackend,
  errorCode,
  errorMessage,
  makeCompletedSubtask,
  makeCompletedTask,
  makePendingSubtask,
  makePendingTask,
  PHASE4_REVIEW_STORAGE_KEY,
  serializeEnvelope,
} from './phase4ReviewFixtures';

type SnapshotCase = {
  label: string;
  tasks(): readonly unknown[];
};

const INVALID_SNAPSHOTS: readonly SnapshotCase[] = [
  {
    label: 'rejects duplicate task IDs',
    tasks: () => [
      makePendingTask('duplicate-task'),
      makePendingTask('duplicate-task', {title: 'Second duplicate'}),
    ],
  },
  {
    label: 'rejects duplicate subtask IDs within one task',
    tasks: () => {
      const taskId = 'duplicate-subtask-parent';
      return [
        makePendingTask(taskId, {
          subtasks: [
            makePendingSubtask(taskId, {id: 'duplicate-step'}),
            makePendingSubtask(taskId, {
              id: 'duplicate-step',
              title: 'Second duplicate step',
            }),
          ],
        }),
      ];
    },
  },
  {
    label: 'rejects an empty task ID',
    tasks: () => [makePendingTask('')],
  },
  {
    label: 'rejects a whitespace-only task ID',
    tasks: () => [makePendingTask('   ')],
  },
  {
    label: 'rejects an empty task title',
    tasks: () => [makePendingTask('empty-task-title', {title: ''})],
  },
  {
    label: 'rejects a whitespace-only task title',
    tasks: () => [makePendingTask('blank-task-title', {title: ' \t '})],
  },
  {
    label: 'rejects an empty subtask ID',
    tasks: () => {
      const taskId = 'empty-subtask-id-parent';
      return [
        makePendingTask(taskId, {
          subtasks: [makePendingSubtask(taskId, {id: ''})],
        }),
      ];
    },
  },
  {
    label: 'rejects a whitespace-only subtask ID',
    tasks: () => {
      const taskId = 'blank-subtask-id-parent';
      return [
        makePendingTask(taskId, {
          subtasks: [makePendingSubtask(taskId, {id: '  '})],
        }),
      ];
    },
  },
  {
    label: 'rejects an empty subtask title',
    tasks: () => {
      const taskId = 'empty-subtask-title-parent';
      return [
        makePendingTask(taskId, {
          subtasks: [makePendingSubtask(taskId, {title: ''})],
        }),
      ];
    },
  },
  {
    label: 'rejects a whitespace-only subtask title',
    tasks: () => {
      const taskId = 'blank-subtask-title-parent';
      return [
        makePendingTask(taskId, {
          subtasks: [makePendingSubtask(taskId, {title: '\n  '})],
        }),
      ];
    },
  },
  {
    label: 'rejects an unparseable task createdAt',
    tasks: () => [makePendingTask('bad-task-created', {createdAt: 'never'})],
  },
  {
    label: 'rejects an unparseable task updatedAt',
    tasks: () => [makePendingTask('bad-task-updated', {updatedAt: 'later-ish'})],
  },
  {
    label: 'rejects an unparseable task completedAt',
    tasks: () => [makeCompletedTask('bad-task-completed', {completedAt: 'done'})],
  },
  {
    label: 'rejects an unparseable task deletedAt',
    tasks: () => [makePendingTask('bad-task-deleted', {deletedAt: 'yesterday'})],
  },
  {
    label: 'rejects an unparseable task startAt',
    tasks: () => [makePendingTask('bad-task-start', {startAt: 'soon'})],
  },
  {
    label: 'rejects an unparseable task dueAt',
    tasks: () => [makePendingTask('bad-task-due', {dueAt: 'eventually'})],
  },
  {
    label: 'rejects an unparseable task startedAt',
    tasks: () => [
      makePendingTask('bad-task-started', {
        status: 'in_progress',
        startedAt: 'already',
      }),
    ],
  },
  {
    label: 'rejects an unparseable task scoreAwardedAt',
    tasks: () => [
      makeCompletedTask('bad-score-awarded', {scoreAwardedAt: 'award-time'}),
    ],
  },
  {
    label: 'rejects an unparseable subtask createdAt',
    tasks: () => {
      const taskId = 'bad-step-created-parent';
      return [
        makePendingTask(taskId, {
          subtasks: [makePendingSubtask(taskId, {createdAt: 'never'})],
        }),
      ];
    },
  },
  {
    label: 'rejects an unparseable subtask updatedAt',
    tasks: () => {
      const taskId = 'bad-step-updated-parent';
      return [
        makePendingTask(taskId, {
          subtasks: [makePendingSubtask(taskId, {updatedAt: 'later-ish'})],
        }),
      ];
    },
  },
  {
    label: 'rejects an unparseable subtask completedAt',
    tasks: () => {
      const taskId = 'bad-step-completed-parent';
      return [
        makePendingTask(taskId, {
          status: 'in_progress',
          startedAt: '2026-08-04T14:01:00.000Z',
          subtasks: [makeCompletedSubtask(taskId, {completedAt: 'done'})],
        }),
      ];
    },
  },
  {
    label: 'rejects task updatedAt earlier than createdAt',
    tasks: () => [
      makePendingTask('task-update-before-create', {
        updatedAt: '2026-08-04T13:59:59.999Z',
      }),
    ],
  },
  {
    label: 'rejects task completedAt earlier than createdAt',
    tasks: () => [
      makeCompletedTask('task-complete-before-create', {
        completedAt: '2026-08-04T13:59:59.999Z',
      }),
    ],
  },
  {
    label: 'rejects task deletedAt earlier than createdAt',
    tasks: () => [
      makePendingTask('task-delete-before-create', {
        deletedAt: '2026-08-04T13:59:59.999Z',
      }),
    ],
  },
  {
    label: 'rejects subtask updatedAt earlier than createdAt',
    tasks: () => {
      const taskId = 'step-update-before-create-parent';
      return [
        makePendingTask(taskId, {
          subtasks: [
            makePendingSubtask(taskId, {
              updatedAt: '2026-08-04T13:59:59.999Z',
            }),
          ],
        }),
      ];
    },
  },
  {
    label: 'rejects subtask completedAt earlier than createdAt',
    tasks: () => {
      const taskId = 'step-complete-before-create-parent';
      return [
        makePendingTask(taskId, {
          status: 'in_progress',
          startedAt: '2026-08-04T14:01:00.000Z',
          subtasks: [
            makeCompletedSubtask(taskId, {
              completedAt: '2026-08-04T13:59:59.999Z',
            }),
          ],
        }),
      ];
    },
  },
  {
    label: 'rejects a completed task without completedAt',
    tasks: () => [makeCompletedTask('completed-without-time', {completedAt: null})],
  },
  {
    label: 'rejects a completed task that still has a pending subtask',
    tasks: () => {
      const taskId = 'completed-with-pending-step';
      return [
        makeCompletedTask(taskId, {
          subtasks: [makePendingSubtask(taskId)],
        }),
      ];
    },
  },
  {
    label: 'rejects a pending task with completedAt',
    tasks: () => [
      makePendingTask('pending-with-completion', {
        completedAt: '2026-08-04T14:03:00.000Z',
      }),
    ],
  },
  {
    label: 'rejects an in-progress task with completedAt',
    tasks: () => [
      makePendingTask('in-progress-with-completion', {
        status: 'in_progress',
        startedAt: '2026-08-04T14:01:00.000Z',
        completedAt: '2026-08-04T14:03:00.000Z',
      }),
    ],
  },
  {
    label: 'rejects a cancelled task with completedAt',
    tasks: () => [
      makePendingTask('cancelled-with-completion', {
        status: 'cancelled',
        completedAt: '2026-08-04T14:03:00.000Z',
      }),
    ],
  },
  {
    label: 'rejects a pending subtask with completedAt',
    tasks: () => {
      const taskId = 'pending-step-with-completion-parent';
      return [
        makePendingTask(taskId, {
          subtasks: [
            makePendingSubtask(taskId, {
              completedAt: '2026-08-04T14:02:00.000Z',
            }),
          ],
        }),
      ];
    },
  },
  {
    label: 'rejects a completed subtask without completedAt',
    tasks: () => {
      const taskId = 'completed-step-without-time-parent';
      return [
        makePendingTask(taskId, {
          status: 'in_progress',
          startedAt: '2026-08-04T14:01:00.000Z',
          subtasks: [makeCompletedSubtask(taskId, {completedAt: null})],
        }),
      ];
    },
  },
  {
    label: 'rejects a negative completed-task score',
    tasks: () => [makeCompletedTask('negative-score', {score: -1})],
  },
  {
    label: 'rejects a non-integer completed-task score',
    tasks: () => [makeCompletedTask('fractional-score', {score: 1.5})],
  },
  {
    label: 'rejects a completed task with null score',
    tasks: () => [makeCompletedTask('completed-null-score', {score: null})],
  },
  {
    label: 'rejects a score without scoreAwardedAt',
    tasks: () => [makeCompletedTask('score-without-award-time', {scoreAwardedAt: null})],
  },
  {
    label: 'rejects scoreAwardedAt without a score',
    tasks: () => [
      makePendingTask('award-time-without-score', {
        scoreAwardedAt: '2026-08-04T14:03:00.000Z',
      }),
    ],
  },
  {
    label: 'rejects a non-completed task with an awarded score',
    tasks: () => [
      makePendingTask('pending-with-score', {
        score: 5,
        scoreAwardedAt: '2026-08-04T14:03:00.000Z',
      }),
    ],
  },
  {
    label: 'rejects an unknown task status',
    tasks: () => [
      {...makePendingTask('unknown-task-status'), status: 'archived'},
    ],
  },
  {
    label: 'rejects an unknown subtask status',
    tasks: () => {
      const taskId = 'unknown-step-status-parent';
      const parent = makePendingTask(taskId);
      return [
        {
          ...parent,
          subtasks: [
            {...makePendingSubtask(taskId), status: 'skipped'},
          ],
        },
      ];
    },
  },
];

const LEGAL_SNAPSHOTS: readonly SnapshotCase[] = [
  {
    label: 'accepts a pending task whose score fields are both null',
    tasks: () => [makePendingTask('legal-pending-null-score')],
  },
  {
    label: 'accepts a cancelled and soft-deleted task without completion data',
    tasks: () => [
      makePendingTask('legal-cancelled-deleted', {
        status: 'cancelled',
        startAt: null,
        dueAt: null,
        updatedAt: '2026-08-04T14:04:00.000Z',
        deletedAt: '2026-08-04T14:04:00.000Z',
      }),
    ],
  },
  {
    label: 'accepts soft deletion as orthogonal to a pending task status',
    tasks: () => [
      makePendingTask('legal-pending-deleted', {
        updatedAt: '2026-08-04T14:04:00.000Z',
        deletedAt: '2026-08-04T14:04:00.000Z',
      }),
    ],
  },
];

describe('P4-REVIEW inbound snapshot semantic validation', () => {
  it.each(INVALID_SNAPSHOTS)('$label', async scenario => {
    const backend = new ControlledAsyncKeyValueBackend();
    const raw = serializeEnvelope(scenario.tasks());
    backend.seed(PHASE4_REVIEW_STORAGE_KEY, raw);
    const repository = createTaskRepository(
      createPersistentTaskStorage(backend),
    );

    const first = await captureOutcome(repository.list({includeDeleted: true}));
    const second = await captureOutcome(repository.list({includeDeleted: true}));

    expect(
      [first, second].map(outcome => ({
        status: outcome.status,
        code:
          outcome.status === 'rejected' ? errorCode(outcome.error) : undefined,
        message:
          outcome.status === 'rejected'
            ? errorMessage(outcome.error)
            : undefined,
      })),
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
    expect(backend.raw(PHASE4_REVIEW_STORAGE_KEY)).toBe(raw);
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeCalls).toEqual([]);
  });

  it.each(LEGAL_SNAPSHOTS)('$label', async scenario => {
    const backend = new ControlledAsyncKeyValueBackend();
    const tasks = scenario.tasks();
    const raw = serializeEnvelope(tasks);
    backend.seed(PHASE4_REVIEW_STORAGE_KEY, raw);
    const repository = createTaskRepository(
      createPersistentTaskStorage(backend),
    );

    await expect(
      repository.list({includeDeleted: true}),
    ).resolves.toEqual(tasks);
    expect(backend.raw(PHASE4_REVIEW_STORAGE_KEY)).toBe(raw);
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeCalls).toEqual([]);
  });
});
