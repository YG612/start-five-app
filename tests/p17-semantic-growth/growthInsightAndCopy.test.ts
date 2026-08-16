import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {awardFirstStartReward} from '../../src/domain/growth';
import {
  INSIGHT_COOLDOWN_MILLISECONDS,
  selectGrowthInsight,
} from '../../src/domain/growthInsights';
import type {FocusSession} from '../../src/domain/focusSession';
import {makeTask} from '../locked/fixtures/taskFactory';
import {
  QUADRANT_HOME_PREFERENCES_KEY,
  createQuadrantHomePreferences,
} from '../../src/data/quadrantHomePreferences';
import {WorkspaceBackend} from '../gap-p0-06r1/gapP006TestKit';

declare const __dirname: string;

const NOW = '2026-08-16T23:30:00.000Z';

function lateSession(id: string, taskId: string, day: number): FocusSession {
  const startedAt = `2026-08-${String(day).padStart(2, '0')}T22:30:00.000Z`;
  return {
    id,
    taskId,
    plannedMinutes: 25,
    status: 'completed',
    startedAt,
    plannedEndAt: `2026-08-${String(day).padStart(2, '0')}T22:55:00.000Z`,
    endedAt: `2026-08-${String(day).padStart(2, '0')}T22:35:00.000Z`,
    actualSeconds: 300,
    interruptionReason: null,
    createdAt: startedAt,
    updatedAt: `2026-08-${String(day).padStart(2, '0')}T22:35:00.000Z`,
    snapshot: {taskId, quadrantAtStart: 'Q2', importanceScoreAtStart: 80},
  };
}

describe('P17 single actionable insight and growth copy', () => {
  it('requires four exact late-start samples and opens a real schedule action', () => {
    const task = makeTask({id: 'paper', title: '论文', important: true, urgent: false});
    const sessions = [12, 13, 14, 15].map((day, index) =>
      lateSession(`late-${index}`, task.id, day),
    );
    expect(selectGrowthInsight({
      tasks: [task], sessions: sessions.slice(0, 3), now: NOW, dismissal: null,
    })).toBeNull();
    const insight = selectGrowthInsight({
      tasks: [task], sessions, now: NOW, dismissal: null,
    });
    expect(insight).toMatchObject({
      action: {
        kind: 'create_focus_schedule',
        taskId: task.id,
        suggestedLocalTime: '20:30',
      },
    });
    expect(insight?.description).toContain('最近 4 次');
  });

  it('suppresses a dismissed suggestion for 30 days', () => {
    const task = Object.assign(makeTask({id: 'postponed', firstStep: null}), {postponedCount: 3});
    const insight = selectGrowthInsight({tasks: [task], sessions: [], now: NOW, dismissal: null});
    expect(insight).not.toBeNull();
    expect(selectGrowthInsight({
      tasks: [task], sessions: [], now: NOW,
      dismissal: {id: insight!.id, dismissedAt: NOW},
    })).toBeNull();
    expect(selectGrowthInsight({
      tasks: [task], sessions: [],
      now: new Date(Date.parse(NOW) + INSIGHT_COOLDOWN_MILLISECONDS).toISOString(),
      dismissal: {id: insight!.id, dismissedAt: NOW},
    })).not.toBeNull();
  });

  it('persists multiple dismissal cooldowns without losing the earlier advice', async () => {
    const backend = new WorkspaceBackend();
    const preferences = createQuadrantHomePreferences(backend);
    const dismissals = [
      {id: 'late-growth-start:paper:4', dismissedAt: NOW},
      {id: 'postponed-first-step:task:3', dismissedAt: NOW},
    ];
    await preferences.writeSettings({
      insightDismissal: dismissals[1]!,
      insightDismissals: dismissals,
    });
    await expect(preferences.readSettings()).resolves.toMatchObject({
      insightDismissals: dismissals,
    });
    const raw = JSON.parse((await backend.getItem(QUADRANT_HOME_PREFERENCES_KEY))!) as {
      version: number;
    };
    expect(raw.version).toBe(7);
  });

  it('keeps reward writes idempotent and user-facing copy consistently says growth value', () => {
    const task = makeTask({id: 'reward'});
    const first = awardFirstStartReward(task, NOW);
    const duplicate = awardFirstStartReward(first.task, NOW);
    expect(first.points).toBe(3);
    expect(duplicate.points).toBe(0);
    expect(duplicate.task.growthRewards).toHaveLength(1);

    const source = readFileSync(
      join(__dirname, '..', '..', 'src/screens/QuadrantHomeScreen.tsx'),
      'utf8',
    );
    expect(source).toContain('完成第一次有效专注，它就会开始发芽。');
    expect(source).toContain('连续主动开始');
    expect(source).toContain('30 天内不再提示');
    expect(source).toContain('+{reward.points} 成长值');
    expect(source).not.toContain('7 天内不再提示');
    expect(source).not.toContain('本次积分');
  });
});
