import type {CoordinatedBackend} from '../data/coordinatedBackend';
import {FOCUS_SESSION_STORAGE_KEY} from '../data/persistentFocusSessionStorage';
import {TASK_STORAGE_KEY} from '../data/persistentTaskStorage';
import {POST_FOCUS_REVIEW_STORAGE_KEY} from '../data/postFocusReviewRepository';
import type {TaskBackupAdapter} from '../data/taskRepository';
import {validateDayClosureBackup} from '../data/dayClosureRepository';
import {validateFirstActivationBackup} from '../data/firstActivationRepository';
import {validateFocusSessionBackup} from '../data/focusSessionRepository';
import {
  FOCUS_SCHEDULE_STORAGE_KEY,
  validateFocusScheduleBackup,
} from '../data/focusScheduleRepository';
import {validatePostFocusReviewBackup} from '../data/postFocusReviewRepository';
import {validateReminderSchedulingBackup} from '../data/reminderSchedulingRepository';
import {validateTomorrowFirstPreferenceBackup} from './tomorrowFirstNotifications';
import {
  QUADRANT_HOME_PREFERENCES_KEY,
  validateQuadrantHomePreferencesBackup,
} from '../data/quadrantHomePreferences';
import {
  QUADRANT_TASK_LAYOUT_STORAGE_KEY,
  validateQuadrantTaskLayoutBackup,
} from '../data/quadrantTaskLayoutStore';

export type BackupPreview = Readonly<{
  backupDate: string | null;
  applicationVersion: string;
  schemaVersion: number;
  stores: readonly Readonly<{alias: string; recordCount: number}>[];
  totalRecordCount: number;
  notificationCount: number;
  taskCount: number;
  pendingTaskCount: number;
  completedTaskCount: number;
  unsortedTaskCount: number;
  focusRecordCount: number;
  growthRecordCount: number;
  warningCount: number;
}>;
export type BackupArtifact = Readonly<{
  bytes: Uint8Array;
  digestSha256: string;
  preview: BackupPreview;
}>;
export type LocalBackupService = Readonly<{
  exportBackup(): Promise<BackupArtifact>;
  inspectBackup(bytes: Uint8Array): Promise<Omit<BackupArtifact, 'bytes'>>;
  replaceBackup(bytes: Uint8Array): Promise<Readonly<{
    status: 'committed';
    digestSha256: string;
    preview: BackupPreview;
    safetySnapshotRetained: true;
    notificationsReconciled: true;
  }>>;
  restoreBackup(bytes: Uint8Array): Promise<Readonly<{
    status: 'committed' | 'already_restored';
    digestSha256: string;
    preview: BackupPreview;
  }>>;
  recoverPendingRestore(): Promise<Readonly<{
    status: 'none' | 'resumed' | 'committed';
    digestSha256?: string;
  }>>;
  clearAllData(): Promise<void>;
}>;

type Store = Readonly<{alias: string; key: string}>;
const STORES: readonly Store[] = [
  {alias: 'dayClosure', key: 'start-five.day-closure.v1'},
  {alias: 'firstActivation', key: 'start-five.first-activation.v1'},
  {alias: 'focusSessions', key: FOCUS_SESSION_STORAGE_KEY},
  {alias: 'focusSchedules', key: FOCUS_SCHEDULE_STORAGE_KEY},
  {alias: 'postFocusReview', key: POST_FOCUS_REVIEW_STORAGE_KEY},
  {alias: 'quadrantHomePreferences', key: QUADRANT_HOME_PREFERENCES_KEY},
  {alias: 'quadrantTaskLayout', key: QUADRANT_TASK_LAYOUT_STORAGE_KEY},
  {alias: 'reminderScheduling', key: 'start-five/reminder-scheduling/v1'},
  {alias: 'tasks', key: TASK_STORAGE_KEY},
  {alias: 'tomorrowFirstPreference', key: 'start-five/tomorrow-first-reminder/v1'},
] as const;
const JOURNAL_KEY = 'start-five.local-backup.restore-journal.v1';
const SAFETY_SNAPSHOT_KEY = 'start-five.local-backup.safety-snapshot.v1';
const BACKUP_APPLICATION_VERSION = '0.1.0';

