# GAP-P0-06R1 controlled fixture-consistency changelog

## Authority

- Status: `PENDING ONE DELTA REVIEW / NO PRODUCTION AUTHORITY`.
- Candidate self: `6e2a888b36301f76f05a76a3fa6ab04e12f6a8c921742c64dbdaeabb63ba3a69`.
- Original GAP-P0-06 candidate self `74747883719b353243aacdbae245e29607d2f268404e2564186dc1495605873d` is `CONTROLLED SUPERSEDED FOR ASYNC EVENT + PROTOCOL-NEUTRAL NET-BYTE ORACLE FIXTURE CONSISTENCY / NEVER USED FOR PRODUCTION`.
- This is a test-fixture consistency correction, not a production quality failure. The original GAP-P0-06 assets remain unchanged.

## Locked delta

1. The two public `fireEvent.changeText(...)` calls are awaited so async user input is settled before the following action.
2. `WorkspaceBackend.stableByteSnapshot()` serializes the complete stored byte entries after sorting by key. It does not interpret storage keys or envelopes.
3. The edit journey requires failed persistence to leave the complete storage bytes exactly equal to the pre-action baseline and successful retry to create a net byte change.
4. The delete journey requires cancellation to leave the complete storage bytes exactly equal to the pre-action baseline and confirmation to create a net byte change.
5. No storage-key filtering, fixed-write subtraction, `>=` relaxation, production branch, operation-ID change, or production edit is present. The six public AppRoot journeys remain unchanged.

## Candidate inventory

The candidate contains exactly three LF/no-BOM assets:

- `GAP_P0_06R1_TEST_SPEC.md`
- `tests/gap-p0-06r1/taskWorkspace.contract.test.tsx`
- `tests/gap-p0-06r1/gapP006TestKit.ts`

## Focused validation

- `tsc --noEmit`: passed, exit 0.
- GAP-P0-06R1 single suite: 6/6 passed, 1 suite passed, 0 snapshots.
- No legacy regression, quality gate, network check, or native build was run.
