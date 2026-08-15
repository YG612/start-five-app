import type {Task} from '../../src/domain/task';
import {
  bindPlannedWorkSessionFocus,
  completeActiveTaskStep,
  createTaskStepPlan,
  deriveDeliveryRisk,
  firstStepQualityHint,
  generatePlannedWorkSessions,
  moveTaskStep,
  normalizeCompletionDefinition,
  remainingMinutesForTask,
  settlePlannedWorkSession,
  shiftUnstartedPlanByLocalDay,
  skipOrRemoveTaskStep,
  taskStepProgress,
} from '../../src/domain/taskExecutionPlan';
import {buildNextRepeatedTask} from '../../src/domain/taskRecurrence';
import {
  createPersistentTaskStorage,
  TASK_SNAPSHOT_SCHEMA,
  TASK_SNAPSHOT_VERSION,
  TASK_STORAGE_KEY,
} from '../../src/data/persistentTaskStorage';

const NOW = '2026-08-15T08:00:00.000Z';

function task(id = 'task', patch: Partial<Task> = {}): Task {
  return {
    id,
    title: '写论文',
    description: '',
    important: true,
    urgent: false,
    status: 'in_progress',
    startAt: null,
    scheduledStartAt: null,
    dueAt: '2026-08-20T08:00:00.000Z',
    estimatedMinutes: 180,
    firstStep: '打开论文文档',
    subtasks: [],
    createdAt: NOW,
    updatedAt: NOW,
    startedAt: NOW,
    completedAt: null,
    deletedAt: null,
    score: null,
    scoreAwardedAt: null,
    ...patch,
  };
}

function ids(prefix: string): () => string {
  let sequence = 0;
  return () => `${prefix}-${++sequence}`;
}

