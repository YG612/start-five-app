# Start Five review-4 repeat-session regression contract

Status: **CANDIDATE, pending independent test review.** After `REVIEW4_LOCK.sha256` is accepted, this document and every regular file under `tests/review4/` are immutable. This contract supplements the original and review-1/2/3 locks; it never replaces or weakens them.

## R4-A — A pending step can receive another focus session without remounting

A natural five-minute expiry ends only the current focus session. It does not complete the selected step or its task. While the mounted screen still has a non-terminal task and a pending selectable step, the user is offered an accessible, enabled `开始5分钟` action for a new session.

- The first default-controller round visibly reaches `已结束` and `00:00`, leaves the pending-step completion action intact, and leaves no scheduled finish/refresh work.
- Starting the second round immediately shows `进行中` and the full `05:00`; it must not inherit `00:00`, a partial remainder, `finished`, or paused state from round one.
- The real default screen path pauses round two at an authoritative `3750 ms` remainder (`00:04`), publishes `paused`, and leaves no active timer work. A long fake-clock advance preserves both the paused state and visible remainder. Resume publishes `running`; there is no visible transition for `749 ms`, then the following millisecond shows `3000 ms` (`00:03`), preserving the review-2/review-3 boundary contract. The round then finishes naturally and unmount leaves zero work.
- A screen-level multi-session test adapter records controller publications and state transitions across two natural rounds. It observes exactly two adjacent `running -> finished` transitions, not two sampled terminal booleans. Neither expiry invokes `finishStep` or `finishTask`; long clock advancement after the second expiry adds no publication or transition and leaves zero scheduled finish/refresh work.
- Unmounting during round two disposes all timer work. Advancing a deterministic fake clock afterwards cannot recreate scheduled work.

The tests assert these screen-level outcomes and do **not** call, require, or name a reset method. The stable test-facing adapter provisions a fresh public default-controller generation internally for each accepted session solely to make publications observable; it does not require production to use that implementation family. Production may safely re-arm a controller, replace an internal timer/controller generation, or use an equivalent bounded design.

## R4-B — Every accepted repeat start remains single-flight and generation-safe

The second session is a fresh accepted launch. One accepted press invokes `service.startRecommended` once with one new operation ID. Rapid duplicate presses, a diagnostic observer replacement, an AppState-source replacement, and a timer snapshot publication while that second request is unresolved cannot mint another operation ID, invoke another business start, clear the disabled state, or start the timer twice.

`timer rerender` in this contract means a subscriber publication from the current controller; replacing the `timerController` dependency retains the review-2/review-3 invalidation semantics and is not redefined here.

- A callback captured from a disposed round-one controller cannot replace the visible running/full snapshot of round two after a replacement controller becomes current.
- A start result from an invalidated service/controller generation cannot commit its task or start an obsolete controller. After it settles, a fresh replacement-generation start still succeeds.
- These checks preserve the existing mounted/service/controller generation guards; they do not prescribe AbortController, token, counter, or callback implementation details.

## R4-C — Terminal task/step rules take precedence over repeat focus

Repeat focus is available only when work remains selectable.

- If manual step completion leaves no pending step, natural timer expiry cannot expose an enabled repeat action for the completed step.
- After manual task completion reaches the terminal `completed` state, repeat focus is absent even if an old timer completion arrives later.
- This contract does not forbid another pending step or another non-terminal recommended task from receiving a later focus session.

## R4-D — Timer lifecycle remains implementation-independent

The public timer factory can supply consecutive session generations. Two separately created controllers each naturally finish once, publish `finished` once, and leave no scheduled work. A fresh second controller retains the controlled `3750 → 3000` boundary behavior. Separately, the screen-level adapter preserves one public `CoreFlowTimerController` surface while provisioning fresh internal generations; its transition log is test-owned instrumentation, not a new production API.

This is deliberately compatible with both implementation families: reusing a safely re-armed controller or replacing it with a fresh controller. It does not require one `FiveMinuteTimer` instance to restart after `finished`, does not add a factory prop to `CoreFlowScreen`, and does not bind production to a method named `reset`.

## Pre-repair baseline (recorded before lock generation)

Command: `jest --runInBand --ci --coverage=false --roots tests/review4`

- **2 suites / 10 tests: 4 failed, 6 passed.** The command terminates normally with the expected non-zero assertion result; there is no timeout, open-handle symptom, React `act` warning, unhandled rejection, or test-infrastructure failure.
- The four failures are exactly the four R4-A entry-path tests: the observable two-session transition path; the real-default second-round start/pause/resume/boundary/finish path; second-round rapid-press/render single-flight; and unmount cleanup while round two is live.
- All four fail at the same missing product capability: the first `finished` snapshot leaves `开始5分钟` disabled, `startRecommendation` accepts only `idle`, and therefore the second default/mounted session cannot be entered. The failures do not depend on a reset method.
- The six passing tests cover stale round-one timer callbacks, stale old-service results, completed-step and completed-task guards, and two replacement-controller lifecycle/boundary checks. This demonstrates that the candidate does not turn existing generation or terminal behavior into artificial red tests.
- `tsc --noEmit` passes with the candidate present.

## Coverage map

| Finding | Candidate suite |
|---|---|
| R4-A two-round usability, exact screen-level transition observation, real-default pause/resume boundary, completion and unmount cleanup | `tests/review4/repeatSession.screen.regression.test.tsx` |
| R4-B second-round single-flight and stale service/timer generation isolation | `tests/review4/repeatSession.screen.regression.test.tsx` |
| R4-C completed step/task repeat guard | `tests/review4/repeatSession.screen.regression.test.tsx` |
| R4-D replacement-safe per-session finish publication/boundary/cleanup | `tests/review4/repeatSession.timerLifecycle.regression.test.ts` |
| Test-only deterministic controllers, multi-session publication adapter, and domain/service builders | `tests/review4/fixtures/repeatSessionFixtures.ts` |

## Candidate lock and acceptance

1. `REVIEW4_LOCK.sha256` is generated last from this specification and every regular file below `tests/review4/`, sorted by POSIX-style relative path.
2. The original and review-1/2/3 manifests verify before and after generation; their 16 suites / 138 tests and `tsc --noEmit` remain green.
3. Review-4 uses modern fake timers, explicit clocks, and finite promise flushing. It performs no real-time wait and does not raise a global timeout.
4. Every React Native Testing Library 14 `render`, `rerender`, `fireEvent`, `act`, and `unmount` operation is awaited where applicable. Every launched deferred is settled before cleanup.
5. Review-4 contains no skipped/focused/pending tests, explicit `any`, TypeScript suppression, snapshot-only assertion, production edit, or dependency/config edit.
6. The exact pre-repair red/green distribution above is recorded after executing the candidate against the current production implementation and before generating the manifest.
