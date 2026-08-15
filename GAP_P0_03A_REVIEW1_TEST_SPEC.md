# GAP-P0-03A Review1 controlled replacement test-first specification

## Status and authority

Status: **CANDIDATE / FROZEN FOR INDEPENDENT TEST REVIEW / UNVERIFIED / NO
PRODUCTION AUTHORITY**.

The former REVISION2 manifest self
`1eac48d2c03dd020a6d85f748f7f2df8939275ebc86c6b57f51b3a49c5cff190`
is **REVOKED / IMPLEMENTATION CODE REVIEW FAILED / NEVER ACCEPTED**. Its green
68-test result did not close P0-03A. The independent implementation review
found five material defect groups and one contradiction in the test contract.
The revoked self grants no repair or delivery authority.

This Review1 candidate is the one complete executable replacement. It covers
the controlled revisions below, all non-conflicting former P0-03A behavior,
and the five new review suites as one 10-suite / 92-test gate. The content
manifest covers the revised base specification, all six regular base-test
assets, this specification, and all six regular Review1-test assets. The old
manifest is retained only as revoked historical evidence and is not a required
green gate.

The test author changed no production source, package/dependency/Jest/
TypeScript configuration, native project, other feature test/lock, or the
separate `outputs/qingji-ai` bookkeeping application. No production repair may
start until a brand-new independent test reviewer returns PASS on the exact
Review1 manifest self and the Manager accepts that exact identity. After that
acceptance, every manifest-listed asset is immutable.

## Controlled contradiction correction

The former contract required durable diagnosis-operation replay after a true
cold start, but a fresh facade had no way to discover the operation before
loading Task/Focus context. At the same time, terminal and association
rejection tests prohibited every repository read. A durable replay that must
precede context and a universal zero-read rule cannot both be satisfied.

Review1 makes the minimum explicit correction:

- `DelayDiagnosisRepository` gains exactly one read-only public port:
  `getOperation(operationId)`;
- every normalized `submit` command performs exactly one read-only durable
  operation lookup before context, clock, generated ID, or transaction;
- matching replay returns the first detached diagnosis, and conflicting reuse
  rejects `DELAY_DIAGNOSIS_OPERATION_CONFLICT`, both before context;
- a brand-new operation rejected for terminal/deleted Task, missing or
  incoherent context, or an ineligible trigger still performs zero transaction
  attempt, save, commit, clock call, generated ID, or diagnosis creation;
- invalid reason and over-limit private text remain pre-command normalization
  failures with zero repository lookup and zero other I/O; and
- the transaction retains its own atomic collision check for a race, but that
  is not a second read-only preflight lookup.

This does not authorize a general extra read, eager hydration, process-local
replay cache, or transaction on a rejected command. The typed byte repository
counts read-only operation lookups separately from transaction attempts and
records exact ordered events.

## Durable replay before context

The Review1 restart oracle first commits through the real service, copies only
the repository's serialized raw bytes, and constructs a new backend, repository,
service, scripted clock, scripted ID source, and context port. No Map, returned
object, Promise, module registry, or previous service state is shared.

The fresh service must replay a committed operation while context is configured
to throw if touched. It performs exactly one read-only operation lookup, zero
context/clock/ID/transaction/commit/write, and leaves bytes unchanged. Caller
mutation of the replayed record and nested suggestion cannot affect a second
replay. A copied-byte conflict likewise precedes unavailable context and leaks
no conflicting private text.

An operation committed while the Task was active remains replayable even if
authoritative context would now report that Task completed, cancelled, or
deleted. Idempotent replay describes the already committed result; it does not
create a new diagnosis and must win before current terminal validation.

## Authoritative context identity

The context port is coherent only when all supplied identities match the
command:

- returned `context.task.id` must equal requested `taskId`, otherwise
  `DELAY_DIAGNOSIS_TASK_ID_MISMATCH`;
- when a FocusSession was requested, returned `focusSession.id` must equal the
  requested ID, otherwise `DELAY_DIAGNOSIS_SESSION_ID_MISMATCH`; and
- returned `focusSession.taskId` must equal the authoritative Task ID,
  otherwise the existing `DELAY_DIAGNOSIS_SESSION_TASK_MISMATCH`.

Each mismatch is independently tested with one read-only operation lookup, one
context load, zero transaction/write/commit/clock/ID, null durable bytes, and
private-text opacity across direct error, string, serialization, and value-free
port logs. No diagnosis may bind a command ID to a differently identified
context object.

## Prototype-safe deterministic summaries

