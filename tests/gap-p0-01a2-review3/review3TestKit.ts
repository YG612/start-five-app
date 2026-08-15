import {
  createTaskLifecycleService,
  type TaskLifecycleService,
} from '../../src/application/coreAppService';
import {
  createPersistentTaskStorage,
  TASK_SNAPSHOT_SCHEMA,
  TASK_SNAPSHOT_VERSION,
  TASK_STORAGE_KEY,
} from '../../src/data/persistentTaskStorage';
import {
  createTaskRepository,
  type TaskRepository,
} from '../../src/data/taskRepository';
import type {Task} from '../../src/domain/task';

export {
  CountingClock,
  CountingIds,
  expectErrorCode,
  ForbiddenClock,
  ForbiddenIds,
  makeReviewDeletedTask,
  makeReviewTask,
  PersistentReviewBackend,
  REVIEW_NOW,
  ReviewBackendFault,
  reviewCreateInput,
} from '../gap-p0-01a2-review1/review1TestKit';

/**
 * A deliberately minimal structural surface.  It keeps malformed capability
 * fixtures type-safe even when production later publishes an optional typed
 * `startFiveAtomic` member on its backend interface.
 */
export interface ReviewBackendSurface {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface StartFiveAtomicCapabilityV1 {
  readonly version: 1;
  readonly scope: string;
  compareExchangeItem(
    key: string,
    expectedValue: string | null,
    desiredValue: string | null,
  ): Promise<boolean>;
}

export type Review3Runtime = {
  readonly repository: TaskRepository;
  readonly service: TaskLifecycleService;
};

export function createReview3Runtime(
  backend: ReviewBackendSurface,
  dependencies: {
    now(): string;
    idGenerator(): string;
  },
): Review3Runtime {
  const repository = createTaskRepository(createPersistentTaskStorage(backend));
  const service = createTaskLifecycleService({
    repository,
    now: dependencies.now,
    idGenerator: dependencies.idGenerator,
  });
  return {repository, service};
}

export class Review3CasGate {
  private signalEntered!: () => void;
  private signalReleased!: () => void;
  private released = false;

  readonly entered = new Promise<void>(resolve => {
    this.signalEntered = resolve;
  });

  private readonly releasePromise = new Promise<void>(resolve => {
    this.signalReleased = resolve;
  });

  async waitAtPublicCasBoundary(): Promise<void> {
    this.signalEntered();
    await this.releasePromise;
  }

  release(): void {
    if (!this.released) {
      this.released = true;
      this.signalReleased();
    }
  }
}

type CasOnlyPhysicalState = {
  readonly diagnosticScope: string;
  readonly values: Map<string, string>;
};

export type CompareExchangeObservation = {
  readonly key: string;
  readonly expectedValue: string | null;
  readonly desiredValue: string | null;
};

/**
 * A real in-memory physical CAS store.  Wrapper objects and capability objects
 * are distinct, while compare/exchange is linearized against one shared Map.
 * Ordinary mutation methods are present only for structural compatibility and
 * fail immediately: a valid atomic implementation must not need them.
 */
export class CasOnlyPhysicalStore {
  private readonly state: CasOnlyPhysicalState;

  constructor(diagnosticScope = 'start-five-review3-physical-scope') {
    this.state = {diagnosticScope, values: new Map()};
  }

  wrapper(label: string): CasOnlyBackendWrapper {
    return new CasOnlyBackendWrapper(this.state, label);
  }

  seedCurrentV1(tasks: readonly Task[]): void {
    this.state.values.set(
      TASK_STORAGE_KEY,
      JSON.stringify({
        schema: TASK_SNAPSHOT_SCHEMA,
        version: TASK_SNAPSHOT_VERSION,
        tasks,
      }),
    );
  }

  rawSnapshot(): Array<readonly [string, string]> {
    return Array.from(this.state.values.entries())
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, value]) => [key, value] as const);
  }
}

export class CasOnlyBackendWrapper implements ReviewBackendSurface {
  readonly reads: string[] = [];
  readonly ordinarySetAttempts: Array<{
    readonly key: string;
    readonly value: string;
  }> = [];
  readonly ordinaryRemoveAttempts: string[] = [];
  readonly compareExchanges: CompareExchangeObservation[] = [];

  readonly startFiveAtomic: StartFiveAtomicCapabilityV1;

  private nextCasGate: Review3CasGate | null = null;
  private signalNextCas: (() => void) | null = null;
  private forcedFalseCount = 0;

