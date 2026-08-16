import {createFocusScheduleService} from '../../src/application/focusScheduleService';
import {
  FOCUS_SCHEDULE_STORAGE_KEY,
  createFocusScheduleRepository,
} from '../../src/data/focusScheduleRepository';
import {
  createFocusSchedule,
  nextFocusScheduleOccurrence,
} from '../../src/domain/focusSchedule';
import type {
  ReminderPermission,
  ReminderReplaceRequest,
  ReminderScheduleSnapshot,
} from '../../src/application/reminderScheduling';
import {WorkspaceBackend} from '../gap-p0-06r1/gapP006TestKit';

const NOW = '2026-03-07T12:00:00.000Z';
const resolveUtc = (input: Readonly<{localDateKey: string; localTime: string}>) =>
  `${input.localDateKey}T${input.localTime}:00.000Z`;

class ScheduleNotifications {
  readonly snapshots = new Map<string, ReminderScheduleSnapshot>();
  readonly replacements: ReminderReplaceRequest[] = [];
  permission: ReminderPermission = 'granted';

  async getPermission(): Promise<ReminderPermission> { return this.permission; }
  async get(taskId: string): Promise<ReminderScheduleSnapshot | null> {
    return this.snapshots.get(taskId) ?? null;
  }
  async replace(request: ReminderReplaceRequest): Promise<void> {
    this.replacements.push(request);
    this.snapshots.set(request.next.taskId, request.next);
  }
}

