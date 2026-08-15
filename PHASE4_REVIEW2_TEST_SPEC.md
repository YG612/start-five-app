# Phase 4 hardening review 2 locked-test specification

## Status, scope, and immutability

Status: **CANDIDATE, pending independent test review and prior-lock consistency audit.** This is the test-first contract for four findings from the independent Phase 4 final review: repository transaction reentrancy deadlock, direct-storage hydration bypasses, non-plain public mutation values, and incomplete lifecycle/score invariants.

This candidate adds only this specification, `tests/phase4-review2/**`, and the manifest generated last as `PHASE4_REVIEW2_LOCK.sha256`. It must not modify production code, package/dependency/configuration files, any prior specification/test/manifest, native or quality-gate artifacts, or the separate `qingji-ai` project.

After this candidate is independently accepted, this specification and every regular file recursively below `tests/phase4-review2/` are immutable. A repair agent may change production code only. It must not edit, regenerate, skip, focus, weaken, replace, or selectively omit any accepted test.

The contract supplements every earlier accepted lock. It does not replace or weaken repository atomicity, persistent-envelope validation, shared-backend coordination, application composition, timer, idempotency, native isolation, or other requirements.

## Freeze prerequisite: controlled consistency corrections to prior positive fixtures

The new lifecycle rule requires `updatedAt` not to precede `deletedAt`. Test authoring discovered three earlier positive fixture instances whose deletion timestamp advanced while their update timestamp remained at creation time:

- the legal cancelled/deleted and pending/deleted controls in `tests/phase4-review/snapshotSemanticValidation.regression.test.ts` use `updatedAt=2026-08-04T14:00:00.000Z` with `deletedAt=2026-08-04T14:04:00.000Z`;
- the `q4-cancelled` round-trip fixture in `tests/phase4/phase4Fixtures.ts` uses `updatedAt=2026-08-04T10:00:00.000Z` with `deletedAt=2026-08-04T10:20:00.000Z`.

These are positive-fixture inconsistencies, not exceptions to the production rule. This test-authoring agent does not modify them. Before this candidate can be accepted or sent to a repair agent, independently assigned controlled-correction agents must minimally align each fixture's `updatedAt` with its existing `deletedAt`, document the change, regenerate only the affected prior manifest, and obtain a separate read-only audit. No assertion intent, scenario, field other than the inconsistent `updatedAt`, or production file may change. The corrected prior suites and all other accepted suites must then pass.

## Production-facing contract

### A. Same-repository mutation reentrancy is rejected instead of deadlocking

While a `TaskRepository.transaction` callback is active, awaiting a mutation on the same public repository object from inside that callback must reject promptly. The covered reentrant public calls are:

- `repository.create(...)`;
- `repository.update(...)`;
- `repository.softDelete(...)`;
- `repository.transaction(...)`.

Each attempt rejects with both `code` and `message` exactly equal to:

```text
TASK_REPOSITORY_REENTRANT_MUTATION
```

The outer transaction rolls back all staged work. It performs zero durable writes and zero deletes, does not publish staged data to committed cache state, and does not poison the mutation queue. A normal mutation on the same repository immediately afterward must fulfil, commit exactly once, and be recoverable from a new backend/repository identity.

The locked test uses a finite 64-turn microtask race. It has no real-time wait, timer, increased Jest timeout, unresolved deferred, or platform handle. Against a deadlocking implementation it returns the explicit test-only result `microtask-budget-exceeded` and fails in milliseconds rather than waiting for Jest's timeout. The observed deadlocked promise has a rejection handler attached and owns no external resource.

Legal work through the transaction surface remains valid and performs one atomic commit. This contract does not prohibit independent callers from queuing ordinary work outside the active callback; it specifically prevents the callback from awaiting its own repository queue.

### B. Direct `KeyValueStorage` hydration enforces the semantic snapshot contract

`createTaskRepository` remains usable with the original direct `KeyValueStorage` contract, including the locked in-memory fixtures. It must not rely on `createPersistentTaskStorage` as the only strict validation boundary.

For a non-null raw task-array string returned directly by `KeyValueStorage.getItem`, hydration performs the same domain-semantic validation needed to protect repository cache state. Invalid raw arrays reject with stable `code` `TASK_SNAPSHOT_INVALID`; a failed load remains retryable and a second read rejects the same way. Hydration performs no write or delete, and the original raw string remains byte-for-byte unchanged.