  constructor(
    private readonly state: CasOnlyPhysicalState,
    readonly label: string,
  ) {
    this.startFiveAtomic = {
      version: 1,
      scope: state.diagnosticScope,
      compareExchangeItem: async (key, expectedValue, desiredValue) => {
        this.compareExchanges.push({key, expectedValue, desiredValue});
        const signal = this.signalNextCas;
        this.signalNextCas = null;
        signal?.();

        const gate = this.nextCasGate;
        this.nextCasGate = null;
        if (gate !== null) {
          await gate.waitAtPublicCasBoundary();
        }

        if (this.forcedFalseCount > 0) {
          this.forcedFalseCount -= 1;
          return false;
        }
        const current = this.state.values.get(key) ?? null;
        if (current !== expectedValue) {
          return false;
        }
        if (desiredValue === null) {
          this.state.values.delete(key);
        } else {
          this.state.values.set(key, desiredValue);
        }
        return true;
      },
    };
  }

  pauseNextCompareExchange(): Review3CasGate {
    if (this.nextCasGate !== null) {
      throw new Error('A2_REVIEW3_CAS_GATE_ALREADY_ARMED');
    }
    const gate = new Review3CasGate();
    this.nextCasGate = gate;
    return gate;
  }

  observeNextCompareExchange(): Promise<void> {
    if (this.signalNextCas !== null) {
      throw new Error('A2_REVIEW3_CAS_OBSERVER_ALREADY_ARMED');
    }
    return new Promise<void>(resolve => {
      this.signalNextCas = resolve;
    });
  }

  forceNextCompareExchangeMiss(): void {
    this.forcedFalseCount += 1;
  }

  async getItem(key: string): Promise<string | null> {
    this.reads.push(key);
    return this.state.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.ordinarySetAttempts.push({key, value});
    throw new Error('A2_REVIEW3_ORDINARY_SET_FORBIDDEN');
  }

  async removeItem(key: string): Promise<void> {
    this.ordinaryRemoveAttempts.push(key);
    throw new Error('A2_REVIEW3_ORDINARY_REMOVE_FORBIDDEN');
  }
}

/** A backend that deliberately publishes an untyped/malformed capability. */
export class DeclaredCapabilityBackend implements ReviewBackendSurface {
  readonly values = new Map<string, string>();
  readonly setAttempts: Array<{readonly key: string; readonly value: string}> = [];
  readonly removeAttempts: string[] = [];

  constructor(readonly startFiveAtomic: object) {}

  seedCurrentV1(tasks: readonly Task[]): void {
    this.values.set(
      TASK_STORAGE_KEY,
      JSON.stringify({
        schema: TASK_SNAPSHOT_SCHEMA,
        version: TASK_SNAPSHOT_VERSION,
        tasks,
      }),
    );
  }

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.setAttempts.push({key, value});
    throw new Error('A2_REVIEW3_NON_ATOMIC_SET_FORBIDDEN');
  }

  async removeItem(key: string): Promise<void> {
    this.removeAttempts.push(key);
    throw new Error('A2_REVIEW3_NON_ATOMIC_REMOVE_FORBIDDEN');
  }
}

export type JsonRecord = Record<string, unknown>;

export function isJsonRecord(value: unknown): value is JsonRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

export function parseJsonRecord(raw: string): JsonRecord {
  const parsed: unknown = JSON.parse(raw);
  if (!isJsonRecord(parsed)) {
    throw new Error('A2_REVIEW3_EXPECTED_JSON_RECORD');
  }
  return parsed;
}

export type LocatedRecord = {
  readonly key: string;
  readonly raw: string;
  readonly value: JsonRecord;
};

export type LocatedPage = LocatedRecord & {readonly page: number};

function requiredSafeInteger(record: JsonRecord, field: string): number {
  const value = record[field];
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`A2_REVIEW3_EXPECTED_SAFE_INTEGER:${field}`);
  }
  return value;
}

export function locateLedger(
  entries: readonly (readonly [string, string])[],
): {readonly header: LocatedRecord; readonly pages: readonly LocatedPage[]} {
  let header: LocatedRecord | null = null;
  const pages: LocatedPage[] = [];
  for (const [key, raw] of entries) {
    const value = parseJsonRecord(raw);
    if (
      typeof value.entryCount === 'number' &&
      typeof value.pageCount === 'number' &&
      typeof value.ledgerDigest === 'string'
    ) {
      if (header !== null) {
        throw new Error('A2_REVIEW3_MULTIPLE_LEDGER_HEADERS');
      }
      header = {key, raw, value};
    } else if (Array.isArray(value.entries)) {
      pages.push({key, raw, value, page: requiredSafeInteger(value, 'page')});
    }
  }
  if (header === null || pages.length === 0) {
    throw new Error('A2_REVIEW3_LEDGER_NOT_FOUND');
  }
  pages.sort((left, right) => left.page - right.page);
  return {header, pages};
}