Summary counting treats reason/trigger keys as untrusted data keys. It may use
a null-prototype dictionary, Map, or equivalent safe representation, but it may
not inherit from `Object.prototype`.

One fixed 13-record oracle uses reason keys `__proto__`, `constructor`,
`toString`, `hasOwnProperty`, decomposed `e\u0301`, composed `é`, CJK `原因`,
and emoji `🙂`. It locks exact independent counts, code-unit deterministic key
ordering, separation of canonically distinct Unicode strings, no
`Object.prototype` mutation, no private/suggestion value exposure, deep
detachment, and an identical summary after reconstruction from copied bytes.

## Reminder rule validation

Rule validation is synchronous and I/O-free in both `deriveReminderPlan` and
`reconcile`. Invalid input throws a stable reminder domain error before
repository or scheduler access:

- duplicate rule ID: `REMINDER_RULE_ID_DUPLICATE`;
- offset `NaN`, positive/negative infinity, or non-integer:
  `REMINDER_RULE_OFFSET_INVALID`;
- a finite integer offset whose derived instant exceeds ECMAScript's valid Date
  range: `REMINDER_TRIGGER_TIMESTAMP_OUT_OF_RANGE`; and
- progress threshold `NaN`, positive/negative infinity, below zero, or above
  one: `REMINDER_RULE_PROGRESS_THRESHOLD_INVALID`.

No path may expose a native `RangeError`. Exact zero-I/O assertions cover
repository read, transaction, save/remove, commit, scheduler query/replace, and
platform raw bytes. This validates explicit policy inputs without creating new
default offsets or thresholds.

## Commit plus compensation failure recovery

The reminder repository transaction remains the durable linearization boundary.
When scheduler forward replacement succeeds, repository commit fails, and the
reverse CAS compensation also fails, silently discarding the rollback failure
is forbidden. The service must throw a stable error with:

```text
code: REMINDER_RECOVERY_REQUIRED
recoveryRequired: true
cause: the exact repository commit Error object
rollbackCause: the exact scheduler rollback Error object
```

The error and both causes must not contain private Task text. The durable
repository remains exact `before`, while platform bytes may remain exact `next`.
The candidate asserts both complete CAS calls:

```text
forward:  { previous: before, next: next }
rollback: { previous: next,   next: before }
```

It also locks exact repository/scheduler I/O counts and events. A new facade
constructed only from copied `repository=before` and `platform=next` bytes must
retry the same operation, commit exactly generation 2, perform no duplicate
platform replacement, and never create generation 3. Independent controls
cover `repository=before` plus a stale platform snapshot (one exact CAS to
generation 2) and the initial orphan state `repository=null` plus an already
installed generation 1 (adopt once with no replacement). These are required
recovery paths, not permission to trust an arbitrary platform generation: the
candidate's exact semantic snapshots and CAS previous/next remain authoritative.

## Scope boundary

Review1 remains P0-03A platform-independent core. It does not select/import a
notification library, schedule a native notification, request permission,
handle background callbacks, or define platform storage. All native delivery,
channels/categories/actions, OS lifecycle, and device testing remain P0-03B.

This candidate does not add an A2 shared operation ledger or cross-service
dispatch. The already documented 03A-local bindings remain local. A2 shared
ledger work must use its own accepted contract and later integration test-first
slice.

After test acceptance only, the repair boundary remains the minimum internals
of:

- `src/application/delayDiagnosis.ts`; and
- `src/application/reminderScheduling.ts`.

No Task/Focus public contract, repository outside the two existing 03A ports,
screen, native project, package, or configuration change is authorized.

## Candidate inventory and current-production baseline

| Test root / suite | Tests | Current green | Current red |
|---|---:|---:|---:|
| revised base `publicSurface.contract.test.ts` | 4 | 3 | 1 |
| revised base `reminderPolicy.contract.test.ts` | 9 | 9 | 0 |
| revised base `reminderCoordination.contract.test.ts` | 16 | 16 | 0 |
| revised base `delayDiagnosis.contract.test.ts` | 35 | 25 | 10 |
| revised base `helperInvariant.control.test.ts` | 4 | 4 | 0 |
| Review1 `durableOperationReplay.contract.test.ts` | 5 | 0 | 5 |
| Review1 `contextCoherence.contract.test.ts` | 3 | 0 | 3 |
| Review1 `summarySafety.contract.test.ts` | 1 | 0 | 1 |
| Review1 `reminderValidation.contract.test.ts` | 11 | 0 | 11 |
| Review1 `reminderRecovery.contract.test.ts` | 4 | 3 | 1 |
| **Total** | **92** | **60** | **32** |

