import {deriveReminderPlan, postponeTaskTenMinutes} from '../../src/application/reminderScheduling';
import {selectFocusDurationRecommendation} from '../../src/domain/focusDurationRecommendation';
import {searchTasksPage, selectHomeVisibleTasks} from '../../src/domain/taskOrganization';
import type {FocusSession} from '../../src/domain/focusSession';
import type {Task} from '../../src/domain/task';
import type {LocalBackupService} from '../../src/application/localBackupService';
import {
  makeLocalBackupHarness,
  requireLocalBackup,
  seedPublicTask,
  expectSameBytes,
} from '../gap-p0-12/gapP012TestKit';

const NOW = '2026-08-15T08:00:00.000Z';

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `任务 ${id}`,
    description: '',
    important: true,
    urgent: false,
    status: 'pending',
    startAt: null,
    scheduledStartAt: null,
    dueAt: '2026-08-16T08:00:00.000Z',
    estimatedMinutes: 25,
    firstStep: '打开文件',
    createdAt: NOW,
    updatedAt: NOW,
    startedAt: null,
    completedAt: null,
    deletedAt: null,
    score: null,
    scoreAwardedAt: null,
    subtasks: [],
    ...overrides,
  };
}

function session(
  id: string,
  minutes: 5 | 15 | 25 | 45,
  status: 'completed' | 'interrupted',
): FocusSession {
  const startedAt = `2026-08-${String(1 + Number(id.replace(/\D/g, ''))).padStart(2, '0')}T08:00:00.000Z`;
  const plannedEndAt = new Date(Date.parse(startedAt) + minutes * 60_000).toISOString();
  const endedAt = status === 'completed'
    ? plannedEndAt
    : new Date(Date.parse(startedAt) + 60_000).toISOString();
  return {
    id,
    taskId: 'task',
    plannedMinutes: minutes,
    status,
    startedAt,
    plannedEndAt,
    endedAt,
    actualSeconds: Math.floor((Date.parse(endedAt) - Date.parse(startedAt)) / 1000),
    interruptionReason: status === 'completed' ? null : 'stopped',
    createdAt: startedAt,
    updatedAt: endedAt,
  };
}

