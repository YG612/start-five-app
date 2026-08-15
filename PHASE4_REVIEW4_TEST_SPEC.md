# Phase 4 hardening review 4 locked-test specification

## Status, scope, and immutability

Status: **CANDIDATE, pending a brand-new independent test review.** This test-first candidate covers the lock-external P2 found by the independent Hardening 3 code review: public task/patch inputs can pass plain-data descriptor introspection and then throw a caller-controlled exception when repository mutation code performs an ordinary property read.

This candidate adds only this specification, `tests/phase4-review4/**`, and `PHASE4_REVIEW4_LOCK.sha256`. It does not modify production code, configuration, dependencies, package metadata, native artifacts, any accepted test/specification/manifest, or the separate `qingji-ai` project.

After a new independent reviewer accepts the candidate, this specification and every regular file recursively below `tests/phase4-review4/` are immutable. A production repair agent may not edit, regenerate, skip, focus, weaken, replace, or selectively omit them. This test author must not implement the repair or perform final code review.

The contract supplements all earlier repository, persistence, transaction, native, and quality locks. It does not replace or weaken them.

## Defect boundary

`assertPlainJsonData` safely examines prototypes, own keys, and property descriptors without executing ordinary property reads on the aggregate or patch Proxy. Current mutation code subsequently reads the same caller object outside that protected introspection boundary:

- `createIn` reads `task.status` and `task.startedAt` through legacy normalization;
- `updateIn` spreads the already-validated patch, which reads its property values.

A Proxy can therefore be fully transparent to every prototype/key/descriptor operation and throw `CALLER_CONTROLLED_PROXY_GET` only when an ordinary `get('status')` or `get('title')` occurs. Current production leaks that caller-controlled error unchanged instead of returning the stable public invalid-snapshot error.

## Production-facing contract

### A. Facade create and update map caller materialization failures

Facade `create` receives a valid pending task behind a transparent-introspection Proxy. Prototype lookup, own-key enumeration, and every descriptor lookup return exactly the target's ordinary results. The subsequent ordinary `status` read throws a caller-controlled `Error` whose message is `CALLER_CONTROLLED_PROXY_GET`.

Facade `update` receives an otherwise valid `{title, updatedAt}` patch behind the same kind of Proxy. Descriptor validation succeeds; the subsequent patch-value read for `title` throws the caller-controlled error.

Both facade operations must reject with `code` and `message` exactly equal to:

```text
TASK_SNAPSHOT_INVALID
```

For each rejection:

- the trap audit proves descriptor-style introspection occurred and the named ordinary get actually threw;
- there is no durable set/delete attempt;
- original durable bytes, repository cache, and a fresh backend/repository view remain equal;
- the mutation queue remains usable and one later ordinary create/update commits successfully.

Tests do not assert a trap-call count or require a particular repair implementation. They only assert that both relevant observable phases occurred.

### B. Transaction-surface create and update have the same input boundary

The same task `status` and patch `title` Proxies are exercised through transaction-surface `create` and `update`.

The outer transaction rejects with `TASK_SNAPSHOT_INVALID`, rolls back completely, performs zero set/delete attempts, and does not publish a staged cache value. A fresh reload still sees the original durable task. A subsequent legal transaction commits exactly once, proving callback activity, surface expiry, and the shared mutation queue were restored after the input error.

This is not a duplicate facade-only assertion: transaction-surface methods execute the shared mutation helpers without entering the facade queue again, so their public error boundary must be locked independently.

### C. Error mapping is narrow and preserves storage failures

The repair must normalize caller-input materialization/introspection failures, not every exception in the repository operation.

Two controls lock existing storage semantics:

- a backend `getItem` exception remains `code/message === TASK_STORAGE_READ_FAILED`; hydration is retryable after the one-shot failure;
- a backend `setItem` exception remains `code/message === TASK_STORAGE_WRITE_FAILED`; durable bytes and committed cache remain unchanged, then a later legal write succeeds.

Neither may be rewritten to `TASK_SNAPSHOT_INVALID`. This constrains any new catch boundary to caller-supplied task/patch materialization and validation, excluding storage I/O and commit failures.

### D. Ordinary inputs and a non-throwing transparent Proxy remain legal

A one-shot ordinary object-literal task must still create successfully without input mutation. A non-throwing transparent Proxy around an ordinary update patch must also remain usable and commit normally.

This prevents the repair from solving the defect by rejecting every Proxy identity or every valid ordinary input. The public contract remains behavioral: values that can be materialized as stable plain data are accepted; caller behavior that throws during materialization is normalized to the invalid-snapshot error.

## Fixture validity without read-count tricks

`tests/phase4-review4/proxyFixture.invariant.test.ts` independently proves the hostile fixture:

1. `Object.getPrototypeOf`, `Reflect.ownKeys`, and all descriptor reads match the ordinary target;
2. none of those operations triggers the hostile ordinary get;
3. a later `Reflect.get(proxy, 'status')` throws exactly `CALLER_CONTROLLED_PROXY_GET`;
4. the audit records introspection before that explicit ordinary get.

The Proxy handler forwards all introspection via `Reflect` and maintains only an event audit. It does not switch behavior after an arbitrary number of reads and tests never depend on a microtask budget, timer, engine-specific enumeration count, or repeated getter side effect.

