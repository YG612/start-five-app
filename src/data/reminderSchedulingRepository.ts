import type {
  ReminderRepository,
  ReminderStateRecord,
  ReminderTransaction,
} from '../application/reminderScheduling';
import type {AsyncKeyValueBackend} from './persistentTaskStorage';

const STORAGE_KEY = 'start-five/reminder-scheduling/v1';

type StoredEnvelope = Readonly<{
  version: 1;
  records: Readonly<Record<string, ReminderStateRecord>>;
}>;

function cloneRecord(record: ReminderStateRecord): ReminderStateRecord {
  return {
    snapshot: {
      ...record.snapshot,
      intents: record.snapshot.intents.map(intent => ({...intent})),
    },
    binding: {...record.binding},
  };
}

function parseEnvelope(raw: string | null): Record<string, ReminderStateRecord> {
  if (raw === null) {
    return {};
  }
  const parsed = JSON.parse(raw) as Partial<StoredEnvelope>;
  if (parsed.version !== 1 || parsed.records === null || typeof parsed.records !== 'object') {
    throw new Error('REMINDER_REPOSITORY_CORRUPT');
  }
  return Object.fromEntries(
    Object.entries(parsed.records).map(([taskId, record]) => [
      taskId,
      cloneRecord(record),
    ]),
  );
}

export function validateReminderSchedulingBackup(raw: string | null): number {
  return Object.keys(parseEnvelope(raw)).length;
}

export function createReminderSchedulingRepository(
  backend: AsyncKeyValueBackend,
): ReminderRepository {
  let tail: Promise<void> = Promise.resolve();

  async function readRecords(): Promise<Record<string, ReminderStateRecord>> {
    return parseEnvelope(await backend.getItem(STORAGE_KEY));
  }

  return {
    async get(taskId) {
      await tail;
      const record = (await readRecords())[taskId];
      return record === undefined ? null : cloneRecord(record);
    },

    async transaction<T>(
      work: (transaction: ReminderTransaction) => Promise<T>,
    ): Promise<T> {
      let release: (() => void) | undefined;
      const previous = tail;
      tail = new Promise<void>(resolve => {
        release = resolve;
      });
      await previous;
      try {
        const records = await readRecords();
        let changed = false;
        const transaction: ReminderTransaction = {
          async get(taskId) {
            const record = records[taskId];
            return record === undefined ? null : cloneRecord(record);
          },
          async save(record) {
            records[record.snapshot.taskId] = cloneRecord(record);
            changed = true;
          },
          async remove(taskId) {
            if (records[taskId] !== undefined) {
              delete records[taskId];
              changed = true;
            }
          },
        };
        const result = await work(transaction);
        if (changed) {
          const envelope: StoredEnvelope = {version: 1, records};
          await backend.setItem(STORAGE_KEY, JSON.stringify(envelope));
        }
        return result;
      } finally {
        release?.();
      }
    },
  };
}
