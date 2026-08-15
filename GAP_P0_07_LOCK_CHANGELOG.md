# GAP-P0-07 candidate changelog

## Authority

- Status: `PENDING ONE INDEPENDENT REVIEW / NO PRODUCTION AUTHORITY`.
- Candidate self: `a3ff5d286480d4903f616233fd34de88e107a159a7e113cb7045a77a9f31d2a2`.
- The changelog is intentionally excluded from the three-entry candidate manifest.

## Candidate inventory

The candidate contains exactly three assets and exactly three `it(...)` journeys:

- `GAP_P0_07_TEST_SPEC.md` — `aa417dc59d6d3e2b0ebe191cb1a84fb6a672e9fdf039d64ce6e2b0560ad65584`
- `tests/gap-p0-07/postFocusReview.contract.test.tsx` — `9ebc8663c2cc36cf1d6a26c9c26a92ff3cb811041067d658cbe51216512f9fa1`
- `tests/gap-p0-07/gapP007AppRootTestKit.ts` — `a469a00aefe6d6ef7e1321ac2504f2eb077f1295c77fb57abfd5ce7e5d238311`

## Locked acceptance boundary

1. Natural focus completion enters a task-bound review, survives a pre-settlement byte restart, and can settle as progress without completing the task or awarding points.
2. Public early interruption enters review; an explicit Q2 task-completion outcome remains once-only under double submit and byte restart, using the existing 45-point domain award.
3. Returning from a durable receipt refreshes the workspace; a public KV read failure exposes an explicit refresh retry whose success changes no backend bytes and never replays settlement.
4. The receipt exposes only verifiable task points, reason, and today's settled focus count/minutes. Level, streak, badge, growth-center, and extra focus-reward models are out of scope.
5. Focus, task, and review data may span different durable records. The candidate does not require instantaneous cross-key atomicity or inspect private keys/envelopes; it requires a recoverable saga to converge after retry/restart to one stable receipt, task state, and score.

## Focused validation

- One effective GAP-P0-07 root run: `3 failed / 3 total`, all three legal feature reds at the absent public `专注复盘` entry after their respective upstream focus journeys completed successfully.
- `tsc --noEmit`: passed, exit `0`.
- One preliminary Jest discovery invocation executed `0` tests because the existing config fixes `roots` to `tests/locked`; the effective invocation corrected only the root/path and then ran the new suite once.
- No existing suite, broad regression, quality gate, network check, native build, production file, old test, registry, package, or report was run or changed.

One fresh independent reviewer must accept the exact candidate self before production work is authorized.
