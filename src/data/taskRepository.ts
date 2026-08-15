import type {Subtask, Task} from '../domain/task';
import {normalizeTaskExtensionSnapshot} from '../domain/taskPriority';
import {normalizeTaskSupportSnapshot} from '../domain/taskSupport';
import {
  normalizeTaskGrowthSnapshot,
  type TaskWithGrowth,
} from '../domain/growth';
import {normalizeTaskOrganizationSnapshot} from '../domain/taskOrganization';
import {normalizeTaskExecutionSnapshot} from '../domain/taskExecutionPlan';
import {
  assertPlainJsonData,
  assertValidDirectRepositorySnapshot,
  assertValidTaskMutationSnapshot,
  assertValidTaskSnapshot,
  materializePlainJsonData,
  TaskSnapshotValidationError,
} from './taskSnapshotValidation';

const DEFAULT_STORAGE_KEY = 'start-five.tasks.v1';

type RepositoryReadOptions = {
  includeDeleted?: boolean;
};

/** @internal Shared only by storage adapters over the same physical backend. */
export const TASK_REPOSITORY_COORDINATION_IDENTITY: unique symbol = Symbol(
  'TASK_REPOSITORY_COORDINATION_IDENTITY',
);

export interface KeyValueStorage {
  readonly [TASK_REPOSITORY_COORDINATION_IDENTITY]?: object;
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

type StartFiveAtomicCapabilityV1 = {
  readonly version: 1;
  readonly scope: string;
  compareExchangeItem(
    key: string,
    expectedValue: string | null,
    desiredValue: string | null,
  ): Promise<boolean>;
};

interface TaskTransaction {
  create(task: Task): Promise<Task>;
  getById(id: string, options?: RepositoryReadOptions): Promise<Task | null>;
  list(options?: RepositoryReadOptions): Promise<Task[]>;
  update(id: string, patch: Partial<Omit<Task, 'id'>>): Promise<Task>;
  softDelete(id: string, deletedAt: string): Promise<Task>;
}

export interface TaskRepository extends TaskTransaction {
  transaction<T>(
    work: (transaction: TaskTransaction) => Promise<T>,
  ): Promise<T>;
}

export interface RefreshableTaskRepository extends TaskRepository {
  reload(): Promise<Task[]>;
}

export type TaskDurablePresence = 'absent' | 'present';

/** Public storage-boundary contract used before the task repository is mounted. */
export interface TaskDurablePresenceProbe {
  probe(): Promise<TaskDurablePresence>;
}

export type TaskBackupAdapter = Readonly<{
  exportOpaquePayload(): Promise<string>;
  inspectOpaquePayload(payload: string): Promise<Readonly<{
    recordCount: number;
    taskIds: readonly string[];
    references: readonly Readonly<{sourceId: string; targetId: string}>[];
    pendingCount?: number;
    completedCount?: number;
    unsortedCount?: number;
    growthRecordCount?: number;
  }>>;
  hasDurableData(): Promise<boolean>;
  restoreOpaquePayload(payload: string): Promise<void>;
}>;

class RepositoryError extends Error {
  readonly code: string;
  readonly cause: unknown;

