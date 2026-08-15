# GAP-P0-08R1 — Structured public history query correction

## Authority and predecessor

- This is a controlled correction of GAP-P0-08 candidate self
  `66163dec3fb38f5bf389d52dfbdb1dac76a47dce5585bf4c9aec84df31d6d352`.
- That predecessor is `REVIEW FAILED BEFORE ACCEPTANCE / NEVER ACCEPTED`.
- Tests 1 and 2 retain their existing bodies and product oracles.
- Production code and all accepted predecessor assets are out of scope.

## Corrected Test 3 contract

Test 3 uses only the future structured public composition capability
`composition.reviewHistory.listReceiptHistory()`. The test kit must throw
`HISTORY_QUERY_UNAVAILABLE` when the capability does not yet exist. It must not
import a repository, private context, persistence key, or envelope.

1. While focus is running, the public query returns zero receipts.
2. While review is pending, the public query returns zero receipts.
3. While a durable receipt remains unacknowledged, the public query returns zero
   receipts.
4. After acknowledgement and Return to Workspace, the query returns exactly one
   receipt whose frozen `taskTitle` matches the task.
5. A byte-only restart returns the same single receipt, and the final visible
   history UI contains exactly one matching row.

The three former `queryByText` assertions for an off-screen history title are
deleted because they did not prove persistence eligibility.

## Focused red evidence

1. Test command: Jest ran only Test 3 with `--runInBand --no-cache --ci
   --coverage=false --detectOpenHandles`, the repository Jest config, the
   GAP-P0-08 root, `--runTestsByPath`, and `--testNamePattern "excludes running"`.
2. Observed failure: `1 failed / 2 skipped`; the first running-state public
   query stopped at `HISTORY_QUERY_UNAVAILABLE` in `focusHistoryTestKit.ts`.
3. Smallest production contract: expose the read-only structured public
   `composition.reviewHistory.listReceiptHistory()` capability returning receipt
   snapshots; no repository/private persistence surface is authorized.

TypeScript `--noEmit` passed with exit `0`. No broad suite, quality gate,
registry, network check, native build, package, or production implementation was
run or changed.