describe('P16 focus schedule model and persistence', () => {
  it('normalizes weekly recurrence without pre-generating occurrences', () => {
    const schedule = createFocusSchedule({
      id: 'weekly',
      now: NOW,
      draft: {
        target: {kind: 'QUADRANT', quadrant: 'Q2'},
        durationMinutes: 25,
        recurrence: {
          kind: 'WEEKLY',
          weekdays: [5, 1, 1, 3],
          localTime: '20:30',
          timezone: 'UTC',
        },
        protectionLevel: 'REDUCE_DISTRACTIONS',
      },
    });
    expect(schedule.recurrence).toEqual({
      kind: 'WEEKLY', weekdays: [1, 3, 5], localTime: '20:30', timezone: 'UTC',
    });
    expect(schedule).not.toHaveProperty('occurrences');
  });

  it('keeps local wall-clock time across a simulated DST offset change', () => {
    const schedule = createFocusSchedule({
      id: 'daily-dst',
      now: NOW,
      draft: {
        target: {kind: 'AUTO'},
        durationMinutes: 25,
        recurrence: {kind: 'DAILY', localTime: '08:30', timezone: 'America/New_York'},
        protectionLevel: 'REMINDER_ONLY',
      },
    });
    const resolver = (input: Readonly<{localDateKey: string; localTime: string}>) => {
      const offsetHours = input.localDateKey < '2026-03-08' ? 5 : 4;
      return new Date(`${input.localDateKey}T${input.localTime}:00.000Z`).getTime() === 0
        ? ''
        : new Date(Date.parse(`${input.localDateKey}T${input.localTime}:00.000Z`) + offsetHours * 3_600_000).toISOString();
    };
    const before = nextFocusScheduleOccurrence({
      schedule, now: '2026-03-07T12:00:00.000Z', resolveLocalTrigger: resolver,
    });
    const after = nextFocusScheduleOccurrence({
      schedule, now: '2026-03-08T11:00:00.000Z', resolveLocalTrigger: resolver,
    });
    expect(before?.plannedStartAt).toBe('2026-03-07T13:30:00.000Z');
    expect(after?.plannedStartAt).toBe('2026-03-08T12:30:00.000Z');
  });

  it('uses the current local date for a one-time instant that crosses UTC midnight', () => {
    const schedule = createFocusSchedule({
      id: 'once-midnight',
      now: '2026-03-07T18:00:00.000Z',
      draft: {
        target: {kind: 'AUTO'},
        durationMinutes: 25,
        recurrence: {kind: 'ONCE', startsAt: '2026-03-07T20:30:00.000Z'},
        protectionLevel: 'REMINDER_ONLY',
      },
    });
    expect(nextFocusScheduleOccurrence({
      schedule,
      now: '2026-03-07T18:00:00.000Z',
      currentTimeZone: 'Asia/Shanghai',
      resolveLocalTrigger: resolveUtc,
    })?.localDateKey).toBe('2026-03-08');
  });

  it('uses schema version 2 and isolates one bad record', async () => {
    const backend = new WorkspaceBackend();
    const repository = createFocusScheduleRepository(backend);
    const good = createFocusSchedule({
      id: 'good', now: NOW,
      draft: {
        target: {kind: 'AUTO'}, durationMinutes: 15,
        recurrence: {kind: 'DAILY', localTime: '20:30', timezone: 'UTC'},
        protectionLevel: 'REMINDER_ONLY',
      },
    });
    await repository.saveSchedule(good);
    const raw = JSON.parse((await backend.getItem(FOCUS_SCHEDULE_STORAGE_KEY))!) as {version: number; schedules: unknown[]};
    expect(raw.version).toBe(2);
    raw.schedules.push({id: 'bad', durationMinutes: 999});
    await backend.setItem(FOCUS_SCHEDULE_STORAGE_KEY, JSON.stringify(raw));
    await expect(createFocusScheduleRepository(backend).listSchedules()).resolves.toEqual([good]);
  });

  it('schedules only the next explicit reminder and keeps event actions idempotent', async () => {
    const backend = new WorkspaceBackend();
    const notifications = new ScheduleNotifications();
    const ids = ['schedule-1', 'event-start-1', 'event-start-2', 'event-skip'];
    let idIndex = 0;
    const service = createFocusScheduleService({
      repository: createFocusScheduleRepository(backend),
      now: () => NOW,
      idGenerator: () => ids[idIndex++] ?? `generated-${idIndex}`,
      currentTimeZone: () => 'UTC',
      resolveLocalTrigger: resolveUtc,
      notifications,
    });
    const schedule = await service.create({
      target: {kind: 'TASK', taskId: 'task-1'},
      durationMinutes: 25,
      recurrence: {kind: 'DAILY', localTime: '20:30', timezone: 'UTC'},
      protectionLevel: 'REMINDER_ONLY',
    }, {
      taskId: 'task-1',
      title: '修改论文',
      firstStep: '打开文档找到 2.1 节。',
    });
    const replacement = notifications.replacements.at(-1)!.next;
    expect(replacement.intents).toHaveLength(1);
    expect(replacement.intents[0]).toMatchObject({
      taskId: 'task-1',
      ruleId: 'focus-schedule:schedule-1:2026-03-07',
      triggerAt: '2026-03-07T20:30:00.000Z',
      notificationTitle: '留给“修改论文”25 分钟。',
      notificationBody: '现在不用全部完成，先打开文档找到 2.1 节。',
    });
    const started = await service.recordStarted({
      scheduleId: schedule.id,
      localDateKey: '2026-03-07',
      plannedStartAt: '2026-03-07T20:30:00.000Z',
      resolvedTaskId: 'task-1',
      focusSessionId: 'focus-1',
    });
    const duplicate = await service.recordStarted({
      scheduleId: schedule.id,
      localDateKey: '2026-03-07',
      plannedStartAt: '2026-03-07T20:30:00.000Z',
      resolvedTaskId: 'task-1',
      focusSessionId: 'focus-2',
    });
    expect(duplicate).toEqual(started);
    expect((await service.listEvents(schedule.id)).filter(event => event.type === 'STARTED')).toHaveLength(1);
  });

  it('disables a one-time schedule after skip without touching any task deadline', async () => {
    const backend = new WorkspaceBackend();
    let id = 0;
    const service = createFocusScheduleService({
      repository: createFocusScheduleRepository(backend),
      now: () => NOW,
      idGenerator: () => `once-${++id}`,
      currentTimeZone: () => 'UTC',
      resolveLocalTrigger: resolveUtc,
    });
    const schedule = await service.create({
      target: {kind: 'TASK', taskId: 'task-deadline-unchanged'},
      durationMinutes: 5,
      recurrence: {kind: 'ONCE', startsAt: '2026-03-07T20:30:00.000Z'},
      protectionLevel: 'REMINDER_ONLY',
    });
    await service.skip(schedule.id, '2026-03-07', '2026-03-07T20:30:00.000Z');
    expect((await service.list())[0]).toMatchObject({enabled: false});
    expect(backend.stableByteSnapshot()).not.toContain('dueAt');
  });
});