export function locateJournal(
  entries: readonly (readonly [string, string])[],
): LocatedRecord {
  for (const [key, raw] of entries) {
    const value = parseJsonRecord(raw);
    if (
      typeof value.beforeJson === 'string' &&
      typeof value.afterJson === 'string'
    ) {
      return {key, raw, value};
    }
  }
  throw new Error('A2_REVIEW3_JOURNAL_NOT_FOUND');
}

export function locateScalableTasks(
  entries: readonly (readonly [string, string])[],
): {readonly header: LocatedRecord; readonly pages: readonly LocatedPage[]} {
  let header: LocatedRecord | null = null;
  const pages: LocatedPage[] = [];
  for (const [key, raw] of entries) {
    const value = parseJsonRecord(raw);
    if (
      key === TASK_STORAGE_KEY &&
      typeof value.schema === 'string' &&
      value.schema.includes('scalable') &&
      typeof value.pageCount === 'number' &&
      typeof value.totalCount === 'number'
    ) {
      header = {key, raw, value};
    } else if (Array.isArray(value.tasks) && typeof value.page === 'number') {
      pages.push({key, raw, value, page: requiredSafeInteger(value, 'page')});
    }
  }
  if (header === null || pages.length < 2) {
    throw new Error('A2_REVIEW3_SCALABLE_TASK_RECORDS_NOT_FOUND');
  }
  pages.sort((left, right) => left.page - right.page);
  return {header, pages};
}

function utf8Bytes(value: string): number[] {
  const bytes: number[] = [];
  for (const symbol of value) {
    const codePoint = symbol.codePointAt(0);
    if (codePoint === undefined) {
      throw new Error('A2_REVIEW3_UTF8_CODE_POINT_MISSING');
    }
    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >>> 6));
      bytes.push(0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(0xe0 | (codePoint >>> 12));
      bytes.push(0x80 | ((codePoint >>> 6) & 0x3f));
      bytes.push(0x80 | (codePoint & 0x3f));
    } else {
      bytes.push(0xf0 | (codePoint >>> 18));
      bytes.push(0x80 | ((codePoint >>> 12) & 0x3f));
      bytes.push(0x80 | ((codePoint >>> 6) & 0x3f));
      bytes.push(0x80 | (codePoint & 0x3f));
    }
  }
  return bytes;
}

function rotateRight(value: number, count: number): number {
  return (value >>> count) | (value << (32 - count));
}

const SHA256_ROUND_CONSTANTS: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

export function sha256Hex(value: string): string {
  const bytes = utf8Bytes(value);
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) {
    bytes.push(0);
  }
  const high = Math.floor(bitLength / 0x1_0000_0000);
  const low = bitLength >>> 0;
  for (let shift = 24; shift >= 0; shift -= 8) {
    bytes.push((high >>> shift) & 0xff);
  }
  for (let shift = 24; shift >= 0; shift -= 8) {
    bytes.push((low >>> shift) & 0xff);
  }

  const state = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const words = Array<number>(64).fill(0);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const start = offset + index * 4;
      words[index] =
        (((bytes[start] ?? 0) << 24) |
          ((bytes[start + 1] ?? 0) << 16) |
          ((bytes[start + 2] ?? 0) << 8) |
          (bytes[start + 3] ?? 0)) >>>
        0;
    }
    for (let index = 16; index < 64; index += 1) {
      const previous15 = words[index - 15] ?? 0;
      const previous2 = words[index - 2] ?? 0;
      const sigma0 =
        rotateRight(previous15, 7) ^
        rotateRight(previous15, 18) ^
        (previous15 >>> 3);
      const sigma1 =
        rotateRight(previous2, 17) ^
        rotateRight(previous2, 19) ^
        (previous2 >>> 10);
      words[index] =
        ((words[index - 16] ?? 0) +
          sigma0 +
          (words[index - 7] ?? 0) +
          sigma1) >>>
        0;
    }

    let a = state[0] ?? 0;
    let b = state[1] ?? 0;
    let c = state[2] ?? 0;
    let d = state[3] ?? 0;
    let e = state[4] ?? 0;
    let f = state[5] ?? 0;
    let g = state[6] ?? 0;
    let h = state[7] ?? 0;
    for (let index = 0; index < 64; index += 1) {
      const bigSigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const first =
        (h +
          bigSigma1 +
          choice +
          (SHA256_ROUND_CONSTANTS[index] ?? 0) +
          (words[index] ?? 0)) >>>
        0;
      const bigSigma0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const second = (bigSigma0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + first) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (first + second) >>> 0;
    }
    state[0] = ((state[0] ?? 0) + a) >>> 0;
    state[1] = ((state[1] ?? 0) + b) >>> 0;
    state[2] = ((state[2] ?? 0) + c) >>> 0;
    state[3] = ((state[3] ?? 0) + d) >>> 0;
    state[4] = ((state[4] ?? 0) + e) >>> 0;
    state[5] = ((state[5] ?? 0) + f) >>> 0;
    state[6] = ((state[6] ?? 0) + g) >>> 0;
    state[7] = ((state[7] ?? 0) + h) >>> 0;
  }
  return state.map(word => word.toString(16).padStart(8, '0')).join('');
}

