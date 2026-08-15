# GAP-P0-07R1 candidate changelog

## Authority

- Status: `PENDING INDEPENDENT REVIEW / NO PRODUCTION AUTHORITY`.
- Pinned GAP-P0-07 self: `a3ff5d286480d4903f616233fd34de88e107a159a7e113cb7045a77a9f31d2a2`.
- Candidate self: `7571d9810bae7df3d0fc1f08366695baf91dd8235e603ea04f5017adf0d63d22`.
- Superseded candidate self `8459ba4de7494b19fc615efab204579d62abf961f0e7af9f0b34bc8855bb04c7`: `REVIEW FAILED BEFORE ACCEPTANCE / NEVER ACCEPTED`; it overconstrained a failed acknowledgement by requiring complete cross-repository backend byte equality.
- This changelog is intentionally excluded from the two-entry candidate manifest.

## Candidate inventory

The candidate contains exactly two new assets and exactly one `it(...)` journey:

- `GAP_P0_07R1_TEST_SPEC.md` — `68bf7e55aaebce758be15f6cdd79644ad1658d139d1e73261702bac3f3acc6b0`
- `tests/gap-p0-07r1/receiptAcknowledgement.contract.test.tsx` — `b37cd99fa6bbc0d37c83e09956c10ab0f3f8d87331c414a360d7ab9cebd1a9b8`

No GAP-P0-07 asset or production file was changed.

## Locked acceptance boundary

1. Returning from a durable receipt refreshes the workspace before acknowledging the receipt.
2. A one-shot public KV `setItem` failure during durable acknowledgement keeps the same receipt visible with an explicit error and retry action.
3. The failed acknowledgement keeps the settled receipt facts visible while public task state proves the primary task is completed once, the fallback remains pending, and the total score remains exactly 45; settlement, history facts, and points are not replayed.
4. Public retry acknowledges once and enters the refreshed workspace. A byte-only restart then enters the workspace directly, never restoring the acknowledged review/receipt, while task status and score remain exactly once.
5. The test does not inspect keys, envelopes, or raw write counts and uses no private runtime surface, sleep, fake timer, or process listener.

## Focused validation

- One effective corrected GAP-P0-07R1 run: `1 failed / 1 total`, a legal feature red. The public flow reached the settled 45-point receipt and successfully refreshed the workspace, but current production dismissed the receipt without attempting durable acknowledgement, so `回执确认失败` was absent.
- `tsc --noEmit`: passed, exit `0`.
- The corrected `1 it` ran exactly once. Its removed cross-repository byte oracle was not replaced with a private key, envelope, or raw write-count assertion.
- No old test, regression suite, quality gate, registry, network check, native build, package, production file, or report was run or changed.

One fresh independent reviewer must accept the exact candidate self before production work is authorized.
