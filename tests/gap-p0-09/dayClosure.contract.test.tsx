import {fireEvent, waitFor} from '@testing-library/react-native';
import {
  chooseTomorrowLabel,
  createP007Harness,
  DAY_ONE_REVIEW_END,
  DAY_ONE_START,
  DAY_TWO_START,
  deleteTaskThroughWorkspace,
  finishAndAcknowledgeThroughUi,
  openDayClosureFromHistory,
  openDayClosureFromWorkspace,
  PublicMemoryBackend,
  queryReceiptHistory,
  renderHarness,
  seedTaskWithStep,
  selectTomorrowFirst,
  START_CURRENT_RECOMMENDATION,
  START_TOMORROW_FIRST,
} from './dayClosureTestKit';

describe('GAP-P0-09 day closure and directed next-day focus', () => {
  it('persists one tomorrow-first choice and consumes its directed start once after the UTC day changes', async () => {
    const completedTitle = '今天已经完成的交付';
    const selectedTitle = '明早先写产品方案';
    const recommendedTitle = '当前更紧急的推荐';
    const backend = new PublicMemoryBackend();
    const harness = createP007Harness({
      backend,
      at: DAY_ONE_START,
      idPrefix: 'p009-directed',
    });
    const completed = await seedTaskWithStep(harness, {
      title: completedTitle,
      stepTitle: '交付最后一小步',
      important: false,
      urgent: true,
      operationPrefix: 'p009:completed',
    });
    const selected = await seedTaskWithStep(harness, {
      title: selectedTitle,
      stepTitle: '先列三个要点',
      important: true,
      urgent: false,
      operationPrefix: 'p009:selected',
    });
    const recommended = await seedTaskWithStep(harness, {
      title: recommendedTitle,
      stepTitle: '先处理阻塞',
      important: true,
      urgent: true,
      operationPrefix: 'p009:recommended',
    });
    let screen = await renderHarness(harness);
    try {
      await finishAndAcknowledgeThroughUi(harness, screen, {
        title: completedTitle,
        quadrant: 'Q3',
      });
      expect(screen.getByText(`今日推荐：${recommendedTitle}`)).toBeTruthy();
      await openDayClosureFromHistory(screen);
      expect(screen.getByText('今日完成：1项')).toBeTruthy();
      expect(screen.getByText('今日专注：1次 / 2分钟')).toBeTruthy();
      expect(
        screen.getByRole('button', {name: chooseTomorrowLabel(selectedTitle)}),
      ).toBeTruthy();
      expect(
        screen.getByRole('button', {
          name: chooseTomorrowLabel(recommendedTitle),
        }),
      ).toBeTruthy();
      expect(
        screen.queryByRole('button', {
          name: chooseTomorrowLabel(completedTitle),
        }),
      ).toBeNull();
      await selectTomorrowFirst(screen, selectedTitle);

      await screen.unmount();
      screen = await renderHarness(harness);
      expect(
        screen.getAllByText(`明日第一项已设定：${selectedTitle}`),
      ).toHaveLength(1);
    } finally {
      await screen.unmount();
    }

    const sameDayBackend = backend.byteRestart();
    const sameDay = createP007Harness({
      backend: sameDayBackend,
      at: DAY_ONE_REVIEW_END,
      idPrefix: 'p009-directed-same-day',
    });
    const sameDayScreen = await renderHarness(sameDay);
    try {
      expect(
        sameDayScreen.getAllByText(`明日第一项已设定：${selectedTitle}`),
      ).toHaveLength(1);
    } finally {
      await sameDayScreen.unmount();
    }

    const nextDayBackend = sameDayBackend.byteRestart();
    const nextDay = createP007Harness({
      backend: nextDayBackend,
      at: DAY_TWO_START,
      idPrefix: 'p009-directed-next-day',
    });
    const nextDayScreen = await renderHarness(nextDay);
    try {
      expect(nextDayScreen.getByText(`明日第一项：${selectedTitle}`)).toBeTruthy();
      expect(nextDayScreen.getByText(`今日推荐：${recommendedTitle}`)).toBeTruthy();
      await fireEvent.press(
        nextDayScreen.getByRole('button', {name: START_TOMORROW_FIRST}),
      );
      await waitFor(() =>
        expect(nextDayScreen.getByText(`专注任务：${selectedTitle}`)).toBeTruthy(),
      );
      expect(nextDayScreen.queryByText(`专注任务：${recommendedTitle}`)).toBeNull();
      expect(
        nextDayScreen.queryByRole('button', {name: START_TOMORROW_FIRST}),
      ).toBeNull();

      const state = await nextDay.composition.service.getState();
      expect(state.tasks.find(task => task.id === completed.id)?.status).toBe(
        'completed',
      );
      expect(state.tasks.find(task => task.id === selected.id)?.status).toBe(
        'in_progress',
      );
      expect(state.tasks.find(task => task.id === recommended.id)?.status).toBe(
        'pending',
      );
      expect((await queryReceiptHistory(nextDay)).receipts).toHaveLength(1);
    } finally {
      await nextDayScreen.unmount();
    }

    const consumedBytes = nextDayBackend.stableByteSnapshot();
    const consumedBackend = nextDayBackend.byteRestart();
    const consumed = createP007Harness({
      backend: consumedBackend,
      at: DAY_TWO_START,
      idPrefix: 'p009-directed-consumed',
    });
    const consumedScreen = await renderHarness(consumed);
    try {
      await waitFor(() =>
        expect(consumedScreen.getByText(`专注任务：${selectedTitle}`)).toBeTruthy(),
      );
      expect(
        consumedScreen.queryByRole('button', {name: START_TOMORROW_FIRST}),
      ).toBeNull();
      expect((await queryReceiptHistory(consumed)).receipts).toHaveLength(1);
      expect(consumedBackend.stableByteSnapshot()).toBe(consumedBytes);
    } finally {
      await consumedScreen.unmount();
    }
  });

  it('recovers when the selected task is deleted before the next UTC day and starts the current recommendation', async () => {
    const selectedTitle = '明早第一项草稿';
    const fallbackTitle = '仍可执行的当前推荐';
    const backend = new PublicMemoryBackend();
    const harness = createP007Harness({
      backend,
      at: DAY_ONE_START,
      idPrefix: 'p009-unavailable',
    });
    const selected = await seedTaskWithStep(harness, {
      title: selectedTitle,
      stepTitle: '打开草稿',
      important: false,
      urgent: false,
      operationPrefix: 'p009:unavailable:selected',
    });
    const fallback = await seedTaskWithStep(harness, {
      title: fallbackTitle,
      stepTitle: '处理关键阻塞',
      important: true,
      urgent: true,
      operationPrefix: 'p009:unavailable:fallback',
    });
    const screen = await renderHarness(harness);
    try {
      await openDayClosureFromWorkspace(screen);
      await selectTomorrowFirst(screen, selectedTitle);
      await deleteTaskThroughWorkspace(screen, 'Q4', selectedTitle);
      expect(
        (await harness.composition.service.getState()).tasks.find(
          task => task.id === selected.id,
        ),
      ).toBeUndefined();
    } finally {
      await screen.unmount();
    }

    const nextDayBackend = backend.byteRestart();
    const nextDay = createP007Harness({
      backend: nextDayBackend,
      at: DAY_TWO_START,
      idPrefix: 'p009-unavailable-next-day',
    });
    const nextDayScreen = await renderHarness(nextDay);
    try {
      expect(
        nextDayScreen.getByText(`明日第一项已不可用：${selectedTitle}`),
      ).toBeTruthy();
      expect(
        nextDayScreen.getByRole('button', {name: '重新选择明日第一项'}),
      ).toBeTruthy();
      expect(nextDayScreen.getByText(`今日推荐：${fallbackTitle}`)).toBeTruthy();
      expect(
        nextDayScreen.queryByText(`专注任务：${fallbackTitle}`),
      ).toBeNull();
      const beforeStart = await nextDay.composition.service.getState();
      expect(
        beforeStart.tasks.find(task => task.id === fallback.id)?.status,
      ).toBe('pending');
      await fireEvent.press(
        nextDayScreen.getByRole('button', {
          name: START_CURRENT_RECOMMENDATION,
        }),
      );
      await waitFor(() =>
        expect(nextDayScreen.getByText(`专注任务：${fallbackTitle}`)).toBeTruthy(),
      );
      const state = await nextDay.composition.service.getState();
      expect(state.tasks.find(task => task.id === selected.id)).toBeUndefined();
      expect(state.tasks.find(task => task.id === fallback.id)?.status).toBe(
        'in_progress',
      );
    } finally {
      await nextDayScreen.unmount();
    }

    const settledBytes = nextDayBackend.stableByteSnapshot();
    const restartedBackend = nextDayBackend.byteRestart();
    const restarted = createP007Harness({
      backend: restartedBackend,
      at: DAY_TWO_START,
      idPrefix: 'p009-unavailable-restart',
    });
    const restartedScreen = await renderHarness(restarted);
    try {
      await waitFor(() =>
        expect(restartedScreen.getByText(`专注任务：${fallbackTitle}`)).toBeTruthy(),
      );
      expect(
        restartedScreen.queryByText(`明日第一项已不可用：${selectedTitle}`),
      ).toBeNull();
      expect(
        restartedScreen.queryByRole('button', {
          name: START_CURRENT_RECOMMENDATION,
        }),
      ).toBeNull();
      expect(restartedBackend.stableByteSnapshot()).toBe(settledBytes);
    } finally {
      await restartedScreen.unmount();
    }
  });
});
