import React from 'react';
import {act, fireEvent, waitFor} from '@testing-library/react-native';
import {
  createStartFiveApp,
  type StartFiveAppComposition,
  type StartFiveAppDependencies,
} from '../../src/app/startFiveApp';
import type {
  ReminderPermission,
  ReminderReplaceRequest,
  ReminderScheduleSnapshot,
  ReminderScheduler,
} from '../../src/application/reminderScheduling';
import type {Task} from '../../src/domain/task';
import {
  ManualFocusRuntimeClock,
  MutableIsoClock,
  PublicMemoryBackend,
  SequenceIds,
  flushUiWork,
  renderHarness as renderP007Harness,
  seedTaskWithStep as seedP007TaskWithStep,
  type AppScreen,
} from '../gap-p0-07/gapP007AppRootTestKit';
import {
  chooseTomorrowLabel,
  deleteTaskThroughWorkspace,
} from '../gap-p0-09/dayClosureTestKit';

export const DAY_ONE = '2026-08-10';
export const DAY_TWO = '2026-08-11';
export const DAY_ONE_START = `${DAY_ONE}T08:00:00.000Z`;
export const DAY_TWO_START = `${DAY_TWO}T07:30:00.000Z`;
export const TOMORROW_TRIGGER = `${DAY_TWO}T08:00:00.000Z`;

export const CONFIRM_TOMORROW_FIRST = '确认明日第一项';
export const SET_TOMORROW_REMINDER = '设置明日 08:00 提醒';
export const REMINDER_DENIED_NONBLOCKING =
  '提醒未开启，不影响明日第一项';
export const TOMORROW_ROUTE_HEADER = '明日第一项';
export const BACK_TO_WORKSPACE = '回到象限';

export type TomorrowFirstTap = Readonly<{
  kind: 'tomorrow_first';
  dayKey: string;
  taskId: string;
}>;

export type TomorrowFirstNotifications = ReminderScheduler &
  Readonly<{
    getPermission(): Promise<ReminderPermission>;
    requestPermission(): Promise<ReminderPermission>;
    getInitialTap(): Promise<TomorrowFirstTap | null>;
    subscribeTap(listener: (tap: TomorrowFirstTap) => void): () => void;
  }>;

type ExtendedStartFiveDependencies = StartFiveAppDependencies &
  Readonly<{
    tomorrowFirstNotifications?: TomorrowFirstNotifications;
  }>;

const createExtendedStartFiveApp = createStartFiveApp as unknown as (
  dependencies: ExtendedStartFiveDependencies,
) => StartFiveAppComposition;

function cloneSnapshot(
  value: ReminderScheduleSnapshot,
): ReminderScheduleSnapshot {
  return {...value, intents: value.intents.map(intent => ({...intent}))};
}

function cloneRequest(request: ReminderReplaceRequest): ReminderReplaceRequest {
  return {
    previous:
      request.previous === null ? null : cloneSnapshot(request.previous),
    next: cloneSnapshot(request.next),
  };
}

function logicalNotificationId(
  request: ReminderReplaceRequest,
): string | null {
  return (
    request.next.intents[0]?.ruleId ??
    request.previous?.intents[0]?.ruleId ??
    null
  );
}