  constructor(code: string, cause?: unknown) {
    super(code);
    this.name = 'RepositoryError';
    this.code = code;
    this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function cloneSubtask(subtask: Subtask): Subtask {
  return {...subtask};
}

function cloneTask(task: Task): Task {
  const growth = task as TaskWithGrowth;
  return {
    ...task,
    subtasks: task.subtasks.map(cloneSubtask),
    ...(task.steps === undefined
      ? {}
      : {steps: task.steps.map(step => ({...step}))}),
    ...(task.plannedWorkSessions === undefined
      ? {}
      : {
          plannedWorkSessions: task.plannedWorkSessions.map(session => ({
            ...session,
          })),
        }),
    ...(growth.growthRewards === undefined
      ? {}
      : {growthRewards: growth.growthRewards.map(reward => ({...reward}))}),
    ...(growth.firstStepCompletion === undefined
      ? {}
      : {
          firstStepCompletion:
            growth.firstStepCompletion === null
              ? null
              : {...growth.firstStepCompletion},
        }),
  };
}

function cloneTasks(tasks: readonly Task[]): Task[] {
  return tasks.map(cloneTask);
}

function deserializeTasks(serialized: string | null): Task[] {
  if (serialized === null) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new TaskSnapshotValidationError();
  }
  const normalized = normalizeTaskExecutionSnapshot(
    normalizeTaskOrganizationSnapshot(
      normalizeTaskGrowthSnapshot(
        normalizeTaskSupportSnapshot(
          normalizeTaskExtensionSnapshot(parsed),
        ),
      ),
    ),
  );
  assertValidDirectRepositorySnapshot(normalized);

  return cloneTasks(normalized);
}

function serializeTasks(tasks: readonly Task[]): string {
  assertValidTaskMutationSnapshot(tasks);
  return JSON.stringify(tasks);
}

type DurableBackend = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  readonly startFiveAtomic?: unknown;
};

type DurableLifecycleMutationKind =
  | 'create'
  | 'update'
  | 'softDelete'
  | 'complete'
  | 'undoComplete'
  | 'reschedule'
  | 'delay';

type DurableLifecycleRequest = {
  operationId: string;
  kind: DurableLifecycleMutationKind;
  fingerprint: string;
};

type DurableLifecycleOperationRunner = <T>(
  request: DurableLifecycleRequest,
  work: (transaction: TaskTransaction) => Promise<T>,
) => Promise<T>;

type DurableTaskSnapshot = {
  tasks: Task[];
  records: Map<string, string>;
  representation: 'v1' | 'scalable';
};

type DurableLedgerEntry = DurableLifecycleRequest & {
  resultJson: string;
};

type DurableLedgerState = {
  entryCount: number;
  pageCount: number;
  matchedEntry: DurableLedgerEntry | null;
  rawHeader: string | null;
  tailEntries: DurableLedgerEntry[];
  rawTail: string | null;
  digestBeforeTail: string;
  records: Map<string, string>;
};

type DurableRecordChange = {
  key: string;
  before: string | null;
  after: string | null;
};

const DURABLE_TASK_SCHEMA = 'start-five.tasks';
const DURABLE_TASK_VERSION = 1;
const SCALABLE_TASK_SCHEMA = 'start-five.tasks.scalable';
const SCALABLE_TASK_VERSION = 1;
const SCALABLE_TASK_PAGE_VERSION = 1;
const DURABLE_LEDGER_VERSION = 2;
const DURABLE_LEDGER_PAGE_SIZE = 100;
const DURABLE_JOURNAL_VERSION = 2;
const PRIVATE_RECORD_NAMESPACE = 'start-five.internal';
const STRONG_DIGEST_PREFIX = 'sha256-v1:';
const LEDGER_DIGEST_DOMAIN = 'start-five.operation-ledger.v2';
const TASK_DIGEST_DOMAIN = 'start-five.task-pages.v2';
const JOURNAL_DIGEST_DOMAIN = 'start-five.operation-journal.v2';
const TASK_BINDING_DOMAIN = 'start-five.task-binding.v2';
const REQUEST_FINGERPRINT_DOMAIN = 'start-five.request-fingerprint.v2';
const ATOMIC_MAX_ACQUIRE_ATTEMPTS = 4096;
const ATOMIC_AUTHORITY_VERSION = 1;

function privateRecordKey(primaryKey: string, suffix: string): string {
  return `${primaryKey}::${PRIVATE_RECORD_NAMESPACE}.${suffix}`;
}

function scalableTaskPageKey(primaryKey: string, page: number): string {
  return privateRecordKey(
    primaryKey,
    `task-page.${String(page).padStart(8, '0')}`,
  );
}

function durableLedgerHeaderKey(primaryKey: string): string {
  return privateRecordKey(primaryKey, 'operation-ledger.header');
}

function durableLedgerPageKey(primaryKey: string, page: number): string {
  return privateRecordKey(
    primaryKey,
    `operation-ledger.page.${String(page).padStart(8, '0')}`,
  );
}

function durableJournalKey(primaryKey: string): string {
  return privateRecordKey(primaryKey, 'operation-ledger.journal');
}

function durableAtomicLockKey(primaryKey: string): string {
  return privateRecordKey(primaryKey, 'operation-ledger.atomic-lock');
}

function durableCacheVersionKey(primaryKey: string): string {
  // The version is deliberately ordered after every task/ledger record so a
  // completed version change is the publish point for the cached snapshot.
  return privateRecordKey(primaryKey, 'zz-cache-version');
}

function durableAuthorityRootKey(primaryKey: string): string {
  return privateRecordKey(primaryKey, 'authority-root');
}

function durableAuthorityGenerationKey(
  primaryKey: string,
  generation: string,
): string {
  return privateRecordKey(primaryKey, `authority-generation.${generation}`);
}

function isAuthorityGenerationKey(primaryKey: string, key: string): boolean {
  const prefix = privateRecordKey(primaryKey, 'authority-generation.');
  return key.startsWith(prefix) && /^[0-9a-f]{64}$/.test(key.slice(prefix.length));
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

function utf8Bytes(value: string): number[] {
  const bytes: number[] = [];
  for (const symbol of value) {
    const point = symbol.codePointAt(0);
    if (point === undefined) {
      continue;
    }
    if (point <= 0x7f) {
      bytes.push(point);
    } else if (point <= 0x7ff) {
      bytes.push(0xc0 | (point >>> 6));
      bytes.push(0x80 | (point & 0x3f));
    } else if (point <= 0xffff) {
      bytes.push(0xe0 | (point >>> 12));
      bytes.push(0x80 | ((point >>> 6) & 0x3f));
      bytes.push(0x80 | (point & 0x3f));
    } else {
      bytes.push(0xf0 | (point >>> 18));
      bytes.push(0x80 | ((point >>> 12) & 0x3f));
      bytes.push(0x80 | ((point >>> 6) & 0x3f));
      bytes.push(0x80 | (point & 0x3f));
    }
  }
  return bytes;
}

function sha256Hex(value: string): string {
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
      const sigma1 =
        rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const first =
        (h +
          sigma1 +
          choice +
          (SHA256_ROUND_CONSTANTS[index] ?? 0) +
          (words[index] ?? 0)) >>>
        0;
      const sigma0 =
        rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const second = (sigma0 + majority) >>> 0;
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

function strongDigest(value: string): string {
  return `${STRONG_DIGEST_PREFIX}${sha256Hex(value)}`;
}

function isStrongDigest(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^sha256-v1:[0-9a-f]{64}$/.test(value)
  );
}

function initialPageDigest(domain: string): string {
  return strongDigest(`${domain}:empty`);
}

function updatePageDigest(
  domain: string,
  previous: string,
  page: number,
  rawPage: string,
): string {
  return strongDigest(
    `${domain}:page:${String(page)}:${previous}:${String(
      utf8Bytes(rawPage).length,
    )}:${rawPage}`,
  );
}

function taskBinding(records: ReadonlyMap<string, string>): string {
  return strongDigest(`${TASK_BINDING_DOMAIN}:${sortedRecordBytes(records)}`);
}

type AtomicAuthorityRoot = {
  version: typeof ATOMIC_AUTHORITY_VERSION;
  generation: string;
  generationKey: string;
  generationDigest: string;
};

type AtomicAuthorityGeneration = {
  version: typeof ATOMIC_AUTHORITY_VERSION;
  generation: string;
  parentRoot: string | null;
  recordsJson: string;
  recordsDigest: string;
};

function authorityGenerationDigest(
  generation: Omit<AtomicAuthorityGeneration, 'recordsDigest'>,
): string {
  return strongDigest(
    `start-five.authority-generation.v1:${JSON.stringify(generation)}`,
  );
}

function createAtomicAuthorityGeneration(
  primaryKey: string,
  generation: string,
  parentRoot: string | null,
  records: ReadonlyMap<string, string>,
): {generationKey: string; rawGeneration: string; rawRoot: string} {
  const withoutDigest: Omit<AtomicAuthorityGeneration, 'recordsDigest'> = {
    version: ATOMIC_AUTHORITY_VERSION,
    generation,
    parentRoot,
    recordsJson: sortedRecordBytes(records),
  };
  const record: AtomicAuthorityGeneration = {
    ...withoutDigest,
    recordsDigest: authorityGenerationDigest(withoutDigest),
  };
  const rawGeneration = JSON.stringify(record);
  const generationKey = durableAuthorityGenerationKey(primaryKey, generation);
  const root: AtomicAuthorityRoot = {
    version: ATOMIC_AUTHORITY_VERSION,
    generation,
    generationKey,
    generationDigest: strongDigest(rawGeneration),
  };
  return {generationKey, rawGeneration, rawRoot: JSON.stringify(root)};
}

function parseAtomicAuthorityRoot(
  rawRoot: string,
  primaryKey: string,
): AtomicAuthorityRoot {
  const parsed = parseJsonRecord(rawRoot, 'TASK_OPERATION_LEDGER_CORRUPT');
  if (
    !hasExactRecordKeys(parsed, [
      'version',
      'generation',
      'generationKey',
      'generationDigest',
    ]) ||
    parsed.version !== ATOMIC_AUTHORITY_VERSION ||
    typeof parsed.generation !== 'string' ||
    !/^[0-9a-f]{64}$/.test(parsed.generation) ||
    parsed.generationKey !==
      durableAuthorityGenerationKey(primaryKey, parsed.generation) ||
    !isStrongDigest(parsed.generationDigest)
  ) {
    throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
  }
  return {
    version: ATOMIC_AUTHORITY_VERSION,
    generation: parsed.generation,
    generationKey: parsed.generationKey,
    generationDigest: parsed.generationDigest,
  };
}

function isAuthorityCoreRecordKey(primaryKey: string, key: string): boolean {
  return (
    key === primaryKey ||
    key === durableLedgerHeaderKey(primaryKey) ||
    isNumberedPrivateRecordKey(
      key,
      privateRecordKey(primaryKey, 'task-page.'),
    ) ||
    isNumberedPrivateRecordKey(
      key,
      privateRecordKey(primaryKey, 'operation-ledger.page.'),
    )
  );
}

function parseAtomicAuthorityGeneration(
  rawGeneration: string,
  root: AtomicAuthorityRoot,
  primaryKey: string,
): {record: AtomicAuthorityGeneration; records: Map<string, string>} {
  if (strongDigest(rawGeneration) !== root.generationDigest) {
    throw new RepositoryError('TASK_OPERATION_LEDGER_CORRUPT');
  }
  const parsed = parseJsonRecord(
    rawGeneration,
    'TASK_OPERATION_LEDGER_CORRUPT',
  );
  if (
    !hasExactRecordKeys(parsed, [
      'version',
      'generation',
      'parentRoot',
      'recordsJson',
      'recordsDigest',
    ]) ||
    parsed.version !== ATOMIC_AUTHORITY_VERSION ||
    parsed.generation !== root.generation ||
    (parsed.parentRoot !== null && typeof parsed.parentRoot !== 'string') ||
    typeof parsed.recordsJson !== 'string' ||
    !isStrongDigest(parsed.recordsDigest)
  ) {
    throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
  }
  const withoutDigest: Omit<AtomicAuthorityGeneration, 'recordsDigest'> = {
    version: ATOMIC_AUTHORITY_VERSION,
    generation: parsed.generation,
    parentRoot: parsed.parentRoot,
    recordsJson: parsed.recordsJson,
  };
  if (authorityGenerationDigest(withoutDigest) !== parsed.recordsDigest) {
    throw new RepositoryError('TASK_OPERATION_LEDGER_CORRUPT');
  }
  const entries = parseEncodedRecordChanges(parsed.recordsJson);
  const records = new Map<string, string>();
  let previousKey: string | null = null;
  for (const [recordKey, value] of entries) {
    if (
      value === null ||
      !isAuthorityCoreRecordKey(primaryKey, recordKey) ||
      (previousKey !== null && previousKey >= recordKey)
    ) {
      throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
    }
    records.set(recordKey, value);
    previousKey = recordKey;
  }
  if (records.size === 0 || !records.has(primaryKey)) {
    throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
  }
  const primary = records.get(primaryKey);
  if (
    primary === undefined ||
    primary !==
      `${primary.trimEnd()}${generationWhitespace(root.generation)}`
  ) {
    throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
  }
  return {
    record: {...withoutDigest, recordsDigest: parsed.recordsDigest},
    records,
  };
}

function generationWhitespace(generation: string): string {
  let encoded = '\n';
  for (const digit of generation) {
    const value = Number.parseInt(digit, 16);
    for (let shift = 6; shift >= 0; shift -= 2) {
      encoded += [' ', '\t', '\r', '\n'][(value >>> shift) & 3] ?? ' ';
    }
  }
  return encoded;
}

function bindTaskRecordsToGeneration(
  primaryKey: string,
  records: ReadonlyMap<string, string>,
  generation: string,
): Map<string, string> {
  const bound = new Map(records);
  const primary = bound.get(primaryKey);
  if (primary === undefined) {
    throw new RepositoryError('TASK_SNAPSHOT_INVALID');
  }
  bound.set(
    primaryKey,
    `${primary.trimEnd()}${generationWhitespace(generation)}`,
  );
  return bound;
}

function durableRequestFingerprint(rawFingerprint: string): string {
  return strongDigest(`${REQUEST_FINGERPRINT_DOMAIN}:${rawFingerprint}`);
}

function isAtomicCapability(
  value: unknown,
): value is StartFiveAtomicCapabilityV1 {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    value.version === 1 &&
    'scope' in value &&
    typeof value.scope === 'string' &&
    value.scope.trim() !== '' &&
    'compareExchangeItem' in value &&
    typeof value.compareExchangeItem === 'function'
  );
}

function atomicCapabilityFor(
  backend: DurableBackend,
): StartFiveAtomicCapabilityV1 | null {
  if (!('startFiveAtomic' in backend)) {
    return null;
  }
  const capability = backend.startFiveAtomic;
  if (!isAtomicCapability(capability)) {
    throw new RepositoryError('TASK_ATOMIC_CAPABILITY_INVALID');
  }
  return capability;
}

async function compareExchange(
  capability: StartFiveAtomicCapabilityV1,
  key: string,
  expectedValue: string | null,
  desiredValue: string | null,
): Promise<boolean> {
  let result: unknown;
  try {
    result = await capability.compareExchangeItem(
      key,
      expectedValue,
      desiredValue,
    );
  } catch (cause: unknown) {
    throw new RepositoryError('TASK_STORAGE_WRITE_FAILED', cause);
  }
  if (result !== true && result !== false) {
    throw new RepositoryError('TASK_ATOMIC_CAPABILITY_INVALID');
  }
  return result;
}

function isDurableBackend(value: unknown): value is DurableBackend {
  return (
    typeof value === 'object' &&
    value !== null &&
    'getItem' in value &&
    typeof value.getItem === 'function' &&
    'setItem' in value &&
    typeof value.setItem === 'function' &&
    'removeItem' in value &&
    typeof value.removeItem === 'function'
  );
}

function durableBackendFor(storage: KeyValueStorage): DurableBackend | null {
  const identity = storage[TASK_REPOSITORY_COORDINATION_IDENTITY];
  return isDurableBackend(identity) ? identity : null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactRecordKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === expected.length &&
    expected.every(key => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function parseJsonRecord(
  serialized: string,
  corruptCode: string,
): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new RepositoryError(corruptCode);
  }
  if (!isPlainRecord(parsed)) {
    throw new RepositoryError(corruptCode);
  }
  return parsed;
}

async function durableGet(
  backend: DurableBackend,
  key: string,
): Promise<string | null> {
  try {
    const value = await backend.getItem(key);
    if (value !== null && typeof value !== 'string') {
      throw new RepositoryError('TASK_SNAPSHOT_INVALID');
    }
    return value;
  } catch (cause: unknown) {
    if (cause instanceof RepositoryError) {
      throw cause;
    }
    throw new RepositoryError('TASK_STORAGE_READ_FAILED', cause);
  }
}

async function durableSet(
  backend: DurableBackend,
  key: string,
  value: string,
): Promise<void> {
  try {
    await backend.setItem(key, value);
  } catch (cause: unknown) {
    throw new RepositoryError('TASK_STORAGE_WRITE_FAILED', cause);
  }
}

async function durableRemove(
  backend: DurableBackend,
  key: string,
): Promise<void> {
  try {
    await backend.removeItem(key);
  } catch (cause: unknown) {
    throw new RepositoryError('TASK_STORAGE_WRITE_FAILED', cause);
  }
}

function serializeDurableV1(tasks: readonly Task[]): string {
  assertValidTaskMutationSnapshot(tasks);
  const envelope = {
    schema: DURABLE_TASK_SCHEMA,
    version: DURABLE_TASK_VERSION,
    tasks,
  };
  materializePlainJsonData(envelope);
  return JSON.stringify(envelope);
}

function trySerializeDurableV1(tasks: readonly Task[]): string | null {
  try {
    return serializeDurableV1(tasks);
  } catch (error: unknown) {
    if (error instanceof TaskSnapshotValidationError) {
      return null;
    }
    throw error;
  }
}

function parseDurableV1(serialized: string): Task[] | null {
  const parsed = parseJsonRecord(serialized, 'TASK_SNAPSHOT_CORRUPT');
  if (
    parsed.schema !== DURABLE_TASK_SCHEMA ||
    parsed.version !== DURABLE_TASK_VERSION
  ) {
    return null;
  }
  if (!hasExactRecordKeys(parsed, ['schema', 'version', 'tasks'])) {
    throw new RepositoryError('TASK_SNAPSHOT_INVALID');
  }
  try {
    const normalized = normalizeTaskGrowthSnapshot(
      normalizeTaskSupportSnapshot(
        normalizeTaskExtensionSnapshot(parsed.tasks),
      ),
    );
    assertValidTaskSnapshot(normalized);
    return cloneTasks(normalized);
  } catch {
    throw new RepositoryError('TASK_SNAPSHOT_INVALID');
  }
}

function serializeScalableTaskPage(page: number, tasks: readonly Task[]): string {
  assertValidTaskMutationSnapshot(tasks);
  const envelope = {
    version: SCALABLE_TASK_PAGE_VERSION,
    page,
    tasks,
  };
  materializePlainJsonData(envelope);
  return JSON.stringify(envelope);
}

function partitionScalableTasks(tasks: readonly Task[]): Task[][] {
  const pages: Task[][] = [];
  let current: Task[] = [];
  // One page envelope and its task array consume two containers.  A Task
  // consumes its record, its subtasks array, and one record per subtask.
  // Counting that already-validated fixed shape avoids repeatedly
  // materializing every growing prefix (quadratic work) while preserving the
  // exact generic 256-array / 512-container boundary.
  let currentContainerCount = 2;
  for (const task of tasks) {
    const taskContainerCount = 2 + task.subtasks.length;
    if (
      current.length > 0 &&
      (current.length >= 256 ||
        currentContainerCount + taskContainerCount > 512)
    ) {
      pages.push(current);
      current = [];
      currentContainerCount = 2;
    }
    current.push(task);
    currentContainerCount += taskContainerCount;
  }
  if (current.length > 0) {
    pages.push(current);
  }
  pages.forEach((pageTasks, page) => {
    serializeScalableTaskPage(page, pageTasks);
  });
  return pages;
}

function createDesiredTaskRecords(
  primaryKey: string,
  tasks: readonly Task[],
): {records: Map<string, string>; representation: 'v1' | 'scalable'} {
  const v1 = trySerializeDurableV1(tasks);
  if (v1 !== null) {
    return {
      records: new Map([[primaryKey, v1]]),
      representation: 'v1',
    };
  }

  const pages = partitionScalableTasks(tasks);
  const rawPages = pages.map((pageTasks, page) =>
    serializeScalableTaskPage(page, pageTasks),
  );
  let digest = initialPageDigest(TASK_DIGEST_DOMAIN);
  rawPages.forEach((rawPage, page) => {
    digest = updatePageDigest(TASK_DIGEST_DOMAIN, digest, page, rawPage);
  });
  const records = new Map<string, string>();
  records.set(
    primaryKey,
    JSON.stringify({
      schema: SCALABLE_TASK_SCHEMA,
      version: SCALABLE_TASK_VERSION,
      pageCount: pages.length,
      totalCount: tasks.length,
      taskDigest: digest,
    }),
  );
  rawPages.forEach((rawPage, page) => {
    records.set(
      scalableTaskPageKey(primaryKey, page),
      rawPage,
    );
  });
  return {records, representation: 'scalable'};
}

function assertGloballyUniqueTaskIds(tasks: readonly Task[]): void {
  const ids = new Set<string>();
  for (const task of tasks) {
    if (ids.has(task.id)) {
      throw new RepositoryError('TASK_SNAPSHOT_INVALID');
    }
    ids.add(task.id);
  }
}

async function readDurableTaskSnapshot(
  backend: DurableBackend,
  primaryKey: string,
): Promise<DurableTaskSnapshot> {
  const primary = await durableGet(backend, primaryKey);
  if (primary === null) {
    return {
      tasks: [],
      records: new Map(),
      representation: 'v1',
    };
  }

  const v1 = parseDurableV1(primary);
  if (v1 !== null) {
    return {
      tasks: v1,
      records: new Map([[primaryKey, primary]]),
      representation: 'v1',
    };
  }

  const header = parseJsonRecord(primary, 'TASK_SNAPSHOT_CORRUPT');
  if (
    header.schema !== SCALABLE_TASK_SCHEMA ||
    header.version !== SCALABLE_TASK_VERSION
  ) {
    throw new RepositoryError('TASK_SNAPSHOT_UNSUPPORTED');
  }
  if (
    !hasExactRecordKeys(header, [
      'schema',
      'version',
      'pageCount',
      'totalCount',
      'taskDigest',
    ]) ||
    typeof header.pageCount !== 'number' ||
    !Number.isSafeInteger(header.pageCount) ||
    header.pageCount <= 0 ||
    typeof header.totalCount !== 'number' ||
    !Number.isSafeInteger(header.totalCount) ||
    header.totalCount <= 0 ||
    !isStrongDigest(header.taskDigest)
  ) {
    throw new RepositoryError('TASK_SNAPSHOT_INVALID');
  }

  const records = new Map<string, string>([[primaryKey, primary]]);
  const rawPages: string[] = [];
  let digest = initialPageDigest(TASK_DIGEST_DOMAIN);
  for (let page = 0; page < header.pageCount; page += 1) {
    const pageKey = scalableTaskPageKey(primaryKey, page);
    const rawPage = await durableGet(backend, pageKey);
    if (rawPage === null) {
      throw new RepositoryError('TASK_SNAPSHOT_CORRUPT');
    }
    rawPages.push(rawPage);
    records.set(pageKey, rawPage);
    digest = updatePageDigest(TASK_DIGEST_DOMAIN, digest, page, rawPage);
  }
  if (digest !== header.taskDigest) {
    throw new RepositoryError('TASK_SNAPSHOT_CORRUPT');
  }

  const tasks: Task[] = [];
  for (let page = 0; page < rawPages.length; page += 1) {
    const rawPage = rawPages[page];
    if (rawPage === undefined) {
      throw new RepositoryError('TASK_SNAPSHOT_INVALID');
    }
    const parsedPage = parseJsonRecord(rawPage, 'TASK_SNAPSHOT_CORRUPT');
    if (parsedPage.version !== SCALABLE_TASK_PAGE_VERSION) {
      throw new RepositoryError('TASK_SNAPSHOT_UNSUPPORTED');
    }
    if (
      !hasExactRecordKeys(parsedPage, ['version', 'page', 'tasks']) ||
      parsedPage.page !== page
    ) {
      throw new RepositoryError('TASK_SNAPSHOT_INVALID');
    }
    try {
      materializePlainJsonData(parsedPage);
      const normalized = normalizeTaskGrowthSnapshot(
        normalizeTaskSupportSnapshot(
          normalizeTaskExtensionSnapshot(parsedPage.tasks),
        ),
      );
      assertValidTaskSnapshot(normalized);
      tasks.push(...cloneTasks(normalized));
    } catch {
      throw new RepositoryError('TASK_SNAPSHOT_INVALID');
    }
  }
  if (tasks.length !== header.totalCount) {
    throw new RepositoryError('TASK_SNAPSHOT_INVALID');
  }
  assertGloballyUniqueTaskIds(tasks);
  return {tasks, records, representation: 'scalable'};
}

function sortedRecordBytes(records: ReadonlyMap<string, string>): string {
  return JSON.stringify(
    Array.from(records.entries()).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  );
}

function durableRecordChanges(
  current: ReadonlyMap<string, string>,
  desired: ReadonlyMap<string, string>,
): DurableRecordChange[] {
  const keys = new Set<string>([...current.keys(), ...desired.keys()]);
  return Array.from(keys)
    .sort()
    .flatMap(key => {
      const before = current.get(key) ?? null;
      const after = desired.get(key) ?? null;
      return before === after ? [] : [{key, before, after}];
    });
}

async function applyDurableValue(
  backend: DurableBackend,
  key: string,
  value: string | null,
): Promise<void> {
  if (value === null) {
    await durableRemove(backend, key);
  } else {
    await durableSet(backend, key, value);
  }
}

async function rollbackDurableChanges(
  backend: DurableBackend,
  changes: readonly DurableRecordChange[],
  journalKey: string | null,
): Promise<void> {
  for (const change of changes.slice().reverse()) {
    await applyDurableValue(backend, change.key, change.before);
  }
  if (journalKey !== null) {
    await durableRemove(backend, journalKey);
  }
}

async function applyDirectDurableChanges(
  backend: DurableBackend,
  changes: readonly DurableRecordChange[],
): Promise<void> {
  try {
    for (const change of changes) {
      await applyDurableValue(backend, change.key, change.after);
    }
  } catch (error: unknown) {
    await rollbackDurableChanges(backend, changes, null);
    throw error;
  }
}

function isDurableLifecycleKind(
  value: unknown,
): value is DurableLifecycleMutationKind {
  return (
    value === 'create' ||
    value === 'update' ||
    value === 'softDelete' ||
    value === 'complete' ||
    value === 'undoComplete' ||
    value === 'reschedule' ||
    value === 'delay'
  );
}

function parseLedgerResult(
  kind: DurableLifecycleMutationKind,
  resultJson: string,
): unknown {
  let result: unknown;
  try {
    result = JSON.parse(resultJson);
  } catch {
    throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
  }
  try {
    if (kind === 'complete') {
      if (
        !isPlainRecord(result) ||
        !hasExactRecordKeys(result, ['task', 'points']) ||
        typeof result.points !== 'number' ||
        !Number.isSafeInteger(result.points) ||
        result.points < 0
      ) {
        throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
      }
      assertValidTaskMutationSnapshot([result.task]);
    } else {
      assertValidTaskMutationSnapshot([result]);
    }
  } catch (error: unknown) {
    if (error instanceof RepositoryError) {
      throw error;
    }
    throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
  }
  return result;
}

function parseLedgerEntry(value: unknown): DurableLedgerEntry {
  if (
    !isPlainRecord(value) ||
    !hasExactRecordKeys(value, [
      'operationId',
      'kind',
      'fingerprint',
      'resultJson',
    ]) ||
    typeof value.operationId !== 'string' ||
    value.operationId.trim() === '' ||
    !isDurableLifecycleKind(value.kind) ||
    !isStrongDigest(value.fingerprint) ||
    typeof value.resultJson !== 'string'
  ) {
    throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
  }
  return {
    operationId: value.operationId,
    kind: value.kind,
    fingerprint: value.fingerprint,
    resultJson: value.resultJson,
  };
}

function updateLedgerPageDigest(
  state: string,
  page: number,
  rawPage: string,
): string {
  return updatePageDigest(LEDGER_DIGEST_DOMAIN, state, page, rawPage);
}

async function readDurableLedger(
  backend: DurableBackend,
  primaryKey: string,
  taskBinding: string,
  requestedOperationId: string,
): Promise<DurableLedgerState> {
  const headerKey = durableLedgerHeaderKey(primaryKey);
  const rawHeader = await durableGet(backend, headerKey);
  if (rawHeader === null) {
    return {
      entryCount: 0,
      pageCount: 0,
      matchedEntry: null,
      rawHeader: null,
      tailEntries: [],
      rawTail: null,
      digestBeforeTail: initialPageDigest(LEDGER_DIGEST_DOMAIN),
      records: new Map(),
    };
  }
  const header = parseJsonRecord(
    rawHeader,
    'TASK_OPERATION_LEDGER_CORRUPT',
  );
  if (header.version !== DURABLE_LEDGER_VERSION) {
    throw new RepositoryError('TASK_OPERATION_LEDGER_UNSUPPORTED');
  }
  if (
    !hasExactRecordKeys(header, [
      'version',
      'pageCount',
      'entryCount',
      'taskBinding',
      'ledgerDigest',
    ]) ||
    typeof header.pageCount !== 'number' ||
    !Number.isSafeInteger(header.pageCount) ||
    header.pageCount <= 0 ||
    typeof header.entryCount !== 'number' ||
    !Number.isSafeInteger(header.entryCount) ||
    header.entryCount <= 0 ||
    !isStrongDigest(header.taskBinding) ||
    !isStrongDigest(header.ledgerDigest)
  ) {
    throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
  }
  if (
    header.pageCount !==
    Math.ceil(header.entryCount / DURABLE_LEDGER_PAGE_SIZE)
  ) {
    throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
  }

  let digest = initialPageDigest(LEDGER_DIGEST_DOMAIN);
  let digestBeforeTail = digest;
  let rawTail: string | null = null;
  const rawPages: string[] = [];
  const records = new Map<string, string>([[headerKey, rawHeader]]);
  for (let page = 0; page < header.pageCount; page += 1) {
    const pageKey = durableLedgerPageKey(primaryKey, page);
    const rawPage = await durableGet(backend, pageKey);
    if (rawPage === null) {
      throw new RepositoryError('TASK_OPERATION_LEDGER_CORRUPT');
    }
    if (page === header.pageCount - 1) {
      digestBeforeTail = digest;
      rawTail = rawPage;
    }
    digest = updateLedgerPageDigest(digest, page, rawPage);
    rawPages.push(rawPage);
    records.set(pageKey, rawPage);
  }
  if (digest !== header.ledgerDigest) {
    throw new RepositoryError('TASK_OPERATION_LEDGER_CORRUPT');
  }
  if (header.taskBinding !== taskBinding) {
    throw new RepositoryError('TASK_OPERATION_LEDGER_STATE_MISMATCH');
  }

  let matchedEntry: DurableLedgerEntry | null = null;
  let tailEntries: DurableLedgerEntry[] = [];
  const operationIds = new Set<string>();
  for (let page = 0; page < rawPages.length; page += 1) {
    const rawPage = rawPages[page];
    if (rawPage === undefined) {
      throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
    }
    const parsedPage = parseJsonRecord(
      rawPage,
      'TASK_OPERATION_LEDGER_CORRUPT',
    );
    if (parsedPage.version !== DURABLE_LEDGER_VERSION) {
      throw new RepositoryError('TASK_OPERATION_LEDGER_UNSUPPORTED');
    }
    if (
      !hasExactRecordKeys(parsedPage, ['version', 'page', 'entries']) ||
      parsedPage.page !== page ||
      !Array.isArray(parsedPage.entries) ||
      parsedPage.entries.length !==
        (page === header.pageCount - 1
          ? header.entryCount - page * DURABLE_LEDGER_PAGE_SIZE
          : DURABLE_LEDGER_PAGE_SIZE)
    ) {
      throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
    }
    try {
      materializePlainJsonData(parsedPage);
    } catch {
      throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
    }
    const pageEntries: DurableLedgerEntry[] = [];
    for (const candidate of parsedPage.entries) {
      const entry = parseLedgerEntry(candidate);
      if (operationIds.has(entry.operationId)) {
        throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
      }
      operationIds.add(entry.operationId);
      parseLedgerResult(entry.kind, entry.resultJson);
      if (entry.operationId === requestedOperationId) {
        matchedEntry = entry;
      }
      pageEntries.push(entry);
    }
    if (page === header.pageCount - 1) {
      tailEntries = pageEntries;
    }
  }
  return {
    entryCount: header.entryCount,
    pageCount: header.pageCount,
    matchedEntry,
    rawHeader,
    tailEntries,
    rawTail,
    digestBeforeTail,
    records,
  };
}

function createLedgerAppendPlan(
  primaryKey: string,
  ledger: DurableLedgerState,
  entry: DurableLedgerEntry,
  taskBinding: string,
): {current: Map<string, string>; desired: Map<string, string>} {
  const headerKey = durableLedgerHeaderKey(primaryKey);
  const current = new Map<string, string>();
  if (ledger.rawHeader !== null) {
    current.set(headerKey, ledger.rawHeader);
  }

  let page: number;
  let pageEntries: DurableLedgerEntry[];
  let digestPrefix: string;
  if (
    ledger.pageCount === 0 ||
    ledger.tailEntries.length === DURABLE_LEDGER_PAGE_SIZE
  ) {
    page = ledger.pageCount;
    pageEntries = [entry];
    digestPrefix =
      ledger.pageCount === 0
        ? initialPageDigest(LEDGER_DIGEST_DOMAIN)
        : updateLedgerPageDigest(
            ledger.digestBeforeTail,
            ledger.pageCount - 1,
            ledger.rawTail ?? '',
          );
  } else {
    page = ledger.pageCount - 1;
    pageEntries = [...ledger.tailEntries, entry];
    digestPrefix = ledger.digestBeforeTail;
    if (ledger.rawTail === null) {
      throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
    }
    current.set(durableLedgerPageKey(primaryKey, page), ledger.rawTail);
  }

  const pageEnvelope = {
    version: DURABLE_LEDGER_VERSION,
    page,
    entries: pageEntries,
  };
  materializePlainJsonData(pageEnvelope);
  const rawPage = JSON.stringify(pageEnvelope);
  const desired = new Map<string, string>();
  desired.set(durableLedgerPageKey(primaryKey, page), rawPage);
  const pageCount = Math.max(ledger.pageCount, page + 1);
  const entryCount = ledger.entryCount + 1;
  desired.set(
    headerKey,
    JSON.stringify({
      version: DURABLE_LEDGER_VERSION,
      pageCount,
      entryCount,
      taskBinding,
      ledgerDigest: updateLedgerPageDigest(digestPrefix, page, rawPage),
    }),
  );
  return {current, desired};
}

function parseEncodedRecordChanges(
  encoded: string,
): Array<readonly [string, string | null]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(encoded);
  } catch {
    throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
  }
  if (!Array.isArray(parsed)) {
    throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
  }
  const keys = new Set<string>();
  const result: Array<readonly [string, string | null]> = [];
  for (const entry of parsed) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      typeof entry[0] !== 'string' ||
      (entry[1] !== null && typeof entry[1] !== 'string') ||
      keys.has(entry[0])
    ) {
      throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
    }
    keys.add(entry[0]);
    result.push([entry[0], entry[1]]);
  }
  return result;
}

