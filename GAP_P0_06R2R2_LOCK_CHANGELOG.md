# GAP-P0-06R2R2 public-query consistency changelog

## Authority

- Status: `PENDING ONE DELTA REVIEW / NO PRODUCTION AUTHORITY`.
- Candidate self: `f23cc37249aac573a6cbb0b2d196b7044300e0d9023a52d458673a315d80360b`.
- Frozen dependency GAP-P0-06R2R1 self: `9a2694a09f62dc6ba59ebe14933c0aa265982a19981dd6f33f18961d4bfd85f0`.
- GAP-P0-06R2R1 is `REVIEW FAILED BEFORE ACCEPTANCE / NEVER USED FOR PRODUCTION` because Test 3 incorrectly asserted that the public lifecycle query's complete `tasks` collection excludes a completed task. This was a fixture inconsistency, not a production failure. The R2R1 assets remain unchanged.
- This changelog is intentionally excluded from the three-entry candidate manifest.

## Exact controlled delta

1. `gapP006R2TestKit.ts` is byte-for-byte identical to R2R1: SHA-256 `3f7dd397164f03c8533845d3eb48342549c53f068a7a4e54bfc3d496528a6654`.
2. The suite prefix through Test 1 and Test 2 is byte-for-byte identical to R2R1; both tests are unchanged.
3. Test 3 no longer requires `query.tasks` to equal only task B. It finds task A and task B through the public `TaskLifecycleQueryResult`, asserts A is `completed` and B is `pending`, asserts every `quadrants[*].allTasks` bucket excludes A, asserts the Q2 bucket contains B, and retains `recommendation.id === B`.
4. All public UI assertions before the restarted query remain unchanged; the correction only aligns the restart oracle with the documented public projection semantics.
5. No production, R2R1, R2, R1, older test, lock, registry, package, or report asset changed.

## Candidate inventory

The candidate contains exactly three assets and exactly three `it(...)` tests:

- `GAP_P0_06R2R2_TEST_SPEC.md`
- `tests/gap-p0-06r2r2/taskWorkspaceProjection.contract.test.tsx`
- `tests/gap-p0-06r2r2/gapP006R2TestKit.ts`

## Focused validation

- `tsc --noEmit`: one effective run passed, exit 0.
- R2R2 Test 3 only: 1 passed / 2 skipped / 0 snapshots, with `--detectOpenHandles`; no console error or open-handle report.
- One preliminary Jest discovery invocation found zero tests because the existing config fixes `roots` to `tests/locked`; it executed no test and was corrected by explicitly targeting only the R2R2 root.
- Test 1 and Test 2 were not run. No full R2R2 suite, older regression, quality gate, network check, or native build was run.

One fresh independent delta reviewer must accept the exact candidate self before any production authority exists.
