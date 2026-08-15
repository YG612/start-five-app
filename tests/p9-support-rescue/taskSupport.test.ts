import {makeTask} from '../locked/fixtures/taskFactory';
import {
  createStuckRepairRecord,
  createTaskRescuePlan,
  focusDurationForRepair,
  isTaskEligibleForRescue,
  normalizeTaskSupportRecord,
  shouldShowPostponeRepair,
  startReminderPresentation,
  type StuckReason,
  type TaskWithSupport,
} from '../../src/domain/taskSupport';

const NOW = '2026-08-14T08:00:00.000Z';

describe('P9-01 stuck repair and P9-03 rescue domain', () => {
  it.each([
    ['TOO_LARGE', 'SET_SMALLER_FIRST_STEP', 5],
    ['DONT_KNOW_HOW', 'CLARIFY_OUTPUT', 5],
    ['FEAR_OF_POOR_RESULT', 'ROUGH_DRAFT', 5],
    ['LOW_ENERGY', 'START_TWO_MINUTES', 2],
  ] as const)('turns %s into a local %s repair and %s-minute start', (reason, action, minutes) => {
    const repair = createStuckRepairRecord({
      taskId: 'task-1',
      reason: reason as StuckReason,
      action,
      firstStep: '只做一个可见动作',
      note: '仅本地保存',
      focusMinutes: minutes,
      now: NOW,
    });
    expect(repair).toMatchObject({reason, action, focusMinutes: minutes});
    expect(focusDurationForRepair(action)).toBe(minutes);
    expect(createStuckRepairRecord({
      taskId: 'task-1', reason, action, firstStep: '只做一个可见动作',
      note: '仅本地保存', focusMinutes: minutes, now: NOW,
    }).operationKey).toBe(repair.operationKey);
  });

  it('uses exact 24-hour and progress-under-50 rescue boundaries', () => {
    expect(isTaskEligibleForRescue(makeTask({
      dueAt: '2026-08-15T08:00:00.000Z',
    }), NOW)).toBe(true);
    expect(isTaskEligibleForRescue(makeTask({
      dueAt: '2026-08-15T08:00:00.001Z',
    }), NOW)).toBe(false);
    expect(isTaskEligibleForRescue(Object.assign(makeTask({
      dueAt: '2026-08-14T09:00:00.000Z',
    }), {progress: 50}), NOW)).toBe(false);
  });

  it('binds one rescue plan to the original task and uses its next required step', () => {
    const plan = createTaskRescuePlan({
      taskId: 'task-1',
      minimumDeliverable: '一页可提交摘要',
      nextRequiredStep: '先写三条结论',
      optionalScopeToDrop: '暂不做配图',
      focusMinutes: 15,
      now: NOW,
    });
    expect(plan).toMatchObject({taskId: 'task-1', focusMinutes: 15});
    const task = normalizeTaskSupportRecord({
      ...makeTask(),
      supportSchemaVersion: 1,
      rescuePlan: plan,
    }) as TaskWithSupport;
    expect(task.rescuePlan?.nextRequiredStep).toBe('先写三条结论');
  });

  it('deduplicates postpone repair per count/day and gives first-step reminder actions', () => {
    const task = Object.assign(makeTask({firstStep: '打开提纲'}), {postponedCount: 2});
    expect(shouldShowPostponeRepair(task, NOW)).toBe(true);
    const acknowledged = Object.assign(task, {
      supportSchemaVersion: 1 as const,
      postponePromptAcknowledgedKey: '2026-08-14:2',
    });
    expect(shouldShowPostponeRepair(acknowledged, NOW)).toBe(false);
    expect(startReminderPresentation(acknowledged)).toEqual({
      title: '可以开始下一小步了',
      body: '打开提纲',
      actions: ['start_five', 'delay_ten', 'reschedule'],
    });
  });
});
