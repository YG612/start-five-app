import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import type {AppFocusSessionRuntime} from '../../src/app/focusSessionRuntime';
import type {PostFocusReviewRuntime} from '../../src/app/postFocusReviewRuntime';
import type {TaskWorkspaceRuntime} from '../../src/app/taskWorkspaceRuntime';
import {
  createTomorrowFirstReminderService,
  type TomorrowFirstNotifications,
  type TomorrowFirstReminderService,
} from '../../src/application/tomorrowFirstNotifications';
import type {DayClosureService, DayClosureSnapshot} from '../../src/application/dayClosureService';
import type {
  ReminderPermission,
  ReminderReplaceRequest,
  ReminderScheduleSnapshot,
} from '../../src/application/reminderScheduling';
import type {CoreAppService} from '../../src/application/coreAppService';
import {createReminderSchedulingRepository} from '../../src/data/reminderSchedulingRepository';
import {createDayClosureRecord} from '../../src/domain/dayClosure';
import {createTask} from '../../src/domain/task';
import {TaskWorkspaceScreen} from '../../src/screens/TaskWorkspaceScreen';
import {PublicMemoryBackend} from '../gap-p0-07/gapP007AppRootTestKit';
import {
  REMINDER_DENIED_NONBLOCKING,
  SET_TOMORROW_REMINDER,
} from '../gap-p0-10/gapP010TestKit';

let mockWorkspaceRuntime: TaskWorkspaceRuntime;
let mockFocusRuntime: AppFocusSessionRuntime | null;
let mockReviewRuntime: PostFocusReviewRuntime | null;

jest.mock('../../src/app/taskWorkspaceRuntime', () => ({
  useTaskWorkspaceRuntime: () => mockWorkspaceRuntime,
}));
jest.mock('../../src/app/focusSessionRuntime', () => ({
  useAppFocusSessionRuntime: () => mockFocusRuntime,
}));
jest.mock('../../src/app/postFocusReviewRuntime', () => ({
  usePostFocusReviewRuntime: () => mockReviewRuntime,
}));

const NOW = '2026-08-10T08:00:00.000Z';
const DAY = NOW.slice(0, 10);
const LOGICAL_ID = `tomorrow-first:${DAY}`;
const RETRY_LABEL = '重试设置明日提醒';
const FAILURE_COPY = '提醒设置失败，请重试';

function cloneSnapshot(value: ReminderScheduleSnapshot): ReminderScheduleSnapshot {
  return {...value, intents: value.intents.map(intent => ({...intent}))};
}

class LogicalNotifications implements TomorrowFirstNotifications {
  readonly replacements: ReminderReplaceRequest[] = [];
  readonly permissionRequests: ReminderPermission[] = [];
  private readonly activeByRule = new Map<string, ReminderScheduleSnapshot>();
  private permission: ReminderPermission;

  constructor(permission: ReminderPermission) {
    this.permission = permission;
  }

  setPermission(permission: ReminderPermission): void {
    this.permission = permission;
  }

  async getPermission(): Promise<ReminderPermission> {
    return this.permission;
  }

  async requestPermission(): Promise<ReminderPermission> {
    this.permissionRequests.push(this.permission);
    return this.permission;
  }

  async getInitialTap(): Promise<null> {
    return null;
  }

  subscribeTap(): () => void {
    return () => undefined;
  }

  async get(taskId: string): Promise<ReminderScheduleSnapshot | null> {
    const found = Array.from(this.activeByRule.values()).find(
      snapshot => snapshot.taskId === taskId,
    );
    return found === undefined ? null : cloneSnapshot(found);
  }

  async replace(request: ReminderReplaceRequest): Promise<void> {
    const captured = {
      previous:
        request.previous === null ? null : cloneSnapshot(request.previous),
      next: cloneSnapshot(request.next),
    };
    this.replacements.push(captured);
    const ruleId =
      captured.next.intents[0]?.ruleId ??
      captured.previous?.intents[0]?.ruleId;
    if (ruleId === undefined) {
      throw new Error('TEST_LOGICAL_NOTIFICATION_ID_REQUIRED');
    }
    if (captured.next.scheduled) {
      this.activeByRule.set(ruleId, cloneSnapshot(captured.next));
    } else {
      this.activeByRule.delete(ruleId);
    }
  }

  active(ruleId: string): ReminderScheduleSnapshot | null {
    const found = this.activeByRule.get(ruleId);
    return found === undefined ? null : cloneSnapshot(found);
  }
}

function pendingSnapshot(): DayClosureSnapshot {
  const target = createTask(
    {title: '明早先完成发布检查', important: true, urgent: false},
    {id: 'tomorrow-target', now: NOW},
  );
  return {
    currentDay: DAY,
    record: createDayClosureRecord(DAY, target.id, NOW),
    target,
    candidates: [target],
    recommendation: target,
    completedToday: 0,
    focusCountToday: 0,
    focusMinutesToday: 0,
  };
}

function emptySnapshot(): DayClosureSnapshot {
  return {
    currentDay: DAY,
    record: null,
    target: null,
    candidates: [],
    recommendation: null,
    completedToday: 0,
    focusCountToday: 0,
    focusMinutesToday: 0,
  };
}

function createService(
  backend: PublicMemoryBackend,
  notifications: LogicalNotifications,
): TomorrowFirstReminderService {
  return createTomorrowFirstReminderService({backend, notifications, now: () => NOW});
}