type DurableJournalRecord = {
  version: typeof DURABLE_JOURNAL_VERSION;
  state: 'prepared';
  operationId: string;
  kind: DurableLifecycleMutationKind;
  fingerprint: string;
  resultJson: string;
  beforeJson: string;
  afterJson: string;
  journalDigest: string;
};

function journalDigestFor(
  journal: Omit<DurableJournalRecord, 'journalDigest'>,
): string {
  const canonical = JSON.stringify({
    version: journal.version,
    state: journal.state,
    operationId: journal.operationId,
    kind: journal.kind,
    fingerprint: journal.fingerprint,
    resultJson: journal.resultJson,
    beforeJson: journal.beforeJson,
    afterJson: journal.afterJson,
  });
  return strongDigest(`${JOURNAL_DIGEST_DOMAIN}:${canonical}`);
}

function createDurableJournal(
  request: DurableLifecycleRequest,
  resultJson: string,
  changes: readonly DurableRecordChange[],
): {raw: string; record: DurableJournalRecord} {
  const withoutDigest: Omit<DurableJournalRecord, 'journalDigest'> = {
    version: DURABLE_JOURNAL_VERSION,
    state: 'prepared',
    operationId: request.operationId,
    kind: request.kind,
    fingerprint: request.fingerprint,
    resultJson,
    beforeJson: JSON.stringify(
      changes.map(change => [change.key, change.before]),
    ),
    afterJson: JSON.stringify(
      changes.map(change => [change.key, change.after]),
    ),
  };
  const record: DurableJournalRecord = {
    ...withoutDigest,
    journalDigest: journalDigestFor(withoutDigest),
  };
  materializePlainJsonData(record);
  return {raw: JSON.stringify(record), record};
}

