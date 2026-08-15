import type {
  TaskLifecycleService,
} from './coreAppService';
import type {FocusSessionService} from './focusSessionService';
import type {
  PostFocusReviewRepository,
} from '../data/postFocusReviewRepository';
import {getQuadrant} from '../domain/quadrant';
import type {FocusSession} from '../domain/focusSession';
import {
  postFocusReviewReason,
  type ActivePostFocusReview,
  type FocusReviewReceipt,
  type PendingFocusReview,
  type PostFocusReviewOutcome,
  type PostFocusReviewStore,
  type SettlingFocusReview,
  type TodayFocusSummary,
  type TrackedFocusReview,
} from '../domain/postFocusReview';
import type {Task} from '../domain/task';

export type PostFocusReviewService = Readonly<{
  subscribe(listener: (active: ActivePostFocusReview | null) => void): () => void;
  restore(): Promise<ActivePostFocusReview | null>;
  trackStartedSession(session: FocusSession): Promise<void>;
  trackRestoredSession(session: FocusSession): Promise<void>;
  captureEndedSession(session: FocusSession): Promise<void>;
  recoverTrackedSession(): Promise<void>;
  recoverEligibleSessions(taskIds: readonly string[]): Promise<void>;
  settle(
    reviewId: string,
    outcome: PostFocusReviewOutcome,
    note: string,
  ): Promise<FocusReviewReceipt>;
  acknowledgeReceipt(receiptId: string): Promise<void>;
  getTodaySummary(): Promise<TodayFocusSummary>;
  listReceiptHistory(): Promise<ReceiptHistorySnapshot>;
}>;

export type ReceiptHistorySnapshot = Readonly<{
  receipts: readonly FocusReviewReceipt[];
}>;

type CreatePostFocusReviewServiceOptions = Readonly<{
  repository: PostFocusReviewRepository;
  focusService: FocusSessionService;
  taskLifecycle: TaskLifecycleService;
  now(): string;
}>;

function fail(code: string): never {
  throw new Error(code);
}

function canonicalTimestamp(value: unknown): string {
  if (typeof value !== 'string') {
    return fail('POST_FOCUS_REVIEW_INVALID_CLOCK');
  }
  const milliseconds = Date.parse(value);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    return fail('POST_FOCUS_REVIEW_INVALID_CLOCK');
  }
  return value;
}

function normalizeNote(value: unknown): string {
  if (typeof value !== 'string') {
    return fail('POST_FOCUS_REVIEW_INVALID_NOTE');
  }
  return value.trim();
}

function storeWithActive(
  store: PostFocusReviewStore,
  active: ActivePostFocusReview,
): PostFocusReviewStore {
  return {...store, active};
}

function reviewIdentity(
  session: FocusSession,
  task: Task,
  legacyCompletionShortcut: boolean,
): TrackedFocusReview {
  const reviewId = `post-focus-review:${session.id}`;
  return {
    kind: 'tracking',
    reviewId,
    receiptId: `${reviewId}:receipt`,
    completionOperationId: `${reviewId}:complete-task`,
    sessionId: session.id,
    taskId: session.taskId,
    taskTitle: task.title,
    quadrant: getQuadrant(task.important, task.urgent),
    startedAt: session.startedAt,
    plannedEndAt: session.plannedEndAt,
    legacyCompletionShortcut,
  };
}

function pendingFrom(
  identity: TrackedFocusReview,
  session: FocusSession,
): PendingFocusReview {
  if (
    session.status === 'running' ||
    session.endedAt === null ||
    session.actualSeconds === null
  ) {
    return fail('POST_FOCUS_REVIEW_SESSION_NOT_ENDED');
  }
  return {
    kind: 'pending',
    reviewId: identity.reviewId,
    receiptId: identity.receiptId,
    completionOperationId: identity.completionOperationId,
    sessionId: identity.sessionId,
    taskId: identity.taskId,
    taskTitle: identity.taskTitle,
    quadrant: identity.quadrant,
    startedAt: identity.startedAt,
    endedAt: session.endedAt,
    actualSeconds: session.actualSeconds,
    endKind: session.status === 'interrupted' ? 'interrupted' : 'natural',
    legacyCompletionShortcut: identity.legacyCompletionShortcut,
  };
}

