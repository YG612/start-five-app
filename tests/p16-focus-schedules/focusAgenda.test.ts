import {selectFocusAgendaWithMeta} from '../../src/domain/pageExperience';
import {createFocusSchedule, type FocusScheduleOccurrence} from '../../src/domain/focusSchedule';
import {createTask, type Task} from '../../src/domain/task';
import type {FocusSession} from '../../src/domain/focusSession';

const NOW = '2026-08-16T08:00:00.000Z';

function task(id: string): Task {
  return createTask({title: `Task ${id}`, important: true, urgent: false, dueAt: null}, {id, now: NOW});
}

function occurrence(taskId: string, at: string): FocusScheduleOccurrence {
  const schedule = createFocusSchedule({
    id: `schedule-${at}`, now: NOW,
    draft: {
      target: {kind: 'TASK', taskId}, durationMinutes: 25,
      recurrence: {kind: 'ONCE', startsAt: at},
      protectionLevel: 'REMINDER_ONLY',
    },
  });
  return {schedule, localDateKey: at.slice(0, 10), plannedStartAt: at, event: null};
}

describe('P16 unified focus agenda', () => {
  it('orders active first and deduplicates four sources within five minutes', () => {
    const base = task('same');
    const planned = {
      id: 'plan', taskId: base.id, plannedStartAt: '2026-08-16T10:00:00.000Z',
      plannedMinutes: 25 as const, status: 'PLANNED' as const, createdAt: NOW,
    };
    const withSources = {
      ...base,
      plannedWorkSessions: [planned],
      nextStartAt: '2026-08-16T10:04:00.000Z',
      supportSchemaVersion: 1 as const,
    };
    const other = task('active');
    const active: FocusSession = {
      id: 'focus', taskId: other.id, plannedMinutes: 5, status: 'running',
      startedAt: NOW, plannedEndAt: '2026-08-16T08:05:00.000Z', endedAt: null,
      actualSeconds: null, interruptionReason: null, createdAt: NOW, updatedAt: NOW,
    };
    const result = selectFocusAgendaWithMeta({
      tasks: [withSources, other], sessions: [active],
      scheduleOccurrences: [occurrence(base.id, '2026-08-16T10:05:00.000Z')], now: NOW,
    });
    expect(result.items[0]).toMatchObject({source: 'ACTIVE_FOCUS', taskId: other.id});
    expect(result.items.filter(item => item.taskId === base.id)).toHaveLength(1);
    expect(result.items.find(item => item.taskId === base.id)?.source).toBe('TASK_PLAN');
    expect(result.mergedConflict).toBe(true);
  });

  it('keeps the six-minute boundary and sorts across midnight', () => {
    const base = task('boundary');
    const withPlan = {
      ...base,
      plannedWorkSessions: [{
        id: 'late', taskId: base.id, plannedStartAt: '2026-08-16T23:59:00.000Z',
        plannedMinutes: 15 as const, status: 'PLANNED' as const, createdAt: NOW,
      }],
    };
    const result = selectFocusAgendaWithMeta({
      tasks: [withPlan], sessions: [],
      scheduleOccurrences: [occurrence(base.id, '2026-08-17T00:05:00.000Z')], now: NOW,
    });
    expect(result.items).toHaveLength(2);
    expect(result.items.map(item => item.plannedStartAt)).toEqual([
      '2026-08-16T23:59:00.000Z', '2026-08-17T00:05:00.000Z',
    ]);
    expect(result.mergedConflict).toBe(false);
  });
});
