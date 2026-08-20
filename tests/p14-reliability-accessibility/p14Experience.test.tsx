import React from 'react';
import {AccessibilityInfo} from 'react-native';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {
  createLifecycleTask,
  createWorkspaceHarness,
  WorkspaceBackend,
  WorkspaceClock,
  WorkspaceIds,
} from '../gap-p0-06r1/gapP006TestKit';

const NOW = '2026-08-15T08:00:00.000Z';

describe('P14 visible accessibility experience', () => {
  it('defaults once to list for a screen reader, preserves map entry and exposes complete node semantics', async () => {
    const screenReader = jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled')
      .mockResolvedValue(true);
    const backend = new WorkspaceBackend();
    const harness = createWorkspaceHarness(
      backend,
      new WorkspaceClock(NOW),
      new WorkspaceIds(['p14-visible']),
    );
    const task = await createLifecycleTask(harness, {
      title: '准备无障碍发布',
      description: '',
      important: true,
      urgent: false,
      scheduledStartAt: null,
      dueAt: '2026-08-20T08:00:00.000Z',
      estimatedMinutes: 25,
      firstStep: '打开检查清单',
    }, 'p14:visible:create');
    const screen = await render(<harness.composition.AppRoot />);
    try {
      await waitFor(() =>
        expect(screen.getByRole('tab', {name: '清单'}).props.accessibilityState)
          .toMatchObject({selected: true}),
      );
      expect(screen.getByRole('tab', {name: '地图'})).toBeTruthy();
      await fireEvent.press(screen.getByRole('tab', {name: '地图'}));
      await waitFor(() => {
        const node = screen.getByRole('button', {name: `成长区任务：${task.title}`});
        expect(node.props.accessibilityValue.text).toContain('打开检查清单');
        expect(node.props.accessibilityValue.text).toContain('进度');
        expect(node.props.accessibilityHint).toContain('按住一秒进入任务布局模式');
      });
    } finally {
      await screen.unmount();
      screenReader.mockRestore();
    }
  });
});
