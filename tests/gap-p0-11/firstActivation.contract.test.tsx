import {fireEvent, waitFor} from '@testing-library/react-native';
import {
  FIRST_ACTIVATION_READ_ERROR,
  FIRST_ACTIVATION_TITLE,
  FIRST_TASK_INPUT,
  SKIP_FIRST_ACTIVATION,
  START_FIRST_FOCUS,
  FirstActivationNotificationFake,
  PublicMemoryBackend,
  createP011Harness,
  renderHarness,
  seedAcknowledgedLifecycle,
  submitFirstTask,
} from './gapP011TestKit';

describe('GAP-P0-11 first activation', () => {
  it('shows one focused first-activation screen for a brand-new install without requesting notification permission', async () => {
    const notifications = new FirstActivationNotificationFake();
    const harness = createP011Harness({
      idPrefix: 'p011-new',
      notifications,
    });
    const screen = await renderHarness(harness);
    try {
      expect(
        screen.getByRole('header', {name: FIRST_ACTIVATION_TITLE}),
      ).toBeTruthy();
      expect(screen.getByLabelText(FIRST_TASK_INPUT)).toBeTruthy();
      expect(
        screen.getByRole('button', {name: START_FIRST_FOCUS}),
      ).toBeTruthy();
      expect(
        screen.getByRole('button', {name: SKIP_FIRST_ACTIVATION}),
      ).toBeTruthy();
      expect(screen.queryByText('今日推荐')).toBeNull();
      expect(notifications.permissionRequests).toHaveLength(0);
    } finally {
      await screen.unmount();
    }
  });

  it('creates and starts the exact first task once, then byte-restarts into the same active focus without onboarding', async () => {
    const title = '完成首轮发布检查';
    const backend = new PublicMemoryBackend();
    const first = createP011Harness({
      backend,
      idPrefix: 'p011-start',
    });
    const screen = await renderHarness(first);
    try {
      await submitFirstTask(screen, title);
      expect(screen.getByText('计时状态：进行中')).toBeTruthy();
      const state = await first.composition.service.getState();
      const exact = state.tasks.filter(task => task.title === title);
      expect(exact).toHaveLength(1);
      expect(exact[0]?.status).toBe('in_progress');
      expect(first.notifications.permissionRequests).toHaveLength(0);
    } finally {
      await screen.unmount();
    }

    const settledBytes = backend.stableByteSnapshot();
    const restartedBackend = backend.byteRestart();
    const restarted = createP011Harness({
      backend: restartedBackend,
      idPrefix: 'p011-start-restart',
    });
    const restartedScreen = await renderHarness(restarted);
    try {
      await waitFor(() =>
        expect(restartedScreen.getByText(`专注任务：${title}`)).toBeTruthy(),
      );
      expect(restartedScreen.queryByText(FIRST_ACTIVATION_TITLE)).toBeNull();
      const state = await restarted.composition.service.getState();
      expect(state.tasks.filter(task => task.title === title)).toHaveLength(1);
      expect(restartedBackend.stableByteSnapshot()).toBe(settledBytes);
    } finally {
      await restartedScreen.unmount();
    }
  });

  it('durably skips, bypasses onboarding for public lifecycle upgrade data, and fails closed on a generic read failure', async () => {
    const skipBackend = new PublicMemoryBackend();
    const skipped = createP011Harness({
      backend: skipBackend,
      idPrefix: 'p011-skip',
    });
    const skippedScreen = await renderHarness(skipped);
    try {
      await fireEvent.press(
        skippedScreen.getByRole('button', {name: SKIP_FIRST_ACTIVATION}),
      );
      await waitFor(() =>
        expect(skippedScreen.queryByText(FIRST_ACTIVATION_TITLE)).toBeNull(),
      );
      expect(skipped.notifications.permissionRequests).toHaveLength(0);
    } finally {
      await skippedScreen.unmount();
    }
    const skippedBytes = skipBackend.stableByteSnapshot();
    const skippedRestartBackend = skipBackend.byteRestart();
    const skippedRestart = createP011Harness({
      backend: skippedRestartBackend,
      idPrefix: 'p011-skip-restart',
    });
    const skippedRestartScreen = await renderHarness(skippedRestart);
    try {
      expect(skippedRestartScreen.queryByText(FIRST_ACTIVATION_TITLE)).toBeNull();
      expect(skippedRestartBackend.stableByteSnapshot()).toBe(skippedBytes);
    } finally {
      await skippedRestartScreen.unmount();
    }

    const upgradeBackend = new PublicMemoryBackend();
    const existingTitle = '升级前已经推进的任务';
    await seedAcknowledgedLifecycle(upgradeBackend, existingTitle);
    const upgraded = createP011Harness({
      backend: upgradeBackend.byteRestart(),
      idPrefix: 'p011-upgrade',
    });
    const upgradedScreen = await renderHarness(upgraded);
    try {
      expect(upgradedScreen.queryByText(FIRST_ACTIVATION_TITLE)).toBeNull();
      expect(
        (await upgraded.composition.service.getState()).tasks.some(
          task => task.title === existingTitle,
        ),
      ).toBe(true);
    } finally {
      await upgradedScreen.unmount();
    }

    const failedBackend = new PublicMemoryBackend();
    failedBackend.failNextRead(new Error('P011_GENERIC_STARTUP_READ_FAILED'));
    const failed = createP011Harness({
      backend: failedBackend,
      idPrefix: 'p011-read-failure',
    });
    const failedScreen = await renderHarness(failed);
    try {
      await waitFor(() =>
        expect(failedScreen.getByText(FIRST_ACTIVATION_READ_ERROR)).toBeTruthy(),
      );
      expect(failedScreen.queryByText(FIRST_ACTIVATION_TITLE)).toBeNull();
      expect(failed.notifications.permissionRequests).toHaveLength(0);
    } finally {
      await failedScreen.unmount();
    }
  });
});
