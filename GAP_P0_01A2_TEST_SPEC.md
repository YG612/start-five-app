# GAP-P0-01A2 locked behavior contract

## Status and scope

This candidate is the behavior stage that follows the independently accepted
GAP-P0-01A A1 public foundation. The frozen A1 manifest identity is:

```text
ea5ff6b8012defb53a25310bf07c225171b12641bed42f9569278069def8be90
```

The first A2 candidate was rejected by independent review. Its manifest self
identity

```text
cc594593fd410c58056fc9645edc384d1f0ea89daf328e526be87e0191f54901
```

is permanently revoked and must not be used for implementation, evidence, or
delivery. The second A2 replacement was also rejected by independent review;
its manifest self identity

```text
d02cb6079f23b18f58c2ef816f5d19e1e7de285042462a060766d0dfe55f9344
```

is likewise permanently revoked. The third A2 replacement was also rejected by
independent review; its manifest self identity

```text
00e91645edd50b5904ed48b2a61c36f111548ddbab1f75f88e75655434906e67
```

is likewise permanently revoked and must not be reused. The fourth A2
replacement was also rejected by independent review; its manifest self identity

```text
f9c2a24ba4639fd22e696642299097b1476d123b0604d9b087fdceaa175f4c15
```

is likewise permanently revoked and must not be reused. The fifth A2
replacement was also rejected by independent review; its manifest self identity

```text
e47b3e2e7b35277bc04642b34fb39e25358682e2aaa945d9a89fad7f142fc749
```

is likewise permanently revoked and must not be reused. This sixth candidate
closes the remaining recommendation-eligibility finding and has a new manifest.

A2 uses only the public `Task`, `TaskRepository`, quadrant, lifecycle service,
and lifecycle factory types frozen by A1. It does not replace those types with
local extended aggregate types and contains no `as unknown`/`as any` escape.

The A2 author changed only:

- this specification;
- regular files recursively below `tests/gap-p0-01a2/`;
- `GAP_P0_01A2_LOCK.sha256`, generated last.

Production, A1, all older tests/specifications/manifests, package/configuration,
native projects, and `outputs/qingji-ai` are outside this candidate. After an
independent test reviewer accepts the manifest, every listed file is immutable.
The A2 test author must not implement A2 or perform its final code review.

## Public behavior boundary

Every lifecycle behavior test calls the real object returned by
`createTaskLifecycleService`. The standalone projection test calls the real
`projectTaskQuadrants` export. There is no module replacement, feature-existence
gate, local fake lifecycle service, or conditional skip. The current A1 stubs
therefore produce method-specific `TASK_LIFECYCLE_NOT_IMPLEMENTED` failures
instead of one missing-export cascade.

The A1 eleven-method surface remains exact:

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

## Task normalization and planning fields

### New lifecycle-created records

`create` trims the required title, defaults description to the empty string,
creates a `pending` task, and materializes all three new planning properties as
own properties. Their defaults are:

```ts
scheduledStartAt: null
estimatedMinutes: null
firstStep: null
```

The result also has the legacy required `startAt: null`, null lifecycle/score
timestamps, an empty subtask array, and one stable generated ID. `createdAt`
and `updatedAt` are the same canonical clock instant.

The service snapshots input at invocation. Mutating a create input or update
patch after the call cannot affect the in-flight operation or durable data.
Returned tasks and nested subtasks are detached from both caller input and
repository state.

### Planned start alias

`scheduledStartAt` is planned time. `startedAt` is actual time; planned time is
never copied into it.

The pre-existing `startAt` field is a legacy alias for planned time:

- either alias alone supplies the canonical planned timestamp;
- equal instants expressed with different offsets are equivalent;
- when both are supplied they must denote the same instant;
- disagreement rejects with `SCHEDULED_START_CONFLICT` and no write;
- lifecycle create/update/reschedule/delay results store equal canonical values
  in `startAt` and `scheduledStartAt`;
- explicit `null` clears both aliases;
- an omitted update/reschedule field preserves the latest durably persisted
  current value, including a value written by a preceding update.

Legacy repository records may omit the three additive optional properties.
Reads remain compatible with those records. Once a lifecycle mutation writes a
planning field, the normalized new properties are durably preserved.

