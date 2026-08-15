import {
  CURRENT_SCHEMA_VERSION,
  SNAPSHOT_SCHEMA,
  cloneTask,
  makeCompletedTask,
  makeSubtask,
  makeTask,
} from './taskDataRecoveryTestKit';

export type PureJsonSemanticAdversary = {
  name: string;
  secret: string;
  legalCandidate: Record<string, unknown>;
  invalidCandidate: Record<string, unknown>;
};

function envelope(tasks: readonly unknown[]): Record<string, unknown> {
  return {
    schema: SNAPSHOT_SCHEMA,
    version: CURRENT_SCHEMA_VERSION,
    tasks,
  };
}

function semanticCase(
  name: string,
  secret: string,
  legalTasks: readonly unknown[],
  invalidTasks: readonly unknown[],
): PureJsonSemanticAdversary {
  return {
    name,
    secret,
    legalCandidate: envelope(legalTasks),
    invalidCandidate: envelope(invalidTasks),
  };
}

export function buildPureJsonSemanticAdversaryMatrix(): readonly PureJsonSemanticAdversary[] {
  const cases: PureJsonSemanticAdversary[] = [];

  {
    const secret = 'SEMANTIC_SECRET_DUPLICATE_TASK_ID';
    const legalFirst = makeTask(secret);
    const legalSecond = makeTask(`${secret}_SECOND`);
    const invalidFirst = cloneTask(legalFirst);
    const invalidSecond = cloneTask(legalSecond);
    invalidSecond.id = invalidFirst.id;
    cases.push(
      semanticCase(
        'duplicate Task IDs',
        secret,
        [legalFirst, legalSecond],
        [invalidFirst, invalidSecond],
      ),
    );
  }

  {
    const secret = 'SEMANTIC_SECRET_DUPLICATE_SUBTASK_ID';
    const legal = makeTask(secret, {
      subtasks: [makeSubtask(secret, 0), makeSubtask(secret, 1)],
    });
    const invalid = cloneTask(legal);
    const first = invalid.subtasks[0];
    const second = invalid.subtasks[1];
    if (first === undefined || second === undefined) {
      throw new Error('SEMANTIC_MATRIX_SUBTASK_FIXTURE_REQUIRED');
    }
    second.id = first.id;
    cases.push(
      semanticCase('duplicate Subtask IDs', secret, [legal], [invalid]),
    );
  }

  {
    const secret = 'SEMANTIC_SECRET_SUBTASK_PARENT';
    const legal = makeTask(secret, {subtasks: [makeSubtask(secret, 0)]});
    const invalid = cloneTask(legal);
    const child = invalid.subtasks[0];
    if (child === undefined) {
      throw new Error('SEMANTIC_MATRIX_PARENT_FIXTURE_REQUIRED');
    }
    child.taskId = `${secret}_FOREIGN_PARENT`;
    cases.push(
      semanticCase('Subtask parent ID mismatch', secret, [legal], [invalid]),
    );
  }

  {
    const secret = 'SEMANTIC_SECRET_TASK_EXTRA_KEY';
    const legal = makeTask(secret);
    const invalid = {...makeTask(secret), unexpectedTaskKey: secret};
    cases.push(semanticCase('Task extra key', secret, [legal], [invalid]));
  }

  {
    const secret = 'SEMANTIC_SECRET_SUBTASK_EXTRA_KEY';
    const legal = makeTask(secret, {subtasks: [makeSubtask(secret, 0)]});
    const invalid = {
      ...makeTask(secret),
      subtasks: [
        {...makeSubtask(secret, 0), unexpectedSubtaskKey: secret},
      ],
    };
    cases.push(
      semanticCase('Subtask extra key', secret, [legal], [invalid]),
    );
  }

  {
    const secret = 'SEMANTIC_SECRET_TASK_TIME_ORDER';
    const legal = makeTask(secret);
    const invalid = makeTask(secret, {
      updatedAt: '2026-08-05T06:59:59.999Z',
    });
    cases.push(
      semanticCase('Task updatedAt before createdAt', secret, [legal], [invalid]),
    );
  }

  {
    const secret = 'SEMANTIC_SECRET_SUBTASK_TIME_ORDER';
    const legal = makeTask(secret, {subtasks: [makeSubtask(secret, 0)]});
    const invalid = makeTask(secret, {
      subtasks: [
        makeSubtask(secret, 0, {
          updatedAt: '2026-08-05T06:59:59.999Z',
        }),
      ],
    });
    cases.push(
      semanticCase(
        'Subtask updatedAt before createdAt',
        secret,
        [legal],
        [invalid],
      ),
    );
  }

  {
    const secret = 'SEMANTIC_SECRET_PENDING_TASK_LIFECYCLE';
    const legal = makeTask(secret);
    const invalid = makeTask(secret, {
      startedAt: '2026-08-05T07:00:00.000Z',
    });
    cases.push(
      semanticCase('pending Task with startedAt', secret, [legal], [invalid]),
    );
  }

  {
    const secret = 'SEMANTIC_SECRET_COMPLETED_TASK_LIFECYCLE';
    const legal = makeCompletedTask(secret);
    const invalid = makeCompletedTask(secret);
    invalid.completedAt = null;
    cases.push(
      semanticCase(
        'completed Task without completedAt',
        secret,
        [legal],
        [invalid],
      ),
    );
  }

  {
    const secret = 'SEMANTIC_SECRET_PENDING_SUBTASK_LIFECYCLE';
    const legal = makeTask(secret, {subtasks: [makeSubtask(secret, 0)]});
    const invalid = makeTask(secret, {
      subtasks: [
        makeSubtask(secret, 0, {
          completedAt: '2026-08-05T07:00:00.000Z',
        }),
      ],
    });
    cases.push(
      semanticCase(
        'pending Subtask with completedAt',
        secret,
        [legal],
        [invalid],
      ),
    );
  }

  {
    const secret = 'SEMANTIC_SECRET_COMPLETED_SUBTASK_LIFECYCLE';
    const legal = makeTask(secret, {
      subtasks: [
        makeSubtask(secret, 0, {
          status: 'completed',
          completedAt: '2026-08-05T07:00:00.000Z',
        }),
      ],
    });
    const invalid = makeTask(secret, {
      subtasks: [makeSubtask(secret, 0, {status: 'completed'})],
    });
    cases.push(
      semanticCase(
        'completed Subtask without completedAt',
        secret,
        [legal],
        [invalid],
      ),
    );
  }

  {
    const secret = 'SEMANTIC_SECRET_SCORE_WITHOUT_AWARD_TIME';
    const legal = makeCompletedTask(secret);
    const invalid = makeCompletedTask(secret);
    invalid.scoreAwardedAt = null;
    cases.push(
      semanticCase('score without scoreAwardedAt', secret, [legal], [invalid]),
    );
  }

  {
    const secret = 'SEMANTIC_SECRET_AWARD_TIME_WITHOUT_SCORE';
    const legal = makeCompletedTask(secret);
    const invalid = makeCompletedTask(secret);
    invalid.score = null;
    cases.push(
      semanticCase('scoreAwardedAt without score', secret, [legal], [invalid]),
    );
  }

  {
    const secret = 'SEMANTIC_SECRET_FRACTIONAL_SCORE';
    const legal = makeCompletedTask(secret);
    const invalid = makeCompletedTask(secret);
    invalid.score = 1.5;
    cases.push(
      semanticCase('fractional Task score', secret, [legal], [invalid]),
    );
  }

  {
    const secret = 'SEMANTIC_SECRET_CHILD_BEFORE_PARENT';
    const legal = makeTask(secret, {subtasks: [makeSubtask(secret, 0)]});
    const invalid = makeTask(secret, {
      subtasks: [
        makeSubtask(secret, 0, {
          createdAt: '2026-08-05T06:59:59.999Z',
        }),
      ],
    });
    cases.push(
      semanticCase('Subtask created before parent', secret, [legal], [invalid]),
    );
  }

  {
    const secret = 'SEMANTIC_SECRET_CHILD_AFTER_PARENT_UPDATE';
    const legal = makeTask(secret, {subtasks: [makeSubtask(secret, 0)]});
    const invalid = makeTask(secret, {
      subtasks: [
        makeSubtask(secret, 0, {
          updatedAt: '2026-08-05T07:00:00.001Z',
        }),
      ],
    });
    cases.push(
      semanticCase('Subtask updated after parent', secret, [legal], [invalid]),
    );
  }

  {
    const secret = 'SEMANTIC_SECRET_CHILD_AFTER_PARENT_COMPLETION';
    const legal = makeCompletedTask(secret);
    const invalid = makeCompletedTask(secret);
    invalid.updatedAt = '2026-08-05T07:11:00.000Z';
    const child = invalid.subtasks[0];
    if (child === undefined) {
      throw new Error('SEMANTIC_MATRIX_COMPLETION_FIXTURE_REQUIRED');
    }
    child.updatedAt = '2026-08-05T07:10:00.001Z';
    child.completedAt = '2026-08-05T07:10:00.001Z';
    cases.push(
      semanticCase(
        'Subtask completed after parent completion',
        secret,
        [legal],
        [invalid],
      ),
    );
  }

  {
    const secret = 'SEMANTIC_SECRET_A2_SCHEDULE';
    const legal = makeTask(secret, {
      scheduledStartAt: '2026-08-05T09:00:00.000Z',
    });
    const invalid = makeTask(secret, {
      scheduledStartAt: '2026-08-05T09:00:00.001Z',
    });
    cases.push(
      semanticCase('A2 scheduledStartAt mismatch', secret, [legal], [invalid]),
    );
  }

  {
    const secret = 'SEMANTIC_SECRET_A2_ESTIMATE';
    const legal = makeTask(secret, {estimatedMinutes: 1});
    const invalid = makeTask(secret, {estimatedMinutes: 0});
    cases.push(
      semanticCase('A2 nonpositive estimatedMinutes', secret, [legal], [invalid]),
    );
  }

  {
    const secret = 'SEMANTIC_SECRET_A2_FIRST_STEP';
    const legal = makeTask(secret, {firstStep: 'Open the task'});
    const invalid = makeTask(secret, {firstStep: '   '});
    cases.push(
      semanticCase('A2 blank firstStep', secret, [legal], [invalid]),
    );
  }

  return cases;
}
