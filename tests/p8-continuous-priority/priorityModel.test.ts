import {createPersistentTaskStorage, TASK_STORAGE_KEY} from '../../src/data/persistentTaskStorage';
import {awardCompletionScore} from '../../src/domain/scoring';
import type {Task} from '../../src/domain/task';
import {
  deriveDeadlineUrgencyScore,
  deriveEffectiveUrgencyScore,
  deriveQuadrantFromPriority,
  effectiveQuadrantForTask,
  normalizePriorityScore,
  priorityCoordinatesForTask,
  resolveMapNodeCollisions,
  scoresForMapDrop,
  type TaskWithPriority,
} from '../../src/domain/taskPriority';

const NOW = '2026-08-14T08:00:00.000Z';

function task(overrides: Partial<TaskWithPriority> = {}): TaskWithPriority {
  return {
    id: 'p8-task',
    title: '推进连续优先级',
    description: '',
    important: true,
    urgent: false,
    status: 'pending',
    startAt: null,
    dueAt: null,
    createdAt: '2026-08-14T07:00:00.000Z',
    updatedAt: '2026-08-14T07:00:00.000Z',
    startedAt: null,
    completedAt: null,
    deletedAt: null,
    score: null,
    scoreAwardedAt: null,
    subtasks: [],
    ...overrides,
  };
}

describe('P8-01 continuous priority and tolerant migration', () => {
  it('normalizes strings, non-finite values, negatives, and values above 100', () => {
    expect(normalizePriorityScore('49')).toBe(49);
    expect(normalizePriorityScore(Number.NaN, 25)).toBe(25);
    expect(normalizePriorityScore(Number.POSITIVE_INFINITY, 80)).toBe(80);
    expect(normalizePriorityScore(-1)).toBe(0);
    expect(normalizePriorityScore(101)).toBe(100);
  });

  it.each([
    [0, 0, 'Q4'],
    [49, 49, 'Q4'],
    [50, 49, 'Q2'],
    [49, 50, 'Q3'],
    [50, 50, 'Q1'],
    [51, 51, 'Q1'],
    [100, 100, 'Q1'],
  ] as const)('maps boundary (%s,%s) to %s', (importance, urgency, quadrant) => {
    expect(deriveQuadrantFromPriority(importance, urgency)).toBe(quadrant);
  });

  it('interprets all four legacy quadrants as manual and never lets a deadline move them', () => {
    const cases = [
      task({important: true, urgent: true, dueAt: '2026-08-01T00:00:00.000Z'}),
      task({important: true, urgent: false, dueAt: '2026-08-01T00:00:00.000Z'}),
      task({important: false, urgent: true, dueAt: '2026-08-01T00:00:00.000Z'}),
      task({important: false, urgent: false, dueAt: '2026-08-01T00:00:00.000Z'}),
    ];
    expect(cases.map(item => priorityCoordinatesForTask(item))).toEqual([
      {importanceScore: 80, manualUrgencyScore: 80, urgencyMode: 'manual'},
      {importanceScore: 80, manualUrgencyScore: 25, urgencyMode: 'manual'},
      {importanceScore: 25, manualUrgencyScore: 80, urgencyMode: 'manual'},
      {importanceScore: 25, manualUrgencyScore: 25, urgencyMode: 'manual'},
    ]);
    expect(cases.map(item => effectiveQuadrantForTask(item, NOW))).toEqual([
      'Q1', 'Q2', 'Q3', 'Q4',
    ]);
  });

  it('persists screen coordinates with inverted Y and reads them back after restart', async () => {
    const scores = scoresForMapDrop(75, 20, {left: 0, top: 0, width: 100, height: 100});
    expect(scores).toEqual({importanceScore: 75, manualUrgencyScore: 80});
    const backend = new Map<string, string>();
    const adapter = {
      getItem: async (key: string) => backend.get(key) ?? null,
      setItem: async (key: string, value: string) => { backend.set(key, value); },
      removeItem: async (key: string) => { backend.delete(key); },
    };
    const first = createPersistentTaskStorage(adapter);
    await first.setItem(TASK_STORAGE_KEY, JSON.stringify([
      task({
        prioritySchemaVersion: 1,
        importanceScore: scores.importanceScore,
        manualUrgencyScore: scores.manualUrgencyScore,
        urgencyMode: 'manual',
      }),
    ]));
    const second = createPersistentTaskStorage(adapter);
    const restored = JSON.parse((await second.getItem(TASK_STORAGE_KEY)) ?? '[]') as Task[];
    expect(priorityCoordinatesForTask(restored[0] as Task)).toEqual({
      importanceScore: 75,
      manualUrgencyScore: 80,
      urgencyMode: 'manual',
    });
  });

  it('normalizes one malformed P8 record without changing an adjacent legacy record', async () => {
    const legacy = task({id: 'legacy'});
    const malformed = {
      ...task({id: 'malformed'}),
      prioritySchemaVersion: 99,
      importanceScore: '120',
      manualUrgencyScore: '-8',
      urgencyMode: 'unexpected',
    };
    const raw = JSON.stringify({schema: 'start-five.tasks', version: 1, tasks: [legacy, malformed]});
    const adapter = {
      getItem: async () => raw,
      setItem: async () => undefined,
      removeItem: async () => undefined,
    };
    const parsed = JSON.parse(
      (await createPersistentTaskStorage(adapter).getItem(TASK_STORAGE_KEY)) ?? '[]',
    ) as Array<Record<string, unknown>>;
    expect(parsed[0]).not.toHaveProperty('prioritySchemaVersion');
    expect(parsed[1]).toMatchObject({
      prioritySchemaVersion: 1,
      importanceScore: 100,
      manualUrgencyScore: 0,
      urgencyMode: 'manual',
    });
  });
});

