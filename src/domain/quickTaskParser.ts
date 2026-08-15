import type {RepeatRule} from './taskPriority';

export const QUICK_TASK_MAX_LENGTH = 500;
export const QUICK_TASK_WARNING_LENGTH = 480;

export type QuickTaskParseResult = Readonly<{
  title: string;
  dueAt: string | null;
  estimatedMinutes: number | null;
  repeatRule: RepeatRule | null;
  confidence: number;
  truncated: boolean;
}>;

const WEEKDAY_INDEX: Readonly<Record<string, number>> = {
  日: 0,
  天: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
};

function localDate(
  base: Date,
  dayOffset: number,
  hour: number,
  minute: number,
): Date {
  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate() + dayOffset,
    hour,
    minute,
    0,
    0,
  );
}

function cleanTitle(value: string): string {
  return value
    .replace(/[，,；;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s:：、-]+|[\s:：、-]+$/g, '')
    .trim();
}

function contextualMatch(pattern: RegExp, value: string): RegExpExecArray | null {
  const match = pattern.exec(value);
  if (match === null || match.index === 0) return match;
  const prefix = value.slice(0, match.index);
  if (/[\s,，;；]$/.test(prefix)) return match;
  if (/(每天|每日|每周|每星期)$/.test(prefix)) return match;
  return null;
}

function parseTime(value: string): Readonly<{
  hour: number;
  minute: number;
  matched: string | null;
}> {
  const periodMatch = /(早上|上午|中午|下午|晚上)/.exec(value);
  const clockMatch = /(?:早上|上午|中午|下午|晚上)?\s*(\d{1,2})[:：点时](\d{1,2})?分?/.exec(
    value,
  );
  if (clockMatch !== null) {
    let hour = Number(clockMatch[1]);
    const minute = Number(clockMatch[2] ?? 0);
    const period = periodMatch?.[1] ?? '';
    if ((period === '下午' || period === '晚上') && hour < 12) hour += 12;
    if (period === '中午' && hour < 11) hour += 12;
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return {hour, minute, matched: clockMatch[0]};
    }
  }
  const period = periodMatch?.[1];
  if (period === '早上' || period === '上午') {
    return {hour: 9, minute: 0, matched: period};
  }
  if (period === '中午') return {hour: 12, minute: 0, matched: period};
  if (period === '下午') return {hour: 15, minute: 0, matched: period};
  if (period === '晚上') return {hour: 20, minute: 0, matched: period};
  return {hour: 23, minute: 59, matched: null};
}

function nextWeekdayOffset(base: Date, target: number, forceNextWeek: boolean): number {
  const current = base.getDay();
  if (forceNextWeek) {
    return ((target - current + 7) % 7) + 7;
  }
  const offset = (target - current + 7) % 7;
  return offset === 0 ? 7 : offset;
}

export function parseQuickTaskSentence(
  input: string,
  nowInput: string,
): QuickTaskParseResult {
  const original = typeof input === 'string' ? input : '';
  const truncated = original.length > QUICK_TASK_MAX_LENGTH;
  const limited = original.slice(0, QUICK_TASK_MAX_LENGTH);
  try {
    const now = new Date(nowInput);
    if (!Number.isFinite(now.getTime())) throw new Error('INVALID_NOW');
    let remaining = limited;
    let dueAt: string | null = null;
    let estimatedMinutes: number | null = null;
    let repeatRule: RepeatRule | null = null;
    let recognized = 0;

    const durationMatch = /(\d+(?:\.\d+)?)\s*(分钟|分|小时|钟头)/.exec(remaining);
    if (durationMatch !== null) {
      const amount = Number(durationMatch[1]);
      const minutes = durationMatch[2] === '分钟' || durationMatch[2] === '分'
        ? amount
        : amount * 60;
      if (Number.isFinite(minutes) && minutes > 0) {
        estimatedMinutes = Math.max(1, Math.round(minutes));
        remaining = remaining.replace(durationMatch[0], ' ');
        recognized += 1;
      }
    }

    const weekdayMatch = contextualMatch(
      /(下|本|这)?\s*(?:周|星期)([一二三四五六日天])/,
      remaining,
    );
    const relativeMatch = contextualMatch(
      /(今天|今晚|明天|明晚|后天)/,
      remaining,
    );
    const time = parseTime(remaining);
    let date: Date | null = null;
    if (relativeMatch !== null) {
      const keyword = relativeMatch[1] ?? '';
      const offset = keyword === '明天' || keyword === '明晚' ? 1 : keyword === '后天' ? 2 : 0;
      const impliedEvening = keyword === '今晚' || keyword === '明晚';
      date = localDate(
        now,
        offset,
        time.matched === null && impliedEvening ? 20 : time.hour,
        time.minute,
      );
      remaining = remaining.replace(relativeMatch[0], ' ');
      recognized += 1;
    } else if (weekdayMatch !== null) {
      const day = WEEKDAY_INDEX[weekdayMatch[2] ?? ''];
      if (day !== undefined) {
        const prefix = weekdayMatch[1] ?? '';
        date = localDate(
          now,
          nextWeekdayOffset(now, day, prefix === '下'),
          time.hour,
          time.minute,
        );
        remaining = remaining.replace(weekdayMatch[0], ' ');
        recognized += 1;
      }
    } else if (contextualMatch(/下周/, remaining) !== null) {
      date = localDate(now, 7, time.hour, time.minute);
      remaining = remaining.replace(/下周/, ' ');
      recognized += 1;
    } else if (contextualMatch(/本周|这周/, remaining) !== null) {
      date = localDate(
        now,
        nextWeekdayOffset(now, 0, false),
        time.hour,
        time.minute,
      );
      remaining = remaining.replace(/本周|这周/, ' ');
      recognized += 1;
    }

    if (date === null && time.matched !== null) {
      date = localDate(now, 0, time.hour, time.minute);
      if (date.getTime() <= now.getTime()) {
        date = localDate(now, 1, time.hour, time.minute);
      }
      recognized += 1;
    }
    if (time.matched !== null) {
      remaining = remaining.replace(time.matched, ' ');
    }
    if (date !== null) dueAt = date.toISOString();

    const daily = /每天|每日/.exec(remaining);
    const weekly = /每周|每星期/.exec(remaining);
    const monthly = /每月/.exec(remaining);
    if (daily !== null) {
      repeatRule = {frequency: 'daily'};
      remaining = remaining.replace(daily[0], ' ');
      recognized += 1;
    } else if (weekly !== null) {
      const weekday = weekdayMatch === null
        ? (date ?? now).getDay()
        : WEEKDAY_INDEX[weekdayMatch[2] ?? ''] ?? now.getDay();
      repeatRule = {frequency: 'weekly', weekdays: [weekday]};
      remaining = remaining.replace(weekly[0], ' ');
      recognized += 1;
    } else if (monthly !== null) {
      repeatRule = {
        frequency: 'monthly',
        dayOfMonth: (date ?? now).getDate(),
      };
      remaining = remaining.replace(monthly[0], ' ');
      recognized += 1;
    }

    const title = cleanTitle(remaining) || cleanTitle(limited);
    return {
      title,
      dueAt,
      estimatedMinutes,
      repeatRule,
      confidence: recognized === 0 ? 0.5 : Math.min(1, 0.72 + recognized * 0.09),
      truncated,
    };
  } catch {
    return {
      title: cleanTitle(limited),
      dueAt: null,
      estimatedMinutes: null,
      repeatRule: null,
      confidence: 0,
      truncated,
    };
  }
}
