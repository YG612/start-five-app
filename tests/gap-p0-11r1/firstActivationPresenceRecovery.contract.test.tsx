import {fireEvent, waitFor} from '@testing-library/react-native';
import {
  createStartFiveApp,
  type StartFiveAppComposition,
  type StartFiveAppDependencies,
} from '../../src/app/startFiveApp';
import {
  ManualFocusRuntimeClock,
  MutableIsoClock,
  SequenceIds,
} from '../gap-p0-07/gapP007AppRootTestKit';
import {
  DAY_ONE_START,
  FIRST_ACTIVATION_READ_ERROR,
  FIRST_ACTIVATION_TITLE,
  FirstActivationNotificationFake,
  PublicMemoryBackend,
  type P011Harness,
  renderHarness,
} from '../gap-p0-11/gapP011TestKit';

const RETRY_FIRST_ACTIVATION_CHECK = '重试首次启动检查';

interface TaskDurablePresenceProbe {
  probe(): Promise<'absent' | 'present'>;
}

type FirstActivationWithPresence = Readonly<{
  enabled: true;
  taskDurablePresenceProbe?: TaskDurablePresenceProbe;
}>;

type R1Dependencies = StartFiveAppDependencies &
  Readonly<{
    public: Readonly<{
      firstActivation: FirstActivationWithPresence;
    }>;
  }>;

const createR1App = createStartFiveApp as unknown as (
  dependencies: R1Dependencies,
) => StartFiveAppComposition;

class PublicPresenceProbeFake implements TaskDurablePresenceProbe {
  calls = 0;

  async probe(): Promise<'absent' | 'present'> {
    this.calls += 1;
    return 'present';
  }
}

function createHarness(options: Readonly<{
  backend: PublicMemoryBackend;
  idPrefix: string;
  presenceProbe?: TaskDurablePresenceProbe;
}>): P011Harness {
  const clock = new MutableIsoClock(DAY_ONE_START);
  const runtimeClock = new ManualFocusRuntimeClock(DAY_ONE_START);
  const notifications = new FirstActivationNotificationFake();
  const composition = createR1App({
    storageBackend: options.backend,
    now: clock.now,
    idGenerator: new SequenceIds(options.idPrefix).next,
    focusRuntimeClock: runtimeClock,
    tomorrowFirstNotifications: notifications,
    public: {
      firstActivation: {
        enabled: true,
        ...(options.presenceProbe === undefined
          ? {}
          : {taskDurablePresenceProbe: options.presenceProbe}),
      },
    },
  });
  return {
    backend: options.backend,
    clock,
    runtimeClock,
    notifications,
    composition,
  };
}

describe('GAP-P0-11R1 durable presence and bootstrap recovery', () => {
  it('delegates task durability to the public storage-layer probe and never onboards when authoritative state is present after a byte restart', async () => {
    const backend = new PublicMemoryBackend().byteRestart();
    const presenceProbe = new PublicPresenceProbeFake();
    const harness = createHarness({
      backend,
      idPrefix: 'p011r1-authority-restart',
      presenceProbe,
    });
    const screen = await renderHarness(harness);
    try {
      await waitFor(() => expect(presenceProbe.calls).toBe(1));
      expect(screen.queryByText(FIRST_ACTIVATION_TITLE)).toBeNull();
      expect(harness.notifications.permissionRequests).toHaveLength(0);
    } finally {
      await screen.unmount();
    }
  });

  it('retries a generic bootstrap read failure in the mounted AppRoot and then onboards a truly empty install without requesting notification permission', async () => {
    const backend = new PublicMemoryBackend();
    backend.failNextRead(new Error('P011R1_GENERIC_BOOTSTRAP_READ_FAILED'));
    const harness = createHarness({
      backend,
      idPrefix: 'p011r1-read-retry',
    });
    const screen = await renderHarness(harness);
    try {
      await waitFor(() =>
        expect(screen.getByText(FIRST_ACTIVATION_READ_ERROR)).toBeTruthy(),
      );
      expect(screen.queryByText(FIRST_ACTIVATION_TITLE)).toBeNull();
      await fireEvent.press(
        screen.getByRole('button', {name: RETRY_FIRST_ACTIVATION_CHECK}),
      );
      await waitFor(() =>
        expect(
          screen.getByRole('header', {name: FIRST_ACTIVATION_TITLE}),
        ).toBeTruthy(),
      );
      expect(harness.notifications.permissionRequests).toHaveLength(0);
    } finally {
      await screen.unmount();
    }
  });
});
