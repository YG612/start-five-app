import {
  parseQuickTaskSentence,
  QUICK_TASK_MAX_LENGTH,
} from '../../src/domain/quickTaskParser';

const NOW = '2026-08-14T08:00:00.000Z';

describe('P8-04 local quick sentence parser', () => {
  it('supports at least 95% of a 72-case date/time/duration corpus', () => {
    const dates = ['今天', '明天', '后天', '周一', '周三', '下周五'];
    const times = ['早上', '下午', '晚上8点', '20:30'];
    const durations = ['15分钟', '1小时', ''];
    const corpus = dates.flatMap(date =>
      times.flatMap(time => durations.map(duration => `${date} ${time} 完成报告 ${duration}`)),
    );
    expect(corpus).toHaveLength(72);
    const supported = corpus.filter(sentence => {
      const parsed = parseQuickTaskSentence(sentence, NOW);
      return parsed.dueAt !== null && parsed.title === '完成报告';
    });
    expect(supported.length / corpus.length).toBeGreaterThanOrEqual(0.95);
  });

  it('recognizes daily, weekly, and monthly recurrence as editable structured data', () => {
    expect(parseQuickTaskSentence('每天明天早上9点写日报', NOW).repeatRule).toEqual({frequency: 'daily'});
    expect(parseQuickTaskSentence('每周周一下午3点复盘', NOW).repeatRule).toEqual({frequency: 'weekly', weekdays: [1]});
    expect(parseQuickTaskSentence('每月明天晚上8点对账', NOW).repeatRule).toMatchObject({frequency: 'monthly'});
  });

  it('sends a passed Friday to the next week and keeps local time semantics', () => {
    const parsed = parseQuickTaskSentence('周五晚上8点提交周报', '2026-08-14T10:00:00.000Z');
    expect(parsed.dueAt).not.toBeNull();
    const due = new Date(parsed.dueAt ?? 0);
    const now = new Date('2026-08-14T10:00:00.000Z');
    expect((due.getTime() - now.getTime()) / 86_400_000).toBeGreaterThan(6);
  });

  it('keeps ambiguous content as title and always succeeds on fallback', () => {
    const inputs = [
      '研究 2026 版本',
      '也许月底处理一下',
      '🙂 整理灵感',
      '没有任何日期的普通任务',
    ];
    for (const input of inputs) {
      const parsed = parseQuickTaskSentence(input, NOW);
      expect(parsed.title).toBe(input);
      expect(parsed.dueAt).toBeNull();
    }
  });

  it('warns through truncation metadata and never stores over 500 characters', () => {
    const parsed = parseQuickTaskSentence('任'.repeat(QUICK_TASK_MAX_LENGTH + 20), NOW);
    expect(parsed.truncated).toBe(true);
    expect(parsed.title).toHaveLength(QUICK_TASK_MAX_LENGTH);
  });
});
