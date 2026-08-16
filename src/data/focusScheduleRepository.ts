import {
  FOCUS_SCHEDULE_SCHEMA_VERSION,
  createFocusSchedule,
  createFocusScheduleEvent,
  type FocusSchedule,
  type FocusScheduleEvent,
} from '../domain/focusSchedule';
import type {AsyncKeyValueBackend} from './persistentTaskStorage';

export const FOCUS_SCHEDULE_STORAGE_KEY = 'start-five.focus-schedules.v2';
export const FOCUS_SCHEDULE_SNAPSHOT_SCHEMA = 'start-five.focus-schedules';

export type FocusScheduleRepository = Readonly<{
  listSchedules(): Promise<readonly FocusSchedule[]>;
  getSchedule(id: string): Promise<FocusSchedule | null>;
  listEvents(scheduleId?: string): Promise<readonly FocusScheduleEvent[]>;
  saveSchedule(schedule: FocusSchedule): Promise<FocusSchedule>;
  deleteSchedule(id: string): Promise<boolean>;
  saveEvent(event: FocusScheduleEvent): Promise<FocusScheduleEvent>;
}>;

type Snapshot = {
  schedules: FocusSchedule[];
  events: FocusScheduleEvent[];
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  return actual.length === expected.length && actual.every((field, index) => field === expected[index]);
}

function cloneSchedule(schedule: FocusSchedule): FocusSchedule {
  return {
    ...schedule,
    target: {...schedule.target},
    recurrence: schedule.recurrence.kind === 'WEEKLY'
      ? {...schedule.recurrence, weekdays: [...schedule.recurrence.weekdays]}
      : {...schedule.recurrence},
  };
}

function cloneEvent(event: FocusScheduleEvent): FocusScheduleEvent {
  return {...event};
}

function parseSchedule(value: unknown): FocusSchedule | null {
  if (!record(value) || !exactKeys(value, [
    'id', 'enabled', 'target', 'durationMinutes', 'recurrence',
    'protectionLevel', 'createdAt', 'updatedAt',
  ])) return null;
  try {
    if (typeof value.enabled !== 'boolean' || typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string') {
      return null;
    }
    const created = createFocusSchedule({
      id: value.id as string,
      now: value.updatedAt,
      draft: {
        target: value.target as FocusSchedule['target'],
        durationMinutes: value.durationMinutes as FocusSchedule['durationMinutes'],
        recurrence: value.recurrence as FocusSchedule['recurrence'],
        protectionLevel: value.protectionLevel as FocusSchedule['protectionLevel'],
      },
    });
    if (!Number.isFinite(Date.parse(value.createdAt))) return null;
    return {
      ...created,
      enabled: value.enabled,
      createdAt: new Date(Date.parse(value.createdAt)).toISOString(),
    };
  } catch {
    return null;
  }
}

function parseEvent(value: unknown): FocusScheduleEvent | null {
  if (!record(value)) return null;
  const required = ['id', 'scheduleId', 'localDateKey', 'plannedStartAt', 'type', 'createdAt'];
  const optional = ['resolvedTaskId', 'focusSessionId', 'rescheduledTo'];
  if (required.some(field => !(field in value)) || Object.keys(value).some(field => !required.includes(field) && !optional.includes(field))) {
    return null;
  }
  try {
    return createFocusScheduleEvent({
      id: value.id as string,
      scheduleId: value.scheduleId as string,
      localDateKey: value.localDateKey as string,
      plannedStartAt: value.plannedStartAt as string,
      type: value.type as FocusScheduleEvent['type'],
      now: value.createdAt as string,
      ...(typeof value.resolvedTaskId === 'string' ? {resolvedTaskId: value.resolvedTaskId} : {}),
      ...(typeof value.focusSessionId === 'string' ? {focusSessionId: value.focusSessionId} : {}),
      ...(typeof value.rescheduledTo === 'string' ? {rescheduledTo: value.rescheduledTo} : {}),
    });
  } catch {
    return null;
  }
}

