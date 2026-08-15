# GAP-P0-02C — Focus session UI composition test specification

Status: **PENDING ONE INDEPENDENT TEST REVIEW / NO PRODUCTION AUTHORITY**

## Purpose and evidence boundary

This is a new, independent test-first slice for the missing UI integration identified by `GAP_P0_02B_TEST_SPEC.md` under “Timer ownership and CoreFlow boundary”: the accepted focus-session service/repository/storage exists, while `src/app/startFiveApp.tsx` composes only the task service and `CoreFlowScreen` starts only an in-memory five-minute timer.

The slice specifies only product composition and user-visible focus-session lifecycle behavior. It does not re-test P0-02B serialization, schema fields, repository ordering, transaction isolation, cloning, error catalogues, or dependency budgets. It does not touch P0-04. It preserves the P0-02A-locked exact `CoreFlowScreenProps`, `CoreAppService`, legacy timer-controller, and legacy runtime module surfaces. A private `AppRoot` provider/context is an allowed implementation seam; adding focus methods to those locked public types is not.

Candidate files are limited to:

- this specification;
- regular files recursively below `tests/gap-p0-02c/`;
- `GAP_P0_02C_LOCK.sha256.candidate`;
- `GAP_P0_02C_LOCK_CHANGELOG.md`.

Production source, configuration, dependencies, native projects, existing tests, and existing locks are excluded and remain implementation-team territory.

## Required deterministic seams

Tests inject a mutable ISO clock and an explicit inspectable timer controller. They do not sleep, enable Jest fake timers, advance global time, call a network, or leave a real timeout/interval/subscription running. The controller exposes state changes only when the test explicitly commands them.

The production composition may extend `StartFiveAppDependencies` and `StartFiveAppComposition` with focus-specific dependencies/results, but construction must remain silent: no task or focus backend read/write, no clock/ID consumption, no timer start/subscription, and no network activity before `AppRoot` is mounted or an explicit operation is invoked. The task repository/service must remain the same shared objects used by the root, as already required by Phase 4.

The focus session backend is independently injectable so failures and durable restart can be observed without probing P0-02B private storage format. Tests use only the accepted public focus service/repository/storage factories and public operations.

## Six user-behavior contracts

The candidate contains exactly six tests.

1. **Composition parity and silent construction.** `createStartFiveApp` still exposes and mounts the Phase 4 task repository/service/root, also composes the accepted focus stack for that same root, preserves exact P0-02A legacy surfaces, and performs no constructor I/O or scheduling.
2. **Persist-before-running start.** With one selected durable task, one press of “开始5分钟” requests exactly one task-bound five-minute session. The UI must not show `running` and the timer must not start while the focus persistence promise is pending. Only after durable success may that exact session become visible as running and the explicit controller start once. Repeated press while pending/running must not create a second session.
3. **Restart before deadline.** A new composition/root over the same durable focus backend restores the same running session ID. Remaining time derives from the persisted deadline and injected current time, so it is strictly below five minutes and is not reset to `300000` ms. No replacement session is created.
4. **Deadline completes once.** When the explicit controller reports the deadline/finished transition, the bound session is completed durably exactly once. Duplicate finished notifications, rerenders, and unmount cleanup cannot issue another completion or create another session.
5. **Interrupt and reopen.** A user interruption is persisted for the bound running session before the UI returns to an actionable idle state. A later press can open one new five-minute session for the same task; the old session remains interrupted and is never resumed or overwritten.
6. **Start-chain failure safety and deterministic recovery.** For every observable failure point in the start chain (focus persistence rejection and controller-start rejection/throw), the UI never presents a false running session. The contract chooses deterministic compensation: a persisted running session whose controller cannot start is interrupted through the focus service before the action becomes retryable; if that compensation fails, the UI remains non-running and retry-disabled with a stable error until remount/restore reconciles durable truth. A pure persistence failure requires no compensation and is immediately retryable. A successful retry creates or reuses only the one durable task-bound session allowed by service semantics.

## Observable assertions and non-claims

Assertions are user/port observations: rendered status/session identity/remaining time/action availability, public service spies, backend call gates, and explicit controller calls/snapshots. Tests must not decode focus storage bytes or assert the P0-02B storage key/envelope, exact repository call counts, object detachment, ordering, transaction staging, or error-message wording.

The screen may use private root context, a private wrapper, or private hooks. The tests do not authorize changes to `CoreFlowScreenProps`, `CoreAppService`, `CoreFlowTimerController`, their runtime export namespaces, or the meaning of the existing legacy controller. They also do not specify background/pause behavior, diagnosis/P0-04 behavior, analytics, notifications, network sync, or native lifecycle work.

## Test layout and counts

| File | Contract | Tests |
| --- | --- | ---: |
| `tests/gap-p0-02c/focusSessionUi.integration.test.tsx` | contracts 2–6 | 5 |
| `tests/gap-p0-02c/startFiveFocusComposition.contract.test.tsx` | contract 1 and legacy compatibility controls | 1 |

Total: **2 suites / 6 tests**. No skipped, todo, focused, snapshot-only, sleeping, fake-timer, network, filesystem-write, or production-source mutation test is permitted.

## Red/green rule and scoped commands

The test author records the new root as RED against the current production boundary. RED is expected because the screen integration does not exist; an assertion failure is acceptable, while TypeScript/Jest parse/configuration failures are not. GREEN may only be claimed after a separately authorized production implementation satisfies all six tests.

Run from `outputs/start-five`:

```powershell
pnpm exec jest --runInBand --ci --coverage=false tests/gap-p0-02c
pnpm exec tsc --noEmit
pnpm exec jest --runInBand --ci --coverage=false tests/phase4/startFiveApp.contract.test.tsx
pnpm exec jest --runInBand --ci --coverage=false tests/locked/application/CoreFlowScreen.test.tsx tests/review1/CoreFlowTimer.integration.test.tsx
```

Do not run P0-02B’s 252-test root, the full suite, `pnpm test`, or either quality gate for this authoring slice.

## Candidate lock and review gate

`GAP_P0_02C_LOCK.sha256.candidate` lists SHA-256 digests for only the spec, the two new test files, and the excluded-change changelog. It is a review candidate, not an accepted lock. The changelog must record the exact included/excluded paths, test count, scoped command outcomes, RED reason, and production boundary.

One independent test reviewer must confirm that the six tests are deterministic, behavior-level, non-duplicative of P0-02B, preserve P0-02A surfaces, select an unambiguous compensation policy, and do not grant production authority. Until then the status remains **PENDING ONE INDEPENDENT TEST REVIEW / NO PRODUCTION AUTHORITY**.