describe('P8-02 deadline urgency, collision, and completion scoring', () => {
  it.each([
    [-1, 100],
    [6, 95],
    [24, 85],
    [72, 70],
    [168, 55],
    [336, 40],
    [337, 20],
  ] as const)('maps %s remaining hours to %s', (hours, expected) => {
    const due = new Date(Date.parse(NOW) + hours * 3_600_000).toISOString();
    expect(deriveDeadlineUrgencyScore(due, NOW)).toBe(expected);
  });

  it('keeps manual urgency and takes max(manual, deadline) in hybrid mode', () => {
    expect(deriveEffectiveUrgencyScore({importanceScore: 80, manualUrgencyScore: 25, urgencyMode: 'manual'}, 95)).toBe(25);
    expect(deriveEffectiveUrgencyScore({importanceScore: 80, manualUrgencyScore: 25, urgencyMode: 'hybrid'}, 95)).toBe(95);
    expect(deriveEffectiveUrgencyScore({importanceScore: 80, manualUrgencyScore: 90, urgencyMode: 'hybrid'}, 55)).toBe(90);
  });

  it('keeps deterministic visual collision offsets within five points', () => {
    const input = [
      {taskId: 'a', xPercent: 50, yPercent: 50},
      {taskId: 'b', xPercent: 50, yPercent: 50},
    ];
    const first = resolveMapNodeCollisions(input);
    expect(resolveMapNodeCollisions(input)).toEqual(first);
    for (const point of first) {
      expect(Math.abs(point.xPercent - 50)).toBeLessThanOrEqual(5);
      expect(Math.abs(point.yPercent - 50)).toBeLessThanOrEqual(5);
    }
  });

  it('scores from effective quadrant at completion while Q2 remains worth more than Q1', () => {
    const completed = task({
      status: 'completed',
      startedAt: '2026-08-14T07:30:00.000Z',
      completedAt: NOW,
      updatedAt: NOW,
      dueAt: '2026-08-14T09:00:00.000Z',
      prioritySchemaVersion: 1,
      importanceScore: 80,
      manualUrgencyScore: 25,
      urgencyMode: 'hybrid',
    });
    expect(awardCompletionScore(completed, NOW).points).toBe(35);
    expect(awardCompletionScore({...completed, dueAt: null}, NOW).points).toBe(45);
  });
});
