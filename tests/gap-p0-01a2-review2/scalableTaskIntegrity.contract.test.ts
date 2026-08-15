import {
  CountingClock,
  CountingIds,
  createReview2Runtime,
  expectedTaskDigest,
  expectErrorCode,
  expectStrongDigest,
  locateScalableTasks,
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

async function makeScalableBackend(): Promise<PersistentReviewBackend> {
  const backend = new PersistentReviewBackend();
  backend.seedCurrentV1(
    Array.from({length: 255}, (_, index) =>
      makeReviewTask(`scalable-seed-${String(index).padStart(3, '0')}`, {
        title: `Scalable page zero marker ${String(index).padStart(3, '0')}`,
      }),
    ),
  );
  const runtime = createReview2Runtime(backend, {
    now: new CountingClock('2026-08-05T22:00:00.000Z').now,
    idGenerator: new CountingIds('scalable-created').next,
  });
  for (let index = 0; index < 3; index += 1) {
    await runtime.service.create(
      reviewCreateInput(index, {
        title: `Scalable page one marker ${String(index).padStart(3, '0')}`,
      }),
      {operationId: `scalable-integrity-create-${String(index).padStart(4, '0')}`},
    );
  }
  return backend;
}

async function expectTaskCorruptWithoutMutation(
  entries: readonly (readonly [string, string])[],
): Promise<void> {
  const backend = PersistentReviewBackend.fromSerializedRawBytes(
    serializedEntries(entries),
  );
  const runtime = createReview2Runtime(backend, {
    now: () => {
      throw new Error('A2_REVIEW2_FORBIDDEN_TASK_CORRUPTION_CLOCK');
    },
    idGenerator: () => {
      throw new Error('A2_REVIEW2_FORBIDDEN_TASK_CORRUPTION_ID');
    },
  });
  await expectErrorCode(
    runtime.service.list({includeDeleted: true}),
    'TASK_SNAPSHOT_CORRUPT',
  );
  expect(backend.setAttempts).toEqual([]);
  expect(backend.removeAttempts).toEqual([]);
  expect(backend.rawSnapshot()).toEqual(entries);
}

function changedSameLengthTitle(task: Record<string, unknown>): void {
  const title = requiredString(task, 'title');
  if (title.length === 0) {
    throw new Error('A2_REVIEW2_EMPTY_TASK_TITLE');
  }
  const last = title.slice(-1);
  task.title = `${title.slice(0, -1)}${last === 'X' ? 'Y' : 'X'}`;
  expect(requiredString(task, 'title')).toHaveLength(title.length);
}

describe('GAP-P0-01A2 Review2 scalable task integrity', () => {
  it('binds the scalable header to every ordered raw page byte with a versioned strong digest', async () => {
    const backend = await makeScalableBackend();
    const scalable = locateScalableTasks(backend.rawSnapshot());

    expect(scalable.pages.length).toBeGreaterThan(1);
    expectStrongDigest(scalable.header.value.taskDigest);
    expect(scalable.header.value.taskDigest).toBe(
      expectedTaskDigest(scalable.pages),
    );
    expect(scalable.header.value.totalCount).toBe(258);
  });

  it('rejects a same-length semantic task edit in every page after byte-only restart', async () => {
    const backend = await makeScalableBackend();
    const original = backend.rawSnapshot();
    const scalable = locateScalableTasks(original);

    for (const page of scalable.pages) {
      const pageRecord = parseJsonRecord(page.raw);
      const task = mutableRecord(requiredArray(pageRecord, 'tasks')[0]);
      changedSameLengthTitle(task);
      const tamperedRaw = JSON.stringify(pageRecord);
      expect(tamperedRaw).toHaveLength(page.raw.length);
      await expectTaskCorruptWithoutMutation(
        replaceEntry(original, page.key, tamperedRaw),
      );
    }
  });

  it('rejects semantically legal task reordering within a page', async () => {
    const backend = await makeScalableBackend();
    const original = backend.rawSnapshot();
    const scalable = locateScalableTasks(original);
    const page = scalable.pages[0];
    if (page === undefined) {
      throw new Error('A2_REVIEW2_SCALABLE_PAGE_MISSING');
    }
    const pageRecord = parseJsonRecord(page.raw);
    const tasks = requiredArray(pageRecord, 'tasks');
    const first = tasks[0];
    const second = tasks[1];
    if (first === undefined || second === undefined) {
      throw new Error('A2_REVIEW2_TWO_SCALABLE_TASKS_REQUIRED');
    }
    tasks[0] = second;
    tasks[1] = first;
    const reorderedRaw = JSON.stringify(pageRecord);
    expect(reorderedRaw).toHaveLength(page.raw.length);

    await expectTaskCorruptWithoutMutation(
      replaceEntry(original, page.key, reorderedRaw),
    );
  });

  it('rejects a semantically legal page-content swap even when page numbers and total count remain valid', async () => {
    const backend = await makeScalableBackend();
    const original = backend.rawSnapshot();
    const scalable = locateScalableTasks(original);
    const firstPage = scalable.pages[0];
    const secondPage = scalable.pages[1];
    if (firstPage === undefined || secondPage === undefined) {
      throw new Error('A2_REVIEW2_TWO_SCALABLE_PAGES_REQUIRED');
    }
    const firstRecord = parseJsonRecord(firstPage.raw);
    const secondRecord = parseJsonRecord(secondPage.raw);
    const firstTasks = requiredArray(firstRecord, 'tasks');
    const secondTasks = requiredArray(secondRecord, 'tasks');
    firstRecord.tasks = secondTasks;
    secondRecord.tasks = firstTasks;
    let tampered = replaceEntry(
      original,
      firstPage.key,
      JSON.stringify(firstRecord),
    );
    tampered = replaceEntry(
      tampered,
      secondPage.key,
      JSON.stringify(secondRecord),
    );

    await expectTaskCorruptWithoutMutation(tampered);
  });

  it('rejects a fixed-length header digest edit without rewriting or repairing source bytes', async () => {
    const backend = await makeScalableBackend();
    const original = backend.rawSnapshot();
    const scalable = locateScalableTasks(original);
    const header = parseJsonRecord(scalable.header.raw);
    const digest = requiredString(header, 'taskDigest');
    const last = digest.slice(-1);
    header.taskDigest = `${digest.slice(0, -1)}${last === '0' ? '1' : '0'}`;
    const tamperedHeader = JSON.stringify(header);
    expect(tamperedHeader).toHaveLength(scalable.header.raw.length);

    await expectTaskCorruptWithoutMutation(
      replaceEntry(original, scalable.header.key, tamperedHeader),
    );
  });
});