type ManifestStore = Readonly<{
  alias: string;
  payloadId: string;
  encoding: 'base64';
  recordCount: number;
}>;
type Reference = Readonly<{
  sourceStore: string;
  sourceId: string;
  relation: string;
  targetStore: string;
  targetId: string;
}>;
type Journal = Readonly<{
  version: 1;
  state: 'prepared' | 'applying' | 'committed';
  digestSha256: string;
  bytesBase64: string;
  nextIndex: number;
  notificationsReconciled: boolean;
}>;

function fail(code: string): never {
  throw Object.assign(new Error(code), {code});
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return fail('LOCAL_BACKUP_VALUE_INVALID');
}

function utf8Encode(value: string): Uint8Array {
  const bytes: number[] = [];
  for (const character of value) {
    const point = character.codePointAt(0);
    if (point === undefined) continue;
    if (point <= 0x7f) bytes.push(point);
    else if (point <= 0x7ff) {
      bytes.push(0xc0 | (point >> 6), 0x80 | (point & 63));
    } else if (point <= 0xffff) {
      bytes.push(
        0xe0 | (point >> 12),
        0x80 | ((point >> 6) & 63),
        0x80 | (point & 63),
      );
    } else {
      bytes.push(
        0xf0 | (point >> 18),
        0x80 | ((point >> 12) & 63),
        0x80 | ((point >> 6) & 63),
        0x80 | (point & 63),
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
  try {
    return decodeURIComponent(encoded);
  } catch {
    return fail('LOCAL_BACKUP_UTF8_INVALID');
  }
}

function base64Encode(bytes: Uint8Array): string {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    const bits = (a << 16) | (b << 8) | c;
    result += alphabet[(bits >> 18) & 63] ?? '';
    result += alphabet[(bits >> 12) & 63] ?? '';
    result += index + 1 < bytes.length
      ? alphabet[(bits >> 6) & 63]
      : '=';
    result += index + 2 < bytes.length ? alphabet[bits & 63] : '=';
  }
  return result;
}

function base64Decode(value: string): Uint8Array {
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) {
    return fail('LOCAL_BACKUP_BASE64_INVALID');
  }
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 4) {
    const block = value.slice(index, index + 4);
    const a = alphabet.indexOf(block[0] ?? '');
    const b = alphabet.indexOf(block[1] ?? '');
    const c = block[2] === '=' ? 0 : alphabet.indexOf(block[2] ?? '');
    const d = block[3] === '=' ? 0 : alphabet.indexOf(block[3] ?? '');
    const bits = (a << 18) | (b << 12) | (c << 6) | d;
    bytes.push((bits >> 16) & 255);
    if (block[2] !== '=') bytes.push((bits >> 8) & 255);
    if (block[3] !== '=') bytes.push(bits & 255);
  }
  return Uint8Array.from(bytes);
}

function rotateRight(value: number, count: number): number {
  return (value >>> count) | (value << (32 - count));
}

const SHA256_K = [
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
] as const;

