import {projectTaskQuadrantsAt} from '../../src/domain/quadrant';
import {recommendNextTask} from '../../src/domain/recommendation';
import {awardCompletionScore} from '../../src/domain/scoring';
import type {Task} from '../../src/domain/task';
import {
  archiveTask,
  classifyUnsortedTask,
  isTaskArchived,
  isTaskInQuadrants,
  isTaskUnsorted,
  placementStateForTask,
  restoreCompletedTask,
  searchTasks,
  selectBacklogCandidates,
} from '../../src/domain/taskOrganization';

const NOW = '2026-08-15T08:00:00.000Z';

function task(id: string, patch: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    description: '',
    important: true,
    urgent: false,
    status: 'pending',
    startAt: null,
    scheduledStartAt: null,
    dueAt: null,
    estimatedMinutes: 5,
    firstStep: null,
    subtasks: [],
    createdAt: NOW,
    updatedAt: NOW,
    startedAt: null,
    completedAt: null,
    deletedAt: null,
    score: null,
    scoreAwardedAt: null,
    ...patch,
  };
}

describe('P12-01 quick capture and triage', () => {
  it('treats legacy records as quadrant tasks without rewriting them', () => {
    const legacy = task('legacy');
    expect(placementStateForTask(legacy)).toBe('QUADRANT');
    expect(isTaskInQuadrants(legacy)).toBe(true);
    expect(projectTaskQuadrantsAt([legacy], NOW).flatMap(bucket => bucket.allTasks))
      .toHaveLength(1);
  });

  it('keeps unsorted tasks out of quadrants, recommendation and completion rewards', () => {
    const unsorted = task('capture', {placementState: 'UNSORTED'});
    expect(isTaskUnsorted(unsorted)).toBe(true);
    expect(projectTaskQuadrantsAt([unsorted], NOW).flatMap(bucket => bucket.allTasks))
      .toHaveLength(0);
    expect(recommendNextTask([unsorted])).toBeNull();
    expect(() => awardCompletionScore({...unsorted, status: 'completed'}, NOW))
      .toThrow('TASK_REQUIRES_PLACEMENT');
  });

  it('classifies with exactly the two quadrant answers', () => {
    const unsorted = task('capture', {placementState: 'UNSORTED'});
    const patch = classifyUnsortedTask(unsorted, {important: false, urgent: true}, NOW);
    const classified = {...unsorted, ...patch};
    expect(classified).toMatchObject({
      placementState: 'QUADRANT',
      important: false,
      urgent: true,
      lastMeaningfulActivityAt: NOW,
    });
    expect(isTaskInQuadrants(classified)).toBe(true);
  });
});

describe('P12-02 local search', () => {
  it('searches title, first step, notes and every task state, with five recent items for an empty query', () => {
    const active = task('active', {title: '回复 客户'});
    const unsorted = task('unsorted', {placementState: 'UNSORTED', firstStep: 'OPEN Mail'});
    const completed = task('completed', {status: 'completed', completedAt: NOW, description: '项目 备注'});
    const archived = task('archived', {archivedAt: NOW, archiveReason: 'PAUSED', title: 'Archive Target'});
    expect(searchTasks([completed, archived, unsorted, active], '  open   MAIL '))
      .toMatchObject([{task: {id: 'unsorted'}, status: 'UNSORTED'}]);
    expect(searchTasks([completed, archived, unsorted, active], '项目')).toMatchObject([
      {task: {id: 'completed'}, status: 'COMPLETED'},
    ]);
    expect(searchTasks([completed, archived, unsorted, active], '').map(item => item.task.id))
      .toHaveLength(4);
    expect(searchTasks([completed, archived, unsorted, active], 'target'))
      .toMatchObject([{task: {id: 'archived'}, status: 'ARCHIVED'}]);
  });

  it('keeps 5000-task p95 search under 100ms and caps output at 50', () => {
    const tasks = Array.from({length: 5_000}, (_, index) => task(`task-${index}`, {
      title: index % 2 === 0 ? `方案 ${index}` : `记录 ${index}`,
      updatedAt: new Date(Date.parse(NOW) - index * 1_000).toISOString(),
    }));
    const durations: number[] = [];
    for (let index = 0; index < 20; index += 1) {
      const started = Date.now();
      const results = searchTasks(tasks, '方案');
      durations.push(Date.now() - started);
      expect(results.length).toBe(50);
    }
    durations.sort((left, right) => left - right);
    expect(durations[Math.ceil(durations.length * 0.95) - 1]).toBeLessThanOrEqual(100);
  });
});

describe('P12-03 restore and P12-04 backlog', () => {
  it('restores a completed task without clearing or duplicating its reward', () => {
    const completed = task('done', {
      status: 'completed',
      completedAt: '2026-08-14T08:00:00.000Z',
      score: 45,
      scoreAwardedAt: '2026-08-14T08:00:00.000Z',
    });
    const restored = {...completed, ...restoreCompletedTask(completed, NOW)};
    expect(restored).toMatchObject({
      status: 'pending',
      completedAt: null,
      score: 45,
      completionRewardConsumed: true,
    });
    const recompleted = {...restored, status: 'completed' as const, completedAt: NOW};
    expect(awardCompletionScore(recompleted, NOW)).toMatchObject({points: 0});
  });

  it('selects only inactive eligible quadrant tasks at the 14-day boundary, capped at five', () => {
    const staleAt = '2026-08-01T08:00:00.000Z';
    const stale = Array.from({length: 7}, (_, index) => task(`stale-${index}`, {
      updatedAt: staleAt,
      lastMeaningfulActivityAt: staleAt,
    }));
    const future = task('future', {
      updatedAt: staleAt,
      nextStartAt: '2026-08-16T08:00:00.000Z',
    } as Partial<Task> & {nextStartAt: string});
    const repeat = task('repeat', {
      updatedAt: staleAt,
      repeatRule: {frequency: 'daily'},
    } as Partial<Task>);
    const unsorted = task('unsorted', {updatedAt: staleAt, placementState: 'UNSORTED'});
    const selected = selectBacklogCandidates(
      [...stale, future, repeat, unsorted],
      NOW,
      'stale-0',
    );
    expect(selected).toHaveLength(5);
    expect(selected.map(item => item.id)).not.toEqual(expect.arrayContaining([
      'stale-0', 'future', 'repeat', 'unsorted',
    ]));
  });

  it('archives without changing status or score and removes the task from quadrants', () => {
    const current = task('old', {updatedAt: '2026-07-01T08:00:00.000Z'});
    const archived = {...current, ...archiveTask(current, 'NO_LONGER_NEEDED', NOW)};
    expect(archived).toMatchObject({status: 'pending', score: null, archivedAt: NOW});
    expect(isTaskArchived(archived)).toBe(true);
    expect(isTaskInQuadrants(archived)).toBe(false);
  });
});