### Duration and text validation

`estimatedMinutes` accepts `null` or any positive safe integer, including
`Number.MAX_SAFE_INTEGER`. Zero, negative zero, negative, fractional, `NaN`,
infinity, and unsafe integers reject with `INVALID_ESTIMATED_MINUTES`.

`firstStep` accepts `null` or a trimmed non-empty string. Blank input rejects
with `FIRST_STEP_REQUIRED`. It is the lifecycle planning string and does not
implicitly manufacture a legacy `Subtask`.

Blank titles reject with `TITLE_REQUIRED`. Invalid timestamps reject with
`INVALID_TIMESTAMP`. A non-null planned time later than a non-null due time
rejects with `INVALID_TIME_RANGE`. Validation happens before ID/clock
consumption, repository hydration, or writes where the rejected command can be
decided from its arguments. A matrix for invalid estimated duration, update,
reschedule, and delay arguments proves this with both dependency-call counters
and a preset read fault that remains unconsumed until a later direct repository
read. These tests bind only public dependency effects, not validation helpers or
internal execution order beyond the required no-consumption boundary.

## CRUD and visibility

- `create` supports arbitrary task counts; there is no hidden product cap.
- `getById` returns `null` for a missing ID.
- `list` preserves durable insertion order.
- Tombstones are hidden by default from `getById` and `list` and are returned
  only with `{includeDeleted: true}`.
- `update` changes only its public editable patch fields, preserves `id` and
  `createdAt`, and advances `updatedAt` using the injected clock.
- Omitted patch properties are preserved; explicit nullable properties clear.
- Time-range validation uses the final merged record. Updating only planned
  start past the existing due time, or only due time before the existing planned
  start, rejects with `INVALID_TIME_RANGE` and zero writes.
- Missing targets for update/delete/complete/reschedule/delay reject with
  stable `TASK_NOT_FOUND` and zero writes.
- A tombstone cannot be resurrected or completed/rescheduled/delayed; those
  mutations reject with `TASK_DELETED` and zero writes.

Domain validation and lifecycle error contracts lock the stable `code` only.
They deliberately do not require `message === code`, leaving explanatory
messages additive. Controlled storage-fault tests separately require the exact
injected storage `code` and `message` to survive unchanged.

## Operation identity and idempotency

All six mutations (`create`, `update`, `softDelete`, `complete`, `reschedule`,
and `delay`) require a non-blank `operationId`. Blank or whitespace-only values
reject with `OPERATION_ID_REQUIRED` before storage access.

An operation ID binds to the normalized command: mutation kind, target where
present, and normalized payload. The contract is:

- the same ID and semantically equal command replays the first result;
- timestamp offsets are canonicalized before binding, and legacy `startAt`
  versus new `scheduledStartAt` representations of one instant are equivalent;
- update fingerprints use normalized trimmed text plus canonical planned-time
  aliases, and reschedule fingerprints canonicalize equivalent timezone
  offsets for both planned and due timestamps;
- replay performs no additional read-modify-write, clock read, ID generation,
  timestamp change, or score award;
- each caller receives a deep-separated result object and nested subtask graph
  even on replay; mutating either result cannot affect its sibling or durable
  state;
- reusing an ID across methods, targets, or different normalized payloads
  rejects with `OPERATION_ID_CONFLICT`; each conflict test records commit count,
  durable bytes, and visible cache state and proves all three remain unchanged;
- a failed storage attempt does not poison the ID and the same command can be
  retried;
- two service/repository facades sharing one physical backend and key observe
  the same operation binding.

Generated-ID collision never overwrites an existing task. Under controlled
concurrency, the first committed create wins and the other rejects with
`TASK_ALREADY_EXISTS`.

## Deletion and completion

`softDelete` writes `deletedAt` and advances `updatedAt` once. A later delete,
even under a new operation ID, is a read-only no-op that preserves the first
timestamp.

`complete` supports pending or in-progress tasks:

- an in-progress task preserves its existing `startedAt`;
- a pending task records an implicit actual start at the completion clock
  instant, never at its planned time;
