import type {Quadrant} from './quadrant';

export const FOCUS_SCHEDULE_SCHEMA_VERSION = 2 as const;

export type FocusScheduleTarget =
  | Readonly<{kind: 'TASK'; taskId: string}>
  | Readonly<{kind: 'QUADRANT'; quadrant: Quadrant}>
  | Readonly<{kind: 'AUTO'}>;

export type FocusScheduleRecurrence =
  | Readonly<{kind: 'ONCE'; startsAt: string}>
  | Readonly<{kind: 'DAILY'; localTime: string; timezone: string}>
  | Readonly<{
      kind: 'WEEKLY';
      weekdays: readonly number[];
      localTime: string;
      timezone: string;
    }>;

export type FocusProtectionLevel = 'REMINDER_ONLY' | 'REDUCE_DISTRACTIONS';

export type FocusSchedule = Readonly<{
  id: string;
  enabled: boolean;
  target: FocusScheduleTarget;
  durationMinutes: 2 | 5 | 15 | 25 | 50;
  recurrence: FocusScheduleRecurrence;
  protectionLevel: FocusProtectionLevel;
  createdAt: string;
  updatedAt: string;
}>;

export type FocusScheduleEventType =
  | 'STARTED'
  | 'SKIPPED'
  | 'RESCHEDULED'
  | 'MISSED'
  | 'COMPLETED';

export type FocusScheduleEvent = Readonly<{
  id: string;
  scheduleId: string;
  localDateKey: string;
  plannedStartAt: string;
  type: FocusScheduleEventType;
  resolvedTaskId?: string;
  focusSessionId?: string;
  createdAt: string;
  rescheduledTo?: string;
}>;

export type FocusScheduleDraft = Readonly<{
  target: FocusScheduleTarget;
  durationMinutes: 2 | 5 | 15 | 25 | 50;
  recurrence: FocusScheduleRecurrence;
  protectionLevel: FocusProtectionLevel;
}>;

export type FocusScheduleOccurrence = Readonly<{
  schedule: FocusSchedule;
  localDateKey: string;
  plannedStartAt: string;
  event: FocusScheduleEvent | null;
}>;

export type FocusLocalTriggerResolver = (input: Readonly<{
  localDateKey: string;
  localTime: string;
  timeZone: string;
}>) => string;

const DURATIONS = new Set([2, 5, 15, 25, 50]);
const WALL_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

function fail(code: string): never {
  throw Object.assign(new Error(code), {code});
}

function id(value: unknown, code: string): string {
  if (typeof value !== 'string' || CONTROL.test(value) || value.trim() === '') {
    return fail(code);
  }
  return value.trim();
}

function timestamp(value: unknown, code: string): string {
  if (typeof value !== 'string') return fail(code);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return fail(code);
  const canonical = new Date(milliseconds).toISOString();
  if (canonical !== value) return fail(code);
  return canonical;
}

function timeZone(value: unknown): string {
  const normalized = id(value, 'FOCUS_SCHEDULE_TIMEZONE_INVALID');
  try {
    new Intl.DateTimeFormat('en-US', {timeZone: normalized}).format(new Date(0));
  } catch {
    return fail('FOCUS_SCHEDULE_TIMEZONE_INVALID');
  }
  return normalized;
}

export function normalizeFocusScheduleTarget(value: FocusScheduleTarget): FocusScheduleTarget {
  if (value.kind === 'AUTO') return {kind: 'AUTO'};
  if (value.kind === 'TASK') {
    return {kind: 'TASK', taskId: id(value.taskId, 'FOCUS_SCHEDULE_TASK_INVALID')};
  }
  if (value.kind === 'QUADRANT' && ['Q1', 'Q2', 'Q3', 'Q4'].includes(value.quadrant)) {
    return {kind: 'QUADRANT', quadrant: value.quadrant};
  }
  return fail('FOCUS_SCHEDULE_TARGET_INVALID');
}

