# GAP-P0-06R3 focused mutation-recovery changelog

## Authority

- Status: `PENDING ONE INDEPENDENT REVIEW / NO PRODUCTION AUTHORITY`.
- Candidate self: `245ddab84d0b79fb0815473c79c46cd8ce5033fe66f9aef3b9e0ea896191a357`.
- Frozen dependency GAP-P0-06R2R2 self: `f23cc37249aac573a6cbb0b2d196b7044300e0d9023a52d458673a315d80360b` (verified before authorship).
- This changelog is intentionally excluded from the two-entry candidate manifest.

## Exact focused delta

1. Adds one public AppRoot test for an all-whitespace create title. It requires the public press Promise to resolve, `TITLE_REQUIRED` to render, pending to release, bytes and IDs to remain unchanged, and the same form to create exactly one valid task afterward.
2. Adds one public AppRoot test for editing one selected task while the clock remains fixed. The edit changes title and quadrant, and both the outer workspace projection and nested CoreFlow task object must lose the old title and expose the new title. The selected-task recommendation action must continue with the revised object.
3. Adds an explicit final-review invariant for the pre-commit in-flight refresh race instead of introducing a private runtime seam, fake scheduler, or timing-dependent fixture.
4. No production, older test, lock, package, registry, or report asset changed.

## Candidate inventory

The candidate contains exactly two LF/no-BOM assets and exactly two `it(...)` tests:

- `GAP_P0_06R3_TEST_SPEC.md`
- `tests/gap-p0-06r3/taskWorkspaceMutationRecovery.contract.test.tsx`

## Controlled validation evidence

- `tsc --noEmit`: one run passed, exit 0.
- R3 Test 1 only: legitimate production red, 1 failed / 1 skipped. The public press Promise rejected with `DomainError: TITLE_REQUIRED` from `taskWorkspaceRuntime.runMutation`, rather than resolving into rendered error/recovery state.
- R3 Test 2 only: legitimate production red, 1 failed / 1 skipped. The outer detail and Q3 card showed the revised title while nested CoreFlow still rendered `任务：固定时钟下的旧任务`.
- The first whole-root attempt is not counted as product evidence: a synchronous Jest matcher wrapped an async `fireEvent.press`, causing overlapping `act()` scopes and contaminating Test 2. Authorship stopped, the only authorized mechanical correction changed it to `await expect(fireEvent.press(...)).resolves.toBeUndefined()`, and the two tests were then run separately exactly once.
- No second whole-root run, older regression, quality gate, registry check, network check, or native build was run.

One fresh independent reviewer must accept the exact candidate self before any production authority exists.
