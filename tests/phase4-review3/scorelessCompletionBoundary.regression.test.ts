import {createPersistentTaskStorage} from '../../src/data/persistentTaskStorage';
import {createTaskRepository} from '../../src/data/taskRepository';
import type {Task} from '../../src/domain/task';
import {
  captureOutcome,
  InspectableBackend,
  InspectableDirectStorage,
  makeCompletedTask,
  outcomeIdentity,
  PHASE4_REVIEW3_STORAGE_KEY,
  serializeEnvelope,
} from './phase4Review3Fixtures';

function modernScorelessMissingStart(): Task {
  return makeCompletedTask('modern-scoreless-missing-start', {
    startedAt: null,
    score: null,
    scoreAwardedAt: null,
  });
}

const INVALID_IDENTITY = {
  status: 'rejected',
  code: 'TASK_SNAPSHOT_INVALID',
  message: 'TASK_SNAPSHOT_INVALID',
} as const;

describe('P4-HARDENING-3 exact scoreless-completion hydration boundary', () => {
  it('rejects a modern direct scoreless-completed snapshot that is also missing startedAt', async () => {
    const task = modernScorelessMissingStart();
    const raw = JSON.stringify([task]);
    const storage = new InspectableDirectStorage();
    storage.seed(PHASE4_REVIEW3_STORAGE_KEY, raw);
    const repository = createTaskRepository(storage);

    const first = await captureOutcome(
      repository.list({includeDeleted: true}),
    );
    const retry = await captureOutcome(
      repository.list({includeDeleted: true}),
    );

    expect([first, retry].map(outcomeIdentity)).toEqual([
      INVALID_IDENTITY,
      INVALID_IDENTITY,
    ]);
    expect(storage.raw(PHASE4_REVIEW3_STORAGE_KEY)).toBe(raw);
    expect(storage.setCalls).toEqual([]);
    expect(storage.removeCalls).toEqual([]);
  });

  it('rejects the same modern scoreless/missing-start shape in a persistent envelope', async () => {
    const task = modernScorelessMissingStart();
    const envelope = serializeEnvelope([task]);
    const backend = new InspectableBackend();
    backend.seed(PHASE4_REVIEW3_STORAGE_KEY, envelope);
    const repository = createTaskRepository(
      createPersistentTaskStorage(backend),
    );

    const first = await captureOutcome(
      repository.list({includeDeleted: true}),
    );
    const retry = await captureOutcome(
      repository.list({includeDeleted: true}),
    );

    expect([first, retry].map(outcomeIdentity)).toEqual([
      INVALID_IDENTITY,
      INVALID_IDENTITY,
    ]);
    expect(backend.raw(PHASE4_REVIEW3_STORAGE_KEY)).toBe(envelope);
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeCalls).toEqual([]);
  });

  it('keeps the legacy direct scoreless-completed shape readable when it has a valid startedAt', async () => {
    const legacy = makeCompletedTask('legacy-direct-scoreless-completed', {
      score: null,
      scoreAwardedAt: null,
    });
    const raw = JSON.stringify([legacy]);
    const storage = new InspectableDirectStorage();
    storage.seed(PHASE4_REVIEW3_STORAGE_KEY, raw);
    const repository = createTaskRepository(storage);

    await expect(
      repository.list({includeDeleted: true}),
    ).resolves.toEqual([legacy]);
    expect(storage.raw(PHASE4_REVIEW3_STORAGE_KEY)).toBe(raw);
    expect(storage.setCalls).toEqual([]);
    expect(storage.removeCalls).toEqual([]);
  });
});
