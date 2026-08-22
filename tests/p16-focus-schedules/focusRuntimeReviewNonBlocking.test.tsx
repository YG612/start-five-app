import React from 'react';
import {Pressable, Text} from 'react-native';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {
  FocusSessionRuntimeProvider,
  useAppFocusSessionRuntime,
} from '../../src/app/focusSessionRuntime';
import type {CurrentFocusSession} from '../../src/domain/focusSession';

const NOW = '2026-08-22T09:00:00.000Z';
const SESSION: CurrentFocusSession = {
  id: 'focus-review-pending',
  taskId: 'focus-task',
  plannedMinutes: 15,
  status: 'running',
  startedAt: NOW,
  plannedEndAt: '2026-08-22T09:15:00.000Z',
  endedAt: null,
  actualSeconds: null,
  interruptionReason: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const clock = {
  nowMs: () => Date.parse(NOW),
  subscribe: () => () => undefined,
};

function pendingForever(): Promise<never> {
  return new Promise<never>(() => undefined);
}

function StartProbe(): React.JSX.Element {
  const runtime = useAppFocusSessionRuntime();
  const [resolved, setResolved] = React.useState(false);
  if (runtime === null) return <Text>missing</Text>;
  return (
    <>
      <Text>{runtime.snapshot.state}</Text>
      <Pressable
        accessibilityLabel="start focus"
        accessibilityRole="button"
        onPress={() => {
          void runtime.start(SESSION.taskId, 15).then(() => setResolved(true));
        }}>
        <Text>{resolved ? 'resolved' : 'start'}</Text>
      </Pressable>
    </>
  );
}

function RestoreProbe(): React.JSX.Element {
  const runtime = useAppFocusSessionRuntime();
  React.useEffect(() => {
    runtime?.notifyTaskHydrated([SESSION.taskId]);
  }, [runtime]);
  return <Text>{runtime?.snapshot.state ?? 'missing'}</Text>;
}

function reviewService(overrides: Record<string, unknown> = {}) {
  return {
    trackStartedSession: jest.fn(async () => undefined),
    trackRestoredSession: jest.fn(async () => undefined),
    captureEndedSession: jest.fn(async () => undefined),
    recoverTrackedSession: jest.fn(async () => undefined),
    recoverEligibleSessions: jest.fn(async () => undefined),
    ...overrides,
  };
}

describe('focus runtime review tracking', () => {
  it('adopts a newly persisted focus before review tracking finishes', async () => {
    const reviews = reviewService({trackStartedSession: jest.fn(pendingForever)});
    const service = {start: jest.fn(async () => SESSION)};
    const screen = await render(
      <FocusSessionRuntimeProvider
        clock={clock}
        createRestoreService={() => ({restore: async () => null}) as never}
        lastObservedNow={() => NOW}
        reviewService={reviews as never}
        service={service as never}>
        <StartProbe />
      </FocusSessionRuntimeProvider>,
    );
    try {
      await fireEvent.press(screen.getByRole('button', {name: 'start focus'}));
      await waitFor(() => expect(screen.getByText('running')).toBeTruthy());
      expect(screen.getByText('resolved')).toBeTruthy();
      expect(reviews.trackStartedSession).toHaveBeenCalledWith(SESSION);
    } finally {
      await screen.unmount();
    }
  });

  it('restores a persisted focus before restored-review tracking finishes', async () => {
    const reviews = reviewService({trackRestoredSession: jest.fn(pendingForever)});
    const restore = jest.fn(async () => SESSION);
    const screen = await render(
      <FocusSessionRuntimeProvider
        clock={clock}
        createRestoreService={() => ({restore}) as never}
        lastObservedNow={() => NOW}
        reviewService={reviews as never}
        service={{} as never}>
        <RestoreProbe />
      </FocusSessionRuntimeProvider>,
    );
    try {
      await waitFor(() => expect(screen.getByText('running')).toBeTruthy());
      expect(restore).toHaveBeenCalledTimes(1);
      expect(reviews.trackRestoredSession).toHaveBeenCalledWith(SESSION);
    } finally {
      await screen.unmount();
    }
  });
});