export class PublicTomorrowFirstNotifications
  implements TomorrowFirstNotifications
{
  readonly permissionRequests: ReminderPermission[] = [];
  readonly replacements: ReminderReplaceRequest[] = [];
  private readonly listeners = new Set<(tap: TomorrowFirstTap) => void>();
  private readonly activeById = new Map<string, ReminderScheduleSnapshot>();
  private permission: ReminderPermission;
  private requestResult: ReminderPermission;
  private initialTap: TomorrowFirstTap | null;

  constructor(options: Readonly<{
    permission: ReminderPermission;
    requestResult?: ReminderPermission;
    initialTap?: TomorrowFirstTap | null;
    active?: readonly (readonly [string, ReminderScheduleSnapshot])[];
  }>) {
    this.permission = options.permission;
    this.requestResult = options.requestResult ?? options.permission;
    this.initialTap = options.initialTap ?? null;
    for (const [id, snapshot] of options.active ?? []) {
      this.activeById.set(id, cloneSnapshot(snapshot));
    }
  }

  async getPermission(): Promise<ReminderPermission> {
    return this.permission;
  }

  async requestPermission(): Promise<ReminderPermission> {
    this.permissionRequests.push(this.permission);
    this.permission = this.requestResult;
    return this.permission;
  }

  async getInitialTap(): Promise<TomorrowFirstTap | null> {
    const tap = this.initialTap;
    this.initialTap = null;
    return tap === null ? null : {...tap};
  }

  subscribeTap(listener: (tap: TomorrowFirstTap) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async emitTap(tap: TomorrowFirstTap): Promise<void> {
    await act(async () => {
      for (const listener of Array.from(this.listeners)) {
        listener({...tap});
      }
      await flushUiWork();
    });
  }

  async get(taskId: string): Promise<ReminderScheduleSnapshot | null> {
    const found = Array.from(this.activeById.values()).find(
      snapshot => snapshot.taskId === taskId,
    );
    return found === undefined ? null : cloneSnapshot(found);
  }

  async replace(request: ReminderReplaceRequest): Promise<void> {
    const captured = cloneRequest(request);
    this.replacements.push(captured);
    const id = logicalNotificationId(captured);
    if (id === null) {
      throw new Error('TEST_TOMORROW_NOTIFICATION_ID_REQUIRED');
    }
    if (captured.next.scheduled) {
      this.activeById.set(id, cloneSnapshot(captured.next));
    } else {
      this.activeById.delete(id);
    }
  }

  active(id: string): ReminderScheduleSnapshot | null {
    const found = this.activeById.get(id);
    return found === undefined ? null : cloneSnapshot(found);
  }

  byteRestart(options: Readonly<{
    initialTap?: TomorrowFirstTap | null;
  }> = {}): PublicTomorrowFirstNotifications {
    return new PublicTomorrowFirstNotifications({
      permission: this.permission,
      requestResult: this.requestResult,
      initialTap: options.initialTap ?? null,
      active: Array.from(this.activeById.entries()).map(([id, snapshot]) =>
        [id, cloneSnapshot(snapshot)] as const,
      ),
    });
  }
}

export type P010Harness = Readonly<{
  backend: PublicMemoryBackend;
  clock: MutableIsoClock;
  runtimeClock: ManualFocusRuntimeClock;
  notifications: PublicTomorrowFirstNotifications;
  composition: StartFiveAppComposition;
}>;

export function createP010Harness(options: Readonly<{
  backend?: PublicMemoryBackend;
  at?: string;
  idPrefix: string;
  notifications: PublicTomorrowFirstNotifications;
}>): P010Harness {
  const backend = options.backend ?? new PublicMemoryBackend();
  const at = options.at ?? DAY_ONE_START;
  const clock = new MutableIsoClock(at);
  const runtimeClock = new ManualFocusRuntimeClock(at);
  const ids = new SequenceIds(options.idPrefix);
  const composition = createExtendedStartFiveApp({
    storageBackend: backend,
    now: clock.now,
    idGenerator: ids.next,
    focusRuntimeClock: runtimeClock,
    tomorrowFirstNotifications: options.notifications,
  });
  return {
    backend,
    clock,
    runtimeClock,
    notifications: options.notifications,
    composition,
  };
}

export async function renderHarness(
  harness: P010Harness,
): Promise<AppScreen> {
  return renderP007Harness(harness);
}

export async function seedTaskWithStep(
  harness: P010Harness,
  input: Readonly<{
    title: string;
    stepTitle: string;
    important: boolean;
    urgent: boolean;
    operationPrefix: string;
  }>,
): Promise<Task> {
  return seedP007TaskWithStep(harness, input);
}

export function notificationId(dayKey: string): string {
  return `tomorrow-first:${dayKey}`;
}

export function tomorrowTap(taskId: string): TomorrowFirstTap {
  return {kind: 'tomorrow_first', dayKey: DAY_ONE, taskId};
}

export async function chooseTomorrowFirst(
  screen: AppScreen,
  title: string,
): Promise<void> {
  if (screen.queryByText('今日回顾') === null) {
    await fireEvent.press(screen.getByRole('tab', {name: '我的'}));
    await fireEvent.press(screen.getByRole('button', {name: '今日回顾'}));
    await waitFor(() => expect(screen.getByText('今日回顾')).toBeTruthy());
  }
  await fireEvent.press(
    screen.getByRole('button', {name: chooseTomorrowLabel(title)}),
  );
  await fireEvent.press(
    screen.getByRole('button', {name: CONFIRM_TOMORROW_FIRST}),
  );
  await waitFor(() =>
    expect(screen.getByText(`明日第一项已设定：${title}`)).toBeTruthy(),
  );
}

export async function setTomorrowReminder(screen: AppScreen): Promise<void> {
  await fireEvent.press(
    screen.getByRole('button', {name: SET_TOMORROW_REMINDER}),
  );
  await act(async () => {
    await flushUiWork();
  });
}

export async function completeTaskThroughPublicService(
  harness: P010Harness,
  task: Task,
  operationPrefix: string,
): Promise<void> {
  const started = await harness.composition.service.startRecommended({
    operationId: `${operationPrefix}:start`,
  });
  expect(started.id).toBe(task.id);
  const firstStep = task.subtasks[0];
  if (firstStep === undefined) {
    throw new Error('TEST_FIRST_STEP_REQUIRED');
  }
  await harness.composition.service.finishStep(task.id, firstStep.id, {
    operationId: `${operationPrefix}:step`,
  });
  await harness.composition.service.finishTask(task.id, {
    operationId: `${operationPrefix}:task`,
  });
  const state = await harness.composition.service.getState();
  expect(state.tasks.find(candidate => candidate.id === task.id)?.status).toBe(
    'completed',
  );
}

export {deleteTaskThroughWorkspace};
export type {AppScreen};
