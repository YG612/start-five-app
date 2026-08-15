# Start Five review-3 candidate regression contract

Status: **CANDIDATE, pending independent test review.** After `REVIEW3_LOCK.sha256` is accepted, this document and every file under `tests/review3/` are immutable. This contract supplements all three existing locked contracts; it never replaces or weakens them.

## R3-A — Start single-flight is independent from observer and lifecycle-source identity

`CoreFlowScreen` owns at most one unresolved `startRecommended` mutation. A render-only change to a diagnostic observer or AppState source must not create a second launch generation, clear the disabled/starting state, mint another operation ID, or invoke `service.startRecommended` again.

- Replacing only `onUiCommit` while the first request is unresolved preserves single-flight. The button remains disabled, a second press performs no mutation, and the original success commits and starts the timer exactly once.
- Replacing only `appStateSource` under the same service and timer preserves the same guarantees. This infrastructure replacement does not invalidate the business continuation; the original success safely commits and starts the shared controller once.
- Replacing only `timerController` still invalidates the old timer continuation as required by review-2, but it must not permit a second mutation before the old request settles. After settlement and cleanup, a fresh launch may retry against the replacement controller.
- Single-flight identity belongs to the accepted business launch, not a render dependency object. Each accepted retry receives one operation ID; blocked duplicate presses receive none.

The diagnostic hook is failure-isolated. `CoreFlowScreenProps` adds the optional reporter below:

```ts
onUiCommitError?: (
  error: unknown,
  kind: CoreFlowUiCommitKind,
) => void;
```

Every `onUiCommit(kind)` call is guarded independently. If it throws, the error is reported once through `onUiCommitError(error, kind)` and the product continuation proceeds exactly as if the diagnostic observer had returned normally. A throwing reporter must not be required for normal operation; the review suite supplies a non-throwing reporter.

- A `starting` observer failure cannot prevent `service.startRecommended` from being invoked.
- If that first service call rejects, single-flight is cleared and a second press can succeed. Only the successful call starts the timer.
- An `activeTask` or `selectedStep` observer failure cannot divert a successful result into the business error path, suppress the task/step state, or prevent the timer start.
- Observer failures are diagnostic failures, not user-visible service failures and not uncaught/unhandled errors.

## R3-B — Default countdown refresh aligns to visible second boundaries

`createDefaultCoreFlowTimerController` schedules one refresh for the next transition in `ceil(remainingMs / 1000)`, using the authoritative injected `now` source each time it runs. It must not blindly wait 1000 ms after start, resume, or a late callback.

- Starting at `3750 ms` schedules the next visible transition after `750 ms`: no notification at `749 ms`, then a running snapshot with `remainingMs: 3000` at the next millisecond.
- Resuming with `3750 ms` remaining follows the same `750 ms` boundary.
- If the first callback runs late and authoritative remaining time is `2700 ms`, it publishes `2700` and recalibrates the next refresh to `700 ms`; after `699 ms` there is no new publication, and after one more millisecond it publishes `2000`.
- At most one controller refresh is pending alongside the underlying finish timer. Pause clears both timer sources, resume recreates only the required pair, and natural finish or `dispose()` leaves no scheduled work and no later notification.

All cadence tests use modern Jest fake timers and an explicit clock. They perform no real wait and do not use a global timer-clear operation as cleanup.

## Coverage map

| Finding | Candidate suite |
|---|---|
| R3-A observer/AppState/timer rerender single-flight and audit-failure isolation | `tests/review3/startSingleFlight.regression.test.tsx` |
| R3-B non-integral boundary alignment, delayed-callback recalibration, cleanup | `tests/review3/timerBoundaryAlignment.regression.test.ts` |

## Candidate lock and acceptance

1. `REVIEW3_LOCK.sha256` is generated last from this specification and every regular file below `tests/review3/`, sorted by POSIX-style relative path.
2. The original, review-1, and review-2 manifests must verify before and after generation.
3. All React Native Testing Library 14 `render`, `rerender`, `fireEvent`, and `unmount` calls are awaited; every launched promise is settled or has an attached rejection path.
4. Review-3 contains no skipped/focused/pending tests, explicit `any`, TypeScript suppression, fixture-dependent timeout, or real-time wait.
5. Before production repair, existing 127 tests and `tsc --noEmit` remain green while review-3 fails only on the missing R3 behavior. A fresh independent test reviewer must approve this candidate before repair dispatch.
