import {resolveNextStartShortcut} from '../../src/application/nextStartScheduling';
import {deriveReminderPlan} from '../../src/application/reminderScheduling';
import {makeTask} from '../locked/fixtures/taskFactory';

const NOW = '2026-08-14T08:00:00.000Z';

describe('P9-04 next start scheduling', () => {
  it('keeps ten-minutes, tomorrow, this-week, and custom shortcuts separate from deadline', () => {
    expect(resolveNextStartShortcut({shortcut: 'ten_minutes', now: NOW}))
      .toBe('2026-08-14T08:10:00.000Z');
    const tomorrow = new Date(resolveNextStartShortcut({shortcut: 'tomorrow', now: NOW}) ?? '');
    const today = new Date(NOW);
    expect(tomorrow.getFullYear()).toBe(today.getFullYear());
    expect(tomorrow.getMonth()).toBe(today.getMonth());
    expect(tomorrow.getDate()).toBe(today.getDate() + 1);
    expect(tomorrow.getHours()).toBe(9);
    expect(Date.parse(resolveNextStartShortcut({shortcut: 'this_week', now: NOW}) ?? ''))
      .toBeGreaterThan(Date.parse(NOW));
    expect(resolveNextStartShortcut({
      shortcut: 'custom', now: NOW, customAt: '2026-08-14T12:00:00.000Z',
    })).toBe('2026-08-14T12:00:00.000Z');
  });

  it('uses the existing wall-clock seam for a DST calendar day', () => {
    const calls: Array<Record<string, unknown>> = [];
    const result = resolveNextStartShortcut({
      shortcut: 'tomorrow',
      now: '2026-03-07T17:00:00.000Z',
      currentTimeZone: () => 'America/New_York',
      resolveLocalTrigger(input) {
        calls.push(input);
        return '2026-03-08T13:00:00.000Z';
      },
    });
    expect(result).toBe('2026-03-08T13:00:00.000Z');
    expect(calls).toEqual([expect.objectContaining({
      closureDayKey: '2026-03-08', wallClockTime: '09:00', timeZone: 'America/New_York',
    })]);
  });

  it('anchors start reminders to nextStartAt before the legacy scheduled start', () => {
    const task = Object.assign(makeTask({
      startAt: '2026-08-14T10:00:00.000Z',
      scheduledStartAt: '2026-08-14T10:00:00.000Z',
      dueAt: '2026-08-14T18:00:00.000Z',
    }), {
      supportSchemaVersion: 1 as const,
      nextStartAt: '2026-08-14T11:00:00.000Z',
    });
    expect(deriveReminderPlan({
      task,
      now: NOW,
      timeZone: 'Asia/Shanghai',
      progressRatio: 0,
      rules: [{id: 'start', kind: 'start', anchor: 'scheduled_start', offsetMinutes: 0, progressBelow: null}],
    })).toEqual([expect.objectContaining({triggerAt: '2026-08-14T11:00:00.000Z'})]);
    expect(task.dueAt).toBe('2026-08-14T18:00:00.000Z');
  });
});
