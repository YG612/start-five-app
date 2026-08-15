import {
  flagsForQuadrant,
  projectTaskToQuadrantMap,
  quadrantForMapDrop,
  QUADRANT_HOME_META,
  QUADRANT_LIST_ORDER,
  QUADRANT_MAP_ROWS,
  selectVisibleQuadrantTasks,
} from '../../src/domain/quadrantHome';
import {createTask} from '../../src/domain/task';

const NOW = '2026-08-14T08:00:00.000Z';

describe('quadrant home product baseline', () => {
  it('locks the map to left/right importance and top/bottom urgency', () => {
    expect(QUADRANT_MAP_ROWS).toEqual([
      ['Q3', 'Q1'],
      ['Q4', 'Q2'],
    ]);
    expect(QUADRANT_HOME_META.Q1).toMatchObject({
      title: '救火区',
      description: '重要且紧急',
      mapRow: 0,
      mapColumn: 1,
    });
    expect(QUADRANT_HOME_META.Q2).toMatchObject({
      title: '成长区',
      description: '重要但不紧急',
      mapRow: 1,
      mapColumn: 1,
    });
    expect(QUADRANT_HOME_META.Q3).toMatchObject({
      title: '干扰区',
      description: '不重要但紧急',
      mapRow: 0,
      mapColumn: 0,
    });
    expect(QUADRANT_HOME_META.Q4).toMatchObject({
      title: '清理区',
      description: '不重要且不紧急',
      mapRow: 1,
      mapColumn: 0,
    });
    expect(QUADRANT_LIST_ORDER).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
  });

  it.each([
    ['Q1', true, true],
    ['Q2', true, false],
    ['Q3', false, true],
    ['Q4', false, false],
  ] as const)('adapts %s to the existing binary task schema', (quadrant, important, urgent) => {
    expect(flagsForQuadrant(quadrant)).toEqual({important, urgent});
  });

  it('uses deterministic in-quadrant points and reverses screen Y', () => {
    const fire = createTask(
      {title: '处理线上故障', important: true, urgent: true},
      {id: 'fire-task', now: NOW},
    );
    const growth = createTask(
      {title: '准备下周答辩', important: true, urgent: false},
      {id: 'growth-task', now: NOW},
    );
    const first = projectTaskToQuadrantMap(fire);
    const repeated = projectTaskToQuadrantMap(fire);
    const lower = projectTaskToQuadrantMap(growth);

    expect(repeated).toEqual(first);
    expect(first.quadrant).toBe('Q1');
    expect(first.importanceScore).toBeGreaterThanOrEqual(50);
    expect(first.urgencyScore).toBeGreaterThanOrEqual(50);
    expect(first.yPercent).toBeLessThan(50);
    expect(lower.quadrant).toBe('Q2');
    expect(lower.importanceScore).toBeGreaterThanOrEqual(50);
    expect(lower.urgencyScore).toBeLessThan(50);
    expect(lower.yPercent).toBeGreaterThan(50);
  });

  it('maps long-press drop positions to the four fixed quadrants', () => {
    const bounds = {left: 10, top: 20, width: 200, height: 300};
    expect(quadrantForMapDrop(190, 40, bounds)).toBe('Q1');
    expect(quadrantForMapDrop(190, 300, bounds)).toBe('Q2');
    expect(quadrantForMapDrop(30, 40, bounds)).toBe('Q3');
    expect(quadrantForMapDrop(30, 300, bounds)).toBe('Q4');
  });

  it('keeps selected and recommended tasks visible before deterministic aggregation', () => {
    const tasks = Array.from({length: 8}, (_, index) => createTask(
      {title: `任务 ${index}`, important: true, urgent: false},
      {id: `task-${index}`, now: new Date(Date.parse(NOW) + index).toISOString()},
    ));
    const visible = selectVisibleQuadrantTasks(tasks, 'task-0', 'task-1');
    expect(visible).toHaveLength(6);
    expect(visible.map(task => task.id).slice(0, 2)).toEqual(['task-0', 'task-1']);
  });
});
