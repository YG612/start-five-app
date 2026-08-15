# GAP-P0-02B complete focus-session behavior candidate specification

## Status, scope, and test-first immutability

Status: **SIXTH-CANDIDATE-REVISED / pending sixth independent review.**

The fifth candidate identity
`4c8b1aa513506511708767f202da299c16bf8acb5517b8d8a42742dd1d1e0aa3`
failed its independent review and is permanently revoked. Every earlier
candidate or draft identity also remains permanently revoked:
`37ecbb1f0d3c340eecf9a3ea22ed43fedced1a9447e7d0d031a7218cc4c180ab`,
`517517a2c448b207878bb899afffa1736190e75b7eaf8df71aa9342129ad8971`,
`d6117d9661efd7ee0bff3baced5d8d7facf7f7d42d1c9ae883d0476ab3941d06`,
`118dd322f9cc4fd9e6d4f56b595c475dbed34f499e08079f18a7547d3eaa31ba`, and
`0433a89e8ebfc3c10c9d928cb24afaded050edd22a5cb4ab49d2994ffcdb3bb7`.
None may be used for repair, evidence, or delivery. This sixth candidate fixes
the fifth review's exact-deadline oracle finding by constructing the expected
terminal record with `updatedAt` explicitly equal to `plannedEndAt`; all other
fifth-candidate coverage and dependency budgets remain unchanged.

This stage turns the accepted GAP-P0-02A focus-session type/API foundation into
durable behavior. The candidate adds only this specification, regular files
recursively below `tests/gap-p0-02b/`, `GAP_P0_02B_LOCK.sha256`, and the
audit-only `GAP_P0_02B_LOCK_CHANGELOG.md`. It does not modify production code,
configuration, dependencies, native projects, any earlier specification/test/
manifest, or the separate `outputs/qingji-ai` bookkeeping application.

No production implementation is authorized until a new independent test
reviewer accepts this candidate. On acceptance, this specification and every
regular file below `tests/gap-p0-02b/` are immutable. A repair agent may not
edit, regenerate, skip, focus, weaken, replace, or selectively omit them. This
test author must not implement production behavior or perform the final code
review.

The changelog follows the established project convention: it records candidate
identity and future controlled lock events but is not a manifest input. The
specification and tests, not the changelog, define the locked contract.

## Frozen A-stage dependency and authorized production boundary

GAP-P0-02A remains authoritative and unchanged. In particular:

- `FocusSession`, `FocusSessionInput`, `FocusSessionQueryResult`, the duration
  and status unions, and all readonly fields remain structurally exact;
- `FocusSessionRepository` and `FocusSessionTransaction` retain their exact
  `load/list/get/save/transaction` port;
- `FocusSessionService` retains exactly the seven methods `start`, `getActive`,
  `getById`, `listForTask`, `finish`, `interrupt`, and `restore`;
- `CreateFocusSessionServiceOptions` remains exactly `repository`, `now`, and
  `idGenerator`;
- the runtime `focusSessionService` module still owns only
  `createFocusSessionService`;
- all legacy timer, Core service, CoreFlow controller, and screen surfaces stay
  unchanged.

After independent acceptance, a B-stage repair may:

1. replace the seven stable `FOCUS_SESSION_NOT_IMPLEMENTED` method bodies in
   `src/application/focusSessionService.ts` with the locked behavior;
2. add a concrete repository implementation to
   `src/data/focusSessionRepository.ts` while preserving both A interfaces;
3. add `src/data/persistentFocusSessionStorage.ts` as the durable envelope
   adapter;
4. add private helpers inside those production files.

No Task domain/repository, CoreFlow screen/controller, native, package, or
configuration change is necessary or authorized for this stage. The public
focus-session domain structure does not change.

## Concrete repository and durable adapter contract

The repository module adds this exact public storage port and these runtime
identities without changing either A interface:

```ts
export type FocusSessionKeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export const DEFAULT_FOCUS_SESSION_STORAGE_KEY =
  'start-five.focus-sessions.v1';

export function createFocusSessionRepository(
  storage: FocusSessionKeyValueStorage,
  key?: string,
): FocusSessionRepository;
```

`FocusSessionKeyValueStorage` has exactly those three methods and no public
coordination symbol or optional metadata. Cross-facade coordination is an
internal algorithm locked only through observable concurrency behavior. The
new persistent storage module exports:

