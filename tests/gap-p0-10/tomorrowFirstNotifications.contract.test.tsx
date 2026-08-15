import {fireEvent, waitFor} from '@testing-library/react-native';
import {
  DAY_ONE,
  DAY_ONE_START,
  DAY_TWO_START,
  PublicTomorrowFirstNotifications,
  REMINDER_DENIED_NONBLOCKING,
  SET_TOMORROW_REMINDER,
  TOMORROW_TRIGGER,
  chooseTomorrowFirst,
  completeTaskThroughPublicService,
  createP010Harness,
  deleteTaskThroughWorkspace,
  notificationId,
  renderHarness,
  seedTaskWithStep,
  setTomorrowReminder,
  tomorrowTap,
} from './gapP010TestKit';

describe('GAP-P0-10 tomorrow-first reminder and notification return', () => {
  it('keeps day closure nonblocking when notification permission is denied and never loops the prompt in one session', async () => {
    const title = '明早先整理发布清单';
    const notifications = new PublicTomorrowFirstNotifications({
      permission: 'not_determined',
      requestResult: 'denied',
    });
    const harness = createP010Harness({
      at: DAY_ONE_START,
      idPrefix: 'p010-denied',
      notifications,
    });
    await seedTaskWithStep(harness, {
      title,
      stepTitle: '列出三个发布检查项',
      important: true,
      urgent: false,
      operationPrefix: 'p010:denied:task',
    });
    const screen = await renderHarness(harness);
    try {
      await chooseTomorrowFirst(screen, title);
      await setTomorrowReminder(screen);
      expect(screen.getByText(`明日第一项已设定：${title}`)).toBeTruthy();
      expect(screen.getByText(REMINDER_DENIED_NONBLOCKING)).toBeTruthy();
      expect(notifications.permissionRequests).toEqual(['not_determined']);
      expect(notifications.replacements).toEqual([]);

      await fireEvent.press(
        screen.getByRole('button', {name: SET_TOMORROW_REMINDER}),
      );
      await waitFor(() =>
        expect(notifications.permissionRequests).toEqual(['not_determined']),
      );
      expect(screen.getByText(`明日第一项已设定：${title}`)).toBeTruthy();
    } finally {
      await screen.unmount();
    }
  });

  it('replaces the exact target, cancels completed or deleted targets, and hydrates byte restarts without duplicate logical scheduling', async () => {
    const titleA = '低优先级明日任务 A';
    const titleB = '需要优先完成的明日任务 B';
    const titleC = '随后删除的明日任务 C';
    const stableId = notificationId(DAY_ONE);
    const notifications = new PublicTomorrowFirstNotifications({
      permission: 'granted',
    });
    const harness = createP010Harness({
      at: DAY_ONE_START,
      idPrefix: 'p010-schedule',
      notifications,
    });
    const taskA = await seedTaskWithStep(harness, {
      title: titleA,
      stepTitle: '打开 A 文档',
      important: false,
      urgent: false,
      operationPrefix: 'p010:schedule:a',
    });
    const taskB = await seedTaskWithStep(harness, {
      title: titleB,
      stepTitle: '完成 B 的第一步',
      important: true,
      urgent: true,
      operationPrefix: 'p010:schedule:b',
    });
    const taskC = await seedTaskWithStep(harness, {
      title: titleC,
      stepTitle: '打开 C 草稿',
      important: true,
      urgent: false,
      operationPrefix: 'p010:schedule:c',
    });
    let screen = await renderHarness(harness);
    try {
      await chooseTomorrowFirst(screen, titleA);
      await setTomorrowReminder(screen);
      expect(notifications.active(stableId)).toMatchObject({
        taskId: taskA.id,
        scheduled: true,
        intents: [
          {
            taskId: taskA.id,
            ruleId: stableId,
            kind: 'start',
            triggerAt: TOMORROW_TRIGGER,
          },
        ],
      });

      await chooseTomorrowFirst(screen, titleB);
      await waitFor(() =>
        expect(notifications.active(stableId)?.taskId).toBe(taskB.id),
      );
      expect(
        notifications.replacements.some(
          call => call.next.taskId === taskA.id && !call.next.scheduled,
        ),
      ).toBe(true);
      expect(notifications.active(stableId)?.intents[0]?.ruleId).toBe(stableId);
    } finally {
      await screen.unmount();
    }

    const restartedNotifications = notifications.byteRestart();
    const restarted = createP010Harness({
      backend: harness.backend.byteRestart(),
      at: DAY_ONE_START,
      idPrefix: 'p010-schedule-restart',
      notifications: restartedNotifications,
    });
    screen = await renderHarness(restarted);
    try {
      expect(restartedNotifications.active(stableId)?.taskId).toBe(taskB.id);
      expect(restartedNotifications.replacements).toEqual([]);

      await completeTaskThroughPublicService(
        restarted,
        taskB,
        'p010:schedule:complete-b',
      );
      const afterBCompletion = await restarted.composition.service.getState();
      expect(
        afterBCompletion.tasks.find(task => task.id === taskA.id)?.status,
      ).toBe('pending');
      expect(
        afterBCompletion.tasks.find(task => task.id === taskC.id)?.status,
      ).toBe('pending');
      await screen.unmount();
      screen = await renderHarness(restarted);
      await waitFor(() =>
        expect(restartedNotifications.active(stableId)).toBeNull(),
      );
      expect(
        restartedNotifications.replacements.some(
          call => call.next.taskId === taskB.id && !call.next.scheduled,
        ),
      ).toBe(true);

      await chooseTomorrowFirst(screen, titleC);
      await waitFor(() =>
        expect(restartedNotifications.active(stableId)?.taskId).toBe(taskC.id),
      );
      await fireEvent.press(
        screen.getByRole('button', {name: '回到象限'}),
      );
      await fireEvent.press(screen.getByRole('tab', {name: '象限'}));
      await deleteTaskThroughWorkspace(screen, 'Q2', titleC);
      await waitFor(() =>
        expect(restartedNotifications.active(stableId)).toBeNull(),
      );
      expect(
        restartedNotifications.replacements.some(
          call => call.next.taskId === taskC.id && !call.next.scheduled,
        ),
      ).toBe(true);
    } finally {
      await screen.unmount();
    }
  });

  it('routes cold and hot notification taps to the exact card without auto-focus and revalidates an unavailable target', async () => {
    const titleA = '通知应精确打开的任务 A';
    const titleB = '不得自动启动的推荐任务 B';
    const seedNotifications = new PublicTomorrowFirstNotifications({
      permission: 'granted',
    });
    const seed = createP010Harness({
      at: DAY_ONE_START,
      idPrefix: 'p010-tap-seed',
      notifications: seedNotifications,
    });
    const taskA = await seedTaskWithStep(seed, {
      title: titleA,
      stepTitle: '打开 A 的精确入口',
      important: false,
      urgent: false,
      operationPrefix: 'p010:tap:a',
    });
    const taskB = await seedTaskWithStep(seed, {
      title: titleB,
      stepTitle: '保持 B 未开始',
      important: true,
      urgent: true,
      operationPrefix: 'p010:tap:b',
    });
    const seedScreen = await renderHarness(seed);
    try {
      await chooseTomorrowFirst(seedScreen, titleA);
    } finally {
      await seedScreen.unmount();
    }

    const route = tomorrowTap(taskA.id);
    const notifications = seedNotifications.byteRestart({initialTap: route});
    const nextDay = createP010Harness({
      backend: seed.backend.byteRestart(),
      at: DAY_TWO_START,
      idPrefix: 'p010-tap-next-day',
      notifications,
    });
    const screen = await renderHarness(nextDay);
    try {
      await waitFor(() =>
        expect(
          screen.getByRole('header', {name: '快速编辑任务'}),
        ).toBeTruthy(),
      );
      expect(screen.getAllByText(titleA).length).toBeGreaterThan(0);
      expect(screen.queryByLabelText('任务标题')).toBeNull();
      expect(screen.queryByText('正在先做 5 分钟')).toBeNull();
      let state = await nextDay.composition.service.getState();
      expect(state.tasks.find(task => task.id === taskA.id)?.status).toBe(
        'pending',
      );
      expect(state.tasks.find(task => task.id === taskB.id)?.status).toBe(
        'pending',
      );

      await fireEvent.press(screen.getByRole('button', {name: '关闭任务面板'}));
      await fireEvent.press(screen.getByRole('tab', {name: '专注'}));
      await fireEvent.press(screen.getByRole('button', {name: '查看最近专注'}));
      await waitFor(() => expect(screen.getByText('专注历史')).toBeTruthy());
      await notifications.emitTap(route);
      await waitFor(() =>
        expect(
          screen.getByRole('header', {name: '快速编辑任务'}),
        ).toBeTruthy(),
      );
      expect(screen.getAllByText(titleA).length).toBeGreaterThan(0);
      expect(screen.queryByLabelText('任务标题')).toBeNull();
      expect(screen.queryByText('正在先做 5 分钟')).toBeNull();

      await fireEvent.press(screen.getByRole('button', {name: '编辑更多'}));
      await fireEvent.press(screen.getByRole('button', {name: '删除任务'}));
      await fireEvent.press(screen.getByRole('button', {name: '确认删除'}));
      await waitFor(() =>
        expect(screen.queryByRole('button', {name: `清理区任务：${titleA}`})).toBeNull(),
      );
      await notifications.emitTap(route);
      await waitFor(() =>
        expect(
          screen.getByText('提醒对应的任务已完成或不可用。'),
        ).toBeTruthy(),
      );
      expect(screen.queryByText('正在先做 5 分钟')).toBeNull();
      state = await nextDay.composition.service.getState();
      expect(state.tasks.find(task => task.id === taskA.id)).toBeUndefined();
      expect(state.tasks.find(task => task.id === taskB.id)?.status).toBe(
        'pending',
      );
    } finally {
      await screen.unmount();
    }
  });
});
