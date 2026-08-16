import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {
  createLifecycleTask,
  createWorkspaceHarness,
  WorkspaceBackend,
  WorkspaceClock,
  WorkspaceIds,
} from '../gap-p0-06r1/gapP006TestKit';

const NOW = '2026-08-15T08:00:00.000Z';

describe('P13 visible long-task flow', () => {
  it('opens completion definition, steps, work-plan and risk exits from the task panel', async () => {
    const harness = createWorkspaceHarness(
      new WorkspaceBackend(),
      new WorkspaceClock(NOW),
      new WorkspaceIds(['p13-task']),
    );
    const task = await createLifecycleTask(harness, {
      title: '完成毕业论文',
      description: '',
      important: true,
      urgent: false,
      scheduledStartAt: null,
      dueAt: '2026-08-20T08:00:00.000Z',
      estimatedMinutes: 180,
      firstStep: '开始写论文',
    }, 'p13:create');
    const screen = await render(React.createElement(harness.composition.AppRoot));
    try {
      await waitFor(() => expect(screen.getAllByText(task.title).length).toBeGreaterThan(0));
      await fireEvent.press(screen.getByRole('button', {name: `成长区任务：${task.title}`}));
      await fireEvent.press(screen.getByRole('button', {name: '更多'}));
      await waitFor(() =>
        expect(screen.getByRole('button', {name: '长期任务计划'})).toBeTruthy(),
      );
      await fireEvent.press(screen.getByRole('button', {name: '长期任务计划'}));
      await waitFor(() =>
        expect(screen.getByRole('header', {name: '长期任务计划'})).toBeTruthy(),
      );
      expect(screen.getByLabelText('做到这里就算完成')).toBeTruthy();
      expect(screen.getByLabelText('推进步骤列表')).toBeTruthy();
      expect(screen.getByRole('button', {name: '预览计划'})).toBeTruthy();
      expect(screen.getByRole('button', {name: '先做能交的版本'})).toBeTruthy();
      expect(screen.getByRole('button', {name: '调整截止时间'})).toBeTruthy();
    } finally {
      await screen.unmount();
    }
  });
});