```ts
export const FOCUS_SESSION_STORAGE_KEY = 'start-five.focus-sessions.v1';
export const FOCUS_SESSION_SNAPSHOT_SCHEMA = 'start-five.focus-sessions';
export const FOCUS_SESSION_SNAPSHOT_VERSION = 1;
export type FocusSessionAsyncKeyValueBackend = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
export function createPersistentFocusSessionStorage(
  backend: FocusSessionAsyncKeyValueBackend,
): FocusSessionKeyValueStorage;
```

A real in-memory TypeScript `CompilerHost` imports the production modules and
locks these types, literal constants, and both factory signatures exactly. A
separate runtime oracle requires exact enumerable namespaces:

```text
focusSessionRepository:
  DEFAULT_FOCUS_SESSION_STORAGE_KEY
  createFocusSessionRepository

persistentFocusSessionStorage:
  FOCUS_SESSION_SNAPSHOT_SCHEMA
  FOCUS_SESSION_SNAPSHOT_VERSION
  FOCUS_SESSION_STORAGE_KEY
  createPersistentFocusSessionStorage
```

Both factories construct synchronously and remain backend-I/O silent through
eight deterministic Promise microtask checkpoints. The storage object owns the
three public methods and the repository owns exactly its five port methods.

The exact current durable envelope is:

```json
{
  "schema": "start-five.focus-sessions",
  "version": 1,
  "sessions": []
}
```

Only these three envelope keys are allowed. Version `0`, future version `2`,
and a different schema are explicitly unsupported; this first focus-session
store has no real predecessor to migrate. Unsupported bytes are preserved for
future explicit migration and are never silently rewritten or deleted.
Malformed JSON is corrupt. A parsed non-object root (including boolean), a
missing or wrong-typed schema/version identity, a fractional/null/boolean/string
version, or an unsupported identity is unsupported. A current envelope with an
extra key, missing `sessions`, or `sessions` equal to null/string/number/boolean/
object is invalid. A non-object session entry, any missing record field, or
invalid session data is also invalid. Every root/envelope rejection preserves
the exact bytes, cache, writes, and deletes; replacing the bytes with one valid
current envelope lets the same repository load successfully, proving that an
invalid read was not cached. Backend failures retain their original `cause` and
map to stable read/write codes.

Every persisted record owns exactly the A-stage fields. Validation requires:

- trimmed, nonempty, control-character-free session and task IDs; surrounding
  whitespace in persisted IDs is invalid rather than silently normalized;
- one of the five exact durations and canonical millisecond UTC timestamps
  (`Date.parse(value)` followed by `toISOString()` must reproduce `value`);
- `createdAt === startedAt` and `plannedEndAt` exactly duration minutes after
  `startedAt`;
- a running record has `endedAt`, `actualSeconds`, and reason all null and
  `updatedAt === startedAt`;
- a completed record has a canonical end at or before `plannedEndAt`, an
  integer `actualSeconds` exactly equal to the floor of elapsed milliseconds,
  a null reason, and `updatedAt === endedAt`;
- an interrupted record ends strictly before `plannedEndAt`, has the same
  exact elapsed-second rule, owns a trimmed nonempty reason, and has
  `updatedAt === endedAt`;
- IDs are globally unique and at most one running record exists in the entire
  repository.

Every record field has its exact A-stage runtime type and status must be one of
the three allowed literals. `startedAt`, `plannedEndAt`, `endedAt` when present,
`createdAt`, and `updatedAt` are each independently canonical. An end before
start is invalid even when paired with a negative number. Persisted interruption
reasons with leading/trailing whitespace are invalid. Non-finite seconds are
exercised directly through real `repository.save` and transaction `save` for
`Infinity`, `-Infinity`, and `NaN`; they never pass through JSON fixture
construction where serialization could coerce them to `null`.

