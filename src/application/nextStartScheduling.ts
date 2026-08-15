import type {LocalTriggerInput} from './tomorrowFirstNotifications';

export type NextStartShortcut =
  | 'ten_minutes'
  | 'later_today'
  | 'tomorrow'
  | 'this_week'
  | 'custom';

type ResolveInput = Readonly<{
  shortcut: NextStartShortcut;
  now: string;
  customAt?: string;
  currentTimeZone?(): string;
  resolveLocalTrigger?(input: LocalTriggerInput): string;
}>;

function addCalendarDays(dayKey: string, days: number): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days));
  return date.toISOString().slice(0, 10);
}

function dayKeyInTimeZone(now: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(now));
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find(item => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function resolveWall(
  input: ResolveInput,
  dayKey: string,
  wallClockTime: string,
): string | null {
  if (input.currentTimeZone === undefined || input.resolveLocalTrigger === undefined) {
    return null;
  }
  return input.resolveLocalTrigger({
    closureDayKey: dayKey,
    wallClockTime,
    timeZone: input.currentTimeZone(),
    now: input.now,
  });
}

export function resolveNextStartShortcut(input: ResolveInput): string | null {
  const nowMs = Date.parse(input.now);
  if (!Number.isFinite(nowMs)) throw new Error('INVALID_NEXT_START_TIME');
  if (input.shortcut === 'custom') {
    const customMs = Date.parse(input.customAt ?? '');
    if (!Number.isFinite(customMs) || customMs <= nowMs) {
      throw new Error('INVALID_NEXT_START_TIME');
    }
    return new Date(customMs).toISOString();
  }
  if (input.shortcut === 'ten_minutes') {
    return new Date(nowMs + 10 * 60_000).toISOString();
  }
  if (input.currentTimeZone !== undefined && input.resolveLocalTrigger !== undefined) {
    const dayKey = dayKeyInTimeZone(input.now, input.currentTimeZone());
    if (input.shortcut === 'later_today') {
      const wall = resolveWall(input, dayKey, '18:00');
      return wall !== null && Date.parse(wall) > nowMs
        ? wall
        : new Date(nowMs + 3 * 3_600_000).toISOString();
    }
    if (input.shortcut === 'tomorrow') {
      return resolveWall(input, addCalendarDays(dayKey, 1), '09:00');
    }
    const weekday = new Date(`${dayKey}T00:00:00.000Z`).getUTCDay();
    const daysToSaturday = weekday === 6 ? 1 : Math.max(1, 6 - weekday);
    return resolveWall(input, addCalendarDays(dayKey, daysToSaturday), '09:00');
  }
  const local = new Date(nowMs);
  if (input.shortcut === 'later_today') {
    const later = new Date(local);
    later.setHours(18, 0, 0, 0);
    return later.getTime() > nowMs
      ? later.toISOString()
      : new Date(nowMs + 3 * 3_600_000).toISOString();
  }
  if (input.shortcut === 'tomorrow') {
    local.setDate(local.getDate() + 1);
    local.setHours(9, 0, 0, 0);
    return local.toISOString();
  }
  const daysToSaturday = local.getDay() === 6 ? 1 : Math.max(1, 6 - local.getDay());
  local.setDate(local.getDate() + daysToSaturday);
  local.setHours(9, 0, 0, 0);
  return local.toISOString();
}
