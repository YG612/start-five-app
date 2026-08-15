import {
  ARRAY_OVER_GET_BUDGET,
  ARRAY_WITHIN_GET_BUDGET,
  auditedProxy,
  captureSyncOutcome,
  CONTAINER_NODE_GET_BUDGET,
  createHarness,
  LINEAR_DEPTH_GET_BUDGET,
  makeExactContainerTree,
  makeLinearChain,
  makePendingSubtask,
  makePendingTask,
  makeWideArray,
  MAX_ARRAY_LENGTH,
  MAX_CONTAINER_NODES,
  MAX_NESTING_DEPTH,
  OrdinaryGetBudgetAudit,
  outcomeIdentity,
} from './phase4Review5Fixtures';
import {materializePlainJsonData} from '../../src/data/taskSnapshotValidation';

const INVALID_IDENTITY = {
  status: 'rejected',
  code: 'TASK_SNAPSHOT_INVALID',
  message: 'TASK_SNAPSHOT_INVALID',
} as const;

describe('P4-HARDENING-5 deterministic snapshot resource limits', () => {
  it('fully traverses an array of 256 but rejects length 257 before reading an entry', () => {
    const within = makeWideArray(
      MAX_ARRAY_LENGTH,
      ARRAY_WITHIN_GET_BUDGET,
    );
    const over = makeWideArray(
      MAX_ARRAY_LENGTH + 1,
      ARRAY_OVER_GET_BUDGET,
    );

    const materializedWithin = materializePlainJsonData(within.proxy);
    const rejected = captureSyncOutcome(() =>
      materializePlainJsonData(over.proxy),
    );

    expect(materializedWithin).toEqual(within.target);
    expect(materializedWithin).not.toBe(within.proxy);
    expect(within.audit.exceeded).toBe(false);
    expect(within.audit.attempts).toBe(ARRAY_WITHIN_GET_BUDGET);
    expect(outcomeIdentity(rejected)).toEqual(INVALID_IDENTITY);
    expect(over.audit.exceeded).toBe(false);
    expect(over.audit.attempts).toBe(ARRAY_OVER_GET_BUDGET);
  });

  it('accepts the existing 256-level traversal envelope but rejects level 257 before reading the over-limit node', () => {
    const within = makeLinearChain(MAX_NESTING_DEPTH);
    const over = makeLinearChain(MAX_NESTING_DEPTH + 1);

    const materializedWithin = materializePlainJsonData(within.root);
    const overRejected = captureSyncOutcome(() =>
      materializePlainJsonData(over.root),
    );

    expect(materializedWithin).not.toBe(within.root);
    expect(Object.getPrototypeOf(materializedWithin)).toBe(Object.prototype);
    expect(within.audit.exceeded).toBe(false);
    expect(within.audit.attempts).toBe(LINEAR_DEPTH_GET_BUDGET);
    expect(outcomeIdentity(overRejected)).toEqual(INVALID_IDENTITY);
    expect(over.audit.exceeded).toBe(false);
    expect(over.audit.attempts).toBeLessThanOrEqual(
      LINEAR_DEPTH_GET_BUDGET,
    );
  });

  it('fully traverses exactly 512 aggregate containers but rejects container 513 within a per-node linear bound', () => {
    const within = makeExactContainerTree(
      MAX_CONTAINER_NODES,
      CONTAINER_NODE_GET_BUDGET,
    );
    const over = makeExactContainerTree(
      MAX_CONTAINER_NODES + 1,
      CONTAINER_NODE_GET_BUDGET,
    );

    const materializedWithin = materializePlainJsonData(within.root);
    const rejected = captureSyncOutcome(() =>
      materializePlainJsonData(over.root),
    );

    expect(materializedWithin).not.toBe(within.root);
    expect(Object.getPrototypeOf(materializedWithin)).toBe(Object.prototype);
    expect(within.audit.exceeded).toBe(false);
    expect(within.audit.attempts).toBe(CONTAINER_NODE_GET_BUDGET);
    expect(outcomeIdentity(rejected)).toEqual(INVALID_IDENTITY);
    expect(over.audit.exceeded).toBe(false);
    expect(over.audit.attempts).toBeLessThanOrEqual(
      CONTAINER_NODE_GET_BUDGET,
    );
  });

  it('keeps a small legal subtask array and transparent task Proxy usable', async () => {
    const {backend, repository} = createHarness([]);
    const taskId = 'small-transparent-array';
    const subtaskTarget = Array.from({length: 3}, (_, index) =>
      makePendingSubtask(taskId, index),
    );
    const audit = new OrdinaryGetBudgetAudit(12);
    const subtaskProxy = auditedProxy(
      subtaskTarget,
      'small-subtask-array',
      audit,
    );
    const taskTarget = makePendingTask(taskId, {subtasks: subtaskProxy});
    const taskProxy = new Proxy(taskTarget, {});

    const created = await repository.create(taskProxy);

    expect(created).toMatchObject({id: taskId, title: taskTarget.title});
    expect(created.subtasks).toEqual(subtaskTarget);
    expect(audit.exceeded).toBe(false);
    expect(audit.attempts).toBe(3);
    expect(backend.setAttempts).toHaveLength(1);
    expect(backend.setCommits).toHaveLength(1);
    expect(backend.removeAttempts).toEqual([]);
  });
});