export function parseFocusScheduleSnapshot(raw: string | null): Snapshot {
  if (raw === null) return {schedules: [], events: []};
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('FOCUS_SCHEDULE_SNAPSHOT_CORRUPT');
  }
  if (
    !record(value) ||
    value.schema !== FOCUS_SCHEDULE_SNAPSHOT_SCHEMA ||
    value.version !== FOCUS_SCHEDULE_SCHEMA_VERSION ||
    !Array.isArray(value.schedules) ||
    !Array.isArray(value.events)
  ) {
    throw new Error('FOCUS_SCHEDULE_SNAPSHOT_UNSUPPORTED');
  }
  const scheduleIds = new Set<string>();
  const schedules: FocusSchedule[] = [];
  for (const candidate of value.schedules) {
    const parsed = parseSchedule(candidate);
    if (parsed !== null && !scheduleIds.has(parsed.id)) {
      scheduleIds.add(parsed.id);
      schedules.push(parsed);
    }
  }
  const eventIds = new Set<string>();
  const eventKeys = new Set<string>();
  const events: FocusScheduleEvent[] = [];
  for (const candidate of value.events) {
    const parsed = parseEvent(candidate);
    if (parsed === null || !scheduleIds.has(parsed.scheduleId) || eventIds.has(parsed.id)) continue;
    const key = `${parsed.scheduleId}:${parsed.localDateKey}:${parsed.type}`;
    if (eventKeys.has(key)) continue;
    eventIds.add(parsed.id);
    eventKeys.add(key);
    events.push(parsed);
  }
  return {schedules, events};
}

export function validateFocusScheduleBackup(raw: string | null): number {
  const snapshot = parseFocusScheduleSnapshot(raw);
  return snapshot.schedules.length + snapshot.events.length;
}

function serialize(snapshot: Snapshot): string {
  return JSON.stringify({
    schema: FOCUS_SCHEDULE_SNAPSHOT_SCHEMA,
    version: FOCUS_SCHEDULE_SCHEMA_VERSION,
    schedules: snapshot.schedules,
    events: snapshot.events,
  });
}

export function createFocusScheduleRepository(
  backend: AsyncKeyValueBackend,
): FocusScheduleRepository {
  let tail = Promise.resolve();

  function run<T>(work: (snapshot: Snapshot) => Promise<Readonly<{value: T; changed: boolean}>>): Promise<T> {
    const result = tail.then(async () => {
      const snapshot = parseFocusScheduleSnapshot(await backend.getItem(FOCUS_SCHEDULE_STORAGE_KEY));
      const outcome = await work(snapshot);
      if (outcome.changed) await backend.setItem(FOCUS_SCHEDULE_STORAGE_KEY, serialize(snapshot));
      return outcome.value;
    });
    tail = result.then(() => undefined, () => undefined);
    return result;
  }

  return {
    listSchedules: () => run(async snapshot => ({
      value: snapshot.schedules.map(cloneSchedule), changed: false,
    })),
    getSchedule: scheduleId => run(async snapshot => ({
      value: snapshot.schedules.find(schedule => schedule.id === scheduleId) ?? null,
      changed: false,
    })).then(schedule => schedule === null ? null : cloneSchedule(schedule)),
    listEvents: scheduleId => run(async snapshot => ({
      value: snapshot.events
        .filter(event => scheduleId === undefined || event.scheduleId === scheduleId)
        .map(cloneEvent),
      changed: false,
    })),
    saveSchedule: captured => run(async snapshot => {
      const schedule = parseSchedule(captured);
      if (schedule === null) throw new Error('FOCUS_SCHEDULE_INVALID');
      const index = snapshot.schedules.findIndex(candidate => candidate.id === schedule.id);
      if (index < 0) snapshot.schedules.push(cloneSchedule(schedule));
      else snapshot.schedules[index] = cloneSchedule(schedule);
      return {value: cloneSchedule(schedule), changed: true};
    }),
    deleteSchedule: scheduleId => run(async snapshot => {
      const index = snapshot.schedules.findIndex(schedule => schedule.id === scheduleId);
      if (index < 0) return {value: false, changed: false};
      snapshot.schedules.splice(index, 1);
      return {value: true, changed: true};
    }),
    saveEvent: captured => run(async snapshot => {
      const event = parseEvent(captured);
      if (event === null || !snapshot.schedules.some(schedule => schedule.id === event.scheduleId)) {
        throw new Error('FOCUS_SCHEDULE_EVENT_INVALID');
      }
      const existing = snapshot.events.find(candidate =>
        candidate.scheduleId === event.scheduleId &&
        candidate.localDateKey === event.localDateKey &&
        candidate.type === event.type,
      );
      if (existing !== undefined) return {value: cloneEvent(existing), changed: false};
      snapshot.events.push(cloneEvent(event));
      return {value: cloneEvent(event), changed: true};
    }),
  };
}
