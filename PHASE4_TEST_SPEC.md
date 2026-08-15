# Phase 4 locked test specification: durable local state and app composition

## Status and immutability

This is the test-first contract for the P0 phase “real local persistence + application startup composition root”. The production modules named below do not exist at authoring time. The candidate tests deliberately fail with `PHASE4_IMPLEMENTATION_REQUIRED` until those modules are implemented, while the test sources themselves remain TypeScript-compilable and Jest-executable.

After `PHASE4_LOCK.sha256` is generated and independently accepted, this specification and every regular file under `tests/phase4/` are immutable. A repair agent may change production code only; it must not edit, skip, focus, weaken, regenerate, or replace any Phase 4 assertion.

## Rejected candidate and review revision

The first candidate manifest, SHA-256 `fabda42f4ec9724f353e18d8cd3ce369097565589cb81e01112a401932dafc65`, was rejected by independent test review and is not an accepted lock. This revision supersedes it and makes the following review-required changes:

- the dynamic contract loader wraps only `MODULE_NOT_FOUND` for the exact requested target module, while nested dependency failures, syntax errors, and arbitrary top-level exceptions are rethrown with object identity preserved;
- read/write backend failures assert stable `code`, stable `message`, and exact `cause` identity;
- every corrupt, unsupported, invalid, or failed snapshot path asserts that the old raw value remains byte-for-byte unchanged and that no delete or unintended write occurs;
- the round-trip corpus includes a soft-deleted task restored through `includeDeleted`;
- bookkeeping isolation covers paths across the complete `src` tree and content of every text source/config file under it, case-insensitively;
- composition tests prove the injected `now` and `idGenerator` determine a real created task.

Only the Phase 4 specification, Phase 4 tests/fixtures, and Phase 4 manifest are revised. Production code, dependency/configuration files, prior locks/tests, native tests, and the bookkeeping project remain outside this amendment.

The authoritative product requirements are taken from `app需求分析.docx`, especially:

- guest mode must provide the complete basic flow;
- basic features must remain usable offline;
- critical task data must be saved locally and must not be easily lost;
- MVP includes local task data persistence and later account synchronization;
- task data includes quadrant inputs, lifecycle status, timestamps, scores, and child steps;
- the new Start Five app must remain isolated from the existing bookkeeping app.

## Production-facing contract

### 1. Versioned persistent task storage

Production provides `src/data/persistentTaskStorage.ts` with:

```ts
createPersistentTaskStorage(backend: AsyncKeyValueBackend): KeyValueStorage
```

`AsyncKeyValueBackend` is the minimal injected contract implemented by React Native AsyncStorage or an equivalent platform adapter later:

```ts
type AsyncKeyValueBackend = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
```

No AsyncStorage package is required by this locked suite and `package.json` must not be changed by the test-authoring stage. Tests use only `InspectableAsyncKeyValueBackend`, a deterministic test double included in the Phase 4 lock.

The durable value stored at `start-five.tasks.v1` is one JSON document with this externally stable envelope:

```json
{
  "schema": "start-five.tasks",
  "version": 1,
  "tasks": []
}
```

The adapter translates between that envelope and the raw task-array string expected by the existing `createTaskRepository`. A missing backend value maps to the repository’s empty snapshot (`null`), without a hydration write.

The following failures are stable error contracts. Each error exposes the listed `code`. Backend read/write errors expose `message` equal to their stable code and retain the original thrown value by exact identity as `cause`:

| Condition | Error code |
|---|---|
| Stored text is not valid JSON | `TASK_SNAPSHOT_CORRUPT` |
| Schema identifier or version is unsupported | `TASK_SNAPSHOT_UNSUPPORTED` |
| Inbound or outbound task structure is invalid | `TASK_SNAPSHOT_INVALID` |
| Backend `getItem` rejects | `TASK_STORAGE_READ_FAILED` |
| Backend `setItem` rejects | `TASK_STORAGE_WRITE_FAILED` |

Invalid or unsupported snapshots are never rewritten, downgraded, converted to an empty list, or turned into invented tasks. Their raw backend value remains byte-for-byte unchanged and neither `setItem` nor `removeItem` is invoked. A failed hydration is retryable after the backend value is corrected.

Each successful repository commit performs one `setItem` on the target key. It must not delete the old key before replacement, publish in-memory data before the backend commit succeeds, or leave a temporary/partial snapshot observable through the injected abstraction.

### 2. Application startup composition root

Production provides `src/app/startFiveApp.tsx` with:

```ts
createStartFiveApp({
  storageBackend,
  now,
  idGenerator,
  network?,
}): {
  repository: TaskRepository;
  service: CoreAppService;
  AppRoot: React.ComponentType;
}
```

One call creates exactly one persistent storage adapter, one repository, and one core service. `AppRoot` injects that same service into `CoreFlowScreen`; repeated root renders do not create independent repositories or competing hydration state. The exposed repository and service are intentional composition diagnostics and native-entry integration points.

Rendering `AppRoot` starts local hydration through the existing `CoreFlowScreen`/`CoreAppService.getState` contract. Persisted guest tasks become visible without authentication. Data created through the composed service is immediately visible through the exposed repository and is recoverable by a later composition over the same backend. The supplied `now` and `idGenerator` functions are forwarded to the shared core service and determine the timestamps and identity of a real mutation.

