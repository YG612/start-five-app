import type {FocusSession} from '../../src/domain/focusSession';
import {selectSemanticGrowthSummary} from '../../src/domain/semanticGrowth';
import {makeTask} from '../locked/fixtures/taskFactory';

function focus(input: Readonly<{
  id: string;
  taskId: string;
  startedAt: string;
  actualSeconds: number;
  quadrant?: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  legacy?: boolean;
}>): FocusSession {
  const endedAt = new Date(Date.parse(input.startedAt) + input.actualSeconds * 1_000).toISOString();
  return {
    id: input.id,
    taskId: input.taskId,
    plannedMinutes: 25,
    status: 'completed',
    startedAt: input.startedAt,
    plannedEndAt: new Date(Date.parse(input.startedAt) + 25 * 60_000).toISOString(),
    endedAt,
    actualSeconds: input.actualSeconds,
    interruptionReason: null,
    createdAt: input.startedAt,
    updatedAt: endedAt,
    ...(input.legacy ? {} : {
      snapshot: {
        taskId: input.taskId,
        quadrantAtStart: input.quadrant ?? 'Q2',
        importanceScoreAtStart: input.quadrant === 'Q4' ? 20 : 80,
        effectiveUrgencyAtStart: input.quadrant === 'Q1' ? 80 : 20,
        dueAtAtStart: '2026-08-20T12:00:00.000Z',
      },
    }),
  };
}

describe('P17 semantic growth metrics and proactive-start streak', () => {
  it('uses the inclusive 120-second boundary and counts a task first start once', () => {
    const task = makeTask({id: 'important', important: true, urgent: false});
    const summary = selectSemanticGrowthSummary({
      tasks: [task],
      sessions: [
        focus({id: 'tap', taskId: task.id, startedAt: '2026-08-16T07:00:00.000Z', actualSeconds: 119}),
        focus({id: 'first', taskId: task.id, startedAt: '2026-08-16T08:00:00.000Z', actualSeconds: 120}),
        focus({id: 'again', taskId: task.id, startedAt: '2026-08-16T09:00:00.000Z', actualSeconds: 300}),
      ],
      now: '2026-08-16T12:00:00.000Z',
      timeZone: 'UTC',
    });
    expect(summary.today.map(metric => [metric.id, metric.value])).toEqual([
      ['focus_minutes', 7],
      ['proactive_starts', 1],
      ['growth_minutes', 7],
    ]);
    expect(summary.streak.currentDays).toBe(1);
  });

  it('keeps the start snapshot after the task current quadrant changes', () => {
    const movedToFirefighting = makeTask({
      id: 'moved', important: true, urgent: true,
    });
    const summary = selectSemanticGrowthSummary({
      tasks: [movedToFirefighting],
      sessions: [focus({
        id: 'historical-growth',
        taskId: movedToFirefighting.id,
        startedAt: '2026-08-16T08:00:00.000Z',
        actualSeconds: 600,
        quadrant: 'Q2',
      })],
      now: '2026-08-16T12:00:00.000Z',
    });
    expect(summary.today.find(metric => metric.id === 'growth_minutes')?.value).toBe(10);
    expect(summary.quality).toBe('EXACT');
  });

  it('uses the user local day across UTC midnight and reports legacy quality honestly', () => {
    const task = makeTask({id: 'timezone', important: true, urgent: false});
    const exact = selectSemanticGrowthSummary({
      tasks: [task],
      sessions: [focus({
        id: 'local-next-day', taskId: task.id,
        startedAt: '2026-08-16T16:05:00.000Z', actualSeconds: 120,
      })],
      now: '2026-08-16T16:30:00.000Z',
      timeZone: 'Asia/Shanghai',
    });
    expect(exact.today[0]?.value).toBe(2);

    const estimated = selectSemanticGrowthSummary({
      tasks: [task],
      sessions: [focus({
        id: 'legacy', taskId: task.id,
        startedAt: '2026-08-16T08:00:00.000Z', actualSeconds: 120, legacy: true,
      })],
      now: '2026-08-16T12:00:00.000Z',
    });
    expect(estimated.quality).toBe('ESTIMATED');
  });

  it('rewards starting on consecutive local days and uses gentle missed-day copy data', () => {
    const task = makeTask({id: 'streak', important: true, urgent: false});
    const sessions = ['13', '14', '15'].map(day => focus({
      id: `day-${day}`,
      taskId: task.id,
      startedAt: `2026-08-${day}T08:00:00.000Z`,
      actualSeconds: 120,
    }));
    const active = selectSemanticGrowthSummary({
      tasks: [task], sessions, now: '2026-08-15T12:00:00.000Z',
    });
    expect(active.streak).toMatchObject({currentDays: 3, activeDaysThisWeek: 3});
    const missed = selectSemanticGrowthSummary({
      tasks: [task], sessions, now: '2026-08-16T12:00:00.000Z',
    });
    expect(missed.streak).toMatchObject({currentDays: 0, previousBestDays: 3});
  });
});
