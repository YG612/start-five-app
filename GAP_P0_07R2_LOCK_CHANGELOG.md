# GAP-P0-07R2 candidate changelog

## Authority

- Status: `PENDING INDEPENDENT REVIEW / NO PRODUCTION AUTHORITY`.
- Pinned GAP-P0-07 self: `a3ff5d286480d4903f616233fd34de88e107a159a7e113cb7045a77a9f31d2a2`.
- Pinned GAP-P0-07R1 self: `7571d9810bae7df3d0fc1f08366695baf91dd8235e603ea04f5017adf0d63d22`.
- Candidate self: `a78b01e980c301c712bf6ec9553152b5c189e3c7eea45861a8c1e0f3b1d29c8e`.
- Superseded candidate self `98af47401b95a0970dc6763cd1b542babab108c6b450c3638792cc1035939e35`: `REVIEW FAILED BEFORE ACCEPTANCE / NEVER ACCEPTED`; it did not publicly prove that the acknowledged byte-restart workspace preserves the once-only daily focus summary.
- This changelog is intentionally excluded from the two-entry candidate manifest.

## Candidate inventory

The candidate contains exactly two new assets and exactly one `it(...)` journey:

- `GAP_P0_07R2_TEST_SPEC.md` — `23789a35bbe7ae4104c19a9a42330fa62fc6242e4971a323c68f4a4de579d1c0`
- `tests/gap-p0-07r2/refreshThenAcknowledge.contract.test.tsx` — `5b75a21c88563ea73557f22c44983ad239b0744e22aa88806a979da9e88901ed`

No GAP-P0-07/GAP-P0-07R1 asset or production file was changed.

## Controlled consistency correction

1. The old GAP-P0-07 Test 3 remains authoritative through settlement and the injected workspace-read failure: the same receipt and explicit refresh retry stay visible; complete backend bytes remain equal to `settledBytes`; public query proves the primary task is completed once, the fallback remains pending, and total score remains 45.
2. Successful public retry may and must persist the R1 durable receipt acknowledgement before entering the workspace. Therefore only the old post-success oracle `backend bytes === settledBytes` is controlled-superseded.
3. The replacement records complete `acknowledgedBytes`, then proves a byte-only restart enters the workspace directly, does not restore the review/receipt, publicly displays the same `今日专注：1次 / 2分钟` summary without replay, preserves the same public task/score terminal state, and performs no recovery write.
4. GAP-P0-07 Test 1 and Test 2 are untouched. All other Test 3 semantics, including its failure-stage bytes and no-replay guarantees, remain valid.
5. The test does not inspect keys/envelopes or raw set counts and does not require cross-repository instantaneous atomicity.

## Focused validation

- One corrected GAP-P0-07R2 run: `1 failed / 1 total`, the expected precise product red. The journey completed settlement, refresh retry, durable acknowledgement, and acknowledged byte restart, then the public workspace lacked `今日专注：1次 / 2分钟` while its task projection was otherwise correct.
- `tsc --noEmit`: passed, exit `0`.
- No old suite, broad regression, quality gate, registry, network check, native build, package, production file, or report was run or changed.

One fresh independent reviewer must accept the exact candidate self before this controlled supersession is authoritative.
