import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import type {AppFocusSessionRuntime} from '../../src/app/focusSessionRuntime';
import type {PostFocusReviewRuntime} from '../../src/app/postFocusReviewRuntime';
import type {TaskWorkspaceRuntime} from '../../src/app/taskWorkspaceRuntime';
import type {CoreAppService} from '../../src/application/coreAppService';
import type {
  DayClosureService,
  DayClosureSnapshot,
} from '../../src/application/dayClosureService';
import type {FocusSession} from '../../src/domain/focusSession';
import {createTask} from '../../src/domain/task';
import {TaskWorkspaceScreen} from '../../src/screens/TaskWorkspaceScreen';

let mockWorkspaceRuntime: TaskWorkspaceRuntime;
let mockFocusRuntime: AppFocusSessionRuntime;
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

const DAY_ONE = '2026-08-10T08:00:00.000Z';
const DAY_TWO = '2026-08-11T07:30:00.000Z';

describe('GAP-P0-09R3 TaskWorkspace fallback retry recovery', () => {
  it('reloads a rejected fallback start as starting B and continues exact B to consumed in the same mounted session', async () => {
    const unavailable = {
      ...createTask(
        {title: '已删除的明日第一项 A', important: false, urgent: false},
        {id: 'terminal-a', now: DAY_ONE},
      ),
      status: 'cancelled' as const,
      deletedAt: DAY_ONE,
      updatedAt: DAY_ONE,
    };
    const fallback = createTask(
      {title: '当前推荐 B', important: true, urgent: true},
      {id: 'fallback-b', now: DAY_ONE},
    );
    const terminalSnapshot: DayClosureSnapshot = {
      currentDay: DAY_TWO.slice(0, 10),
      record: {
        dayKey: DAY_ONE.slice(0, 10),
        targetTaskId: unavailable.id,
        state: 'resolved_deleted',
        operationId: `day-closure:${DAY_ONE.slice(0, 10)}:${unavailable.id}`,
        createdAt: DAY_ONE,
        updatedAt: DAY_TWO,
      },
      target: unavailable,
      candidates: [fallback],
      recommendation: fallback,
      completedToday: 0,
      focusCountToday: 0,
      focusMinutesToday: 0,
    };
    const startingSnapshot: DayClosureSnapshot = {
      ...terminalSnapshot,
      record: {
        dayKey: DAY_ONE.slice(0, 10),
        targetTaskId: fallback.id,
        state: 'starting',
        operationId: `day-closure:${DAY_ONE.slice(0, 10)}:${fallback.id}`,
        createdAt: DAY_TWO,
        updatedAt: DAY_TWO,
      },
      target: fallback,
    };
    const consumedSnapshot: DayClosureSnapshot = {
      ...startingSnapshot,
      record: {...startingSnapshot.record!, state: 'consumed'},
    };
    let durableSnapshot = terminalSnapshot;
    const load = jest.fn(async () => durableSnapshot);
    const startCurrentRecommendation = jest.fn(async () => {
      durableSnapshot = startingSnapshot;
      throw new Error('FALLBACK_START_IO_FAILED_ONCE');
    });
    const startAndConsume: DayClosureService['startAndConsume'] = jest.fn(
      async startFocus => {
        await startFocus(fallback.id);
        durableSnapshot = consumedSnapshot;
        return durableSnapshot;
      },
    );
    const dayClosure: DayClosureService = {
      load,
      choose: jest.fn(async () => terminalSnapshot),
      startCurrentRecommendation,
      startAndConsume,
    };
    const startFocus = jest.fn(async (taskId: string) => ({
      id: 'focus-b',
      taskId,
      status: 'running',
    } as FocusSession));
    mockFocusRuntime = {
      snapshot: {state: 'idle', activeSession: null},
      start: startFocus,
    } as unknown as AppFocusSessionRuntime;
    mockReviewRuntime = null;
    mockWorkspaceRuntime = {
      snapshot: {
        loaded: true,
        revision: 1,
        tasks: [fallback],
        quadrants: [],
        recommendation: fallback,
        totalScore: 1,
        errorText: null,
        refreshErrorText: null,
        mutationPending: false,
        refreshPending: false,
      },
      selectedTask: null,
      refreshAfterDurableCommit: jest.fn(async () => undefined),
    } as unknown as TaskWorkspaceRuntime;

    const screen = await render(
      <TaskWorkspaceScreen
        service={{} as CoreAppService}
        dayClosure={dayClosure}
        reviewHistory={{listReceiptHistory: async () => ({receipts: []})}}
        historyNow={() => DAY_TWO}
      />,
    );
    try {
      await waitFor(() =>
        expect(
          screen.getByRole('button', {name: '开始当前推荐5分钟'}),
        ).toBeTruthy(),
      );
      await fireEvent.press(
        screen.getByRole('button', {name: '开始当前推荐5分钟'}),
      );

      await waitFor(() =>
        expect(screen.getByText('继续明日第一项：当前推荐 B')).toBeTruthy(),
      );
      expect(load).toHaveBeenCalledTimes(2);
      expect(
        screen.queryByRole('button', {name: '开始当前推荐5分钟'}),
      ).toBeNull();

      await fireEvent.press(
        screen.getByRole('button', {name: '继续开始明日第一项5分钟'}),
      );
      await waitFor(() => expect(durableSnapshot.record?.state).toBe('consumed'));
      expect(startCurrentRecommendation).toHaveBeenCalledTimes(1);
      expect(startAndConsume).toHaveBeenCalledTimes(1);
      expect(startFocus).toHaveBeenCalledWith(fallback.id);
      expect(
        screen.queryByRole('button', {name: '继续开始明日第一项5分钟'}),
      ).toBeNull();
    } finally {
      await screen.unmount();
    }
  });
});
