import type {
  Quadrant,
  TaskQuadrantBucket,
  TaskQuadrantProjection,
} from './quadrant';
import type {Task} from './task';
import {
  deriveEffectiveUrgencyScore,
  deriveQuadrantFromPriority,
  effectiveUrgencyForTask,
  priorityCoordinatesForTask,
  scoresForMapDrop,
} from './taskPriority';

export type QuadrantHomeMeta = Readonly<{
  title: string;
  description: string;
  important: boolean;
  urgent: boolean;
  mapRow: 0 | 1;
  mapColumn: 0 | 1;
  listOrder: number;
  accent: string;
  tint: string;
}>;

export const QUADRANT_HOME_META: Readonly<Record<Quadrant, QuadrantHomeMeta>> = {
  Q1: {
    title: '救火区',
    description: '重要且紧急',
    important: true,
    urgent: true,
    mapRow: 0,
    mapColumn: 1,
    listOrder: 0,
    accent: '#C9503D',
    tint: '#FBECE8',
  },
  Q2: {
    title: '成长区',
    description: '重要但不紧急',
    important: true,
    urgent: false,
    mapRow: 1,
    mapColumn: 1,
    listOrder: 1,
    accent: '#247A6B',
    tint: '#E5F2EE',
  },
  Q3: {
    title: '干扰区',
    description: '不重要但紧急',
    important: false,
    urgent: true,
    mapRow: 0,
    mapColumn: 0,
    listOrder: 2,
    accent: '#B46A1F',
    tint: '#FBF0E2',
  },
  Q4: {
    title: '清理区',
    description: '不重要且不紧急',
    important: false,
    urgent: false,
    mapRow: 1,
    mapColumn: 0,
    listOrder: 3,
    accent: '#64748B',
    tint: '#EDF1F5',
  },
};

export const QUADRANT_MAP_ROWS = [
  ['Q3', 'Q1'],
  ['Q4', 'Q2'],
] as const satisfies readonly (readonly Quadrant[])[];

export const QUADRANT_LIST_ORDER = ['Q1', 'Q2', 'Q3', 'Q4'] as const;

export const QUADRANT_NODE_SLOTS = [
  {left: 7, top: 23},
  {left: 51, top: 23},
  {left: 7, top: 48},
  {left: 51, top: 48},
  {left: 7, top: 72},
  {left: 51, top: 72},
] as const;

export function selectVisibleQuadrantTasks(
  tasks: readonly Task[],
  selectedId: string | null,
  recommendedId: string | null,
): readonly Task[] {
  const ordered = [...tasks].sort((left, right) => {
    const leftRank = left.id === selectedId ? 0 : left.id === recommendedId ? 1 : 2;
    const rightRank = right.id === selectedId ? 0 : right.id === recommendedId ? 1 : 2;
    if (leftRank !== rightRank) return leftRank - rightRank;
    if (left.updatedAt !== right.updatedAt) return left.updatedAt > right.updatedAt ? -1 : 1;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
  return ordered.slice(0, QUADRANT_NODE_SLOTS.length);
}

export function quadrantForMapDrop(
  x: number,
  y: number,
  bounds: Readonly<{left: number; top: number; width: number; height: number}>,
): Quadrant {
  const scores = scoresForMapDrop(x, y, bounds);
  return deriveQuadrantFromPriority(
    scores.importanceScore,
    scores.manualUrgencyScore,
  );
}

export function flagsForQuadrant(quadrant: Quadrant): Readonly<{
  important: boolean;
  urgent: boolean;
}> {
  const meta = QUADRANT_HOME_META[quadrant];
  return {important: meta.important, urgent: meta.urgent};
}

export function orderQuadrantBuckets(
  projection: TaskQuadrantProjection,
): readonly TaskQuadrantBucket<Quadrant>[] {
  return QUADRANT_LIST_ORDER.map(quadrant => {
    const bucket = projection.find(candidate => candidate.quadrant === quadrant);
    if (bucket === undefined) {
      throw new Error(`QUADRANT_BUCKET_MISSING:${quadrant}`);
    }
    return bucket;
  });
}

export type QuadrantMapPoint = Readonly<{
  quadrant: Quadrant;
  importanceScore: number;
  urgencyScore: number;
  xPercent: number;
  yPercent: number;
  estimatedSize: 'small' | 'medium' | 'large';
  progress: 0 | 25 | 50 | 75 | 100;
  hasDeadline: boolean;
}>;

export function projectTaskToQuadrantMap(
  task: Task,
  nowInput?: string,
): QuadrantMapPoint {
  const coordinates = priorityCoordinatesForTask(task);
  const urgencyScore = nowInput === undefined
    ? deriveEffectiveUrgencyScore(coordinates, null)
    : effectiveUrgencyForTask(task, nowInput);
  const importanceScore = coordinates.importanceScore;
  const quadrant = deriveQuadrantFromPriority(importanceScore, urgencyScore);
  const estimatedMinutes = task.estimatedMinutes ?? 30;
  const storedProgress = (task as Task & {progress?: 0 | 25 | 50 | 75 | 100}).progress;
  return {
    quadrant,
    importanceScore,
    urgencyScore,
    xPercent: importanceScore,
    yPercent: 100 - urgencyScore,
    estimatedSize:
      estimatedMinutes <= 15
        ? 'small'
        : estimatedMinutes <= 60
          ? 'medium'
          : 'large',
    progress: storedProgress ?? (task.status === 'in_progress' ? 25 : 0),
    hasDeadline: task.dueAt !== null,
  };
}
