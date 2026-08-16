import {getQuadrant, type Quadrant} from './quadrant';
import type {Task} from './task';

export const TASK_PRIORITY_SCHEMA_VERSION = 1 as const;

export type UrgencyMode = 'manual' | 'hybrid';

export type TaskPriorityCoordinates = Readonly<{
  importanceScore: number;
  manualUrgencyScore: number;
  urgencyMode: UrgencyMode;
}>;

export type RepeatRule =
  | Readonly<{frequency: 'daily'}>
  | Readonly<{frequency: 'weekly'; weekdays: readonly number[]}>
  | Readonly<{frequency: 'monthly'; dayOfMonth: number}>;

export type TaskPriorityFields = Readonly<{
  prioritySchemaVersion?: typeof TASK_PRIORITY_SCHEMA_VERSION;
  importanceScore?: number;
  manualUrgencyScore?: number;
  urgencyMode?: UrgencyMode;
  repeatRule?: RepeatRule | null;
  repeatSeriesId?: string;
  repeatOccurrenceKey?: string;
  postponedCount?: number;
}>;

export type TaskWithPriority = Task & TaskPriorityFields;

const LEGACY_COORDINATES: Readonly<Record<Quadrant, TaskPriorityCoordinates>> = {
  Q1: {importanceScore: 80, manualUrgencyScore: 80, urgencyMode: 'manual'},
  Q2: {importanceScore: 80, manualUrgencyScore: 25, urgencyMode: 'manual'},
  Q3: {importanceScore: 25, manualUrgencyScore: 80, urgencyMode: 'manual'},
  Q4: {importanceScore: 25, manualUrgencyScore: 25, urgencyMode: 'manual'},
};

const PRIORITY_FIELD_NAMES = [
  'prioritySchemaVersion',
  'importanceScore',
  'manualUrgencyScore',
  'urgencyMode',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function normalizePriorityScore(
  value: unknown,
  fallback = 50,
): number {
  const normalizedFallback =
    typeof fallback === 'number' && Number.isFinite(fallback)
      ? Math.min(100, Math.max(0, fallback))
      : 50;
  const candidate =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(candidate)) {
    return normalizedFallback;
  }
  return Math.min(100, Math.max(0, candidate));
}

export function legacyPriorityCoordinates(
  important: boolean,
  urgent: boolean,
): TaskPriorityCoordinates {
  return {...LEGACY_COORDINATES[getQuadrant(important, urgent)]};
}

export function priorityCoordinatesForTask(
  task: Task,
): TaskPriorityCoordinates {
  const extended = task as TaskWithPriority;
  const legacy = legacyPriorityCoordinates(task.important, task.urgent);
  return {
    importanceScore: normalizePriorityScore(
      extended.importanceScore,
      legacy.importanceScore,
    ),
    manualUrgencyScore: normalizePriorityScore(
      extended.manualUrgencyScore,
      legacy.manualUrgencyScore,
    ),
    urgencyMode:
      extended.urgencyMode === 'hybrid' || extended.urgencyMode === 'manual'
        ? extended.urgencyMode
        : 'manual',
  };
}

export function priorityFieldsForNewTask(input: Readonly<{
  important: boolean;
  urgent: boolean;
  dueAt: string | null;
}>): Required<Pick<
  TaskPriorityFields,
  | 'prioritySchemaVersion'
  | 'importanceScore'
  | 'manualUrgencyScore'
  | 'urgencyMode'
>> {
  const legacy = legacyPriorityCoordinates(input.important, input.urgent);
  return {
    prioritySchemaVersion: TASK_PRIORITY_SCHEMA_VERSION,
    importanceScore: legacy.importanceScore,
    manualUrgencyScore: legacy.manualUrgencyScore,
    urgencyMode: input.dueAt === null ? 'manual' : 'hybrid',
  };
}

