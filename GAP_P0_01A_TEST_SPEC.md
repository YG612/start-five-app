# GAP-P0-01A-A1 API/type foundation locked-test specification

## Status, rejected-candidate revocation, and role separation

Status: **THIRD REVISED A1 CANDIDATE, pending a brand-new independent test review.**

The immediately preceding second revised A1 candidate is rejected. Its
manifest identity

```text
d071230c7fa2ac127f7ea3a36b011c85b18853cebdb3164d3b13503b6c2719f6
```

is permanently revoked because its recorded six-red baseline was contradicted
by one remaining reference to five reds, and its runtime surface constants
still contained two TypeScript `as const` assertions despite the intended
assertion-free runtime scan. It must not be used for implementation, review,
evidence, or delivery. This consistency correction does not change any test
assertion or production-facing contract.

The earlier revised A1 candidate is also rejected. Its manifest identity

```text
aa088367b84fe14505b6bf2fcc11ee09ee2c80d51e782aa92e40e6c16fd6fdd8
```

is permanently revoked because its quadrant contract proved only a TypeScript
export and did not independently prove a real runtime export. It must not be
used for implementation, review, evidence, or delivery.

The former monolithic GAP-P0-01A candidate is rejected. Its manifest identity

```text
976b6672b90aac562c03e1f4efcb7eca80fec2bd5bac587b9e85bab1682be8fc
```

is permanently revoked and must not be used for implementation, review, evidence, or delivery. Its behavior suites and helper were removed rather than weakened or carried forward.

This replacement deliberately splits the work into two stages:

- **A1 (this candidate):** public TypeScript fields, public lifecycle/quadrant types, minimal factory/service and quadrant-export runtime shape, and legacy compatibility only;
- **A2 (not yet authored):** domain, repository, lifecycle, recommendation, quadrant, concurrency, persistence, idempotency, and failure behavior.

No production implementation is authorized until a new independent reviewer accepts this A1 candidate and its new manifest. The A1 test author must not implement the skeleton or perform its final code review. After acceptance, this specification and every regular file recursively below `tests/gap-p0-01a/` are immutable.

The revised candidate changes only this specification and `tests/gap-p0-01a/**`; only its own `GAP_P0_01A_LOCK.sha256` is regenerated last. It does not modify production, package/dependency/configuration files, prior tests/specifications/manifests, native artifacts, other active candidates, or `outputs/qingji-ai`.

## A1 boundary: public foundation, not business behavior

A conforming A1 repair may add the required public fields, types, exports, factory, service object, and projection signature. The lifecycle methods and `projectTaskQuadrants` may remain behavior stubs. When invoked before A2, a stub may synchronously throw or return a rejected promise carrying stable `code` and `message`:

```text
TASK_LIFECYCLE_NOT_IMPLEMENTED
```

The A1 tests never invoke a lifecycle or projection method. They require only that the lifecycle factory itself is constructable and returns the exact method surface, and that the real quadrant module owns a callable projection export. A1 therefore cannot be mistaken for CRUD, recommendation, projection, concurrency, or persistence completion.

## Production-facing TypeScript contract

### A. Additive optional planning fields

Both exported public types in `src/domain/task.ts` add these exact optional properties:

```ts
type PlanningFields = {
  scheduledStartAt?: string | null;
  estimatedMinutes?: number | null;
  firstStep?: string | null;
};
```

They are added to both `Task` and `TaskInput`. They are optional, not required and not `unknown`. The original `Task`/`TaskInput` members remain unchanged.

The compiler contract proves all of the following against the actual production exports:

- `Pick<Task, keyof PlanningFields>` is exactly `PlanningFields`;
- `Pick<TaskInput, keyof PlanningFields>` is exactly `PlanningFields`;
- an original legacy `TaskInput` object without the new properties compiles;
- an original complete legacy `Task` object without the new properties compiles;
- legal extended objects compile;
- number-valued `scheduledStartAt`, string-valued `estimatedMinutes`, and number-valued `firstStep` each fail with TypeScript type diagnostic `TS2322`.

The negative cases are compiled inside the test at runtime. They do not use `@ts-expect-error`, suppression, a local `ExtendedTask`, declaration merging, a shadow production module, `as unknown`, or another cast that could make the main project typecheck falsely green.

