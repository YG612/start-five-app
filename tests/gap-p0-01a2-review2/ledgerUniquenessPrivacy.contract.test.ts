import {
  CountingClock,
  CountingIds,
  createReview2Runtime,
  expectedLedgerDigest,
  expectErrorCode,
  expectNoSecretInError,
  expectStrongDigest,
  ForbiddenClock,
  ForbiddenIds,
  locateLedger,
  makeReviewTask,
  mutableRecord,
  parseJsonRecord,
  PersistentReviewBackend,
  replaceEntry,
  requiredArray,
  requiredString,
  reviewCreateInput,
  serializedEntries,
} from './review2TestKit';

function resignLedger(
  entries: readonly (readonly [string, string])[],
  pageKey: string,
  pageRecord: Record<string, unknown>,
): Array<readonly [string, string]> {
  let rewritten = replaceEntry(entries, pageKey, JSON.stringify(pageRecord));
  const located = locateLedger(rewritten);
  const header = parseJsonRecord(located.header.raw);
  header.ledgerDigest = expectedLedgerDigest(located.pages);
  rewritten = replaceEntry(
    rewritten,
    located.header.key,
    JSON.stringify(header),
  );
  return rewritten;
}

function firstTwoEntries(page: Record<string, unknown>): {
  readonly first: Record<string, unknown>;
  readonly second: Record<string, unknown>;
} {
  const entries = requiredArray(page, 'entries');
  const first = mutableRecord(entries[0]);
  const second = mutableRecord(entries[1]);
  return {first, second};
}

async function expectInvalidLedgerWithoutEffects(
  entries: readonly (readonly [string, string])[],
  operationId: string,
): Promise<void> {
  const backend = PersistentReviewBackend.fromSerializedRawBytes(
    serializedEntries(entries),
  );
  const clock = new ForbiddenClock();
  const ids = new ForbiddenIds();
  const runtime = createReview2Runtime(backend, {
    now: clock.now,
    idGenerator: ids.next,
  });
  await expectErrorCode(
    runtime.service.update(
      'ledger-unique-target',
      {title: 'must not execute'},
      {operationId},
    ),
    'TASK_OPERATION_LEDGER_INVALID',
  );
  expect({clock: clock.consumed, ids: ids.consumed}).toEqual({
    clock: 0,
    ids: 0,
  });
  expect(backend.setAttempts).toEqual([]);
  expect(backend.removeAttempts).toEqual([]);
  expect(backend.rawSnapshot()).toEqual(entries);
}

describe('GAP-P0-01A2 Review2 global ledger uniqueness', () => {
  it('rejects a non-requested duplicate operationId in one page even under a valid strong digest', async () => {
    const backend = new PersistentReviewBackend();
    backend.seedCurrentV1([makeReviewTask('ledger-unique-target')]);
    const runtime = createReview2Runtime(backend, {
      now: new CountingClock().now,
      idGenerator: new CountingIds('unique-unused').next,
    });
    for (let index = 0; index < 3; index += 1) {
      await runtime.service.update(
        'ledger-unique-target',
        {title: `Unique title ${String(index)}`},
        {operationId: `same-page-operation-${String(index).padStart(4, '0')}`},
      );
    }
    const original = backend.rawSnapshot();
    const ledger = locateLedger(original);
    const page = ledger.pages[0];
    if (page === undefined) {
      throw new Error('A2_REVIEW2_LEDGER_PAGE_MISSING');
    }
    const pageRecord = parseJsonRecord(page.raw);
    const {first, second} = firstTwoEntries(pageRecord);
    second.operationId = requiredString(first, 'operationId');
    const forged = resignLedger(original, page.key, pageRecord);

    await expectInvalidLedgerWithoutEffects(
      forged,
      'unrelated-same-page-duplicate-probe',
    );
  });

  it('rejects a non-requested duplicate operationId across two pages under a valid strong digest', async () => {
    const backend = new PersistentReviewBackend();
    backend.seedCurrentV1([makeReviewTask('ledger-unique-target')]);
    const runtime = createReview2Runtime(backend, {
      now: new CountingClock().now,
      idGenerator: new CountingIds('cross-page-unused').next,
    });
    for (let index = 0; index < 101; index += 1) {
      await runtime.service.update(
        'ledger-unique-target',
        {description: `Cross-page description ${String(index).padStart(3, '0')}`},
        {operationId: `cross-page-operation-${String(index).padStart(4, '0')}`},
      );
    }
    const original = backend.rawSnapshot();
    const ledger = locateLedger(original);
    expect(ledger.pages).toHaveLength(2);
    const firstPage = ledger.pages[0];
    const secondPage = ledger.pages[1];
    if (firstPage === undefined || secondPage === undefined) {
      throw new Error('A2_REVIEW2_TWO_LEDGER_PAGES_REQUIRED');
    }
    const firstPageRecord = parseJsonRecord(firstPage.raw);
    const secondPageRecord = parseJsonRecord(secondPage.raw);
    const firstEntry = mutableRecord(requiredArray(firstPageRecord, 'entries')[0]);
    const crossPageEntry = mutableRecord(
      requiredArray(secondPageRecord, 'entries')[0],
    );
    crossPageEntry.operationId = requiredString(firstEntry, 'operationId');
    const forged = resignLedger(original, secondPage.key, secondPageRecord);

    await expectInvalidLedgerWithoutEffects(
      forged,
      'unrelated-cross-page-duplicate-probe',
    );
  });
});

