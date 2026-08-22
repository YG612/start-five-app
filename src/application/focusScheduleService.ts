import type {ReminderPermission, ReminderScheduler} from './reminderScheduling';
import type {FocusScheduleRepository} from '../data/focusScheduleRepository';
import {
  addLocalDays,
  createFocusSchedule,
  createFocusScheduleEvent,
  focusScheduleOccurrenceOnDate,
  localDateKeyAt,
  nextFocusScheduleOccurrence,
  updateFocusSchedule,
  type FocusLocalTriggerResolver,
  type FocusSchedule,
  type FocusScheduleDraft,
  type FocusScheduleEvent,
  type FocusScheduleOccurrence,
} from '../domain/focusSchedule';

export type FocusScheduleNotificationPort = ReminderScheduler & Readonly<{
  getPermission(): Promise<ReminderPermission>;
}>;

export type FocusScheduleResolvedTask = Readonly<{
  taskId: string;
  title: string;
  firstStep: string;
}>;

type FocusScheduleResolvedTaskInput = string | FocusScheduleResolvedTask;

export type FocusScheduleService = Readonly<{
  list(): Promise<readonly FocusSchedule[]>;
  listEvents(scheduleId?: string): Promise<readonly FocusScheduleEvent[]>;
  create(draft: FocusScheduleDraft, resolvedTask?: FocusScheduleResolvedTaskInput): Promise<FocusSchedule>;
  update(id: string, patch: Partial<FocusScheduleDraft>, resolvedTask?: FocusScheduleResolvedTaskInput): Promise<FocusSchedule>;
  setEnabled(id: string, enabled: boolean, resolvedTask?: FocusScheduleResolvedTaskInput): Promise<FocusSchedule>;
  remove(id: string): Promise<boolean>;
  today(now?: string): Promise<readonly FocusScheduleOccurrence[]>;
  next(now?: string): Promise<FocusScheduleOccurrence | null>;
  getOccurrence(scheduleId: string, localDateKey: string): Promise<FocusScheduleOccurrence | null>;
  getStartedEvent(scheduleId: string, localDateKey: string): Promise<FocusScheduleEvent | null>;
  recordStarted(input: Readonly<{
    scheduleId: string;
    localDateKey: string;
    plannedStartAt: string;
    resolvedTaskId: string;
    focusSessionId: string;
  }>): Promise<FocusScheduleEvent>;
  recordCompleted(scheduleId: string, localDateKey: string, plannedStartAt: string): Promise<FocusScheduleEvent>;
  skip(scheduleId: string, localDateKey: string, plannedStartAt: string): Promise<FocusScheduleEvent>;
  reschedule(scheduleId: string, localDateKey: string, plannedStartAt: string, rescheduledTo: string): Promise<FocusScheduleEvent>;
  consecutiveSkipCount(scheduleId: string): Promise<number>;
  reconcile(schedule: FocusSchedule, resolvedTask?: FocusScheduleResolvedTaskInput): Promise<void>;
}>;

function cloneSchedule(schedule: FocusSchedule): FocusSchedule {
  return {...schedule, target: {...schedule.target}, recurrence: schedule.recurrence.kind === 'WEEKLY'
    ? {...schedule.recurrence, weekdays: [...schedule.recurrence.weekdays]}
    : {...schedule.recurrence}};
}

