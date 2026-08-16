import type {AsyncKeyValueBackend} from '../data/persistentTaskStorage';
import {createReminderSchedulingRepository} from '../data/reminderSchedulingRepository';
import type {Task} from '../domain/task';
import type {DayClosureSnapshot} from './dayClosureService';
import {
  createReminderSchedulingService,
  type ReminderPermission,
  type ReminderScheduler,
} from './reminderScheduling';

const PREFERENCE_KEY = 'start-five/tomorrow-first-reminder/v1';
const DEFAULT_WALL_CLOCK_TIME = '08:00';
const WALL_CLOCK_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export const LOCAL_TRIGGER_NOT_FUTURE = 'LOCAL_TRIGGER_NOT_FUTURE';
export const TOMORROW_FIRST_TIME_SEAMS_PARTIAL =
  'TOMORROW_FIRST_TIME_SEAMS_PARTIAL';

export type LocalTriggerInput = Readonly<{
  closureDayKey: string;
  wallClockTime: string;
  timeZone: string;
  now: string;
}>;

export type TomorrowFirstTap =
  | Readonly<{
      kind: 'focus_ongoing_continue' | 'focus_ongoing_end';
      sessionId: string;
    }>
  | Readonly<{
      kind:
        | 'focus_schedule_start_five'
        | 'focus_schedule_start_planned'
        | 'focus_schedule_delay_ten'
        | 'focus_schedule_skip'
        | 'focus_schedule_open';
      scheduleId: string;
      localDateKey: string;
      taskId?: string;
    }>
  | Readonly<{
      kind: 'tomorrow_first' | 'start_five' | 'delay_ten' | 'reschedule';
      dayKey: string;
      taskId: string;
    }>
  | Readonly<{
      kind: 'shortcut_add' | 'shortcut_continue' | 'shortcut_start_five';
      entryId: string;
    }>
  | Readonly<{
      kind: 'share_text';
      entryId: string;
      text: string;
      truncated: boolean;
    }>;

export type TomorrowFirstNotifications = ReminderScheduler & Readonly<{
  getPermission(): Promise<ReminderPermission>;
  requestPermission(): Promise<ReminderPermission>;
  getInitialTap(): Promise<TomorrowFirstTap | null>;
  subscribeTap(listener: (tap: TomorrowFirstTap) => void): () => void;
  startFocusOngoing?(input: Readonly<{
    sessionId: string;
    title: string;
    firstStep: string;
    plannedEndAt: string;
  }>): Promise<void>;
  stopFocusOngoing?(sessionId: string): Promise<void>;
  setKeepScreenAwake?(enabled: boolean): Promise<void>;
  playFocusCompletionFeedback?(input: Readonly<{
    haptic: boolean;
    sound: boolean;
  }>): Promise<void>;
}>;

type ReminderReason = 'idle' | 'denied';

type ReminderPreferenceV1 = Readonly<{
  version: 1;
  dayKey: string;
  targetTaskId: string;
  enabled: boolean;
  reason?: ReminderReason;
}>;

type ReminderPreferenceV2 = Readonly<{
  version: 2;
  dayKey: string;
  targetTaskId: string;
  enabled: boolean;
  wallClockTime: string;
  timeZone: string;
  resolvedTriggerAt: string | null;
  reason?: ReminderReason;
}>;

type ReminderPreference = ReminderPreferenceV1 | ReminderPreferenceV2;

export type TomorrowFirstReminderResult = 'scheduled' | 'denied' | 'idle';

export type TomorrowFirstReminderSettings = Readonly<{
  enabled: boolean;
  wallClockTime: string;
  timeZone: string;
  permission: ReminderPermission | 'unknown';
  status: TomorrowFirstReminderResult;
}>;

export type TomorrowFirstReminderService = Readonly<{
  enable(
    snapshot: DayClosureSnapshot,
    wallClockTime?: string,
  ): Promise<TomorrowFirstReminderResult>;
  reconcile(snapshot: DayClosureSnapshot): Promise<TomorrowFirstReminderResult>;
  /** Present only for the GAP13 local-time settings flow. */
  readonly settingsEnabled?: boolean;
  getSettings?(): Promise<TomorrowFirstReminderSettings>;
  saveTime?(
    snapshot: DayClosureSnapshot,
    wallClockTime: string,
  ): Promise<TomorrowFirstReminderResult>;
  disable?(snapshot: DayClosureSnapshot): Promise<TomorrowFirstReminderResult>;
}>;

