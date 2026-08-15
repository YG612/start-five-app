import {rankActionPointerTasks, selectActionPointer} from '../../src/domain/actionPointer';
import type {Task} from '../../src/domain/task';

const NOW = '2026-08-14T08:00:00.000Z';

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    description: '',
    important: true,
    urgent: false,
    status: 'pending',
    startAt: null,
    dueAt: null,
    estimatedMinutes: 10,
    firstStep: '打开文件',
    createdAt: '2026-08-14T07:00:00.000Z',
    updatedAt: '2026-08-14T07:00:00.000Z',
    startedAt: null,
    completedAt: null,
    deletedAt: null,
    score: null,
    scoreAwardedAt: null,
    subtasks: [],
    ...overrides,
  };
}

describe('P8-03 compact action pointer', () => {
  it('uses deterministic weights and returns at most two factual reasons', () => {
    const overdue = task('overdue', {dueAt: '2026-08-13T08:00:00.000Z'});
    const q2 = task('q2');
    const q1 = task('q1', {urgent: true, estimatedMinutes: 90, firstStep: null});
    const ranked = rankActionPointerTasks([q1, q2, overdue], NOW);
    expect(ranked.map(candidate => candidate.task.id)).toEqual(['overdue', 'q2', 'q1']);
    expect(ranked.every(candidate => candidate.reasons.length <= 2)).toBe(true);
    expect(ranked[0]?.reasons).toContain('已经超过截止时间');
  });

  it('prioritizes active and recent tasks without mutating task data', () => {
    const active = task('active');
    const recent = task('recent');
    const plain = task('plain');
    const before = JSON.stringify([active, recent, plain]);
    const ranked = rankActionPointerTasks([plain, recent, active], NOW, {
      activeFocusTaskId: active.id,
      recentContinuationTaskId: recent.id,
    });
    expect(ranked.slice(0, 2).map(candidate => candidate.task.id)).toEqual(['active', 'recent']);
    expect(JSON.stringify([active, recent, plain])).toBe(before);
  });

  it('cycles only through the top three for the session and excludes unavailable tasks', () => {
    const available = ['a', 'b', 'c', 'd'].map(id => task(id));
    const unavailable = [
      task('completed', {status: 'completed', startedAt: NOW, completedAt: NOW, updatedAt: NOW, score: 1, scoreAwardedAt: NOW}),
      task('deleted', {deletedAt: NOW, updatedAt: NOW}),
    ];
    const selected = [0, 1, 2, 3].map(index =>
      selectActionPointer([...available, ...unavailable], NOW, index)?.task.id,
    );
    expect(new Set(selected.slice(0, 3)).size).toBe(3);
    expect(selected[3]).toBe(selected[0]);
    expect(selected).not.toContain('completed');
    expect(selected).not.toContain('deleted');
  });
});
