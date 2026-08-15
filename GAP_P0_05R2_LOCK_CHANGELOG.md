# GAP-P0-05R2 candidate lock changelog

## Status

**PENDING ONE INDEPENDENT REVIEW / NO PRODUCTION AUTHORITY.**

Candidate manifest self:
`235a5782e22d0f81cc754c89d833f8dae8fa0aecbc5e92fb164a2ad2cb244e84`.

This changelog is excluded from the three-entry candidate manifest.

## Rejected predecessor

The prior R2 candidate self
`561362761cc9323d3bc7c7115c9065d874f6454a42700aaa7478f162da0bd865`
is **REVIEW FAILED BEFORE ACCEPTANCE / NEVER ACCEPTED**. It granted no test or
production authority.

## Additive scope

- added exactly three real-AppRoot tests for restore rejection/corruption,
  deadline-finish persistence retry, and active-focus task-completion gating;
- added one thin R2 backend extension and an explicit manual runtime-clock
  controller;
- reused the frozen R1 testkit and production service/repository path rather
  than duplicating GAP-P0-02B internals; and
- changed no production, R1, GAP-P0-05, or old test asset.

The controlled review correction changes only A, C, their specification text,
and the R2 get fixture:

- A now holds an old valid `02:00` restore pending, starts one newer restore
  through the public pending-state retry, requires the healthy `03:00` result
  to commit first, then releases the old result and proves latest-wins. Its
  one-shot read and corrupt same-mount recovery branches remain.
- C now captures the real public `完成任务` React Native node before delayed
  restore enters running, triggers that saved user action through
  `fireEvent.press` after running, and requires an execution-time guard in
  addition to hidden UI.
- The R2 kit adds only an explicit one-shot deferred-get gate returning captured
  bytes. Test B is byte-for-byte unchanged.

The frozen R1 candidate manifest self remains
`8cea956ea6e5f1d3033eb06d596be8a8c0b8ec8a6c0428fa92000b5002ea0844`.

## Current-production red evidence

The first controlled correction run ended normally but exposed a C fixture
mistake: it tried to read `onPress` from the accessible host node. That run was
not used as candidate evidence and no candidate was signed from it. The sole
authorized mechanical correction retained the public node and later invoked it
through public `fireEvent.press`; no private prop or handler is read.

The authorized corrected R2 root completed normally in 6.493 seconds:

- **1 suite failed / 3 tests failed / 0 passed / 0 snapshots**;
- restore read rejection and corrupt focus bytes surfaced as unhandled product
  rejections, with no stable error/retry UI;
- pending restore exposed no retry, made only one focus read, and allowed the
  late old `02:00` result to win instead of a newer healthy `03:00` result;
- the runtime registered zero listeners on the deterministic deadline clock,
  so the failed-finish/retry transition could not occur; and
- the task-completion control remained visible while focus was running, and
  the public node captured before running still completed the task after focus
  became active.

Control observations remained valid: the old restore gate entered exactly
once without changing healthy persisted bytes, the pre-deadline focus record
remained running and unchanged, and the captured-action scenario reached
running then durably interrupted its focus history.

Main `tsc --noEmit` exited 0. No R1/old regression, broad suite, GAP-P0-02B
bulk, formal quality gate, or registry command was run.

## Mechanical result

The candidate contains exactly three regular LF-only, BOM-free files, exactly
three `it(...)` tests, and no sleep, fake timer, global rejection listener,
global timer patch, network call, or focused/skipped test. One new independent
reviewer must accept the exact self above before any production work begins.