### B. Public quadrant result foundation

`src/domain/quadrant.ts` exports:

```ts
export type TaskQuadrantBucket<Q extends Quadrant> = {
  quadrant: Q;
  position: (typeof QUADRANT_POSITION)[Q];
  totalCount: number;
  preview: Task[];
  allTasks: Task[];
};

export type TaskQuadrantProjection = readonly [
  TaskQuadrantBucket<'Q1'>,
  TaskQuadrantBucket<'Q2'>,
  TaskQuadrantBucket<'Q3'>,
  TaskQuadrantBucket<'Q4'>,
];

export function projectTaskQuadrants(
  tasks: readonly Task[],
): TaskQuadrantProjection;
```

The tuple fixes Q1-Q4 order and the public `totalCount`/`preview`/`allTasks` source shapes. A1 asserts only exact public types and function signature. A separate non-behavior runtime gate statically loads the real `src/domain/quadrant` module namespace, proves that it owns `projectTaskQuadrants`, and proves that `Reflect.get` returns a function. It does not call the function or assert mapping, filtering, sort, cap, cloning, or mutation behavior. The gate uses neither a local replacement module nor a cast of the reflected value into a desired production type.

### C. Public lifecycle inputs, options, query result, service, and factory

`src/application/coreAppService.ts` exports the following additive public foundation. Equivalent aliases are not sufficient because stable public export names are part of the contract.

```ts
export type TaskLifecycleTaskInput = {
  title: string;
  description?: string;
  important: boolean;
  urgent: boolean;
  startAt?: string | null;
  scheduledStartAt?: string | null;
  dueAt?: string | null;
  estimatedMinutes?: number | null;
  firstStep?: string | null;
};

export type TaskLifecycleTaskPatch = Partial<
  Pick<
    Task,
    | 'title'
    | 'description'
    | 'important'
    | 'urgent'
    | 'startAt'
    | 'scheduledStartAt'
    | 'dueAt'
    | 'estimatedMinutes'
    | 'firstStep'
  >
>;

export type TaskLifecycleReadOptions = {includeDeleted?: boolean};
export type TaskLifecycleOperationOptions = {operationId: string};
export type TaskLifecycleRescheduleInput = {
  scheduledStartAt: string | null;
  dueAt?: string | null;
};
export type TaskLifecycleDelayInput = {minutes: number};

export type TaskLifecycleQueryResult = {
  tasks: Task[];
  recommendation: Task | null;
  quadrants: TaskQuadrantProjection;
};

export type CreateTaskLifecycleServiceOptions = {
  repository: TaskRepository;
  now(): string;
  idGenerator(): string;
};

export type TaskLifecycleService = {
  create(
    input: TaskLifecycleTaskInput,
    operation: TaskLifecycleOperationOptions,
  ): Promise<Task>;
  getById(
    taskId: string,
    options?: TaskLifecycleReadOptions,
  ): Promise<Task | null>;
  list(options?: TaskLifecycleReadOptions): Promise<Task[]>;
  update(
    taskId: string,
    patch: TaskLifecycleTaskPatch,
    operation: TaskLifecycleOperationOptions,
  ): Promise<Task>;
  softDelete(
    taskId: string,
    operation: TaskLifecycleOperationOptions,
  ): Promise<Task>;
  complete(
    taskId: string,
    operation: TaskLifecycleOperationOptions,
  ): Promise<{task: Task; points: number}>;
  reschedule(
    taskId: string,
    input: TaskLifecycleRescheduleInput,
    operation: TaskLifecycleOperationOptions,
  ): Promise<Task>;
  delay(
    taskId: string,
    input: TaskLifecycleDelayInput,
    operation: TaskLifecycleOperationOptions,
  ): Promise<Task>;
  getRecommendation(): Promise<Task | null>;
  getQuadrantProjection(): Promise<TaskQuadrantProjection>;
  getQueryResult(): Promise<TaskLifecycleQueryResult>;
};

export function createTaskLifecycleService(
  options: CreateTaskLifecycleServiceOptions,
): TaskLifecycleService;
```

The in-memory compiler contract asserts exact mutual type equality for every exported type and the factory. It uses the actual production `Task`, `TaskRepository`, and `TaskQuadrantProjection`, not local replacement aggregate types.

### D. Legacy core surface remains exact

