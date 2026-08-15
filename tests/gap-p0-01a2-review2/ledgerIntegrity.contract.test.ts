import {
  CountingClock,
  CountingIds,
  createReview2Runtime,
  expectedLedgerDigest,
  expectErrorCode,
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
  reviewCreateInput,
  serializedEntries,
  sha256Hex,
} from './review2TestKit';

function replaceCharacter(value: string, index: number, replacement: string): string {
  if (index < 0 || index >= value.length || replacement.length !== 1) {
    throw new Error('A2_REVIEW2_INVALID_CHARACTER_REPLACEMENT');
  }
  return `${value.slice(0, index)}${replacement}${value.slice(index + 1)}`;
}

async function seedLongLedgerEntry(
  marker: string,
): Promise<PersistentReviewBackend> {
  const backend = new PersistentReviewBackend();
  backend.seedCurrentV1([]);
  const runtime = createReview2Runtime(backend, {
    now: new CountingClock().now,
    idGenerator: new CountingIds('integrity-create').next,
  });
  await runtime.service.create(
    reviewCreateInput(1, {
      title: 'Ledger integrity task',
      description: marker,
    }),
    {operationId: 'ledger-integrity-create-0001'},
  );
  return backend;
}

describe('GAP-P0-01A2 Review2 full-byte ledger integrity', () => {
  it('keeps the independent SHA-256 oracle pinned to public standard vectors', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex('先做5分钟')).toBe(
      '52996ef81d8eda820cbd5de963796e098e08445039960fdb7a913850193ad805',
    );
  });

  it('stores a fixed-length versioned strong digest over every raw ledger page byte', async () => {
    const marker = `MATRIX-${'A'.repeat(257)}-END`;
    const backend = await seedLongLedgerEntry(marker);
    const ledger = locateLedger(backend.rawSnapshot());

    expectStrongDigest(ledger.header.value.ledgerDigest);
    expect(ledger.header.value.ledgerDigest).toBe(
      expectedLedgerDigest(ledger.pages),
    );
    for (const page of ledger.pages) {
      expect(page.raw.length).toBeGreaterThan(512);
    }
  });

  it('rejects every same-length legal-JSON byte mutation across a 257-byte result marker', async () => {
    const marker = `RESULT-${'Q'.repeat(257)}-TAIL`;
    const backend = await seedLongLedgerEntry(marker);
    const originalEntries = backend.rawSnapshot();
    const ledger = locateLedger(originalEntries);
    const page = ledger.pages[0];
    if (page === undefined) {
      throw new Error('A2_REVIEW2_LEDGER_PAGE_MISSING');
    }
    const markerStart = page.raw.lastIndexOf(marker);
    if (markerStart < 0) {
      throw new Error('A2_REVIEW2_RESULT_MARKER_NOT_FOUND');
    }
    const payloadStart = markerStart + 'RESULT-'.length;
    const acceptedOffsets: number[] = [];

    for (let offset = 0; offset < 257; offset += 1) {
      const tamperedRaw = replaceCharacter(
        page.raw,
        payloadStart + offset,
        'R',
      );
      expect(tamperedRaw).toHaveLength(page.raw.length);
      expect(() => JSON.parse(tamperedRaw)).not.toThrow();
      const tamperedEntries = replaceEntry(
        originalEntries,
        page.key,
        tamperedRaw,
      );
      const restored = PersistentReviewBackend.fromSerializedRawBytes(
        serializedEntries(tamperedEntries),
      );
      const clock = new ForbiddenClock();
      const ids = new ForbiddenIds();
      const runtime = createReview2Runtime(restored, {
        now: clock.now,
        idGenerator: ids.next,
      });
      let error: unknown;
      try {
        await runtime.service.create(
          reviewCreateInput(1, {
            title: 'Ledger integrity task',
            description: marker,
          }),
          {operationId: 'ledger-integrity-create-0001'},
        );
      } catch (caught: unknown) {
        error = caught;
      }
      if (error === undefined) {
        acceptedOffsets.push(offset);
      } else {
        expect(error).toMatchObject({code: 'TASK_OPERATION_LEDGER_CORRUPT'});
      }
      expect({clock: clock.consumed, ids: ids.consumed}).toEqual({
        clock: 0,
        ids: 0,
      });
      expect(restored.setAttempts).toEqual([]);
      expect(restored.removeAttempts).toEqual([]);
      expect(restored.rawSnapshot()).toEqual(tamperedEntries);
    }

    expect(acceptedOffsets).toEqual([]);
  });

  it('covers every ledger page and rejects legal result-byte edits before dependencies or writes', async () => {
    const marker = `PAGE-MATRIX-${'S'.repeat(96)}-TAIL`;
    const backend = new PersistentReviewBackend();
    backend.seedCurrentV1([
      makeReviewTask('multi-page-ledger-target', {description: marker}),
    ]);
    const runtime = createReview2Runtime(backend, {
      now: new CountingClock().now,
      idGenerator: new CountingIds('multi-page-unused').next,
    });
    for (let index = 0; index < 105; index += 1) {
      await runtime.service.update(
        'multi-page-ledger-target',
        {title: `Multi-page title ${String(index).padStart(3, '0')}`},
        {operationId: `multi-page-operation-${String(index).padStart(4, '0')}`},
      );
    }
    const originalEntries = backend.rawSnapshot();
    const ledger = locateLedger(originalEntries);
    expect(ledger.pages.length).toBeGreaterThan(1);
    expectStrongDigest(ledger.header.value.ledgerDigest);
    expect(ledger.header.value.ledgerDigest).toBe(
      expectedLedgerDigest(ledger.pages),
    );

    const missed: string[] = [];
    for (const page of ledger.pages) {
      const markerStart = page.raw.lastIndexOf(marker);
      if (markerStart < 0) {
        throw new Error(`A2_REVIEW2_PAGE_MARKER_NOT_FOUND:${String(page.page)}`);
      }
      const payloadStart = markerStart + 'PAGE-MATRIX-'.length;
      for (const offset of [0, 1, 7, 19, 37, 63, 95]) {
        const tamperedRaw = replaceCharacter(
          page.raw,
          payloadStart + offset,
          'T',
        );
        const tamperedEntries = replaceEntry(
          originalEntries,
          page.key,
          tamperedRaw,
        );
        const restored = PersistentReviewBackend.fromSerializedRawBytes(
          serializedEntries(tamperedEntries),
        );
        const clock = new ForbiddenClock();
        const ids = new ForbiddenIds();
        const restoredRuntime = createReview2Runtime(restored, {
          now: clock.now,
          idGenerator: ids.next,
        });
        let error: unknown;
        try {
          await restoredRuntime.service.update(
            'multi-page-ledger-target',
            {title: 'must never execute'},
            {operationId: `tampered-page-${String(page.page)}-${String(offset)}`},
          );
        } catch (caught: unknown) {
          error = caught;
        }
        if (
          typeof error !== 'object' ||
          error === null ||
          !('code' in error) ||
          error.code !== 'TASK_OPERATION_LEDGER_CORRUPT'
        ) {
          missed.push(`${String(page.page)}:${String(offset)}`);
        }
        expect({clock: clock.consumed, ids: ids.consumed}).toEqual({
          clock: 0,
          ids: 0,
        });
        expect(restored.setAttempts).toEqual([]);
        expect(restored.removeAttempts).toEqual([]);
        expect(restored.rawSnapshot()).toEqual(tamperedEntries);
      }
    }
    expect(missed).toEqual([]);
  });

  it('validates an entry result semantically after an independently recomputed valid page chain', async () => {
    const backend = await seedLongLedgerEntry('semantic-result-marker');
    const originalEntries = backend.rawSnapshot();
    const ledger = locateLedger(originalEntries);
    const page = ledger.pages[0];
    if (page === undefined) {
      throw new Error('A2_REVIEW2_LEDGER_PAGE_MISSING');
    }
    const pageRecord = parseJsonRecord(page.raw);
    const firstEntry = mutableRecord(requiredArray(pageRecord, 'entries')[0]);
    firstEntry.resultJson = '{}';
    const modifiedPageRaw = JSON.stringify(pageRecord);
    let modifiedEntries = replaceEntry(
      originalEntries,
      page.key,
      modifiedPageRaw,
    );
    const modifiedLedger = locateLedger(modifiedEntries);
    const modifiedHeader = parseJsonRecord(modifiedLedger.header.raw);
    modifiedHeader.ledgerDigest = expectedLedgerDigest(modifiedLedger.pages);
    modifiedEntries = replaceEntry(
      modifiedEntries,
      modifiedLedger.header.key,
      JSON.stringify(modifiedHeader),
    );
    const restored = PersistentReviewBackend.fromSerializedRawBytes(
      serializedEntries(modifiedEntries),
    );
    const runtime = createReview2Runtime(restored, {
      now: new ForbiddenClock().now,
      idGenerator: new ForbiddenIds().next,
    });

    await expectErrorCode(
      runtime.service.update(
        'integrity-create-0001',
        {title: 'must not execute'},
        {operationId: 'semantic-result-probe'},
      ),
      'TASK_OPERATION_LEDGER_INVALID',
    );
    expect(restored.setAttempts).toEqual([]);
    expect(restored.removeAttempts).toEqual([]);
    expect(restored.rawSnapshot()).toEqual(modifiedEntries);
  });
});