export function deriveDeadlineUrgencyScore(
  dueAt: string | null | undefined,
  nowInput: string,
): number | null {
  if (dueAt == null) {
    return null;
  }
  const dueMilliseconds = Date.parse(dueAt);
  const nowMilliseconds = Date.parse(nowInput);
  if (!Number.isFinite(dueMilliseconds) || !Number.isFinite(nowMilliseconds)) {
    return null;
  }
  const remainingHours = (dueMilliseconds - nowMilliseconds) / 3_600_000;
  if (remainingHours < 0) return 100;
  if (remainingHours <= 6) return 95;
  if (remainingHours <= 24) return 85;
  if (remainingHours <= 72) return 70;
  if (remainingHours <= 168) return 55;
  if (remainingHours <= 336) return 40;
  return 20;
}

export function deriveEffectiveUrgencyScore(
  coordinates: TaskPriorityCoordinates,
  deadlineUrgencyScore: number | null,
): number {
  const manual = normalizePriorityScore(coordinates.manualUrgencyScore);
  if (coordinates.urgencyMode === 'manual' || deadlineUrgencyScore === null) {
    return manual;
  }
  return Math.max(manual, normalizePriorityScore(deadlineUrgencyScore));
}

export function effectiveUrgencyForTask(task: Task, nowInput: string): number {
  const coordinates = priorityCoordinatesForTask(task);
  return deriveEffectiveUrgencyScore(
    coordinates,
    deriveDeadlineUrgencyScore(task.dueAt, nowInput),
  );
}

export function deriveQuadrantFromPriority(
  importanceScore: number,
  effectiveUrgencyScore: number,
): Quadrant {
  return getQuadrant(
    normalizePriorityScore(importanceScore) >= 50,
    normalizePriorityScore(effectiveUrgencyScore) >= 50,
  );
}

export function effectiveQuadrantForTask(
  task: Task,
  nowInput: string,
): Quadrant {
  const coordinates = priorityCoordinatesForTask(task);
  return deriveQuadrantFromPriority(
    coordinates.importanceScore,
    effectiveUrgencyForTask(task, nowInput),
  );
}

export function deriveLegacyPriorityFields(
  coordinates: TaskPriorityCoordinates,
  dueAt: string | null,
  nowInput: string,
): Readonly<{important: boolean; urgent: boolean}> {
  const quadrant = deriveQuadrantFromPriority(
    coordinates.importanceScore,
    deriveEffectiveUrgencyScore(
      coordinates,
      deriveDeadlineUrgencyScore(dueAt, nowInput),
    ),
  );
  return {
    important: quadrant === 'Q1' || quadrant === 'Q2',
    urgent: quadrant === 'Q1' || quadrant === 'Q3',
  };
}

export function scoresForMapDrop(
  x: number,
  y: number,
  bounds: Readonly<{left: number; top: number; width: number; height: number}>,
): Readonly<{importanceScore: number; manualUrgencyScore: number}> {
  if (bounds.width <= 0 || bounds.height <= 0) {
    return {importanceScore: 50, manualUrgencyScore: 50};
  }
  return {
    importanceScore: normalizePriorityScore(
      ((x - bounds.left) / bounds.width) * 100,
    ),
    manualUrgencyScore: normalizePriorityScore(
      100 - ((y - bounds.top) / bounds.height) * 100,
    ),
  };
}

export function isPointInsideMapBounds(
  x: number,
  y: number,
  bounds: Readonly<{left: number; top: number; width: number; height: number}>,
): boolean {
  return bounds.width > 0 &&
    bounds.height > 0 &&
    x >= bounds.left &&
    x <= bounds.left + bounds.width &&
    y >= bounds.top &&
    y <= bounds.top + bounds.height;
}

function normalizeWeekdays(value: unknown): readonly number[] | null {
  if (!Array.isArray(value)) return null;
  const days = Array.from(
    new Set(
      value.filter(
        (day): day is number =>
          typeof day === 'number' && Number.isSafeInteger(day) && day >= 0 && day <= 6,
      ),
    ),
  ).sort((left, right) => left - right);
  return days.length === 0 ? null : days;
}

export function normalizeRepeatRule(value: unknown): RepeatRule | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) return null;
  if (value.frequency === 'daily') return {frequency: 'daily'};
  if (value.frequency === 'weekly') {
    const weekdays = normalizeWeekdays(value.weekdays);
    return weekdays === null ? null : {frequency: 'weekly', weekdays};
  }
  if (
    value.frequency === 'monthly' &&
    typeof value.dayOfMonth === 'number' &&
    Number.isSafeInteger(value.dayOfMonth) &&
    value.dayOfMonth >= 1 &&
    value.dayOfMonth <= 31
  ) {
    return {frequency: 'monthly', dayOfMonth: value.dayOfMonth};
  }
  return null;
}

