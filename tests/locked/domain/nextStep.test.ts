import {selectNextStep} from '../../../src/domain/nextStep';
import {makeSubtask, makeTask} from '../fixtures/taskFactory';

describe('SF-005 first-step ownership and next-step selection', () => {
  it('selects the first unfinished child in stored order', () => {
    const task = makeTask({
      subtasks: [
        makeSubtask({id: 'step-1', status: 'completed'}),
        makeSubtask({id: 'step-2', title: '写标题'}),
        makeSubtask({id: 'step-3', title: '列三点'}),
      ],
    });

    expect(selectNextStep(task)).toMatchObject({id: 'step-2', title: '写标题'});
  });

  it('returns null when there is no unfinished child', () => {
    expect(selectNextStep(makeTask())).toBeNull();
    expect(
      selectNextStep(
        makeTask({subtasks: [makeSubtask({status: 'completed'})]}),
      ),
    ).toBeNull();
  });

  it('never leaks a child from another parent task', () => {
    const malformed = makeTask({
      id: 'task-owner',
      subtasks: [makeSubtask({taskId: 'task-someone-else'})],
    });

    expect(() => selectNextStep(malformed)).toThrow(
      expect.objectContaining({code: 'SUBTASK_PARENT_MISMATCH'}),
    );
  });

  it('does not mutate child ordering while selecting', () => {
    const task = makeTask({
      subtasks: [
        makeSubtask({id: 'step-b'}),
        makeSubtask({id: 'step-a'}),
      ],
    });

    selectNextStep(task);
    expect(task.subtasks.map((step: {id: string}) => step.id)).toEqual([
      'step-b',
      'step-a',
    ]);
  });
});
