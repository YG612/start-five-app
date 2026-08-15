import type {AsyncKeyValueBackend} from './persistentTaskStorage';
import type {FirstActivationRecord, FirstActivationState} from '../domain/firstActivation';

const FIRST_ACTIVATION_STORAGE_KEY = 'start-five.first-activation.v1';
const STATES = new Set<FirstActivationState>(['creating', 'created', 'completed', 'skipped']);

function parse(raw: string): FirstActivationRecord {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('FIRST_ACTIVATION_STORAGE_CORRUPT');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('FIRST_ACTIVATION_STORAGE_CORRUPT');
  }
  const record = value as Record<string, unknown>;
  if (
    record.version !== 1 ||
    typeof record.state !== 'string' ||
    !STATES.has(record.state as FirstActivationState) ||
    !(record.title === null || typeof record.title === 'string') ||
    !(record.taskId === null || typeof record.taskId === 'string') ||
    !(record.createOperationId === null || typeof record.createOperationId === 'string') ||
    !(record.startOperationId === null || typeof record.startOperationId === 'string')
  ) {
    throw new Error('FIRST_ACTIVATION_STORAGE_CORRUPT');
  }
  const parsed: FirstActivationRecord = {
    version: 1,
    state: record.state as FirstActivationState,
    title: record.title as string | null,
    taskId: record.taskId as string | null,
    createOperationId: record.createOperationId as string | null,
    startOperationId: record.startOperationId as string | null,
  };
  const nonEmpty = (value: string | null): boolean =>
    value !== null && value.trim() !== '';
  const valid = parsed.state === 'skipped'
    ? parsed.title === null &&
      parsed.taskId === null &&
      parsed.createOperationId === null &&
      parsed.startOperationId === null
    : nonEmpty(parsed.title) &&
      nonEmpty(parsed.createOperationId) &&
      nonEmpty(parsed.startOperationId) &&
      (parsed.state === 'creating'
        ? parsed.taskId === null
        : nonEmpty(parsed.taskId));
  if (!valid) {
    throw new Error('FIRST_ACTIVATION_STORAGE_CORRUPT');
  }
  return parsed;
}

export function validateFirstActivationBackup(raw: string | null): number {
  if (raw === null) return 0;
  parse(raw);
  return 1;
}

export type FirstActivationRepository = Readonly<{
  read(): Promise<FirstActivationRecord | null>;
  write(record: FirstActivationRecord): Promise<void>;
}>;

export function createFirstActivationRepository(
  backend: AsyncKeyValueBackend,
): FirstActivationRepository {
  let tail = Promise.resolve();
  return {
    async read() {
      await tail;
      let raw: string | null;
      try {
        raw = await backend.getItem(FIRST_ACTIVATION_STORAGE_KEY);
      } catch {
        throw new Error('FIRST_ACTIVATION_STORAGE_READ_FAILED');
      }
      return raw === null ? null : parse(raw);
    },
    write(record) {
      const next = tail.then(() =>
        backend.setItem(FIRST_ACTIVATION_STORAGE_KEY, JSON.stringify(record)),
      );
      tail = next.then(() => undefined, () => undefined);
      return next;
    },
  };
}
