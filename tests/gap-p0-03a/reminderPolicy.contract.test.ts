import {
  makeCancelledTask,
  makeCompletedTask,
  makeDeletedTask,
  makeTask,
} from '../gap-p0-01a2/a2Fixtures';
import {
  clonePlanningInput,
  loadReminderModule,
  type ReminderPlanningInput,
  type ReminderRule,
} from './testKit';

const START_RULE: ReminderRule = {
  id: 'start-at-plan',
  kind: 'start',
  anchor: 'scheduled_start',
  offsetMinutes: 0,
  progressBelow: null,
};

const RULES: readonly ReminderRule[] = [
  {
    id: 'plan-four-hours-before-due',
    kind: 'planning',
    anchor: 'due',
    offsetMinutes: -240,
    progressBelow: null,
  },
  START_RULE,
  {
    id: 'progress-two-hours-before-due',
    kind: 'progress',
    anchor: 'due',
    offsetMinutes: -120,
    progressBelow: 0.5,
  },
  {
    id: 'rescue-thirty-minutes-before-due',
    kind: 'rescue',
    anchor: 'due',
    offsetMinutes: -30,
    progressBelow: 0.5,
  },
  {
    id: 'overdue-decision-at-due',
    kind: 'overdue_decision',
    anchor: 'due',
    offsetMinutes: 0,
    progressBelow: null,
  },
];

function planningInput(
  overrides: Partial<ReminderPlanningInput> = {},
): ReminderPlanningInput {
  return {
    task: makeTask('task-plan', {
      startAt: '2026-08-05T10:00:00.000Z',
      scheduledStartAt: '2026-08-05T10:00:00.000Z',
      dueAt: '2026-08-05T12:00:00.000Z',
    }),
    now: '2026-08-05T08:00:00.000Z',
    timeZone: 'Asia/Shanghai',
    progressRatio: 0.2,
    rules: RULES,
    ...overrides,
  };
}

