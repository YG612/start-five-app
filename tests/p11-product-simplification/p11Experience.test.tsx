import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {InMemoryProductMetricPort} from '../../src/application/productMetrics';
import {
  createLifecycleTask,
  createWorkspaceHarness,
  WorkspaceBackend,
  WorkspaceClock,
  WorkspaceIds,
} from '../gap-p0-06r1/gapP006TestKit';

const NOW = '2026-08-15T08:00:00.000Z';

describe('P11-01 direct home experience', () => {
  it('shows one primary action for an empty home and focuses first-task input', async () => {
    const metrics = new InMemoryProductMetricPort();
    const harness = createWorkspaceHarness(
      new WorkspaceBackend(),
      new WorkspaceClock(NOW),
      new WorkspaceIds(['p11-first-task']),
      {productMetricPort: metrics, productMetricSessionId: 'p11-empty'},
    );
    const screen = await render(React.createElement(harness.composition.AppRoot));
    try {
      await waitFor(() =>
        expect(screen.getAllByLabelText('首页主行动')).toHaveLength(1),
      );
      await fireEvent.press(
        screen.getByRole('button', {name: '记下第一项任务'}),
      );
      expect(screen.getByLabelText('任务标题').props.autoFocus).toBe(true);
      expect(metrics.snapshot().filter(event => event.name === 'home_primary_shown'))
        .toHaveLength(1);
      expect(metrics.snapshot().filter(event => event.name === 'home_primary_activated'))
        .toHaveLength(1);
    } finally {
      await screen.unmount();
    }
  });

  it('keeps a recommendation highlighted while exposing only one primary card', async () => {
    const harness = createWorkspaceHarness(
      new WorkspaceBackend(),
      new WorkspaceClock(NOW),
      new WorkspaceIds(['p11-recommended-task']),
    );
    const task = await createLifecycleTask(harness, {
      title: '整理下周材料',
      description: '',
      important: true,
      urgent: false,
      scheduledStartAt: null,
      dueAt: null,
      estimatedMinutes: 15,
      firstStep: '打开材料目录',
    }, 'p11:recommended:create');
    const screen = await render(React.createElement(harness.composition.AppRoot));
    try {
      await waitFor(() =>
        expect(screen.getAllByLabelText('首页主行动')).toHaveLength(1),
      );
      expect(
        screen.getByRole('button', {name: `先做5分钟：${task.title}`}),
      ).toBeTruthy();
      expect(
        screen.getByRole('button', {name: `成长区任务：${task.title}`}),
      ).toBeTruthy();
      expect(screen.queryByLabelText('行动指针')).toBeNull();
      expect(screen.queryByLabelText('继续行动')).toBeNull();
    } finally {
      await screen.unmount();
    }
  });
});