Repository reads and writes detach caller values. This includes the original
object passed to direct or transaction `save`, each returned save value, and
every object/array returned by transaction `load/list/get`; caller mutation
cannot pollute staged state, cache, or durable bytes. A committed terminal record
may only be replay-saved identically; direct save cannot reverse it to running
or rewrite it as a different terminal result. `list(taskId)` preserves
repository order and filters only an exact canonical task ID; service-level
sorting is defined separately. Direct `save` is an atomic upsert. A transaction
stages any number of saves and performs at most one durable write; a read-only
transaction performs none. Callback failure, validation failure, and backend
write failure leave both durable bytes and the hydrated cache unchanged.
Fresh direct `repository.save` and `transaction.save` additionally lock the
call boundary itself: each test first obtains the returned pending Promise,
immediately mutates the caller-owned record, and only then awaits. A manual
backend write barrier proves the outer operation is still pending without sleep
or timer heuristics. The staged record, returned record, committed cache, and
durable envelope all retain the invocation-time value.

Mutation work is FIFO-linearized across repository facades that wrap the same
physical backend and key. A failed read is not cached. A failed mutation does
not poison the queue. A direct facade mutation or nested facade transaction
invoked in the synchronous segment of a transaction callback rejects as
reentrant; both invocations are captured before the callback's first `await`.
Once that callback has yielded at its first `await`, an ordinary facade call is
external FIFO work and may run after the transaction. Awaiting such queued work
from inside the still-open transaction would remain caller deadlock and is not
an authorized pattern. External same-facade mutation while a transaction is
awaiting also queues and commits afterward. All four leaked transaction
methods (`load/list/get/save`) reject after success, callback failure,
validation failure, and commit failure. Callback/validation failure is
followed by an ordinary successful mutation to prove queue recovery.

A valid staged save followed by invalid data rolls back completely. Multiple
valid staged saves followed by a backend commit failure also leave durable
bytes and cache unchanged. Different explicit keys remain isolated. A new
backend facade over the same durable byte map must hydrate independently. Its
first operation may be either direct `save` or a mutating transaction; both
must read and preserve all existing durable records before committing the new
record. This supplies the fresh-process restart oracle rather than merely
reusing a module cache.

## Validation and normalization

Service input is captured and validated before dependency I/O. `start` accepts
an ordinary exact `{taskId, plannedMinutes}` record, trims the task ID, and
rejects unknown keys, null, string, number, boolean, undefined, other
nonobjects, blank/control-character IDs, and every duration outside
`2 | 5 | 15 | 25 | 50`. Each primitive/nonobject rejection is the stable
`FOCUS_SESSION_INVALID_INPUT`, not a native property-access error. Session IDs supplied to `getById` and
terminal methods are trimmed and reject blank/control-character or non-string
runtime values with `FOCUS_SESSION_INVALID_ID`; the task ID supplied to
`listForTask` follows the same normalization but rejects with
`FOCUS_SESSION_INVALID_TASK_ID`. Interruption reasons are trimmed and must be
nonempty strings. `finish` and `getById` each cover both null and object IDs;
`listForTask` covers both null and object task IDs. Invalid interrupt ID takes
precedence over reason validation across the object/blank ID by null/blank
reason matrix. These runtime values are passed through typed invocation adapters
without compiler suppression, native coercion, or pre-test exception, and every
case proves repository, clock, and ID dependencies remain untouched. The
`start` runtime adapter uses a directly auditable runtime type guard and method
call without TypeScript suppression, unsafe assertion, dynamic constructor, or
reflection escape.

The injected clock must return a canonical millisecond UTC timestamp. The
generated ID is trimmed, must be nonempty/control-character-free, and must not
collide with terminal history. Invalid input consumes no repository, clock, or
ID dependency. Invalid clock consumes no ID and saves nothing. Invalid or
duplicate generated ID saves nothing.

Tests assert stable public error `code` properties rather than complete error
messages. Relevant codes are:

```text
FOCUS_SESSION_INVALID_INPUT
FOCUS_SESSION_INVALID_TASK_ID
FOCUS_SESSION_INVALID_DURATION
FOCUS_SESSION_INVALID_ID
FOCUS_SESSION_INVALID_REASON
FOCUS_SESSION_INVALID_CLOCK
FOCUS_SESSION_ID_CONFLICT
FOCUS_SESSION_ACTIVE_CONFLICT
FOCUS_SESSION_NOT_FOUND
FOCUS_SESSION_SNAPSHOT_CORRUPT
FOCUS_SESSION_SNAPSHOT_UNSUPPORTED
FOCUS_SESSION_SNAPSHOT_INVALID
FOCUS_SESSION_STORAGE_READ_FAILED
FOCUS_SESSION_STORAGE_WRITE_FAILED
FOCUS_SESSION_REPOSITORY_REENTRANT_MUTATION
FOCUS_SESSION_REPOSITORY_TRANSACTION_EXPIRED
```

