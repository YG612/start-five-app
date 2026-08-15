import {
  awardCompletionScore,
  BASE_SCORE_BY_QUADRANT,
} from '../../../src/domain/scoring';
import {ISO, makeTask} from '../fixtures/taskFactory';

describe('SF-008 fixed quadrant base score', () => {
  it('publishes the exact 35/45/15/5 base score table', () => {
    expect(BASE_SCORE_BY_QUADRANT).toEqual({Q1: 35, Q2: 45, Q3: 15, Q4: 5});
  });

  it.each([
    {important: true, urgent: true, expected: 35},
    {important: true, urgent: false, expected: 45},
    {important: false, urgent: true, expected: 15},
    {important: false, urgent: false, expected: 5},
  ])(
    'awards $expected for important=$important urgent=$urgent',
    ({important, urgent, expected}) => {
      const result = awardCompletionScore(
        makeTask({
          important,
          urgent,
          status: 'completed',
          completedAt: ISO.completed,
        }),
        ISO.completed,
      );

      expect(result.points).toBe(expected);
      expect(result.task).toMatchObject({
        score: expected,
        scoreAwardedAt: ISO.completed,
      });
    },
  );

  it('awards a completed task only once and keeps the original award metadata', () => {
    const first = awardCompletionScore(
      makeTask({
        important: true,
        urgent: false,
        status: 'completed',
        completedAt: ISO.completed,
      }),
      ISO.completed,
    );
    const second = awardCompletionScore(
      first.task,
      '2026-02-01T00:00:00.000Z',
    );

    expect(first.points).toBe(45);
    expect(second.points).toBe(0);
    expect(second.task.score).toBe(45);
    expect(second.task.scoreAwardedAt).toBe(ISO.completed);
  });
});
