import {awardFirstStartReward} from '../../src/domain/growth';
import {
  INSIGHT_COOLDOWN_MILLISECONDS,
  selectGrowthInsight,
} from '../../src/domain/growthInsights';
import {makeTask} from '../locked/fixtures/taskFactory';

const NOW = '2026-08-14T15:30:00.000Z';

describe('P10-03 single actionable local insight', () => {
  it('requires four late growth-zone starts before suggesting a schedule', () => {
    const tasks = Array.from({length: 4}, (_, index) => awardFirstStartReward(
      makeTask({id: `late-${index}`, important: true, urgent: false}),
      `2026-08-${10 + index}T15:00:00.000Z`,
    ).task);
    expect(selectGrowthInsight({tasks: tasks.slice(0, 3), now: NOW, dismissal: null})).toBeNull();
    expect(selectGrowthInsight({tasks, now: NOW, dismissal: null})).toMatchObject({
      action: {kind: 'reschedule_task'},
    });
  });

  it('suggests editing an oversized first step after repeated postponement', () => {
    const task = Object.assign(makeTask({
      firstStep: '先完成一整套没有拆分的复杂交付流程',
      estimatedMinutes: 30,
    }), {
      postponedCount: 2,
    });
    expect(selectGrowthInsight({tasks: [task], now: NOW, dismissal: null})).toMatchObject({
      action: {kind: 'edit_first_step', taskId: task.id},
    });
  });

  it('returns at most one insight and respects the seven-day dismissal', () => {
    const task = Object.assign(makeTask({firstStep: null}), {postponedCount: 3});
    const insight = selectGrowthInsight({tasks: [task], now: NOW, dismissal: null});
    expect(insight).not.toBeNull();
    expect(selectGrowthInsight({
      tasks: [task],
      now: NOW,
      dismissal: {id: insight!.id, dismissedAt: NOW},
    })).toBeNull();
    expect(selectGrowthInsight({
      tasks: [task],
      now: new Date(Date.parse(NOW) + INSIGHT_COOLDOWN_MILLISECONDS).toISOString(),
      dismissal: {id: insight!.id, dismissedAt: NOW},
    })).not.toBeNull();
  });

  it('does not emit a conclusion without qualifying local facts', () => {
    expect(selectGrowthInsight({tasks: [makeTask()], now: NOW, dismissal: null})).toBeNull();
  });
});