describe('P13-01 completion definition and P13-02 ordered steps', () => {
  it('loads legacy snapshots without P13 fields and preserves new fields in local backup data', async () => {
    const records = new Map<string, string>();
    const backend = {
      getItem: async (key: string) => records.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        records.set(key, value);
      },
      removeItem: async (key: string) => {
        records.delete(key);
      },
    };
    const legacy = task('legacy');
    records.set(TASK_STORAGE_KEY, JSON.stringify({
      schema: TASK_SNAPSHOT_SCHEMA,
      version: TASK_SNAPSHOT_VERSION,
      tasks: [legacy],
    }));
    const storage = createPersistentTaskStorage(backend);
    const loaded = JSON.parse((await storage.getItem(TASK_STORAGE_KEY)) ?? '[]') as Task[];
    expect(loaded[0]?.steps).toBeUndefined();
    expect(loaded[0]?.completionDefinition).toBeUndefined();

    const planned = createTaskStepPlan({
      task: {...legacy, completionDefinition: '提交初稿'},
      drafts: [{title: '列出结构', estimatedMinutes: 15}],
      now: NOW,
      idGenerator: ids('backup-step'),
    });
    await storage.setItem(TASK_STORAGE_KEY, JSON.stringify([planned]));
    const envelope = JSON.parse(records.get(TASK_STORAGE_KEY) ?? '{}') as {
      tasks?: Task[];
    };
    expect(envelope.tasks?.[0]).toMatchObject({
      completionDefinition: '提交初稿',
      progressSource: 'STEPS',
      firstStep: '列出结构',
    });
    expect(envelope.tasks?.[0]?.steps).toHaveLength(1);
  });

  it('keeps completion definition optional and enforces the 300-character boundary', () => {
    expect(normalizeCompletionDefinition('  提交可阅读的初稿  ')).toBe('提交可阅读的初稿');
    expect(normalizeCompletionDefinition('   ')).toBeNull();
    expect(normalizeCompletionDefinition('好'.repeat(300))).toHaveLength(300);
    expect(() => normalizeCompletionDefinition('好'.repeat(301)))
      .toThrow('COMPLETION_DEFINITION_TOO_LONG');
  });

  it('projects one ACTIVE step into firstStep and advances without completing the task', () => {
    const planned = createTaskStepPlan({
      task: task(),
      drafts: [
        {title: '列出三个小标题', estimatedMinutes: 10},
        {title: '写第一段', estimatedMinutes: 30},
        {title: '补充引用', estimatedMinutes: 20},
      ],
      now: NOW,
      idGenerator: ids('step'),
    });
    expect(planned.firstStep).toBe('列出三个小标题');
    expect(planned.steps?.filter(step => step.status === 'ACTIVE')).toHaveLength(1);
    const first = completeActiveTaskStep(planned, '2026-08-15T08:01:00.000Z');
    expect(first.status).toBe('in_progress');
    expect(first.firstStep).toBe('写第一段');
    expect(taskStepProgress(first)).toBe(0);
    const second = completeActiveTaskStep(first, '2026-08-15T08:02:00.000Z');
    expect(second.firstStep).toBe('补充引用');
    expect(taskStepProgress(second)).toBe(50);
    const final = completeActiveTaskStep(second, '2026-08-15T08:03:00.000Z');
    expect(final.firstStep).toBeNull();
    expect(final.status).toBe('in_progress');
    expect(taskStepProgress(final)).toBe(100);
  });

  it('supports visible ordering and preserves focused-step history as SKIPPED', () => {
    const planned = createTaskStepPlan({
      task: task(),
      drafts: [{title: '一'}, {title: '二'}, {title: '三'}],
      now: NOW,
      idGenerator: ids('step'),
    });
    const lastId = planned.steps?.[2]?.id ?? '';
    const moved = moveTaskStep(planned, lastId, 'UP');
    expect(moved.steps?.map(step => step.title)).toEqual(['一', '三', '二']);
    const activeId = moved.steps?.find(step => step.status === 'ACTIVE')?.id ?? '';
    const skipped = skipOrRemoveTaskStep({
      task: moved,
      stepId: activeId,
      now: '2026-08-15T08:04:00.000Z',
      hasFocusHistory: true,
    });
    expect(skipped.steps?.find(step => step.id === activeId)?.status).toBe('SKIPPED');
    expect(skipped.steps?.filter(step => step.status === 'ACTIVE')).toHaveLength(1);
  });

  it('copies repeat step templates with new IDs and reset statuses', () => {
    const source = createTaskStepPlan({
      task: task('repeat', {
        repeatRule: {frequency: 'daily'},
        repeatSeriesId: 'series',
      } as Partial<Task>),
      drafts: [{title: '第一步'}, {title: '第二步'}],
      now: NOW,
      idGenerator: ids('source-step'),
    });
    const advanced = completeActiveTaskStep(source, '2026-08-15T09:00:00.000Z');
    const next = buildNextRepeatedTask(
      advanced,
      '2026-08-15T10:00:00.000Z',
      'next-task',
    );
    expect(next?.steps?.map(step => step.id)).toEqual([
      'next-task:step:1',
      'next-task:step:2',
    ]);
    expect(next?.steps?.map(step => step.status)).toEqual(['ACTIVE', 'PENDING']);
    expect(next?.firstStep).toBe('第一步');
  });
});