Repository or backend errors not owned by the service are propagated and are
not replaced by empty results or successful no-ops.

## Start, natural replay, and the one-active invariant

All five durations are exercised through real `start` behavior. A new record
uses exactly one clock sample and one generated ID. `startedAt`, `createdAt`,
and `updatedAt` equal that clock sample; `plannedEndAt` is computed from it;
the status is running and all terminal fields are null. The service uses one
repository transaction, one staged snapshot read, and one save/commit.

The A-stage exact input and method signatures deliberately contain no
`operationId`. Adding one would break an already accepted exact contract.
Instead B uses domain-natural idempotency keys:

- if a non-overdue active record already has the normalized same task ID and
  duration, `start` is a replay and returns that record with one clock sample
  but no ID or save;
- any other `start` while a non-overdue active record exists rejects with
  `FOCUS_SESSION_ACTIVE_CONFLICT` after one clock sample and without ID/save;
- if the loaded active record is overdue, the same clock sample atomically
  completes it at its deadline and starts a replacement; both staged saves
  form one durable commit, so stale process state cannot permanently block a
  new session;
- after a session becomes terminal, the same task and duration may start a new
  session; generated record identity prevents accidental history overwrite;
- `finish` and `interrupt` use their required `sessionId` as the terminal
  idempotency key.

Two same-input starts through one repository or through two independently
constructed service/repository facades converge to one record and one durable
write. Different-input concurrent starts produce one winner and one typed
conflict. These cases use the real production repository, both with a single
facade and with two facade caches preheated to the same empty state. A separate
real dual-facade test preheats both views with one running record before racing
finish and interrupt. Final durable envelope bytes, unique commit count,
returned values/error, and cache views must agree. Tests do not preselect a
scheduling winner.

## Task association policy

The frozen A options contain no Task repository or task-status resolver.
Focus-session storage therefore treats `taskId` as a stable opaque foreign key:
syntactically valid IDs associated by an upper layer with a missing, deleted,
or completed task are accepted and historical associations never cascade or
disappear. UI/application composition owns any policy that prevents a new
focus start for a deleted/completed task. This explicit policy avoids a hidden
global Task repository, cross-store non-atomic reads, and an impossible change
to A's exact factory options.

## Terminal state machine and authoritative wall clock

`finish` and `interrupt` first load the addressed record inside one transaction.
A missing record rejects without clock or save. A running record consumes one
canonical clock sample:

- before the deadline, `finish` produces completed and `interrupt` produces
  interrupted with the first trimmed reason;
- `endedAt`/`updatedAt` equal the clock sample and `actualSeconds` is the floor
  of nonnegative elapsed milliseconds divided by 1000;
- at or after `plannedEndAt`, deadline completion wins: the record becomes
  completed at exactly `plannedEndAt`, measured seconds equal planned minutes
  times 60, and reason remains null;
- a clock sample before `startedAt` rejects without mutation, preventing a
  negative duration; a later valid retry succeeds.

Every terminal record is irreversible. Repeating either terminal method on a
completed or interrupted session returns the first stored terminal value with
no clock or save. A finish/interrupt race is first-commit-wins, but both callers
observe the identical committed terminal record. The first interruption reason,
timestamp, duration, and write are preserved.

`getActive` and `restore` use the same transaction-based deadline reconciliation.
With no active record they return null without clock or write. Before the
deadline they return a detached active record within one load/clock and without
a write. At/after the
deadline they commit completion once and return null. Repeated restore after
completion performs neither a second clock sample nor a second write. This
models foreground/background and process gaps using persisted wall time rather
than hidden intervals, so a late resume cannot double-count background time.
At the exact deadline, `restore` returns null and persists completed with
`endedAt`/`updatedAt` exactly equal to `plannedEndAt` and `actualSeconds` equal
to `plannedMinutes * 60`, using exactly one transaction/load/clock/save/commit,
zero other repository operations, and zero ID calls. Caller-owned seed and
exposed persistence objects remain detached from the durable record.