The representative bypass matrix deliberately does not repeat all 41 invalid cases from Phase 4 Review 1. It samples the categories that can otherwise bypass the strict persistent adapter:

- duplicate task IDs and duplicate subtask IDs;
- whitespace-only task and subtask IDs;
- an unparseable timestamp and a reversed update/create timeline;
- a cancelled task carrying score data;
- lexical JSON number `1e400`, which `JSON.parse` produces as positive infinity.

Positive controls keep the original locked Review-1 pending task shape compatible, accept a correctly timestamped cancelled-and-soft-deleted task, and accept soft deletion as orthogonal to a pending lifecycle status.

### C. Public mutations accept plain data only and fail atomically

The public `create`, `update`, and transaction mutation surfaces accept plain JSON-style task data, not values whose JavaScript serialization semantics can diverge from committed cache state.

For this contract, accepted aggregate and patch records are ordinary object-literal records; arrays are ordinary arrays; scalar values are the primitive values required by the task contract. Inputs are invalid when the aggregate, patch, nested record, array, or scalar includes behavior or identity that JSON can silently normalize, including:

- an own `toJSON` hook;
- a custom object prototype;
- a boxed primitive such as `new String(...)`;
- a `Date` object supplied where a timestamp string is required.

The locked matrix reaches actual public repository operations rather than calling the persistent adapter alone:

- `create` with an own `toJSON` hook;
- `create` with a custom aggregate prototype;
- `update` with a boxed string;
- `update` with a `Date` instance;
- transaction-surface `create` with an own `toJSON` hook;
- transaction-surface `update` with a custom patch prototype.

Every invalid mutation rejects with stable `code` `TASK_SNAPSHOT_INVALID` before a backend set/delete attempt. The durable raw envelope remains byte-for-byte unchanged; committed cache state remains the old plain task; and a truly fresh backend object seeded from the resulting durable bytes recovers exactly the old task. There is no partial write or cache/durable divergence. A positive control proves ordinary object literals, arrays, primitive timestamp strings, and a legal transaction continue to work with one commit.

### D. Lifecycle timestamps and completed scores form one coherent snapshot

Both direct raw-array hydration and persistent-envelope hydration enforce these additional rules:

- `pending` tasks have `startedAt === null`;
- `in_progress` and `completed` tasks have a non-null valid `startedAt`;
- `updatedAt` is not earlier than any non-null `startedAt`, `completedAt`, `deletedAt`, or `scoreAwardedAt`;
- a non-null score is a non-negative safe integer and is not negative zero (`Object.is(score, -0)` must be false).

Each invalid outcome exposes stable `code` `TASK_SNAPSHOT_INVALID`. Tests intentionally avoid binding the error class, stack, internal helper, validation order, or any message beyond contracts that explicitly require one. Rejection is read-only: direct raw arrays and persistent envelopes remain byte-for-byte unchanged with zero set/delete attempts.

The nine-case invalid matrix covers all lifecycle relations above plus negative zero and an integer above `Number.MAX_SAFE_INTEGER`. Positive controls prevent over-tightening: a cancelled task may never have started; a cancelled task may have started and later been soft-deleted when its update time is aligned; and `Number.MAX_SAFE_INTEGER` remains a legal completed-task score.

## Exact production imports and test infrastructure

The four regression suites statically import the exact production modules they exercise:

- `src/data/taskRepository.ts`;
- `src/data/persistentTaskStorage.ts`;
- `src/domain/task.ts` for types only.

There is no dynamic loader and no catch-and-relabel import wrapper. Missing modules, missing nested dependencies, syntax/transform failures, and production top-level exceptions surface as their real Jest failures.

`tests/phase4-review2/phase4Review2Fixtures.ts` is test-only infrastructure included in the lock. It provides inspectable direct and persistent stores, valid task builders, exact envelope/raw construction, outcome capture, and the finite microtask sentinel. It contains no production repository, validation, lock, persistence, or reentrancy implementation.

There is no skipped, focused, pending, or snapshot-only test; no real-time wait, `setTimeout`, `setInterval`, fake network, open platform handle, TypeScript suppression, or explicit `any`.

## Locked coverage and counts

| Finding | Locked suite | Tests |
|---|---|---:|
| Same-repository create/update/softDelete/transaction reentrancy plus legal transaction recovery | `tests/phase4-review2/transactionReentrancy.regression.test.ts` | 5 |
| Representative direct raw-array bypass rejection plus Review-1/cancelled/deleted controls | `tests/phase4-review2/directSnapshotBoundary.regression.test.ts` | 11 |
| Public create/update/transaction plain-data-only atomicity plus legal plain transaction | `tests/phase4-review2/plainDataMutationAtomicity.regression.test.ts` | 7 |
| Lifecycle/timestamp/safe-score invalid and legal matrix at both hydration boundaries | `tests/phase4-review2/lifecycleInvariantMatrix.regression.test.ts` | 12 |

