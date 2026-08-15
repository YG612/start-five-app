# GAP-P0-08 — Focus history tests-first contract

## Scope and invariants

This gap adds contract coverage only. The suite may drive `AppRoot`, visible UI,
and public service seed APIs; it must not inspect private persistence context,
storage keys/envelopes, timers, sleeps, or raw write counts.

- A focus session enters history only after its review receipt is acknowledged.
- `pending`, `settling`, `tracking`, and unacknowledged receipts are excluded.
- “Today” is selected by the receipt's frozen UTC `statsDay`.
- Rows sort by `settledAt` descending, then `receiptId` ascending.
- History queries are read-only: querying, opening details, navigating back, and
  byte-restarting must not change persisted bytes.
- History renders receipt-frozen fields rather than mutable task/session data.

## Contract cases (maximum three)

1. From Workspace, open 今日记录, verify its empty state, then return to the
   Workspace through visible navigation.
2. Seed two acknowledged receipts through public APIs. Verify reverse-time
   ordering (including the receipt-id tie-break), frozen row/detail fields,
   detail-to-list navigation with the active filter preserved, and a byte
   restart that reproduces the same UI while leaving persisted bytes identical.
3. Seed running/pending/unacknowledged work and verify it stays absent; after
   acknowledging the eligible receipt through the public workflow, verify
   exactly one visible history row.

## Red-run policy

Run only this new test root once, then TypeScript once. A missing public fixture
or production surface is an expected, actionable red and stops the run. Record
the legal red as a three-entry candidate/changelog: command, observed failure,
and the smallest production contract required. No production or pre-existing
test asset may be modified in this tests-first slice.

## Frozen predecessor selves

- GAP-P0-07: `a3ff5d286480d4903f616233fd34de88e107a159a7e113cb7045a77a9f31d2a2`
- R1: `7571d9810bae7df3d0fc1f08366695baf91dd8235e603ea04f5017adf0d63d22`
- R2: `a78b01e980c301c712bf6ec9553152b5c189e3c7eea45861a8c1e0f3b1d29c8e`

## Three-entry red candidate / changelog

1. Test command: pending authoring.
2. Observed failure: pending first isolated run.
3. Smallest required production contract: pending first isolated run.