describe('GAP-P0-10R1 tomorrow-first reminder recovery', () => {
  it('cancels a scheduled orphan when the closure record disappears and remains idle without duplicate replacement', async () => {
    const backend = new PublicMemoryBackend();
    const notifications = new LogicalNotifications('granted');
    const initial = createService(backend, notifications);
    expect(await initial.enable(pendingSnapshot())).toBe('scheduled');
    expect(notifications.active(LOGICAL_ID)?.scheduled).toBe(true);

    const cleanupBackend = backend.byteRestart();
    const restarted = createService(cleanupBackend, notifications);
    expect(await restarted.reconcile(emptySnapshot())).toBe('idle');
    expect(notifications.active(LOGICAL_ID)).toBeNull();
    const replacementsAfterCleanup = notifications.replacements.length;

    const convergedBackend = cleanupBackend.byteRestart();
    const convergedRepository = createReminderSchedulingRepository(
      convergedBackend,
    );
    expect(
      (await convergedRepository.get('tomorrow-target'))?.snapshot,
    ).toMatchObject({scheduled: false});

    const converged = createService(convergedBackend, notifications);
    expect(await converged.reconcile(emptySnapshot())).toBe('idle');
    expect(notifications.active(LOGICAL_ID)).toBeNull();
    expect(notifications.replacements).toHaveLength(replacementsAfterCleanup);
    expect(
      (await convergedRepository.get('tomorrow-target'))?.snapshot,
    ).toMatchObject({scheduled: false});
  });

  it('rechecks denied permission during explicit reconciliation and cancels without prompting', async () => {
    const backend = new PublicMemoryBackend();
    const notifications = new LogicalNotifications('granted');
    const service = createService(backend, notifications);
    const snapshot = pendingSnapshot();
    expect(await service.enable(snapshot)).toBe('scheduled');

    notifications.setPermission('denied');
    expect(await service.reconcile(snapshot)).toBe('denied');
    expect(notifications.active(LOGICAL_ID)).toBeNull();
    expect(notifications.permissionRequests).toEqual([]);

    const replacementsAfterDeniedCleanup = notifications.replacements.length;
    const deniedBackend = backend.byteRestart();
    const deniedRepository = createReminderSchedulingRepository(deniedBackend);
    expect(
      (await deniedRepository.get('tomorrow-target'))?.snapshot,
    ).toMatchObject({permission: 'denied', scheduled: false});

    const deniedRestarted = createService(deniedBackend, notifications);
    expect(await notifications.getPermission()).toBe('denied');
    expect(await deniedRestarted.reconcile(snapshot)).toBe('denied');
    expect(notifications.active(LOGICAL_ID)).toBeNull();
    expect(notifications.replacements).toHaveLength(
      replacementsAfterDeniedCleanup,
    );
    expect(notifications.permissionRequests).toEqual([]);
    expect(
      (await deniedRepository.get('tomorrow-target'))?.snapshot,
    ).toMatchObject({permission: 'denied', scheduled: false});
  });

  it('shows an operational reminder error with a visible retry instead of permission-denied copy', async () => {
    const snapshot = pendingSnapshot();
    let attempts = 0;
    const reminder: TomorrowFirstReminderService = {
      reconcile: jest.fn(async () => 'scheduled'),
      enable: jest.fn(async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('REMINDER_STORAGE_WRITE_FAILED');
        }
        return 'scheduled';
      }),
    };
    const dayClosure: DayClosureService = {
      load: jest.fn(async () => snapshot),
      choose: jest.fn(async () => snapshot),
      startAndConsume: jest.fn(),
      startCurrentRecommendation: jest.fn(),
    };
    mockFocusRuntime = null;
    mockReviewRuntime = null;
    mockWorkspaceRuntime = {
      snapshot: {
        loaded: true,
        revision: 1,
        tasks: snapshot.candidates,
        quadrants: [],
        recommendation: snapshot.recommendation,
        totalScore: 0,
        errorText: null,
        refreshErrorText: null,
        mutationPending: false,
        refreshPending: false,
      },
      selectedTask: null,
      closeTask: jest.fn(),
      selectTask: jest.fn(),
    } as unknown as TaskWorkspaceRuntime;

    const screen = await render(
      <TaskWorkspaceScreen
        service={{} as CoreAppService}
        dayClosure={dayClosure}
        reviewHistory={{listReceiptHistory: async () => ({receipts: []})}}
        historyNow={() => NOW}
        tomorrowFirstReminder={reminder}
      />,
    );
    try {
      await waitFor(() =>
        expect(screen.getByRole('button', {name: SET_TOMORROW_REMINDER})).toBeTruthy(),
      );
      await fireEvent.press(
        screen.getByRole('button', {name: SET_TOMORROW_REMINDER}),
      );
      await waitFor(() => expect(screen.getByText(FAILURE_COPY)).toBeTruthy());
      expect(screen.queryByText(REMINDER_DENIED_NONBLOCKING)).toBeNull();

      await fireEvent.press(screen.getByRole('button', {name: RETRY_LABEL}));
      await waitFor(() => expect(reminder.enable).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByText(FAILURE_COPY)).toBeNull());
    } finally {
      await screen.unmount();
    }
  });
});
