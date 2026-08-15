import {
  createStartFiveApp,
  type StartFiveAppComposition,
} from '../../src/app/startFiveApp';
import type {
  ReminderPermission,
  ReminderReplaceRequest,
  ReminderScheduleSnapshot,
} from '../../src/application/reminderScheduling';
import type {
  TomorrowFirstNotifications,
  TomorrowFirstTap,
} from '../../src/application/tomorrowFirstNotifications';
import type {AsyncKeyValueBackend} from '../../src/data/persistentTaskStorage';
import type {FocusRuntimeClock} from '../../src/app/focusSessionRuntime';

const {createHash} = require('crypto') as {
  createHash(algorithm: 'sha256'): {
    update(value: Uint8Array): {digest(encoding: 'hex'): string};
  };
};

export const LOCAL_BACKUP_UNAVAILABLE = 'LOCAL_BACKUP_UNAVAILABLE' as const;
export const FIXED_NOW = '2026-08-12T08:00:00.000Z';

export type StoreSummary = Readonly<{alias: string; recordCount: number}>;
export type BackupPreview = Readonly<{
  stores: readonly StoreSummary[];
  totalRecordCount: number;
  notificationCount: number;
}>;
export type BackupArtifact = Readonly<{
  bytes: Uint8Array;
  digestSha256: string;
  preview: BackupPreview;
}>;
export type LocalBackupContract = Readonly<{
  exportBackup(): Promise<BackupArtifact>;
  inspectBackup(bytes: Uint8Array): Promise<Omit<BackupArtifact, 'bytes'>>;
  restoreBackup(bytes: Uint8Array): Promise<Readonly<{
    status: 'committed' | 'already_restored';
    digestSha256: string;
    preview: BackupPreview;
  }>>;
  recoverPendingRestore(): Promise<Readonly<{
    status: 'none' | 'resumed' | 'committed';
    digestSha256?: string;
  }>>;
}>;

export type InvalidBackupVectors = Readonly<{
  corrupt: Uint8Array;
  truncated: Uint8Array;
  futureSchema: Uint8Array;
  referenceInvalid: Uint8Array;
}>;

export type PublicBackupReference = Readonly<{
  sourceStore: string;
  sourceId: string;
  relation: string;
  targetStore: string;
  targetId: string;
}>;

export type PublicBackupWire = Readonly<{
  schemaVersion: number;
  manifest: Readonly<{
    stores: readonly Readonly<{
      alias: string;
      payloadId: string;
      encoding: 'base64';
      recordCount: number;
    }>[];
    references: readonly PublicBackupReference[];
  }>;
  payloads: Readonly<Record<string, string>>;
  contentDigestSha256: string;
}>;

export class PauseableDomainWriterGate {
  private armed:
    | Readonly<{reached(): void; release: Promise<void>}>
    | undefined;

  armNextSet(): Readonly<{reached: Promise<void>; release(): void}> {
    let reached!: () => void;
    let release!: () => void;
    const reachedPromise = new Promise<void>(resolve => {
      reached = resolve;
    });
    const releasePromise = new Promise<void>(resolve => {
      release = resolve;
    });
    this.armed = {reached, release: releasePromise};
    return {reached: reachedPromise, release};
  }

  async beforeSet(): Promise<void> {
    const current = this.armed;
    if (current === undefined) {
      return;
    }
    this.armed = undefined;
    current.reached();
    await current.release;
  }
}

export class MutableAsyncKV implements AsyncKeyValueBackend {
  private readonly values: Map<string, string>;
  private futureSetOrdinal: number | undefined;
  private futureSetCount = 0;
  readonly writerGate = new PauseableDomainWriterGate();

  constructor(initialValues: ReadonlyArray<readonly [string, string]> = []) {
    this.values = new Map(initialValues);
  }

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    await this.writerGate.beforeSet();
    this.futureSetCount += 1;
    this.values.set(key, value);
    if (this.futureSetOrdinal === this.futureSetCount) {
      throw Object.assign(new Error('injected async KV set failure'), {
        code: 'INJECTED_KV_SET_FAILURE',
      });
    }
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }

  failOnNthFutureSet(n: number): void {
    if (!Number.isSafeInteger(n) || n < 1) {
      throw new RangeError('n must be a positive integer');
    }
    this.futureSetCount = 0;
    this.futureSetOrdinal = n;
  }

  clearFailure(): void {
    this.futureSetCount = 0;
    this.futureSetOrdinal = undefined;
  }

  byteRestart(): MutableAsyncKV {
    return new MutableAsyncKV(Array.from(this.values.entries()));
  }

  stableByteSnapshot(): Uint8Array {
    const entries = Array.from(this.values.entries()).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    return asciiBytes(JSON.stringify(entries));
  }
}