describe('GAP-P0-03A deterministic reminder planning policy', () => {
  it('derives exact ordered planning/start/progress/rescue/overdue intents solely from explicit rules', () => {
    const plan = loadReminderModule().deriveReminderPlan(planningInput());
    expect(plan).toEqual([
      {
        taskId: 'task-plan',
        ruleId: 'plan-four-hours-before-due',
        kind: 'planning',
        triggerAt: '2026-08-05T08:00:00.000Z',
      },
      {
        taskId: 'task-plan',
        ruleId: 'progress-two-hours-before-due',
        kind: 'progress',
        triggerAt: '2026-08-05T10:00:00.000Z',
      },
      {
        taskId: 'task-plan',
        ruleId: 'start-at-plan',
        kind: 'start',
        triggerAt: '2026-08-05T10:00:00.000Z',
      },
      {
        taskId: 'task-plan',
        ruleId: 'rescue-thirty-minutes-before-due',
        kind: 'rescue',
        triggerAt: '2026-08-05T11:30:00.000Z',
      },
      {
        taskId: 'task-plan',
        ruleId: 'overdue-decision-at-due',
        kind: 'overdue_decision',
        triggerAt: '2026-08-05T12:00:00.000Z',
      },
    ]);
  });

  it('uses only available anchors and never invents a start or due instant', () => {
    const planner = loadReminderModule().deriveReminderPlan;
    expect(
      planner(
        planningInput({
          task: makeTask('no-anchors'),
          rules: RULES,
        }),
      ),
    ).toEqual([]);
    expect(
      planner(
        planningInput({
          task: makeTask('start-only', {
            startAt: '2026-08-05T10:00:00.000Z',
            scheduledStartAt: '2026-08-05T10:00:00.000Z',
          }),
          rules: RULES,
        }),
      ),
    ).toEqual([
      {
        taskId: 'start-only',
        ruleId: 'start-at-plan',
        kind: 'start',
        triggerAt: '2026-08-05T10:00:00.000Z',
      },
    ]);
  });

  it('keeps exact-now reminders and drops every expired reminder without a catch-up burst', () => {
    const planner = loadReminderModule().deriveReminderPlan;
    const exact = planner(
      planningInput({
        now: '2026-08-05T10:00:00.000Z',
        rules: [START_RULE],
      }),
    );
    expect(exact).toEqual([
      {
        taskId: 'task-plan',
        ruleId: 'start-at-plan',
        kind: 'start',
        triggerAt: '2026-08-05T10:00:00.000Z',
      },
    ]);
    expect(
      planner(planningInput({now: '2026-08-06T00:00:00.000Z'})),
    ).toEqual([]);
  });

  it('applies an explicit progress threshold without changing unconditioned reminders', () => {
    const plan = loadReminderModule().deriveReminderPlan(
      planningInput({progressRatio: 0.75}),
    );
    expect(plan.map(intent => intent.kind)).toEqual([
      'planning',
      'start',
      'overdue_decision',
    ]);
  });

  it('canonicalizes DST gap/overlap offsets and does not reinterpret accepted absolute task instants when timezone changes', () => {
    const planner = loadReminderModule().deriveReminderPlan;
    const task = makeTask('dst-task', {
      startAt: '2026-03-08T01:30:00-05:00',
      scheduledStartAt: '2026-03-08T01:30:00-05:00',
      dueAt: '2026-11-01T01:30:00-04:00',
    });
    const rules: readonly ReminderRule[] = [
      {
        id: 'dst-start',
        kind: 'start',
        anchor: 'scheduled_start',
        offsetMinutes: 0,
        progressBelow: null,
      },
      {
        id: 'dst-due',
        kind: 'overdue_decision',
        anchor: 'due',
        offsetMinutes: 0,
        progressBelow: null,
      },
    ];
    const first = planner({
      task,
      now: '2026-03-08T00:00:00.000Z',
      timeZone: 'America/New_York',
      progressRatio: 0,
      rules,
    });
    const changedZone = planner({
      task,
      now: '2026-03-08T00:00:00.000Z',
      timeZone: 'Asia/Shanghai',
      progressRatio: 0,
      rules,
    });
    expect(first).toEqual([
      {
        taskId: 'dst-task',
        ruleId: 'dst-start',
        kind: 'start',
        triggerAt: '2026-03-08T06:30:00.000Z',
      },
      {
        taskId: 'dst-task',
        ruleId: 'dst-due',
        kind: 'overdue_decision',
        triggerAt: '2026-11-01T05:30:00.000Z',
      },
    ]);
    expect(changedZone).toEqual(first);
  });

  it.each([
    ['completed', makeCompletedTask('terminal-completed', {
      startAt: '2026-08-05T10:00:00.000Z',
      scheduledStartAt: '2026-08-05T10:00:00.000Z',
      dueAt: '2026-08-05T12:00:00.000Z',
    })],
    ['cancelled', makeCancelledTask('terminal-cancelled', {
      startAt: '2026-08-05T10:00:00.000Z',
      scheduledStartAt: '2026-08-05T10:00:00.000Z',
      dueAt: '2026-08-05T12:00:00.000Z',
    })],
    ['deleted', makeDeletedTask('terminal-deleted', {
      startAt: '2026-08-05T10:00:00.000Z',
      scheduledStartAt: '2026-08-05T10:00:00.000Z',
      dueAt: '2026-08-05T12:00:00.000Z',
    })],
  ])('produces no reminder for a %s task', (_label, task) => {
    expect(
      loadReminderModule().deriveReminderPlan(planningInput({task})),
    ).toEqual([]);
  });

  it('returns detached intents and never embeds task title, description, or first-step text', () => {
    const input = clonePlanningInput(
      planningInput({
        task: makeTask('private-task', {
          title: 'SECRET_TITLE_03A',
          description: 'SECRET_DESCRIPTION_03A',
          firstStep: 'SECRET_FIRST_STEP_03A',
          startAt: '2026-08-05T10:00:00.000Z',
          scheduledStartAt: '2026-08-05T10:00:00.000Z',
          dueAt: '2026-08-05T12:00:00.000Z',
        }),
      }),
    );
    const planner = loadReminderModule().deriveReminderPlan;
    const first = planner(input);
    const firstIntent = first[0];
    if (firstIntent === undefined) {
      throw new Error('EXPECTED_REMINDER_INTENT');
    }
    Object.defineProperty(firstIntent, 'triggerAt', {
      value: '2099-01-01T00:00:00.000Z',
      configurable: true,
    });
    input.task.title = 'CALLER_MUTATION';
    const second = planner(planningInput({task: makeTask('private-task', {
      title: 'SECRET_TITLE_03A',
      description: 'SECRET_DESCRIPTION_03A',
      firstStep: 'SECRET_FIRST_STEP_03A',
      startAt: '2026-08-05T10:00:00.000Z',
      scheduledStartAt: '2026-08-05T10:00:00.000Z',
      dueAt: '2026-08-05T12:00:00.000Z',
    })}));
    expect(second[0]?.triggerAt).toBe('2026-08-05T08:00:00.000Z');
    const serialized = JSON.stringify(second);
    expect(serialized).not.toContain('SECRET_TITLE_03A');
    expect(serialized).not.toContain('SECRET_DESCRIPTION_03A');
    expect(serialized).not.toContain('SECRET_FIRST_STEP_03A');
  });
});
