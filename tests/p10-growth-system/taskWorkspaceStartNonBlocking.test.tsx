import React from 'react';
import {Pressable, Text} from 'react-native';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {
  TaskWorkspaceRuntimeProvider,
  useTaskWorkspaceRuntime,
} from '../../src/app/taskWorkspaceRuntime';
import {createTask, type Task} from '../../src/domain/task';

const NOW = '2026-08-22T09:00:00.000Z';

function StartProbe(): React.JSX.Element {
  const runtime = useTaskWorkspaceRuntime();
  const [started, setStarted] = React.useState(false);
  if (runtime === null || !runtime.snapshot.loaded) {
    return <Text>loading</Text>;
  }
  return (
    <Pressable
      accessibilityLabel="start task"
      accessibilityRole="button"
      onPress={() => {
        void runtime.startSelectedTask('non-blocking-task').then(() => setStarted(true));
      }}>
      <Text>{started ? 'started' : 'start'}</Text>
    </Pressable>
  );
}

describe('task workspace start side effects', () => {
  it('resolves a durable start while reminder reconciliation is still pending', async () => {
    const task = createTask(
      {title: '发个红包', important: true, urgent: false},
      {id: 'non-blocking-task', now: NOW},
    );
    const startedTask: Task = {
      ...task,
      status: 'in_progress',
      startedAt: NOW,
      updatedAt: NOW,
    };
    const reconcileReminders = jest.fn(() => new Promise<void>(() => undefined));
    const startSelectedTask = jest.fn(async () => startedTask);
    const service = {
      getState: jest.fn(async () => ({tasks: [startedTask], totalScore: 0})),
    };
    const lifecycle = {
      getQueryResult: jest.fn(async () => ({
        tasks: [startedTask],
        quadrants: [],
        recommendation: startedTask,
      })),
    };
    const screen = await render(
      <TaskWorkspaceRuntimeProvider
        lifecycle={lifecycle as never}
        reconcileReminders={reconcileReminders}
        reloadProjection={async () => [startedTask]}
        restoreCompletedReview={async () => undefined}
        service={service as never}
        startSelectedTask={startSelectedTask}>
        <StartProbe />
      </TaskWorkspaceRuntimeProvider>,
    );
    try {
      await waitFor(() => expect(screen.getByRole('button', {name: 'start task'})).toBeTruthy());
      await fireEvent.press(screen.getByRole('button', {name: 'start task'}));

      await waitFor(() => expect(screen.getByText('started')).toBeTruthy());
      expect(startSelectedTask).toHaveBeenCalledTimes(1);
      expect(reconcileReminders).toHaveBeenCalledTimes(1);
    } finally {
      await screen.unmount();
    }
  });

  it('resolves a durable start while the post-commit projection refresh is still pending', async () => {
    const task = createTask(
      {title: '写一行结论', important: true, urgent: false},
      {id: 'non-blocking-task', now: NOW},
    );
    const startedTask: Task = {
      ...task,
      status: 'in_progress',
      startedAt: NOW,
      updatedAt: NOW,
    };
    let stateReads = 0;
    const service = {
      getState: jest.fn(() => {
        stateReads += 1;
        if (stateReads === 1) {
          return Promise.resolve({tasks: [startedTask], totalScore: 0});
        }
        return new Promise<never>(() => undefined);
      }),
    };
    const lifecycle = {
      getQueryResult: jest.fn(async () => ({
        tasks: [startedTask],
        quadrants: [],
        recommendation: startedTask,
      })),
    };
    const startSelectedTask = jest.fn(async () => startedTask);
    const screen = await render(
      <TaskWorkspaceRuntimeProvider
        lifecycle={lifecycle as never}
        reloadProjection={async () => [startedTask]}
        restoreCompletedReview={async () => undefined}
        service={service as never}
        startSelectedTask={startSelectedTask}>
        <StartProbe />
      </TaskWorkspaceRuntimeProvider>,
    );
    try {
      await waitFor(() => expect(screen.getByRole('button', {name: 'start task'})).toBeTruthy());
      await fireEvent.press(screen.getByRole('button', {name: 'start task'}));

      await waitFor(() => expect(screen.getByText('started')).toBeTruthy());
      expect(startSelectedTask).toHaveBeenCalledTimes(1);
      expect(service.getState).toHaveBeenCalledTimes(2);
    } finally {
      await screen.unmount();
    }
  });
});
