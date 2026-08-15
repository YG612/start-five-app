export type DayClosureState =
  | 'pending'
  | 'starting'
  | 'consumed'
  | 'resolved_completed'
  | 'resolved_deleted';

export type DayClosureRecord = Readonly<{
  dayKey: string;
  targetTaskId: string;
  state: DayClosureState;
  operationId: string;
  createdAt: string;
  updatedAt: string;
}>;

function fail(code: string): never {
  throw new Error(code);
}

export function canonicalDayClosureTimestamp(value: string): string {
  const milliseconds = Date.parse(value);
  if (
    typeof value !== 'string' ||
    value.trim() === '' ||
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    return fail('DAY_CLOSURE_INVALID_TIMESTAMP');
  }
  return value;
}

export function dayKeyAt(value: string): string {
  return canonicalDayClosureTimestamp(value).slice(0, 10);
}

export function createDayClosureRecord(
  dayKey: string,
  targetTaskId: string,
  now: string,
): DayClosureRecord {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    return fail('DAY_CLOSURE_INVALID_DAY');
  }
  if (targetTaskId.trim() === '') {
    return fail('DAY_CLOSURE_TARGET_REQUIRED');
  }
  const timestamp = canonicalDayClosureTimestamp(now);
  return {
    dayKey,
    targetTaskId,
    state: 'pending',
    operationId: `day-closure:${dayKey}:${targetTaskId}`,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function transitionDayClosure(
  record: DayClosureRecord,
  state: DayClosureState,
  now: string,
): DayClosureRecord {
  if (record.state === state) {
    return record;
  }
  const allowed: Readonly<Record<DayClosureState, readonly DayClosureState[]>> = {
    pending: ['starting', 'resolved_completed', 'resolved_deleted'],
    starting: ['consumed', 'resolved_completed', 'resolved_deleted'],
    consumed: [],
    resolved_completed: [],
    resolved_deleted: [],
  };
  if (!allowed[record.state].includes(state)) {
    return fail('DAY_CLOSURE_INVALID_TRANSITION');
  }
  return {
    ...record,
    state,
    updatedAt: canonicalDayClosureTimestamp(now),
  };
}
