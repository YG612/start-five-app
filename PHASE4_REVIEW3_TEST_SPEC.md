# Phase 4 hardening review 3 locked-test specification

## Status, supersession, scope, and immutability

Status: **REVISED CANDIDATE, pending a brand-new independent test review.** The rejected candidate whose manifest identity was `941332f907fa25754af87d881206d3bd091adfe16506a00c77e7a256621ccf92` is superseded and must not be used for repair.

This revision replaces caller-origin guessing with a portable per-backend/per-key transaction activity rule. It also narrows scoreless-completion compatibility, makes every parent/subtask invalid fixture orthogonal, and covers stable error mapping for hostile inputs.

This candidate changes only this specification, `tests/phase4-review3/**`, and `PHASE4_REVIEW3_LOCK.sha256`. It does not modify production code, package/dependency/configuration files, any prior formal specification/test/manifest, native or quality-gate artifacts, or the separate `qingji-ai` project.

After a new independent reviewer accepts the revision, this specification and every regular file recursively below `tests/phase4-review3/` are immutable. A repair agent may change production code only and must not edit, regenerate, skip, focus, weaken, replace, or selectively omit an accepted test.

This contract supplements all earlier locks. It does not weaken same-repository reentrancy, FIFO mutation order, transaction atomicity, shared-backend coordination, persistence, UI, timer, native, or quality requirements.

## Production-facing contract

### A. Portable shared transaction activity boundary

Transaction callback activity is coordinated by physical backend identity and storage key, not by facade instance and not by inferred caller origin.

While a `TaskRepository.transaction` callback is still active, every facade-level mutation for the same backend/key must fail fast, regardless of whether it is invoked:

- on the facade that opened the transaction;
- on another facade over another persistent adapter for the same backend/key;
- from callback code;
- from an independently scheduled/test call after the callback has suspended.

The covered facade mutations are `create`, `update`, `softDelete`, and `transaction`. Each rejects within a finite microtask budget with `code` and `message` exactly equal to:

```text
TASK_REPOSITORY_REENTRANT_MUTATION
```

Legal operations through the callback's transaction surface continue to work. Rejected facade calls perform zero writes/deletes, do not alter staged state, do not force the outer transaction to roll back when the callback did not await them, and do not poison later mutations.

The cross-facade callback matrix covers an awaited `repositoryB.update` and nested `repositoryB.transaction` while `repositoryA` owns the active callback. Both must fail fast rather than queue behind the transaction that is awaiting them. The test uses a finite 128-turn microtask sentinel. A test-only escape promise is released in `finally` solely to unwind a defective cyclic wait; every promise has a rejection observer and no timer or open handle is used.

The cross-facade external-active case proves there is no caller-origin exception: after the callback publishes `entered` and suspends on a gate, a test-initiated `repositoryB.update` still rejects while the shared callback remains active.

This rule is implementable with ordinary repository-owned shared state already keyed by coordination identity and storage key. The tests do not import or require Node `AsyncLocalStorage`, caller-stack inspection, a public transaction token, a changed callback signature, or another platform-specific mechanism.

### B. Callback completion and commit-pending queue boundary

Callback activity ends as soon as the callback's returned promise settles. Durable commit may still be pending after that point.

The locked control defers the transaction's `storage.setItem`, which proves the callback has returned and commit is in progress. A facade mutation on another facade for the same backend/key must then:

- remain queued during the deferred commit instead of reporting reentrancy;
- fulfil after the commit gate releases;
- run after the transaction in FIFO order;
- produce exactly the transaction write followed by the queued-mutation write;
- leave cache and a fresh reload equal to the final durable snapshot.

This control prevents an implementation from keeping the shared callback-active flag set through commit I/O.

### C. Transaction-surface lifetime

The transaction surface passed to `work(surface)` is valid only while that callback is active. Once the callback returns or throws, a leaked surface is expired, including while transaction commit is still waiting in `storage.setItem`.

Leaked-surface `create`, `update`, and `softDelete` calls after successful callback return, after rollback, and during commit-pending all reject with `code` and `message` exactly equal to:

```text
TASK_REPOSITORY_TRANSACTION_EXPIRED
```

Expired calls never fulfil or mutate the staged array. They add no write/delete and cannot create ghost success or durable/cache divergence. The commit-pending case captures serialized bytes before leaked calls are attempted, then compares durable state, committed cache, and a truly fresh reload after release.

### D. Exact scoreless-completion hydration compatibility

Scoreless-completion compatibility does not waive the completed task's start invariant.

A completed task with all three of these properties is invalid:

- `score === null` and `scoreAwardedAt === null`;
- `startedAt === null`;
- otherwise well-formed completed-task/subtask timestamps.

The same exact task shape rejects with `code` and `message` `TASK_SNAPSHOT_INVALID` at both boundaries:

- direct raw task-array hydration;
- versioned persistent-envelope hydration.

Both failures are retryable and read-only: raw bytes remain unchanged with zero set/delete attempts.

The direct legacy positive control is deliberately distinguishable: it is scoreless but has a valid non-null `startedAt`. Direct raw-array hydration may continue to read that historical scoreless shape without rewriting it.

This candidate makes no new claim about mutation-time normalization required by prior formal Review-1 fixtures. It only narrows inbound snapshot compatibility and therefore does not contradict accepted mutation behavior.

### E. Parent/subtask aggregate temporal bounds

At direct raw-array and persistent-envelope hydration boundaries, snapshots reject with `code` and `message` `TASK_SNAPSHOT_INVALID` when:

- `subtask.createdAt < task.createdAt`;
- `subtask.completedAt > task.completedAt` for a completed parent;
- `subtask.updatedAt > task.updatedAt`.

Each fixture violates only its named aggregate relation:

- the created case keeps all later times inside the parent;
- the completed case sets parent `updatedAt` after the child, so only child completion exceeds parent completion;
- the updated case keeps child completion equal to parent completion while only child update exceeds parent update.

Rejection preserves direct/envelope bytes and performs zero writes/deletes. Exact equality at created, completed, and updated aggregate boundaries remains legal at both hydration paths.

### F. Stable hostile-input error mapping

Public mutation validation maps input-introspection failures to the stable ordinary snapshot error instead of leaking engine-specific exceptions.

The locked inputs are:

- a task aggregate Proxy whose `getPrototypeOf` trap throws;
- a revoked Proxy used as an update patch;
- an unknown patch nested 256 levels deep with an enumerable throwing getter at its leaf.

Each rejects with `code` and `message` exactly equal to `TASK_SNAPSHOT_INVALID`, performs zero writes/deletes, preserves durable/cache/fresh agreement, and leaves the queue able to commit a normal recovery update.

The deep getter must never execute. A conforming validator may reject the unknown root key before descent, stop at a finite depth budget, or inspect descriptors without invoking accessors. The test owns one getter-call counter and never reads the hostile patch itself after submission.

## Deterministic infrastructure and production imports

All five suites statically import the exact production modules they exercise:

- `src/data/taskRepository.ts`;
- `src/data/persistentTaskStorage.ts`;
- `src/domain/task.ts` for types only.

There is no dynamic loader or catch-and-relabel import wrapper. Module, transform, syntax, and top-level production failures surface directly.

`tests/phase4-review3/phase4Review3Fixtures.ts` is locked test-only infrastructure. It supplies inspectable direct/persistent stores, a one-write commit gate, task/envelope builders, hostile values, outcome summaries, and the finite microtask sentinel. It contains no repository, validation, coordination, transaction, or persistence implementation.

Every deferred gate is released in `finally` on defective and conforming paths. There is no skipped/focused/pending test, snapshot-only assertion, `setTimeout`, `setInterval`, fake network, platform handle, increased Jest timeout, TypeScript suppression, or explicit `any`.

## Locked coverage and counts