export function sha256Bytes(input: Uint8Array): string {
  const bytes = Array.from(input);
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bitLength / 0x1_0000_0000);
  const low = bitLength >>> 0;
  for (let shift = 24; shift >= 0; shift -= 8) {
    bytes.push((high >>> shift) & 255);
  }
  for (let shift = 24; shift >= 0; shift -= 8) {
    bytes.push((low >>> shift) & 255);
  }
  const state = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const words = Array<number>(64).fill(0);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const start = offset + index * 4;
      words[index] = ((((bytes[start] ?? 0) << 24) |
        ((bytes[start + 1] ?? 0) << 16) |
        ((bytes[start + 2] ?? 0) << 8) |
        (bytes[start + 3] ?? 0)) >>> 0);
    }
    for (let index = 16; index < 64; index += 1) {
      const a = words[index - 15] ?? 0;
      const b = words[index - 2] ?? 0;
      const sigma0 = rotateRight(a, 7) ^ rotateRight(a, 18) ^ (a >>> 3);
      const sigma1 = rotateRight(b, 17) ^ rotateRight(b, 19) ^ (b >>> 10);
      words[index] = ((words[index - 16] ?? 0) + sigma0 +
        (words[index - 7] ?? 0) + sigma1) >>> 0;
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
      const sigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const first = (h + sigma1 + choice +
        (SHA256_K[index] ?? 0) + (words[index] ?? 0)) >>> 0;
      const sigma0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const second = (sigma0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + first) >>> 0;
      d = c; c = b; b = a; a = (first + second) >>> 0;
    }
    const next = [a, b, c, d, e, f, g, h];
    for (let index = 0; index < 8; index += 1) {
      state[index] = ((state[index] ?? 0) + (next[index] ?? 0)) >>> 0;
    }
  }
  return state.map(word => word.toString(16).padStart(8, '0')).join('');
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return fail('LOCAL_BACKUP_STORE_INVALID');
  }
}

function rawRecordCount(raw: string | null): number {
  if (raw === null) return 0;
  const value = parseJson(raw);
  if (isRecord(value) && Array.isArray(value.tasks)) return value.tasks.length;
  if (isRecord(value) && Array.isArray(value.sessions)) return value.sessions.length;
  if (isRecord(value) && Array.isArray(value.schedules) && Array.isArray(value.events)) {
    return value.schedules.length + value.events.length;
  }
  if (isRecord(value) && Array.isArray(value.receipts)) {
    return value.receipts.length + (value.active === null ? 0 : 1);
  }
  if (isRecord(value) && isRecord(value.records)) {
    return Object.keys(value.records).length;
  }
  return 1;
}

function validateLogicalStore(alias: string, raw: string | null): number {
  try {
    switch (alias) {
      case 'dayClosure':
        return validateDayClosureBackup(raw);
      case 'firstActivation':
        return validateFirstActivationBackup(raw);
      case 'focusSessions':
        return validateFocusSessionBackup(raw);
      case 'focusSchedules':
        return validateFocusScheduleBackup(raw);
      case 'postFocusReview':
        return validatePostFocusReviewBackup(raw);
      case 'quadrantHomePreferences':
        return validateQuadrantHomePreferencesBackup(raw);
      case 'quadrantTaskLayout':
        return validateQuadrantTaskLayoutBackup(raw);
      case 'reminderScheduling':
        return validateReminderSchedulingBackup(raw);
      case 'tomorrowFirstPreference':
        return validateTomorrowFirstPreferenceBackup(raw);
      default:
        return fail('LOCAL_BACKUP_STORE_INVALID');
    }
  } catch {
    return fail('LOCAL_BACKUP_STORE_INVALID');
  }
}

type TaskPreviewMetadata = Readonly<{
  recordCount: number;
  pendingCount?: number;
  completedCount?: number;
  unsortedCount?: number;
  growthRecordCount?: number;
}>;

function previewFor(
  stores: readonly ManifestStore[],
  taskMetadata?: TaskPreviewMetadata,
  metadata: Readonly<{
    backupDate?: string | null;
    applicationVersion?: string;
    schemaVersion?: number;
  }> = {},
): BackupPreview {
  const summaries = stores.map(({alias, recordCount}) => ({alias, recordCount}));
  return {
    backupDate: metadata.backupDate ?? null,
    applicationVersion: metadata.applicationVersion ?? 'legacy',
    schemaVersion: metadata.schemaVersion ?? 1,
    stores: summaries,
    totalRecordCount: summaries.reduce(
      (total, store) => total + store.recordCount,
      0,
    ),
    notificationCount:
      summaries.find(store => store.alias === 'reminderScheduling')
        ?.recordCount ?? 0,
    taskCount: taskMetadata?.recordCount ??
      summaries.find(store => store.alias === 'tasks')?.recordCount ?? 0,
    pendingTaskCount: taskMetadata?.pendingCount ?? 0,
    completedTaskCount: taskMetadata?.completedCount ?? 0,
    unsortedTaskCount: taskMetadata?.unsortedCount ?? 0,
    focusRecordCount:
      summaries.find(store => store.alias === 'focusSessions')?.recordCount ?? 0,
    growthRecordCount: taskMetadata?.growthRecordCount ?? 0,
    warningCount: 0,
  };
}

