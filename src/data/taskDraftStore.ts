import type {AsyncKeyValueBackend} from './persistentTaskStorage';

export const TASK_DRAFT_STORAGE_KEY = 'start-five.task-drafts.v1';
export const TASK_DRAFT_TTL_MS = 30 * 86_400_000;

export type StoredTaskDraft = Readonly<{
  id: string;
  taskId: string | null;
  payload: string;
  updatedAt: string;
  expiresAt: string;
}>;

type DraftEnvelope = Readonly<{
  version: 1;
  records: readonly StoredTaskDraft[];
}>;

export type TaskDraftStore = Readonly<{
  latest(now: string): Promise<StoredTaskDraft | null>;
  upsert(record: StoredTaskDraft): Promise<void>;
  remove(id: string): Promise<void>;
  clearExpired(now: string): Promise<void>;
}>;

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function parseEnvelope(raw: string | null): DraftEnvelope {
  if (raw === null) return {version: 1, records: []};
  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return {version: 1, records: []};
    }
    const candidate = value as Record<string, unknown>;
    if (candidate.version !== 1 || !Array.isArray(candidate.records)) {
      return {version: 1, records: []};
    }
    const records = new Map<string, StoredTaskDraft>();
    for (const item of candidate.records) {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
      const record = item as Record<string, unknown>;
      if (
        typeof record.id !== 'string' || record.id.trim() === '' ||
        !(record.taskId === null || typeof record.taskId === 'string') ||
        typeof record.payload !== 'string' ||
        !validTimestamp(record.updatedAt) ||
        !validTimestamp(record.expiresAt)
      ) continue;
      records.set(record.id, {
        id: record.id,
        taskId: record.taskId,
        payload: record.payload,
        updatedAt: record.updatedAt,
        expiresAt: record.expiresAt,
      });
    }
    return {version: 1, records: [...records.values()]};
  } catch {
    return {version: 1, records: []};
  }
}

function serialize(records: readonly StoredTaskDraft[]): string {
  return JSON.stringify({version: 1, records} satisfies DraftEnvelope);
}

export function createTaskDraftStore(backend: AsyncKeyValueBackend): TaskDraftStore {
  const load = async () => parseEnvelope(await backend.getItem(TASK_DRAFT_STORAGE_KEY));
  const write = (records: readonly StoredTaskDraft[]) =>
    backend.setItem(TASK_DRAFT_STORAGE_KEY, serialize(records));

  return {
    async latest(now) {
      const nowMs = Date.parse(now);
      if (!Number.isFinite(nowMs)) return null;
      const records = (await load()).records
        .filter(record => Date.parse(record.expiresAt) > nowMs)
        .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
      return records[0] ?? null;
    },
    async upsert(record) {
      if (record.id.trim() === '' || !validTimestamp(record.updatedAt) || !validTimestamp(record.expiresAt)) {
        throw new Error('TASK_DRAFT_INVALID');
      }
      const envelope = await load();
      await write([
        ...envelope.records.filter(candidate => candidate.id !== record.id),
        record,
      ]);
    },
    async remove(id) {
      const envelope = await load();
      const records = envelope.records.filter(record => record.id !== id);
      if (records.length !== envelope.records.length) await write(records);
    },
    async clearExpired(now) {
      const nowMs = Date.parse(now);
      if (!Number.isFinite(nowMs)) return;
      const envelope = await load();
      const records = envelope.records.filter(record => Date.parse(record.expiresAt) > nowMs);
      if (records.length !== envelope.records.length) await write(records);
    },
  };
}