describe('P13-03 planned work and P13-04 delivery risk', () => {
  it('creates at most ten attached sessions, projects nextStartAt, and uses step estimates first', () => {
    const stepped = createTaskStepPlan({
      task: task(),
      drafts: [
        {title: '第一步', estimatedMinutes: 25},
        {title: '第二步', estimatedMinutes: 45},
      ],
      now: NOW,
      idGenerator: ids('step'),
    });
    expect(remainingMinutesForTask(stepped)).toBe(70);
    const starts = Array.from({length: 3}, (_, index) =>
      new Date(Date.parse(NOW) + (index + 1) * 86_400_000).toISOString(),
    );
    const planned = generatePlannedWorkSessions({
      task: stepped,
      plannedMinutes: 25,
      plannedStartTimes: starts,
      now: NOW,
      idGenerator: ids('plan'),
    }) as Task & {nextStartAt?: string | null};
    expect(planned.plannedWorkSessions).toHaveLength(3);
    expect(planned.plannedWorkSessions?.[0]?.stepId).toBe(stepped.steps?.[0]?.id);
    expect(planned.nextStartAt).toBe(starts[0]);
    expect(() => generatePlannedWorkSessions({
      task: stepped,
      plannedMinutes: 25,
      plannedStartTimes: Array.from({length: 11}, (_, index) =>
        new Date(Date.parse(NOW) + (index + 1) * 86_400_000).toISOString()),
      now: NOW,
      idGenerator: ids('overflow'),
    })).toThrow('PLANNED_WORK_COUNT_OUT_OF_RANGE');
  });

  it('binds one focus session idempotently and coordinates the next plan after settlement', () => {
    const starts = [
      '2026-08-16T08:00:00.000Z',
      '2026-08-17T08:00:00.000Z',
    ];
    const planned = generatePlannedWorkSessions({
      task: task(),
      plannedMinutes: 45,
      plannedStartTimes: starts,
      now: NOW,
      idGenerator: ids('plan'),
    });
    const plannedId = planned.plannedWorkSessions?.[0]?.id ?? '';
    const bound = bindPlannedWorkSessionFocus({
      task: planned,
      plannedSessionId: plannedId,
      focusSessionId: 'focus-1',
      now: NOW,
    });
    const replay = bindPlannedWorkSessionFocus({
      task: bound,
      plannedSessionId: plannedId,
      focusSessionId: 'focus-1',
      now: NOW,
    });
    expect(replay.plannedWorkSessions?.[0]).toMatchObject({
      status: 'STARTED',
      focusSessionId: 'focus-1',
    });
    expect(() => bindPlannedWorkSessionFocus({
      task: replay,
      plannedSessionId: plannedId,
      focusSessionId: 'focus-2',
      now: NOW,
    })).toThrow('PLANNED_WORK_ALREADY_STARTED');
    const settled = settlePlannedWorkSession({
      task: replay,
      plannedSessionId: plannedId,
      outcome: 'DONE',
      now: '2026-08-16T08:45:00.000Z',
    }) as Task & {nextStartAt?: string | null};
    expect(settled.nextStartAt).toBe(starts[1]);
  });

  it('shifts local calendar days and warns before crossing the final deadline', () => {
    const planned = generatePlannedWorkSessions({
      task: task('shift', {dueAt: '2026-08-17T07:30:00.000Z'}),
      plannedMinutes: 25,
      plannedStartTimes: ['2026-08-16T08:00:00.000Z'],
      now: NOW,
      idGenerator: ids('plan'),
    });
    const shifted = shiftUnstartedPlanByLocalDay({task: planned, now: NOW});
    expect(shifted.crossesDueAt).toBe(true);
  });

  it('derives stable UNKNOWN, OK, NEEDS_PLAN and AT_RISK boundaries', () => {
    expect(deriveDeliveryRisk({
      remainingMinutes: null,
      plannedMinutesBeforeDue: 0,
      dueAt: null,
      nextStartAt: null,
      now: NOW,
    })).toBe('UNKNOWN');
    expect(deriveDeliveryRisk({
      remainingMinutes: 60,
      plannedMinutesBeforeDue: 60,
      dueAt: '2026-08-20T08:00:00.000Z',
      nextStartAt: '2026-08-16T08:00:00.000Z',
      now: NOW,
    })).toBe('OK');
    expect(deriveDeliveryRisk({
      remainingMinutes: 120,
      plannedMinutesBeforeDue: 0,
      dueAt: '2026-08-20T08:00:00.000Z',
      nextStartAt: null,
      now: NOW,
    })).toBe('NEEDS_PLAN');
    expect(deriveDeliveryRisk({
      remainingMinutes: 120,
      plannedMinutesBeforeDue: 25,
      dueAt: '2026-08-16T07:59:59.000Z',
      nextStartAt: '2026-08-15T10:00:00.000Z',
      now: NOW,
    })).toBe('AT_RISK');
  });
});

describe('P13-06 first-step quality guidance', () => {
  it('suggests concrete actions without blocking valid or invalid input', () => {
    expect(firstStepQualityHint({taskTitle: '写论文', stepTitle: '写论文'}))
      .toMatchObject({needsSuggestion: true, reason: 'SAME_AS_TASK'});
    expect(firstStepQualityHint({
      taskTitle: '写论文',
      stepTitle: '打开论文文档，列出三个小标题',
      estimatedMinutes: 10,
    })).toEqual({needsSuggestion: false, reason: null, suggestion: null});
  });
});