async function parseWire(
  bytes: Uint8Array,
  tasks: TaskBackupAdapter,
): Promise<Readonly<{
  rawByAlias: Readonly<Record<string, string | null>>;
  preview: BackupPreview;
  digest: string;
}>> {
  let value: unknown;
  try {
    value = JSON.parse(utf8Decode(bytes)) as unknown;
  } catch {
    return fail('LOCAL_BACKUP_JSON_INVALID');
  }
  if (
    !isRecord(value) ||
    (value.schemaVersion !== 1 && value.schemaVersion !== 2 && value.schemaVersion !== 3 && value.schemaVersion !== 4) ||
    !isRecord(value.manifest) ||
    !Array.isArray(value.manifest.stores) ||
    !Array.isArray(value.manifest.references) ||
    !isRecord(value.payloads) ||
    typeof value.contentDigestSha256 !== 'string'
  ) {
    return fail('LOCAL_BACKUP_SCHEMA_INVALID');
  }
  const aliases = new Set<string>();
  const payloadIds = new Set<string>();
  const stores: ManifestStore[] = [];
  for (const candidate of value.manifest.stores) {
    if (
      !isRecord(candidate) ||
      typeof candidate.alias !== 'string' ||
      typeof candidate.payloadId !== 'string' ||
      candidate.encoding !== 'base64' ||
      typeof candidate.recordCount !== 'number' ||
      !Number.isSafeInteger(candidate.recordCount) ||
      candidate.recordCount < 0 ||
      aliases.has(candidate.alias) ||
      payloadIds.has(candidate.payloadId)
    ) {
      return fail('LOCAL_BACKUP_STORES_INVALID');
    }
    aliases.add(candidate.alias);
    payloadIds.add(candidate.payloadId);
    stores.push(candidate as ManifestStore);
  }
  const expectedStores = value.schemaVersion === 1
    ? STORES.filter(store =>
        store.alias !== 'focusSchedules' &&
        store.alias !== 'quadrantHomePreferences' &&
        store.alias !== 'quadrantTaskLayout',
      )
    : value.schemaVersion === 2
      ? STORES.filter(store =>
          store.alias !== 'quadrantHomePreferences' &&
          store.alias !== 'quadrantTaskLayout',
        )
      : value.schemaVersion === 3
        ? STORES.filter(store => store.alias !== 'quadrantTaskLayout')
        : STORES;
  if (
    stores.length !== expectedStores.length ||
    expectedStores.some(store => !aliases.has(store.alias)) ||
    Object.keys(value.payloads).length !== payloadIds.size ||
    Object.keys(value.payloads).some(key => !payloadIds.has(key))
  ) {
    return fail('LOCAL_BACKUP_STORES_INVALID');
  }
  const backupDate = typeof value.createdAt === 'string' &&
    Number.isFinite(Date.parse(value.createdAt))
    ? new Date(value.createdAt).toISOString()
    : null;
  const applicationVersion = typeof value.applicationVersion === 'string'
    ? value.applicationVersion
    : 'legacy';
  const unsigned = {
    schemaVersion: value.schemaVersion,
    ...(backupDate === null ? {} : {createdAt: backupDate}),
    ...(applicationVersion === 'legacy' ? {} : {applicationVersion}),
    manifest: value.manifest,
    payloads: value.payloads,
  };
  if (
    sha256Bytes(utf8Encode(canonicalJson(unsigned))) !==
    value.contentDigestSha256
  ) {
    return fail('LOCAL_BACKUP_DIGEST_INVALID');
  }
  const rawByAlias: Record<string, string | null> = {};
  for (const store of stores) {
    const encoded = value.payloads[store.payloadId];
    if (typeof encoded !== 'string') return fail('LOCAL_BACKUP_PAYLOAD_INVALID');
    const raw = utf8Decode(base64Decode(encoded));
    rawByAlias[store.alias] = raw === '' ? null : raw;
    if (
      store.alias !== 'tasks' &&
      validateLogicalStore(store.alias, rawByAlias[store.alias] ?? null) !==
        store.recordCount
    ) {
      return fail('LOCAL_BACKUP_RECORD_COUNT_INVALID');
    }
  }
  const tasksRaw = rawByAlias.tasks ?? null;
  if (tasksRaw === null) return fail('LOCAL_BACKUP_TASKS_INVALID');
  const taskMetadata = await tasks.inspectOpaquePayload(tasksRaw);
  const taskStore = stores.find(store => store.alias === 'tasks');
  if (
    taskStore === undefined ||
    taskStore.recordCount !== taskMetadata.recordCount
  ) {
    return fail('LOCAL_BACKUP_RECORD_COUNT_INVALID');
  }
  const taskIds = new Set(taskMetadata.taskIds);
  const expectedReferences = taskMetadata.references.map(reference => ({
    sourceStore: 'tasks',
    sourceId: reference.sourceId,
    relation: 'belongs_to',
    targetStore: 'tasks',
    targetId: reference.targetId,
  }));
  const actualReferences: Reference[] = [];
  for (const candidate of value.manifest.references) {
    if (
      !isRecord(candidate) ||
      typeof candidate.sourceStore !== 'string' ||
      typeof candidate.sourceId !== 'string' ||
      typeof candidate.relation !== 'string' ||
      typeof candidate.targetStore !== 'string' ||
      typeof candidate.targetId !== 'string' ||
      !aliases.has(candidate.sourceStore) ||
      !aliases.has(candidate.targetStore) ||
      (candidate.targetStore === 'tasks' && !taskIds.has(candidate.targetId))
    ) {
      return fail('LOCAL_BACKUP_REFERENCE_INVALID');
    }
    actualReferences.push(candidate as Reference);
  }
  const referenceKey = (reference: Reference): string =>
    canonicalJson({
      sourceStore: reference.sourceStore,
      sourceId: reference.sourceId,
      relation: reference.relation,
      targetStore: reference.targetStore,
      targetId: reference.targetId,
    });
  const expectedKeys = expectedReferences.map(referenceKey).sort();
  const actualKeys = actualReferences.map(referenceKey).sort();
  if (
    new Set(actualKeys).size !== actualKeys.length ||
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    return fail('LOCAL_BACKUP_REFERENCE_INVALID');
  }
  return {
    rawByAlias,
    preview: previewFor(stores, taskMetadata, {
      backupDate,
      applicationVersion,
      schemaVersion: value.schemaVersion,
    }),
    digest: sha256Bytes(bytes),
  };
}

