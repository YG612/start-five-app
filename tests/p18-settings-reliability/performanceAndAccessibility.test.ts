import {createGrowthPageSummarySelector} from '../../src/domain/pageExperience';
import type {Task} from '../../src/domain/task';

const {readFileSync} = require('fs') as {
  readFileSync(path: string, encoding: 'utf8'): string;
};

function task(index: number): Task {
  const now = '2026-08-16T08:00:00.000Z';
  return {
    id: `task-${index}`,
    title: `任务 ${index}`,
    description: '',
    important: index % 2 === 0,
    urgent: index % 3 === 0,
    status: 'pending',
    startAt: null,
    scheduledStartAt: null,
    dueAt: null,
    estimatedMinutes: 5,
    firstStep: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    deletedAt: null,
    score: null,
    scoreAwardedAt: null,
    subtasks: [],
  };
}

describe('P18 performance and accessibility closure', () => {
  it('memoizes growth aggregation until data or the local date changes and handles 5000 tasks', () => {
    const tasks = Array.from({length: 5_000}, (_, index) => task(index));
    const sessions = [] as const;
    const selector = createGrowthPageSummarySelector();
    const startedAt = Date.now();
    const first = selector({
      tasks,
      sessions,
      now: '2026-08-16T08:00:00.000Z',
      timeZone: 'Asia/Shanghai',
    });
    const sameDay = selector({
      tasks,
      sessions,
      now: '2026-08-16T12:00:00.000Z',
      timeZone: 'Asia/Shanghai',
    });
    expect(sameDay).toBe(first);
    expect(Date.now() - startedAt).toBeLessThan(2_000);

    const nextDay = selector({
      tasks,
      sessions,
      now: '2026-08-17T08:00:00.000Z',
      timeZone: 'Asia/Shanghai',
    });
    expect(nextDay).not.toBe(first);
    const changedData = selector({
      tasks: [...tasks],
      sessions,
      now: '2026-08-17T08:00:00.000Z',
      timeZone: 'Asia/Shanghai',
    });
    expect(changedData).not.toBe(nextDay);
  });

  it('keeps settings rows multiline and timer copy free from per-second accessibility announcements', () => {
    const appPage = readFileSync('src/components/AppPage.tsx', 'utf8');
    const home = readFileSync('src/screens/QuadrantHomeScreen.tsx', 'utf8');
    expect(appPage).toContain("alignItems: 'flex-start'");
    expect(appPage).toContain('flexShrink: 1');
    expect(appPage).not.toMatch(/row:\s*\{[^}]*height:\s*\d+/);
    expect(home).not.toMatch(/announceForAccessibility\([^)]*(remaining|seconds|秒)/i);
    expect(home).toContain('reduceMotion={settings.reduceMotion}');
  });

  it('connects keep-awake and completion feedback preferences to both native platforms', () => {
    const home = readFileSync('src/screens/QuadrantHomeScreen.tsx', 'utf8');
    const android = readFileSync(
      'android/app/src/main/java/com/startfive/app/notifications/StartFiveNotificationsModule.kt',
      'utf8',
    );
    const ios = readFileSync('ios/StartFive/StartFiveNotifications.swift', 'utf8');
    expect(home).toContain('setKeepScreenAwake(enabled)');
    expect(home).toContain('playFocusCompletionFeedback?.({');
    expect(android).toContain('FLAG_KEEP_SCREEN_ON');
    expect(android).toContain('playFocusCompletionFeedback');
    expect(ios).toContain('isIdleTimerDisabled = enabled');
    expect(ios).toContain('playFocusCompletionFeedback');
  });
});
