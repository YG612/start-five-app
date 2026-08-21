import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {createStartFiveApp} from '../../src/app/startFiveApp';
import {
  WorkspaceBackend,
  WorkspaceIds,
} from '../gap-p0-06r1/gapP006TestKit';

const NOW = '2026-08-21T08:00:00.000Z';

describe('P19 task draft process restart', () => {
  it('restores an unsubmitted create draft after the UI process is recreated', async () => {
    const backend = new WorkspaceBackend();
    const first = createStartFiveApp({
      storageBackend: backend,
      now: () => NOW,
      idGenerator: new WorkspaceIds(['unused-one']).next,
      currentTimeZone: () => 'Asia/Shanghai',
      resolveLocalTrigger: input => new Date(`${input.closureDayKey}T12:00:00.000Z`).toISOString(),
    });
    const firstScreen = await render(<first.AppRoot />);
    await waitFor(() => expect(firstScreen.getByRole('button', {name: '添加任务'})).toBeTruthy());
    await fireEvent.press(firstScreen.getByRole('button', {name: '添加任务'}));
    await fireEvent.changeText(firstScreen.getByLabelText('任务标题'), '进程重启后仍在的草稿');
    await new Promise<void>(resolve => setTimeout(resolve, 350));
    await firstScreen.unmount();

    const restarted = createStartFiveApp({
      storageBackend: backend,
      now: () => NOW,
      idGenerator: new WorkspaceIds(['unused-two']).next,
      currentTimeZone: () => 'Asia/Shanghai',
      resolveLocalTrigger: input => new Date(`${input.closureDayKey}T12:00:00.000Z`).toISOString(),
    });
    const restartedScreen = await render(<restarted.AppRoot />);
    await waitFor(() =>
      expect(restartedScreen.getByLabelText('任务标题').props.value).toBe('进程重启后仍在的草稿'),
    );
    expect(restartedScreen.getByText('已恢复上次未完成的任务草稿。')).toBeTruthy();
    await restartedScreen.unmount();
  });
});
