import type {AsyncKeyValueBackend} from './persistentTaskStorage';
import {
  EMPTY_POST_FOCUS_REVIEW_STORE,
  type ActivePostFocusReview,
  type FocusReviewReceipt,
  type PendingFocusReview,
  type PostFocusReviewEndKind,
  type PostFocusReviewOutcome,
  type PostFocusReviewStore,
  type SettlingFocusReview,
  type TrackedFocusReview,
} from '../domain/postFocusReview';
import type {Quadrant} from '../domain/quadrant';

export const POST_FOCUS_REVIEW_STORAGE_KEY =
  'start-five.post-focus-review.v1';

export type PostFocusReviewRepositoryUpdate<T> = Readonly<{
  next: PostFocusReviewStore | null;
  result: T;
}>;

export type PostFocusReviewRepository = Readonly<{
  read(): Promise<PostFocusReviewStore>;
  update<T>(
    work: (
      current: PostFocusReviewStore,
    ) =>
      | PostFocusReviewRepositoryUpdate<T>
      | Promise<PostFocusReviewRepositoryUpdate<T>>,
  ): Promise<T>;
}>;

class PostFocusReviewStorageError extends Error {
  readonly cause: unknown;

  constructor(code: string, cause: unknown) {
    super(code);
    this.name = 'PostFocusReviewStorageError';
    this.cause = cause;
  }
}

type JsonRecord = Record<string, unknown>;

function invalidSnapshot(): never {
  throw new Error('POST_FOCUS_REVIEW_INVALID_SNAPSHOT');
}

function asRecord(value: unknown): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalidSnapshot();
  }
  return value as JsonRecord;
}

function requiredString(record: JsonRecord, field: string): string {
  const value = record[field];
  if (typeof value !== 'string' || value.trim() === '') {
    return invalidSnapshot();
  }
  return value;
}

function noteString(record: JsonRecord): string {
  const value = record.note;
  if (typeof value !== 'string') {
    return invalidSnapshot();
  }
  return value;
}

function canonicalTimestamp(record: JsonRecord, field: string): string {
  const value = requiredString(record, field);
  const milliseconds = Date.parse(value);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    return invalidSnapshot();
  }
  return value;
}

function optionalCanonicalTimestamp(
  record: JsonRecord,
  field: string,
): string | null {
  const value = record[field];
  if (value === undefined || value === null) {
    return null;
  }
  return canonicalTimestamp(record, field);
}

function nonNegativeInteger(record: JsonRecord, field: string): number {
  const value = record[field];
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    return invalidSnapshot();
  }
  return value;
}

function booleanField(record: JsonRecord, field: string): boolean {
  const value = record[field];
  if (typeof value !== 'boolean') {
    return invalidSnapshot();
  }
  return value;
}

function quadrant(record: JsonRecord): Quadrant {
  const value = record.quadrant;
  if (value !== 'Q1' && value !== 'Q2' && value !== 'Q3' && value !== 'Q4') {
    return invalidSnapshot();
  }
  return value;
}

function endKind(record: JsonRecord): PostFocusReviewEndKind {
  const value = record.endKind;
  if (value !== 'natural' && value !== 'interrupted') {
    return invalidSnapshot();
  }
  return value;
}

function outcome(record: JsonRecord): PostFocusReviewOutcome {
  const value = record.outcome;
  if (value !== 'progress' && value !== 'complete') {
    return invalidSnapshot();
  }
  return value;
}

function parseTracking(value: unknown): TrackedFocusReview {
  const record = asRecord(value);
  if (record.kind !== 'tracking') {
    return invalidSnapshot();
  }
  return {
    kind: 'tracking',
    reviewId: requiredString(record, 'reviewId'),
    receiptId: requiredString(record, 'receiptId'),
    completionOperationId: requiredString(record, 'completionOperationId'),
    sessionId: requiredString(record, 'sessionId'),
    taskId: requiredString(record, 'taskId'),
    taskTitle: requiredString(record, 'taskTitle'),
    quadrant: quadrant(record),
    startedAt: canonicalTimestamp(record, 'startedAt'),
    plannedEndAt: canonicalTimestamp(record, 'plannedEndAt'),
    legacyCompletionShortcut: booleanField(
      record,
      'legacyCompletionShortcut',
    ),
  };
}

