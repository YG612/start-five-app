import {
  CURRENT_FOCUS_SESSION_SNAPSHOT_SCHEMA,
  CURRENT_FOCUS_SESSION_SNAPSHOT_VERSION,
} from './currentFocusSessionStorage';

const DURATIONS = new Set([2, 5, 15, 25, 45, 50]);
const STATUSES = new Set(['running', 'completed', 'interrupted']);
const V1_FIELDS = [
  'actualSeconds', 'createdAt', 'endedAt', 'id', 'interruptionReason',
  'plannedEndAt', 'plannedMinutes', 'startedAt', 'status', 'taskId',
  'updatedAt',
];
const V2_FIELDS = [...V1_FIELDS, 'snapshot'].sort();

function invalid(): never {
  const error = new Error('FOCUS_SESSION_SNAPSHOT_INVALID') as Error & {
    code?: string;
  };
  error.code = error.message;
  throw error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString() === value;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function validSnapshot(value: unknown, taskId: string): boolean {
  if (value === null || value === undefined) return true;
  if (!isRecord(value) || value.taskId !== taskId) return false;
  const allowed = new Set([
    'taskId', 'quadrantAtStart', 'importanceScoreAtStart',
    'effectiveUrgencyAtStart', 'dueAtAtStart', 'firstStepIdAtStart',
    'focusScheduleId',
  ]);
  if (Object.keys(value).some(key => !allowed.has(key))) return false;
  if (!['Q1', 'Q2', 'Q3', 'Q4'].includes(String(value.quadrantAtStart))) {
    return false;
  }
  for (const key of ['importanceScoreAtStart', 'effectiveUrgencyAtStart']) {
    const score = value[key];
    if (score !== undefined &&
      (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100)) {
      return false;
    }
  }
  return (value.dueAtAtStart === undefined || isTimestamp(value.dueAtAtStart)) &&
    (value.firstStepIdAtStart === undefined || typeof value.firstStepIdAtStart === 'string') &&
    (value.focusScheduleId === undefined || typeof value.focusScheduleId === 'string');
}

function validSession(value: unknown, version: number): value is Record<string, unknown> {
  if (!isRecord(value) ||
    !exactKeys(value, version === 2 ? V2_FIELDS : V1_FIELDS)) return false;
  if (typeof value.id !== 'string' || value.id.trim() === '' ||
    typeof value.taskId !== 'string' || value.taskId.trim() === '' ||
    typeof value.plannedMinutes !== 'number' || !DURATIONS.has(value.plannedMinutes) ||
    !STATUSES.has(String(value.status)) ||
    !isTimestamp(value.startedAt) || !isTimestamp(value.plannedEndAt) ||
    !isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt) ||
    !validSnapshot(value.snapshot, value.taskId)) return false;

  const started = Date.parse(value.startedAt);
  const plannedEnd = Date.parse(value.plannedEndAt);
  if (value.createdAt !== value.startedAt ||
    plannedEnd !== started + value.plannedMinutes * 60_000) return false;
  if (value.status === 'running') {
    return value.endedAt === null && value.actualSeconds === null &&
      value.interruptionReason === null && value.updatedAt === value.startedAt;
  }
  if (!isTimestamp(value.endedAt) || typeof value.actualSeconds !== 'number' ||
    !Number.isSafeInteger(value.actualSeconds) || value.actualSeconds < 0 ||
    value.updatedAt !== value.endedAt) return false;
  const ended = Date.parse(value.endedAt);
  if (ended < started || value.actualSeconds !== Math.floor((ended - started) / 1000)) {
    return false;
  }
  return value.status === 'completed'
    ? ended <= plannedEnd && value.interruptionReason === null
    : ended < plannedEnd && typeof value.interruptionReason === 'string' &&
      value.interruptionReason.trim() !== '';
}

export function validateFocusSessionBackup(raw: string | null): number {
  if (raw === null) return 0;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return invalid();
  }
  if (!isRecord(parsed) || !exactKeys(parsed, ['schema', 'sessions', 'version']) ||
    parsed.schema !== CURRENT_FOCUS_SESSION_SNAPSHOT_SCHEMA ||
    (parsed.version !== 1 && parsed.version !== CURRENT_FOCUS_SESSION_SNAPSHOT_VERSION) ||
    !Array.isArray(parsed.sessions)) return invalid();
  const ids = new Set<string>();
  let running = 0;
  for (const session of parsed.sessions) {
    if (!validSession(session, parsed.version)) return invalid();
    const id = session.id as string;
    if (ids.has(id)) return invalid();
    ids.add(id);
    if (session.status === 'running' && ++running > 1) return invalid();
  }
  return parsed.sessions.length;
}