`start` at the exact deadline atomically completes the old active record and
creates its replacement, including when task ID and duration exactly match the
expired record; equality at the deadline is not an active replay. If the new
generated ID collides with that old active ID, the entire transaction rejects
without overwriting or terminalizing the old history. Every clock-consuming
method (`start`, `getActive`, `restore`,
`finish`, and `interrupt`) rejects a noncanonical clock sample without mutation.
Real persistent read failures from `getActive`, `restore`, `getById`, `finish`,
and `interrupt` propagate with the storage read code, do not consume the clock,
and can be retried successfully.

## Queries, history ordering, and isolation

`getById` performs one normalized repository get and returns a detached record
or null. `listForTask` performs one task-scoped repository list, returns the
complete (unpaginated) history, and sorts by `startedAt` descending then `id`
ascending as a deterministic tie-break. `activeSession` is the sole running
record in that task's returned history or null.

Every service result, session record, query envelope, and sessions array is
detached from repository/cache state and from later calls. Caller mutation of
a returned object or array cannot alter durable bytes, the repository view, or
a subsequent result. The public model currently has no nested mutable child;
tests cover all existing object/array layers rather than inventing an extended
domain model.

## Timer ownership and CoreFlow boundary

The persistent focus service owns no timeout, interval, subscription, React
Native lifecycle object, or scheduler. Its sole time source is injected `now`.
Construction remains silent through twelve deterministic Promise microtask
rounds. Real service behavior is exercised while spying on timer APIs and must
schedule or clear none.

The already locked `createDefaultCoreFlowTimerController` remains a five-minute
UI clock and does not gain a FocusSessionService dependency. Constructing and
disposing it performs no focus repository I/O. Product composition must
explicitly call the persistent service and drive the UI controller; neither
side silently commits the other. This B stage locks that integration boundary
without changing the A-locked CoreFlow types or claiming a screen integration
that does not yet exist. No test sleeps, advances fake time, or leaves a real
timer running.

## Dependency budgets and fault recovery

The locked tests require:

- one successful new start: one transaction/load/save, one clock, one ID;
- matching replay or active conflict: one transaction/load and one clock,
  zero save/ID;
- overdue replacement start: one transaction/load, one clock, one ID, two
  staged saves, and one durable commit;
- running finish/interrupt: one transaction/get/save, one clock, zero ID;
- terminal replay: one transaction/get, zero save/clock/ID;
- active restore/getActive: one transaction/load, at most one clock and one
  save only when overdue;
- `getById` and `listForTask`: one direct corresponding read, zero transaction,
  clock, ID, or write;
- read, callback, validation, or write failure: no partial commit, with the
  next ordinary operation able to succeed.

These budgets constrain observable dependency effects, not private helper
structure. They are required to prove atomicity, idempotency, and absence of
hidden polling.

## Candidate inventory

| Contract | Candidate suite | Tests |
|---|---|---:|
| Deterministic clock/ID and transactional fake self-controls | `tests/gap-p0-02b/helperInvariant.control.test.ts` | 3 |
| Real CompilerHost positive/negative controls | `tests/gap-p0-02b/inMemoryTypecheck.invariant.test.ts` | 2 |
| Exact persistence types, factory signatures, namespaces, and zero-I/O construction | `tests/gap-p0-02b/persistentPublicSurface.contract.test.ts` | 3 |
| Five durations, start validation/replay/deadline/faults | `tests/gap-p0-02b/serviceStart.contract.test.ts` | 43 |
| Finish/interrupt/getActive state machine, clocks, read faults, rollback | `tests/gap-p0-02b/serviceTerminal.contract.test.ts` | 45 |
| Query sorting/completeness/isolation and service reconstruction | `tests/gap-p0-02b/serviceQueryRestart.contract.test.ts` | 15 |
| Concrete repository atomicity/cache/transaction/non-finite contracts | `tests/gap-p0-02b/repositoryPersistence.contract.test.ts` | 29 |
| Envelope, field, timestamp, cross-record, and version validation | `tests/gap-p0-02b/snapshotValidation.contract.test.ts` | 96 |
| Real same/dual-facade concurrency and durable restart | `tests/gap-p0-02b/sharedPersistenceConcurrency.contract.test.ts` | 7 |
| Real persistent service read-failure propagation and retry | `tests/gap-p0-02b/servicePersistentFaults.contract.test.ts` | 5 |
| Zero-side-effect factory, background gap, and CoreFlow boundary | `tests/gap-p0-02b/timerBoundary.control.test.ts` | 4 |

