import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {InMemoryProductMetricPort} from '../../src/application/productMetrics';
import {
  createWorkspaceHarness,
  WorkspaceBackend,
  WorkspaceClock,
  WorkspaceIds,
} from '../gap-p0-06r1/gapP006TestKit';

const NOW = '2026-08-15T08:00:00.000Z';

describe('P12 direct task access experience', () => {
  it('captures with one sentence, keeps it outside quadrants, then classifies with two answers', async () => {
    const metrics = new InMemoryProductMetricPort();
    const harness = createWorkspaceHarness(
      new WorkspaceBackend(),
      new WorkspaceClock(NOW),
      new WorkspaceIds(['p12-captured']),
      {productMetricPort: metrics, productMetricSessionId: 'p12-capture'},
    );
    const screen = await render(React.createElement(harness.composition.AppRoot));
    try {
      await waitFor(() => expect(screen.getByRole('button', {name: '添加任务'})).toBeTruthy());
      await fireEvent.press(screen.getByRole('button', {name: '添加任务'}));
      await fireEvent.changeText(screen.getByLabelText('任务标题'), '给客户回复方案');
      await fireEvent.press(screen.getByRole('button', {name: '关闭'}));

      await waitFor(async () => {
        const items = await harness.lifecycle.list();
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({title: '给客户回复方案', placementState: 'UNSORTED'});
      });
      expect((await harness.lifecycle.getQuadrantProjection()).flatMap(bucket => bucket.allTasks))
        .toHaveLength(0);
      expect(await harness.lifecycle.getRecommendation()).toBeNull();
      expect(screen.getByRole('button', {name: '待判断 1 项'})).toBeTruthy();

      await fireEvent.press(screen.getByRole('button', {name: '待判断 1 项'}));
      await fireEvent.press(screen.getByRole('button', {name: '重要'}));
      await fireEvent.press(screen.getByRole('button', {name: '不紧急'}));
      await fireEvent.press(screen.getByRole('button', {name: '放入四象限'}));

      await waitFor(async () => {
        expect((await harness.lifecycle.list())[0]).toMatchObject({
          placementState: 'QUADRANT',
          important: true,
          urgent: false,
        });
      });
      expect((await harness.lifecycle.getQuadrantProjection()).flatMap(bucket => bucket.allTasks))
        .toHaveLength(1);
      expect(metrics.snapshot().filter(event => event.name === 'quick_capture_saved'))
        .toHaveLength(1);
      expect(metrics.snapshot().filter(event => event.name === 'triage_completed'))
        .toHaveLength(1);
    } finally {
      await screen.unmount();
    }
  });

  it('exposes search plus completion and backlog entry points without a fifth quadrant', async () => {
    const harness = createWorkspaceHarness(
      new WorkspaceBackend(),
      new WorkspaceClock(NOW),
      new WorkspaceIds(['unused']),
    );
    const screen = await render(React.createElement(harness.composition.AppRoot));
    try {
      await waitFor(() => expect(screen.getByRole('button', {name: '查找任务'})).toBeTruthy());
      await fireEvent.press(screen.getByRole('tab', {name: '我的'}));
      expect(screen.getByRole('button', {name: '已完成任务'})).toBeTruthy();
      expect(screen.getByRole('button', {name: '整理一下'})).toBeTruthy();
      expect(screen.queryByText('第五象限')).toBeNull();
    } finally {
      await screen.unmount();
    }
  });
});
