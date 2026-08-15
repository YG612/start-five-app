# GAP-P0-05R1 controlled fixture-consistency correction

## Status and authority

Status: **PENDING ONE DELTA REVIEW / NO NEW PRODUCTION AUTHORITY.**

GAP-P0-05R1 is a controlled test-fixture consistency correction. The original
GAP-P0-05 candidate self
`66664505662a3ab2cd3ff4e6073214408b68ebc8377f0dfe6443de0ab4d76609`
passed its independent test review, but is now **CONTROLLED SUPERSEDED FOR
FIXTURE CONSISTENCY / NEVER USED FOR PRODUCTION**. This wording does not revoke
or characterize the quality of that review; it records only that production
repair never began from the superseded fixture bytes.

The original GAP-P0-05 specification and two TypeScript files remain frozen and
byte-for-byte unchanged. R1 contains this specification and exactly two regular
TypeScript files below `tests/gap-p0-05r1/`. Its candidate manifest is not an
accepted lock. One independent delta review must accept the exact R1 candidate
self before any production work may use it.

## Consistency issue

The original restart and expiry fixtures seeded a running focus session beside
a pending task. That state is valid to the lower-level GAP-P0-02B focus service,
which treats task IDs as opaque associations, but it contradicts this
integration slice's task-first ordering: a real AppRoot must persist the task as
`in_progress` before it may persist or display a running focus session.

It also conflicts with the Phase4 AppRoot authority: initial hydration reads
the durable task state, while focus restoration is the new behavior under test.
An internally inconsistent pending-task/running-focus seed could permit a
repair to be rejected for preserving the authoritative task state rather than
for failing focus restoration.

## Exact permitted delta

The original six-test contract and testkit are mechanically copied into the R1
directory. Test count, names, assertions, failure branches, public-key gates,
clocks, IDs, UI oracles, byte-restart oracle, and testkit behavior remain exact.

Only two task seeds change:

1. restart recovery seeds
   `makeAppTask({status: 'in_progress', startedAt: P0_05_STARTED_AT})`; and
2. exactly-once expiry seeds the same in-progress task.

The interruption fixture already used that consistent task state. Construction,
new start, interruption/reopen, and the two-branch task/focus failure test are
unchanged. Directory-local imports may change mechanically only as required by
the R1 path. No new production API or behavior is specified.

## Preserved six-test matrix

1. composition and root-element construction perform zero I/O;
2. one task-bound five-minute focus record persists before running UI;
3. byte-only restart restores the same focus session and remaining time;
4. deadline hydration completes the session exactly once;
5. interruption persists and permits one later session; and
6. fresh task-write and focus-write failure branches enforce task-first,
   focus-persist, UI-running order and retryability.

No sleep, fake timer, wall-clock delay, private snapshot grammar, network, or
native module is permitted. Phase4 remains authoritative for task hydration;
GAP-P0-02B remains authoritative for focus storage/service internals.

## Verification and inventory

Only the permitted R1 checks were run:

- R1 Jest root: **1 suite passed / 6 tests passed / 0 failed / 0 snapshots** in
  14.219 seconds, with no open-handle error;
- main `tsc --noEmit`: **exit 0**; and
- mechanical comparison: the R1 testkit is byte-identical to the frozen
  GAP-P0-05 testkit, while the contract differs only at the two task seeds
  enumerated above.

No old compatibility, GAP-P0-02B bulk, broad, formal quality-gate, or registry
command was run. The original three frozen hashes and manifest self remain
unchanged.

The candidate inventory contains exactly these three regular files:

1. `GAP_P0_05R1_TEST_SPEC.md`;
2. `tests/gap-p0-05r1/appRootFocusSession.contract.test.tsx`; and
3. `tests/gap-p0-05r1/gapP005TestKit.ts`.

Their exact hashes are authoritative in `GAP_P0_05R1_LOCK.sha256.candidate`.
That manifest remains a candidate until one independent delta reviewer accepts
its exact self. Status remains **PENDING ONE DELTA REVIEW / NO NEW PRODUCTION
AUTHORITY**.
