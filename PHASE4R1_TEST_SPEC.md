# Phase 4 R1 — composition contract compatibility correction

## Authority and scope

This R1 supersedes only the five raw `backend.getCalls` assertions in the
original Phase 4 `startFiveApp.contract.test.tsx`. Later accepted application
flows legitimately hydrate independent post-focus-review and day-closure
state through the same injected key/value backend, so the backend's global
read order and total count are no longer a public composition contract.

The original Phase 4 tests, fixtures, specifications, and locks remain
unchanged. Production source is outside this correction. The R1 candidate is
one new seven-case suite plus this specification and reuses the original typed
Phase 4 fixtures without copying them.

## Preserved public contracts (exactly seven cases)

1. A durable guest task hydrates through the composed `AppRoot`, and the
   composition exposes a repository, service, and root component.
2. Repeated roots call the exact exposed service instance and converge on the
   same durable repository/service state. The test does not prescribe an
   internal call count.
3. A service mutation, exposed repository, rendered root, and later app
   instance share one durable state.
4. The injected clock and ID generator reach actual service mutations exactly
   once.
5. Local boot reaches a visible hydration-ready UI without calling either the
   injected network adapter or global `fetch`.
6. Corrupt task hydration surfaces `TASK_SNAPSHOT_CORRUPT` through the exact
   service and visible UI and never invents a task.
7. Composition and persistence production modules remain independent from the
   bookkeeping project.

## Deliberately removed implementation oracle

No R1 assertion reads `backend.getCalls`, filters storage keys, or fixes a
global backend read count/order. Task hydration is instead proven at the
public service/repository/UI boundaries. All mutation, durability, dependency
injection, offline boot, corrupt-state, and source-independence oracles remain.

## Controlled validation

Run the R1 seven-case suite once and global TypeScript `--noEmit` once. Do not
run the superseded Phase 4 suite or any broad, native, quality-gate, registry,
or unrelated test root for this correction.