- all nested legacy subtasks must already be completed, otherwise
  `UNFINISHED_SUBTASKS` is returned with no write;
- `status`, `completedAt`, `updatedAt`, `scoreAwardedAt`, and score are committed
  atomically;
- completion points are Q1=35, Q2=45, Q3=15, and Q4=5;
- same-operation replay returns the original awarded points;
- in-progress replay also preserves the first pre-existing `startedAt` exactly;
- a new operation against an already completed task returns the unchanged task
  with `points: 0`, no new clock read, and no write;
- completing a cancelled task rejects with `TERMINAL_TASK` and zero writes.

The completed-subtask completion fixture keeps the parent's `updatedAt` equal
to the child's `updatedAt`/`completedAt`. The exact same full parent/subtask
object first passes a direct real `TaskRepository.list` validation control, then
drives the lifecycle completion behavior test, so the A1 lifecycle stub cannot
hide an illegal fixture.

## Reschedule and delay

`reschedule` requires `scheduledStartAt: string | null`. It canonicalizes and
synchronizes both planned aliases. Omitted `dueAt` preserves the current due
time; explicit `dueAt: null` clears it. The final planned/due pair is validated
after merging omitted fields, so a new planned time beyond the preserved due
time rejects with `INVALID_TIME_RANGE` and zero writes.

`delay` accepts only a positive safe integer number of minutes and computes:

```text
new planned start = max(existing planned start, now) + minutes
```

If no planned start exists, `now` is the base. Delay never shifts `dueAt`
implicitly and never changes `startedAt`. Invalid delay boundaries reject with
`INVALID_DELAY_MINUTES`. A syntactically valid positive safe integer is not by
itself sufficient: the derived planned instant must remain within the
ECMAScript `Date` range and must not exceed a non-null durable due time. Either
derived failure rejects with `INVALID_TIME_RANGE` and zero writes. Deterministic
controls accept an exact `+275760-09-13T00:00:00.000Z` result, then reject a
one-minute near-ceiling overflow and a `Number.MAX_SAFE_INTEGER`-minute
overflow. Reschedule and delay reject completed/cancelled tasks with
`TERMINAL_TASK` and reject tombstones with `TASK_DELETED`.

## Quadrant projection

Both `projectTaskQuadrants` and `getQuadrantProjection` return the fixed readonly
tuple Q1, Q2, Q3, Q4 with matching `QUADRANT_POSITION` values. Each bucket has:

- `totalCount`: all active tasks in the quadrant;
- `preview`: the first at most three sorted tasks;
- `allTasks`: the complete sorted active list.

Active means `pending` or `in_progress`, not deleted. Completed, cancelled, and
deleted tasks are excluded. Future-planned active tasks remain visible in the
quadrant board.

Within a quadrant the exact stable order is:

1. `in_progress` before `pending`;
2. planned start ascending, null last;
3. due time ascending, null last;
4. `createdAt` ascending;
5. ID ascending.

Each stage is tested orthogonally. Input permutations produce identical output.
Projection does not reorder/mutate input. Bucket arrays, preview tasks,
all-task entries, and nested subtasks are mutually deep-separated. The
standalone function receives multiple same-quadrant tasks with nested subtasks,
proves the input order and serialized input remain unchanged, and proves its
preview and all-task nested graphs do not alias.

## Recommendation and query result

Recommendation eligibility is active, not deleted, and not planned after the
injected current time. A future-planned higher-priority task is an explicit
negative control; a task planned exactly at the injected current time is an
explicit eligible boundary control. Eligible planned work precedes null-planned
work, while a due active task remains eligible. Ranking is:

1. `in_progress` before `pending`;
2. quadrant priority Q1, Q2, Q3, Q4;
3. planned start ascending, null last;
4. due ascending, null last;
5. `createdAt` ascending;
6. ID ascending.

Eligibility boundaries are independently distinguishable: separate fresh
repository/service facades cover future Q1 versus eligible Q4, overdue
due-active versus Q4, each of completed/cancelled/deleted versus an eligible
fallback, and planned-exactly-now versus fallback. Every selected fixture has a
nested subtask; mutating the first recommendation leaves both its source fixture
and a second recommendation read unchanged and deeply separated. The existing
empty-facade control independently requires `null`.

