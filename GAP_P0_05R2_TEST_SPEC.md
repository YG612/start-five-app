# GAP-P0-05R2 additive AppRoot resilience contract

## Status and authority

Status: **PENDING ONE INDEPENDENT REVIEW / NO PRODUCTION AUTHORITY.**

GAP-P0-05R2 is an additive three-test slice for the three P1 findings from the
final production-code review. The accepted R1 test candidate self
`8cea956ea6e5f1d3033eb06d596be8a8c0b8ec8a6c0428fa92000b5002ea0844`
and every R1, GAP-P0-05, GAP-P0-02B, Phase4, and production file remain frozen.
R2 neither replaces nor edits those contracts.

The prior R2 candidate self
`561362761cc9323d3bc7c7115c9065d874f6454a42700aaa7478f162da0bd865`
is **REVIEW FAILED BEFORE ACCEPTANCE / NEVER ACCEPTED**. It grants no authority
and is superseded only by a newly reviewed exact candidate self.

The R2 candidate may authorize no production change until one new independent
test reviewer accepts its exact manifest self. A red run against the current
production is evidence of the known gaps, not authority to edit production.

## Scope and fixed public behavior

R2 contains exactly three `it(...)` tests and exercises the real
`createStartFiveApp(...).AppRoot`, public accessible UI controls, the shared
storage backend, and the already accepted focus-session service/repository
path. It does not duplicate GAP-P0-02B storage or service internals.

### A. Restore failure, recovery, and generation safety

One test first delays an old restore read while an authoritative in-progress
task is visible. While that read remains pending, the public UI must expose one
enabled **`重试恢复专注`** action. Pressing it starts a new restore generation;
the new generation reads the healthy running session and visibly commits
`03:00` before the old read is released. The old read then returns a different,
valid stale running session that would show `02:00`. Latest-wins is mandatory:
the late old result must not replace the healthy session, remaining time, error
state, or persisted bytes.

The same test then uses fresh AppRoot mounts for both failure forms:

1. a one-shot `FOCUS_SESSION_STORAGE_KEY` backend read rejection; and
2. a syntactically readable but corrupt focus snapshot.

Each failure must be observed without an unhandled rejection. The mounted UI
must settle on a stable, actionable restore error, remain non-running, and
expose the accessible **`重试恢复专注`** button. After the same backend is made
healthy, pressing that button on the same mount must restore the original
running session. A superseded restore generation may never overwrite the
successful retry, re-show the error, or commit another UI state after its late
settlement. The pending retry and late-release gates use explicit promise
barriers only.

### B. Deadline persistence failure and explicit retry

One test restores an in-progress task and its running focus session, advances a
manual runtime clock exactly to the deadline, and makes the next focus-storage
write fail once. The rejected `finish` must be fully observed: no unhandled
rejection, no `finished` UI, no completed focus bytes, and no permanently stuck
transition. The UI must show a stable persistence error and the accessible
**`重试结束专注`** button.

An explicit press retries the same session completion. It must result in
exactly one durable `completed` record, one successful completion write, no
duplicate focus ID, and finished UI. Further explicit clock notifications and
microtask drainage must not write or complete again.

### C. Task completion is forbidden while focus is active

One test hydrates an in-progress task whose only small step is complete while a
real focus restore is explicitly delayed. Before focus becomes running, it
captures the real public React Native **`完成任务`** node as a user action. It
then releases restore, waits for running UI, and triggers that saved action via
public `fireEvent.press`—without reading component props or a private handler.

The current UI must no longer render **`完成任务`** while focus is running, and
the previously captured action must be rejected by a second execution-time
guard. The task must remain `in_progress` and the running focus record must
remain present.

After the user presses **`中断专注`** and that interruption is durably stored,
the completion control may appear. Pressing it once must complete the task
without reviving, deleting, or orphaning the interrupted focus history. This
locks both the UI predicate and the ordering race: no task-terminal state may
be committed while an active focus exists.

## Deterministic harness boundary

The current private runtime owns `Date.now()` and `setInterval()` and exposes no
deterministic deadline seam through AppRoot. R2 therefore passes one structural
composition dependency named `focusRuntimeClock`:

```ts
type FocusRuntimeClock = Readonly<{
  nowMs(): number;
  subscribe(listener: () => void): () => void;
}>;
```

The test variable uses an intersection with the existing
`StartFiveAppDependencies`, so the frozen public TypeScript API need not change
for the tests to compile. A repair may consume this dependency only inside the
private focus provider/context composition. `CoreFlowScreenProps` and
`CoreAppService` remain exact. The manual clock publishes explicit synchronous
notifications; no sleep, fake timer, wall-clock wait, global timer patch, or
network is allowed.

The R2 backend is a thin additive subclass/wrapper over the R1 testkit backend.
It adds only one-shot get rejection, one deferred get returning captured bytes,
corrupt seeding, and trace needed by these three AppRoot scenarios. It does not
reimplement focus serialization, repository semantics, or service behavior.

## Rejection and teardown discipline

Tests must not install `process.on('unhandledRejection')`, replace `Promise`, or
use a global rejection listener to suppress product failures. Every UI action
is followed by an explicit UI/microtask settlement barrier, every controlled
gate is released in `finally`, and every render is unmounted in `finally`.
Consequently the current product may produce a legitimate red assertion or a
Jest-reported unhandled rejection, but the fixture itself must terminate
normally without a pending timer, sleep, or open handle. A green repair must
observe each rejection in product code and render the required retry state.

## Verification and inventory

Only the permitted commands were run:

- corrected R2 Jest root: **1 suite failed / 3 tests failed / 0 passed / 0
  snapshots** in 6.493 seconds. The process terminated normally and reported no open
  handle.
- Main `tsc --noEmit`: **exit 0**.

The red evidence is deterministic and matches the three P1 findings:

1. pending restore exposes no public retry, only one focus read begins, the old
   `02:00` session wins after late release, and the separate read/corrupt errors
   still escape as Jest-reported unhandled rejections without recovery UI;
2. the private runtime subscribes zero listeners to the explicit clock, so no
   deadline write, error state, or retry occurs; and
3. `完成任务` remains rendered while focus is running, and firing the public
   node captured before running commits the task as `completed` instead of the
   execution-time guard preserving `in_progress`.

The in-test controls also completed: A's deferred old read entered exactly once
and left authoritative focus bytes unchanged; B restored the pre-deadline
running record without changing its bytes; and C entered running after the
explicit restore gate, durably interrupted focus, and preserved its history.

No R1, old regression, GAP-P0-02B bulk, broad suite, formal quality gate, or
registry command was run. The candidate inventory contains exactly these three
regular files:

1. `GAP_P0_05R2_TEST_SPEC.md`;
2. `tests/gap-p0-05r2/appRootFocusResilience.contract.test.tsx`; and
3. `tests/gap-p0-05r2/gapP005R2TestKit.ts`.

Exact hashes are authoritative in `GAP_P0_05R2_LOCK.sha256.candidate`. Status
remains **PENDING ONE INDEPENDENT REVIEW / NO PRODUCTION AUTHORITY**.