export function hasTaskPriorityFields(value: object): boolean {
  return PRIORITY_FIELD_NAMES.some(key => hasOwn(value, key));
}

/**
 * Normalizes one P8-aware record without making an old record hybrid. Completely
 * legacy records remain byte-shape compatible and are interpreted through
 * priorityCoordinatesForTask as manual coordinates.
 */
export function normalizeTaskExtensionRecord<T>(value: T): T {
  if (!isRecord(value)) return value;
  const hasPriority = hasTaskPriorityFields(value);
  const hasRepeat =
    hasOwn(value, 'repeatRule') ||
    hasOwn(value, 'repeatSeriesId') ||
    hasOwn(value, 'repeatOccurrenceKey') ||
    hasOwn(value, 'postponedCount');
  if (!hasPriority && !hasRepeat) return value;

  const important = typeof value.important === 'boolean' ? value.important : false;
  const urgent = typeof value.urgent === 'boolean' ? value.urgent : false;
  const legacy = legacyPriorityCoordinates(important, urgent);
  const next: Record<string, unknown> = {...value};
  if (hasPriority) {
    next.prioritySchemaVersion = TASK_PRIORITY_SCHEMA_VERSION;
    next.importanceScore = normalizePriorityScore(
      value.importanceScore,
      legacy.importanceScore,
    );
    next.manualUrgencyScore = normalizePriorityScore(
      value.manualUrgencyScore,
      legacy.manualUrgencyScore,
    );
    next.urgencyMode =
      value.urgencyMode === 'hybrid' || value.urgencyMode === 'manual'
        ? value.urgencyMode
        : 'manual';
  }
  if (hasOwn(value, 'repeatRule')) {
    next.repeatRule = normalizeRepeatRule(value.repeatRule);
  }
  if (hasOwn(value, 'postponedCount')) {
    next.postponedCount =
      typeof value.postponedCount === 'number' &&
      Number.isSafeInteger(value.postponedCount) &&
      value.postponedCount >= 0
        ? value.postponedCount
        : 0;
  }
  return next as T;
}

export function normalizeTaskExtensionSnapshot<T>(value: T): T {
  if (!Array.isArray(value)) return value;
  return value.map(normalizeTaskExtensionRecord) as T;
}

export type MapNodeLayout = Readonly<{
  taskId: string;
  xPercent: number;
  yPercent: number;
}>;

function stableSignedUnit(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return ((hash >>> 0) / 4_294_967_295) * 2 - 1;
}

export function resolveMapNodeCollisions(
  points: readonly MapNodeLayout[],
): readonly MapNodeLayout[] {
  return points.map(point => ({
    taskId: point.taskId,
    xPercent: normalizePriorityScore(
      point.xPercent + stableSignedUnit(`${point.taskId}:collision-x`) * 5,
    ),
    yPercent: normalizePriorityScore(
      point.yPercent + stableSignedUnit(`${point.taskId}:collision-y`) * 5,
    ),
  }));
}

export function priorityExplanation(task: Task, nowInput: string): string {
  const coordinates = priorityCoordinatesForTask(task);
  const deadline = deriveDeadlineUrgencyScore(task.dueAt, nowInput);
  const effective = deriveEffectiveUrgencyScore(coordinates, deadline);
  if (coordinates.urgencyMode === 'manual') {
    return `当前位置由重要度 ${Math.round(coordinates.importanceScore)}、手动紧急度 ${Math.round(effective)} 决定。`;
  }
  if (deadline === null) {
    return `当前位置由重要度 ${Math.round(coordinates.importanceScore)}、手动紧急度 ${Math.round(effective)} 决定；当前没有截止时间。`;
  }
  return `当前位置由重要度 ${Math.round(coordinates.importanceScore)}、手动紧急度 ${Math.round(coordinates.manualUrgencyScore)} 和截止时间紧急度 ${Math.round(deadline)} 共同决定。`;
}