function parsePending(value: unknown): PendingFocusReview {
  const record = asRecord(value);
  if (record.kind !== 'pending') {
    return invalidSnapshot();
  }
  return {
    kind: 'pending',
    reviewId: requiredString(record, 'reviewId'),
    receiptId: requiredString(record, 'receiptId'),
    completionOperationId: requiredString(record, 'completionOperationId'),
    sessionId: requiredString(record, 'sessionId'),
    taskId: requiredString(record, 'taskId'),
    taskTitle: requiredString(record, 'taskTitle'),
    quadrant: quadrant(record),
    startedAt: canonicalTimestamp(record, 'startedAt'),
    endedAt: canonicalTimestamp(record, 'endedAt'),
    actualSeconds: nonNegativeInteger(record, 'actualSeconds'),
    endKind: endKind(record),
    legacyCompletionShortcut: booleanField(
      record,
      'legacyCompletionShortcut',
    ),
  };
}

function parseSettling(value: unknown): SettlingFocusReview {
  const record = asRecord(value);
  if (record.kind !== 'settling') {
    return invalidSnapshot();
  }
  const stage = record.stage;
  if (stage !== 'task_commit_needed' && stage !== 'task_committed') {
    return invalidSnapshot();
  }
  const points = record.awardedPoints;
  if (
    points !== null &&
    (typeof points !== 'number' ||
      !Number.isSafeInteger(points) ||
      points < 0)
  ) {
    return invalidSnapshot();
  }
  if (stage === 'task_committed' && points === null) {
    return invalidSnapshot();
  }
  const completionQuadrant = record.completionQuadrant;
  if (
    completionQuadrant !== null &&
    completionQuadrant !== 'Q1' &&
    completionQuadrant !== 'Q2' &&
    completionQuadrant !== 'Q3' &&
    completionQuadrant !== 'Q4'
  ) {
    return invalidSnapshot();
  }
  if (stage === 'task_committed' && completionQuadrant === null) {
    return invalidSnapshot();
  }
  return {
    kind: 'settling',
    review: parsePending(record.review),
    outcome: outcome(record),
    note: noteString(record),
    settledAt: canonicalTimestamp(record, 'settledAt'),
    stage,
    awardedPoints: points,
    completionQuadrant,
  };
}

function parseReceipt(value: unknown): FocusReviewReceipt {
  const record = asRecord(value);
  if (record.kind !== 'receipt') {
    return invalidSnapshot();
  }
  const statsDay = requiredString(record, 'statsDay');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(statsDay)) {
    return invalidSnapshot();
  }
  return {
    kind: 'receipt',
    receiptId: requiredString(record, 'receiptId'),
    reviewId: requiredString(record, 'reviewId'),
    sessionId: requiredString(record, 'sessionId'),
    taskId: requiredString(record, 'taskId'),
    taskTitle: requiredString(record, 'taskTitle'),
    quadrant: quadrant(record),
    startedAt: canonicalTimestamp(record, 'startedAt'),
    endedAt: canonicalTimestamp(record, 'endedAt'),
    actualSeconds: nonNegativeInteger(record, 'actualSeconds'),
    endKind: endKind(record),
    outcome: outcome(record),
    note: noteString(record),
    awardedPoints: nonNegativeInteger(record, 'awardedPoints'),
    reason: requiredString(record, 'reason'),
    settledAt: canonicalTimestamp(record, 'settledAt'),
    statsDay,
    todayFocusCount: nonNegativeInteger(record, 'todayFocusCount'),
    todayFocusMinutes: nonNegativeInteger(record, 'todayFocusMinutes'),
    acknowledgedAt: optionalCanonicalTimestamp(record, 'acknowledgedAt'),
  };
}