export function createFocusScheduleService(options: Readonly<{
  repository: FocusScheduleRepository;
  now(): string;
  idGenerator(): string;
  currentTimeZone(): string;
  resolveLocalTrigger: FocusLocalTriggerResolver;
  notifications?: FocusScheduleNotificationPort;
}>): FocusScheduleService {
  const inFlightStarts = new Map<string, Promise<FocusScheduleEvent>>();

  function reconcileAfterDurableCommit(
    schedule: FocusSchedule,
    resolvedTask?: FocusScheduleResolvedTaskInput,
  ): void {
    // Notification delivery is recoverable and is reconciled again on restore.
    // It must not turn an already-durable schedule mutation into a failed save.
    void reconcile(schedule, resolvedTask).catch(() => undefined);
  }

  async function requireSchedule(id: string): Promise<FocusSchedule> {
    const schedule = await options.repository.getSchedule(id);
    if (schedule === null) throw new Error('FOCUS_SCHEDULE_NOT_FOUND');
    return schedule;
  }

  async function allOccurrences(nowInput: string): Promise<FocusScheduleOccurrence[]> {
    const [schedules, events] = await Promise.all([
      options.repository.listSchedules(),
      options.repository.listEvents(),
    ]);
    const result: FocusScheduleOccurrence[] = [];
    for (const schedule of schedules) {
      const zone = schedule.recurrence.kind === 'ONCE'
        ? options.currentTimeZone()
        : schedule.recurrence.timezone;
      const dateKey = localDateKeyAt(nowInput, zone);
      const occurrence = focusScheduleOccurrenceOnDate({
        schedule,
        localDateKey: dateKey,
        events,
        resolveLocalTrigger: options.resolveLocalTrigger,
        currentTimeZone: options.currentTimeZone(),
      });
      if (occurrence !== null) result.push(occurrence);
    }
    return result.sort((left, right) => Date.parse(left.plannedStartAt) - Date.parse(right.plannedStartAt));
  }

  async function reconcile(schedule: FocusSchedule, resolvedTask?: FocusScheduleResolvedTaskInput): Promise<void> {
    if (options.notifications === undefined) return;
    const key = `focus-schedule:${schedule.id}`;
    const previous = await options.notifications.get(key);
    const permission = await options.notifications.getPermission();
    const occurrence = schedule.enabled
      ? nextFocusScheduleOccurrence({
          schedule,
          now: options.now(),
          events: await options.repository.listEvents(schedule.id),
          resolveLocalTrigger: options.resolveLocalTrigger,
          currentTimeZone: options.currentTimeZone(),
        })
      : null;
    const next = {
      taskId: key,
      generation: (previous?.generation ?? 0) + 1,
      permission,
      intents: occurrence === null || permission !== 'granted' ? [] : [{
        // The native reminder store owns every intent under snapshot.taskId.
        // The focus-schedule route resolves its target from scheduleId, so the
        // durable schedule key (rather than a resolved task ID) belongs here.
        taskId: key,
        ruleId: `focus-schedule:${schedule.id}:${occurrence.localDateKey}`,
        kind: 'start' as const,
        triggerAt: occurrence.plannedStartAt,
        ...(typeof resolvedTask === 'object' ? {
          notificationTitle: `留给“${resolvedTask.title}”${schedule.durationMinutes} 分钟。`,
          notificationBody: `现在不用全部完成，先${resolvedTask.firstStep}`,
        } : {}),
      }],
      scheduled: occurrence !== null && permission === 'granted',
    };
    await options.notifications.replace({previous, next});
  }

  async function settleOnce(scheduleId: string): Promise<void> {
    const schedule = await requireSchedule(scheduleId);
    if (schedule.recurrence.kind === 'ONCE' && schedule.enabled) {
      await options.repository.saveSchedule(updateFocusSchedule(schedule, {enabled: false}, options.now()));
    }
  }

  async function event(input: Parameters<typeof createFocusScheduleEvent>[0]): Promise<FocusScheduleEvent> {
    return options.repository.saveEvent(createFocusScheduleEvent(input));
  }

  return {
    list: async () => (await options.repository.listSchedules()).map(cloneSchedule),
    listEvents: scheduleId => options.repository.listEvents(scheduleId),
    async create(draft, resolvedTask) {
      const schedule = createFocusSchedule({id: options.idGenerator(), draft, now: options.now()});
      const saved = await options.repository.saveSchedule(schedule);
      reconcileAfterDurableCommit(saved, resolvedTask);
      return saved;
    },
    async update(id, patch, resolvedTask) {
      const saved = await options.repository.saveSchedule(
        updateFocusSchedule(await requireSchedule(id), patch, options.now()),
      );
      reconcileAfterDurableCommit(saved, resolvedTask);
      return saved;
    },
    async setEnabled(id, enabled, resolvedTask) {
      const saved = await options.repository.saveSchedule(
        updateFocusSchedule(await requireSchedule(id), {enabled}, options.now()),
      );
      reconcileAfterDurableCommit(saved, resolvedTask);
      return saved;
    },
    async remove(id) {
      const schedule = await requireSchedule(id);
      if (options.notifications !== undefined) {
        const key = `focus-schedule:${id}`;
        const previous = await options.notifications.get(key);
        if (previous !== null) {
          await options.notifications.replace({
            previous,
            next: {...previous, generation: previous.generation + 1, intents: [], scheduled: false},
          });
        }
      }
      void schedule;
      return options.repository.deleteSchedule(id);
    },
    today: nowInput => allOccurrences(nowInput ?? options.now()),
    async next(nowInput) {
      const now = nowInput ?? options.now();
      const [schedules, events] = await Promise.all([
        options.repository.listSchedules(), options.repository.listEvents(),
      ]);
      return schedules
        .map(schedule => nextFocusScheduleOccurrence({
          schedule,
          now,
          events,
          resolveLocalTrigger: options.resolveLocalTrigger,
          currentTimeZone: options.currentTimeZone(),
        }))
        .filter((value): value is FocusScheduleOccurrence => value !== null)
        .sort((left, right) => Date.parse(left.plannedStartAt) - Date.parse(right.plannedStartAt))[0] ?? null;
    },
    async getOccurrence(scheduleId, localDateKey) {
      const [schedule, events] = await Promise.all([
        requireSchedule(scheduleId), options.repository.listEvents(scheduleId),
      ]);
      return focusScheduleOccurrenceOnDate({
        schedule,
        localDateKey,
        events,
        resolveLocalTrigger: options.resolveLocalTrigger,
        currentTimeZone: options.currentTimeZone(),
      });
    },
    async getStartedEvent(scheduleId, localDateKey) {
      return (await options.repository.listEvents(scheduleId)).find(candidate =>
        candidate.localDateKey === localDateKey && candidate.type === 'STARTED',
      ) ?? null;
    },
    recordStarted(input) {
      const key = `${input.scheduleId}:${input.localDateKey}`;
      const current = inFlightStarts.get(key);
      if (current !== undefined) return current;
      const pending = event({
        id: options.idGenerator(),
        scheduleId: input.scheduleId,
        localDateKey: input.localDateKey,
        plannedStartAt: input.plannedStartAt,
        type: 'STARTED',
        resolvedTaskId: input.resolvedTaskId,
        focusSessionId: input.focusSessionId,
        now: options.now(),
      }).finally(() => {
        if (inFlightStarts.get(key) === pending) inFlightStarts.delete(key);
      });
      inFlightStarts.set(key, pending);
      return pending;
    },
    async recordCompleted(scheduleId, localDateKey, plannedStartAt) {
      const result = await event({
        id: options.idGenerator(), scheduleId, localDateKey, plannedStartAt,
        type: 'COMPLETED', now: options.now(),
      });
      await settleOnce(scheduleId);
      const schedule = await requireSchedule(scheduleId);
      reconcileAfterDurableCommit(schedule);
      return result;
    },
    async skip(scheduleId, localDateKey, plannedStartAt) {
      const result = await event({
        id: options.idGenerator(), scheduleId, localDateKey, plannedStartAt,
        type: 'SKIPPED', now: options.now(),
      });
      await settleOnce(scheduleId);
      const schedule = await requireSchedule(scheduleId);
      reconcileAfterDurableCommit(schedule);
      return result;
    },
    async reschedule(scheduleId, localDateKey, plannedStartAt, rescheduledTo) {
      const result = await event({
        id: options.idGenerator(), scheduleId, localDateKey, plannedStartAt,
        type: 'RESCHEDULED', now: options.now(), rescheduledTo,
      });
      const schedule = await requireSchedule(scheduleId);
      reconcileAfterDurableCommit(schedule);
      return result;
    },
    async consecutiveSkipCount(scheduleId) {
      const events = (await options.repository.listEvents(scheduleId))
        .filter(candidate => candidate.type === 'SKIPPED' || candidate.type === 'STARTED')
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
      let count = 0;
      for (const item of events) {
        if (item.type !== 'SKIPPED') break;
        count += 1;
      }
      return count;
    },
    reconcile,
  };
}