function reviewForActive(
  active: ActivePostFocusReview,
): PendingFocusReview | null {
  if (active.kind === 'pending') {
    return active;
  }
  if (active.kind === 'settling') {
    return active.review;
  }
  return null;
}

function activeSessionId(active: ActivePostFocusReview): string {
  return active.kind === 'settling'
    ? active.review.sessionId
    : active.sessionId;
}

function sameIntent(
  settling: SettlingFocusReview,
  outcome: PostFocusReviewOutcome,
  note: string,
): boolean {
  return settling.outcome === outcome && settling.note === note;
}

export function createPostFocusReviewService(
  options: CreatePostFocusReviewServiceOptions,
): PostFocusReviewService {
  const {repository, focusService, taskLifecycle, now} = options;
  const listeners = new Set<(active: ActivePostFocusReview | null) => void>();
  let observedActive = false;
  let lastActive: ActivePostFocusReview | null = null;
  const settlementInFlight = new Map<
    string,
    Readonly<{
      fingerprint: string;
      promise: Promise<FocusReviewReceipt>;
    }>
  >();

  function emit(active: ActivePostFocusReview | null): void {
    observedActive = true;
    lastActive = active;
    for (const listener of Array.from(listeners)) {
      listener(active);
    }
  }

  async function requireTask(taskId: string): Promise<Task> {
    const task = await taskLifecycle.getById(taskId, {includeDeleted: true});
    if (task === null) {
      return fail('POST_FOCUS_REVIEW_TASK_NOT_FOUND');
    }
    return task;
  }

  async function trackSession(
    session: FocusSession,
    legacyCompletionShortcut: boolean,
  ): Promise<void> {
    if (session.status !== 'running') {
      return captureEndedSession(session);
    }
    const task = await requireTask(session.taskId);
    const tracked = reviewIdentity(session, task, legacyCompletionShortcut);
    const active = await repository.update(current => {
      const existing = current.active;
      if (existing !== null && activeSessionId(existing) === session.id) {
        return {next: null, result: existing};
      }
      if (
        existing !== null &&
        existing.kind !== 'receipt' &&
        activeSessionId(existing) !== session.id
      ) {
        return fail('POST_FOCUS_REVIEW_ACTIVE_CONFLICT');
      }
      return {
        next: storeWithActive(current, tracked),
        result: tracked,
      };
    });
    emit(active);
  }

  function trackStartedSession(session: FocusSession): Promise<void> {
    return trackSession(session, false);
  }

  function trackRestoredSession(session: FocusSession): Promise<void> {
    return trackSession(session, true);
  }

  async function captureEndedSession(session: FocusSession): Promise<void> {
    if (session.status === 'running') {
      return fail('POST_FOCUS_REVIEW_SESSION_NOT_ENDED');
    }
    const durableExisting = await repository.update<
      ActivePostFocusReview | null
    >(current => {
      const existing = current.active;
      if (existing === null || activeSessionId(existing) !== session.id) {
        return {next: null, result: null};
      }
      if (existing.kind !== 'tracking') {
        return {next: null, result: existing};
      }
      const pending = pendingFrom(existing, session);
      return {
        next: storeWithActive(current, pending),
        result: pending,
      };
    });
    if (durableExisting !== null) {
      emit(durableExisting);
      return;
    }
    const task = await requireTask(session.taskId);
    const fallbackIdentity = reviewIdentity(session, task, false);
    const active = await repository.update<ActivePostFocusReview>(current => {
      const existing = current.active;
      if (existing !== null && activeSessionId(existing) === session.id) {
        if (existing.kind !== 'tracking') {
          return {next: null, result: existing};
        }
        const pending = pendingFrom(existing, session);
        return {
          next: storeWithActive(current, pending),
          result: pending,
        };
      }
      const durableReceipt = current.receipts.find(
        receipt => receipt.sessionId === session.id,
      );
      if (durableReceipt !== undefined) {
        return {next: null, result: durableReceipt};
      }
      if (existing !== null && existing.kind !== 'receipt') {
        return fail('POST_FOCUS_REVIEW_ACTIVE_CONFLICT');
      }
      const pending = pendingFrom(fallbackIdentity, session);
      return {
        next: storeWithActive(current, pending),
        result: pending,
      };
    });
    emit(active);
  }

  async function recoverTrackedSession(): Promise<void> {
    const store = await repository.read();
    const active = store.active;
    if (active?.kind !== 'tracking') {
      emit(active);
      return;
    }
    const session = await focusService.getById(active.sessionId);
    if (session === null) {
      return fail('POST_FOCUS_REVIEW_FOCUS_NOT_FOUND');
    }
    if (session.status === 'running') {
      emit(active);
      return;
    }
    await captureEndedSession(session);
  }

  async function beginSettlement(
    reviewId: string,
    outcome: PostFocusReviewOutcome,
    note: string,
  ): Promise<SettlingFocusReview | FocusReviewReceipt> {
    return repository.update<SettlingFocusReview | FocusReviewReceipt>(current => {
      const active = current.active;
      if (active?.kind === 'receipt' && active.reviewId === reviewId) {
        return {next: null, result: active};
      }
      if (active?.kind === 'settling' && active.review.reviewId === reviewId) {
        if (!sameIntent(active, outcome, note)) {
          return fail('POST_FOCUS_REVIEW_SETTLEMENT_CONFLICT');
        }
        return {next: null, result: active};
      }
      if (active?.kind !== 'pending' || active.reviewId !== reviewId) {
        return fail('POST_FOCUS_REVIEW_NOT_PENDING');
      }
      const settling: SettlingFocusReview = {
        kind: 'settling',
        review: active,
        outcome,
        note,
        settledAt: canonicalTimestamp(now()),
        stage: 'task_commit_needed',
        awardedPoints: null,
        completionQuadrant: null,
      };
      return {
        next: storeWithActive(current, settling),
        result: settling,
      };
    });
  }

  async function commitTaskIfNeeded(
    settling: SettlingFocusReview,
  ): Promise<SettlingFocusReview | FocusReviewReceipt> {
    if (settling.stage === 'task_committed') {
      return settling;
    }
    const completion = settling.outcome === 'progress'
      ? null
      : await taskLifecycle.complete(settling.review.taskId, {
            operationId: settling.review.completionOperationId,
          });
    const points = completion?.points ?? 0;
    const completionQuadrant = completion === null
      ? settling.review.quadrant
      : getQuadrant(completion.task.important, completion.task.urgent);
    return repository.update<SettlingFocusReview | FocusReviewReceipt>(current => {
      const active = current.active;
      if (
        active?.kind === 'receipt' &&
        active.reviewId === settling.review.reviewId
      ) {
        return {next: null, result: active};
      }
      if (
        active?.kind !== 'settling' ||
        active.review.reviewId !== settling.review.reviewId ||
        !sameIntent(active, settling.outcome, settling.note)
      ) {
        return fail('POST_FOCUS_REVIEW_SETTLEMENT_CONFLICT');
      }
      if (active.stage === 'task_committed') {
        return {next: null, result: active};
      }
      const committed: SettlingFocusReview = {
        ...active,
        stage: 'task_committed',
        awardedPoints: points,
        completionQuadrant,
      };
      return {
        next: storeWithActive(current, committed),
        result: committed,
      };
    });
  }

  async function commitReceipt(
    settling: SettlingFocusReview,
  ): Promise<FocusReviewReceipt> {
    if (
      settling.stage !== 'task_committed' ||
      settling.awardedPoints === null ||
      settling.completionQuadrant === null
    ) {
      return fail('POST_FOCUS_REVIEW_TASK_COMMIT_REQUIRED');
    }
    return repository.update(current => {
      const active = current.active;
      if (
        active?.kind === 'receipt' &&
        active.reviewId === settling.review.reviewId
      ) {
        return {next: null, result: active};
      }
      if (
        active?.kind !== 'settling' ||
        active.review.reviewId !== settling.review.reviewId ||
        active.stage !== 'task_committed' ||
        active.awardedPoints === null ||
        active.completionQuadrant === null
      ) {
        return fail('POST_FOCUS_REVIEW_SETTLEMENT_CONFLICT');
      }
      const statsDay = active.settledAt.slice(0, 10);
      const previousReceipts = current.receipts.filter(
        receipt => receipt.receiptId !== active.review.receiptId,
      );
      const receiptsToday = previousReceipts.filter(
        receipt => receipt.statsDay === statsDay,
      );
      const receipt: FocusReviewReceipt = {
        kind: 'receipt',
        receiptId: active.review.receiptId,
        reviewId: active.review.reviewId,
        sessionId: active.review.sessionId,
        taskId: active.review.taskId,
        taskTitle: active.review.taskTitle,
        quadrant: active.completionQuadrant,
        startedAt: active.review.startedAt,
        endedAt: active.review.endedAt,
        actualSeconds: active.review.actualSeconds,
        endKind: active.review.endKind,
        outcome: active.outcome,
        note: active.note,
        awardedPoints: active.awardedPoints,
        reason: postFocusReviewReason(active.outcome, active.completionQuadrant),
        settledAt: active.settledAt,
        statsDay,
        todayFocusCount: receiptsToday.length + 1,
        todayFocusMinutes: Math.floor(
          (
            receiptsToday.reduce(
              (total, candidate) => total + candidate.actualSeconds,
              0,
            ) + active.review.actualSeconds
          ) / 60,
        ),
        acknowledgedAt: null,
      };
      return {
        next: {
          ...current,
          active: receipt,
          receipts: [...previousReceipts, receipt],
        },
        result: receipt,
      };
    });
  }

  async function resumeSettlement(
    settling: SettlingFocusReview,
  ): Promise<FocusReviewReceipt> {
    const committed = await commitTaskIfNeeded(settling);
    if (committed.kind === 'receipt') {
      emit(committed);
      return committed;
    }
    const receipt = await commitReceipt(committed);
    emit(receipt);
    return receipt;
  }

  async function settle(
    reviewId: string,
    outcome: PostFocusReviewOutcome,
    rawNote: string,
  ): Promise<FocusReviewReceipt> {
    const note = normalizeNote(rawNote);
    const fingerprint = JSON.stringify([outcome, note]);
    const existing = settlementInFlight.get(reviewId);
    if (existing !== undefined) {
      if (existing.fingerprint !== fingerprint) {
        return fail('POST_FOCUS_REVIEW_SETTLEMENT_CONFLICT');
      }
      return existing.promise;
    }
    let pending: Promise<FocusReviewReceipt>;
    pending = beginSettlement(reviewId, outcome, note)
      .then(started => {
        emit(started);
        return started.kind === 'receipt'
          ? started
          : resumeSettlement(started);
      })
      .finally(() => {
        if (settlementInFlight.get(reviewId)?.promise === pending) {
          settlementInFlight.delete(reviewId);
        }
      });
    settlementInFlight.set(reviewId, {fingerprint, promise: pending});
    return pending;
  }

  async function restore(): Promise<ActivePostFocusReview | null> {
    const store = await repository.read();
    const active = store.active;
    if (active?.kind === 'tracking') {
      await recoverTrackedSession();
      return (await repository.read()).active;
    }
    if (active?.kind === 'settling') {
      return resumeSettlement(active);
    }
    emit(active);
    return active;
  }

  async function acknowledgeReceipt(receiptId: string): Promise<void> {
    const active = await repository.update<ActivePostFocusReview | null>(
      current => {
        const receiptIndex = current.receipts.findIndex(
          receipt => receipt.receiptId === receiptId,
        );
        if (receiptIndex < 0) {
          return fail('POST_FOCUS_REVIEW_RECEIPT_NOT_FOUND');
        }
        const receipt = current.receipts[receiptIndex];
        if (receipt === undefined) {
          return fail('POST_FOCUS_REVIEW_RECEIPT_NOT_FOUND');
        }
        const clearsActive =
          current.active?.kind === 'receipt' &&
          current.active.receiptId === receiptId;
        if (receipt.acknowledgedAt !== null && !clearsActive) {
          return {next: null, result: current.active};
        }
        const receipts = receipt.acknowledgedAt === null
          ? current.receipts.map((candidate, index) =>
              index === receiptIndex
                ? {
                    ...candidate,
                    acknowledgedAt: canonicalTimestamp(now()),
                  }
                : candidate,
            )
          : current.receipts;
        const next = {
          ...current,
          active: clearsActive ? null : current.active,
          receipts,
        };
        return {next, result: next.active};
      },
    );
    emit(active);
  }

  async function getTodaySummary(): Promise<TodayFocusSummary> {
    const day = canonicalTimestamp(now()).slice(0, 10);
    const store = await repository.read();
    const distinct = new Map<string, FocusReviewReceipt>();
    for (const receipt of store.receipts) {
      if (receipt.statsDay === day) {
        distinct.set(receipt.receiptId, receipt);
      }
    }
    const receipts = Array.from(distinct.values());
    return {
      day,
      count: receipts.length,
      minutes: Math.floor(
        receipts.reduce(
          (total, receipt) => total + receipt.actualSeconds,
          0,
        ) / 60,
      ),
    };
  }

  async function listReceiptHistory(): Promise<ReceiptHistorySnapshot> {
    const store = await repository.read();
    const receipts = store.receipts
      .filter(receipt => receipt.acknowledgedAt !== null)
      .sort((left, right) => {
        if (left.settledAt !== right.settledAt) {
          return left.settledAt > right.settledAt ? -1 : 1;
        }
        return left.receiptId < right.receiptId
          ? -1
          : left.receiptId > right.receiptId
            ? 1
            : 0;
      });
    return {receipts};
  }

  async function recoverEligibleSessions(
    taskIds: readonly string[],
  ): Promise<void> {
    await recoverTrackedSession();
    const store = await repository.read();
    if (store.active !== null) {
      // Pending, settlement and receipt are authoritative. A running tracking
      // record is also left untouched until its own focus session terminalizes.
      emit(store.active);
      return;
    }
    const settledSessionIds = new Set(
      store.receipts.map(receipt => receipt.sessionId),
    );
    const terminal: FocusSession[] = [];
    for (const taskId of Array.from(new Set(taskIds))) {
      const query = await focusService.listForTask(taskId);
      terminal.push(
        ...query.sessions.filter(
          session =>
            session.status !== 'running' &&
            !settledSessionIds.has(session.id),
        ),
      );
    }
    terminal.sort((left, right) => {
      const rightAt = Date.parse(right.endedAt ?? right.updatedAt);
      const leftAt = Date.parse(left.endedAt ?? left.updatedAt);
      if (rightAt !== leftAt) {
        return rightAt - leftAt;
      }
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    });
    const orphan = terminal[0];
    if (orphan !== undefined) {
      await captureEndedSession(orphan);
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (observedActive) {
        listener(lastActive);
      }
      return () => {
        listeners.delete(listener);
      };
    },
    restore,
    trackStartedSession,
    trackRestoredSession,
    captureEndedSession,
    recoverTrackedSession,
    recoverEligibleSessions,
    settle,
    acknowledgeReceipt,
    getTodaySummary,
    listReceiptHistory,
  };
}