export function normalizeFocusScheduleRecurrence(
  value: FocusScheduleRecurrence,
): FocusScheduleRecurrence {
  if (value.kind === 'ONCE') {
    return {kind: 'ONCE', startsAt: timestamp(value.startsAt, 'FOCUS_SCHEDULE_START_INVALID')};
  }
  if (!WALL_TIME.test(value.localTime)) return fail('FOCUS_SCHEDULE_TIME_INVALID');
  const normalizedZone = timeZone(value.timezone);
  if (value.kind === 'DAILY') {
    return {kind: 'DAILY', localTime: value.localTime, timezone: normalizedZone};
  }
  if (value.kind !== 'WEEKLY' || !Array.isArray(value.weekdays)) {
    return fail('FOCUS_SCHEDULE_RECURRENCE_INVALID');
  }
  const weekdays = [...new Set(value.weekdays)].sort((left, right) => left - right);
  if (
    weekdays.length === 0 ||
    weekdays.some(day => !Number.isSafeInteger(day) || day < 0 || day > 6)
  ) {
    return fail('FOCUS_SCHEDULE_WEEKDAYS_INVALID');
  }
  return {
    kind: 'WEEKLY',
    weekdays,
    localTime: value.localTime,
    timezone: normalizedZone,
  };
}

export function createFocusSchedule(input: Readonly<{
  id: string;
  draft: FocusScheduleDraft;
  now: string;
}>): FocusSchedule {
  const now = timestamp(input.now, 'FOCUS_SCHEDULE_CLOCK_INVALID');
  if (!DURATIONS.has(input.draft.durationMinutes)) {
    return fail('FOCUS_SCHEDULE_DURATION_INVALID');
  }
  if (!['REMINDER_ONLY', 'REDUCE_DISTRACTIONS'].includes(input.draft.protectionLevel)) {
    return fail('FOCUS_SCHEDULE_PROTECTION_INVALID');
  }
  return {
    id: id(input.id, 'FOCUS_SCHEDULE_ID_INVALID'),
    enabled: true,
    target: normalizeFocusScheduleTarget(input.draft.target),
    durationMinutes: input.draft.durationMinutes,
    recurrence: normalizeFocusScheduleRecurrence(input.draft.recurrence),
    protectionLevel: input.draft.protectionLevel,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateFocusSchedule(
  schedule: FocusSchedule,
  patch: Readonly<Partial<FocusScheduleDraft> & {enabled?: boolean}>,
  nowInput: string,
): FocusSchedule {
  const draft: FocusScheduleDraft = {
    target: patch.target ?? schedule.target,
    durationMinutes: patch.durationMinutes ?? schedule.durationMinutes,
    recurrence: patch.recurrence ?? schedule.recurrence,
    protectionLevel: patch.protectionLevel ?? schedule.protectionLevel,
  };
  const updated = createFocusSchedule({id: schedule.id, draft, now: nowInput});
  return {...updated, enabled: patch.enabled ?? schedule.enabled, createdAt: schedule.createdAt};
}

export function focusScheduleEventBusinessKey(
  scheduleId: string,
  localDateKey: string,
  type: FocusScheduleEventType,
): string {
  return `focus-schedule-event:${scheduleId}:${localDateKey}:${type}`;
}

export function focusScheduleStartBusinessKey(scheduleId: string, localDateKey: string): string {
  return `focus-schedule-start:${scheduleId}:${localDateKey}`;
}

export function createFocusScheduleEvent(input: Readonly<{
  id: string;
  scheduleId: string;
  localDateKey: string;
  plannedStartAt: string;
  type: FocusScheduleEventType;
  now: string;
  resolvedTaskId?: string;
  focusSessionId?: string;
  rescheduledTo?: string;
}>): FocusScheduleEvent {
  if (!DATE_KEY.test(input.localDateKey)) return fail('FOCUS_SCHEDULE_DATE_INVALID');
  const plannedStartAt = timestamp(input.plannedStartAt, 'FOCUS_SCHEDULE_START_INVALID');
  const createdAt = timestamp(input.now, 'FOCUS_SCHEDULE_CLOCK_INVALID');
  const event: FocusScheduleEvent = {
    id: id(input.id, 'FOCUS_SCHEDULE_EVENT_ID_INVALID'),
    scheduleId: id(input.scheduleId, 'FOCUS_SCHEDULE_ID_INVALID'),
    localDateKey: input.localDateKey,
    plannedStartAt,
    type: input.type,
    createdAt,
    ...(input.resolvedTaskId === undefined
      ? {}
      : {resolvedTaskId: id(input.resolvedTaskId, 'FOCUS_SCHEDULE_TASK_INVALID')}),
    ...(input.focusSessionId === undefined
      ? {}
      : {focusSessionId: id(input.focusSessionId, 'FOCUS_SCHEDULE_SESSION_INVALID')}),
    ...(input.rescheduledTo === undefined
      ? {}
      : {rescheduledTo: timestamp(input.rescheduledTo, 'FOCUS_SCHEDULE_RESCHEDULE_INVALID')}),
  };
  if (event.type === 'RESCHEDULED' && event.rescheduledTo === undefined) {
    return fail('FOCUS_SCHEDULE_RESCHEDULE_INVALID');
  }
  if (event.type === 'STARTED' && (event.resolvedTaskId === undefined || event.focusSessionId === undefined)) {
    return fail('FOCUS_SCHEDULE_START_EVENT_INVALID');
  }
  return event;
}

export function localDateKeyAt(instant: string, zone: string): string {
  const date = new Date(timestamp(instant, 'FOCUS_SCHEDULE_CLOCK_INVALID'));
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone(zone),
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(candidate => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function addLocalDays(localDateKey: string, days: number): string {
  if (!DATE_KEY.test(localDateKey) || !Number.isSafeInteger(days)) {
    return fail('FOCUS_SCHEDULE_DATE_INVALID');
  }
  const date = new Date(`${localDateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekdayFor(localDateKey: string): number {
  return new Date(`${localDateKey}T12:00:00.000Z`).getUTCDay();
}

export function focusScheduleOccurrenceOnDate(input: Readonly<{
  schedule: FocusSchedule;
  localDateKey: string;
  events?: readonly FocusScheduleEvent[];
  resolveLocalTrigger: FocusLocalTriggerResolver;
  currentTimeZone?: string;
}>): FocusScheduleOccurrence | null {
  if (!input.schedule.enabled || !DATE_KEY.test(input.localDateKey)) return null;
  let plannedStartAt: string;
  const recurrence = input.schedule.recurrence;
  if (recurrence.kind === 'ONCE') {
    const zone = (input.currentTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';
    if (localDateKeyAt(recurrence.startsAt, zone) !== input.localDateKey) return null;
    plannedStartAt = recurrence.startsAt;
  } else {
    if (recurrence.kind === 'WEEKLY' && !recurrence.weekdays.includes(weekdayFor(input.localDateKey))) {
      return null;
    }
    plannedStartAt = timestamp(input.resolveLocalTrigger({
      localDateKey: input.localDateKey,
      localTime: recurrence.localTime,
      timeZone: recurrence.timezone,
    }), 'FOCUS_SCHEDULE_START_INVALID');
  }
  const event = (input.events ?? [])
    .filter(candidate => candidate.scheduleId === input.schedule.id && candidate.localDateKey === input.localDateKey)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] ?? null;
  return {schedule: input.schedule, localDateKey: input.localDateKey, plannedStartAt, event};
}

export function nextFocusScheduleOccurrence(input: Readonly<{
  schedule: FocusSchedule;
  now: string;
  events?: readonly FocusScheduleEvent[];
  resolveLocalTrigger: FocusLocalTriggerResolver;
  currentTimeZone?: string;
}>): FocusScheduleOccurrence | null {
  if (!input.schedule.enabled) return null;
  if (input.schedule.recurrence.kind === 'ONCE') {
    if (Date.parse(input.schedule.recurrence.startsAt) < Date.parse(input.now)) return null;
    const zone = (input.currentTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';
    const dateKey = localDateKeyAt(input.schedule.recurrence.startsAt, zone);
    return focusScheduleOccurrenceOnDate({...input, localDateKey: dateKey});
  }
  const zone = input.schedule.recurrence.timezone;
  const today = localDateKeyAt(input.now, zone);
  for (let offset = 0; offset <= 8; offset += 1) {
    const occurrence = focusScheduleOccurrenceOnDate({
      ...input,
      localDateKey: addLocalDays(today, offset),
    });
    if (occurrence !== null && Date.parse(occurrence.plannedStartAt) >= Date.parse(input.now)) {
      return occurrence;
    }
  }
  return null;
}