function parseDurableJournal(rawJournal: string): DurableJournalRecord {
  const parsed = parseJsonRecord(
    rawJournal,
    'TASK_OPERATION_LEDGER_CORRUPT',
  );
  if (parsed.version !== DURABLE_JOURNAL_VERSION) {
    throw new RepositoryError('TASK_OPERATION_LEDGER_UNSUPPORTED');
  }
  if (
    !hasExactRecordKeys(parsed, [
      'version',
      'state',
      'operationId',
      'kind',
      'fingerprint',
      'resultJson',
      'beforeJson',
      'afterJson',
      'journalDigest',
    ]) ||
    parsed.state !== 'prepared' ||
    typeof parsed.operationId !== 'string' ||
    parsed.operationId.trim() === '' ||
    !isDurableLifecycleKind(parsed.kind) ||
    !isStrongDigest(parsed.fingerprint) ||
    typeof parsed.resultJson !== 'string' ||
    typeof parsed.beforeJson !== 'string' ||
    typeof parsed.afterJson !== 'string' ||
    !isStrongDigest(parsed.journalDigest)
  ) {
    throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
  }
  const withoutDigest: Omit<DurableJournalRecord, 'journalDigest'> = {
    version: DURABLE_JOURNAL_VERSION,
    state: 'prepared',
    operationId: parsed.operationId,
    kind: parsed.kind,
    fingerprint: parsed.fingerprint,
    resultJson: parsed.resultJson,
    beforeJson: parsed.beforeJson,
    afterJson: parsed.afterJson,
  };
  if (journalDigestFor(withoutDigest) !== parsed.journalDigest) {
    throw new RepositoryError('TASK_OPERATION_LEDGER_CORRUPT');
  }
  parseLedgerResult(parsed.kind, parsed.resultJson);
  return {...withoutDigest, journalDigest: parsed.journalDigest};
}

function isNumberedPrivateRecordKey(key: string, prefix: string): boolean {
  return key.startsWith(prefix) && /^\d{8}$/.test(key.slice(prefix.length));
}

function isOwnedJournalChangeKey(primaryKey: string, key: string): boolean {
  return (
    key === primaryKey ||
    key === durableCacheVersionKey(primaryKey) ||
    key === durableAuthorityRootKey(primaryKey) ||
    isAuthorityGenerationKey(primaryKey, key) ||
    key === durableLedgerHeaderKey(primaryKey) ||
    isNumberedPrivateRecordKey(
      key,
      privateRecordKey(primaryKey, 'task-page.'),
    ) ||
    isNumberedPrivateRecordKey(
      key,
      privateRecordKey(primaryKey, 'operation-ledger.page.'),
    )
  );
}

function parseJournalChanges(
  journal: DurableJournalRecord,
  primaryKey: string,
): {
  before: Array<readonly [string, string | null]>;
  after: Array<readonly [string, string | null]>;
} {
  const before = parseEncodedRecordChanges(journal.beforeJson);
  const after = parseEncodedRecordChanges(journal.afterJson);
  if (
    before.length === 0 ||
    before.length !== after.length ||
    before.some((entry, index) => entry[0] !== after[index]?.[0]) ||
    before.some((entry, index) => {
      const previous = before[index - 1];
      return (
        !isOwnedJournalChangeKey(primaryKey, entry[0]) ||
        (previous !== undefined && previous[0] >= entry[0])
      );
    })
  ) {
    throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
  }
  return {before, after};
}

function overlayBackend(
  backend: DurableBackend,
  values: ReadonlyMap<string, string | null>,
): DurableBackend {
  return {
    async getItem(key) {
      if (values.has(key)) {
        return values.get(key) ?? null;
      }
      return backend.getItem(key);
    },
    async setItem() {
      throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
    },
    async removeItem() {
      throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
    },
  };
}

function completeGraphRecords(
  tasks: DurableTaskSnapshot,
  ledger: DurableLedgerState,
): Map<string, string> {
  return new Map<string, string>([
    ...tasks.records,
    ...ledger.records,
  ]);
}

type TaskBackupEnvelope = Readonly<{
  version: 1;
  records: readonly (readonly [string, string])[];
}>;

function logicalTaskRecordAlias(
  primaryKey: string,
  key: string,
): string {
  if (key === primaryKey) return 'tasks';
  const prefix = `${primaryKey}::${PRIVATE_RECORD_NAMESPACE}.`;
  if (!key.startsWith(prefix)) {
    throw new RepositoryError('TASK_BACKUP_INVALID');
  }
  const suffix = key.slice(prefix.length);
  if (/^task-page\.\d{8}$/.test(suffix)) return suffix;
  if (suffix === 'operation-ledger.header') return 'ledger-header';
  const ledgerPage = /^operation-ledger\.page\.(\d{8})$/.exec(suffix);
  if (ledgerPage !== null) {
    return `ledger-page-${ledgerPage[1] ?? ''}`;
  }
  throw new RepositoryError('TASK_BACKUP_INVALID');
}

function physicalTaskRecordKey(
  primaryKey: string,
  alias: string,
): string {
  if (alias === 'tasks') return primaryKey;
  if (/^task-page\.\d{8}$/.test(alias)) {
    return privateRecordKey(primaryKey, alias);
  }
  if (alias === 'ledger-header') {
    return durableLedgerHeaderKey(primaryKey);
  }
  const ledgerPage = /^ledger-page-(\d{8})$/.exec(alias);
  if (ledgerPage !== null) {
    return privateRecordKey(
      primaryKey,
      `operation-ledger.page.${ledgerPage[1] ?? ''}`,
    );
  }
  throw new RepositoryError('TASK_BACKUP_INVALID');
}

function serializeTaskBackup(
  primaryKey: string,
  authority: AtomicAuthorityGraph,
): string {
  const records = Array.from(authority.records.entries())
    .map(([key, value]) => [logicalTaskRecordAlias(primaryKey, key), value] as const)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return JSON.stringify({version: 1, records});
}

function parseTaskBackup(
  primaryKey: string,
  payload: string,
): Map<string, string> {
  const parsed = parseJsonRecord(payload, 'TASK_BACKUP_INVALID');
  if (
    !hasExactRecordKeys(parsed, ['version', 'records']) ||
    parsed.version !== 1 ||
    !Array.isArray(parsed.records)
  ) {
    throw new RepositoryError('TASK_BACKUP_INVALID');
  }
  const records = new Map<string, string>();
  for (const candidate of parsed.records) {
    if (
      !Array.isArray(candidate) ||
      candidate.length !== 2 ||
      typeof candidate[0] !== 'string' ||
      typeof candidate[1] !== 'string'
    ) {
      throw new RepositoryError('TASK_BACKUP_INVALID');
    }
    const key = physicalTaskRecordKey(primaryKey, candidate[0]);
    if (records.has(key)) throw new RepositoryError('TASK_BACKUP_INVALID');
    records.set(key, candidate[1]);
  }
  return records;
}

async function validateTaskBackupRecords(
  backend: DurableBackend,
  primaryKey: string,
  records: ReadonlyMap<string, string>,
): Promise<AtomicAuthorityGraph> {
  const isolated: DurableBackend = {
    async getItem(key) {
      return records.get(key) ?? null;
    },
    async setItem() {
      throw new RepositoryError('TASK_BACKUP_INVALID');
    },
    async removeItem() {
      throw new RepositoryError('TASK_BACKUP_INVALID');
    },
  };
  const tasks = await readDurableTaskSnapshot(isolated, primaryKey);
  const ledger = await readDurableLedger(
    isolated,
    primaryKey,
    taskBinding(tasks.records),
    '__backup_inspect__',
  );
  const graph = {rootRaw: null, tasks, ledger, records: completeGraphRecords(tasks, ledger)};
  if (
    graph.records.size !== records.size ||
    Array.from(graph.records.entries()).some(
      ([key, value]) => records.get(key) !== value,
    )
  ) {
    throw new RepositoryError('TASK_BACKUP_INVALID');
  }
  void backend;
  return graph;
}

export function createTaskBackupAdapter(
  backend: DurableBackend,
  primaryKey: string = DEFAULT_STORAGE_KEY,
): TaskBackupAdapter {
  async function inspect(payload: string) {
    const records = parseTaskBackup(primaryKey, payload);
    const graph = await validateTaskBackupRecords(backend, primaryKey, records);
    const taskIds = graph.tasks.tasks.map(task => task.id);
    const references = graph.tasks.tasks.flatMap(task =>
      task.subtasks.map(subtask => ({sourceId: subtask.id, targetId: task.id})),
    );
    return {records, graph, taskIds, references};
  }
  return {
    async exportOpaquePayload() {
      const capability = atomicCapabilityFor(backend);
      if (capability !== null) {
        await helpPublishedAtomicOperations(backend, capability, primaryKey);
        await recoverDurableJournalAtomically(backend, capability, primaryKey);
      } else {
        await recoverDurableJournal(backend, primaryKey);
      }
      return serializeTaskBackup(
        primaryKey,
        await readAtomicAuthorityGraph(backend, primaryKey, '__backup_export__'),
      );
    },
    async inspectOpaquePayload(payload) {
      const result = await inspect(payload);
      return {
        recordCount: result.taskIds.length,
        taskIds: result.taskIds,
        references: result.references,
        pendingCount: result.graph.tasks.tasks.filter(task =>
          task.deletedAt === null &&
          (task.status === 'pending' || task.status === 'in_progress'),
        ).length,
        completedCount: result.graph.tasks.tasks.filter(task =>
          task.deletedAt === null && task.status === 'completed',
        ).length,
        unsortedCount: result.graph.tasks.tasks.filter(task =>
          task.deletedAt === null &&
          (task as Task & {placementState?: string}).placementState === 'UNSORTED',
        ).length,
        growthRecordCount: result.graph.tasks.tasks.reduce(
          (count, task) => count +
            ((task as Task & {growthRewards?: readonly unknown[]}).growthRewards?.length ?? 0),
          0,
        ),
      };
    },
    async hasDurableData() {
      const journal = await durableGet(backend, durableJournalKey(primaryKey));
      if (journal !== null) {
        parseDurableJournal(journal);
        return true;
      }
      const lock = await durableGet(backend, durableAtomicLockKey(primaryKey));
      if (lock !== null) {
        parseDurableJournal(lock);
        return true;
      }
      const root = await durableGet(backend, durableAuthorityRootKey(primaryKey));
      if (root !== null) {
        parseAtomicAuthorityRoot(root, primaryKey);
        return true;
      }
      return (await durableGet(backend, primaryKey)) !== null;
    },
    async restoreOpaquePayload(payload) {
      const inspected = await inspect(payload);
      for (const [key, value] of inspected.records) {
        await durableSet(backend, key, value);
      }
    },
  };
}