The combined canonical run discovered 10 suites / 92 tests and completed with
32 expected feature failures / 60 passes, 0 snapshots, and no open-handle
warning. The three new-suite greens are legitimate recovery controls for an
already-new platform view, a stale platform view, and an initial orphan view;
they lock correct existing convergence behavior and were not weakened merely
to force red. Every other new Review1 test is red against current production.

The revised base root alone is 5 suites / 68 tests with 11 expected failures /
57 passes. Its former green result is not reused as evidence because the
contradictory executable assertions and exact repository surface were
controlled-revised. The combined 92-test result is the sole pre-repair
candidate baseline.

## Recorded compatibility and audit evidence

Recorded with pinned local Node/pnpm from `outputs/start-five`:

- GAP-P0-01A: 3 suites / 10 tests green, 0 snapshots;
- frozen GAP-P0-01A2: 10 suites / 91 tests green, 0 snapshots;
- GAP-P0-02A: 4 suites / 13 tests green, 0 snapshots;
- frozen GAP-P0-02B: 11 suites / 252 tests green, 0 snapshots;
- accepted/formally repaired baseline: 57 suites / 353 tests green, 0
  snapshots;
- global `pnpm exec tsc --noEmit`: exit 0 with zero diagnostics; and
- stable accepted/frozen content-lock audit: 17 manifests / 113 entries / zero
  malformed, unsafe, duplicate, missing, ordering, or SHA issue.

The stable-lock audit explicitly excludes active A2 Review1/Review2, 02B
Review1 draft, active P0-04, revoked P0-03A, rejected QUALITY_GATE, unaccepted
QUALITY_GATE_V2, and this Review1 candidate. No active or revoked identity is
silently promoted.

The complete candidate TypeScript scope is 12 files. Case-sensitive bypass
scans report zero focused/skipped/todo test, TypeScript suppression, unsafe
`any`/`unknown` cast, explicit `any`, Jest module replacement, fake timer,
snapshot assertion, sleep, direct timer/interval, timeout increase,
`Function`/`Reflect`, actual network call, native import, or `qingji-ai`
reference. Two literal network/native strings are intentional negative
no-coupling regular-expression assertions in the base public-surface suite;
manual inspection confirms they execute no access.

## Canonical gates

From `outputs/start-five` with the pinned desktop Node/pnpm runtime:

```powershell
pnpm exec jest --runInBand --ci --coverage=false --detectOpenHandles --roots tests/gap-p0-03a tests/gap-p0-03a-review1
pnpm exec jest --runInBand --ci --coverage=false --roots tests/gap-p0-01a
pnpm exec jest --runInBand --ci --coverage=false --roots tests/gap-p0-01a2
pnpm exec jest --runInBand --ci --coverage=false --roots tests/gap-p0-02a
pnpm exec jest --runInBand --ci --coverage=false --roots tests/gap-p0-02b
pnpm exec jest --runInBand --ci --coverage=false --roots tests/locked tests/review1 tests/review2 tests/review3 tests/review4 tests/phase4 tests/phase4-review tests/phase4-review2 tests/phase4-review3 tests/phase4-review4 tests/phase4-review5 tests/native-scaffold tests/native-review tests/gap-p0-01a tests/gap-p0-02a
pnpm exec tsc --noEmit
```

Before repair, the first gate must exit 1 with exactly 32 feature failures and
60 passes. After an accepted test identity and production repair, the same
immutable 10-suite / 92-test gate plus every frozen regression and TypeScript
gate must be green. Then a brand-new independent code reviewer must review the
repair. A green Jest result alone is never delivery.

## Manifest construction

`GAP_P0_03A_REVIEW1_LOCK.sha256` is generated last. It lists, in canonical
case-insensitive POSIX relative-path order:

1. `GAP_P0_03A_REVIEW1_TEST_SPEC.md` and the controlled-revised
   `GAP_P0_03A_TEST_SPEC.md`;
2. every regular TypeScript file directly below `tests/gap-p0-03a/`; and
3. every regular TypeScript file directly below `tests/gap-p0-03a-review1/`.

It excludes itself, the revoked old manifest, and both audit-only changelogs.
Each entry is exactly:

```text
<lowercase SHA-256><two spaces><canonical POSIX relative path>
```

The lowercase SHA-256 of the complete manifest is the candidate self identity.
Any listed-file drift revokes that identity and requires a new independent test
review before production repair.
