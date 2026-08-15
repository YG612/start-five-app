# GAP-P0-08R1 candidate changelog

## Authority

- Status: `PENDING ONE INDEPENDENT REVIEW / NO PRODUCTION AUTHORITY`.
- Superseded GAP-P0-08 candidate self
  `66163dec3fb38f5bf389d52dfbdb1dac76a47dce5585bf4c9aec84df31d6d352`:
  `REVIEW FAILED BEFORE ACCEPTANCE / NEVER ACCEPTED`.
- Independent review P1: Test 3's three off-screen history-title assertions did
  not prove that running, pending, and unacknowledged receipts were absent from
  durable history.
- This changelog and the candidate manifest are excluded from the three-entry
  manifest.

## Controlled correction

- Added the test-local structured snapshot type and public future capability
  adapter `composition.reviewHistory.listReceiptHistory()`.
- The adapter throws `HISTORY_QUERY_UNAVAILABLE` if production has not exposed
  that public composition surface.
- Test 3 now queries zero receipts at running, pending-review, and
  unacknowledged phases; it queries one receipt with the frozen task title after
  acknowledgement and again after byte restart.
- The final visible history oracle remains exactly one matching row.
- Tests 1 and 2 were not edited. No repository, private context, storage key,
  envelope, sleep, fake timer, or raw write count was introduced.

## Focused validation

- TypeScript `--noEmit`: exit `0`, no diagnostics.
- Only Test 3 effectively ran: `1 failed / 2 skipped`, legal product red
  `HISTORY_QUERY_UNAVAILABLE` at the first running-state structured query.
- Two earlier Jest invocations selected zero tests because their path arguments
  did not match the configured root; no test body ran in either invocation.
- No other test, regression suite, quality gate, registry, network check, native
  build, package, production implementation, or old asset was run or changed.

One fresh independent reviewer must accept the exact candidate before production
work is authorized.