export type ScheduledReminder = Readonly<{
  logicalId: string;
  payload: unknown;
}>;

export class MutableReminderScheduler implements TomorrowFirstNotifications {
  private active: ScheduledReminder[];
  private getCallCount = 0;
  private replaceCallCount = 0;

  constructor(initial: readonly ScheduledReminder[] = []) {
    this.active = initial.map(item => ({...item}));
  }

  async getPermission(): Promise<ReminderPermission> {
    return 'granted';
  }

  async requestPermission(): Promise<ReminderPermission> {
    return 'granted';
  }

  async getInitialTap(): Promise<TomorrowFirstTap | null> {
    return null;
  }

  subscribeTap(_listener: (tap: TomorrowFirstTap) => void): () => void {
    return () => undefined;
  }

  async get(_taskId: string): Promise<ReminderScheduleSnapshot | null> {
    this.getCallCount += 1;
    return null;
  }

  async replace(request: ReminderReplaceRequest): Promise<void> {
    this.replaceCallCount += 1;
    this.active = [{
      logicalId: `replacement-${this.replaceCallCount}`,
      payload: request,
    }];
  }

  snapshot(): Readonly<{
    getCalls: number;
    replaceCalls: number;
    logicalIds: readonly string[];
  }> {
    return {
      getCalls: this.getCallCount,
      replaceCalls: this.replaceCallCount,
      logicalIds: this.active.map(({logicalId}) => logicalId),
    };
  }
}

class FixedFocusRuntimeClock implements FocusRuntimeClock {
  nowMs = (): number => Date.parse(FIXED_NOW);

  subscribe(_listener: () => void): () => void {
    return () => undefined;
  }
}

class SequenceIds {
  private ordinal = 0;

  constructor(private readonly prefix: string) {}

  next = (): string => {
    this.ordinal += 1;
    return `${this.prefix}-${this.ordinal}`;
  };
}

export type LocalBackupHarness = Readonly<{
  backend: MutableAsyncKV;
  scheduler: MutableReminderScheduler;
  composition: StartFiveAppComposition;
}>;

export function makeLocalBackupHarness(options: Readonly<{
  idPrefix: string;
  backend?: MutableAsyncKV;
  scheduler?: MutableReminderScheduler;
}>): LocalBackupHarness {
  const backend = options.backend ?? new MutableAsyncKV();
  const scheduler = options.scheduler ?? new MutableReminderScheduler();
  const ids = new SequenceIds(options.idPrefix);
  const composition = createStartFiveApp({
    storageBackend: backend,
    now: () => FIXED_NOW,
    idGenerator: ids.next,
    focusRuntimeClock: new FixedFocusRuntimeClock(),
    tomorrowFirstNotifications: scheduler,
    public: {firstActivation: {enabled: true}},
  });
  return {backend, scheduler, composition};
}

export function requireLocalBackup(
  composition: StartFiveAppComposition,
): LocalBackupContract {
  const proposed = composition as StartFiveAppComposition & Readonly<{
    localBackup?: LocalBackupContract;
  }>;
  if (proposed.localBackup === undefined) {
    throw Object.assign(new Error('composition.localBackup is unavailable'), {
      code: LOCAL_BACKUP_UNAVAILABLE,
    });
  }
  return proposed.localBackup;
}

export async function seedPublicTask(
  harness: LocalBackupHarness,
  title: string,
  operationId: string,
): Promise<void> {
  const task = await harness.composition.service.createTask(
    {title, important: true, urgent: true},
    {operationId: `${operationId}:create`},
  );
  await harness.composition.service.addFirstStep(
    task.id,
    {title: `第一步：${title}`},
    {operationId: `${operationId}:step`},
  );
}

