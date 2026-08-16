import type {FocusDurationMinutes, FocusSession} from './focusSession';

export type PreferredFocusMinutes = Extract<FocusDurationMinutes, 2 | 5 | 15 | 25 | 50>;

export type FocusDurationRecommendation = Readonly<{
  candidateMinutes: PreferredFocusMinutes;
  candidateCompletionRate: number;
  currentCompletionRate: number;
  candidateSampleSize: number;
  totalCompletedSessions: number;
}>;

const CANDIDATES = [2, 5, 15, 25, 50] as const;
const THIRTY_DAYS_MS = 30 * 86_400_000;

export function selectFocusDurationRecommendation(input: Readonly<{
  sessions: readonly FocusSession[];
  currentDefault: PreferredFocusMinutes;
  now: string;
  dismissedAt: string | null;
}>): FocusDurationRecommendation | null {
  const now = Date.parse(input.now);
  if (!Number.isFinite(now)) throw new Error('INVALID_TIMESTAMP');
  if (
    input.dismissedAt !== null &&
    Number.isFinite(Date.parse(input.dismissedAt)) &&
    now - Date.parse(input.dismissedAt) < THIRTY_DAYS_MS
  ) return null;

  const terminal = input.sessions.filter(
    session => session.status === 'completed' || session.status === 'interrupted',
  );
  const totalCompletedSessions = terminal.filter(
    session => session.status === 'completed',
  ).length;
  if (totalCompletedSessions < 10) return null;

  const rateFor = (minutes: PreferredFocusMinutes) => {
    const samples = terminal.filter(session => session.plannedMinutes === minutes);
    const completed = samples.filter(session => session.status === 'completed').length;
    return {
      samples: samples.length,
      rate: samples.length === 0 ? 0 : completed / samples.length,
    };
  };
  const current = rateFor(input.currentDefault);
  let selected: FocusDurationRecommendation | null = null;
  for (const candidateMinutes of CANDIDATES) {
    if (candidateMinutes === input.currentDefault) continue;
    const candidate = rateFor(candidateMinutes);
    if (candidate.samples < 3 || candidate.rate - current.rate < 0.2) continue;
    const next: FocusDurationRecommendation = {
      candidateMinutes,
      candidateCompletionRate: candidate.rate,
      currentCompletionRate: current.rate,
      candidateSampleSize: candidate.samples,
      totalCompletedSessions,
    };
    if (
      selected === null ||
      next.candidateCompletionRate > selected.candidateCompletionRate ||
      (next.candidateCompletionRate === selected.candidateCompletionRate &&
        next.candidateSampleSize > selected.candidateSampleSize) ||
      (next.candidateCompletionRate === selected.candidateCompletionRate &&
        next.candidateSampleSize === selected.candidateSampleSize &&
        next.candidateMinutes < selected.candidateMinutes)
    ) selected = next;
  }
  return selected;
}
