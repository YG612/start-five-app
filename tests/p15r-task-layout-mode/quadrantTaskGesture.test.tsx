import React from 'react';
import {PanResponder} from 'react-native';
import {act, render} from '@testing-library/react-native';
import {createTask} from '../../src/domain/task';
import {
  QuadrantTaskMap,
  quadrantMapCellCornerRadii,
  selectMapTaskNodes,
} from '../../src/components/QuadrantTaskMap';
import type {QuadrantTaskLayoutStore} from '../../src/data/quadrantTaskLayoutStore';
import {SettingsRow} from '../../src/components/AppPage';
import {
  createWorkspaceOperationSessionId,
  workspaceOperationId,
} from '../../src/app/taskWorkspaceRuntime';

const NOW = '2026-08-21T08:00:00.000Z';

function repository(): QuadrantTaskLayoutStore {
  return {
    read: jest.fn(async () => ({})),
    upsert: jest.fn(async () => undefined),
    upsertMany: jest.fn(async () => undefined),
    remove: jest.fn(async () => undefined),
    removeOrphans: jest.fn(async () => undefined),
  };
}

async function renderMap() {
  const onTask = jest.fn();
  const onDraggingChange = jest.fn();
  const task = createTask({
    title: '拖动测试',
    important: true,
    urgent: false,
  }, {id: 'task-drag', now: NOW});
  const screen = await render(
    <QuadrantTaskMap
      actionPending={false}
      dark={false}
      largeText={false}
      nowInput={NOW}
      onAdd={jest.fn()}
      onCommit={jest.fn(async () => undefined)}
      onDraggingChange={onDraggingChange}
      onShowList={jest.fn()}
      onTask={onTask}
      recommendedId={null}
      reduceMotion
      repository={repository()}
      tasks={[task]}
    />,
  );
  return {onDraggingChange, onTask, screen};
}

describe('P15R Android task gesture ownership', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(PanResponder, 'create').mockImplementation(config => ({
      panHandlers: {
        onStartShouldSetResponder: config.onStartShouldSetPanResponder,
        onMoveShouldSetResponder: config.onMoveShouldSetPanResponder,
        onResponderGrant: config.onPanResponderGrant,
        onResponderMove: config.onPanResponderMove,
        onResponderRelease: config.onPanResponderRelease,
        onResponderTerminate: config.onPanResponderTerminate,
        onResponderTerminationRequest: config.onPanResponderTerminationRequest,
      },
    }) as ReturnType<typeof PanResponder.create>);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('keeps a short tap available for opening the task', async () => {
    const {onTask, screen} = await renderMap();
    const node = screen.getByRole('button', {name: '成长区任务：拖动测试'});
    await act(async () => node.props.onResponderGrant({nativeEvent: {pageX: 800, pageY: 1600}}));
    await act(async () => node.props.onResponderRelease());
    expect(onTask).toHaveBeenCalledWith('task-drag');
  });

  it('arms after one second, locks page scrolling, and suppresses the release press', async () => {
    const {onDraggingChange, onTask, screen} = await renderMap();
    const node = screen.getByRole('button', {name: '成长区任务：拖动测试'});
    await act(async () => node.props.onResponderGrant({nativeEvent: {pageX: 800, pageY: 1600}}));
    await act(async () => jest.advanceTimersByTime(1_000));
    await act(async () => node.props.onResponderRelease());
    expect(onDraggingChange).toHaveBeenCalledWith(true);
    expect(onTask).not.toHaveBeenCalled();
    expect(screen.getByText('任务已选中：拖动调整，点击其他区域退出')).toBeTruthy();
  });

  it('does not let the native ScrollView terminate a task-owned gesture', async () => {
    const {screen} = await renderMap();
    const node = screen.getByRole('button', {name: '成长区任务：拖动测试'});
    expect(node.props.onResponderTerminationRequest()).toBe(false);
  });

  it('cancels both tap and long-press activation after pre-arm movement', async () => {
    const {onDraggingChange, onTask, screen} = await renderMap();
    const node = screen.getByRole('button', {name: '成长区任务：拖动测试'});
    await act(async () => node.props.onResponderGrant({nativeEvent: {pageX: 800, pageY: 1600}}));
    await act(async () => node.props.onResponderMove({}, {
      dx: 11,
      dy: 0,
      moveX: 811,
      moveY: 1600,
    }));
    await act(async () => jest.advanceTimersByTime(1_000));
    await act(async () => node.props.onResponderRelease());
    expect(onDraggingChange).not.toHaveBeenCalledWith(true);
    expect(onTask).not.toHaveBeenCalled();
  });
});

describe('P15R quadrant drag-target outline geometry', () => {
  it('keeps exactly the one outer corner rounded for every quadrant', () => {
    expect(quadrantMapCellCornerRadii('Q3')).toEqual({borderTopLeftRadius: 17});
    expect(quadrantMapCellCornerRadii('Q1')).toEqual({borderTopRightRadius: 17});
    expect(quadrantMapCellCornerRadii('Q4')).toEqual({borderBottomLeftRadius: 17});
    expect(quadrantMapCellCornerRadii('Q2')).toEqual({borderBottomRightRadius: 17});
  });
});

describe('P15R quadrant overflow packing', () => {
  it('reserves the sixth desktop slot for the overflow entry', () => {
    const tasks = Array.from({length: 7}, (_, index) => createTask({
      title: `溢出任务 ${index + 1}`,
      important: true,
      urgent: false,
    }, {id: `overflow-${index + 1}`, now: NOW}));

    const visible = selectMapTaskNodes(tasks, null, null);

    expect(visible).toHaveLength(5);
    expect(tasks.length - visible.length).toBe(2);
  });
});

describe('P15R compact settings row layout', () => {
  it('keeps the focus-protection hint and chevron on one line', async () => {
    const screen = await render(
      <SettingsRow
        label="专注保护"
        onPress={jest.fn()}
        value="仅提醒 / 减少干扰 ›"
      />,
    );
    const value = screen.getByText('仅提醒 / 减少干扰 ›');
    expect(value.props.numberOfLines).toBe(1);
    expect(value.props.adjustsFontSizeToFit).toBe(true);
    expect(value.props.minimumFontScale).toBe(0.75);
  });
});

describe('P15R durable task-move operation identity', () => {
  it('does not reuse an operation id when the app runtime restarts', () => {
    const firstSession = createWorkspaceOperationSessionId(
      () => 1_777_777_777_777,
      () => 0.125,
    );
    const restartedSession = createWorkspaceOperationSessionId(
      () => 1_777_777_777_777,
      () => 0.875,
    );

    expect(workspaceOperationId(firstSession, 'update', 1)).not.toBe(
      workspaceOperationId(restartedSession, 'update', 1),
    );
  });

  it('keeps the operation kind and sequence readable for retry diagnostics', () => {
    expect(workspaceOperationId('runtime-a', 'update', 3)).toBe(
      'task-workspace:runtime-a:update:3',
    );
  });
});
