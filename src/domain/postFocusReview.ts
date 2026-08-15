import type {Quadrant} from './quadrant';

export type PostFocusReviewEndKind = 'natural' | 'interrupted';
export type PostFocusReviewOutcome = 'progress' | 'complete';

export type TrackedFocusReview = Readonly<{
  kind: 'tracking';
  reviewId: string;
  receiptId: string;
  completionOperationId: string;
  sessionId: string;
  taskId: string;
  taskTitle: string;
  quadrant: Quadrant;
  startedAt: string;
  plannedEndAt: string;
  legacyCompletionShortcut: boolean;
}>;

export type PendingFocusReview = Readonly<{
  kind: 'pending';
  reviewId: string;
  receiptId: string;
  completionOperationId: string;
  sessionId: string;
  taskId: string;
  taskTitle: string;
  quadrant: Quadrant;
  startedAt: string;
  endedAt: string;
  actualSeconds: number;
  endKind: PostFocusReviewEndKind;
  legacyCompletionShortcut: boolean;
}>;

export type SettlingFocusReview = Readonly<{
  kind: 'settling';
  review: PendingFocusReview;
  outcome: PostFocusReviewOutcome;
  note: string;
  settledAt: string;
  stage: 'task_commit_needed' | 'task_committed';
  awardedPoints: number | null;
  completionQuadrant: Quadrant | null;
}>;

export type FocusReviewReceipt = Readonly<{
  kind: 'receipt';
  receiptId: string;
  reviewId: string;
  sessionId: string;
  taskId: string;
  taskTitle: string;
  quadrant: Quadrant;
  startedAt: string;
  endedAt: string;
  actualSeconds: number;
  endKind: PostFocusReviewEndKind;
  outcome: PostFocusReviewOutcome;
  note: string;
  awardedPoints: number;
  reason: string;
  settledAt: string;
  statsDay: string;
  todayFocusCount: number;
  todayFocusMinutes: number;
  acknowledgedAt: string | null;
}>;

export type TodayFocusSummary = Readonly<{
  day: string;
  count: number;
  minutes: number;
}>;

export type ActivePostFocusReview =
  | TrackedFocusReview
  | PendingFocusReview
  | SettlingFocusReview
  | FocusReviewReceipt;

export type PostFocusReviewStore = Readonly<{
  schema: 'start-five.post-focus-review';
  version: 1;
  active: ActivePostFocusReview | null;
  receipts: readonly FocusReviewReceipt[];
}>;

export const EMPTY_POST_FOCUS_REVIEW_STORE: PostFocusReviewStore = {
  schema: 'start-five.post-focus-review',
  version: 1,
  active: null,
  receipts: [],
};

export function postFocusReviewReason(
  outcome: PostFocusReviewOutcome,
  quadrant: Quadrant,
): string {
  if (outcome === 'progress') {
    return '记录专注进展（任务未完成）';
  }
  const label: Readonly<Record<Quadrant, string>> = {
    Q1: '完成救火区任务',
    Q2: '完成成长区任务',
    Q3: '完成干扰区任务',
    Q4: '完成清理区任务',
  };
  return label[quadrant];
}