Creation, flag update, completion, deletion, reschedule, and delay are visible
on the next recommendation read without stale cached state.

`getQueryResult` returns one coherent visible snapshot with tasks,
recommendation, and quadrant projection. Empty state returns an empty task list,
`null` recommendation, and four exact buckets whose `preview` and `allTasks`
arrays are `[]`. A changing public repository read facade supplies a different
snapshot on each `list`; the query contract requires exactly one list read and
proves tasks, recommendation, and quadrants all derive from that one snapshot.
Every aggregate and repeated task representation, including every nested
subtask graph, is deep-separated from storage and sibling result shapes.
Mutating each tasks/recommendation/preview/allTasks nested representation in
turn leaves all siblings unchanged; a fresh query and a physical restart both
return the original durable nested values.

## Storage atomicity and restart

A controlled storage matrix covers read failure and write failure independently
for all six mutations. For every case:

- the injected error identity (`code` and `message`) is preserved;
- durable bytes remain unchanged;
- no staged cache state becomes visible;
- no partial create/update/tombstone/completion/schedule/score is published;
- the rejected operation can be retried using the same operation ID;
- the successful retry performs exactly one commit.

Generator semantics are attempt-scoped. Each valid mutation attempt reserves
its clock instant, and create also reserves its generated ID, before storage
completion. A read or write failure may therefore consume the first external
clock/ID value; the service does not roll an external generator backward. The
failed values must not appear in durable bytes and must not occupy the operation
ID. Retrying the same operation consumes the next unique clock/ID values. The
matrix asserts exact consumption counts, absence of failed values, and durable
use of the retry values for all six mutations.

Fresh-restart checks use a new storage facade without the old repository's
coordination identity, forcing physical bytes to be parsed again. Planning
fields, aliases, ordering, completion score, and tombstones survive. Mutating a
previous return value remains non-durable across another fresh restart. Nested
subtask isolation is independently exercised for `list`, recommendation, and
quadrant projection: each returned nested title is mutated, then both a same-
service reread and a fresh physical restart recover the original value.

## Shared-backend concurrency

The concurrency fixtures expose a manual `setItem` barrier. Tests await an
observed first write, enqueue the competing operation, and release explicitly.
No test performs a naked wait on `barrier.started`: a `Promise.race` between the
barrier and first-operation settlement fails immediately on early fulfillment
or rejection. Every path releases in `finally`. There is no sleep, fake timer,
polling loop, or timeout heuristic.

Two repositories/services over one physical backend/key must:

- commit concurrent distinct creates without loss;
- merge serialized patches against the latest committed task rather than lose
  one field;
- prevent generated-ID collision overwrite;
- deduplicate a shared operation ID across facades and reject a later conflict;
  the conflict preserves each facade's write log and visible task snapshot plus
  the exact shared durable bytes, and subsequent reads through both facades and
  a physical restart agree.

The contract does not name or inspect an internal queue, lock, registry, or
transaction implementation.

## Deterministic helpers and compatibility controls

Scripted clocks and ID generators advance one value per read and throw loudly
when exhausted. Timestamp idempotency tests intentionally provide only the
first legal instant so a hidden recomputation fails deterministically. Storage
failures are one-shot. The manual barrier has no platform handle.

Eight independent controls stay green before A2 implementation:

- five helper invariants: clock, ID, barrier, one-shot storage failure, and a
  direct repository proof that the scheduled/due/cancelled/deleted fixtures are
  legal and keep cancelled distinct from tombstoned;
- the legacy seven-method `CoreAppService` performs a real create/read;
- shared repository mutations retain deep cloning and serialization;
- repository facade reentrancy remains fail-fast and leaked transaction
  surfaces expire.

These controls prove the harness and backwards compatibility; they do not
substitute for any lifecycle behavior assertion.

## Locked suite inventory