function legacyNextDayTrigger(dayKey: string): string {
  const start = Date.parse(`${dayKey}T00:00:00.000Z`);
  if (!Number.isFinite(start)) {
    throw new Error('TOMORROW_FIRST_DAY_INVALID');
  }
  return new Date(start + 32 * 60 * 60 * 1000).toISOString();
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error('TOMORROW_FIRST_REMINDER_CORRUPT');
  }
}

function validReason(enabled: boolean, reason: unknown): boolean {
  return enabled
    ? reason === undefined
    : reason === 'idle' || reason === 'denied';
}

function parsePreference(raw: string | null): ReminderPreference | null {
  if (raw === null) {
    return null;
  }
  const value = parseJson(raw);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('TOMORROW_FIRST_REMINDER_CORRUPT');
  }
  const candidate = value as Record<string, unknown>;
  const commonValid =
    typeof candidate.enabled === 'boolean' &&
    typeof candidate.dayKey === 'string' &&
    candidate.dayKey.length > 0 &&
    typeof candidate.targetTaskId === 'string' &&
    candidate.targetTaskId.length > 0 &&
    validReason(candidate.enabled, candidate.reason);
  if (!commonValid) {
    throw new Error('TOMORROW_FIRST_REMINDER_CORRUPT');
  }
  if (candidate.version === 1) {
    const allowed = new Set([
      'version',
      'dayKey',
      'targetTaskId',
      'enabled',
      ...(candidate.enabled ? [] : ['reason']),
    ]);
    if (Object.keys(candidate).some(key => !allowed.has(key))) {
      throw new Error('TOMORROW_FIRST_REMINDER_CORRUPT');
    }
    return candidate as unknown as ReminderPreferenceV1;
  }
  if (
    candidate.version !== 2 ||
    typeof candidate.wallClockTime !== 'string' ||
    !WALL_CLOCK_PATTERN.test(candidate.wallClockTime) ||
    typeof candidate.timeZone !== 'string' ||
    candidate.timeZone.trim().length === 0 ||
    (candidate.resolvedTriggerAt !== null &&
      (typeof candidate.resolvedTriggerAt !== 'string' ||
        !Number.isFinite(Date.parse(candidate.resolvedTriggerAt)) ||
        new Date(Date.parse(candidate.resolvedTriggerAt)).toISOString() !==
          candidate.resolvedTriggerAt)) ||
    (candidate.enabled === true && candidate.resolvedTriggerAt === null)
  ) {
    throw new Error('TOMORROW_FIRST_REMINDER_CORRUPT');
  }
  const allowed = new Set([
    'version',
    'dayKey',
    'targetTaskId',
    'enabled',
    'wallClockTime',
    'timeZone',
    'resolvedTriggerAt',
    ...(candidate.enabled ? [] : ['reason']),
  ]);
  if (Object.keys(candidate).some(key => !allowed.has(key))) {
    throw new Error('TOMORROW_FIRST_REMINDER_CORRUPT');
  }
  return candidate as unknown as ReminderPreferenceV2;
}

export function validateTomorrowFirstPreferenceBackup(
  raw: string | null,
): number {
  return parsePreference(raw) === null ? 0 : 1;
}

function validateWallClockTime(value: string): string {
  if (!WALL_CLOCK_PATTERN.test(value)) {
    throw new Error('TOMORROW_FIRST_WALL_CLOCK_INVALID');
  }
  return value;
}

function validateTimeZone(value: string): string {
  if (value.trim().length === 0) {
    throw new Error('TOMORROW_FIRST_TIME_ZONE_INVALID');
  }
  return value;
}

function cancelledTask(taskId: string, now: string): Task {
  return {
    id: taskId,
    title: '',
    description: '',
    important: false,
    urgent: false,
    status: 'cancelled',
    scheduledStartAt: null,
    startAt: null,
    dueAt: null,
    estimatedMinutes: null,
    subtasks: [],
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    deletedAt: null,
    score: null,
    scoreAwardedAt: null,
  };
}

