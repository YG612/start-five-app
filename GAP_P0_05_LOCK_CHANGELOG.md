# GAP-P0-05 candidate audit log

## 2026-08-09 - original candidate (review failed before acceptance)

- Added one specification and exactly two TypeScript files below
  `tests/gap-p0-05/`; no production or earlier test/lock file was modified.
- Locked six tests: composition construction purity, persist-before-running
  start, byte-only restart recovery, exactly-once expiry, interruption/reopen,
  and failed-start/retry.
- The fixture uses one injected backend, explicit ISO clock and ID counters,
  public GAP-P0-02B focus APIs, a public-key set gate, and one-shot public-key
  failure. It contains no sleep, fake timer, wall-clock delay, private storage
  grammar, network, or native-module dependency.
- Final isolated new-root evidence: 1 suite / 6 tests, 1 green construction
  control / 5 legitimate integration reds, exit 1, zero snapshots, normal
  completion in 10.969 seconds.
- Main `tsc --noEmit`: exit 0, zero diagnostics.
- Focused compatibility evidence: Phase4 `startFiveApp` 7/7 pass and locked
  `CoreFlowScreen` 2/2 pass, both zero snapshots.
- No GAP-P0-02B bulk, full suite, formal quality gate, registry, report, native,
  unrelated-workstream, or `outputs/qingji-ai` action was performed.
- Candidate manifest self:
  `428ba1ecf6bf19c895368367afb125588af92cfe114e92c5607b3bd7f0d04e22`.

Independent test review found one P1 coverage ambiguity: the single failure
case injected only the focus write, so it did not independently lock task-write
rollback or prove task-first ordering. This exact candidate is **REVIEW FAILED
BEFORE ACCEPTANCE / NEVER ACCEPTED** and grants no production authority.

## 2026-08-09 - corrected two-branch failure-order candidate

- Kept the suite at exactly six tests and changed only the sixth behavioral
  case. The other five oracles and the testkit are unchanged.
- The sixth case now executes two fresh-backend branches completely before one
  aggregate assertion. Task-write failure must preserve exact task bytes and
  pending status; retry must produce one task commit and consume one focus ID.
  Focus-write failure must observe the task already durably in progress while
  focus/UI remain non-running; retry must preserve the same task bytes/one task
  commit and persist one running focus session.
- Corrected final new-root evidence: 1 suite / 6 tests, 1 green control / 5
  legitimate integration reds, exit 1, zero snapshots, normal completion in
  33.656 seconds. The sixth failure diff contains observations from both fresh
  branches, proving neither branch was masked by the other.
- Corrected main `tsc --noEmit`: exit 0, zero diagnostics.
- Per instruction, no old compatibility suite was rerun for this correction;
  production and all old test bytes remained untouched.
- Corrected candidate manifest self:
  `66664505662a3ab2cd3ff4e6073214408b68ebc8377f0dfe6443de0ab4d76609`.

This changelog and the candidate manifest itself are audit artifacts excluded
from the three-entry candidate inventory. Corrected candidate status:
**PENDING ONE INDEPENDENT TEST REVIEW / NO PRODUCTION AUTHORITY**.
