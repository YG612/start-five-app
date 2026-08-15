import {
  homePrimaryActionKey,
  selectHomePrimaryAction,
} from '../../src/domain/homePrimaryAction';
import type {Task} from '../../src/domain/task';

const NOW = '2026-08-15T08:00:00.000Z';

function task(
  id: string,
  patch: Partial<Task & {placementState: 'QUADRANT' | 'UNSORTED'}> = {},
): Task {
  return {
    id,
    title: id,
    description: '',
    important: true,
    urgent: false,
    status: 'pending',
    scheduledStartAt: null,
    startAt: null,
    dueAt: null,
    estimatedMinutes: 5,
    subtasks: [],
    createdAt: NOW,
    updatedAt: NOW,
    startedAt: null,
    completedAt: null,
    deletedAt: null,
    score: null,
    scoreAwardedAt: null,
    ...patch,
  } as Task;
}

describe('P11-01 home primary action', () => {
  it('uses the fixed priority and returns exactly one action', () => {
    const focused = task('focused', {status: 'in_progress', startedAt: NOW});
    const urgent = task('urgent', {
      dueAt: '2026-08-15T09:00:00.000Z',
      placementState: 'UNSORTED',
    });
    expect(selectHomePrimaryAction({
      tasks: [urgent, focused],
      activeFocus: {taskId: focused.id, focusSessionId: 'focus-1'},
      recommended: {taskId: urgent.id, reasons: ['即将截止']},
      now: NOW,
    })).toEqual({
      type: 'RESUME_ACTIVE_FOCUS',
      taskId: focused.id,
      focusSessionId: 'focus-1',
    });
  });

  it.each([
    {
      name: 'continue',
      input: {
        tasks: [task('continued', {status: 'in_progress', startedAt: NOW})],
        activeFocus: null,
        recommended: null,
        now: NOW,
      },
      expected: {type: 'CONTINUE_TASK', taskId: 'continued'},
    },
    {
      name: 'triage',
      input: {
        tasks: [task('triage', {
          placementState: 'UNSORTED',
          dueAt: '2026-08-16T07:59:59.000Z',
        })],
        activeFocus: null,
        recommended: null,
        now: NOW,
      },
      expected: {type: 'TRIAGE_URGENT_UNSORTED', taskId: 'triage'},
    },
    {
      name: 'recommended',
      input: {
        tasks: [task('recommended')],
        activeFocus: null,
        recommended: {taskId: 'recommended', reasons: ['第一小步明确']},
        now: NOW,
      },
      expected: {
        type: 'START_RECOMMENDED',
        taskId: 'recommended',
        reasons: ['第一小步明确'],
      },
    },
    {
      name: 'capture',
      input: {tasks: [], activeFocus: null, recommended: null, now: NOW},
      expected: {type: 'CAPTURE_FIRST_TASK'},
    },
    {
      name: 'none',
      input: {
        tasks: [task('available')],
        activeFocus: null,
        recommended: null,
        now: NOW,
      },
      expected: {type: 'NONE'},
    },
  ])('selects $name deterministically', ({input, expected}) => {
    const first = selectHomePrimaryAction(input);
    const second = selectHomePrimaryAction(input);
    expect(first).toEqual(expected);
    expect(homePrimaryActionKey(first)).toBe(homePrimaryActionKey(second));
  });
});
