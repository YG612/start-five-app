# Phase 4 hardening review locked-test specification

## Status and scope

Status: **CANDIDATE, pending independent test review.** This is a test-first regression contract for the Phase 4 final-review findings: one P1 shared-backend lost-update defect and two P2 snapshot-integrity defects. After `PHASE4_REVIEW_LOCK.sha256` is independently accepted, this specification and every regular file below `tests/phase4-review/` are immutable.

This candidate adds tests and test-only helpers only. It must not change production code, package/dependency/configuration files, the original/Review-1/Review-2/Review-3/Phase-4 locks or tests, the Review-4/native candidates, or the separate `qingji-ai` project.

The contract supplements every accepted earlier lock. It does not replace or weaken any earlier persistence, repository, composition, idempotency, timer, or isolation requirement.

## Production-facing contract

### A. Multiple live compositions over one backend cannot lose updates

Two simultaneously live results of `createStartFiveApp` may be given the exact same backend object. After both compositions have hydrated the same durable snapshot, a mutation through either composition must not overwrite a mutation accepted through the other composition.

The externally observable requirement is atomic read-modify-write behavior per backend identity:

- two compositions first hydrate the same explicitly stored empty envelope, then create distinct tasks in deterministic sequential order; a fresh third composition over the same backend must recover both tasks;
- two compositions first hydrate the same legal non-empty envelope, then create distinct tasks while the backend holds the first commit at a test-controlled gate; after the overlap is released and both calls fulfil, a fresh composition must recover the baseline task and both new tasks;
- two different backend objects remain strictly isolated, even when their operations are otherwise equivalent.

The tests do not require a particular implementation. A shared repository, a per-backend transaction coordinator, compare-and-swap where supported, or another correct atomic design is acceptable. They do not assert hydration call counts, object identity, lock type, queue structure, or commit order. The controlled backend gates only the first physical set, advances work through a finite microtask drain, and releases the gate in `finally`; it uses no real-time wait and cannot leave a test-owned deferred unresolved.

### B. Inbound snapshots must satisfy domain semantics, not merely field types

Every invalid case is read twice through a real persistent adapter plus `createTaskRepository`. Both reads must reject with `code` and `message` equal to `TASK_SNAPSHOT_INVALID`. The original backend string must remain byte-for-byte identical and there must be zero `setItem` and zero `removeItem` calls.

The parameterized invalid corpus covers:

- duplicate task IDs and duplicate subtask IDs within one task;
- empty and whitespace-only task IDs, task titles, subtask IDs, and subtask titles;
- unparseable task `startAt`, `dueAt`, `createdAt`, `updatedAt`, `startedAt`, `completedAt`, `deletedAt`, and `scoreAwardedAt` values;
- unparseable subtask `createdAt`, `updatedAt`, and `completedAt` values;
- task `updatedAt`, `completedAt`, or `deletedAt` earlier than task `createdAt`;
- subtask `updatedAt` or `completedAt` earlier than subtask `createdAt`;
- a completed task without `completedAt`, or a completed task retaining a pending subtask;
- pending, in-progress, or cancelled tasks carrying `completedAt`;
- a pending subtask carrying `completedAt`, or a completed subtask lacking `completedAt`;
- negative, non-integer, or null scores on completed tasks; an unpaired score/`scoreAwardedAt`; and a score on a non-completed task;
- unknown task and subtask statuses.

The legal corpus prevents over-tightening. A pending task with both score fields null remains legal. Cancellation without completion data remains legal, including a cancelled and soft-deleted task. Soft deletion remains orthogonal to pending status. No test treats `deletedAt` as a lifecycle status or requires a cancelled/deleted task to be completed.

### C. Non-finite outbound scores must be rejected before JSON coercion

`NaN`, positive infinity, and negative infinity are each supplied to the actual `TaskRepository.update` path for an already hydrated, valid completed task. This is deliberately not a direct adapter-only test.

Each mutation must reject with `TASK_SNAPSHOT_INVALID` before `JSON.stringify` can coerce the value to `null`. For every value:

- the durable raw string remains exactly the old valid envelope;
- no backend set or remove is attempted;
- the current repository still returns the old valid task;
- a fresh adapter/repository instance over the same backend recovers the same old valid task.

### D. Exact production module loading

The regression suites statically import the exact existing production modules:

- `src/app/startFiveApp.tsx`;
- `src/data/persistentTaskStorage.ts`;
- `src/data/taskRepository.ts`.

There is no catch-and-relabel dynamic loader in this candidate. A missing exact module fails module resolution, while a nested missing dependency, transform/syntax failure, or arbitrary production top-level exception propagates as the real Jest failure and cannot be disguised as a missing implementation.

## Locked files and coverage

`tests/phase4-review/phase4ReviewFixtures.ts` is test-only infrastructure and is included in the lock. It supplies the deterministic backend, a one-shot commit gate, legal task builders, envelope serialization, finite promise draining, and error observation. It contains no production persistence or concurrency implementation.

Coverage is split as follows:

| Finding | Locked suite |
|---|---|
| same-backend sequential/overlapped writes and different-backend isolation | `tests/phase4-review/sharedCompositionConcurrency.regression.test.ts` |
| parameterized inbound semantic rejection plus legal cancelled/deleted/null-score controls | `tests/phase4-review/snapshotSemanticValidation.regression.test.ts` |
| real-repository NaN and positive/negative infinity atomic rejection | `tests/phase4-review/nonFiniteScoreAtomicity.regression.test.ts` |
| deterministic helpers and controlled backend | `tests/phase4-review/phase4ReviewFixtures.ts` |

The candidate contains **3 suites / 50 tests**:

- 3 shared/different-backend composition tests;
- 41 invalid inbound snapshot cases;
- 3 legal inbound snapshot controls;
- 3 non-finite outbound score cases.

## Recorded pre-fix baseline

Recorded on 2026-08-04 against the Phase 4 production candidate, before any hardening repair:

- `tests/phase4-review`: **3 suites executed; 50 tests discovered; 44 failed and 6 passed**;
- the 44 failures are exactly two same-backend lost-update cases, 39 currently accepted semantic-invalid snapshots, and three non-finite score writes that fulfil and coerce the durable score to `null`;
- the six green controls are different-backend isolation, the two already-rejected unknown status cases, and the three legal pending/cancelled/deleted cases;
- the controlled overlap terminates normally and reports the expected lost task; there is no timeout, real-time wait, unresolved test gate, unhandled rejection, console/React warning, or open-handle symptom;
- there is no skipped, focused, pending, or snapshot-only test; no TypeScript suppression or explicit `any` is used;
- `tsc --noEmit` passes with the candidate present;
- the accepted Phase 4 suite remains **3 suites / 20 tests green**;
- the original plus Review-1/2/3 suites remain **16 suites / 138 tests green**.

The red baseline is product-defect evidence, not a test-infrastructure failure.

## Repair acceptance

Before delivery, a production repair must satisfy all of the following without modifying this lock:

1. Phase 4 hardening is 3 suites / 50 tests green.
2. Accepted Phase 4 remains 3 suites / 20 tests green.
3. Original plus Review-1/2/3 remain 16 suites / 138 tests green.
4. The relevant unified run is green and `tsc --noEmit` is green.
5. `TEST_LOCK.sha256`, `REVIEW1_LOCK.sha256`, `REVIEW2_LOCK.sha256`, `REVIEW3_LOCK.sha256`, `PHASE4_LOCK.sha256`, and this manifest all verify with zero drift.
6. A new independent reviewer, with no overlap with the repair agent, approves the production changes and the full evidence.

## Canonical commands

From the `outputs/start-five` project root with the pinned Node/pnpm runtime on `PATH`:

```powershell
pnpm exec jest --runInBand --ci --coverage=false --roots tests/phase4-review
pnpm exec jest --runInBand --ci --coverage=false --roots tests/phase4
pnpm exec jest --runInBand --ci --coverage=false --roots tests/locked tests/review1 tests/review2 tests/review3
pnpm exec tsc --noEmit
```

## Lock construction and verification

`PHASE4_REVIEW_LOCK.sha256` is generated last. It lists this specification followed by every regular file recursively below `tests/phase4-review/`, sorted by POSIX-style relative path. The manifest does not include itself.

Each line is exactly:

```text
<lowercase SHA-256><two spaces><POSIX relative path>
```

Verification recomputes SHA-256 for every listed file and compares it with the first field. The manifest's independent identity is the lowercase SHA-256 of `PHASE4_REVIEW_LOCK.sha256`. Any mismatch is lock drift and blocks repair or delivery.