| Suite | Tests | Main responsibility |
|---|---:|---|
| `helperInvariant.contract.test.ts` | 5 | Deterministic helper/fixture green controls |
| `lifecycleCrud.contract.test.ts` | 11 | Create/read/list/update, defaults, aliases, pre-consumption validation |
| `mutationIdempotency.contract.test.ts` | 16 | Semantic replay, repository-validated completion fixture, delete/idempotency |
| `scheduling.contract.test.ts` | 14 | Final merged ranges, JS date overflow, duration and terminal controls |
| `storageAtomicity.contract.test.ts` | 12 | Six mutations times read/write failure |
| `quadrantProjection.contract.test.ts` | 6 | Q1-Q4 projection, filter, sort, cap, deep separation |
| `recommendationQuery.contract.test.ts` | 13 | Independent eligibility boundaries, ranking, refresh, coherent/nested-isolated query |
| `isolationRestart.contract.test.ts` | 7 | Caller/nested isolation and true physical restart |
| `sharedConcurrency.contract.test.ts` | 4 | Deferred-barrier multi-facade concurrency |
| `legacyCompatibility.control.test.ts` | 3 | Legacy Core/repository/transaction green controls |

The replacement candidate contains **10 suites / 91 tests**, plus one typed
helper file.
There are no snapshots, skipped/focused/todo tests, timers, increased Jest
timeouts, mocks, TypeScript suppressions, explicit `any`, `as unknown`,
`as any`, or locally extended production aggregate types.

## Recorded pre-fix baseline

Recorded on 2026-08-05 against the accepted A1 skeleton:

- A2 with `--detectOpenHandles`: 10 suites discovered, 91 tests discovered;
- 8 behavior suites failed and 2 dedicated-control suites passed;
- **82 behavior tests failed and 9 controls passed**, including the direct
  repository validation control inside the mutation suite;
- behavior failures reached the real lifecycle/projection stubs and reported
  `TASK_LIFECYCLE_NOT_IMPLEMENTED`, including expected-code diffs;
- run exited normally in 7.785 seconds with zero snapshot, timeout, discovery,
  transform, or open-handle problem;
- main `tsc --noEmit` passed.

Compatibility evidence after authoring:

- frozen A1: 3 suites / 10 tests passed;
- consolidated prior gate including Phase4 Review5: 50 suites / 330 tests
  passed;
- excluding this A2 candidate and the independently active P0-02B/P0-04
  authoring windows, all 16 stable root manifests (91 listed entries) had zero
  drift; those two active candidates remain explicitly outside A2 review scope;
- static prohibited-pattern scan was zero for every category;
- every one of the eleven lifecycle methods had multiple real call sites, and
  the standalone projection function had a direct call.

## Acceptance gates

No A2 implementation begins until a new independent test reviewer accepts this
specification, all candidate files, and the manifest identity. Repair then
requires, without changing locked tests:

1. A2: 10 suites / 91 tests green with `--detectOpenHandles`.
2. Frozen A1: 3 suites / 10 tests green.
3. All prior formal regression roots green: 50 suites / 330 tests.
4. Main `tsc --noEmit` green.
5. Every stable root manifest in A2 review scope valid and zero-drift;
   concurrently active candidates are explicitly excluded rather than awaited.
6. A brand-new independent code reviewer approves the implementation.

## Canonical commands

From `outputs/start-five` with the pinned Node/pnpm runtime on `PATH`:

```powershell
pnpm exec jest --runInBand --ci --coverage=false --detectOpenHandles --roots tests/gap-p0-01a2
pnpm exec jest --runInBand --ci --coverage=false --roots tests/gap-p0-01a
pnpm exec jest --runInBand --ci --coverage=false --roots tests/locked tests/review1 tests/review2 tests/review3 tests/phase4 tests/phase4-review tests/review4 tests/phase4-review2 tests/native-scaffold tests/native-review tests/phase4-review3 tests/phase4-review4
pnpm exec jest --runInBand --ci --coverage=false --roots tests/phase4-review5
pnpm exec tsc --noEmit
```

## Lock construction

`GAP_P0_01A2_LOCK.sha256` is generated last. It lists this specification first,
followed by every regular file recursively below `tests/gap-p0-01a2/`, sorted
by POSIX relative path. It does not include itself. Every line is:

```text
<lowercase SHA-256><two spaces><POSIX relative path>
```

The SHA-256 of the manifest itself is the candidate identity. Any listed-file
drift revokes the candidate and blocks implementation or delivery.