## Test infrastructure and exact production imports

The regression suites statically import the exact production modules they exercise:

- `src/data/taskRepository.ts`;
- `src/data/persistentTaskStorage.ts`;
- `src/domain/task.ts` for types only.

There is no dynamic loader or catch-and-relabel import wrapper. Module, transform, syntax, and top-level production failures surface directly.

`tests/phase4-review4/phase4Review4Fixtures.ts` is locked test-only infrastructure. It provides valid task/envelope builders, a controlled backend with separate write-attempt/commit observations, outcome summaries, transparent/hostile Proxy constructors, and trap audit events. It contains no repository, persistence, validation, transaction, or repair implementation.

There is no skipped/focused/pending or snapshot-only test, timer, fake network, platform handle, increased Jest timeout, TypeScript suppression, explicit `any`, or unresolved deferred.

## Locked coverage and counts

| Contract | Locked suite | Tests |
|---|---|---:|
| Hostile Proxy descriptor/get phase validity | `tests/phase4-review4/proxyFixture.invariant.test.ts` | 1 |
| Facade create/update stable mapping, atomicity, and recovery | `tests/phase4-review4/facadeMaterialization.regression.test.ts` | 2 |
| Transaction-surface create/update stable mapping, rollback, and recovery | `tests/phase4-review4/transactionMaterialization.regression.test.ts` | 2 |
| Backend read/write error preservation and legal ordinary/Proxy inputs | `tests/phase4-review4/storageErrorBoundaryAndControls.regression.test.ts` | 3 |

The candidate contains **4 suites / 8 tests**, plus one locked helper file.

## Recorded pre-fix baseline

Recorded on 2026-08-05 against the production candidate that passed Hardening 3 tests but preceded this P2 repair:

- `tests/phase4-review4` with `--detectOpenHandles`: **4 suites executed, 8 tests discovered, 4 failed and 4 passed**;
- facade create/update: two red because both leaked `code === undefined` and message `CALLER_CONTROLLED_PROXY_GET`;
- transaction-surface create/update: two red for the same leaked caller error;
- fixture invariant, backend read/write preservation, and ordinary/transparent-Proxy controls: four green;
- the run exited normally in 18.947 seconds with no timeout, unhandled rejection, open-handle warning, discovery mismatch, or transform/import failure.

The four red tests are precise product-defect evidence. The four green tests prevent an over-broad catch or blanket Proxy rejection.

## Recorded unaffected-regression baseline

Also recorded on 2026-08-05, before any repair for this candidate:

- the original formal roots, Hardening 3, Native Scaffold, and Native Final Review completed **41 suites / 312 tests green** in 40.072 seconds;
- `tsc --noEmit` exited successfully with no diagnostics;
- the candidate baseline and prior regression runs both terminated normally, so no Jest worker or application handle remained open.

## Repair acceptance

No repair agent receives this candidate until a brand-new independent reviewer approves fixture validity, scope, implementability, coverage, prior-lock consistency, exact counts, and manifest.

After acceptance, repair requires all of the following without changing this lock:

1. Phase 4 Hardening Review 4: 4 suites / 8 tests green.
2. The original eight formal roots: 28 suites / 253 tests green.
3. Phase 4 Hardening Review 3: 5 suites / 18 tests green.
4. Native Scaffold: 6 suites / 29 tests green.
5. Native Final Review: 2 suites / 12 tests green.
6. Original formal + Hardening 3 + both accepted native roots remain 41 suites / 312 tests green.
7. Adding this candidate produces 45 suites / 320 tests green.
8. `tsc --noEmit` is green.
9. Every applicable accepted manifest and this manifest verify with zero drift.
10. A brand-new independent code reviewer, with no overlap with this test author or production repair agent, approves implementation and evidence.

Any repair failure returns to production repair and repeats independent code review. Tests remain locked.

## Canonical commands

From `outputs/start-five` with the pinned Node/pnpm runtime on `PATH`:

```powershell
pnpm exec jest --runInBand --ci --coverage=false --roots tests/phase4-review4
pnpm exec jest --runInBand --ci --coverage=false --detectOpenHandles --roots tests/phase4-review4
pnpm exec jest --runInBand --ci --coverage=false --roots tests/locked tests/review1 tests/review2 tests/review3 tests/phase4 tests/phase4-review tests/review4 tests/phase4-review2 tests/phase4-review3 tests/native-scaffold tests/native-review
pnpm exec jest --runInBand --ci --coverage=false --roots tests/locked tests/review1 tests/review2 tests/review3 tests/phase4 tests/phase4-review tests/review4 tests/phase4-review2 tests/phase4-review3 tests/native-scaffold tests/native-review tests/phase4-review4
pnpm exec tsc --noEmit
```

## Lock construction and verification

`PHASE4_REVIEW4_LOCK.sha256` is generated last. It lists this specification first, followed by every regular file recursively below `tests/phase4-review4/`, sorted by POSIX-style relative path. The manifest does not include itself.

Each line is exactly:

```text
<lowercase SHA-256><two spaces><POSIX relative path>
```

The manifest's own independent identity is the lowercase SHA-256 of `PHASE4_REVIEW4_LOCK.sha256`. Any mismatch is lock drift and blocks repair or delivery.
