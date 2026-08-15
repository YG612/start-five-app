import {
  AtomicReminderScheduler,
  ByteDiagnosisRepository,
  ByteReminderRepository,
  ManualBarrier,
  PhysicalDiagnosisBackend,
  PhysicalReminderBackend,
  PhysicalSchedulerBackend,
  type DelayDiagnosis,
  type DelayDiagnosisOperationRecord,
  type ReminderIntent,
  type ReminderScheduleSnapshot,
  type ReminderStateRecord,
} from './testKit';

const REMINDER_INTENT: ReminderIntent = {
  taskId: 'helper-task',
  ruleId: 'helper-rule',
  kind: 'start',
  triggerAt: '2026-08-05T10:00:00.000Z',
};

const REMINDER_SNAPSHOT: ReminderScheduleSnapshot = {
  taskId: 'helper-task',
  generation: 1,
  permission: 'granted',
  intents: [REMINDER_INTENT],
  scheduled: true,
};

const REMINDER_RECORD: ReminderStateRecord = {
  snapshot: REMINDER_SNAPSHOT,
  binding: {operationId: 'helper-operation', fingerprint: 'helper-fingerprint'},
};

const DIAGNOSIS: DelayDiagnosis = {
  id: 'helper-diagnosis',
  taskId: 'helper-task',
  focusSessionId: null,
  trigger: 'user_stuck',
  reasonKey: 'task_too_large',
  privateText: 'private helper text',
  suggestions: [{kind: 'first_step', value: 'Open the document'}],
  createdAt: '2026-08-05T10:00:00.000Z',
};

const DIAGNOSIS_OPERATION: DelayDiagnosisOperationRecord = {
  operationId: 'helper-diagnosis-operation',
  fingerprint: 'helper-diagnosis-fingerprint',
  diagnosis: DIAGNOSIS,
};

describe('GAP-P0-03A deterministic test-helper controls', () => {
  it('reconstructs reminder state only from bytes and rolls back a commit fault', async () => {
    const backend = new PhysicalReminderBackend();
    const repository = new ByteReminderRepository(backend);
    await repository.transaction(async transaction => {
      await transaction.save(REMINDER_RECORD);
    });
    const raw = backend.raw;
    expect(raw).not.toBeNull();
    const restartedBackend = new PhysicalReminderBackend();
    restartedBackend.raw = raw;
    const restarted = new ByteReminderRepository(restartedBackend);
    const loaded = await restarted.get('helper-task');
    expect(loaded).toEqual(REMINDER_RECORD);
    const fault = new Error('HELPER_REMINDER_COMMIT_FAULT');
    restartedBackend.failNextCommit = fault;
    await expect(
      restarted.transaction(async transaction => {
        await transaction.save({
          ...REMINDER_RECORD,
          snapshot: {...REMINDER_SNAPSHOT, generation: 2},
        });
      }),
    ).rejects.toBe(fault);
    expect(restartedBackend.raw).toBe(raw);
    expect((await restarted.get('helper-task'))?.snapshot.generation).toBe(1);
  });

  it('reconstructs scheduler view only from bytes and keeps replacement atomic on fault', async () => {
    const backend = new PhysicalSchedulerBackend();
    const scheduler = new AtomicReminderScheduler(backend);
    await scheduler.replace({previous: null, next: REMINDER_SNAPSHOT});
    const raw = backend.raw;
    expect(raw).not.toBeNull();
    const restartedBackend = new PhysicalSchedulerBackend();
    restartedBackend.raw = raw === null ? null : `${raw}`;
    const restarted = new AtomicReminderScheduler(restartedBackend);
    expect(await restarted.get('helper-task')).toEqual(REMINDER_SNAPSHOT);
    const next: ReminderScheduleSnapshot = {
      ...REMINDER_SNAPSHOT,
      generation: 2,
      intents: [
        {
          ...REMINDER_INTENT,
          triggerAt: '2026-08-05T11:00:00.000Z',
        },
      ],
    };
    const wrongPrevious: ReminderScheduleSnapshot = {
      ...REMINDER_SNAPSHOT,
      generation: 0,
    };
    await expect(
      restarted.replace({previous: wrongPrevious, next}),
    ).rejects.toThrow('TEST_SCHEDULER_CAS_MISMATCH');
    expect(restartedBackend.raw).toBe(raw);
    expect(await restarted.get('helper-task')).toEqual(REMINDER_SNAPSHOT);
    const fault = new Error('HELPER_SCHEDULER_FAULT');
    restartedBackend.failNext = fault;
    await expect(
      restarted.replace({previous: REMINDER_SNAPSHOT, next}),
    ).rejects.toBe(fault);
    expect(restartedBackend.raw).toBe(raw);
    expect(await restarted.get('helper-task')).toEqual(REMINDER_SNAPSHOT);
  });

  it('serializes diagnosis and operation records through raw bytes with atomic rollback', async () => {
    const backend = new PhysicalDiagnosisBackend();
    const repository = new ByteDiagnosisRepository(backend);
    await repository.transaction(async transaction => {
      await transaction.saveDiagnosis(DIAGNOSIS);
      await transaction.saveOperation(DIAGNOSIS_OPERATION);
    });
    const raw = backend.raw;
    expect(raw).not.toBeNull();
    const restartedBackend = new PhysicalDiagnosisBackend();
    restartedBackend.raw = raw;
    const restarted = new ByteDiagnosisRepository(restartedBackend);
    expect(await restarted.list('helper-task')).toEqual([DIAGNOSIS]);
    await restarted.transaction(async transaction => {
      expect(await transaction.getOperation('helper-diagnosis-operation'))
        .toEqual(DIAGNOSIS_OPERATION);
    });
    const fault = new Error('HELPER_DIAGNOSIS_COMMIT_FAULT');
    restartedBackend.failNextCommit = fault;
    await expect(
      restarted.transaction(async transaction => {
        await transaction.saveDiagnosis({...DIAGNOSIS, id: 'failed-diagnosis'});
      }),
    ).rejects.toBe(fault);
    expect(restartedBackend.raw).toBe(raw);
    expect(await restarted.list('helper-task')).toEqual([DIAGNOSIS]);
  });

  it('releases a manual barrier without timers, polling, or wall-clock waits', async () => {
    const barrier = new ManualBarrier();
    let passed = false;
    const pending = barrier.wait().then(() => {
      passed = true;
    });
    await barrier.entered;
    expect(passed).toBe(false);
    barrier.release();
    await pending;
    expect(passed).toBe(true);
  });
});
