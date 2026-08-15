# GAP-P0-06R2 — Task workspace projection and selection integrity

Status: TESTS FIRST / PENDING ONE INDEPENDENT REVIEW / NO PRODUCTION AUTHORITY

## Frozen dependency

- GAP-P0-06R1 candidate self SHA-256: `6e2a888b36301f76f05a76a3fa6ab04e12f6a8c921742c64dbdaeabb63ba3a69`
- R2 is additive. GAP-P0-06R1 tests, locks, production code, package metadata, registries, and reports are immutable for this slice.

## Public boundary

Exercise only `AppRoot`, public React Native UI actions, public service-backed seeding, and byte-level restart on the same backend. Tests must not import a private provider/context, inspect storage keys or envelopes, sleep, use fake timers, use a network, or retest repository protocols.

The suite contains exactly three tests:

1. **Durable create survives projection-refresh failure without duplicate mutation**
   - Arrange an explicit clock so the backend `set` for create succeeds, then the following projection refresh `now()` fails deterministically.
   - Let the original public save action settle into the refresh error.
   - Repeated presses of the public refresh-retry action must refresh projection only and must not issue a second logical create.
   - After refresh recovery and byte restart on the same backend, exactly one task exists and the original command keeps one operation identity/meaning.

2. **Selected task detail is isolated from the global recommendation**
   - Seed recommended task B and open non-recommended task A from its card.
   - Detail mode must not expose global create or recommendation-switch entry points.
   - Public detail actions (add next step, focus, completion where applicable) must target A and never drift to B.
   - `CoreFlowScreenProps` and `CoreAppService` remain unchanged.

3. **Completing the selected task immediately reconciles the workspace projection**
   - Seed completable in-progress task A plus fallback task B.
   - Complete A from its detail screen and return to the workspace.
   - A is immediately absent and the recommendation is recomputed to B, without remount or restart.

## First-run gate

Run only this new three-test suite and TypeScript compilation. A single mechanical fixture correction is allowed. If any failure is not a product gap, stop. Do not run older regressions during test authorship.