describe('GAP-P0-01A2 Review2 fixed-size private metadata', () => {
  it('uses fixed-size strong task bindings and fingerprints without title, description, first-step, or raw task JSON', async () => {
    const secrets = {
      title: `TITLE-SECRET-${'T'.repeat(513)}`,
      description: `DESCRIPTION-SECRET-${'D'.repeat(777)}`,
      firstStep: `FIRST-STEP-SECRET-${'F'.repeat(333)}`,
    };
    const longBackend = new PersistentReviewBackend();
    longBackend.seedCurrentV1([]);
    const longRuntime = createReview2Runtime(longBackend, {
      now: new CountingClock().now,
      idGenerator: new CountingIds('privacy-long').next,
    });
    await longRuntime.service.create(
      reviewCreateInput(1, {
        title: secrets.title,
        description: secrets.description,
        firstStep: secrets.firstStep,
      }),
      {operationId: 'privacy-fixed-size-operation'},
    );

    const shortBackend = new PersistentReviewBackend();
    shortBackend.seedCurrentV1([]);
    const shortRuntime = createReview2Runtime(shortBackend, {
      now: new CountingClock().now,
      idGenerator: new CountingIds('privacy-short').next,
    });
    await shortRuntime.service.create(
      reviewCreateInput(1, {
        title: 'Short',
        description: 'Small',
        firstStep: 'Begin',
      }),
      {operationId: 'privacy-fixed-size-operation'},
    );

    const longLedger = locateLedger(longBackend.rawSnapshot());
    const shortLedger = locateLedger(shortBackend.rawSnapshot());
    expectStrongDigest(longLedger.header.value.taskBinding);
    expectStrongDigest(shortLedger.header.value.taskBinding);
    expectStrongDigest(longLedger.header.value.ledgerDigest);
    expectStrongDigest(shortLedger.header.value.ledgerDigest);
    expect(longLedger.header.raw).toHaveLength(shortLedger.header.raw.length);

    const longEntry = mutableRecord(
      requiredArray(longLedger.pages[0]?.value ?? {}, 'entries')[0],
    );
    const shortEntry = mutableRecord(
      requiredArray(shortLedger.pages[0]?.value ?? {}, 'entries')[0],
    );
    expectStrongDigest(longEntry.fingerprint);
    expectStrongDigest(shortEntry.fingerprint);
    expect(requiredString(longEntry, 'fingerprint')).toHaveLength(
      requiredString(shortEntry, 'fingerprint').length,
    );

    const forbidden = [secrets.title, secrets.description, secrets.firstStep];
    for (const secret of forbidden) {
      expect(longLedger.header.raw).not.toContain(secret);
      expect(requiredString(longEntry, 'fingerprint')).not.toContain(secret);
    }
    expect(longLedger.header.raw).not.toContain('\\"title\\"');
    expect(longLedger.header.raw).not.toContain('\\"description\\"');
    expect(longLedger.header.raw).not.toContain('\\"firstStep\\"');
  });

  it('does not leak private request text through conflict errors, storage keys, or mutation histories', async () => {
    const backend = new PersistentReviewBackend();
    backend.seedCurrentV1([]);
    const runtime = createReview2Runtime(backend, {
      now: new CountingClock().now,
      idGenerator: new CountingIds('privacy-error').next,
    });
    const firstSecret = 'PRIVATE-FIRST-COMMAND-TEXT';
    const conflictingSecret = 'PRIVATE-CONFLICTING-COMMAND-TEXT';
    await runtime.service.create(
      reviewCreateInput(1, {title: firstSecret}),
      {operationId: 'privacy-conflict-operation'},
    );
    backend.resetMutationObservations();
    const before = backend.rawSnapshot();

    const error = await expectErrorCode(
      runtime.service.create(
        reviewCreateInput(1, {title: conflictingSecret}),
        {operationId: 'privacy-conflict-operation'},
      ),
      'OPERATION_ID_CONFLICT',
    );

    expectNoSecretInError(error, [firstSecret, conflictingSecret]);
    for (const key of backend.nonPrimaryKeys()) {
      expect(key).not.toContain(firstSecret);
      expect(key).not.toContain(conflictingSecret);
    }
    expect(backend.setAttempts).toEqual([]);
    expect(backend.removeAttempts).toEqual([]);
    expect(backend.rawSnapshot()).toEqual(before);
  });
});