type AtomicAuthorityGraph = {
  rootRaw: string | null;
  tasks: DurableTaskSnapshot;
  ledger: DurableLedgerState;
  records: Map<string, string>;
};

function authorityGenerationBackend(
  backend: DurableBackend,
  primaryKey: string,
  records: ReadonlyMap<string, string>,
): DurableBackend {
  return {
    async getItem(recordKey) {
      if (isAuthorityCoreRecordKey(primaryKey, recordKey)) {
        return records.get(recordKey) ?? null;
      }
      return backend.getItem(recordKey);
    },
    async setItem() {
      throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
    },
    async removeItem() {
      throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
    },
  };
}

async function readAtomicAuthorityGraph(
  backend: DurableBackend,
  primaryKey: string,
  requestedOperationId: string,
): Promise<AtomicAuthorityGraph> {
  const rootRaw = await durableGet(backend, durableAuthorityRootKey(primaryKey));
  if (rootRaw === null) {
    const tasks = await readDurableTaskSnapshot(backend, primaryKey);
    const ledger = await readDurableLedger(
      backend,
      primaryKey,
      taskBinding(tasks.records),
      requestedOperationId,
    );
    return {
      rootRaw,
      tasks,
      ledger,
      records: completeGraphRecords(tasks, ledger),
    };
  }

  const root = parseAtomicAuthorityRoot(rootRaw, primaryKey);
  const rawGeneration = await durableGet(backend, root.generationKey);
  if (rawGeneration === null) {
    throw new RepositoryError('TASK_OPERATION_LEDGER_CORRUPT');
  }
  const generation = parseAtomicAuthorityGeneration(
    rawGeneration,
    root,
    primaryKey,
  );
  const generationBackend = authorityGenerationBackend(
    backend,
    primaryKey,
    generation.records,
  );
  const tasks = await readDurableTaskSnapshot(generationBackend, primaryKey);
  const ledger = await readDurableLedger(
    generationBackend,
    primaryKey,
    taskBinding(tasks.records),
    requestedOperationId,
  );
  const records = completeGraphRecords(tasks, ledger);
  if (sortedRecordBytes(records) !== generation.record.recordsJson) {
    throw new RepositoryError('TASK_OPERATION_LEDGER_CORRUPT');
  }
  return {rootRaw, tasks, ledger, records};
}

function rebindLedgerRecords(
  primaryKey: string,
  records: ReadonlyMap<string, string>,
  boundTasks: ReadonlyMap<string, string>,
): Map<string, string> {
  const rebound = new Map(records);
  const headerKey = durableLedgerHeaderKey(primaryKey);
  const rawHeader = rebound.get(headerKey);
  if (rawHeader === undefined) {
    return rebound;
  }
  const header = parseJsonRecord(
    rawHeader,
    'TASK_OPERATION_LEDGER_CORRUPT',
  );
  if (
    !hasExactRecordKeys(header, [
      'version',
      'pageCount',
      'entryCount',
      'taskBinding',
      'ledgerDigest',
    ]) ||
    header.version !== DURABLE_LEDGER_VERSION ||
    typeof header.pageCount !== 'number' ||
    typeof header.entryCount !== 'number' ||
    !isStrongDigest(header.taskBinding) ||
    !isStrongDigest(header.ledgerDigest)
  ) {
    throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
  }
  rebound.set(
    headerKey,
    JSON.stringify({
      version: DURABLE_LEDGER_VERSION,
      pageCount: header.pageCount,
      entryCount: header.entryCount,
      taskBinding: taskBinding(boundTasks),
      ledgerDigest: header.ledgerDigest,
    }),
  );
  return rebound;
}

async function reconcileAuthorityMirrors(
  backend: DurableBackend,
  capability: StartFiveAtomicCapabilityV1,
  primaryKey: string,
  authority: AtomicAuthorityGraph,
): Promise<void> {
  if (authority.rootRaw === null) {
    return;
  }
  const rootKey = durableAuthorityRootKey(primaryKey);
  const desiredMirrors = new Map(authority.records);
  const root = parseAtomicAuthorityRoot(authority.rootRaw, primaryKey);
  const authoritativePrimary = desiredMirrors.get(primaryKey);
  if (authoritativePrimary === undefined) {
    throw new RepositoryError('TASK_SNAPSHOT_INVALID');
  }
  desiredMirrors.set(
    primaryKey,
    `${authoritativePrimary.trimEnd()}${generationWhitespace(root.generation)}`,
  );
  desiredMirrors.set(durableCacheVersionKey(primaryKey), authority.rootRaw);
  for (const [recordKey, desiredValue] of desiredMirrors) {
    for (let attempt = 0; attempt < ATOMIC_MAX_ACQUIRE_ATTEMPTS; attempt += 1) {
      if ((await durableGet(backend, rootKey)) !== authority.rootRaw) {
        return;
      }
      const current = await durableGet(backend, recordKey);
      if (current === desiredValue) {
        break;
      }
      if (await compareExchange(capability, recordKey, current, desiredValue)) {
        // A root change after this CAS is harmless to logical reads.  Its
        // publisher must in turn reconcile every mirror from the newer,
        // generation-stamped authority before settling.
        break;
      }
      await Promise.resolve();
      if (attempt === ATOMIC_MAX_ACQUIRE_ATTEMPTS - 1) {
        throw new RepositoryError('TASK_ATOMIC_COORDINATION_BUSY');
      }
    }
  }
}

function sameChanges(
  expected: readonly DurableRecordChange[],
  before: readonly (readonly [string, string | null])[],
  after: readonly (readonly [string, string | null])[],
): boolean {
  return (
    expected.length === before.length &&
    expected.every(
      (change, index) =>
        before[index]?.[0] === change.key &&
        before[index]?.[1] === change.before &&
        after[index]?.[0] === change.key &&
        after[index]?.[1] === change.after,
    )
  );
}

function sameJournalChangesWithCacheVersion(
  primaryKey: string,
  expected: readonly DurableRecordChange[],
  before: readonly (readonly [string, string | null])[],
  after: readonly (readonly [string, string | null])[],
  beforeTasks: DurableTaskSnapshot,
  afterTasks: DurableTaskSnapshot,
  beforeLedger: DurableLedgerState,
  afterLedger: DurableLedgerState,
): boolean {
  const versionKey = durableCacheVersionKey(primaryKey);
  const rootKey = durableAuthorityRootKey(primaryKey);
  const isSystemKey = (recordKey: string): boolean =>
    recordKey === versionKey ||
    recordKey === rootKey ||
    isAuthorityGenerationKey(primaryKey, recordKey);
  const beforeCore = before.filter(([recordKey]) => !isSystemKey(recordKey));
  const afterCore = after.filter(([recordKey]) => !isSystemKey(recordKey));
  if (!sameChanges(expected, beforeCore, afterCore)) {
    return false;
  }

  const beforeVersion = before.find(([key]) => key === versionKey);
  const afterVersion = after.find(([key]) => key === versionKey);
  if ((beforeVersion === undefined) !== (afterVersion === undefined)) {
    return false;
  }
  const beforeRoot = before.find(([recordKey]) => recordKey === rootKey);
  const afterRoot = after.find(([recordKey]) => recordKey === rootKey);
  const beforeGenerations = before.filter(([recordKey]) =>
    isAuthorityGenerationKey(primaryKey, recordKey),
  );
  const afterGenerations = after.filter(([recordKey]) =>
    isAuthorityGenerationKey(primaryKey, recordKey),
  );
  const hasAuthorityChange =
    beforeRoot !== undefined ||
    afterRoot !== undefined ||
    beforeGenerations.length > 0 ||
    afterGenerations.length > 0;
  if (!hasAuthorityChange) {
    const expectedBefore = taskBinding(beforeTasks.records);
    const expectedAfter = taskBinding(afterTasks.records);
    if (beforeVersion === undefined || afterVersion === undefined) {
      return expectedBefore === expectedAfter;
    }
    return (
      (beforeVersion[1] === null || beforeVersion[1] === expectedBefore) &&
      afterVersion[1] === expectedAfter
    );
  }

  if (
    beforeRoot === undefined ||
    afterRoot === undefined ||
    beforeGenerations.length !== afterGenerations.length ||
    (beforeGenerations.length !== 1 && beforeGenerations.length !== 2) ||
    beforeGenerations.some(
      (entry, index) =>
        entry[0] !== afterGenerations[index]?.[0] || entry[1] !== null,
    ) ||
    afterGenerations.some(entry => entry[1] === null) ||
    afterRoot[1] === null ||
    beforeVersion === undefined ||
    afterVersion === undefined ||
    afterVersion[1] !== afterRoot[1]
  ) {
    return false;
  }
  try {
    if (beforeRoot[1] !== null) {
      parseAtomicAuthorityRoot(beforeRoot[1], primaryKey);
    }
    const parsedRoot = parseAtomicAuthorityRoot(afterRoot[1], primaryKey);
    const afterGeneration = afterGenerations.find(
      entry => entry[0] === parsedRoot.generationKey,
    );
    if (afterGeneration === undefined || afterGeneration[1] === null) {
      return false;
    }
    const parsedGeneration = parseAtomicAuthorityGeneration(
      afterGeneration[1],
      parsedRoot,
      primaryKey,
    );
    if (
      parsedGeneration.record.recordsJson !==
        sortedRecordBytes(completeGraphRecords(afterTasks, afterLedger))
    ) {
      return false;
    }
    if (beforeRoot[1] === null) {
      const initialGeneration = afterGenerations.find(
        entry => entry[0] !== parsedRoot.generationKey,
      );
      if (
        afterGenerations.length !== 2 ||
        initialGeneration === undefined ||
        initialGeneration[1] === null
      ) {
        return false;
      }
      const initialId = initialGeneration[0].slice(
        privateRecordKey(primaryKey, 'authority-generation.').length,
      );
      const initialRoot: AtomicAuthorityRoot = {
        version: ATOMIC_AUTHORITY_VERSION,
        generation: initialId,
        generationKey: initialGeneration[0],
        generationDigest: strongDigest(initialGeneration[1]),
      };
      const rawInitialRoot = JSON.stringify(initialRoot);
      const parsedInitial = parseAtomicAuthorityGeneration(
        initialGeneration[1],
        initialRoot,
        primaryKey,
      );
      if (
        parsedInitial.record.parentRoot !== null ||
        parsedInitial.record.recordsJson !==
          sortedRecordBytes(completeGraphRecords(beforeTasks, beforeLedger)) ||
        parsedGeneration.record.parentRoot !== rawInitialRoot
      ) {
        return false;
      }
    } else if (parsedGeneration.record.parentRoot !== beforeRoot[1]) {
      return false;
    }
    const beforeVersionValue = beforeVersion[1];
    return (
      beforeVersionValue === null ||
      beforeVersionValue === beforeRoot[1] ||
      isStrongDigest(beforeVersionValue)
    );
  } catch {
    return false;
  }
}

function assertResultMatchesTaskState(
  journal: DurableJournalRecord,
  tasks: readonly Task[],
): void {
  const parsed = parseLedgerResult(journal.kind, journal.resultJson);
  let resultTask: unknown = parsed;
  if (journal.kind === 'complete') {
    if (!isPlainRecord(parsed)) {
      throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
    }
    resultTask = parsed.task;
  }
  if (
    !isPlainRecord(resultTask) ||
    typeof resultTask.id !== 'string'
  ) {
    throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
  }
  const persisted = tasks.find(task => task.id === resultTask.id);
  if (
    persisted === undefined ||
    JSON.stringify(persisted) !== JSON.stringify(resultTask)
  ) {
    throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
  }
}

function isStorageReadFailure(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.endsWith('READ_FAILED')
  );
}

