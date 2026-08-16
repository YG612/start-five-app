import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {createStartFiveApp} from '../../src/app/startFiveApp';
import {createQuadrantHomePreferences} from '../../src/data/quadrantHomePreferences';
import {MutableTomorrowNotifications} from '../gap-p0-13/gapP013TestKit';
import {
  flushUiWork,
  WorkspaceBackend,
  WorkspaceClock,
  WorkspaceIds,
} from '../gap-p0-06r1/gapP006TestKit';

const NOW = '2026-08-16T08:00:00.000Z';

describe('P18 settings experience', () => {
  it('discovers all settings groups and requests notification permission only after the explicit tap', async () => {
    const notifications = new MutableTomorrowNotifications({
      permission: 'not_determined',
      requestResult: 'granted',
    });
    const composition = createStartFiveApp({
      storageBackend: new WorkspaceBackend(),
      now: () => NOW,
      idGenerator: new WorkspaceIds(['p18-permission-unused']).next,
      tomorrowFirstNotifications: notifications,
    });
    const screen = await render(<composition.AppRoot />);
    try {
      await waitFor(() => expect(screen.getByRole('tab', {name: '我的'})).toBeTruthy());
      expect(notifications.permissionRequests).toEqual([]);
      expect(screen.queryByText('三步就能开始')).toBeNull();
      await fireEvent.press(screen.getByRole('tab', {name: '我的'}));
      await flushUiWork();
      expect(notifications.permissionRequests).toEqual([]);
      expect(screen.getByText('开启通知后，专注时段才能按时提醒。')).toBeTruthy();
      expect(screen.getByRole('button', {name: '通知权限'})).toBeTruthy();
      expect(screen.getByRole('button', {name: '本机数据概览'})).toBeTruthy();
      expect(screen.getByRole('button', {name: '删除全部数据'})).toBeTruthy();
      expect(screen.getByRole('button', {name: '一分钟了解四个页面'})).toBeTruthy();

      await fireEvent.press(screen.getByRole('button', {name: '通知权限'}));
      await waitFor(() => expect(notifications.permissionRequests).toEqual(['not_determined']));
      await waitFor(() => expect(screen.getByText('已开启')).toBeTruthy());
    } finally {
      await screen.unmount();
    }
  });

  it('applies saved defaults only to new schedules and exposes an undoable settings change', async () => {
    const backend = new WorkspaceBackend();
    const clock = new WorkspaceClock(NOW);
    const composition = createStartFiveApp({
      storageBackend: backend,
      now: clock.now,
      idGenerator: new WorkspaceIds(['p18-schedule-one', 'p18-schedule-two']).next,
    });
    const screen = await render(<composition.AppRoot />);
    try {
      await waitFor(() => expect(screen.getByRole('tab', {name: '我的'})).toBeTruthy());
      await fireEvent.press(screen.getByRole('tab', {name: '我的'}));
      await fireEvent.press(screen.getByRole('button', {name: '常用专注时长'}));
      await fireEvent.press(screen.getByRole('button', {name: '25 分钟'}));
      expect(screen.getByText('常用专注时长已更新。')).toBeTruthy();
      expect(screen.getByRole('button', {name: '撤销设置修改'})).toBeTruthy();

      await fireEvent.press(screen.getByRole('tab', {name: '专注'}));
      await fireEvent.press(screen.getAllByRole('button', {name: '安排一段专注'})[0]!);
      expect(screen.getByRole('tab', {name: '25 分钟'}).props.accessibilityState).toMatchObject({selected: true});
      await fireEvent.press(screen.getByRole('button', {name: '保存专注时段'}));
      await flushUiWork();
      await expect(composition.focusSchedules.list()).resolves.toEqual([
        expect.objectContaining({durationMinutes: 25}),
      ]);

      await fireEvent.press(screen.getByRole('tab', {name: '我的'}));
      await fireEvent.press(screen.getByRole('button', {name: '常用专注时长'}));
      await fireEvent.press(screen.getByRole('button', {name: '50 分钟'}));
      await flushUiWork();
      await expect(composition.focusSchedules.list()).resolves.toEqual([
        expect.objectContaining({durationMinutes: 25}),
      ]);
      await expect(createQuadrantHomePreferences(backend).readSettings()).resolves.toMatchObject({
        preferredFocusMinutes: 50,
      });

      await fireEvent.press(screen.getByRole('button', {name: '撤销设置修改'}));
      await flushUiWork();
      await expect(createQuadrantHomePreferences(backend).readSettings()).resolves.toMatchObject({
        preferredFocusMinutes: 25,
      });
    } finally {
      await screen.unmount();
    }
  });

  it('keeps merge unavailable and requires exact destructive confirmation text', async () => {
    const composition = createStartFiveApp({
      storageBackend: new WorkspaceBackend(),
      now: () => NOW,
      idGenerator: new WorkspaceIds(['p18-delete-unused']).next,
    });
    const screen = await render(<composition.AppRoot />);
    try {
      await waitFor(() => expect(screen.getByRole('tab', {name: '我的'})).toBeTruthy());
      await fireEvent.press(screen.getByRole('tab', {name: '我的'}));
      await fireEvent.press(screen.getByRole('button', {name: '隐私说明'}));
      expect(screen.getByText(/当前只提供预览后安全替换/)).toBeTruthy();
      expect(screen.queryByRole('button', {name: /合并/})).toBeNull();
      await fireEvent.press(screen.getByRole('button', {name: '关闭'}));

      await fireEvent.press(screen.getByRole('button', {name: '删除全部数据'}));
      const confirm = screen.getByRole('button', {name: '确认删除全部数据'});
      expect(confirm.props.accessibilityState).toMatchObject({disabled: true});
      await fireEvent.changeText(screen.getByLabelText('删除确认文本'), '删除全部');
      expect(screen.getByRole('button', {name: '确认删除全部数据'}).props.accessibilityState).toMatchObject({disabled: true});
      await fireEvent.changeText(screen.getByLabelText('删除确认文本'), '删除全部数据');
      expect(screen.getByRole('button', {name: '确认删除全部数据'}).props.accessibilityState).toMatchObject({disabled: false});
    } finally {
      await screen.unmount();
    }
  });
});
