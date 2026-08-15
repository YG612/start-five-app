import type {Task} from '../../src/domain/task';
import {
  CountingClock,
  CountingIds,
  createReview2Runtime,
  expectedJournalDigest,
  expectErrorCode,
  expectNoSecretInError,
  expectStrongDigest,
  ForbiddenClock,
  ForbiddenIds,
  isJsonRecord,
  locateJournal,
  makeReviewTask,
  parseJsonRecord,
  PersistentReviewBackend,
  replaceEntry,
  requiredString,
  ReviewBackendFault,
  serializedEntries,
} from './review2TestKit';

type CapturedJournal = {
  readonly capturedEntries: Array<readonly [string, string]>;
  readonly finalEntries: Array<readonly [string, string]>;
  readonly result: Task;
};

async function capturePreparedUpdateJournal(
  extraRaw: readonly (readonly [string, string])[] = [],
): Promise<CapturedJournal> {
  const backend = new PersistentReviewBackend();
  backend.seedCurrentV1([makeReviewTask('journal-target')]);
  for (const [key, value] of extraRaw) {
    backend.putRaw(key, value);
  }
  const runtime = createReview2Runtime(backend, {
    now: new CountingClock('2026-08-05T23:00:00.000Z').now,
    idGenerator: new CountingIds('journal-unused').next,
  });
  const barrier = backend.blockNextCommittedWrite();
  const operation = runtime.service.update(
    'journal-target',
    {title: 'Journal committed title'},
    {operationId: 'journal-update-operation-0001'},
  );
  await barrier.started;
  const capturedEntries = backend.rawSnapshot();
  locateJournal(capturedEntries);
  barrier.release();
  const result = await operation;
  return {capturedEntries, finalEntries: backend.rawSnapshot(), result};
}

function parseChangeList(value: string): Array<[string, string | null]> {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error('A2_REVIEW2_JOURNAL_CHANGE_LIST_INVALID');
  }
  const result: Array<[string, string | null]> = [];
  for (const entry of parsed) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      typeof entry[0] !== 'string' ||
      (entry[1] !== null && typeof entry[1] !== 'string')
    ) {
      throw new Error('A2_REVIEW2_JOURNAL_CHANGE_ENTRY_INVALID');
    }
    result.push([entry[0], entry[1]]);
  }
  return result;
}

function resignJournal(journal: Record<string, unknown>): string {
  journal.journalDigest = expectedJournalDigest(journal);
  return JSON.stringify(journal);
}

async function expectJournalRejectionWithoutWrites(
  entries: readonly (readonly [string, string])[],
  code: string,
): Promise<unknown> {
  const backend = PersistentReviewBackend.fromSerializedRawBytes(
    serializedEntries(entries),
  );
  const clock = new ForbiddenClock();
  const ids = new ForbiddenIds();
  const runtime = createReview2Runtime(backend, {
    now: clock.now,
    idGenerator: ids.next,
  });
  const error = await expectErrorCode(
    runtime.service.update(
      'journal-target',
      {title: 'Journal committed title'},
      {operationId: 'journal-update-operation-0001'},
    ),
    code,
  );
  expect({clock: clock.consumed, ids: ids.consumed}).toEqual({
    clock: 0,
    ids: 0,
  });
  expect(backend.setAttempts).toEqual([]);
  expect(backend.removeAttempts).toEqual([]);
  expect(backend.rawSnapshot()).toEqual(entries);
  return error;
}