async function preflightDurableJournal(
  backend: DurableBackend,
  primaryKey: string,
  journal: DurableJournalRecord,
): Promise<{
  before: Array<readonly [string, string | null]>;
  after: Array<readonly [string, string | null]>;
}> {
  const changes = parseJournalChanges(journal, primaryKey);
  const beforeValues = new Map(changes.before);
  const afterValues = new Map(changes.after);
  try {
    const beforeBackend = overlayBackend(backend, beforeValues);
    const afterBackend = overlayBackend(backend, afterValues);
    const beforeTasks = await readDurableTaskSnapshot(beforeBackend, primaryKey);
    const afterTasks = await readDurableTaskSnapshot(afterBackend, primaryKey);
    const beforeLedger = await readDurableLedger(
      beforeBackend,
      primaryKey,
      taskBinding(beforeTasks.records),
      journal.operationId,
    );
    const afterLedger = await readDurableLedger(
      afterBackend,
      primaryKey,
      taskBinding(afterTasks.records),
      journal.operationId,
    );
    if (beforeLedger.matchedEntry !== null) {
      throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
    }
    const appended = afterLedger.matchedEntry;
    if (
      appended === null ||
      appended.kind !== journal.kind ||
      appended.fingerprint !== journal.fingerprint ||
      appended.resultJson !== journal.resultJson
    ) {
      throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
    }
    assertResultMatchesTaskState(journal, afterTasks.tasks);
    const expected = durableRecordChanges(
      completeGraphRecords(beforeTasks, beforeLedger),
      completeGraphRecords(afterTasks, afterLedger),
    );
    if (
      !sameJournalChangesWithCacheVersion(
        primaryKey,
        expected,
        changes.before,
        changes.after,
        beforeTasks,
        afterTasks,
        beforeLedger,
        afterLedger,
      )
    ) {
      throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
    }
  } catch (error: unknown) {
    if (isStorageReadFailure(error)) {
      throw error;
    }
    throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
  }
  return changes;
}

async function compensatePreparedBytes(
  backend: DurableBackend,
  before: readonly (readonly [string, string | null])[],
  journalKey: string,
  rawJournal: string,
): Promise<void> {
  for (const [key, value] of before.slice().reverse()) {
    await applyDurableValue(backend, key, value);
  }
  await durableSet(backend, journalKey, rawJournal);
}

async function recoverDurableJournal(
  backend: DurableBackend,
  primaryKey: string,
): Promise<void> {
  const journalKey = durableJournalKey(primaryKey);
  const rawJournal = await durableGet(backend, journalKey);
  if (rawJournal === null) {
    return;
  }
  const journal = parseDurableJournal(rawJournal);
  const {before, after} = await preflightDurableJournal(
    backend,
    primaryKey,
    journal,
  );
  for (let index = 0; index < before.length; index += 1) {
    const key = before[index]?.[0];
    const beforeValue = before[index]?.[1];
    const afterValue = after[index]?.[1];
    if (key === undefined) {
      throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
    }
    const current = await durableGet(backend, key);
    if (current !== beforeValue && current !== afterValue) {
      throw new RepositoryError('TASK_OPERATION_LEDGER_INDETERMINATE');
    }
  }

  try {
    for (const [key, value] of after) {
      await applyDurableValue(backend, key, value);
    }
    await durableRemove(backend, journalKey);
  } catch (error: unknown) {
    try {
      await compensatePreparedBytes(backend, before, journalKey, rawJournal);
    } catch (rollbackError: unknown) {
      throw new RepositoryError('TASK_STORAGE_ROLLBACK_FAILED', {
        operationError: error,
        rollbackError,
      });
    }
    throw error;
  }
}

async function commitDurableOperation(
  backend: DurableBackend,
  primaryKey: string,
  request: DurableLifecycleRequest,
  resultJson: string,
  changes: readonly DurableRecordChange[],
): Promise<void> {
  const journalKey = durableJournalKey(primaryKey);
  const journal = createDurableJournal(request, resultJson, changes);
  try {
    await durableSet(backend, journalKey, journal.raw);
    for (const change of changes) {
      await applyDurableValue(backend, change.key, change.after);
    }
    await durableRemove(backend, journalKey);
  } catch (error: unknown) {
    await rollbackDurableChanges(backend, changes, journalKey);
    throw error;
  }
}

/**
 * The atomic coordination record is itself a complete, authenticated commit
 * plan.  Publishing only an owner id is not recoverable: if the backend
 * commits that CAS but its acknowledgement is lost, no other facade has the
 * callback inputs needed to finish the operation.  A durable journal contains
 * both the before/after bytes and the replay result, so any facade can safely
 * help the published owner to completion.
 */
async function completePublishedAtomicOperation(
  backend: DurableBackend,
  capability: StartFiveAtomicCapabilityV1,
  primaryKey: string,
  rawPlan: string,
): Promise<void> {
  const lockKey = durableAtomicLockKey(primaryKey);
  const journal = parseDurableJournal(rawPlan);
  const {before, after} = await preflightDurableJournal(
    backend,
    primaryKey,
    journal,
  );
  const rootKey = durableAuthorityRootKey(primaryKey);
  const versionKey = durableCacheVersionKey(primaryKey);
  const authorityRootBefore = before.find(
    ([recordKey]) => recordKey === rootKey,
  )?.[1];
  const authorityRootAfter = after.find(([recordKey]) => recordKey === rootKey)?.[1];
  if (
    authorityRootBefore !== undefined &&
    authorityRootAfter !== undefined
  ) {
    for (let index = 0; index < before.length; index += 1) {
      const beforeEntry = before[index];
      const afterEntry = after[index];
      if (beforeEntry === undefined || afterEntry === undefined) {
        throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
      }
      const [recordKey, beforeValue] = beforeEntry;
      const afterValue = afterEntry[1];
      if (
        recordKey === rootKey ||
        recordKey === versionKey ||
        isAuthorityGenerationKey(primaryKey, recordKey)
      ) {
        continue;
      }
      const current = await durableGet(backend, recordKey);
      if (current === beforeValue || current === afterValue) {
        continue;
      }
      if (
        (await durableGet(backend, rootKey)) !== authorityRootBefore ||
        (await durableGet(backend, lockKey)) !== rawPlan
      ) {
        return;
      }
      if (!(await compareExchange(capability, recordKey, current, beforeValue))) {
        const observed = await durableGet(backend, recordKey);
        if (observed === beforeValue || observed === afterValue) {
          continue;
        }
        if (
          (await durableGet(backend, rootKey)) !== authorityRootBefore ||
          (await durableGet(backend, lockKey)) !== rawPlan
        ) {
          return;
        }
        throw new RepositoryError('TASK_OPERATION_LEDGER_INDETERMINATE');
      }
    }
  }
  const orderedIndexes = after
    .map((entry, index) => ({entry, index}))
    .sort((left, right) => {
      const rank = (recordKey: string): number => {
        if (isAuthorityGenerationKey(primaryKey, recordKey)) {
          return 0;
        }
        if (recordKey === rootKey) {
          return 1;
        }
        if (recordKey === versionKey) {
          return 3;
        }
        return 2;
      };
      return rank(left.entry[0]) - rank(right.entry[0]);
    })
    .map(({index}) => index);

  for (const index of orderedIndexes) {
    // This byte-for-byte ownership check is the fencing token.  A delayed
    // owner may continue only while its exact published plan still owns the
    // physical lock record.
    if ((await durableGet(backend, lockKey)) !== rawPlan) {
      return;
    }
    const beforeEntry = before[index];
    const afterEntry = after[index];
    if (beforeEntry === undefined || afterEntry === undefined) {
      throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
    }
    const [recordKey, beforeValue] = beforeEntry;
    const afterValue = afterEntry[1];
    const current = await durableGet(backend, recordKey);
    if (current === afterValue) {
      continue;
    }
    if (
      current !== beforeValue ||
      !(await compareExchange(capability, recordKey, beforeValue, afterValue))
    ) {
      const observed = await durableGet(backend, recordKey);
      if (observed !== afterValue) {
        if (
          authorityRootAfter !== undefined &&
          (await durableGet(backend, rootKey)) !== authorityRootAfter
        ) {
          return;
        }
        if ((await durableGet(backend, lockKey)) !== rawPlan) {
          return;
        }
        throw new RepositoryError('TASK_OPERATION_LEDGER_INDETERMINATE');
      }
    }
  }

  const observedOwner = await durableGet(backend, lockKey);
  if (observedOwner === null) {
    return;
  }
  if (observedOwner !== rawPlan) {
    return;
  }
  if (!(await compareExchange(capability, lockKey, rawPlan, null))) {
    const afterRelease = await durableGet(backend, lockKey);
    if (afterRelease !== null) {
      throw new RepositoryError('TASK_ATOMIC_COORDINATION_INDETERMINATE');
    }
  }
}

async function helpPublishedAtomicOperations(
  backend: DurableBackend,
  capability: StartFiveAtomicCapabilityV1,
  primaryKey: string,
): Promise<void> {
  const lockKey = durableAtomicLockKey(primaryKey);
  for (let attempt = 0; attempt < ATOMIC_MAX_ACQUIRE_ATTEMPTS; attempt += 1) {
    const rawPlan = await durableGet(backend, lockKey);
    if (rawPlan === null) {
      return;
    }
    await completePublishedAtomicOperation(
      backend,
      capability,
      primaryKey,
      rawPlan,
    );
    await Promise.resolve();
  }
  throw new RepositoryError('TASK_ATOMIC_COORDINATION_BUSY');
}

async function compensatePreparedBytesAtomically(
  backend: DurableBackend,
  capability: StartFiveAtomicCapabilityV1,
  before: readonly (readonly [string, string | null])[],
  journalKey: string,
  rawJournal: string,
): Promise<void> {
  for (const [key, beforeValue] of before.slice().reverse()) {
    const current = await durableGet(backend, key);
    if (current === beforeValue) {
      continue;
    }
    if (
      !(await compareExchange(capability, key, current, beforeValue))
    ) {
      throw new RepositoryError('TASK_STORAGE_ROLLBACK_FAILED');
    }
  }
  const currentJournal = await durableGet(backend, journalKey);
  if (currentJournal === rawJournal) {
    return;
  }
  if (
    currentJournal !== null ||
    !(await compareExchange(capability, journalKey, null, rawJournal))
  ) {
    throw new RepositoryError('TASK_STORAGE_ROLLBACK_FAILED');
  }
}

async function recoverDurableJournalAtomically(
  backend: DurableBackend,
  capability: StartFiveAtomicCapabilityV1,
  primaryKey: string,
): Promise<void> {
  const journalKey = durableJournalKey(primaryKey);
  const rawJournal = await durableGet(backend, journalKey);
  if (rawJournal === null) {
    return;
  }
  const journal = parseDurableJournal(rawJournal);
  const {before, after} = await preflightDurableJournal(
    backend,
    primaryKey,
    journal,
  );
  try {
    for (let index = 0; index < after.length; index += 1) {
      const beforeEntry = before[index];
      const afterEntry = after[index];
      if (beforeEntry === undefined || afterEntry === undefined) {
        throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
      }
      const [key, beforeValue] = beforeEntry;
      const afterValue = afterEntry[1];
      const current = await durableGet(backend, key);
      if (current === afterValue) {
        continue;
      }
      if (
        current !== beforeValue ||
        !(await compareExchange(capability, key, beforeValue, afterValue))
      ) {
        throw new RepositoryError('TASK_OPERATION_LEDGER_INDETERMINATE');
      }
    }
    if (!(await compareExchange(capability, journalKey, rawJournal, null))) {
      throw new RepositoryError('TASK_OPERATION_LEDGER_INDETERMINATE');
    }
  } catch (error: unknown) {
    try {
      await compensatePreparedBytesAtomically(
        backend,
        capability,
        before,
        journalKey,
        rawJournal,
      );
    } catch (rollbackError: unknown) {
      throw new RepositoryError('TASK_STORAGE_ROLLBACK_FAILED', {
        operationError: error,
        rollbackError,
      });
    }
    throw error;
  }
}

const TASK_PATCH_KEYS = new Set<string>([
  'title',
  'description',
  'important',
  'urgent',
  'status',
  'startAt',
  'dueAt',
  'createdAt',
  'updatedAt',
  'startedAt',
  'completedAt',
  'deletedAt',
  'score',
  'scoreAwardedAt',
  'subtasks',
  'scheduledStartAt',
  'estimatedMinutes',
  'firstStep',
  'progress',
  'prioritySchemaVersion',
  'importanceScore',
  'manualUrgencyScore',
  'urgencyMode',
  'repeatRule',
  'repeatSeriesId',
  'repeatOccurrenceKey',
  'postponedCount',
  'supportSchemaVersion',
  'nextStartAt',
  'stuckRepair',
  'rescuePlan',
  'postponePromptAcknowledgedKey',
  'abandonReason',
  'growthSchemaVersion',
  'growthRewards',
  'firstStepCompletion',
  'placementState',
  'archivedAt',
  'archiveReason',
  'lastMeaningfulActivityAt',
  'completionRewardConsumed',
  'completionDefinition',
  'progressSource',
  'steps',
  'plannedWorkSessions',
  'deliveryRiskDismissedAt',
  'deliveryRiskDismissedBand',
]);