export function makeInvalidBackupVectors(
  valid: Uint8Array,
): InvalidBackupVectors {
  const decoded = decodePublicBackupWire(valid);
  if (decoded.schemaVersion !== 1) {
    throw new Error('source backup must use public schemaVersion 1');
  }
  const futureSchema = encodePublicBackupWire({
    ...decoded,
    schemaVersion: 2,
  });
  const taskReferenceIndex = decoded.manifest.references.findIndex(
    reference => reference.targetStore === 'tasks',
  );
  if (taskReferenceIndex < 0) {
    throw new Error('seeded backup must publish at least one task reference');
  }
  const referenceInvalid = encodePublicBackupWire({
    ...decoded,
    manifest: {
      ...decoded.manifest,
      references: decoded.manifest.references.map((reference, index) =>
        index === taskReferenceIndex
          ? {
              ...reference,
              targetId: '__gap_p0_12_missing_task__',
            }
          : reference,
      ),
    },
  });
  const corrupt = valid.slice();
  if (corrupt.length > 0) {
    const index = Math.floor(corrupt.length / 2);
    corrupt[index] = (corrupt[index] ?? 0) ^ 0x5a;
  }
  return {
    corrupt,
    truncated: valid.slice(0, Math.max(0, valid.length - 1)),
    futureSchema,
    referenceInvalid,
  };
}

export function encodePublicBackupWire(
  wire: Omit<PublicBackupWire, 'contentDigestSha256'> |
    PublicBackupWire,
): Uint8Array {
  const unsigned = {
    schemaVersion: wire.schemaVersion,
    manifest: wire.manifest,
    payloads: wire.payloads,
  };
  const contentDigestSha256 = sha256Hex(
    utf8Encode(canonicalJson(unsigned)),
  );
  return utf8Encode(canonicalJson({...unsigned, contentDigestSha256}));
}

export function decodePublicBackupWire(bytes: Uint8Array): PublicBackupWire {
  const parsed = JSON.parse(utf8Decode(bytes)) as Partial<PublicBackupWire>;
  if (
    typeof parsed.schemaVersion !== 'number' ||
    typeof parsed.contentDigestSha256 !== 'string' ||
    parsed.manifest === undefined ||
    !Array.isArray(parsed.manifest.stores) ||
    !Array.isArray(parsed.manifest.references) ||
    parsed.payloads === undefined ||
    parsed.payloads === null ||
    typeof parsed.payloads !== 'object'
  ) {
    throw new Error('backup does not conform to the public wire schema');
  }
  return parsed as PublicBackupWire;
}

export function expectValidSevenStorePreview(preview: BackupPreview): void {
  expect(preview.stores).toHaveLength(7);
  expect(new Set(preview.stores.map(store => store.alias)).size).toBe(7);
  expect(preview.totalRecordCount).toBe(
    preview.stores.reduce((sum, store) => sum + store.recordCount, 0),
  );
  expect(preview.notificationCount).toBeGreaterThanOrEqual(0);
}

export function sha256Hex(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function expectSameBytes(
  actual: Uint8Array,
  expected: Uint8Array,
): void {
  expect(Array.from(actual)).toEqual(Array.from(expected));
}

export function expectDifferentBytes(
  actual: Uint8Array,
  expected: Uint8Array,
): void {
  expect(Array.from(actual)).not.toEqual(Array.from(expected));
}

export function expectUniqueLogicalIds(
  scheduler: MutableReminderScheduler,
): void {
  const logicalIds = scheduler.snapshot().logicalIds;
  expect(new Set(logicalIds).size).toBe(logicalIds.length);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('non-finite numbers are not valid backup values');
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0,
      );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  throw new Error('unsupported backup value');
}

function asciiBytes(value: string): Uint8Array {
  return Uint8Array.from(
    Array.from(value, character => character.charCodeAt(0)),
  );
}

function utf8Encode(value: string): Uint8Array {
  const bytes: number[] = [];
  for (const character of value) {
    const point = character.codePointAt(0);
    if (point === undefined) {
      continue;
    }
    if (point <= 0x7f) {
      bytes.push(point);
    } else if (point <= 0x7ff) {
      bytes.push(0xc0 | (point >> 6), 0x80 | (point & 0x3f));
    } else if (point <= 0xffff) {
      bytes.push(
        0xe0 | (point >> 12),
        0x80 | ((point >> 6) & 0x3f),
        0x80 | (point & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (point >> 18),
        0x80 | ((point >> 12) & 0x3f),
        0x80 | ((point >> 6) & 0x3f),
        0x80 | (point & 0x3f),
      );
    }
  }
  return Uint8Array.from(bytes);
}

function utf8Decode(bytes: Uint8Array): string {
  let encoded = '';
  for (const byte of bytes) {
    encoded += `%${byte.toString(16).padStart(2, '0')}`;
  }
  return decodeURIComponent(encoded);
}