export function strongDigest(value: string): string {
  return `sha256-v1:${sha256Hex(value)}`;
}

export function utf8Length(value: string): number {
  return utf8Bytes(value).length;
}

function chainDigest(
  domain: 'operation-ledger' | 'task-pages',
  pages: readonly LocatedPage[],
): string {
  let chain = strongDigest(`start-five.${domain}.v2:empty`);
  for (const page of pages) {
    chain = strongDigest(
      `start-five.${domain}.v2:page:${String(page.page)}:${chain}:${String(
        utf8Length(page.raw),
      )}:${page.raw}`,
    );
  }
  return chain;
}

export function expectedLedgerDigest(pages: readonly LocatedPage[]): string {
  return chainDigest('operation-ledger', pages);
}

export function expectedTaskDigest(pages: readonly LocatedPage[]): string {
  return chainDigest('task-pages', pages);
}

export function expectedJournalDigest(journal: JsonRecord): string {
  const version = journal.version;
  if (typeof version !== 'number' || !Number.isSafeInteger(version)) {
    throw new Error('A2_REVIEW3_JOURNAL_VERSION_INVALID');
  }
  const canonical = JSON.stringify({
    version,
    state: requiredString(journal, 'state'),
    operationId: requiredString(journal, 'operationId'),
    kind: requiredString(journal, 'kind'),
    fingerprint: requiredString(journal, 'fingerprint'),
    resultJson: requiredString(journal, 'resultJson'),
    beforeJson: requiredString(journal, 'beforeJson'),
    afterJson: requiredString(journal, 'afterJson'),
  });
  return strongDigest(`start-five.operation-journal.v2:${canonical}`);
}

export function expectStrongDigest(value: unknown): asserts value is string {
  expect(typeof value).toBe('string');
  if (typeof value !== 'string') {
    throw new Error('A2_REVIEW3_DIGEST_NOT_STRING');
  }
  expect(value).toMatch(/^sha256-v1:[0-9a-f]{64}$/);
}

export function replaceEntry(
  entries: readonly (readonly [string, string])[],
  key: string,
  value: string,
): Array<readonly [string, string]> {
  let replaced = false;
  const result = entries.map(([candidateKey, candidateValue]) => {
    if (candidateKey !== key) {
      return [candidateKey, candidateValue] as const;
    }
    replaced = true;
    return [candidateKey, value] as const;
  });
  if (!replaced) {
    throw new Error(`A2_REVIEW3_RAW_KEY_NOT_FOUND:${key}`);
  }
  return result;
}

export function serializedEntries(
  entries: readonly (readonly [string, string])[],
): string {
  return JSON.stringify(
    [...entries].sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  );
}

export function requiredString(record: JsonRecord, field: string): string {
  const value = record[field];
  if (typeof value !== 'string') {
    throw new Error(`A2_REVIEW3_EXPECTED_STRING:${field}`);
  }
  return value;
}

export function requiredArray(record: JsonRecord, field: string): unknown[] {
  const value = record[field];
  if (!Array.isArray(value)) {
    throw new Error(`A2_REVIEW3_EXPECTED_ARRAY:${field}`);
  }
  return value;
}

export function mutableRecord(value: unknown): JsonRecord {
  if (!isJsonRecord(value)) {
    throw new Error('A2_REVIEW3_EXPECTED_MUTABLE_RECORD');
  }
  return value;
}

export function expectNoSecretInError(
  error: unknown,
  secrets: readonly string[],
): void {
  const rendered = String(error);
  const serialized = JSON.stringify(error);
  for (const secret of secrets) {
    expect(rendered).not.toContain(secret);
    expect(serialized).not.toContain(secret);
  }
}