function invalidSnapshot(): never {
  throw new TaskSnapshotValidationError();
}

function assertValidTaskPatch(
  patch: Partial<Omit<Task, 'id'>>,
): void {
  assertPlainJsonData(patch);
  if (
    typeof patch !== 'object' ||
    patch === null ||
    Array.isArray(patch) ||
    Object.getPrototypeOf(patch) !== Object.prototype ||
    Object.keys(patch).some(key => !TASK_PATCH_KEYS.has(key))
  ) {
    return invalidSnapshot();
  }
}

function findTaskIndex(tasks: readonly Task[], id: string): number {
  return tasks.findIndex(task => task.id === id);
}

function normalizeLegacyMutationTask(task: Task): Task {
  if (
    (task.status === 'in_progress' || task.status === 'completed') &&
    task.startedAt === null
  ) {
    return {...task, startedAt: task.createdAt};
  }
  return task;
}

function createIn(tasks: Task[], task: Task): Task {
  // Materialize caller input once inside the narrow validation boundary.
  // Normalization and cloning must never read the caller object again.
  const snapshot = materializePlainJsonData(task);
  const candidate = normalizeLegacyMutationTask(snapshot);
  assertValidTaskMutationSnapshot([candidate]);
  if (findTaskIndex(tasks, candidate.id) !== -1) {
    throw new RepositoryError('TASK_ALREADY_EXISTS');
  }

  const stored = cloneTask(candidate);
  tasks.push(stored);
  return cloneTask(stored);
}

function getByIdIn(
  tasks: readonly Task[],
  id: string,
  options?: RepositoryReadOptions,
): Task | null {
  const task = tasks.find(candidate => candidate.id === id);
  if (!task || (!options?.includeDeleted && task.deletedAt !== null)) {
    return null;
  }

  return cloneTask(task);
}

function listIn(
  tasks: readonly Task[],
  options?: RepositoryReadOptions,
): Task[] {
  const visible = options?.includeDeleted
    ? tasks
    : tasks.filter(task => task.deletedAt === null);
  return cloneTasks(visible);
}

function updateIn(
  tasks: Task[],
  id: string,
  patch: Partial<Omit<Task, 'id'>>,
): Task {
  // Spreading a caller Proxy would perform unguarded ordinary reads. Detach a
  // stable snapshot first, then validate and merge only that ordinary object.
  const snapshot = materializePlainJsonData(patch);
  assertValidTaskPatch(snapshot);
  const index = findTaskIndex(tasks, id);
  if (index === -1) {
    throw new RepositoryError('TASK_NOT_FOUND');
  }

  const current = tasks[index];
  if (!current) {
    throw new RepositoryError('TASK_NOT_FOUND');
  }

  const candidate = normalizeLegacyMutationTask({
    ...current,
    ...snapshot,
    id: current.id,
  });
  assertValidTaskMutationSnapshot([candidate]);
  const updated = cloneTask(candidate);
  tasks[index] = updated;
  return cloneTask(updated);
}

type SoftDeleteResult = {
  task: Task;
  changed: boolean;
};

function softDeleteIn(
  tasks: Task[],
  id: string,
  deletedAt: string,
): SoftDeleteResult {
  assertPlainJsonData(deletedAt);
  if (
    typeof deletedAt !== 'string' ||
    deletedAt.trim() === '' ||
    !Number.isFinite(Date.parse(deletedAt))
  ) {
    return invalidSnapshot();
  }
  const index = findTaskIndex(tasks, id);
  if (index === -1) {
    throw new RepositoryError('TASK_NOT_FOUND');
  }

  const current = tasks[index];
  if (!current) {
    throw new RepositoryError('TASK_NOT_FOUND');
  }

  if (current.deletedAt !== null) {
    return {task: cloneTask(current), changed: false};
  }

  const deletedAtMilliseconds = Date.parse(deletedAt);
  const updatedAtMilliseconds = Date.parse(current.updatedAt);
  const deletedCandidate: Task = {
    ...current,
    deletedAt,
    updatedAt:
      deletedAtMilliseconds > updatedAtMilliseconds
        ? deletedAt
        : current.updatedAt,
  };
  assertValidTaskMutationSnapshot([deletedCandidate]);
  const deleted = cloneTask(deletedCandidate);
  tasks[index] = deleted;
  return {task: cloneTask(deleted), changed: true};
}

type TransactionSurfaceLifetime = {
  transaction: TaskTransaction;
  expire(): void;
};

function createTransactionSurface(tasks: Task[]): TransactionSurfaceLifetime {
  let active = true;

  function assertActive(): void {
    if (!active) {
      throw new RepositoryError('TASK_REPOSITORY_TRANSACTION_EXPIRED');
    }
  }

  return {
    transaction: {
      async create(task) {
        assertActive();
        return createIn(tasks, task);
      },
      async getById(id, options) {
        assertActive();
        return getByIdIn(tasks, id, options);
      },
      async list(options) {
        assertActive();
        return listIn(tasks, options);
      },
      async update(id, patch) {
        assertActive();
        return updateIn(tasks, id, patch);
      },
      async softDelete(id, deletedAt) {
        assertActive();
        return softDeleteIn(tasks, id, deletedAt).task;
      },
    },
    expire() {
      active = false;
    },
  };
}

type SharedRepositoryState = {
  committedTasks: Task[] | null;
  cacheVersion: string | null;
  loadPromise: Promise<Task[]> | null;
  mutationQueue: Promise<void>;
  transactionCallbackActive: boolean;
  durableBackend: DurableBackend | null;
  durableRepresentation: 'v1' | 'scalable' | null;
  runDurableLifecycleOperation?: DurableLifecycleOperationRunner;
};

const repositoryStates = new WeakMap<
  object,
  Map<string, SharedRepositoryState>
>();

const repositoryCoordinationIdentities = new WeakMap<TaskRepository, object>();

/** @internal Allows application services to coordinate over one repository backend/key. */
export function getTaskRepositoryCoordinationIdentity(
  repository: TaskRepository,
): object {
  return repositoryCoordinationIdentities.get(repository) ?? repository;
}

function sharedRepositoryState(
  storage: KeyValueStorage,
  key: string,
): SharedRepositoryState {
  const identity =
    storage[TASK_REPOSITORY_COORDINATION_IDENTITY] ?? storage;
  let statesByKey = repositoryStates.get(identity);
  if (statesByKey === undefined) {
    statesByKey = new Map<string, SharedRepositoryState>();
    repositoryStates.set(identity, statesByKey);
  }

  const existing = statesByKey.get(key);
  if (existing !== undefined) {
    return existing;
  }

  const created: SharedRepositoryState = {
    committedTasks: null,
    cacheVersion: null,
    loadPromise: null,
    mutationQueue: Promise.resolve(),
    transactionCallbackActive: false,
    durableBackend: durableBackendFor(storage),
    durableRepresentation: null,
  };
  statesByKey.set(key, created);
  return created;
}

export function createTaskDurablePresenceProbe(
  storage: KeyValueStorage,
  key = DEFAULT_STORAGE_KEY,
): TaskDurablePresenceProbe {
  const backend = durableBackendFor(storage);
  return {
    async probe(): Promise<TaskDurablePresence> {
      if (backend === null) {
        const mirror = await storage.getItem(key);
        return mirror === null ? 'absent' : 'present';
      }

      // A valid authority, prepared recovery record, or published atomic plan
      // is durable task state even while the compatibility mirror is absent.
      const authorityRoot = await durableGet(
        backend,
        durableAuthorityRootKey(key),
      );
      if (authorityRoot !== null) {
        const root = parseAtomicAuthorityRoot(authorityRoot, key);
        const generation = await durableGet(backend, root.generationKey);
        if (generation === null) {
          throw new RepositoryError('TASK_OPERATION_LEDGER_CORRUPT');
        }
        parseAtomicAuthorityGeneration(generation, root, key);
        return 'present';
      }

      const journal = await durableGet(backend, durableJournalKey(key));
      if (journal !== null) {
        parseJournalChanges(parseDurableJournal(journal), key);
        return 'present';
      }

      const atomicLock = await durableGet(backend, durableAtomicLockKey(key));
      if (atomicLock !== null) {
        parseJournalChanges(parseDurableJournal(atomicLock), key);
        return 'present';
      }

      const tasks = await readDurableTaskSnapshot(backend, key);
      return tasks.records.size === 0 ? 'absent' : 'present';
    },
  };
}