`CoreAppService` and the object returned by `createCoreAppService` retain exactly these seven methods:

```text
addFirstStep
chooseRecommended
createTask
finishStep
finishTask
getState
startRecommended
```

The A1 suite checks both the exported public type and exact runtime own enumerable keys. The new lifecycle factory is a separate named export; it does not add a required member to legacy `CoreAppService` or a method to the legacy service object.

## Runtime surface contract

A single runtime lifecycle test statically loads the existing `coreAppService` module, verifies that `createTaskLifecycleService` is its own export, calls the factory with a real `TaskRepository` plus deterministic clock/ID dependencies, and verifies that the returned plain object owns exactly these callable enumerable keys:

```text
complete
create
delay
getById
getQuadrantProjection
getQueryResult
getRecommendation
list
reschedule
softDelete
update
```

No lifecycle method is called. There are no behavior tests guarded by this export, so one absent export produces one runtime red instead of a cascade of false behavior failures.

A separate runtime test statically loads `src/domain/quadrant` through its real module namespace and checks `Object.prototype.hasOwnProperty.call(namespace, 'projectTaskQuadrants')` plus `typeof Reflect.get(namespace, 'projectTaskQuadrants') === 'function'`. It never invokes that function. The test contains no Jest module replacement, local fake module, or `unknown`/production-signature cast, and therefore cannot pass by type-only declaration or by locking any A2 projection behavior.

The reflective runtime check stores the untyped missing export in an `unknown` variable and narrows it with `typeof`; it does not cast that value into the production service type and is not used for any TypeScript public-contract assertion.

## In-memory compiler harness

`tests/gap-p0-01a/inMemoryTypecheck.ts` loads the installed TypeScript compiler API and creates an in-memory `CompilerHost` overlay for one virtual contract source. All non-virtual files and module resolution delegate to the real filesystem/compiler host, so imports resolve to the actual production sources.

Compiler options include `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noEmit`, and no ambient `types`. Only error diagnostics are returned. The host counts attempted writes and the invariant suite requires zero.

Two green self-controls prove the harness:

- accepts a valid equality proof with no diagnostics and no emitted file;
- reports exact `TS2322` for a known invalid `string = number` assignment.

The main `tsc --noEmit` remains green because deliberate negative snippets exist only as strings compiled by the isolated runtime program.

## Explicit A2 deferral

A1 acceptance or skeleton repair does **not** authorize product delivery. A2 may be authored only after A1 tests are independently accepted, the minimal skeleton passes unchanged A1, and a new independent code reviewer approves that skeleton.

A2 must restore full behavior coverage without modifying A1. At minimum it must cover:

- create/get/list/update/soft delete/complete/reschedule/delay and immediate recommendation/quadrant refresh;
- operation-ID replay and fingerprint conflict for every mutation;
- missing-ID errors and illegal tombstone mutations;
- storage-set failure atomicity and recovery;
- advancing-clock idempotency that preserves the first delete/complete/award timestamps;
- deep clone/no-alias behavior for aggregates, arrays, and nested subtasks;
- complete orthogonal quadrant ordering and deterministic tie-break coverage;
- single-field/default extended creation and update;
- legacy/new start alias equality, conflict, and null clearing;
- null, zero, negative zero, negative, fractional, `NaN`, infinity, and unsafe-integer duration/delay boundaries;
- barrier-controlled shared-facade concurrency, no lost update, stable IDs, and ID-collision behavior;
- truly fresh persistence restart consistency.

No A2 test may be replaced by an implementation stub or inferred from A1 type success.

## Locked infrastructure, coverage, and counts

The revised candidate contains no old behavior fixture or behavior suite.

| Contract | Locked suite | Tests |
|---|---|---:|
| Real compiler positive/negative/no-emit self-controls | `tests/gap-p0-01a/inMemoryTypecheck.invariant.test.ts` | 2 |
| Task fields, illegal public types, legacy core type, lifecycle public API, quadrant public API | `tests/gap-p0-01a/publicTypeFoundation.contract.test.ts` | 5 |
| Quadrant runtime export, one lifecycle factory/exact-method runtime contract, and legacy runtime surface | `tests/gap-p0-01a/runtimeSurface.contract.test.ts` | 3 |

