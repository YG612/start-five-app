import type {AsyncKeyValueBackend} from './persistentTaskStorage';
import {
  clampPlacement,
  isQuadrantPlacement,
  type QuadrantPlacement,
  type QuadrantTaskLayoutRecord,
} from '../domain/quadrantTaskLayout';

export const QUADRANT_TASK_LAYOUT_STORAGE_KEY = 'start-five.quadrant-task-layout.v1';

type LayoutEnvelope = Readonly<{
  version: 1;
  records: readonly QuadrantTaskLayoutRecord[];
}>;

export type QuadrantTaskLayoutStore = Readonly<{
  read(taskIds?: ReadonlySet<string>): Promise<Readonly<Record<string, QuadrantPlacement>>>;
  upsert(taskId: string, placement: QuadrantPlacement): Promise<void>;
  remove(taskId: string): Promise<void>;
  removeOrphans(taskIds: ReadonlySet<string>): Promise<void>;
}>;

function parseEnvelope(raw: string | null): LayoutEnvelope {
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
    const byTaskId = new Map<string, QuadrantTaskLayoutRecord>();
    for (const item of candidate.records) {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
      const record = item as Record<string, unknown>;
      if (typeof record.taskId !== 'string' || record.taskId.trim() === '' ||
          !isQuadrantPlacement(record.placement)) continue;
      byTaskId.set(record.taskId, {
        taskId: record.taskId,
        placement: clampPlacement(record.placement),
      });
    }
    return {version: 1, records: [...byTaskId.values()]};
  } catch {
    return {version: 1, records: []};
  }
}

function serialize(records: readonly QuadrantTaskLayoutRecord[]): string {
  return JSON.stringify({version: 1, records} satisfies LayoutEnvelope);
}

export function validateQuadrantTaskLayoutBackup(raw: string | null): number {
  if (raw === null) return 0;
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('QUADRANT_LAYOUT_BACKUP_INVALID');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('QUADRANT_LAYOUT_BACKUP_INVALID');
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1 || !Array.isArray(candidate.records)) {
    throw new Error('QUADRANT_LAYOUT_BACKUP_INVALID');
  }
  return parseEnvelope(raw).records.length;
}

export function createQuadrantTaskLayoutRepository(
  backend: AsyncKeyValueBackend,
): QuadrantTaskLayoutStore {
  async function load(): Promise<LayoutEnvelope> {
    return parseEnvelope(await backend.getItem(QUADRANT_TASK_LAYOUT_STORAGE_KEY));
  }

  async function write(records: readonly QuadrantTaskLayoutRecord[]): Promise<void> {
    await backend.setItem(QUADRANT_TASK_LAYOUT_STORAGE_KEY, serialize(records));
  }

  return {
    async read(taskIds) {
      const envelope = await load();
      return Object.fromEntries(envelope.records
        .filter(record => taskIds === undefined || taskIds.has(record.taskId))
        .map(record => [record.taskId, record.placement]));
    },
    async upsert(taskId, placement) {
      if (taskId.trim() === '') throw new Error('QUADRANT_LAYOUT_TASK_ID_INVALID');
      const envelope = await load();
      const records = envelope.records.filter(record => record.taskId !== taskId);
      records.push({taskId, placement: clampPlacement(placement)});
      await write(records);
    },
    async remove(taskId) {
      const envelope = await load();
      const records = envelope.records.filter(record => record.taskId !== taskId);
      if (records.length !== envelope.records.length) await write(records);
    },
    async removeOrphans(taskIds) {
      const envelope = await load();
      const records = envelope.records.filter(record => taskIds.has(record.taskId));
      if (records.length !== envelope.records.length) await write(records);
    },
  };
}
