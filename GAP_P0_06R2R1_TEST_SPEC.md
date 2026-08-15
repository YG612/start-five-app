# GAP-P0-06R2R1 — Task workspace projection and selection integrity

Status: TESTS FIRST / PENDING ONE DELTA REVIEW / NO PRODUCTION AUTHORITY

## Frozen dependencies and supersession

- GAP-P0-06R1 candidate self SHA-256: `6e2a888b36301f76f05a76a3fa6ab04e12f6a8c921742c64dbdaeabb63ba3a69`
- GAP-P0-06R2 candidate self SHA-256: `06ed28b698bd35eeae0480f7799f356cec3408df9738f6c67c3fae145d9252d5`
- GAP-P0-06R2 is `REVIEW FAILED BEFORE ACCEPTANCE / NEVER USED FOR PRODUCTION`: its Test 1 asserted a raw backend set count and therefore violated the protocol-neutral public boundary.
- R2R1 is a controlled consistency correction. GAP-P0-06R2, GAP-P0-06R1, production code, package metadata, registries, reports, and all older test assets are immutable for this slice.

## Public boundary

Exercise only `AppRoot`, public React Native UI actions, public service-backed seeding, stable backend byte snapshots, and byte-level restart on the same backend. Tests must not import a private provider/context, inspect storage keys or envelopes, assert raw physical write counts, sleep, use fake timers, use a network, or retest repository protocols.

The suite contains exactly three tests:

1. **Durable create survives projection-refresh failure without duplicate mutation**
   - Arrange an explicit clock so the backend `set` for create succeeds, then the following projection refresh `now()` fails deterministically.
   - Let the original public save action settle into the refresh error and capture the stable durable bytes.
   - The public refresh-retry action must refresh projection only: stable durable bytes stay identical and the logical ID generator remains single-use.
   - After refresh recovery and byte restart on the same backend, exactly one task exists.

2. **Selected task detail is isolated from the global recommendation**
   - Seed recommended task B and open non-recommended task A from its card.
   - Detail mode must not expose global create or recommendation-switch entry points.
   - Public detail actions (add next step, focus, completion where applicable) must target A and never drift to B.
   - `CoreFlowScreenProps` and `CoreAppService` remain unchanged.

3. **Completing the selected task immediately reconciles the workspace projection**
   - Seed completable in-progress task A plus fallback task B.
   - Complete A from its detail screen and return to the workspace.
   - A is immediately absent and the recommendation is recomputed to B, without remount or restart.

## Controlled validation gate

- TypeScript compilation runs once.
- Only Test 1 runs once after the protocol-neutral delta.
- Test 2 and Test 3 bodies must remain byte-identical to GAP-P0-06R2 and retain their prior controlled evidence.
- Concurrent refresh singleflight remains a targeted static-review obligation; this suite does not manufacture overlapping React `act` scopes.
- Do not run the full three-test suite or any older regression during R2R1 authorship.
