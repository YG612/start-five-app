import type {AsyncKeyValueBackend} from './persistentTaskStorage';
import {
  canonicalDayClosureTimestamp,
  type DayClosureRecord,
  type DayClosureState,
} from '../domain/dayClosure';

const STORAGE_KEY = 'start-five.day-closure.v1';
const STATES = new Set<DayClosureState>([
  'pending',
  'starting',
  'consumed',
  'resolved_completed',
  'resolved_deleted',
]);

type JsonRecord = Record<string, unknown>;

function invalid(): never {
  throw new Error('DAY_CLOSURE_STORAGE_CORRUPT');
}

function stringField(record: JsonRecord, field: string): string {
  const value = record[field];
  return typeof value === 'string' && value.trim() !== '' ? value : invalid();
}

function parseRecord(value: unknown): DayClosureRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalid();
  }
  const record = value as JsonRecord;
  const dayKey = stringField(record, 'dayKey');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    return invalid();
  }
  const state = record.state;
  if (typeof state !== 'string' || !STATES.has(state as DayClosureState)) {
    return invalid();
  }
  try {
    return {
      dayKey,
      targetTaskId: stringField(record, 'targetTaskId'),
      state: state as DayClosureState,
      operationId: stringField(record, 'operationId'),
      createdAt: canonicalDayClosureTimestamp(stringField(record, 'createdAt')),
      updatedAt: canonicalDayClosureTimestamp(stringField(record, 'updatedAt')),
    };
  } catch {
    return invalid();
  }
}

export function validateDayClosureBackup(raw: string | null): number {
  if (raw === null) return 0;
  parseRecord(JSON.parse(raw) as unknown);
  return 1;
}

function clone(record: DayClosureRecord | null): DayClosureRecord | null {
  return record === null ? null : parseRecord(record);
}

type Coordinator = {tail: Promise<void>};
const coordinators = new WeakMap<object, Coordinator>();

function coordinatorFor(backend: AsyncKeyValueBackend): Coordinator {
  const key = backend as object;
  const existing = coordinators.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const created = {tail: Promise.resolve()};
  coordinators.set(key, created);
  return created;
}

export type DayClosureRepository = Readonly<{
  read(): Promise<DayClosureRecord | null>;
  update<T>(
    work: (
      current: DayClosureRecord | null,
    ) => Readonly<{next: DayClosureRecord | null; result: T}> | Promise<Readonly<{next: DayClosureRecord | null; result: T}>>,
  ): Promise<T>;
}>;

export function createDayClosureRepository(
  backend: AsyncKeyValueBackend,
): DayClosureRepository {
  const coordinator = coordinatorFor(backend);

  async function load(): Promise<DayClosureRecord | null> {
    let raw: string | null;
    try {
      raw = await backend.getItem(STORAGE_KEY);
    } catch {
      throw new Error('DAY_CLOSURE_STORAGE_READ_FAILED');
    }
    if (raw === null) {
      return null;
    }
    try {
      return parseRecord(JSON.parse(raw) as unknown);
    } catch {
      throw new Error('DAY_CLOSURE_STORAGE_CORRUPT');
    }
  }

  async function save(next: DayClosureRecord | null): Promise<void> {
    try {
      if (next === null) {
        await backend.removeItem(STORAGE_KEY);
      } else {
        await backend.setItem(STORAGE_KEY, JSON.stringify(parseRecord(next)));
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'DAY_CLOSURE_STORAGE_CORRUPT') {
        throw error;
      }
      throw new Error('DAY_CLOSURE_STORAGE_WRITE_FAILED');
    }
  }

  return {
    read() {
      return coordinator.tail.then(load).then(clone);
    },
    update(work) {
      const operation = coordinator.tail.then(async () => {
        const current = await load();
        const update = await work(clone(current));
        const next = clone(update.next);
        if (JSON.stringify(next) !== JSON.stringify(current)) {
          await save(next);
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