describe('GAP-P0-01A2 Review2 journal trust boundary', () => {
  it('writes a versioned prepared journal with fixed strong request and journal digests', async () => {
    const captured = await capturePreparedUpdateJournal();
    const journal = locateJournal(captured.capturedEntries);

    expect(journal.value.version).toBe(2);
    expect(journal.value.state).toBe('prepared');
    expectStrongDigest(journal.value.fingerprint);
    expectStrongDigest(journal.value.journalDigest);
    expect(journal.value.journalDigest).toBe(
      expectedJournalDigest(journal.value),
    );
    expect(journal.key).not.toContain('Journal committed title');
    expect(requiredString(journal.value, 'fingerprint')).not.toContain(
      'Journal committed title',
    );
  });

  it.each([
    'review2.unrelated.victim',
    '../start-five.tasks.v1',
    '__proto__',
    'constructor',
    'prototype',
  ])('rejects an integrity-valid journal change outside its exact key domain: %s', async maliciousKey => {
    const safeValue = JSON.stringify({state: 'safe'});
    const ownedValue = JSON.stringify({state: 'owned'});
    const captured = await capturePreparedUpdateJournal([[maliciousKey, safeValue]]);
    const located = locateJournal(captured.capturedEntries);
    expectStrongDigest(located.value.journalDigest);
    const journal = parseJsonRecord(located.raw);
    const before = parseChangeList(requiredString(journal, 'beforeJson'));
    const after = parseChangeList(requiredString(journal, 'afterJson'));
    before.push([maliciousKey, safeValue]);
    after.push([maliciousKey, ownedValue]);
    journal.beforeJson = JSON.stringify(before);
    journal.afterJson = JSON.stringify(after);
    const forged = replaceEntry(
      captured.capturedEntries,
      located.key,
      resignJournal(journal),
    );

    await expectJournalRejectionWithoutWrites(
      forged,
      'TASK_OPERATION_LEDGER_INVALID',
    );
  });

  it('rejects unsupported versions and unknown states before touching durable bytes', async () => {
    const captured = await capturePreparedUpdateJournal();
    const located = locateJournal(captured.capturedEntries);
    expectStrongDigest(located.value.journalDigest);

    const unsupported = parseJsonRecord(located.raw);
    unsupported.version = 3;
    const unsupportedEntries = replaceEntry(
      captured.capturedEntries,
      located.key,
      resignJournal(unsupported),
    );
    await expectJournalRejectionWithoutWrites(
      unsupportedEntries,
      'TASK_OPERATION_LEDGER_UNSUPPORTED',
    );

    const unknownState = parseJsonRecord(located.raw);
    unknownState.state = 'committed-with-unknown-semantics';
    const unknownStateEntries = replaceEntry(
      captured.capturedEntries,
      located.key,
      resignJournal(unknownState),
    );
    await expectJournalRejectionWithoutWrites(
      unknownStateEntries,
      'TASK_OPERATION_LEDGER_INVALID',
    );
  });

  it('rejects an own __proto__ top-level field without prototype pollution or mutation', async () => {
    const captured = await capturePreparedUpdateJournal();
    const located = locateJournal(captured.capturedEntries);
    expectStrongDigest(located.value.journalDigest);
    const journal = parseJsonRecord(located.raw);
    Object.defineProperty(journal, '__proto__', {
      value: {polluted: true},
      enumerable: true,
      configurable: true,
      writable: true,
    });
    const forged = replaceEntry(
      captured.capturedEntries,
      located.key,
      JSON.stringify(journal),
    );

    await expectJournalRejectionWithoutWrites(
      forged,
      'TASK_OPERATION_LEDGER_INVALID',
    );
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('preflights intended page bytes against their header digest before applying any recovery write', async () => {
    const captured = await capturePreparedUpdateJournal();
    const located = locateJournal(captured.capturedEntries);
    expectStrongDigest(located.value.journalDigest);
    const journal = parseJsonRecord(located.raw);
    const after = parseChangeList(requiredString(journal, 'afterJson'));
    let changed = false;
    for (const entry of after) {
      const raw = entry[1];
      if (raw === null) {
        continue;
      }
      const parsed: unknown = JSON.parse(raw);
      if (!isJsonRecord(parsed) || !Array.isArray(parsed.entries)) {
        continue;
      }
      const marker = 'Journal committed title';
      const markerIndex = raw.lastIndexOf(marker);
      if (markerIndex < 0) {
        continue;
      }
      entry[1] = `${raw.slice(0, markerIndex)}journal committed title${raw.slice(
        markerIndex + marker.length,
      )}`;
      changed = true;
      break;
    }
    if (!changed) {
      throw new Error('A2_REVIEW2_JOURNAL_LEDGER_PAGE_CHANGE_NOT_FOUND');
    }
    journal.afterJson = JSON.stringify(after);
    const forged = replaceEntry(
      captured.capturedEntries,
      located.key,
      resignJournal(journal),
    );

    await expectJournalRejectionWithoutWrites(
      forged,
      'TASK_OPERATION_LEDGER_INVALID',
    );
  });

  it('compensates an after-write recovery fault to exact prepared bytes and remains exactly retryable', async () => {
    const captured = await capturePreparedUpdateJournal();
    const located = locateJournal(captured.capturedEntries);
    expectStrongDigest(located.value.journalDigest);
    const backend = PersistentReviewBackend.fromSerializedRawBytes(
      serializedEntries(captured.capturedEntries),
    );
    const cause = new ReviewBackendFault('A2_REVIEW2_RECOVERY_AFTER_WRITE_FAULT');
    backend.failNthForwardMutationAfter(2, cause);
    const clock = new ForbiddenClock();
    const ids = new ForbiddenIds();
    const runtime = createReview2Runtime(backend, {
      now: clock.now,
      idGenerator: ids.next,
    });

    const error = await expectErrorCode(
      runtime.service.update(
        'journal-target',
        {title: 'Journal committed title'},
        {operationId: 'journal-update-operation-0001'},
      ),
      'TASK_STORAGE_WRITE_FAILED',
    );
    if (typeof error !== 'object' || error === null || !('cause' in error)) {
      throw new Error('A2_REVIEW2_RECOVERY_ERROR_CAUSE_MISSING');
    }
    expect(error.cause).toBe(cause);
    expectNoSecretInError(error, ['Journal committed title']);
    expect({clock: clock.consumed, ids: ids.consumed}).toEqual({
      clock: 0,
      ids: 0,
    });
    expect(backend.rawSnapshot()).toEqual(captured.capturedEntries);

    backend.resetMutationObservations();
    await expect(
      runtime.service.update(
        'journal-target',
        {title: 'Journal committed title'},
        {operationId: 'journal-update-operation-0001'},
      ),
    ).resolves.toEqual(captured.result);
    expect({clock: clock.consumed, ids: ids.consumed}).toEqual({
      clock: 0,
      ids: 0,
    });
    expect(backend.rawSnapshot()).toEqual(captured.finalEntries);
  });
});