The A1 candidate contains **3 suites / 10 tests**, plus one locked compiler helper.

There is no skipped, focused, pending, or snapshot-only test; no timer, interval, network, unresolved gate, platform handle, increased timeout, TypeScript suppression, explicit `any`, local production-type shadow, or filesystem write.

## Recorded A1 pre-fix baseline

Recorded on 2026-08-05 against production before any A1 skeleton repair:

- complete A1 candidate with `--detectOpenHandles`: **3 suites executed, 10 tests discovered, 6 failed and 4 passed**;
- public field positive: red with missing-key/object-property diagnostics;
- public field negative: red because absent fields report `TS2353`, while correctly declared wrong types must report `TS2322`;
- lifecycle public API: one red with missing-export and exact-type diagnostics;
- quadrant public API: one red with missing-export and exact-type diagnostics;
- quadrant runtime export: one red because the real module namespace does not own a callable `projectTaskQuadrants` export;
- runtime lifecycle surface: one red because the additive factory export is absent;
- compiler positive/negative controls, legacy core public type, and legacy core runtime surface: four green;
- the run exited normally in 11.989 seconds with no Jest timeout, open-handle warning, transform failure, or discovery mismatch;
- main `tsc --noEmit` was green with no rejected-suite dangling import.

The six red tests are precise A1 foundation gaps. The four green tests prove the compiler oracle and legacy compatibility.

## Authoring-time compatibility evidence

Before constructing the replacement manifest, the A1 author recorded:

- eight prior formal roots: **28 suites / 253 tests green**;
- formal native-scaffold root: **6 suites / 29 tests green**;
- Phase 4 Review3 root: **5 suites / 18 tests green**;
- main `tsc --noEmit`: green;
- A1 inventory: four regular files, ten discovered tests, and zero skip/focus/todo, timer/interval, TypeScript suppression, explicit-any, or `as unknown`/`as any` pattern;
- assertion-bypass scan: `tests/gap-p0-01a/runtimeSurface.contract.test.ts` contains zero TypeScript `as` assertions, including `as const`, `as unknown`, and `as any`, and zero Jest module replacement calls;
- all 13 non-A1 project-root SHA-256 manifests plus the rebuilt A1 manifest: valid format, sorted unique safe paths, and zero listed-file drift.

These gates validate compatibility and candidate integrity only. They do not turn the six expected pre-fix A1 reds into product approval.

## A1 repair acceptance

No skeleton repair begins until a new independent test reviewer accepts this candidate and its manifest. After acceptance, repair requires all of the following without test changes:

1. A1: 3 suites / 10 tests green, including `--detectOpenHandles`.
2. Eight prior formal roots: 28 suites / 253 tests green.
3. Formal native-scaffold root: 6 suites / 29 tests green.
4. Phase 4 Review3 root: 5 suites / 18 tests green.
5. `tsc --noEmit` green.
6. Every project-root manifest verifies with valid format, canonical order, unique safe paths, and zero listed-file drift.
7. A brand-new independent code reviewer with no overlap with the A1 test author or skeleton repair agent approves the minimal API-only repair.

Only then may the Manager assign a new independent A2 test author. A1 green alone is not product completion.

## Canonical commands

From `outputs/start-five` with the pinned Node/pnpm runtime on `PATH`:

```powershell
pnpm exec jest --runInBand --ci --coverage=false --detectOpenHandles --roots tests/gap-p0-01a
pnpm exec jest --runInBand --ci --coverage=false --roots tests/locked tests/review1 tests/review2 tests/review3 tests/phase4 tests/phase4-review tests/review4 tests/phase4-review2
pnpm exec jest --runInBand --ci --coverage=false --roots tests/native-scaffold
pnpm exec jest --runInBand --ci --coverage=false --roots tests/phase4-review3
pnpm exec tsc --noEmit
```

## Lock construction and verification

The replacement `GAP_P0_01A_LOCK.sha256` is generated last. It lists this specification first, followed by every regular file recursively below `tests/gap-p0-01a/`, sorted by POSIX relative path. It does not include itself.

Each line is exactly:

```text
<lowercase SHA-256><two spaces><POSIX relative path>
```

The manifest's independent identity is the lowercase SHA-256 of `GAP_P0_01A_LOCK.sha256`. Any mismatch revokes the candidate and blocks repair.