The SIXTH-CANDIDATE-REVISED suite contains **11 suites / 252 tests**, plus two non-suite
helpers.
There is no skipped/focused/todo/pending test, snapshot-only assertion, sleep,
network, device/native dependency, Jest module replacement, fake timer,
TypeScript suppression, explicit `any`, `as any`, or `as unknown` escape.
Timer API references are spies that prove the service schedules nothing; the
tests never replace or advance the timer implementation.

## Recorded pre-fix baseline and compatibility evidence

Recorded on 2026-08-05 while the accepted A production service still exposed
stable not-implemented method bodies and no persistent focus storage module
existed:

- SIXTH-CANDIDATE-REVISED baseline with `--detectOpenHandles`: **11 suites
  executed / 252 tests discovered / 245 failed / 7 passed**;
- service behavior failures resolve to the real A-stage
  `FOCUS_SESSION_NOT_IMPLEMENTED` stub, while persistent behavior failures
  resolve to the absent real `persistentFocusSessionStorage` module/factories;
- the seven green controls prove deterministic helper rollback/queue behavior,
  the real CompilerHost's positive/negative/no-emit oracle, service-factory
  deferred-microtask silence, and the legacy CoreFlow construction boundary;
  they do not claim product behavior;
- the run exits normally without discovery mismatch, Jest timeout, or open
  handle warning;
- all accepted/formally repaired roots remain **57 suites / 353 tests green**,
  including GAP-P0-02A's 4 suites / 13 tests;
- normal project `tsc --noEmit` remains green because the absent persistent
  module is loaded only by a guarded runtime oracle, not a static import;
- the stable accepted lock baseline, explicitly excluding active GAP-P0-01A2,
  GAP-P0-04, this GAP-P0-02B candidate, and rejected QUALITY_GATE, is **15
  manifests / 87 entries / zero issues** across format, ordering, path safety,
  uniqueness, presence, and SHA-256;
- rejected QUALITY_GATE is observed separately as **1 manifest / 4 entries /
  zero current drift** only; that observation is not acceptance evidence and
  never enters the stable baseline.

The concurrently active `GAP_P0_01A2` and `GAP_P0_04` candidates, plus the
rejected/unrepaired `QUALITY_GATE` candidate, are intentionally excluded from
the accepted green and stable-manifest baselines. Their expected red or
in-flight state is not reported as a 02B regression.

## Repair and independent code-review acceptance

After independent test acceptance, a new repair agent must satisfy all of the
following without changing this lock:

1. GAP-P0-02B: 11 suites / 252 tests green with `--detectOpenHandles`.
2. All accepted/formally repaired regression roots remain green.
3. Main `tsc --noEmit` is green.
4. Every stable formal manifest and this accepted manifest verifies with zero
   drift.
5. A brand-new code reviewer confirms the authorized production boundary,
   exact A compatibility, durable rollback/restart evidence, cross-facade
   linearization, timer/resource cleanup, no Task/CoreFlow hidden coupling,
   and no change to `outputs/qingji-ai`.

Failure at code review returns to repair and then requires another complete
independent review. A green Jest result alone is not delivery.

## Canonical commands

From `outputs/start-five` with the pinned Node/pnpm runtime on `PATH`:

```powershell
pnpm exec jest --runInBand --ci --coverage=false --detectOpenHandles --roots tests/gap-p0-02b
pnpm exec jest --runInBand --ci --coverage=false --roots tests/locked tests/review1 tests/review2 tests/review3 tests/review4 tests/phase4 tests/phase4-review tests/phase4-review2 tests/phase4-review3 tests/phase4-review4 tests/phase4-review5 tests/native-scaffold tests/native-review tests/gap-p0-01a tests/gap-p0-02a
pnpm exec tsc --noEmit
```

## Lock construction and verification

`GAP_P0_02B_LOCK.sha256` is generated last. It lists this specification first,
followed by every regular file recursively below `tests/gap-p0-02b/`, sorted by
canonical POSIX relative path. It excludes itself and the audit-only changelog.

Each record is exactly:

```text
<lowercase SHA-256><two spaces><POSIX relative path>
```

The candidate identity is the lowercase SHA-256 of the complete manifest. Any
mismatch revokes the candidate and blocks production repair until the Manager
resolves it through a new independently reviewed candidate.