The candidate contains **4 suites / 35 tests**, plus one locked helper file.

## Recorded pre-fix baseline

Recorded on 2026-08-04 against the current Phase 4 hardening production candidate, before any repair for these findings:

- `tests/phase4-review2`: **4 suites executed, 35 tests discovered, 27 failed and 8 passed**;
- transaction reentrancy: 4 failed and one passed; every reentrant case returned `microtask-budget-exceeded` rather than timing out, while the legal transaction passed;
- direct storage boundary: eight invalid samples failed because they hydrated, while all three compatibility/legal controls passed;
- public plain-data mutation atomicity: all six unsafe-value mutations failed because they fulfilled and/or wrote normalized durable data, while the legal plain transaction passed;
- lifecycle matrix: all nine invalid samples failed because both hydration boundaries fulfilled, while all three legal controls passed;
- the complete candidate command exited normally in 18.4 seconds in the managed Windows environment; the isolated reentrancy suite reported each red test body in 3-25 ms and its legal control green;
- there was no Jest timeout, real-time wait, unresolved test gate, unhandled rejection, console/React warning, open-handle symptom, module-load disguise, transform failure, skip/focus/pending marker, or test discovery mismatch;
- `tsc --noEmit` passes with the candidate present.

The 27 red tests are product-defect evidence. The eight green tests are deliberate compatibility and legal-operation controls.

## Repair acceptance

No repair agent receives this candidate until a new independent test reviewer approves its format, scope, implementability, coverage, deterministic termination, and manifest, and until the controlled prior-fixture corrections described above pass their own independent audits.

After that gate, production repair acceptance requires all of the following without changing this lock:

1. Phase 4 Hardening Review 2 is 4 suites / 35 tests green.
2. The seven prior formal test roots are 24 suites / 218 tests green: `tests/locked`, `tests/review1`, `tests/review2`, `tests/review3`, `tests/phase4`, `tests/phase4-review`, and `tests/review4`.
3. The unified formal-plus-new run is 28 suites / 253 tests green.
4. `tsc --noEmit` is green.
5. `TEST_LOCK.sha256`, `REVIEW1_LOCK.sha256`, `REVIEW2_LOCK.sha256`, `REVIEW3_LOCK.sha256`, `PHASE4_LOCK.sha256`, `PHASE4_REVIEW_LOCK.sha256`, `REVIEW4_LOCK.sha256`, and this manifest verify with zero drift.
6. A brand-new independent code reviewer, with no overlap with the test author or repair agent, approves the production changes, all test evidence, and the no-drift evidence.

Any repair failure returns to a production repair agent and then repeats the full independent review. Tests remain locked.

## Canonical commands

From the `outputs/start-five` project root with the project's pinned Node/pnpm runtime on `PATH`:

```powershell
pnpm exec jest --runInBand --ci --coverage=false --roots tests/phase4-review2
pnpm exec jest --runInBand --ci --coverage=false --roots tests/locked tests/review1 tests/review2 tests/review3 tests/phase4 tests/phase4-review tests/review4
pnpm exec jest --runInBand --ci --coverage=false --roots tests/locked tests/review1 tests/review2 tests/review3 tests/phase4 tests/phase4-review tests/review4 tests/phase4-review2
pnpm exec tsc --noEmit
```

The isolated diagnostic command for the non-hanging reentrancy evidence is:

```powershell
pnpm exec jest --runInBand --ci --coverage=false --roots tests/phase4-review2 --runTestsByPath tests/phase4-review2/transactionReentrancy.regression.test.ts
```

## Lock construction and verification

`PHASE4_REVIEW2_LOCK.sha256` is generated last. It lists this specification first, followed by every regular file recursively below `tests/phase4-review2/`, sorted by POSIX-style relative path. The manifest does not include itself.

Each line is exactly:

```text
<lowercase SHA-256><two spaces><POSIX relative path>
```

Verification recomputes SHA-256 for every listed path and compares it with the first field. The manifest's own independent identity is the lowercase SHA-256 of `PHASE4_REVIEW2_LOCK.sha256`. Any mismatch is lock drift and blocks repair or delivery.
