# GAP-P0-02A focus-session API/type foundation locked-test specification

## Status, scope, and role separation

Status: **REVISED CANDIDATE, pending a brand-new independent test review.**

The preceding candidate was rejected by independent review. Its manifest self
identity

```text
7b9388b8f23b3cacaada0498c42591e18ee1158072f7c36cd2d5966f69e15e43
```

is permanently revoked and must not be used for repair, review, evidence, or
delivery. It proved only immediate construction zero-I/O and did not drain
deferred microtasks before asserting dependency silence. Its legacy controls
also checked CoreFlow public types but did not independently lock both real
runtime function signatures, the `CoreFlowScreen` module namespace, or the
default controller's construction surface. This revision closes only those two
review findings; it does not change the focus-session production contract.

This is the API/type foundation stage for persistent focus sessions. It adds
only this specification, regular files recursively below
`tests/gap-p0-02a/`, and `GAP_P0_02A_LOCK.sha256`. It does not modify any
production source, package/dependency/configuration file, native project,
existing test/specification/manifest, or the separate `outputs/qingji-ai`
bookkeeping application.

No production implementation is authorized until a new independent reviewer
accepts this candidate and its manifest. After acceptance, this specification
and every regular file below `tests/gap-p0-02a/` are immutable. The test author
must not implement the production foundation or perform its final code review.

This stage is intentionally storage-independent and behavior-light. It defines
the public records and ports required for the later focus-session behavior
stage without binding the product to AsyncStorage, React Native lifecycle
objects, a scheduler, or the current in-memory `FiveMinuteTimer`.

## Authorized production boundary after independent test acceptance

A minimal A-stage repair may add exactly these new production modules:

```text
src/domain/focusSession.ts
src/data/focusSessionRepository.ts
src/application/focusSessionService.ts
```

No existing `FiveMinuteTimer`, Core service, Core screen, Task, TaskRepository,
native, configuration, or package file needs to change to satisfy this
foundation. Adding focus-session members to an existing legacy object is not a
conforming substitute for the separate modules and factory.

## Public domain contract

`src/domain/focusSession.ts` exports these type names with exact structural
meaning:

```ts
export type FocusDurationMinutes = 2 | 5 | 15 | 25 | 50;

export type FocusSessionStatus =
  | 'running'
  | 'completed'
  | 'interrupted';

export type FocusSession = Readonly<{
  id: string;
  taskId: string;
  plannedMinutes: FocusDurationMinutes;
  status: FocusSessionStatus;
  startedAt: string;
  plannedEndAt: string;
  endedAt: string | null;
  actualSeconds: number | null;
  interruptionReason: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type FocusSessionInput = Readonly<{
  taskId: string;
  plannedMinutes: FocusDurationMinutes;
}>;

export type FocusSessionPatch = Readonly<
  Partial<
    Pick<
      FocusSession,
      | 'status'
      | 'endedAt'
      | 'actualSeconds'
      | 'interruptionReason'
      | 'updatedAt'
    >
  >
>;

export type FocusSessionQueryResult = Readonly<{
  taskId: string;
  sessions: readonly FocusSession[];
  activeSession: FocusSession | null;
}>;
```

The nullable fields are deliberate. A running record has no terminal instant,
measured terminal duration, or interruption reason yet. The B stage will lock
the legal status-dependent combinations; A locks only their public nullability
and immutability. Identity, task association, planned duration, planned end,
all timestamps, terminal data, input fields, patch fields, the query envelope,
and the returned sessions collection are readonly to callers.

The compiler negative contract proves that `1`, `10`, and `60` are not legal
durations, that session and input properties cannot be assigned, and that the
readonly sessions array cannot be pushed into. These are genuine isolated
TypeScript diagnostics, not `@ts-expect-error` comments or main-project errors.

## Storage-independent repository port

`src/data/focusSessionRepository.ts` imports only the public focus-session
domain type and exports:

```ts
export interface FocusSessionTransaction {
  load(): Promise<readonly FocusSession[]>;
  list(taskId?: string): Promise<readonly FocusSession[]>;
  get(sessionId: string): Promise<FocusSession | null>;
  save(session: FocusSession): Promise<FocusSession>;
}

export interface FocusSessionRepository extends FocusSessionTransaction {
  transaction<T>(
    work: (transaction: FocusSessionTransaction) => Promise<T>,
  ): Promise<T>;
}
```

`load` exposes the complete repository snapshot, `list` optionally narrows by
task, `get` addresses one session, `save` stores one complete immutable value,
and `transaction` supplies the same four-operation surface as one atomic unit.
The port has no storage key, serialization envelope, AsyncStorage type, native
API, timer, or network dependency. Persistence adapter behavior is deferred to
B and must not be inferred from this type-only success.

## Public service and factory contract

`src/application/focusSessionService.ts` exports:

```ts
export type CreateFocusSessionServiceOptions = Readonly<{
  repository: FocusSessionRepository;
  now(): string;
  idGenerator(): string;
}>;

export type FocusSessionService = {
  start(input: FocusSessionInput): Promise<FocusSession>;
  getActive(): Promise<FocusSession | null>;
  getById(sessionId: string): Promise<FocusSession | null>;
  listForTask(taskId: string): Promise<FocusSessionQueryResult>;
  finish(sessionId: string): Promise<FocusSession>;
  interrupt(sessionId: string, reason: string): Promise<FocusSession>;
  restore(): Promise<FocusSession | null>;
};

export function createFocusSessionService(
  options: CreateFocusSessionServiceOptions,
): FocusSessionService;
```

The real runtime module owns exactly one enumerable export,
`createFocusSessionService`. Constructing it returns a non-null object with
exactly these seven own enumerable callable keys, in sorted order:

```text
finish
getActive
getById
interrupt
listForTask
restore
start
```

Factory construction performs zero repository reads/writes/transactions and
does not consume the clock or ID generator, both synchronously and after eight
deterministic Promise-microtask checkpoints. The test first asserts immediate
silence, drains exactly eight microtask rounds without any real timer, fake
timer, interval, or scheduler dependency, and then repeats every zero-call
assertion. The runtime gate never invokes a service method, so an absent factory
produces one precise runtime failure and does not cascade into seven false
behavior failures.

Before the B-stage behavior contract is accepted and implemented, every A-stage
service method may either synchronously throw or return a rejected promise, but
the error's public `code` and `message` must both be exactly:

```text
FOCUS_SESSION_NOT_IMPLEMENTED
```

The A-stage code reviewer must verify that all seven stubs use that same error
and perform zero dependency I/O before failing. A-stage tests deliberately do
not call those methods and therefore do not mistake a stub for feature
completion.

## Legacy compatibility contract

The new foundation is additive and separate. The locked green controls prove:

- `DEFAULT_DURATION_MS` remains the literal `300000` and
  `FiveMinuteTimer` retains its existing constructor, seven public methods,
  snapshot fields, states, and app-state input;
- the runtime `fiveMinuteTimer` module still owns only
  `DEFAULT_DURATION_MS` and `FiveMinuteTimer`;
- `CoreAppService` still exposes exactly its existing seven operations;
- `CoreFlowTimerState`, snapshot, controller, app-state source, UI commit kind,
  and `CoreFlowScreenProps` remain structurally exact;
- the real CompilerHost proves the exact callable signatures of both
  `CoreFlowScreen` and `createDefaultCoreFlowTimerController`, including JSX
  return type, options, and controller return surface;
- the real runtime `CoreFlowScreen` module owns exactly the two erased-runtime
  exports `CoreFlowScreen` and `createDefaultCoreFlowTimerController`;
- constructing the default controller consumes no clock value, starts no
  timeout or interval, and returns exactly the existing seven own methods;
- the runtime `coreAppService` module keeps its current five runtime exports;
- `createCoreAppService` still returns exactly the existing seven own methods.

The foundation must not rename the app, change the five-minute legacy default,
or insert focus-session methods into either legacy service object.

## Real in-memory TypeScript compiler oracle

`tests/gap-p0-02a/inMemoryTypecheck.ts` uses the installed TypeScript compiler
API with a real `CompilerHost`. It overlays one virtual contract file while all
other source and module resolution delegates to the real filesystem host, so
every import targets actual production modules.

Compiler options include `strict`, `exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess`, `noEmit`, no ambient `types`, JSX support, and
React-compatible module interop. Only error diagnostics are returned and every
attempted write is counted. Two green self-controls prove that a valid readonly
contract compiles with zero emitted files and that a known invalid assignment
produces exact diagnostic `TS2322`.

The production-facing contracts contain no local extended replacement model,
declaration merge, `@ts-` suppression, explicit `any`, `as unknown`, `as any`,
or shadow production module. Deliberate negative programs exist only as strings
compiled by the isolated program, so the normal project `tsc --noEmit` remains
green before production repair.

## Explicit B-stage deferral

A green A-stage skeleton is not a working focus timer and is not product
delivery. Only after A is accepted, repaired without test changes, and approved
by a new independent code reviewer may the Manager dispatch a separate B-stage
test author.

B must lock at least:

- all five durations (`2`, `5`, `15`, `25`, and `50`) through real behavior;
- one authoritative clock for `startedAt`, `plannedEndAt`, `endedAt`,
  `actualSeconds`, and overdue completion, including wall-clock jumps;
- exactly one active session under concurrent starts and shared repositories;
- foreground/background transitions without double counting or hidden timers;
- UI/controller reconstruction, application composition reconstruction, and a
  truly fresh process/repository restart;
- atomic persistence of active-state changes and completed/interrupted history,
  including read failure, write failure, rollback, and retry;
- `finish` and `interrupt` idempotency that preserves the first terminal
  timestamp, measured seconds, reason, durable write, and return value;
- conflict semantics when finish and interrupt race;
- task-scoped query ordering, active-session selection, deep cloning, and no
  caller aliasing;
- unsupported durations, blank IDs/reasons, invalid/non-canonical timestamps,
  negative/fractional/non-finite seconds, corrupt snapshots, and version
  migration boundaries;
