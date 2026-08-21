export function dateKeyInTimeZone(value: string, timeZone: string): string {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) throw new Error('LOCAL_DATE_INVALID');
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant);
  } catch {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant);
  }
  const part = (type: 'year' | 'month' | 'day') =>
    parts.find(candidate => candidate.type === type)?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error('LOCAL_DATE_FORMAT_FAILED');
  }
  return `${year}-${month}-${day}`;
}

export function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
