# Start Five review-2 locked regression contract

Status: **LOCKED after `REVIEW2_LOCK.sha256` is generated.** Production and repair agents must not edit this file or anything under `tests/review2/`. The review-2 manifest covers this document and every file below `tests/review2/`, sorted by POSIX-style relative path.

This contract supplements, and never replaces, `TEST_SPEC.md`/`tests/locked/**` or `REVIEW1_TEST_SPEC.md`/`tests/review1/**`. Acceptance requires all three locked suites to pass unchanged.

## R2-A — A running default timer continuously publishes visible time

The production implementation returned by `createDefaultCoreFlowTimerController` must keep subscribers current while its `FiveMinuteTimer` is running. Publication is driven by scheduled work and the authoritative injected clock; a consumer must not need to poll `getSnapshot()` or send an AppState event.

- After starting an exact `5_000 ms` session, advancing the fake clock by one second publishes a `running` snapshot with `remainingMs: 4_000`; advancing one more second publishes `3_000`.
- Publication follows display-second boundaries closely enough that the default five-minute `CoreFlowScreen` changes from `剩余时间：05:00` to `剩余时间：04:59` after one fake-clock second. Tests exercise this product path without a `timerController` prop; an injected timer fixture alone is not sufficient.
- Pausing publishes the clock-calibrated paused snapshot and cancels periodic refresh work. Advancing time while paused neither changes the remainder nor notifies subscribers. Resuming immediately publishes a calibrated running snapshot and restarts publication on the next visible-second boundary: from `remainingMs: 3_750`, advancing `749 ms` emits nothing and the following `1 ms` publishes `remainingMs: 3_000`.
- Natural completion publishes the finished state once. Completion and `dispose()` cancel all refresh work; advancing fake time afterwards cannot notify again or recreate a scheduled timer.
- The implementation technique is not fixed: aligned one-shot scheduling, an interval, or an equivalent bounded mechanism is acceptable. Duplicate identical snapshots need not be emitted.

The raw per-second publication contract and the pause/resume contract are exercised by independent tests. A missing first running tick therefore cannot prevent the pause, frozen-clock, resume, and resumed-tick path from executing. All cadence regressions use modern Jest fake timers with the configured real `nextTick` and `queueMicrotask`; they contain no real-time waits.

## R2-B — Deferred start results are lifecycle- and generation-safe

`CoreFlowScreen` owns each asynchronous `startRecommended` continuation only while the screen is mounted and the `service`/resolved timer-controller dependency generation that launched it is still current.

`CoreFlowScreenProps` adds this optional diagnostic/audit port:

```ts
onUiCommit?: (
  kind: 'activeTask' | 'selectedStep' | 'error' | 'starting',
) => void;
```

The port does not change business behavior and is scoped to the `startRecommended` UI orchestration under review. While the launching generation is still valid, it fires synchronously immediately before the corresponding commit: `starting` before the accepted start request is launched, `activeTask` before applying its successful task, `selectedStep` before applying that task's selected step, and `error` before exposing its rejection. Initial state hydration, recommendation selection, unrelated actions, and clearing an old error are outside this port. A normal mounted success must emit exactly `starting`, `activeTask`, `selectedStep` in that order; this prevents an implementation from ignoring the audit port and making unmount assertions vacuously pass.

- If the screen unmounts after `startRecommended` is called but before it settles, a later successful resolution cannot increase the audit-port call count recorded at unmount, start the disposed controller, invoke a React state commit, or create another mounted UI/timer side effect. The service promise itself settles normally, and the timer/AppState subscriptions remain cleaned up.
- The same unmount boundary applies to rejection: the launched promise settles through its attached rejection path without an unhandled rejection, audit-port increase, post-unmount state commit, timer action, or observable UI side effect. Tests never query an already-unmounted renderer.
- Service-generation isolation is tested twice while `timerController` and `appStateSource` retain the exact same references: an old success cannot replace the new service's visible task/recommendation/step or start the shared timer, and an old rejection cannot expose its error text or disturb the new service UI.
- Timer-generation isolation is tested while `service` and `appStateSource` retain the exact same references: an old success cannot start either controller, select the old continuation's step, or move the replacement timer UI away from idle.
- Invalidating an old generation must not break the replacement generation. A separate happy-path regression, which does not first execute a stale-result assertion, starts the replacement service/controller and observes its new task, current step, and running timer state. Unused old dependencies receive no calls.

These requirements do not cancel the underlying service operation, forbid ordinary promise/result inspection, or prescribe a specific cancellation primitive. They prohibit state-setter, timer-controller, and observable mounted-UI side effects after unmount or dependency-generation invalidation. A mounted/generation token, abort-aware orchestration, or an equivalent guard is acceptable.

## Review-2 coverage map

| Finding | Locked regression suite |
|---|---|
| R2-A default-controller cadence, product countdown, pause/resume, finish and disposal cleanup | `tests/review2/defaultTimerCadence.regression.test.tsx` |
| R2-B successful/rejected unmount and stale dependency-generation continuations | `tests/review2/startLifecycle.regression.test.tsx` |

## Lock and acceptance

1. `REVIEW2_LOCK.sha256` is generated last from `REVIEW2_TEST_SPEC.md` plus every file under `tests/review2`, sorted by stable POSIX-style relative path.
2. Any later review-2 hash mismatch is a process failure, even when tests pass.
3. Review-2 tests contain no `skip`, `only`, `todo`, `any`, or TypeScript suppression directives. Every React Native Testing Library 14 `render` and `fireEvent` call is awaited.
4. Original and review-1 manifests must verify before and after this suite is generated. All original tests, all review-1 tests, all review-2 regressions, and `tsc --noEmit` must pass before a fresh independent review.