describe('P14 reliability, scale and evidence gates', () => {
  it('keeps explicit reminders, budgets system reminders and deduplicates a task instant', () => {
    const base = task('budget', {scheduledStartAt: '2026-08-15T10:00:00.000Z', startAt: '2026-08-15T10:00:00.000Z'});
    const rules = [
      {id: 'system-a', kind: 'start' as const, anchor: 'scheduled_start' as const, offsetMinutes: 0, progressBelow: null, source: 'system' as const},
      {id: 'system-b', kind: 'progress' as const, anchor: 'due' as const, offsetMinutes: 0, progressBelow: null, source: 'system' as const},
      {id: 'explicit', kind: 'start' as const, anchor: 'scheduled_start' as const, offsetMinutes: 0, progressBelow: null, source: 'explicit' as const},
    ];
    const result = deriveReminderPlan({
      task: base,
      now: NOW,
      timeZone: 'Asia/Shanghai',
      progressRatio: 0,
      rules,
      usage: {systemToday: 6, systemForTaskToday: 2, lowEnergyToday: 0, lowEnergyForTaskToday: 0},
    });
    expect(result).toEqual([expect.objectContaining({ruleId: 'explicit'})]);
    expect(new Set(result.map(item => `${item.taskId}:${item.triggerAt}`)).size).toBe(result.length);
  });

  it('postpones only nextStartAt and offers repair after the third delay', () => {
    const original = task('postpone', {dueAt: '2026-08-20T08:00:00.000Z', postponedCount: 2} as Partial<Task>);
    const result = postponeTaskTenMinutes(original, NOW);
    expect(result).toEqual({
      nextStartAt: '2026-08-15T08:10:00.000Z',
      postponedCount: 3,
      suggestSmallerStep: true,
    });
    expect(original.dueAt).toBe('2026-08-20T08:00:00.000Z');
  });

  it('inspects with zero writes and safely replaces nonempty data while retaining rollback snapshot', async () => {
    const source = makeLocalBackupHarness({idPrefix: 'p14-source'});
    await seedPublicTask(source, '备份任务', 'p14:source');
    const artifact = await requireLocalBackup(source.composition).exportBackup();

    const target = makeLocalBackupHarness({idPrefix: 'p14-target'});
    await seedPublicTask(target, '本机任务', 'p14:target');
    const backup = requireLocalBackup(target.composition) as LocalBackupService;
    const beforeInspect = target.backend.stableByteSnapshot();
    const inspected = await backup.inspectBackup(artifact.bytes);
    expectSameBytes(target.backend.stableByteSnapshot(), beforeInspect);
    expect(inspected.preview).toMatchObject({
      taskCount: 1,
      pendingTaskCount: 1,
      completedTaskCount: 0,
      warningCount: 0,
      schemaVersion: 3,
    });

    await expect(backup.replaceBackup(artifact.bytes)).resolves.toMatchObject({
      status: 'committed',
      safetySnapshotRetained: true,
      notificationsReconciled: true,
    });
    const restarted = makeLocalBackupHarness({
      idPrefix: 'p14-target-restarted',
      backend: target.backend.byteRestart(),
      scheduler: target.scheduler,
    });
    const state = await restarted.composition.service.getState();
    expect(state.tasks.map(item => item.title)).toContain('备份任务');
  });

  it('rolls back the original task graph when replacement is interrupted', async () => {
    const source = makeLocalBackupHarness({idPrefix: 'p14-rollback-source'});
    await seedPublicTask(source, '将要导入', 'p14:rollback:source');
    const artifact = await requireLocalBackup(source.composition).exportBackup();
    const target = makeLocalBackupHarness({idPrefix: 'p14-rollback-target'});
    await seedPublicTask(target, '必须保留', 'p14:rollback:target');
    const backup = requireLocalBackup(target.composition) as LocalBackupService;
    target.backend.failOnNthFutureSet(2);
    await expect(backup.replaceBackup(artifact.bytes)).rejects.toBeDefined();
    target.backend.clearFailure();
    const restarted = makeLocalBackupHarness({
      idPrefix: 'p14-rollback-restarted',
      backend: target.backend.byteRestart(),
      scheduler: target.scheduler,
    });
    const state = await restarted.composition.service.getState();
    expect(state.tasks.map(item => item.title)).toContain('必须保留');
    expect(state.tasks.map(item => item.title)).not.toContain('将要导入');
  });

  it('keeps 5000 historical tasks off home and pages search results', () => {
    const tasks = Array.from({length: 5000}, (_, index) => task(`history-${index}`, {
      title: `历史项目 ${index}`,
      status: 'completed',
      completedAt: '2026-08-14T08:00:00.000Z',
    }));
    tasks.push(task('active', {title: '历史项目 当前'}));
    expect(selectHomeVisibleTasks(tasks).map(item => item.id)).toEqual(['active']);
    const first = searchTasksPage(tasks, '历史项目', 0, 25);
    const second = searchTasksPage(tasks, '历史项目', 1, 25);
    expect(first.total).toBe(5001);
    expect(first.items).toHaveLength(25);
    expect(second.items).toHaveLength(50);
    expect(second.hasMore).toBe(true);
  });

  it('recommends only with enough local evidence and respects 30-day dismissal', () => {
    const sessions: FocusSession[] = [
      ...Array.from({length: 3}, (_, i) => session(`a${i}`, 5, 'completed')),
      ...Array.from({length: 3}, (_, i) => session(`b${i + 3}`, 5, 'interrupted')),
      ...Array.from({length: 7}, (_, i) => session(`c${i + 6}`, 15, 'completed')),
    ];
    expect(selectFocusDurationRecommendation({
      sessions,
      currentDefault: 5,
      now: NOW,
      dismissedAt: null,
    })).toMatchObject({candidateMinutes: 15, candidateSampleSize: 7});
    expect(selectFocusDurationRecommendation({
      sessions,
      currentDefault: 5,
      now: NOW,
      dismissedAt: '2026-08-01T08:00:00.000Z',
    })).toBeNull();
    expect(selectFocusDurationRecommendation({
      sessions: sessions.slice(0, 9),
      currentDefault: 5,
      now: NOW,
      dismissedAt: null,
    })).toBeNull();
  });
});