export function createLocalBackupService(options: Readonly<{
  backend: CoordinatedBackend;
  tasks: TaskBackupAdapter;
  reloadTasks(): Promise<readonly unknown[]>;
  reconcileNotifications(): Promise<void>;
  now?(): string;
}>): LocalBackupService {
  async function readJournal(): Promise<Journal | null> {
    const raw = await options.backend.raw.getItem(JOURNAL_KEY);
    if (raw === null) return null;
    const value = parseJson(raw);
    if (
      !isRecord(value) ||
      value.version !== 1 ||
      (value.state !== 'prepared' &&
        value.state !== 'applying' &&
        value.state !== 'committed') ||
      typeof value.digestSha256 !== 'string' ||
      typeof value.bytesBase64 !== 'string' ||
      typeof value.nextIndex !== 'number' ||
      !Number.isSafeInteger(value.nextIndex) ||
      typeof value.notificationsReconciled !== 'boolean'
    ) {
      return fail('LOCAL_BACKUP_JOURNAL_INVALID');
    }
    return value as Journal;
  }

  async function writeJournal(value: Journal): Promise<void> {
    await options.backend.raw.setItem(JOURNAL_KEY, JSON.stringify(value));
  }

  async function applyStores(journal: Journal): Promise<Journal> {
    const parsed = await parseWire(
      base64Decode(journal.bytesBase64),
      options.tasks,
    );
    let current = journal;
    for (let index = current.nextIndex; index < STORES.length; index += 1) {
      const store = STORES[index];
      if (store === undefined) break;
      const raw = parsed.rawByAlias[store.alias] ?? null;
      if (store.alias === 'tasks') {
        if (raw === null) return fail('LOCAL_BACKUP_TASKS_INVALID');
        await options.tasks.restoreOpaquePayload(raw);
      } else if (raw === null) {
        await options.backend.raw.removeItem(store.key);
      } else {
        await options.backend.raw.setItem(store.key, raw);
      }
      current = {...current, state: 'applying', nextIndex: index + 1};
      await writeJournal(current);
    }
    return current;
  }

  async function reconcileAndCommit(): Promise<void> {
    const pending = await options.backend.exclusive(readJournal);
    if (pending === null || pending.state === 'committed') return;
    if (!pending.notificationsReconciled) {
      await options.reconcileNotifications();
    }
    await options.backend.exclusive(async () => {
      const current = await readJournal();
      if (current === null || current.state === 'committed') return;
      const reconciled = {...current, notificationsReconciled: true};
      await writeJournal(reconciled);
      await writeJournal({...reconciled, state: 'committed'});
    });
  }

  async function createArtifactUnlocked(): Promise<BackupArtifact> {
    const rawByAlias: Record<string, string | null> = {};
    for (const store of STORES) {
      rawByAlias[store.alias] = store.alias === 'tasks'
        ? await options.tasks.exportOpaquePayload()
        : await options.backend.raw.getItem(store.key);
    }
    const payloads: Record<string, string> = {};
    const stores = STORES.map(store => {
      const payloadId = `store-${store.alias}`;
      const raw = rawByAlias[store.alias] ?? null;
      payloads[payloadId] = base64Encode(utf8Encode(raw ?? ''));
      return {
        alias: store.alias,
        payloadId,
        encoding: 'base64' as const,
        recordCount: store.alias === 'tasks'
          ? 0
          : validateLogicalStore(store.alias, raw),
      };
    });
    const taskStore = stores.find(store => store.alias === 'tasks');
    const taskMetadata = await options.tasks.inspectOpaquePayload(rawByAlias.tasks ?? '');
    if (taskStore !== undefined) taskStore.recordCount = taskMetadata.recordCount;
    const createdAtInput = options.now?.() ?? '1970-01-01T00:00:00.000Z';
    const createdAtMs = Date.parse(createdAtInput);
    if (!Number.isFinite(createdAtMs)) return fail('LOCAL_BACKUP_CLOCK_INVALID');
    const createdAt = new Date(createdAtMs).toISOString();
    const unsigned = {
      schemaVersion: 4,
      createdAt,
      applicationVersion: BACKUP_APPLICATION_VERSION,
      manifest: {
        stores,
        references: taskMetadata.references.map(reference => ({
          sourceStore: 'tasks',
          sourceId: reference.sourceId,
          relation: 'belongs_to',
          targetStore: 'tasks',
          targetId: reference.targetId,
        })),
      },
      payloads,
    };
    const wire = {
      ...unsigned,
      contentDigestSha256: sha256Bytes(utf8Encode(canonicalJson(unsigned))),
    };
    const bytes = utf8Encode(canonicalJson(wire));
    return {
      bytes,
      digestSha256: sha256Bytes(bytes),
      preview: previewFor(stores, taskMetadata, {
        backupDate: createdAt,
        applicationVersion: BACKUP_APPLICATION_VERSION,
        schemaVersion: 4,
      }),
    };
  }

  async function applyParsedStores(
    rawByAlias: Readonly<Record<string, string | null>>,
  ): Promise<void> {
    for (const store of STORES) {
      const raw = rawByAlias[store.alias] ?? null;
      if (store.alias === 'tasks') {
        if (raw === null) return fail('LOCAL_BACKUP_TASKS_INVALID');
        await options.tasks.restoreOpaquePayload(raw);
      } else if (raw === null) {
        await options.backend.raw.removeItem(store.key);
      } else {
        await options.backend.raw.setItem(store.key, raw);
      }
    }
  }

  return {
    exportBackup() {
      return options.backend.exclusive(createArtifactUnlocked);
    },
    async inspectBackup(bytes) {
      const parsed = await parseWire(bytes, options.tasks);
      return {digestSha256: parsed.digest, preview: parsed.preview};
    },
    async replaceBackup(bytes) {
      const prepared = await options.backend.exclusive(async () => {
        const incoming = await parseWire(bytes, options.tasks);
        const safety = await createArtifactUnlocked();
        await options.backend.raw.setItem(
          SAFETY_SNAPSHOT_KEY,
          base64Encode(safety.bytes),
        );
        try {
          await applyParsedStores(incoming.rawByAlias);
        } catch (error: unknown) {
          const original = await parseWire(safety.bytes, options.tasks);
          await applyParsedStores(original.rawByAlias);
          throw error;
        }
        return {incoming, safety};
      });
      try {
        await options.reloadTasks();
        await options.reconcileNotifications();
      } catch (error: unknown) {
        await options.backend.exclusive(async () => {
          const original = await parseWire(prepared.safety.bytes, options.tasks);
          await applyParsedStores(original.rawByAlias);
        });
        await options.reloadTasks();
        await options.reconcileNotifications();
        throw error;
      }
      return {
        status: 'committed' as const,
        digestSha256: prepared.incoming.digest,
        preview: prepared.incoming.preview,
        safetySnapshotRetained: true as const,
        notificationsReconciled: true as const,
      };
    },
    async restoreBackup(bytes) {
      const result = await options.backend.exclusive(async () => {
        const parsed = await parseWire(bytes, options.tasks);
        const existing = await readJournal();
        if (
          existing?.state === 'committed' &&
          existing.digestSha256 === parsed.digest
        ) {
          return {
            status: 'already_restored' as const,
            digestSha256: parsed.digest,
            preview: parsed.preview,
          };
        }
        for (const store of STORES) {
          if (
            store.alias === 'tasks'
              ? await options.tasks.hasDurableData()
              : (await options.backend.raw.getItem(store.key)) !== null
          ) {
            return fail('LOCAL_BACKUP_TARGET_NOT_EMPTY');
          }
        }
        const journal: Journal = {
          version: 1,
          state: 'prepared',
          digestSha256: parsed.digest,
          bytesBase64: base64Encode(bytes),
          nextIndex: 0,
          notificationsReconciled: false,
        };
        await writeJournal(journal);
        await applyStores(journal);
        return {
          status: 'committed' as const,
          digestSha256: parsed.digest,
          preview: parsed.preview,
        };
      });
      if (result.status === 'committed') {
        await options.reloadTasks();
        await reconcileAndCommit();
      }
      return result;
    },
    async recoverPendingRestore() {
      const outcome = await options.backend.exclusive(async () => {
        const journal = await readJournal();
        if (journal === null) return {status: 'none' as const};
        if (journal.state === 'committed') {
          return {
            status: 'committed' as const,
            digestSha256: journal.digestSha256,
          };
        }
        await applyStores(journal);
        return {
          status: 'resumed' as const,
          digestSha256: journal.digestSha256,
        };
      });
      if (outcome.status === 'resumed') {
        await options.reloadTasks();
        await reconcileAndCommit();
      }
      return outcome;
    },
    async clearAllData() {
      await options.backend.exclusive(async () => {
        for (const store of STORES) {
          if (store.alias === 'tasks') {
            await options.tasks.clearOpaqueData();
          } else {
            await options.backend.raw.removeItem(store.key);
          }
        }
        await options.backend.raw.removeItem(JOURNAL_KEY);
        await options.backend.raw.removeItem(SAFETY_SNAPSHOT_KEY);
      });
      await options.reloadTasks();
      await options.reconcileNotifications();
    },
  };
}