export function createTomorrowFirstReminderService(options: Readonly<{
  backend: AsyncKeyValueBackend;
  notifications: TomorrowFirstNotifications;
  now(): string;
  currentTimeZone?(): string;
  resolveLocalTrigger?(input: LocalTriggerInput): string;
  settingsEnabled?: boolean;
}>): TomorrowFirstReminderService {
  const scheduling = createReminderSchedulingService({
    repository: createReminderSchedulingRepository(options.backend),
    scheduler: options.notifications,
  });
  const currentTimeZone = options.currentTimeZone ?? (() => 'UTC');
  const resolveLocalTrigger =
    options.resolveLocalTrigger ??
    ((input: LocalTriggerInput) => legacyNextDayTrigger(input.closureDayKey));
  const settingsEnabled = options.settingsEnabled === true;
  const normalizedLegacyPreferences = new WeakSet<ReminderPreferenceV2>();
  let permissionPrompted = false;
  let tail: Promise<unknown> = Promise.resolve();

  function serialize<T>(work: () => Promise<T>): Promise<T> {
    const result = tail.then(work, work);
    tail = result.then(() => undefined, () => undefined);
    return result;
  }

  function resolveTrigger(
    dayKey: string,
    wallClockTime: string,
  ): Readonly<{timeZone: string; triggerAt: string}> {
    const now = options.now();
    const nowMilliseconds = Date.parse(now);
    const timeZone = validateTimeZone(currentTimeZone());
    const supplied = resolveLocalTrigger({
      closureDayKey: dayKey,
      wallClockTime: validateWallClockTime(wallClockTime),
      timeZone,
      now,
    });
    const triggerMilliseconds = Date.parse(supplied);
    if (
      !Number.isFinite(nowMilliseconds) ||
      !Number.isFinite(triggerMilliseconds) ||
      new Date(triggerMilliseconds).toISOString() !== supplied ||
      triggerMilliseconds <= nowMilliseconds
    ) {
      throw new Error(LOCAL_TRIGGER_NOT_FUTURE);
    }
    return {timeZone, triggerAt: new Date(triggerMilliseconds).toISOString()};
  }

  async function rawPreference(): Promise<ReminderPreference | null> {
    return parsePreference(await options.backend.getItem(PREFERENCE_KEY));
  }

  async function savePreference(value: ReminderPreferenceV2): Promise<void> {
    await options.backend.setItem(PREFERENCE_KEY, JSON.stringify(value));
  }

  async function preference(): Promise<ReminderPreferenceV2 | null> {
    const current = await rawPreference();
    if (current === null || current.version === 2) {
      return current;
    }
    const migrated: ReminderPreferenceV2 = {
      version: 2,
      dayKey: current.dayKey,
      targetTaskId: current.targetTaskId,
      enabled: current.enabled,
      wallClockTime: DEFAULT_WALL_CLOCK_TIME,
      timeZone: validateTimeZone(currentTimeZone()),
      resolvedTriggerAt: null,
      ...(current.enabled ? {} : {reason: current.reason ?? 'idle'}),
    };
    normalizedLegacyPreferences.add(migrated);
    return migrated;
  }

  async function cancel(
    taskId: string,
    dayKey: string,
    permission?: ReminderPermission,
  ): Promise<void> {
    const durable = await scheduling.getState(taskId);
    const platform = await options.notifications.get(taskId);
    const source = durable ?? platform;
    if (source === null) {
      return;
    }
    const now = options.now();
    await scheduling.reconcile({
      task: cancelledTask(taskId, now),
      now,
      timeZone: 'UTC',
      progressRatio: null,
      rules: [],
      permission: permission ?? source.permission,
      operationId: `tomorrow-first:${dayKey}:${taskId}:cancel:${permission ?? source.permission}`,
    });
  }

  function usable(snapshot: DayClosureSnapshot): boolean {
    return (
      snapshot.record?.state === 'pending' &&
      snapshot.target !== null &&
      snapshot.target.deletedAt === null &&
      (snapshot.target.status === 'pending' ||
        snapshot.target.status === 'in_progress')
    );
  }

  async function schedule(
    snapshot: DayClosureSnapshot,
    wallClockTime: string,
    resolution: Readonly<{timeZone: string; triggerAt: string}>,
  ): Promise<void> {
    const record = snapshot.record;
    const target = snapshot.target;
    if (record === null || target === null || !usable(snapshot)) {
      return;
    }
    const ruleId = `tomorrow-first:${record.dayKey}`;
    const operationSuffix = encodeURIComponent(
      `${wallClockTime}|${resolution.timeZone}|${resolution.triggerAt}`,
    );
    await scheduling.reconcile({
      task: {...target, scheduledStartAt: resolution.triggerAt},
      now: options.now(),
      timeZone: resolution.timeZone,
      progressRatio: null,
      rules: [{
        id: ruleId,
        kind: 'start',
        anchor: 'scheduled_start',
        offsetMinutes: 0,
        progressBelow: null,
      }],
      permission: 'granted',
      operationId: `tomorrow-first:${record.dayKey}:${target.id}:schedule:${operationSuffix}`,
    });
  }

  function preferenceFor(
    snapshot: DayClosureSnapshot,
    input: Readonly<{
      enabled: boolean;
      wallClockTime: string;
      timeZone: string;
      resolvedTriggerAt: string | null;
      reason?: ReminderReason;
    }>,
  ): ReminderPreferenceV2 {
    const record = snapshot.record;
    if (record === null) {
      throw new Error('TOMORROW_FIRST_RECORD_REQUIRED');
    }
    return {
      version: 2,
      dayKey: record.dayKey,
      targetTaskId: record.targetTaskId,
      enabled: input.enabled,
      wallClockTime: input.wallClockTime,
      timeZone: input.timeZone,
      resolvedTriggerAt: input.resolvedTriggerAt,
      ...(input.enabled ? {} : {reason: input.reason ?? 'idle'}),
    };
  }

  async function scheduleAndPersist(
    snapshot: DayClosureSnapshot,
    wallClockTime: string,
    previous: ReminderPreferenceV2 | null,
  ): Promise<TomorrowFirstReminderResult> {
    const record = snapshot.record;
    if (record === null || !usable(snapshot)) {
      if (record !== null) {
        await cancel(record.targetTaskId, record.dayKey);
      }
      return 'idle';
    }
    const resolution = resolveTrigger(record.dayKey, wallClockTime);
    if (
      previous !== null &&
      (previous.targetTaskId !== record.targetTaskId ||
        previous.dayKey !== record.dayKey)
    ) {
      await cancel(previous.targetTaskId, previous.dayKey);
    }
    await schedule(snapshot, wallClockTime, resolution);
    try {
      await savePreference(
        preferenceFor(snapshot, {
          enabled: true,
          wallClockTime,
          timeZone: resolution.timeZone,
          resolvedTriggerAt: resolution.triggerAt,
        }),
      );
    } catch (error: unknown) {
      await cancel(record.targetTaskId, record.dayKey).catch(() => undefined);
      throw error;
    }
    return 'scheduled';
  }

  const service = {
    settingsEnabled,
    async getSettings() {
      const current = await preference();
      if (current === null) {
        return {
          enabled: false,
          wallClockTime: DEFAULT_WALL_CLOCK_TIME,
          timeZone: validateTimeZone(currentTimeZone()),
          permission: 'unknown',
          status: 'idle',
        };
      }
      return {
        enabled: current.enabled,
        wallClockTime: current.wallClockTime,
        timeZone: current.timeZone,
        permission:
          current.reason === 'denied' ? 'denied' : 'unknown',
        status: current.enabled
          ? 'scheduled'
          : current.reason === 'denied'
            ? 'denied'
            : 'idle',
      };
    },
    async enable(snapshot, requestedWallClockTime) {
      return serialize(async () => {
        const current = await preference();
        const wallClockTime = validateWallClockTime(
          requestedWallClockTime ??
            current?.wallClockTime ??
            DEFAULT_WALL_CLOCK_TIME,
        );
        let permission = await options.notifications.getPermission();
        if (permission === 'not_determined' && !permissionPrompted) {
          permissionPrompted = true;
          permission = await options.notifications.requestPermission();
        }
        if (permission !== 'granted') {
          const record = snapshot.record;
          if (record !== null) {
            await cancel(record.targetTaskId, record.dayKey, 'denied');
            await savePreference(
              preferenceFor(snapshot, {
                enabled: false,
                wallClockTime,
                timeZone: validateTimeZone(currentTimeZone()),
                resolvedTriggerAt: current?.resolvedTriggerAt ?? null,
                reason: 'denied',
              }),
            );
          }
          return 'denied';
        }
        return scheduleAndPersist(snapshot, wallClockTime, current);
      });
    },
    async saveTime(snapshot, requestedWallClockTime) {
      return serialize<TomorrowFirstReminderResult>(async () => {
        const wallClockTime = validateWallClockTime(requestedWallClockTime);
        const current = await preference();
        if (current?.enabled !== true) {
          if (snapshot.record === null) {
            return 'idle';
          }
          await savePreference(
            preferenceFor(snapshot, {
              enabled: false,
              wallClockTime,
              timeZone: validateTimeZone(currentTimeZone()),
              resolvedTriggerAt: current?.resolvedTriggerAt ?? null,
              reason: current?.reason ?? 'idle',
            }),
          );
          return current?.reason === 'denied' ? 'denied' : 'idle';
        }
        return scheduleAndPersist(snapshot, wallClockTime, current);
      });
    },
    async disable(snapshot) {
      return serialize<TomorrowFirstReminderResult>(async () => {
        const current = await preference();
        const record = snapshot.record;
        if (record === null) {
          return 'idle';
        }
        const wallClockTime =
          current?.wallClockTime ?? DEFAULT_WALL_CLOCK_TIME;
        await savePreference(
          preferenceFor(snapshot, {
            enabled: false,
            wallClockTime,
            timeZone: current?.timeZone ?? validateTimeZone(currentTimeZone()),
            resolvedTriggerAt: current?.resolvedTriggerAt ?? null,
            reason: 'idle',
          }),
        );
        await cancel(record.targetTaskId, record.dayKey);
        return 'idle';
      });
    },
    async reconcile(snapshot) {
      return serialize<TomorrowFirstReminderResult>(async () => {
        const current = await preference();
        if (current === null) {
          return 'idle';
        }
        const record = snapshot.record;
        if (record === null) {
          await cancel(current.targetTaskId, current.dayKey);
          await options.backend.removeItem(PREFERENCE_KEY);
          return 'idle';
        }
        if (!current.enabled) {
          if (
            current.targetTaskId !== record.targetTaskId ||
            current.dayKey !== record.dayKey
          ) {
            await cancel(current.targetTaskId, current.dayKey);
            await savePreference(
              preferenceFor(snapshot, {
                enabled: false,
                wallClockTime: current.wallClockTime,
                timeZone: validateTimeZone(currentTimeZone()),
                resolvedTriggerAt: current.resolvedTriggerAt,
                reason: current.reason ?? 'idle',
              }),
            );
          } else {
            await cancel(current.targetTaskId, current.dayKey);
            if (normalizedLegacyPreferences.has(current)) {
              await savePreference(
                preferenceFor(snapshot, {
                  enabled: false,
                  wallClockTime: current.wallClockTime,
                  timeZone: validateTimeZone(currentTimeZone()),
                  resolvedTriggerAt: current.resolvedTriggerAt,
                  reason: current.reason ?? 'idle',
                }),
              );
            }
          }
          return current.reason === 'denied' ? 'denied' : 'idle';
        }
        const permission = await options.notifications.getPermission();
        if (permission !== 'granted') {
          await cancel(current.targetTaskId, current.dayKey, permission);
          await savePreference(
            preferenceFor(snapshot, {
              enabled: false,
              wallClockTime: current.wallClockTime,
              timeZone: validateTimeZone(currentTimeZone()),
              resolvedTriggerAt: current.resolvedTriggerAt,
              reason: permission === 'denied' ? 'denied' : 'idle',
            }),
          );
          return permission === 'denied' ? 'denied' : 'idle';
        }
        if (!usable(snapshot)) {
          await cancel(record.targetTaskId, record.dayKey);
          return 'idle';
        }
        return scheduleAndPersist(snapshot, current.wallClockTime, current);
      });
    },
  } satisfies TomorrowFirstReminderService;
  return service;
}

