import {materializePlainJsonData} from '../../src/data/taskSnapshotValidation';
import {
  CountingClock,
  CountingIds,
  createPersistentReviewRuntime,
  expectErrorCode,
  makeReviewSubtask,
  makeReviewTask,
  PersistentReviewBackend,
} from './review1TestKit';

function uniqueContainerGraph(includeExtra: boolean): {
  groups: object[][];
  extra?: object;
} {
  const graph: {groups: object[][]; extra?: object} = {
    groups: Array.from({length: 255}, () => [{}]),
  };
  if (includeExtra) {
    graph.extra = {};
  }
  return graph;
}

describe('GAP-P0-01A2 Review1 untrusted-value budget controls', () => {
  it('keeps the generic single-array boundary at 256 accepted and 257 rejected', () => {
    const accepted = Array.from({length: 256}, (_, index) => index);

    const detached = materializePlainJsonData(accepted);

    expect(detached).toEqual(accepted);
    expect(detached).not.toBe(accepted);
    expect(() =>
      materializePlainJsonData(
        Array.from({length: 257}, (_, index) => index),
      ),
    ).toThrow(expect.objectContaining({code: 'TASK_SNAPSHOT_INVALID'}));
  });

  it('keeps the generic unique-container boundary at 512 accepted and 513 rejected', () => {
    const accepted = uniqueContainerGraph(false);

    const detached = materializePlainJsonData(accepted);

    expect(detached).toEqual(accepted);
    expect(detached).not.toBe(accepted);
    expect(() => materializePlainJsonData(uniqueContainerGraph(true))).toThrow(
      expect.objectContaining({code: 'TASK_SNAPSHOT_INVALID'}),
    );
  });

  it('keeps a targeted task subtask array bounded at 256 without imposing that cap on the product collection', async () => {
    const acceptedBackend = new PersistentReviewBackend();
    acceptedBackend.seedCurrentV1([]);
    const acceptedRuntime = createPersistentReviewRuntime(acceptedBackend, {
      now: new CountingClock().now,
      idGenerator: new CountingIds().next,
    });
    const acceptedTask = makeReviewTask('target-with-256-subtasks', {
      subtasks: Array.from({length: 256}, (_, index) =>
        makeReviewSubtask('target-with-256-subtasks', index),
      ),
    });

    await expect(acceptedRuntime.repository.create(acceptedTask)).resolves.toEqual(
      acceptedTask,
    );

    const rejectedBackend = new PersistentReviewBackend();
    rejectedBackend.seedCurrentV1([]);
    const rejectedRuntime = createPersistentReviewRuntime(rejectedBackend, {
      now: new CountingClock().now,
      idGenerator: new CountingIds().next,
    });
    const rejectedTask = makeReviewTask('target-with-257-subtasks', {
      subtasks: Array.from({length: 257}, (_, index) =>
        makeReviewSubtask('target-with-257-subtasks', index),
      ),
    });

    await expectErrorCode(
      rejectedRuntime.repository.create(rejectedTask),
      'TASK_SNAPSHOT_INVALID',
    );
    await expect(rejectedRuntime.repository.list()).resolves.toEqual([]);
  });

  it('keeps hostile Proxy input fail-closed without executing a durable write', async () => {
    const backend = new PersistentReviewBackend();
    backend.seedCurrentV1([]);
    const runtime = createPersistentReviewRuntime(backend, {
      now: new CountingClock().now,
      idGenerator: new CountingIds().next,
    });
    const proxied = new Proxy(makeReviewTask('proxy-task'), {
      ownKeys() {
        throw new Error('A2_REVIEW1_PROXY_TRAP_MUST_NOT_ESCAPE');
      },
    });
    const rawBefore = backend.rawSnapshot();

    const error = await expectErrorCode(
      runtime.repository.create(proxied),
      'TASK_SNAPSHOT_INVALID',
    );

    expect(error).not.toMatchObject({
      message: expect.stringContaining('PROXY_TRAP'),
    });
    expect(backend.rawSnapshot()).toEqual(rawBefore);
  });
});
