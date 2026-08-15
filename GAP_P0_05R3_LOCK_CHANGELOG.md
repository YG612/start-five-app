# GAP-P0-05R3 candidate lock changelog

## Status

**PENDING ONE INDEPENDENT REVIEW / NO PRODUCTION AUTHORITY.**

Candidate manifest self:
`4827837e39c8b3393ed21962f246345df315d60f2a64bc4744a16f568bff81a1`.

This changelog is excluded from the exact three-entry candidate manifest.

## Frozen predecessor

R2 candidate self
`235a5782e22d0f81cc754c89d833f8dae8fa0aecbc5e92fb164a2ad2cb244e84`
passed independent test review and remains frozen. R3 is additive production
code-review coverage; it does not modify or supersede R2 test authority.

## Exact R3 scope

- test 1 gates an expired restore's real focus write, issues a newer start from
  the same AppRoot public UI, releases the old write, and verifies final
  linearization through two byte-only restarts;
- test 2 locks task-completion UI absence during restore pending and error,
  then confirms that retry after a durable no-active transition enables public
  completion;
- test 3 captures public interrupt before deadline finish, gates the finish
  write, fires the old action, and locks shared lifecycle ownership plus
  returned-status UI semantics; and
- the R3 testkit is only a mechanical alias of frozen R2 backend/clock fixtures.

Frozen R2-C remains authoritative for the running-state stale completion action
and handler guard. Final production review must verify the pending/error UI gate
and R2-C handler gate share one task-completion-blocked predicate/ref.

## Controlled fixture history

No earlier R3 candidate was signed. The first draft run exposed early sampling
before a focus get gate entered. One authorized barrier correction then proved
that public RNTL screen access is unavailable inside the asynchronous render
effect call stack and timed out; that run also was not candidate evidence. The
controlled consistency correction removed the impossible duplicate stale-node
oracle, removed its hook/barrier, retained exactly three tests, and relied on
frozen R2-C for that handler behavior.

## Final current-production evidence

The isolated corrected R3 root completed normally in 5.894 seconds:

- **1 suite failed / 3 tests failed / 0 passed / 0 snapshots**;
- the older restore overwrote and removed the newly started running session
  from durable bytes while UI still showed running;
- `完成任务` was visible in both restore-pending and restore-error phases; and
- deadline finish durably completed exactly once, but interrupt remained
  available during the write and its late result changed UI to idle.

Main `tsc --noEmit` exited 0. No R2, R1, Phase4, old regression, broad suite,
GAP-P0-02B bulk, formal quality gate, or registry command was run.

## Mechanical result

The candidate has exactly three regular LF-only, BOM-free files and exactly
three `it(...)` tests. Test TypeScript contains no sleep, fake/global timer,
process rejection listener, network call, or focused/skipped test. All gates
are released and all AppRoots unmounted in `finally`.
