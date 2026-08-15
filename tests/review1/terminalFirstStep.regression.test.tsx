import React from 'react';
import {render, waitFor} from '@testing-library/react-native';
import {createCoreAppService} from '../../src/application/coreAppService';
import {createTaskRepository} from '../../src/data/taskRepository';
import {createFirstStep} from '../../src/domain/task';
import {CoreFlowScreen} from '../../src/screens/CoreFlowScreen';
import {
  makeReviewTask,
  REVIEW_NOW,
  ReviewMemoryStorage,
} from './fixtures/reviewFixtures';

const STORAGE_KEY = 'start-five.tasks.v1';

function isUnavailable(
  element: {
    props: {
      accessibilityState?: {disabled?: boolean};
      disabled?: boolean;
      editable?: boolean;
    };
  } | null,
): boolean {
  return (
    element === null ||
    element.props.accessibilityState?.disabled === true ||
    element.props.disabled === true ||
    element.props.editable === false
  );
}

describe('R1-B terminal task aggregate protection', () => {
  it.each(['completed', 'cancelled'] as const)(
    'rejects a first step for a %s parent with TERMINAL_TASK',
    status => {
      const task = makeReviewTask({
        status,
        completedAt: status === 'completed' ? REVIEW_NOW : null,
      });

      expect(() =>
        createFirstStep(
          task,
          {title: '不应创建'},
          {id: 'forbidden-step', now: REVIEW_NOW},
        ),
      ).toThrow(expect.objectContaining({code: 'TERMINAL_TASK'}));
      expect(task.subtasks).toEqual([]);
    },
  );
});

describe('R1-B terminal task application protection', () => {
  it.each(['completed', 'cancelled'] as const)(
    'keeps the repository byte snapshot and write count unchanged for a %s parent',
    async status => {
      const storage = new ReviewMemoryStorage();
      const repository = createTaskRepository(storage);
      await repository.create(
        makeReviewTask({
          status,
          completedAt: status === 'completed' ? REVIEW_NOW : null,
        }),
      );
      const idGenerator = jest.fn(() => 'forbidden-step');
      const service = createCoreAppService({
        repository,
        now: () => REVIEW_NOW,
        idGenerator,
      });
      const beforeTasks = await repository.list();
      const beforeBytes = storage.raw(STORAGE_KEY);
      const writesBefore = storage.setCalls.length;

      await expect(
        service.addFirstStep(
          'task-review-1',
          {title: '不应创建'},
          {operationId: `terminal-${status}`},
        ),
      ).rejects.toMatchObject({code: 'TERMINAL_TASK'});

      expect(await repository.list()).toEqual(beforeTasks);
      expect(storage.raw(STORAGE_KEY)).toBe(beforeBytes);
      expect(storage.setCalls).toHaveLength(writesBefore);
    },
  );
});

describe('R1-B terminal task UI protection', () => {
  it.each(['completed', 'cancelled'] as const)(
    'hides or disables every first-step entry control for a %s task',
    async status => {
      const storage = new ReviewMemoryStorage();
      const repository = createTaskRepository(storage);
      await repository.create(
        makeReviewTask({
          status,
          completedAt: status === 'completed' ? REVIEW_NOW : null,
        }),
      );
      const service = createCoreAppService({
        repository,
        now: () => REVIEW_NOW,
        idGenerator: () => 'unused-id',
      });
      const screen = await render(<CoreFlowScreen service={service} />);

      await waitFor(() =>
        expect(screen.getByText('任务：写项目周报')).toBeTruthy(),
      );

      expect(
        isUnavailable(
          screen.queryByRole('button', {name: '添加第一小步'}),
        ),
      ).toBe(true);
      expect(isUnavailable(screen.queryByLabelText('第一小步'))).toBe(true);
      expect(
        isUnavailable(screen.queryByRole('button', {name: '保存小步'})),
      ).toBe(true);

      await screen.unmount();
    },
    15_000,
  );
});