export function createTaskRepository(
  storage: KeyValueStorage,
  key: string = DEFAULT_STORAGE_KEY,
): RefreshableTaskRepository {
  const state = sharedRepositoryState(storage, key);

  function hasErrorCode(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === code
    );
  }

  async function loadAtomicSnapshot(
    backend: DurableBackend,
    capability: StartFiveAtomicCapabilityV1,
  ): Promise<Task[]> {
    const rootKey = durableAuthorityRootKey(key);
    for (let attempt = 0; attempt < ATOMIC_MAX_ACQUIRE_ATTEMPTS; attempt += 1) {
      await helpPublishedAtomicOperations(backend, capability, key);
      const rootBefore = await durableGet(backend, rootKey);
      const authority = await readAtomicAuthorityGraph(
        backend,
        key,
        'start-five-cache-read',
      );
      const rootAfter = await durableGet(backend, rootKey);
      if (rootBefore === rootAfter && authority.rootRaw === rootAfter) {
        state.committedTasks = cloneTasks(authority.tasks.tasks);
        state.cacheVersion = rootAfter;
        state.loadPromise = null;
        state.durableRepresentation = authority.tasks.representation;
        return state.committedTasks;
      }
      await Promise.resolve();
    }
    throw new RepositoryError('TASK_ATOMIC_COORDINATION_BUSY');
  }

  async function getCommittedTasks(): Promise<Task[]> {
    if (state.durableBackend !== null) {
      const capability = atomicCapabilityFor(state.durableBackend);
      if (capability !== null) {
        await helpPublishedAtomicOperations(
          state.durableBackend,
          capability,
          key,
        );
        const observedVersion = await durableGet(
          state.durableBackend,
          durableAuthorityRootKey(key),
        );
        if (
          state.committedTasks !== null &&
          observedVersion === state.cacheVersion
        ) {
          return state.committedTasks;
        }
        return loadAtomicSnapshot(state.durableBackend, capability);
      }
    }

    if (state.committedTasks !== null) {
      return state.committedTasks;
    }

    if (state.loadPromise === null) {
      state.loadPromise = storage
        .getItem(key)
        .then(serialized => {
          state.durableRepresentation = 'v1';
          return deserializeTasks(serialized);
        })
        .catch(async (error: unknown) => {
          if (
            state.durableBackend === null ||
            !hasErrorCode(error, 'TASK_SNAPSHOT_UNSUPPORTED')
          ) {
            throw error;
          }
          const snapshot = await readDurableTaskSnapshot(
            state.durableBackend,
            key,
          );
          if (snapshot.representation !== 'scalable') {
            throw error;
          }
          state.durableRepresentation = snapshot.representation;
          return snapshot.tasks;
        });
    }

    try {
      const loaded = await state.loadPromise;
      if (state.committedTasks === null) {
        state.committedTasks = loaded;
      }
      return state.committedTasks;
    } catch (error: unknown) {
      state.loadPromise = null;
      throw error;
    }
  }

  async function reloadCommittedTasks(): Promise<Task[]> {
    if (state.durableBackend !== null) {
      const capability = atomicCapabilityFor(state.durableBackend);
      if (capability !== null) {
        await helpPublishedAtomicOperations(
          state.durableBackend,
          capability,
          key,
        );
        return cloneTasks(
          await loadAtomicSnapshot(state.durableBackend, capability),
        );
      }
    }

    let loaded: Task[];
    let representation: 'v1' | 'scalable' = 'v1';
    try {
      loaded = deserializeTasks(await storage.getItem(key));
    } catch (error: unknown) {
      if (
        state.durableBackend === null ||
        !hasErrorCode(error, 'TASK_SNAPSHOT_UNSUPPORTED')
      ) {
        throw error;
      }
      const snapshot = await readDurableTaskSnapshot(state.durableBackend, key);
      if (snapshot.representation !== 'scalable') {
        throw error;
      }
      loaded = snapshot.tasks;
      representation = snapshot.representation;
    }
    // Replace the shared cache only after the durable representation has been
    // fully read and validated. A failed probe leaves the last known-good
    // projection intact and performs no write.
    state.committedTasks = cloneTasks(loaded);
    state.loadPromise = null;
    state.durableRepresentation = representation;
    return cloneTasks(loaded);
  }

  function enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = state.mutationQueue.then(operation);
    state.mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function enqueueFacadeMutation<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    if (state.transactionCallbackActive) {
      return Promise.reject(
        new RepositoryError('TASK_REPOSITORY_REENTRANT_MUTATION'),
      );
    }
    return enqueueMutation(operation);
  }

  async function commit(stagedTasks: readonly Task[]): Promise<void> {
    const desiredV1 = trySerializeDurableV1(stagedTasks);
    if (
      state.durableBackend !== null &&
      atomicCapabilityFor(state.durableBackend) === null
    ) {
      const current = await readDurableTaskSnapshot(state.durableBackend, key);
      const ledger = await readDurableLedger(
        state.durableBackend,
        key,
        taskBinding(current.records),
        '__direct_task_commit__',
      );
      const desired = createDesiredTaskRecords(key, stagedTasks);
      const reboundLedger = rebindLedgerRecords(
        key,
        ledger.records,
        desired.records,
      );
      const currentGraph = new Map<string, string>([
        ...current.records,
        ...ledger.records,
      ]);
      const desiredGraph = new Map<string, string>([
        ...desired.records,
        ...reboundLedger,
      ]);
      await applyDirectDurableChanges(
        state.durableBackend,
        durableRecordChanges(currentGraph, desiredGraph),
      );
      state.durableRepresentation = desired.representation;
    } else if (
      state.durableBackend !== null &&
      (state.durableRepresentation === 'scalable' || desiredV1 === null)
    ) {
      const current = await readDurableTaskSnapshot(state.durableBackend, key);
      const desired = createDesiredTaskRecords(key, stagedTasks);
      const changes = durableRecordChanges(current.records, desired.records);
      await applyDirectDurableChanges(state.durableBackend, changes);
      state.durableRepresentation = desired.representation;
    } else {
      await storage.setItem(key, serializeTasks(stagedTasks));
      state.durableRepresentation = 'v1';
    }
    state.committedTasks = cloneTasks(stagedTasks);
  }

  if (
    state.durableBackend !== null &&
    state.runDurableLifecycleOperation === undefined
  ) {
    const backend = state.durableBackend;
    function runDurableLifecycleOperation<T>(
      request: DurableLifecycleRequest,
      work: (transaction: TaskTransaction) => Promise<T>,
    ): Promise<T> {
      return enqueueFacadeMutation(async () => {
        const durableRequest: DurableLifecycleRequest = {
          ...request,
          fingerprint: durableRequestFingerprint(request.fingerprint),
        };
        const capability = atomicCapabilityFor(backend);
        if (capability !== null) {
          // Finish journals written by the earlier atomic protocol before
          // participating in the recoverable published-plan protocol.
          await recoverDurableJournalAtomically(backend, capability, key);
          for (
            let attempt = 0;
            attempt < ATOMIC_MAX_ACQUIRE_ATTEMPTS;
            attempt += 1
          ) {
            await helpPublishedAtomicOperations(backend, capability, key);

            const authority = await readAtomicAuthorityGraph(
              backend,
              key,
              durableRequest.operationId,
            );
            const currentTasks = authority.tasks;
            const ledger = authority.ledger;
            const existing = ledger.matchedEntry;
            if (existing !== null) {
              if (
                existing.kind !== durableRequest.kind ||
                existing.fingerprint !== durableRequest.fingerprint
              ) {
                throw new RepositoryError('OPERATION_ID_CONFLICT');
              }
              await reconcileAuthorityMirrors(
                backend,
                capability,
                key,
                authority,
              );
              state.committedTasks = cloneTasks(currentTasks.tasks);
              state.cacheVersion = authority.rootRaw;
              state.loadPromise = null;
              state.durableRepresentation = currentTasks.representation;
              return parseLedgerResult(
                existing.kind,
                existing.resultJson,
              ) as T;
            }

            const staged = cloneTasks(currentTasks.tasks);
            const surface = createTransactionSurface(staged);
            state.transactionCallbackActive = true;
            let result: Awaited<ReturnType<typeof work>>;
            try {
              result = await work(surface.transaction);
            } finally {
              surface.expire();
              state.transactionCallbackActive = false;
            }
            const resultJson = JSON.stringify(result);
            if (typeof resultJson !== 'string') {
              throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
            }
            parseLedgerResult(durableRequest.kind, resultJson);

            let planCurrentRecords = new Map(authority.records);
            let planParentRoot = authority.rootRaw;
            let initialAuthority:
              | {generationKey: string; rawGeneration: string; rawRoot: string}
              | null = null;
            if (authority.rootRaw === null) {
              const initialGeneration = sha256Hex(
                `start-five.initial-authority.v1:${sortedRecordBytes(
                  authority.records,
                )}`,
              );
              const initialTasks = bindTaskRecordsToGeneration(
                key,
                currentTasks.records,
                initialGeneration,
              );
              const initialLedger = rebindLedgerRecords(
                key,
                ledger.records,
                initialTasks,
              );
              planCurrentRecords = new Map<string, string>([
                ...initialTasks,
                ...initialLedger,
              ]);
              initialAuthority = createAtomicAuthorityGeneration(
                key,
                initialGeneration,
                null,
                planCurrentRecords,
              );
              planParentRoot = initialAuthority.rawRoot;
            }

            const unboundDesiredTasks = createDesiredTaskRecords(key, staged);
            const generation = sha256Hex(
              JSON.stringify([
                planParentRoot,
                durableRequest.operationId,
                durableRequest.kind,
                durableRequest.fingerprint,
                resultJson,
                sortedRecordBytes(unboundDesiredTasks.records),
              ]),
            );
            const desiredTasks: DurableTaskSnapshot = {
              tasks: cloneTasks(staged),
              records: bindTaskRecordsToGeneration(
                key,
                unboundDesiredTasks.records,
                generation,
              ),
              representation: unboundDesiredTasks.representation,
            };
            const ledgerPlan = createLedgerAppendPlan(
              key,
              ledger,
              {
                operationId: durableRequest.operationId,
                kind: durableRequest.kind,
                fingerprint: durableRequest.fingerprint,
                resultJson,
              },
              taskBinding(desiredTasks.records),
            );
            const desiredCoreRecords = new Map<string, string>([
              ...desiredTasks.records,
              ...ledger.records,
              ...ledgerPlan.desired,
            ]);
            const authorityCommit = createAtomicAuthorityGeneration(
              key,
              generation,
              planParentRoot,
              desiredCoreRecords,
            );
            const currentRecords = new Map(planCurrentRecords);
            const desiredRecords = new Map(desiredCoreRecords);
            const rootKey = durableAuthorityRootKey(key);
            if (authority.rootRaw !== null) {
              currentRecords.set(rootKey, authority.rootRaw);
            }
            desiredRecords.set(rootKey, authorityCommit.rawRoot);
            desiredRecords.set(
              authorityCommit.generationKey,
              authorityCommit.rawGeneration,
            );
            if (initialAuthority !== null) {
              desiredRecords.set(
                initialAuthority.generationKey,
                initialAuthority.rawGeneration,
              );
            }
            const versionKey = durableCacheVersionKey(key);
            const currentVersion = await durableGet(backend, versionKey);
            if (currentVersion !== null) {
              currentRecords.set(versionKey, currentVersion);
            }
            desiredRecords.set(versionKey, authorityCommit.rawRoot);
            const changes = durableRecordChanges(
              currentRecords,
              desiredRecords,
            );
            const publishedPlan = createDurableJournal(
              durableRequest,
              resultJson,
              changes,
            ).raw;
            const lockKey = durableAtomicLockKey(key);
            const published = await compareExchange(
              capability,
              lockKey,
              null,
              publishedPlan,
            );
            if (published) {
              const observedOwner = await durableGet(backend, lockKey);
              if (observedOwner === publishedPlan) {
                await completePublishedAtomicOperation(
                  backend,
                  capability,
                  key,
                  publishedPlan,
                );
              }
            }

            // A competing plan may have won, or a delayed acknowledgement may
            // have returned after a helper already advanced the store.  Help
            // the physical owner, then decide solely from durable ledger bytes.
            await helpPublishedAtomicOperations(backend, capability, key);
            const completedAuthority = await readAtomicAuthorityGraph(
              backend,
              key,
              durableRequest.operationId,
            );
            const completedTasks = completedAuthority.tasks;
            const completedLedger = completedAuthority.ledger;
            const completed = completedLedger.matchedEntry;
            if (completed !== null) {
              if (
                completed.kind !== durableRequest.kind ||
                completed.fingerprint !== durableRequest.fingerprint
              ) {
                throw new RepositoryError('OPERATION_ID_CONFLICT');
              }
              await reconcileAuthorityMirrors(
                backend,
                capability,
                key,
                completedAuthority,
              );
              state.committedTasks = cloneTasks(completedTasks.tasks);
              state.cacheVersion = completedAuthority.rootRaw;
              state.loadPromise = null;
              state.durableRepresentation = completedTasks.representation;
              return parseLedgerResult(
                completed.kind,
                completed.resultJson,
              ) as T;
            }
            await Promise.resolve();
          }
          throw new RepositoryError('TASK_ATOMIC_COORDINATION_BUSY');
        }

        await recoverDurableJournal(backend, key);
        {
          const currentTasks = await readDurableTaskSnapshot(backend, key);
          const ledger = await readDurableLedger(
            backend,
            key,
            taskBinding(currentTasks.records),
            durableRequest.operationId,
          );
          const existing = ledger.matchedEntry;
          if (existing !== null) {
            if (
              existing.kind !== durableRequest.kind ||
              existing.fingerprint !== durableRequest.fingerprint
            ) {
              throw new RepositoryError('OPERATION_ID_CONFLICT');
            }
            return parseLedgerResult(existing.kind, existing.resultJson) as T;
          }

          const staged = cloneTasks(currentTasks.tasks);
          const surface = createTransactionSurface(staged);
          state.transactionCallbackActive = true;
          let result: Awaited<ReturnType<typeof work>>;
          try {
            result = await work(surface.transaction);
          } finally {
            surface.expire();
            state.transactionCallbackActive = false;
          }
          const resultJson = JSON.stringify(result);
          if (typeof resultJson !== 'string') {
            throw new RepositoryError('TASK_OPERATION_LEDGER_INVALID');
          }
          parseLedgerResult(durableRequest.kind, resultJson);

          const desiredTasks = createDesiredTaskRecords(key, staged);
          const ledgerPlan = createLedgerAppendPlan(
            key,
            ledger,
            {
              operationId: durableRequest.operationId,
              kind: durableRequest.kind,
              fingerprint: durableRequest.fingerprint,
              resultJson,
            },
            taskBinding(desiredTasks.records),
          );
          const currentRecords = new Map<string, string>([
            ...currentTasks.records,
            ...ledgerPlan.current,
          ]);
          const desiredRecords = new Map<string, string>([
            ...desiredTasks.records,
            ...ledgerPlan.desired,
          ]);
          const changes = durableRecordChanges(currentRecords, desiredRecords);
          await commitDurableOperation(
            backend,
            key,
            durableRequest,
            resultJson,
            changes,
          );
          state.committedTasks = cloneTasks(staged);
          state.loadPromise = null;
          state.durableRepresentation = desiredTasks.representation;
          return result;
        }
      });
    }
    state.runDurableLifecycleOperation = runDurableLifecycleOperation;
  }

  const repository: RefreshableTaskRepository = {
    create(task) {
      return enqueueFacadeMutation(async () => {
        const staged = cloneTasks(await getCommittedTasks());
        const created = createIn(staged, task);
        await commit(staged);
        return created;
      });
    },

    async getById(id, options) {
      return getByIdIn(await getCommittedTasks(), id, options);
    },

    async list(options) {
      return listIn(await getCommittedTasks(), options);
    },

    reload() {
      return enqueueFacadeMutation(reloadCommittedTasks);
    },

    update(id, patch) {
      return enqueueFacadeMutation(async () => {
        const staged = cloneTasks(await getCommittedTasks());
        const updated = updateIn(staged, id, patch);
        await commit(staged);
        return updated;
      });
    },

    softDelete(id, deletedAt) {
      return enqueueFacadeMutation(async () => {
        const staged = cloneTasks(await getCommittedTasks());
        const result = softDeleteIn(staged, id, deletedAt);
        if (result.changed) {
          await commit(staged);
        }
        return result.task;
      });
    },

    transaction(work) {
      return enqueueFacadeMutation(async () => {
        const staged = cloneTasks(await getCommittedTasks());
        const surface = createTransactionSurface(staged);
        state.transactionCallbackActive = true;
        let result: Awaited<ReturnType<typeof work>>;
        try {
          result = await work(surface.transaction);
        } finally {
          surface.expire();
          state.transactionCallbackActive = false;
        }
        await commit(staged);
        return result;
      });
    },
  };
  repositoryCoordinationIdentities.set(repository, state);
  return repository;
}