| Contract | Locked suite | Tests |
|---|---|---:|
| Same/cross facade active fail-fast, cross-callback deadlock rejection, commit-pending FIFO control | `tests/phase4-review3/externalQueueAndCrossFacade.regression.test.ts` | 5 |
| Surface expiry after commit, rollback, and during commit wait | `tests/phase4-review3/transactionSurfaceLifetime.regression.test.ts` | 3 |
| Modern missing-start scoreless direct/persistent negatives and distinct direct legacy control | `tests/phase4-review3/scorelessCompletionBoundary.regression.test.ts` | 3 |
| Three orthogonal parent/subtask time violations and equality control | `tests/phase4-review3/parentSubtaskTemporalBounds.regression.test.ts` | 4 |
| Throwing Proxy, revoked Proxy, and deep getter stability/recovery | `tests/phase4-review3/adversarialPlainData.regression.test.ts` | 3 |

The revised candidate contains **5 suites / 18 tests**, plus one locked helper file.

## Recorded revised pre-fix baseline

Recorded on 2026-08-05 against the current Phase 4 Hardening 2 production candidate, before repair for this revised lock:

- complete candidate with `--detectOpenHandles`: **5 suites executed, 18 tests discovered, 12 failed and 6 passed**;
- portable activity suite: cross-facade callback update, nested transaction, and cross-facade external-active call were red; same-facade active fail-fast and commit-pending queue controls were green;
- transaction-surface lifetime: three red because leaked operations fulfilled after every boundary;
- scoreless boundary: modern direct missing-start shape was red; the already-strict persistent negative and distinguishable direct legacy positive were green;
- parent/subtask aggregate bounds: three red; exact equality was green;
- hostile input mapping: throwing and revoked Proxy cases were red; deep getter safety was green;
- the complete run exited normally in 9.019 seconds and emitted no Jest timeout, unhandled rejection, unresolved-gate symptom, or open-handle warning.

The 12 red tests are product-defect evidence. The six green tests are deliberate portable-boundary, compatibility, and safe-input controls.

## Repair acceptance

No production repair agent receives this revision until a brand-new independent reviewer accepts its portability, consistency with all prior locks, coverage, deterministic teardown, exact counts, and manifest.

After acceptance, repair requires all of the following without test changes:

1. Phase 4 Hardening Review 3: 5 suites / 18 tests green.
2. The eight prior formal roots: 28 suites / 253 tests green.
3. Unified formal plus revised candidate: 33 suites / 271 tests green.
4. `tsc --noEmit` green.
5. All nine formal manifests verify with zero drift: `TEST_LOCK.sha256`, `REVIEW1_LOCK.sha256`, `REVIEW2_LOCK.sha256`, `REVIEW3_LOCK.sha256`, `PHASE4_LOCK.sha256`, `PHASE4_REVIEW_LOCK.sha256`, `REVIEW4_LOCK.sha256`, `PHASE4_REVIEW2_LOCK.sha256`, and this manifest.
6. A brand-new independent code reviewer, with no overlap with the test author or production repair agent, approves implementation and evidence.

Any repair failure returns to production repair and repeats the full independent review. Tests remain locked.

## Canonical commands

From `outputs/start-five` with the pinned Node/pnpm runtime on `PATH`:

```powershell
pnpm exec jest --runInBand --ci --coverage=false --roots tests/phase4-review3
pnpm exec jest --runInBand --ci --coverage=false --detectOpenHandles --roots tests/phase4-review3
pnpm exec jest --runInBand --ci --coverage=false --roots tests/locked tests/review1 tests/review2 tests/review3 tests/phase4 tests/phase4-review tests/review4 tests/phase4-review2
pnpm exec jest --runInBand --ci --coverage=false --roots tests/locked tests/review1 tests/review2 tests/review3 tests/phase4 tests/phase4-review tests/review4 tests/phase4-review2 tests/phase4-review3
pnpm exec tsc --noEmit
```

## Lock construction and verification

`PHASE4_REVIEW3_LOCK.sha256` is generated last. It lists this specification first, followed by every regular file recursively below `tests/phase4-review3/`, sorted by POSIX-style relative path. The manifest does not include itself.

Each line is exactly:

```text
<lowercase SHA-256><two spaces><POSIX relative path>
```

The manifest's own independent identity is the lowercase SHA-256 of `PHASE4_REVIEW3_LOCK.sha256`. Any listed-file mismatch is lock drift and blocks repair or delivery.