function parseActive(value: unknown): ActivePostFocusReview | null {
  if (value === null) {
    return null;
  }
  const record = asRecord(value);
  switch (record.kind) {
    case 'tracking':
      return parseTracking(record);
    case 'pending':
      return parsePending(record);
    case 'settling':
      return parseSettling(record);
    case 'receipt':
      return parseReceipt(record);
    default:
      return invalidSnapshot();
  }
}

function parseStore(value: unknown): PostFocusReviewStore {
  const record = asRecord(value);
  if (
    record.schema !== 'start-five.post-focus-review' ||
    record.version !== 1 ||
    !Array.isArray(record.receipts)
  ) {
    return invalidSnapshot();
  }
  const receipts = record.receipts.map(parseReceipt);
  const receiptIds = new Set(receipts.map(receipt => receipt.receiptId));
  if (receiptIds.size !== receipts.length) {
    return invalidSnapshot();
  }
  return {
    schema: 'start-five.post-focus-review',
    version: 1,
    active: parseActive(record.active),
    receipts,
  };
}

export function validatePostFocusReviewBackup(raw: string | null): number {
  if (raw === null) return 0;
  const store = parseStore(JSON.parse(raw) as unknown);
  return store.receipts.length + (store.active === null ? 0 : 1);
}

function cloneStore(store: PostFocusReviewStore): PostFocusReviewStore {
  return parseStore(store);
}

type RepositoryCoordinator = {tail: Promise<void>};
const coordinators = new WeakMap<object, RepositoryCoordinator>();

function coordinatorFor(backend: AsyncKeyValueBackend): RepositoryCoordinator {
  const key = backend as object;
  const existing = coordinators.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const created: RepositoryCoordinator = {tail: Promise.resolve()};
  coordinators.set(key, created);
  return created;
}

export function createPostFocusReviewRepository(
  backend: AsyncKeyValueBackend,
): PostFocusReviewRepository {
  const coordinator = coordinatorFor(backend);

  async function load(): Promise<PostFocusReviewStore> {
    let raw: string | null;
    try {
      raw = await backend.getItem(POST_FOCUS_REVIEW_STORAGE_KEY);
    } catch (error: unknown) {
      throw new PostFocusReviewStorageError(
        'POST_FOCUS_REVIEW_STORAGE_READ_FAILED',
        error,
      );
    }
    if (raw === null) {
      return cloneStore(EMPTY_POST_FOCUS_REVIEW_STORE);
    }
    try {
      return parseStore(JSON.parse(raw) as unknown);
    } catch (error: unknown) {
      if (error instanceof PostFocusReviewStorageError) {
        throw error;
      }
      throw new PostFocusReviewStorageError(
        'POST_FOCUS_REVIEW_STORAGE_CORRUPT',
        error,
      );
    }
  }

  async function save(next: PostFocusReviewStore): Promise<void> {
    const validated = cloneStore(next);
    try {
      await backend.setItem(
        POST_FOCUS_REVIEW_STORAGE_KEY,
        JSON.stringify(validated),
      );
    } catch (error: unknown) {
      throw new PostFocusReviewStorageError(
        'POST_FOCUS_REVIEW_STORAGE_WRITE_FAILED',
        error,
      );
    }
  }

  return {
    read() {
      return coordinator.tail.then(load).then(cloneStore);
    },
    update<T>(work: (
      current: PostFocusReviewStore,
    ) =>
      | PostFocusReviewRepositoryUpdate<T>
      | Promise<PostFocusReviewRepositoryUpdate<T>>,
    ): Promise<T> {
      const operation = coordinator.tail.then(async () => {
        const current = await load();
        const update = await work(cloneStore(current));
        if (update.next !== null) {
          await save(update.next);
        }
        return update.result;
      });
      coordinator.tail = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    },
  };
}
