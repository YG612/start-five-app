import React from 'react';
import {
  act,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react-native';
import type {TaskLifecycleTaskInput} from '../../src/application/coreAppService';
import {
  createLifecycleTask,
  createWorkspaceHarness,
  flushUiWork,
  WorkspaceBackend,
  WorkspaceClock,
  WorkspaceIds,
  type WorkspaceHarness,
} from '../gap-p0-06r1/gapP006TestKit';

type Screen = Awaited<ReturnType<typeof render>>;

const CARD = {
  Q1: (title: string) => `救火区任务：${title}`,
  Q2: (title: string) => `成长区任务：${title}`,
  Q3: (title: string) => `干扰区任务：${title}`,
  Q4: (title: string) => `清理区任务：${title}`,
} as const;

async function flushUi(turns = 40): Promise<void> {
  await act(async () => {
    await flushUiWork(turns);
  });
}

async function renderApp(harness: WorkspaceHarness): Promise<Screen> {
  const screen = await render(
    React.createElement(harness.composition.AppRoot),
  );
  await waitFor(() =>
    expect(screen.getByRole('button', {name: '添加任务'})).toBeTruthy(),
  );
  return screen;
}

function taskInput(
  title: string,
  important: boolean,
  urgent: boolean,
): TaskLifecycleTaskInput {
  return {
    title,
    description: `${title} 的 06R3 公开验收数据`,
    important,
    urgent,
    scheduledStartAt: null,
    dueAt: null,
    estimatedMinutes: 5,
    firstStep: null,
  };
}

describe('GAP-P0-06R3 task workspace mutation recovery', () => {
  it('blocks an empty title without mutation and lets the same draft create one valid task', async () => {
    const backend = new WorkspaceBackend();
    const ids = new WorkspaceIds(['p006r3-valid-after-title-error']);
    const harness = createWorkspaceHarness(
      backend,
      new WorkspaceClock(),
      ids,
    );
    const screen = await renderApp(harness);
    const baselineBytes = backend.stableByteSnapshot();
    const validTitle = '修正标题后可以保存';

    try {
      await fireEvent.press(
        screen.getByRole('button', {name: '添加任务'}),
      );
      await fireEvent.changeText(screen.getByLabelText('任务标题'), '   ');
      expect(
        screen.getByRole('button', {name: '添加任务'}).props
          .accessibilityState,
      ).toMatchObject({disabled: true});
      expect(backend.stableByteSnapshot()).toBe(baselineBytes);
      expect(ids.calls).toBe(0);

      await fireEvent.changeText(
        screen.getByLabelText('任务标题'),
        validTitle,
      );
      await fireEvent.press(
        screen.getByRole('button', {name: '添加任务'}),
      );
      await waitFor(() =>
        expect(
          screen.getAllByRole('button', {name: CARD.Q2(validTitle)}),
        ).toHaveLength(1),
      );
      const query = await harness.lifecycle.getQueryResult();
      expect(query.tasks.map(task => task.title)).toEqual([validTitle]);
      expect(ids.calls).toBe(1);
    } finally {
      await screen.unmount();
    }
  });

  it('refreshes the same selected task object after a fixed-clock title and quadrant edit', async () => {
    const backend = new WorkspaceBackend();
    const clock = new WorkspaceClock();
    const seed = createWorkspaceHarness(
      backend,
      clock,
      new WorkspaceIds(['p006r3-selected-task']),
    );
    const original = await createLifecycleTask(
      seed,
      taskInput('固定时钟下的旧任务', true, true),
      'p006r3:seed:selected',
    );
    const ui = createWorkspaceHarness(
      backend.byteRestart(),
      clock,
      new WorkspaceIds(['p006r3-edit-id-must-not-be-used']),
    );
    const screen = await renderApp(ui);
    const revisedTitle = '固定时钟下的新任务';

    try {
      await fireEvent.press(
        screen.getByRole('button', {name: CARD.Q1(original.title)}),
      );
      await waitFor(() =>
        expect(screen.getByRole('header', {name: original.title})).toBeTruthy(),
      );

      await fireEvent.press(
        screen.getByRole('button', {name: '编辑更多'}),
      );
      await fireEvent.changeText(
        screen.getByLabelText('任务标题'),
        revisedTitle,
      );
      await fireEvent.press(
        screen.getByRole('radio', {name: '选择干扰区'}),
      );
      await fireEvent.press(
        screen.getByRole('button', {name: '保存修改'}),
      );

      await waitFor(() =>
        screen.getByRole('button', {name: CARD.Q3(revisedTitle)}),
      );
      expect(
        screen.queryByRole('button', {name: CARD.Q1(original.title)}),
      ).toBeNull();

      await fireEvent.press(
        screen.getByRole('button', {name: CARD.Q3(revisedTitle)}),
      );
      await waitFor(() =>
        expect(screen.getByRole('header', {name: revisedTitle})).toBeTruthy(),
      );
      expect(screen.queryByRole('header', {name: original.title})).toBeNull();
      await expect(ui.composition.repository.getById(original.id)).resolves.toMatchObject({
        id: original.id,
        title: revisedTitle,
        important: false,
        urgent: true,
      });
    } finally {
      await screen.unmount();
    }
  });
});
