import {
  awardFirstStartReward,
  completeFirstStepWithReward,
  growthProgressForScore,
  growthZoneContribution,
  recentGrowthRewards,
  totalGrowthScore,
  undoFirstStepCompletion,
} from '../../src/domain/growth';
import {makeTask} from '../locked/fixtures/taskFactory';

const NOW = '2026-08-14T08:00:00.000Z';

describe('P10-01 light growth object', () => {
  it.each([
    [0, '种子'],
    [2, '种子'],
    [3, '发芽'],
    [10, '两片叶'],
    [30, '小苗'],
    [100, '枝条'],
    [300, '开花'],
  ])('maps score %i to the configured stage', (score, title) => {
    expect(growthProgressForScore(score).stage.title).toBe(title);
  });

  it('reports the exact boundary to the next stage', () => {
    expect(growthProgressForScore(29)).toMatchObject({
      stage: {id: 'two_leaves'},
      nextStage: {id: 'seedling'},
      pointsToNext: 1,
    });
    expect(growthProgressForScore(300)).toMatchObject({
      stage: {id: 'bloom'},
      nextStage: null,
      pointsToNext: 0,
      progressRatio: 1,
    });
  });

  it('moves forward and back when a first-step reward is awarded and undone', () => {
    const task = makeTask({firstStep: '写三条结论'});
    const started = awardFirstStartReward(task, NOW).task;
    const completed = completeFirstStepWithReward(started, null, NOW).task;
    expect(totalGrowthScore([completed])).toBe(8);
    const undone = undoFirstStepCompletion(completed, '2026-08-14T08:01:00.000Z');
    expect(totalGrowthScore([undone])).toBe(3);
    expect(undone.firstStep).toBe('写三条结论');
  });

  it('lists recent action and task-completion rewards in time order', () => {
    const task = Object.assign(makeTask({firstStep: '写三条结论'}), {
      score: 35,
      scoreAwardedAt: '2026-08-14T09:00:00.000Z',
    });
    const started = awardFirstStartReward(task, NOW).task;
    expect(recentGrowthRewards([started], 5).map(item => item.kind)).toEqual([
      'task_completion',
      'task_first_start',
    ]);
  });

  it('counts only growth-zone contributions', () => {
    const growth = awardFirstStartReward(makeTask({important: true, urgent: false}), NOW).task;
    const fire = awardFirstStartReward(makeTask({id: 'fire', important: true, urgent: true}), NOW).task;
    expect(growthZoneContribution([growth, fire], NOW)).toBe(3);
  });
});
