import {act, fireEvent, waitFor} from '@testing-library/react-native';
import {
  CapturingLocalTriggerResolver,
  DEFAULT_LOCAL_TIME,
  DeferredTomorrowNotifications,
  DISABLE_REMINDER,
  ENABLE_REMINDER,
  LOCAL_TRIGGER_ERROR,
  LOCAL_TRIGGER_NOT_FUTURE,
  MutableTimeZone,
  MutableTomorrowNotifications,
  OPEN_REMINDER_SETTINGS,
  REMINDER_DENIED_NONBLOCKING,
  REMINDER_TIME_INPUT,
  SAVE_REMINDER_TIME,
  chooseTomorrowFirst,
  createPartialTimeSeamApp,
  createP013Harness,
  notificationId,
  reminderSummary,
  renderHarness,
  seedTaskWithStep,
  settleUi,
  TIME_SEAMS_PARTIAL,
} from './gapP013TestKit';

const DAY = '2026-08-10';
const STARTED_AT = `${DAY}T08:00:00.000Z`;
const NEXT_DAY = '2026-08-11T07:30:00.000Z';

describe('GAP-P0-13 local tomorrow-reminder settings', () => {
  it('uses local 08:00 by default, saves 09:30 visibly, and cold-starts without a duplicate semantic replacement', async () => {
    const incompleteNotifications = new MutableTomorrowNotifications({
      permission: 'granted',
    });
    expect(() =>
      createPartialTimeSeamApp({
        at: STARTED_AT,
        idPrefix: 'p013-partial-time-seam',
        notifications: incompleteNotifications,
      }),
    ).toThrow(TIME_SEAMS_PARTIAL);
    expect(incompleteNotifications.replacements).toEqual([]);

    const defaultTrigger = '2026-08-11T00:00:00.000Z';
    const editedTrigger = '2026-08-11T01:30:00.000Z';
    const resolver = new CapturingLocalTriggerResolver(input => {
      if (input.wallClockTime === DEFAULT_LOCAL_TIME) return defaultTrigger;
      if (input.wallClockTime === '09:30') return editedTrigger;
      throw new Error(`TEST_UNEXPECTED_WALL_CLOCK:${input.wallClockTime}`);
    });
    const zone = new MutableTimeZone('Asia/Shanghai');
    const notifications = new MutableTomorrowNotifications({permission: 'granted'});
    const harness = createP013Harness({
      at: STARTED_AT,
      idPrefix: 'p013-edit',
      notifications,
      currentTimeZone: zone.current,
      resolver,
    });
    const task = await seedTaskWithStep(harness, {
      title: '明早整理发布清单',
      stepTitle: '核对第一项',
      important: true,
      urgent: false,
      operationPrefix: 'p013:edit:task',
    });
    const stableId = notificationId(DAY);
    let screen = await renderHarness(harness);
    try {
      await chooseTomorrowFirst(screen, task.title);
      await fireEvent.press(screen.getByRole('button', {name: OPEN_REMINDER_SETTINGS}));
      expect(screen.getByLabelText(REMINDER_TIME_INPUT).props.value).toBe(DEFAULT_LOCAL_TIME);
      await fireEvent.press(screen.getByRole('button', {name: ENABLE_REMINDER}));
      await waitFor(() =>
        expect(notifications.active(stableId)?.intents[0]?.triggerAt).toBe(defaultTrigger),
      );
      expect(screen.getByText(reminderSummary(DEFAULT_LOCAL_TIME))).toBeTruthy();
      expect(resolver.calls).toContainEqual({
        closureDayKey: DAY,
        wallClockTime: DEFAULT_LOCAL_TIME,
        timeZone: 'Asia/Shanghai',
        now: STARTED_AT,
      });

      await fireEvent.press(screen.getByRole('button', {name: OPEN_REMINDER_SETTINGS}));
      await fireEvent.changeText(screen.getByLabelText(REMINDER_TIME_INPUT), '09:30');
      await fireEvent.press(screen.getByRole('button', {name: SAVE_REMINDER_TIME}));
      await waitFor(() =>
        expect(notifications.active(stableId)?.intents[0]?.triggerAt).toBe(editedTrigger),
      );
      expect(screen.getByText(reminderSummary('09:30'))).toBeTruthy();
      expect(resolver.calls).toContainEqual({
        closureDayKey: DAY,
        wallClockTime: '09:30',
        timeZone: 'Asia/Shanghai',
        now: STARTED_AT,
      });
    } finally {
      await screen.unmount();
    }

    const restarted = createP013Harness({
      backend: harness.backend.byteRestart(),
      at: STARTED_AT,
      idPrefix: 'p013-edit-restart',
      notifications,
      currentTimeZone: zone.current,
      resolver: new CapturingLocalTriggerResolver(() => editedTrigger),
    });
    screen = await renderHarness(restarted);
    try {
      await waitFor(() =>
        expect(screen.getByText(reminderSummary('09:30'))).toBeTruthy(),
      );
      expect(notifications.active(stableId)?.intents[0]).toMatchObject({
        ruleId: stableId,
        triggerAt: editedTrigger,
      });
      expect(notifications.redundantSemanticReplacementAttempted).toBe(false);
    } finally {
      await screen.unmount();
    }
  });

  it('cancels while retaining tomorrow-first, never prompts while disabled, and keeps the exact start CTA usable after one denied re-enable', async () => {
    const notifications = new MutableTomorrowNotifications({permission: 'granted'});
    const zone = new MutableTimeZone('Asia/Shanghai');
    const resolver = new CapturingLocalTriggerResolver(
      () => '2026-08-11T00:00:00.000Z',
    );
    const harness = createP013Harness({
      at: STARTED_AT,
      idPrefix: 'p013-disable',
      notifications,
      currentTimeZone: zone.current,
      resolver,
    });
    const task = await seedTaskWithStep(harness, {
      title: '保留的明日第一项',
      stepTitle: '先做五分钟',
      important: true,
      urgent: true,
      operationPrefix: 'p013:disable:task',
    });
    const stableId = notificationId(DAY);
    let screen = await renderHarness(harness);
    try {
      await chooseTomorrowFirst(screen, task.title);
      await fireEvent.press(screen.getByRole('button', {name: OPEN_REMINDER_SETTINGS}));
      await fireEvent.press(screen.getByRole('button', {name: ENABLE_REMINDER}));
      await waitFor(() => expect(notifications.active(stableId)).not.toBeNull());
      await fireEvent.press(screen.getByRole('button', {name: OPEN_REMINDER_SETTINGS}));
      await fireEvent.press(screen.getByRole('button', {name: DISABLE_REMINDER}));
      await waitFor(() => expect(notifications.active(stableId)).toBeNull());
      expect(screen.getByText(`明日第一项已设定：${task.title}`)).toBeTruthy();
      expect(
        (await harness.composition.service.getState()).tasks.find(
          candidate => candidate.id === task.id,
        )?.status,
      ).toBe('pending');
    } finally {
      await screen.unmount();
    }

    notifications.setPermission('not_determined', 'denied');
    const disabledRestart = createP013Harness({
      backend: harness.backend.byteRestart(),
      at: STARTED_AT,
      idPrefix: 'p013-disable-restart',
      notifications,
      currentTimeZone: zone.current,
      resolver,
    });
    screen = await renderHarness(disabledRestart);
    try {
      await waitFor(() =>
        expect(screen.getByText(`明日第一项已设定：${task.title}`)).toBeTruthy(),
      );
      expect(notifications.permissionRequests).toEqual([]);
      await fireEvent.press(screen.getByRole('button', {name: OPEN_REMINDER_SETTINGS}));
      await fireEvent.press(screen.getByRole('button', {name: ENABLE_REMINDER}));
      await waitFor(() =>
        expect(screen.getByText(REMINDER_DENIED_NONBLOCKING)).toBeTruthy(),
      );
      expect(notifications.permissionRequests).toEqual(['not_determined']);
      await fireEvent.press(screen.getByRole('button', {name: ENABLE_REMINDER}));
      await settleUi();
      expect(notifications.permissionRequests).toEqual(['not_determined']);
      expect(screen.getByText(`明日第一项已设定：${task.title}`)).toBeTruthy();
    } finally {
      await screen.unmount();
    }

    const nextDay = createP013Harness({
      backend: disabledRestart.backend.byteRestart(),
      at: NEXT_DAY,
      idPrefix: 'p013-disable-next-day',
      notifications,
      currentTimeZone: zone.current,
      resolver,
    });
    screen = await renderHarness(nextDay);
    try {
      const startLabel = '开始明日第一项5分钟';
      await waitFor(() =>
        expect(screen.getByRole('button', {name: startLabel})).toBeTruthy(),
      );
      await fireEvent.press(screen.getByRole('button', {name: startLabel}));
      await waitFor(async () =>
        expect(
          (await nextDay.composition.service.getState()).tasks.find(
            candidate => candidate.id === task.id,
          )?.status,
        ).toBe('in_progress'),
      );
      expect(screen.getByText(`专注任务：${task.title}`)).toBeTruthy();
      expect(notifications.permissionRequests).toEqual(['not_determined']);
    } finally {
      await screen.unmount();
    }
  });

  it('queues rapid UI saves behind a controlled replace and re-resolves the same logical ID across DST, timezone change, and a past occurrence', async () => {
    const closureDay = '2026-03-07';
    const initialNow = `${closureDay}T17:00:00.000Z`;
    const dstGapTrigger = '2026-03-08T07:00:00.000Z';
    const zoneShiftNow = '2026-03-08T06:00:00.000Z';
    const zoneShiftTrigger = '2026-03-08T10:00:00.000Z';
    const pastNow = '2026-03-08T10:30:00.000Z';
    const nextFutureTrigger = '2026-03-09T09:30:00.000Z';
    const invalidPastTrigger = '2026-03-08T09:45:00.000Z';
    const retriedFutureTrigger = '2026-03-09T09:45:00.000Z';
    const zone = new MutableTimeZone('America/New_York');
    const resolver = new CapturingLocalTriggerResolver(input => {
      if (input.timeZone === 'America/New_York') {
        if (input.wallClockTime === '01:30') return '2026-03-08T06:30:00.000Z';
        if (input.wallClockTime === '02:30') return dstGapTrigger;
        return '2026-03-08T12:00:00.000Z';
      }
      if (input.now === zoneShiftNow) return zoneShiftTrigger;
      if (input.now === pastNow) return nextFutureTrigger;
      throw new Error(`TEST_UNEXPECTED_RESOLUTION:${JSON.stringify(input)}`);
    });
    const notifications = new DeferredTomorrowNotifications({permission: 'granted'});
    const harness = createP013Harness({
      at: initialNow,
      idPrefix: 'p013-dst',
      notifications,
      currentTimeZone: zone.current,
      resolver,
    });
    const task = await seedTaskWithStep(harness, {
      title: 'DST 后的明日第一项',
      stepTitle: '验证本地墙钟',
      important: true,
      urgent: false,
      operationPrefix: 'p013:dst:task',
    });
    const stableId = notificationId(closureDay);
    let screen = await renderHarness(harness);
    try {
      await chooseTomorrowFirst(screen, task.title);
      await fireEvent.press(screen.getByRole('button', {name: OPEN_REMINDER_SETTINGS}));
      await fireEvent.press(screen.getByRole('button', {name: ENABLE_REMINDER}));
      await waitFor(() => expect(notifications.active(stableId)).not.toBeNull());

      await fireEvent.press(screen.getByRole('button', {name: OPEN_REMINDER_SETTINGS}));
      const held = notifications.deferNextScheduledReplace();
      await fireEvent.changeText(screen.getByLabelText(REMINDER_TIME_INPUT), '01:30');
      await fireEvent.press(screen.getByRole('button', {name: SAVE_REMINDER_TIME}));
      await held.reached;
      await fireEvent.changeText(screen.getByLabelText(REMINDER_TIME_INPUT), '02:30');
      await fireEvent.press(screen.getByRole('button', {name: SAVE_REMINDER_TIME}));
      await act(async () => {
        held.release();
        await settleUi();
      });
      await waitFor(() =>
        expect(notifications.active(stableId)?.intents[0]?.triggerAt).toBe(dstGapTrigger),
      );
      expect(screen.getByText(reminderSummary('02:30'))).toBeTruthy();
      expect(resolver.calls.slice(-2).map(call => call.wallClockTime)).toEqual([
        '01:30',
        '02:30',
      ]);
      expect(resolver.calls.at(-1)).toEqual({
        closureDayKey: closureDay,
        wallClockTime: '02:30',
        timeZone: 'America/New_York',
        now: initialNow,
      });
    } finally {
      await screen.unmount();
    }

    zone.set('America/Los_Angeles');
    const shifted = createP013Harness({
      backend: harness.backend.byteRestart(),
      at: zoneShiftNow,
      idPrefix: 'p013-dst-zone-shift',
      notifications,
      currentTimeZone: zone.current,
      resolver,
    });
    screen = await renderHarness(shifted);
    try {
      await waitFor(() =>
        expect(notifications.active(stableId)?.intents[0]?.triggerAt).toBe(
          zoneShiftTrigger,
        ),
      );
      expect(resolver.calls.at(-1)).toEqual({
        closureDayKey: closureDay,
        wallClockTime: '02:30',
        timeZone: 'America/Los_Angeles',
        now: zoneShiftNow,
      });
      expect(notifications.replacements.at(-1)?.next.intents[0]?.ruleId).toBe(stableId);
      expect(screen.getByText(reminderSummary('02:30'))).toBeTruthy();
    } finally {
      await screen.unmount();
    }

    const afterOccurrence = createP013Harness({
      backend: shifted.backend.byteRestart(),
      at: pastNow,
      idPrefix: 'p013-dst-past',
      notifications,
      currentTimeZone: zone.current,
      resolver,
    });
    screen = await renderHarness(afterOccurrence);
    try {
      await waitFor(() =>
        expect(notifications.active(stableId)?.intents[0]?.triggerAt).toBe(
          nextFutureTrigger,
        ),
      );
      expect(Date.parse(nextFutureTrigger)).toBeGreaterThan(Date.parse(pastNow));
      expect(resolver.calls.at(-1)).toEqual({
        closureDayKey: closureDay,
        wallClockTime: '02:30',
        timeZone: 'America/Los_Angeles',
        now: pastNow,
      });
      expect(notifications.replacements.at(-1)?.next.intents[0]?.ruleId).toBe(stableId);
      expect(screen.getByText(reminderSummary('02:30'))).toBeTruthy();

      resolver.setResolver(() => invalidPastTrigger);
      await fireEvent.press(screen.getByRole('button', {name: OPEN_REMINDER_SETTINGS}));
      await fireEvent.changeText(screen.getByLabelText(REMINDER_TIME_INPUT), '02:45');
      await fireEvent.press(screen.getByRole('button', {name: SAVE_REMINDER_TIME}));
      await waitFor(() =>
        expect(screen.getByLabelText(LOCAL_TRIGGER_NOT_FUTURE)).toBeTruthy(),
      );
      expect(screen.getByText(LOCAL_TRIGGER_ERROR)).toBeTruthy();
      expect(Date.parse(invalidPastTrigger)).not.toBeGreaterThan(Date.parse(pastNow));
      expect(notifications.active(stableId)?.intents[0]).toMatchObject({
        ruleId: stableId,
        triggerAt: nextFutureTrigger,
      });

      resolver.setResolver(() => 'not-an-iso-instant');
      await fireEvent.press(screen.getByRole('button', {name: SAVE_REMINDER_TIME}));
      await waitFor(() =>
        expect(screen.getByLabelText(LOCAL_TRIGGER_NOT_FUTURE)).toBeTruthy(),
      );
      expect(notifications.active(stableId)?.intents[0]).toMatchObject({
        ruleId: stableId,
        triggerAt: nextFutureTrigger,
      });
    } finally {
      await screen.unmount();
    }

    const afterInvalid = createP013Harness({
      backend: afterOccurrence.backend.byteRestart(),
      at: pastNow,
      idPrefix: 'p013-dst-invalid-restart',
      notifications,
      currentTimeZone: zone.current,
      resolver,
    });
    screen = await renderHarness(afterInvalid);
    try {
      await waitFor(() =>
        expect(screen.getByText(reminderSummary('02:30'))).toBeTruthy(),
      );
      expect(notifications.active(stableId)?.intents[0]).toMatchObject({
        ruleId: stableId,
        triggerAt: nextFutureTrigger,
      });

      resolver.setResolver(input => {
        expect(input).toEqual({
          closureDayKey: closureDay,
          wallClockTime: '02:45',
          timeZone: 'America/Los_Angeles',
          now: pastNow,
        });
        return retriedFutureTrigger;
      });
      await fireEvent.press(screen.getByRole('button', {name: OPEN_REMINDER_SETTINGS}));
      expect(screen.getByLabelText(REMINDER_TIME_INPUT).props.value).toBe('02:30');
      await fireEvent.changeText(screen.getByLabelText(REMINDER_TIME_INPUT), '02:45');
      await fireEvent.press(screen.getByRole('button', {name: SAVE_REMINDER_TIME}));
      await waitFor(() =>
        expect(notifications.active(stableId)?.intents[0]?.triggerAt).toBe(
          retriedFutureTrigger,
        ),
      );
      expect(Date.parse(retriedFutureTrigger)).toBeGreaterThan(Date.parse(pastNow));
      expect(notifications.active(stableId)?.intents[0]?.ruleId).toBe(stableId);
      expect(screen.getByText(reminderSummary('02:45'))).toBeTruthy();
      expect(screen.queryByText(LOCAL_TRIGGER_ERROR)).toBeNull();
    } finally {
      await screen.unmount();
    }
  });
});