/**
 * Resolves a wall-clock preference without relying on the JavaScript host
 * timezone. DST gaps advance to the first valid minute; overlaps choose the
 * first future occurrence. If today's occurrence has passed, the next local
 * day is used.
 */
export function resolveIanaLocalTrigger(input: LocalTriggerInput): string {
  validateWallClockTime(input.wallClockTime);
  validateTimeZone(input.timeZone);
  const nowMilliseconds = Date.parse(input.now);
  if (!Number.isFinite(nowMilliseconds)) {
    throw new Error(LOCAL_TRIGGER_NOT_FUTURE);
  }
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: input.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  type LocalFields = Readonly<{
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
  }>;
  const partsAt = (milliseconds: number): LocalFields => {
    const values = Object.fromEntries(
      formatter
        .formatToParts(new Date(milliseconds))
        .filter(part => part.type !== 'literal')
        .map(part => [part.type, part.value]),
    );
    return {
      year: Number(values.year),
      month: Number(values.month),
      day: Number(values.day),
      hour: Number(values.hour),
      minute: Number(values.minute),
    };
  };
  const sameLocalMinute = (
    left: LocalFields,
    right: LocalFields,
  ): boolean =>
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute;
  const [hourText = '', minuteText = ''] = input.wallClockTime.split(':');
  const desiredHour = Number(hourText);
  const desiredMinute = Number(minuteText);
  const base = Date.parse(`${input.closureDayKey}T00:00:00.000Z`);
  if (!Number.isFinite(base)) {
    throw new Error('TOMORROW_FIRST_DAY_INVALID');
  }
  for (let dayOffset = 1; dayOffset <= 7; dayOffset += 1) {
    const desiredDate = new Date(base + dayOffset * 86_400_000);
    const year = desiredDate.getUTCFullYear();
    const month = desiredDate.getUTCMonth() + 1;
    const day = desiredDate.getUTCDate();
    const localDayCenter = Date.UTC(year, month - 1, day, 12, 0);
    const possibleOffsets = new Set<number>();
    for (const sampleHours of [-36, -24, -12, 0, 12, 24, 36]) {
      const sample = localDayCenter + sampleHours * 3_600_000;
      const local = partsAt(sample);
      const localAsUtc = Date.UTC(
        local.year,
        local.month - 1,
        local.day,
        local.hour,
        local.minute,
      );
      possibleOffsets.add(
        (localAsUtc - Math.floor(sample / 60_000) * 60_000) / 60_000,
      );
    }
    const occurrences = (localHour: number, localMinute: number): number[] => {
      const target: LocalFields = {
        year,
        month,
        day,
        hour: localHour,
        minute: localMinute,
      };
      const localAsUtc = Date.UTC(
        year,
        month - 1,
        day,
        localHour,
        localMinute,
      );
      return [...possibleOffsets]
        .map(offset => localAsUtc - offset * 60_000)
        .filter(candidate => sameLocalMinute(partsAt(candidate), target))
        .sort((left, right) => left - right)
        .filter((candidate, index, values) =>
          index === 0 || candidate !== values[index - 1],
        );
    };
    const desiredOccurrences = occurrences(desiredHour, desiredMinute);
    if (desiredOccurrences.length > 0) {
      const firstOccurrence = desiredOccurrences[0];
      if (firstOccurrence !== undefined && firstOccurrence > nowMilliseconds) {
        return new Date(firstOccurrence).toISOString();
      }
      continue;
    }
    let gapCompensation: number | null = null;
    for (let localAdvance = 1; localAdvance <= 180; localAdvance += 1) {
      const totalMinutes = desiredHour * 60 + desiredMinute + localAdvance;
      const localHour = Math.floor(totalMinutes / 60);
      if (localHour >= 24) break;
      const localMinute = totalMinutes % 60;
      const firstMatch = occurrences(localHour, localMinute)[0];
      if (firstMatch !== undefined) {
        gapCompensation = firstMatch;
        break;
      }
    }
    if (gapCompensation !== null && gapCompensation > nowMilliseconds) {
      return new Date(gapCompensation).toISOString();
    }
  }
  throw new Error(LOCAL_TRIGGER_NOT_FUTURE);
}
