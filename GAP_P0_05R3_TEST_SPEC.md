# GAP-P0-05R3 shared focus-lifecycle concurrency contract

## Status and authority

Status: **PENDING ONE INDEPENDENT REVIEW / NO PRODUCTION AUTHORITY.**

The frozen R2 test candidate self
`235a5782e22d0f81cc754c89d833f8dae8fa0aecbc5e92fb164a2ad2cb244e84`
passed independent test review. Its subsequent production-code review found
three additive P1 concurrency gaps. R3 tests only those findings. R2, R1,
GAP-P0-05, GAP-P0-02B, Phase4, every old test, and all production files remain
frozen and byte-for-byte untouched.

R3 contains exactly three `it(...)` tests. It grants no production authority
until one new independent reviewer accepts the exact candidate self.

## Public deterministic boundary

Every scenario renders the real `createStartFiveApp(...).AppRoot`, uses public
accessible React Native actions, and stores through one real in-memory backend.
The cross-wrapper scenario is created by the production composition itself:
restore uses its public backend-forwarding service while start uses the main
focus service over the original backend. The test adds no production wrapper,
private import, or test-only production grammar.

Backend get/set gates stop exactly one real storage operation at its persistence
boundary. Gates expose only entry counts and explicit release promises. The R2
structural `focusRuntimeClock` drives deadline notification synchronously. No
sleep, fake/global timer, wall-clock wait, process rejection listener, network,
or native module is permitted.

## Test 1 — stale restore write cannot overwrite newer durable start

An authoritative in-progress task and an expired durable running focus are
seeded on the shared backend. AppRoot A, using backend view A, begins restore;
its reconcile transaction reaches the real focus-storage `setItem` boundary
and remains gated with captured old completion bytes.

While A's old write remains gated, the user uses **`推荐下一项`** and
**`开始5分钟`** on that same AppRoot, invoking the newer start through the main
focus service. The action is issued and microtasks are drained, but the test
does not require start to finish before the old gate is released: both a shared
serial coordinator and a genuine conditional commit are valid repairs.

After releasing A's write, both operations must linearize without overwrite or
stale append. The UI must finish the requested start. A byte-only backend
restart must contain exactly the old completed session and the one new running
session, with one ID and the new deadline; no duplicate or stale running
history is allowed. This locks the final result across the real restore wrapper
and main service without prescribing their valid serialization strategy.

## Test 2 — completion is forbidden through pending and failed restore

An authoritative in-progress task whose only small step is complete and its
durable running focus are seeded. Restore is gated on a corrupt read, creating
two observable phases on one AppRoot:

1. while restore is pending, **`完成任务`** must not be rendered; and
2. after the corrupt result settles into actionable restore error UI,
   **`完成任务`** must still not be rendered.

While error UI remains mounted, a public focus service durably interrupts the
seeded running record. The same mount then uses **`重试恢复专注`**; only after
that retry successfully confirms there is no active focus may the completion
control appear. Its public press completes the task, while focus history
remains exactly one interrupted record.

The frozen R2-C contract already covers a public completion action captured
before focus becomes running and fired after running, including the handler's
execution-time guard. R3 does not duplicate that oracle. Final production-code
review must confirm that pending/error UI visibility and the R2-C handler guard
derive from the same task-completion-blocked predicate/ref, so UI and execution
cannot drift.

## Test 3 — deadline finish owns lifecycle over a captured interrupt

One AppRoot restores a running session before its deadline. The test saves the
public **`中断专注`** node, arms the next real focus-storage write gate, advances
the structural clock to the exact deadline, and confirms deadline `finish`
entered that persistence boundary.

While finish remains pending, firing the saved interrupt node must be rejected
by the same per-session lifecycle guard; it may not enqueue or commit an
interrupt transition. After the finish write is released, durable history and
UI must contain exactly one `completed` session and no interrupted or duplicate
record. Repeated clock publication must not add another write.

The runtime may commit a terminal snapshot only after inspecting the actual
status returned by the winning service call. A late interrupt call that merely
receives the already-completed session must never publish idle/interrupted UI.

## Verification and inventory

Only the permitted commands were run for the final corrected bytes:

- R3 Jest root: **1 suite failed / 3 tests failed / 0 passed / 0 snapshots**
  in 5.894 seconds, with deterministic cleanup and no open-handle report; and
- main `tsc --noEmit`: **exit 0**.

The three current-production reds match the three P1 findings exactly:

1. the old restore write overwrites the newer public start: UI reports running
   and consumes the new ID, but two byte-only restarts contain only the old
   completed session and have lost the new running session;
2. `完成任务` remains rendered in both restore-pending and restore-error phases,
   while the no-active retry, enabled completion, interrupted focus history,
   and final task completion controls all match; and
3. interrupt remains rendered while deadline finish is gated; release durably
   stores exactly one completed session, but the late interrupt result changes
   UI to idle instead of preserving finished state. Exactly-once write/history
   controls match across repeated clock publication.

No R2, R1, Phase4, old regression, broad suite, GAP-P0-02B bulk, formal gate,
or registry command was run. The candidate inventory contains exactly these
three regular files:

1. `GAP_P0_05R3_TEST_SPEC.md`;
2. `tests/gap-p0-05r3/appRootFocusLifecycleConcurrency.contract.test.tsx`;
   and
3. `tests/gap-p0-05r3/gapP005R3TestKit.ts`.

Exact hashes are authoritative in `GAP_P0_05R3_LOCK.sha256.candidate`. Status
remains **PENDING ONE INDEPENDENT REVIEW / NO PRODUCTION AUTHORITY**.