Startup and hydration do not call an injected network adapter or global `fetch`. No file path anywhere in the production `src` tree, and no content in a text source/config file under `src`, may reference `qingji-ai`, bookkeeping code, or the existing bookkeeping project. The scan is case-insensitive, recognizes common slash/separator forms, and deliberately avoids broad terms such as `account` that would create false positives.

### 3. Test-only dynamic loader safety

Because the two production modules are absent at test-authoring time, tests dynamically load them. `requirePhase4Module` converts an error to `PHASE4_IMPLEMENTATION_REQUIRED` only when all of the following are true: the error code is `MODULE_NOT_FOUND`, the first message line identifies the exact requested module, and that module is the production contract target. A missing nested dependency, syntax failure, or arbitrary top-level exception is rethrown unchanged. `tests/phase4/phase4Fixtures.invariant.test.ts` proves both the narrow wrapping rule and object-identity preservation.

## Locked coverage

### `tests/phase4/persistentTaskStorage.contract.test.ts`

1. Full round-trip across new adapter and repository instances, preserving all four quadrant flag combinations, pending/in-progress/completed/cancelled task states, timestamps, score fields, child-step fields, and a non-empty `deletedAt` restored with `includeDeleted`.
2. Empty backend hydration returns an empty list and performs no write.
3. Malformed JSON rejects safely, leaves raw data byte-for-byte unchanged with no write/delete, and permits retry after external correction.
4. Foreign schema rejects with raw data unchanged and no write/delete.
5. Future version rejects with raw data unchanged and no write/delete or downgrade.
6. Structurally invalid task data never enters repository state and leaves raw data unchanged with no write/delete.
7. Backend read failures expose stable code/message plus exact cause identity, preserve an existing raw snapshot, and perform no write/delete.
8. Backend write failures expose stable code/message plus exact cause identity and preserve durable plus already-visible state.
9. Successful mutation is one target-key set with no delete-then-replace sequence.
10. Two invalid outbound strings are each rejected before a backend write/delete attempt and each preserves an existing valid snapshot byte-for-byte.
11. The test backend’s own failed-write behavior is self-checked independently of missing production code.

### `tests/phase4/startFiveApp.contract.test.tsx`

1. A durable guest task hydrates and renders through `AppRoot`.
2. Repeated root renders use the exact shared service/repository and one cached hydration state.
3. Service mutation, exposed repository, rendered root, and a later app composition observe one durable state.
4. Injected `now` and `idGenerator` are actually used by a real service mutation and determine its timestamps/ID.
5. Local startup/hydration invokes neither the injected network adapter nor global `fetch`.
6. Corrupt hydration is a stable service failure and does not invent a UI task.
7. The entire production `src` tree is free of case/path variants of bookkeeping-project references without scanning the tests' own assertion strings.

### `tests/phase4/phase4Fixtures.invariant.test.ts`

1. Exact requested-target `MODULE_NOT_FOUND` is converted to the explicit missing-implementation failure.
2. Nested dependency `MODULE_NOT_FOUND`, `SyntaxError`, and arbitrary top-level exceptions are rethrown with exact object identity.

`tests/phase4/phase4Fixtures.ts` is test-only infrastructure and is part of the lock. It imports types only from existing production contracts, performs no network or filesystem mutation, and contains no production implementation.

## Acceptance rules

1. The revised Phase 4 suite has 3 suites / 20 tests: 17 production-facing checks and three test-helper invariants.
2. Recorded revised pre-repair baseline on 2026-08-04: 3 suites executed, 20 tests discovered, 16 failures caused only by the two missing production modules, and four green checks (three helper invariants plus the production-tree isolation scan). There was no test syntax/transform failure, skipped/focused/pending test, real-time wait, TypeScript suppression, or explicit `any`.
3. Recorded existing-suite baseline on 2026-08-04: 16 suites / 138 tests green across `tests/locked`, `tests/review1`, `tests/review2`, and `tests/review3`.
4. Recorded type baseline on 2026-08-04: `tsc --noEmit` is green. The Phase 4 test sources typecheck even though their dynamically loaded production modules are absent.
5. After repair, Phase 4 must be 20/20 green, all previous 138 tests must remain green, unified tests must be green, typecheck must be green, and all five lock manifests must verify with zero drift.
6. The same independent test reviewer that rejected the first candidate must approve this revision before any repair agent receives it.

## Canonical commands

From the `outputs/start-five` project root, with the repository’s pinned Node/pnpm runtime on `PATH`:

```powershell
pnpm exec jest --runInBand --ci --coverage=false --roots tests/phase4
pnpm exec jest --runInBand --ci --coverage=false --roots tests/locked tests/review1 tests/review2 tests/review3
pnpm exec tsc --noEmit
```

## Lock construction and verification

`PHASE4_LOCK.sha256` is generated last. It lists this specification followed by every regular file recursively under `tests/phase4/`, sorted by POSIX-style relative path. The manifest does not include itself.

Each line is exactly:

```text
<lowercase SHA-256><two spaces><POSIX relative path>
```

Verification recomputes SHA-256 for every listed path and compares it with the first field. The manifest’s own independent identity is obtained with:

```powershell
(Get-FileHash -Algorithm SHA256 PHASE4_LOCK.sha256).Hash.ToLowerInvariant()
```

Any mismatch is lock drift and blocks repair or delivery until independently investigated. The manifest itself must never be silently regenerated after acceptance.
