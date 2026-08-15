# GAP-P0-06R3 — Task workspace mutation recovery

Status: TESTS FIRST / PENDING ONE INDEPENDENT REVIEW / NO PRODUCTION AUTHORITY

## Frozen dependency

- GAP-P0-06R2R2 candidate self SHA-256 is pinned to `f23cc37249aac573a6cbb0b2d196b7044300e0d9023a52d458673a315d80360b`.
- GAP-P0-06R2R2, GAP-P0-06R1, every older test asset, production code, locks, package metadata, registries, and reports are read-only for R3 authorship.

## Public boundary and exact scope

The suite contains exactly two deterministic AppRoot/UI tests. It imports only the frozen public workspace harness, drives public React Native roles and labels, and observes public UI, public lifecycle query results, ID calls, and complete stable backend bytes. It does not import a private provider/context, inspect storage keys or envelopes, assert physical write counts, sleep, use fake timers, attach process listeners, or retest repository protocols.

1. **Synchronous title validation cannot brick mutation pending**
   - Submit an all-whitespace title from the public create form.
   - The press must not synchronously escape the AppRoot boundary; `TITLE_REQUIRED` is rendered, the save button is enabled again, durable bytes and ID calls are unchanged, and the same still-open form can save one valid task.
   - The public query then contains exactly that valid title and the logical ID generator was used once.

2. **A fixed-clock edit refreshes the selected object everywhere**
   - Seed and open one Q1 task, then keep the clock fixed while editing both its title and importance so the same task ID moves to Q3.
   - The outer detail header and quadrant card, plus the nested CoreFlow `任务：…` view, all show only the revised task. Old outer and inner task identities disappear.
   - `推荐下一项` can continue against that selected task and exposes only the revised title.

## Static-review closure for the pre-commit refresh race

No timing test is added for the third finding because a deterministic public AppRoot fixture would require either a private runtime seam or brittle scheduler control. Final code review must instead verify this implementation invariant:

1. Once the durable mutation resolves, capture and await any refresh that was already in flight.
2. Then invoke the shared coalescing refresh entry so the mutation observes a read started after commit (or a concurrent refresh that itself started after commit).
3. Workspace mutations and CoreFlow durable actions use this same post-durable refresh boundary.
4. A projection refresh failure must remain retry-only and must never replay the durable mutation.

## Controlled validation gate

- Run this new two-test root once. A legitimate red against unchanged production is expected; fixture or infrastructure red must stop authorship.
- Run `tsc --noEmit` once.
- Do not run GAP-P0-06R1, R2R2, broad regression, quality gate, registry checks, network checks, or native builds during R3 test authorship.
- After a legitimate red and successful typecheck, freeze the exact spec and test in a candidate manifest. The candidate remains `PENDING ONE INDEPENDENT REVIEW / NO PRODUCTION AUTHORITY`.
