import type {FocusSession} from './focusSession';
import type {PlannedWorkSession, Task} from './task';
import {effectiveQuadrantForTask} from './taskPriority';

export type FocusAgendaItem = Readonly<{
  task: Task;
  session: PlannedWorkSession;
}>;

export type GrowthMetric = Readonly<{label: string; value: string}>;

export type GrowthPageSummary = Readonly<{
  today: readonly GrowthMetric[];
  week: readonly GrowthMetric[];
  hasWeeklySample: boolean;
}>;

export function selectFocusAgenda(tasks: readonly Task[]): readonly FocusAgendaItem[] {
  const agenda: FocusAgendaItem[] = [];
  for (const task of tasks) {
    for (const session of task.plannedWorkSessions ?? []) {
      if (session.status === 'PLANNED') agenda.push({task, session});
    }
  }
  return agenda.sort(
    (left, right) => Date.parse(left.session.plannedStartAt) - Date.parse(right.session.plannedStartAt),
  );
}

export function selectTodayFocusAgenda(
  tasks: readonly Task[],
  nowInput: string,
  limit = 3,
): readonly FocusAgendaItem[] {
  const day = nowInput.slice(0, 10);
  return selectFocusAgenda(tasks)
    .filter(item => item.session.plannedStartAt.slice(0, 10) === day)
    .slice(0, Math.max(0, limit));
}

function sessionMinutes(session: FocusSession): number {
  if (session.actualSeconds !== null) return Math.max(0, Math.round(session.actualSeconds / 60));
  return session.status === 'completed' ? session.plannedMinutes : 0;
}

export function selectGrowthPageSummary(input: Readonly<{
  tasks: readonly Task[];
  sessions: readonly FocusSession[];
  now: string;
}>): GrowthPageSummary {
  const todayKey = input.now.slice(0, 10);
  const nowMs = Date.parse(input.now);
  const weekStart = nowMs - 7 * 24 * 60 * 60 * 1000;
  const taskById = new Map(input.tasks.map(task => [task.id, task]));
  const todaySessions = input.sessions.filter(session => session.startedAt.slice(0, 10) === todayKey);
  const weekSessions = input.sessions.filter(session => {
    const started = Date.parse(session.startedAt);
    return Number.isFinite(started) && started >= weekStart && started <= nowMs;
  });
  const minutes = (sessions: readonly FocusSession[]) =>
    sessions.reduce((total, session) => total + sessionMinutes(session), 0);
  const growthMinutes = (sessions: readonly FocusSession[]) =>
    sessions.reduce((total, session) => {
      const task = taskById.get(session.taskId);
      return task !== undefined && effectiveQuadrantForTask(task, input.now) === 'Q2'
        ? total + sessionMinutes(session)
        : total;
    }, 0);
  const completedThisWeek = input.tasks.filter(task => {
    if (task.completedAt === null) return false;
    const completed = Date.parse(task.completedAt);
    return Number.isFinite(completed) && completed >= weekStart && completed <= nowMs;
  }).length;

  return {
    today: [
      {label: '今日投入', value: `${minutes(todaySessions)} 分钟`},
      {label: '主动开始', value: `${todaySessions.length} 次`},
      {label: '成长区投入', value: `${growthMinutes(todaySessions)} 分钟`},
    ],
    week: [
      {label: '完成专注', value: `${weekSessions.length} 次`},
      {label: '成长区投入', value: `${growthMinutes(weekSessions)} 分钟`},
      {label: '完成任务', value: `${completedThisWeek} 项`},
    ],
    hasWeeklySample: weekSessions.length >= 3 || completedThisWeek >= 2,
  };
}

export function formatPageDate(nowInput: string): string {
  const date = new Date(nowInput);
  if (!Number.isFinite(date.getTime())) return nowInput.slice(0, 10);
  const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]!;
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日 · ${weekday}`;
}

export function formatAgendaTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '--:--';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
