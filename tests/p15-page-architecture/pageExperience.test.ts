import {APP_PAGE_TOKENS} from '../../src/components/AppPage';
import {
  formatAgendaTime,
  formatPageDate,
  selectFocusAgenda,
  selectGrowthPageSummary,
  selectTodayFocusAgenda,
} from '../../src/domain/pageExperience';
import {createTask, type Task} from '../../src/domain/task';
import type {FocusSession} from '../../src/domain/focusSession';

const NOW = '2026-08-16T08:00:00.000Z';

function task(id: string, important = true): Task {
  return createTask({
    title: `任务 ${id}`,
    important,
    urgent: false,
    dueAt: null,
  }, {id, now: NOW});
}

function focus(id: string, taskId: string, startedAt: string, actualSeconds: number): FocusSession {
  return {
    id,
    taskId,
    plannedMinutes: 25,
    status: 'completed',
    startedAt,
    plannedEndAt: new Date(Date.parse(startedAt) + 25 * 60_000).toISOString(),
    endedAt: new Date(Date.parse(startedAt) + actualSeconds * 1_000).toISOString(),
    actualSeconds,
    interruptionReason: null,
    createdAt: startedAt,
    updatedAt: startedAt,
  };
}

describe('P15 page experience selectors', () => {
  it('sorts existing planned work and limits today to three without creating a schedule model', () => {
    const source = task('agenda');
    const planned = [4, 1, 3, 2].map(hour => ({
      id: `plan-${hour}`,
      taskId: source.id,
      plannedStartAt: `2026-08-16T${String(8 + hour).padStart(2, '0')}:00:00.000Z`,
      plannedMinutes: 25 as const,
      status: 'PLANNED' as const,
      createdAt: NOW,
    }));
    const withPlans = {...source, plannedWorkSessions: planned};
    expect(selectFocusAgenda([withPlans]).map(item => item.session.id)).toEqual([
      'plan-1', 'plan-2', 'plan-3', 'plan-4',
    ]);
    expect(selectTodayFocusAgenda([withPlans], NOW)).toHaveLength(3);
  });

  it('keeps today and week summaries to three truthful unit-bearing metrics', () => {
    const growthTask = task('growth', true);
    const sessions = [
      focus('f1', growthTask.id, '2026-08-16T01:00:00.000Z', 300),
      focus('f2', growthTask.id, '2026-08-16T02:00:00.000Z', 600),
      focus('f3', growthTask.id, '2026-08-15T02:00:00.000Z', 900),
    ];
    const summary = selectGrowthPageSummary({tasks: [growthTask], sessions, now: NOW});
    expect(summary.today).toHaveLength(3);
    expect(summary.week).toHaveLength(3);
    expect(summary.hasWeeklySample).toBe(true);
    expect(summary.today.map(item => item.value).join(' ')).toMatch(/分钟/);
    expect(selectGrowthPageSummary({tasks: [], sessions: [], now: NOW}).hasWeeklySample).toBe(false);
  });

  it('provides complete non-empty light and dark semantic tokens', () => {
    for (const mode of [APP_PAGE_TOKENS.light, APP_PAGE_TOKENS.dark]) {
      expect(mode.background).toMatch(/^#[0-9A-F]{6}$/i);
      expect(mode.surface).toMatch(/^#[0-9A-F]{6}$/i);
      expect(mode.text).toMatch(/^#[0-9A-F]{6}$/i);
      expect(mode.primary).toMatch(/^#[0-9A-F]{6}$/i);
    }
    expect(APP_PAGE_TOKENS.light.background).not.toBe(APP_PAGE_TOKENS.dark.background);
  });

  it('formats page dates and agenda times for user-facing shells', () => {
    expect(formatPageDate(NOW)).toContain('8 月 16 日');
    expect(formatAgendaTime('2026-08-16T20:30:00')).toBe('20:30');
  });
});