- resource cleanup and no open timer, subscription, or platform handles.

No B behavior may be claimed from the A type contract or stub error.

## Locked suite inventory and counts

| Contract | Locked suite | Tests |
|---|---|---:|
| CompilerHost positive/negative/no-emit controls | `tests/gap-p0-02a/inMemoryTypecheck.invariant.test.ts` | 2 |
| Exact domain types, negative readonly/duration types, repository port, service/factory types | `tests/gap-p0-02a/publicFoundation.contract.test.ts` | 4 |
| Real runtime factory export, exact own surface, construction zero-I/O | `tests/gap-p0-02a/runtimeSurface.contract.test.ts` | 1 |
| Exact legacy timer/Core TypeScript, real function signatures, namespaces, and zero-side-effect controller construction | `tests/gap-p0-02a/legacyCompatibility.control.test.ts` | 6 |

The revised candidate contains **4 suites / 13 tests**, plus one locked CompilerHost
helper. There is no skipped, focused, todo, pending, snapshot-only, timer,
interval, network, filesystem-write, native-handle, module-mock, TypeScript
suppression, explicit-any, or type-assertion escape in the candidate.

## Recorded pre-fix baseline

Recorded on 2026-08-05 before any focus-session production module existed:

- revised candidate with `--detectOpenHandles`: **4 suites executed, 13 tests
  discovered, 5 failed and 8 passed**;
- four compiler-contract failures precisely report the missing domain,
  repository, and application modules and cannot become green until their real
  exports have the exact locked types;
- one runtime failure reports
  `GAP_P0_02A_IMPLEMENTATION_REQUIRED:focusSessionService`;
- both CompilerHost controls and all six legacy compatibility controls pass;
- the final revised baseline run exited normally in 17.070 seconds with no Jest
  timeout, open-handle warning, transform failure, or discovery mismatch;
- normal project `tsc --noEmit` is green with no static import of an absent new
  production module.

These five expected failures are the A-stage repair target. They are not
evidence that focus-session behavior is implemented.

## Authoring-time compatibility and exclusions

The final lock is constructed only after recording:

- accepted/formally repaired roots: **53 suites / 340 tests green**, comprising
  the existing 330-test baseline plus the accepted 10-test GAP-P0-01A public
  foundation;
- main `tsc --noEmit`: green;
- 15 stable project-root manifests: valid format, sorted unique safe relative
  paths, and zero listed-file SHA-256 drift;
- candidate inventory: five regular files before this specification, exactly
  four discovered suites and thirteen discovered tests;
- candidate bypass scan: zero skip/focus/todo, timer/interval,
  `@ts-` suppression, `as unknown`, `as any`, or Jest module replacement hits.

Two independent, not-yet-implemented test-first candidates are intentionally
outside the 340-green acceptance baseline:

- `GAP_P0_01A2` still expects lifecycle behavior beyond its current A1 stub;
- `QUALITY_GATE` still expects package scripts and a lock-verifier
  implementation that do not yet exist.

Their expected red tests were not misreported as a P0-02A regression. The A2
candidate was being independently revised during this authoring window, so its
transient manifest was also excluded from the 15 stable-manifest drift result.
P0-02A does not modify or authorize changes to either candidate.

## A-stage repair acceptance

After independent test acceptance, the Manager may dispatch a new repair agent.
The repair is not complete until all of the following hold without changing
this lock:

1. P0-02A: 4 suites / 13 tests green, including `--detectOpenHandles`.
2. The accepted/formally repaired baseline: 53 suites / 340 tests green.
3. Main `tsc --noEmit`: green.
4. Every stable formal manifest and this accepted P0-02A manifest verifies with
   zero drift.
5. A new independent code reviewer confirms the three-module minimal boundary,
   exact stub error consistency, zero service-method dependency I/O, no legacy
   surface change, and no implementation of deferred B behavior.

Only then may P0-02B test authoring begin.

## Canonical commands

From `outputs/start-five` with the pinned Node/pnpm runtime on `PATH`:

```powershell
pnpm exec jest --runInBand --ci --coverage=false --detectOpenHandles --roots tests/gap-p0-02a
pnpm exec jest --runInBand --ci --coverage=false --roots tests/locked tests/review1 tests/review2 tests/review3 tests/review4 tests/phase4 tests/phase4-review tests/phase4-review2 tests/phase4-review3 tests/phase4-review4 tests/phase4-review5 tests/native-scaffold tests/native-review tests/gap-p0-01a
pnpm exec tsc --noEmit
```

## Lock construction and verification

`GAP_P0_02A_LOCK.sha256` is generated last. It lists this specification first,
followed by every regular file recursively below `tests/gap-p0-02a/`, sorted by
canonical POSIX relative path. It does not include itself.

Each record is exactly:

```text
<lowercase SHA-256><two spaces><POSIX relative path>
```

The independent candidate identity is the lowercase SHA-256 of
`GAP_P0_02A_LOCK.sha256`. Any mismatch revokes the candidate and blocks
production repair until the Manager resolves it through a new independently
reviewed candidate.
