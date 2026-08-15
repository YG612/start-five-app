import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {PostFocusReviewService} from '../application/postFocusReviewService';
import type {
  ActivePostFocusReview,
  FocusReviewReceipt,
  PendingFocusReview,
  PostFocusReviewOutcome,
  TodayFocusSummary,
} from '../domain/postFocusReview';

export type PostFocusReviewRuntimeSnapshot = Readonly<{
  loaded: boolean;
  active: ActivePostFocusReview | null;
  errorText: string | null;
  settlementPending: boolean;
  workspaceRefreshPending: boolean;
  workspaceRefreshFailed: boolean;
  receiptAcknowledgementFailed: boolean;
  todaySummary: TodayFocusSummary | null;
}>;

export type PostFocusReviewRuntime = Readonly<{
  snapshot: PostFocusReviewRuntimeSnapshot;
  visibleReview: PendingFocusReview | null;
  visibleReceipt: FocusReviewReceipt | null;
  settle(
    outcome: PostFocusReviewOutcome,
    note: string,
  ): Promise<FocusReviewReceipt>;
  dismissReview(): Promise<FocusReviewReceipt>;
  returnToWorkspace(
    refresh: () => Promise<void>,
    closeWorkspaceTask: () => void,
  ): Promise<void>;
}>;

type PostFocusReviewRuntimeProviderProps = Readonly<{
  service: PostFocusReviewService;
  children: React.ReactNode;
}>;

const INITIAL_SNAPSHOT: PostFocusReviewRuntimeSnapshot = {
  loaded: false,
  active: null,
  errorText: null,
  settlementPending: false,
  workspaceRefreshPending: false,
  workspaceRefreshFailed: false,
  receiptAcknowledgementFailed: false,
  todaySummary: null,
};

const PostFocusReviewRuntimeContext =
  createContext<PostFocusReviewRuntime | null>(null);

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() !== ''
    ? error.message
    : 'POST_FOCUS_REVIEW_OPERATION_FAILED';
}

function pendingFor(
  active: ActivePostFocusReview | null,
): PendingFocusReview | null {
  if (active?.kind === 'pending') {
    return active;
  }
  if (active?.kind === 'settling') {
    return active.review;
  }
  return null;
}

export function PostFocusReviewRuntimeProvider({
  service,
  children,
}: PostFocusReviewRuntimeProviderProps): React.JSX.Element {
  const [snapshot, setSnapshot] =
    useState<PostFocusReviewRuntimeSnapshot>(INITIAL_SNAPSHOT);
  const mountedRef = useRef(true);
  const activeRef = useRef<ActivePostFocusReview | null>(null);
  const dismissedReceiptIdRef = useRef<string | null>(null);
  const settlementRef = useRef<Promise<FocusReviewReceipt> | null>(null);
  const workspaceRefreshRef = useRef<Promise<void> | null>(null);
  const summaryGenerationRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    const unsubscribe = service.subscribe(active => {
      const summaryGeneration = summaryGenerationRef.current + 1;
      summaryGenerationRef.current = summaryGeneration;
      activeRef.current = active;
      if (active?.kind !== 'receipt') {
        dismissedReceiptIdRef.current = null;
      }
      if (mountedRef.current) {
        setSnapshot(current => ({
          ...current,
          loaded: true,
          active,
          errorText: null,
        }));
      }
      void service
        .getTodaySummary()
        .then(todaySummary => {
          if (
            mountedRef.current &&
            summaryGenerationRef.current === summaryGeneration
          ) {
            setSnapshot(current => ({...current, todaySummary}));
          }
        })
        .catch(() => undefined);
    });
    return () => {
      mountedRef.current = false;
      summaryGenerationRef.current += 1;
      unsubscribe();
    };
  }, [service]);

  const active = snapshot.active;
  const visibleReceipt =
    active?.kind === 'receipt' &&
    active.receiptId !== dismissedReceiptIdRef.current
      ? active
      : null;
  const visibleReview = pendingFor(active);

  const runtime = useMemo<PostFocusReviewRuntime>(() => ({
    snapshot,
    visibleReview,
    visibleReceipt,
    settle(outcome, note) {
      const existing = settlementRef.current;
      if (existing !== null) {
        return existing;
      }
      const review = pendingFor(activeRef.current);
      if (review === null) {
        return Promise.reject(new Error('POST_FOCUS_REVIEW_NOT_PENDING'));
      }
      if (mountedRef.current) {
        setSnapshot(current => ({
          ...current,
          settlementPending: true,
          errorText: null,
        }));
      }
      let pending: Promise<FocusReviewReceipt>;
      pending = service
        .settle(review.reviewId, outcome, note)
        .catch(error => {
          if (mountedRef.current) {
            setSnapshot(current => ({
              ...current,
              errorText: errorMessage(error),
            }));
          }
          throw error;
        })
        .finally(() => {
          if (settlementRef.current === pending) {
            settlementRef.current = null;
          }
          if (mountedRef.current) {
            setSnapshot(current => ({
              ...current,
              settlementPending: false,
            }));
          }
        });
      settlementRef.current = pending;
      return pending;
    },
    dismissReview() {
      const review = pendingFor(activeRef.current);
      if (review === null) {
        return Promise.reject(new Error('POST_FOCUS_REVIEW_NOT_PENDING'));
      }
      return service.settle(review.reviewId, 'progress', '稍后继续');
    },
    returnToWorkspace(refresh, closeWorkspaceTask) {
      const existing = workspaceRefreshRef.current;
      if (existing !== null) {
        return existing;
      }
      const receipt = activeRef.current;
      if (receipt?.kind !== 'receipt') {
        return Promise.reject(new Error('POST_FOCUS_REVIEW_RECEIPT_REQUIRED'));
      }
      if (mountedRef.current) {
        setSnapshot(current => ({
          ...current,
          workspaceRefreshPending: true,
          workspaceRefreshFailed: false,
          receiptAcknowledgementFailed: false,
          errorText: null,
        }));
      }
      let pending: Promise<void>;
      pending = (async () => {
        try {
          await refresh();
        } catch {
          if (mountedRef.current) {
            setSnapshot(current => ({
              ...current,
              workspaceRefreshFailed: true,
            }));
          }
          return;
        }
        try {
          await service.acknowledgeReceipt(receipt.receiptId);
        } catch {
          if (mountedRef.current) {
            setSnapshot(current => ({
              ...current,
              receiptAcknowledgementFailed: true,
            }));
          }
          return;
        }
        if (mountedRef.current) {
          dismissedReceiptIdRef.current = receipt.receiptId;
          closeWorkspaceTask();
          setSnapshot(current => ({...current}));
        }
      })()
        .finally(() => {
          if (workspaceRefreshRef.current === pending) {
            workspaceRefreshRef.current = null;
          }
          if (mountedRef.current) {
            setSnapshot(current => ({
              ...current,
              workspaceRefreshPending: false,
            }));
          }
        });
      workspaceRefreshRef.current = pending;
      return pending;
    },
  }), [service, snapshot, visibleReceipt, visibleReview]);

  return (
    <PostFocusReviewRuntimeContext.Provider value={runtime}>
      {children}
    </PostFocusReviewRuntimeContext.Provider>
  );
}

export function usePostFocusReviewRuntime(): PostFocusReviewRuntime | null {
  return useContext(PostFocusReviewRuntimeContext);
}
