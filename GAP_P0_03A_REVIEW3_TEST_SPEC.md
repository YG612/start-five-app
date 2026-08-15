# GAP-P0-03A Review3 test-first specification

## Status and sole authority

Status: **PENDING ONE INDEPENDENT TEST REVIEW / NOT ACCEPTED / NO
PRODUCTION-REPAIR AUTHORITY**.

This document and the regular TypeScript files directly below
`tests/gap-p0-03a-review3/` form the only executable P0-03A Review3 candidate.
They are a complete, self-contained replacement for the former P0-03A and
Review1/Review2 candidates. No earlier P0-03A specification or test root is a
required-green dependency of this gate.

The Review2 manifest self
`ab2fb77d354402ecf135a8f5ab4ac450d68c3a49bc431826bc233f12cea660df`
is **REVIEW FAILED / NEVER ACCEPTED**. Its exact 13-file identity remains
historical audit evidence only. Review2 incorrectly mutated the suggestion
inside a previously submitted command and then reused the same operation ID
while expecting a matching replay, even though suggestions belong to the
command fingerprint. The complete Review2 manifest and all 13 listed assets
must remain byte-exact and grant no production authority.

The Review1 manifest self
`e4cfd44dc706467eab478278030f9f83d0d7fe0e0afbf7fcf9eaa310d0866c8b`
is **REVIEW FAILED / NEVER ACCEPTED**. Its exact 14-file identity remains
historical audit evidence only. The older implementation-review-failed self
`1eac48d2c03dd020a6d85f748f7f2df8939275ebc86c6b57f51b3a49c5cff190`
is likewise **REVIEW FAILED / NEVER ACCEPTED / REVOKED**. Neither identity
authorizes production work.

The former Review3 candidate self
`41ae2c33ffe1d1ae37b208d400fe9068c87b004e7639522b8ee6af3eb7067d19`
is **REVIEW FAILED / NEVER ACCEPTED / NO PRODUCTION AUTHORITY**. Independent
review found incomplete proof of normalized fingerprint coverage,
transaction-local collision authority, and recursively frozen port values.
This corrected Review3 generation replaces that identity without creating a
Review4 generation.

The test author may add only this Review3 specification, its new test root,
the Review3 manifest, and its audit changelog. Production source, package or
compiler/Jest configuration, native projects, other tests/locks, and the
separate bookkeeping application are outside this authorship boundary. A
production repair may start only after an independent reviewer accepts the
exact Review3 manifest self recorded later.

## One diagnosis-submit contract

There is one contract, with no zero-read exception hidden in another section:

1. Submission first performs synchronous command normalization. An invalid
   `reasonKey` rejects `DELAY_DIAGNOSIS_REASON_INVALID`; over-limit normalized
   private text rejects `DELAY_DIAGNOSIS_PRIVATE_TEXT_TOO_LONG`. Either failure
   occurs before **all** repository, context, event, clock, and ID I/O:
   `readCount=0`, `readOnlyOperationLookupCount=0`, `events=[]`, zero context
   load, zero transaction attempt/save/commit, and zero clock/ID call.
2. Every normalized (therefore valid) submit performs exactly one public,
   read-only durable `getOperation(operationId)` lookup before context, clock,
   ID generation, or transaction. The lookup is a real repository read; it is
   not a process cache and not a transaction.
3. A matching durable operation replays its detached first diagnosis after
   that single lookup. A conflicting fingerprint rejects
   `DELAY_DIAGNOSIS_OPERATION_CONFLICT`. Both paths perform zero context,
   clock, ID, transaction, save, commit, or write.
4. A brand-new operation loads authoritative context only after the lookup.
   Terminal/deleted Task, missing Task/session, Task/session identity mismatch,
   cross-Task session, and ineligible trigger failures perform, beyond the one
   lookup and one required context load, zero transaction, save, commit, write,
   clock, ID, event-record creation, or diagnosis creation.
5. A valid new diagnosis then enters exactly one repository transaction. Its
   transaction-local `getOperation` is the atomic collision/race check and is
   not a second public preflight lookup. Diagnosis plus operation binding commit
   together or neither becomes durable.

The valid-reason/over-limit executable oracle deliberately kills the minimal
bad ordering `reason validation -> durable lookup -> private-length
validation`: it names a configured reason and asserts every read/event/side
effect remains zero.

## Durable byte-only replay and operation safety

`DelayDiagnosisRepository` exposes exactly the existing list/transaction
ports plus the read-only `getOperation(operationId)` port. A cold-start replay
is proved by committing once, copying only serialized repository bytes, and
constructing a new physical backend, repository, service, context, clock, and
ID source. No Map, Promise, returned object, module state, or facade state is
shared.

The restarted matching operation must replay before a context port configured
to throw. It performs exactly one read-only lookup and no other I/O, keeps bytes
unchanged, and is replayable even if the Task is now completed, cancelled, or
deleted. Conflicting reuse is also detected before unavailable context and
must not leak the conflicting private text.

The operation fingerprint includes every normalized command value, including
the complete ordered suggestion list and every suggestion value. Detachment
does not weaken that identity rule. A caller may mutate a separately owned
suggestion source after a completed call without changing the returned result
or durable bytes, but a later successful replay must submit a newly
constructed command whose values are exactly equivalent to the first command,
including the original suggestion value. Reusing the same operation ID with
the caller-mutated suggestion is a conflict. That conflict performs exactly
one new read-only operation lookup and zero new context, clock, ID,
transaction, save, commit, write, event record, or diagnosis creation.

Two facades racing one operation use the physical repository's serialized
transaction boundary and converge to one durable diagnosis/binding. A failed
commit publishes neither record nor binding, and the same operation remains
retryable with the next attempt-scoped clock and ID values.

The corrected cold-start matrix changes each normalized command field
independently: `taskId`, `focusSessionId`, all four signal values, `trigger`,
`reasonKey`, normalized `privateText`, every suggestion payload, and suggestion
order. Each semantic change conflicts after one public lookup and before all
other I/O. Whitespace-distinct private text that normalizes to the same value
must replay, preventing raw-input overlocking.

The corrected collision oracle makes both public operation lookups observe
durable `null` before either transaction starts. A test-owned two-party barrier
then admits both transaction requests without timers. Transaction-local
`getOperation` must return exactly one `null` and one existing binding and must
decide creation: exactly one diagnosis, binding, clock value, ID value, and
commit may result.

## Authoritative context, eligibility, and identity

Context is coherent only when:

- returned `task.id` equals the requested `taskId`, else
  `DELAY_DIAGNOSIS_TASK_ID_MISMATCH`;
- when requested, returned `focusSession.id` equals the requested ID, else
  `DELAY_DIAGNOSIS_SESSION_ID_MISMATCH`; and
- `focusSession.taskId` equals the authoritative Task ID, else
  `DELAY_DIAGNOSIS_SESSION_TASK_MISMATCH`.

Each mismatch retains the common one-lookup rule and then performs one context
load, but no transaction/write/commit/clock/ID. Private text remains absent
from the direct error, string and serialization channels, causes, durable
bytes, and value-free instrumented port logs.

Eligibility supports exactly these triggers: missed scheduled start, repeated
delay, dismissed reminder, due-progress risk, explicit user-stuck, and an
interrupted FocusSession associated with the Task. Thresholds are explicit
policy inputs. Repeated counts are inclusive; due-risk window is inclusive and
progress is strictly below its threshold. Started Tasks are not classified as
missed solely because their planned time passed. Completed, cancelled, and
deleted Tasks are wholly ineligible. Submission never creates a diagnosis for
a trigger absent from the freshly authoritative eligibility result.

The nine PRD reason keys are exact data values: `task_too_large`,
`unclear_how_to_start`, `afraid_of_poor_quality`, `boring`, `too_tired`,
`not_enough_time`, `distracted`, `not_necessary_now`, and `other`. The test
policy supplies thresholds and private-text limits explicitly; those numbers
are test inputs, not universal product defaults.

## Diagnosis records, privacy, queries, and summaries

The complete durable diagnosis record is:

```text
id, taskId, focusSessionId, trigger, reasonKey, privateText,
suggestions[], createdAt
```

The reason must equal one explicit `allowedReasonKeys` entry. Private text is
trimmed by Unicode code point; whitespace-only text becomes exact durable
`null`. The limit is an explicit policy input. Suggestions are detached
proposals only (`first_step`, `estimated_minutes`, or `reschedule`) and never
mutate Task or FocusSession bytes automatically.

Every failure path keeps private text out of error/cause strings and
serialization, logs, and durable bytes. Only a successfully committed diagnosis
may store it. Reminder intents never contain Task title, description, first
step, diagnosis text, or suggestion values.

Task queries order `createdAt` descending and then ID ascending. Byte-only
restart preserves exact records, whitespace-to-null normalization, replay, and
ordering. Summary output contains only total plus deterministic key/count
arrays ordered by code-unit key. Reason/trigger keys are untrusted data:
`__proto__`, `constructor`, `toString`, `hasOwnProperty`, canonically distinct
Unicode sequences, CJK, and emoji must count exactly without altering or
inheriting from `Object.prototype`. Summary output contains no private or
suggestion value.

## Readonly and detachment oracle

All public inputs and outputs and all repository/context/scheduler values may
be deeply frozen `Readonly` values. Correct code and this candidate must not
require them to be writable.

Positive controls apply a real recursive `Object.freeze` walk to nested
reminder and diagnosis inputs and to detached values returned by repository,
scheduler, and context ports. Successful create/replay/query flows must not
sort, assign, delete, or otherwise mutate those values, and caller-owned result
clones must remain detached from later repository queries.

Detachment is therefore verified without assigning to, deleting from, or
calling `Object.defineProperty` on a production return value. The executable
oracles instead use structural read-only comparison, mutate a separately owned
input source after the call, or mutate a caller-created clone and then verify
the first result, repeated query/replay, independent durable bytes, and other
aggregate behavior remain exact. A conforming implementation is free to return
deep-frozen values. The suggestion detachment oracle never attempts to mutate
a production return. After changing only the separately owned source object,
it uses a fresh value-equivalent command for successful replay and separately
asserts that the changed command conflicts.

## Reminder-plan contract and fail-fast validation

Reminder rules are explicit inputs with ID, kind, anchor, integer minute
offset, and nullable progress threshold. Anchors use A2-normalized absolute
scheduled-start/due instants. Output is millisecond UTC, includes a trigger
exactly equal to `now`, excludes past triggers, and sorts by trigger instant
then rule ID. Terminal/deleted Tasks produce no intent. Permission remains
tri-state (`granted`, `denied`, `not_determined`). No example number is silently
promoted to product policy.

Both pure `deriveReminderPlan` and coordinator `reconcile` validate rules
synchronously before repository or scheduler I/O. Stable errors are:

- duplicate rule ID: `REMINDER_RULE_ID_DUPLICATE`;
- offset `NaN`, either infinity, or non-integer:
  `REMINDER_RULE_OFFSET_INVALID`;
- finite integer offset whose derived Date exceeds the ECMAScript valid range:
  `REMINDER_TRIGGER_TIMESTAMP_OUT_OF_RANGE`; and
- progress threshold `NaN`, either infinity, below zero, or above one:
  `REMINDER_RULE_PROGRESS_THRESHOLD_INVALID`.

No validation path exposes a native `RangeError`. The gate asserts zero
repository read/transaction/save/remove/commit, scheduler query/replace, and
platform-byte mutation for every invalid rule.

## Reminder coordination, atomicity, and recovery

The repository transaction is the durable linearization boundary. First
material state is generation 1; each semantic change increments once.
Semantically unchanged reconciliation does not churn durable bytes. The
scheduler exposes only detached `get(taskId)` and exact full-snapshot CAS
`replace({previous,next})`. Missing, stale, orphaned, and already-current
platform views converge deterministically without deleting unrelated state.

The current reminder record owns a local operation ID/fingerprint. Matching
reuse replays; conflicting current-generation reuse rejects
`REMINDER_OPERATION_CONFLICT` with no mutation. Cross-service global A2 ledger
integration remains a separate accepted slice and is not invented here.

Reminder fingerprint coverage changes normalized semantic state only:
permission, rule-derived intent identity/kind/instant, progress-conditioned
membership, accepted Task anchor instants, terminal state, and scheduled state.
Title/description/first-step text, timezone labels over absolute instants, an
earlier `now` that leaves the plan unchanged, and rule input order that yields
the same canonical plan remain matching replay and must not be overlocked.

If forward scheduler replacement succeeds and durable commit fails, the
coordinator attempts the exact reverse CAS. If reverse compensation succeeds,
the original repository error is rethrown. If both durable commit and reverse
CAS fail, the stable error must expose:

```text
code: REMINDER_RECOVERY_REQUIRED
recoveryRequired: true
cause: exact repository commit Error object
rollbackCause: exact scheduler rollback Error object
```

Neither cause may expose private Task text. Durable bytes remain exact `before`
while platform bytes may remain exact `next`. A brand-new facade built only
from those copied bytes must retry to exactly generation 2 without duplicate
platform replacement or generation 3. Controls retain valid convergence for
repository-before/platform-stale and repository-null/platform-generation-1
orphan states.

## Platform boundary

P0-03A is platform-independent application core. It selects no notification
package, requests no OS permission, schedules no native notification, registers
no callback/listener/timer, and defines no device storage adapter. Native
delivery, categories/actions, channels, background/lifecycle work, and device
verification remain P0-03B.

The exact public core surface is the two production modules
`reminderScheduling` and `delayDiagnosis`, with the typed planning/eligibility
functions and service factories exercised by `publicSurface.contract.test.ts`.
Factory construction is synchronous and performs zero repository/context/
scheduler/clock/ID I/O and starts no deferred work.

After exact test acceptance, the only authorized production repair boundary is
the minimum internals of:

- `src/application/delayDiagnosis.ts`; and
- `src/application/reminderScheduling.ts`.

No Task/Focus public model, A2/02B repository, UI, native project, package,
dependency, or configuration change is authorized by this candidate.

## Candidate inventory and current-production baseline

The new root is fully self-contained: it owns both typed test helpers and all
ten suites. It imports production modules, the frozen A2 fixture factory, the
P0-02A in-memory typecheck helper, and the P0-02B FocusSession persistence
fixture. It imports no earlier P0-03A test helper, test root, or specification.

| Suite | Tests | Current green | Current red |
|---|---:|---:|---:|
| `publicSurface.contract.test.ts` | 6 | 5 | 1 |
| `reminderPolicy.contract.test.ts` | 9 | 9 | 0 |
| `reminderCoordination.contract.test.ts` | 27 | 27 | 0 |
| `delayDiagnosis.contract.test.ts` | 35 | 25 | 10 |
| `helperInvariant.control.test.ts` | 4 | 4 | 0 |
| `durableOperationReplay.contract.test.ts` | 21 | 0 | 21 |
| `contextCoherence.contract.test.ts` | 3 | 0 | 3 |
| `summarySafety.contract.test.ts` | 1 | 0 | 1 |
| `reminderValidation.contract.test.ts` | 11 | 0 | 11 |
| `reminderRecovery.contract.test.ts` | 4 | 3 | 1 |
| **Total** | **121** | **73** | **48** |

The canonical current-production run completed normally at 10 suites / 121
tests: 73 legitimate passes and 48 expected feature failures, exit 1, zero
snapshots, and no open-handle warning. The over-limit pre-I/O control remains a
legitimate green because current production already normalizes length before
I/O. The three reminder recovery controls remain legitimate greens for
already-new, stale, and initial-orphan platform views. Tests are not weakened
merely to force red. Relative to the rejected 93-test identity, exactly 28
tests were added: 15 expected-red diagnosis safety oracles and 13 green
reminder-normalization/deep-freeze controls.

## Canonical verification gates

From `outputs/start-five` with the pinned local Node runtime:

```powershell
node node_modules/jest/bin/jest.js --runInBand --ci --coverage=false --detectOpenHandles --roots tests/gap-p0-03a-review3
node node_modules/jest/bin/jest.js --runInBand --ci --coverage=false --roots tests/gap-p0-01a
node node_modules/jest/bin/jest.js --runInBand --ci --coverage=false --roots tests/gap-p0-01a2
node node_modules/jest/bin/jest.js --runInBand --ci --coverage=false --roots tests/gap-p0-02a
node node_modules/jest/bin/jest.js --runInBand --ci --coverage=false --roots tests/gap-p0-02b
node node_modules/jest/bin/jest.js --runInBand --ci --coverage=false --roots tests/locked tests/review1 tests/review2 tests/review3 tests/review4 tests/phase4 tests/phase4-review tests/phase4-review2 tests/phase4-review3 tests/phase4-review4 tests/phase4-review5 tests/native-scaffold tests/native-review tests/gap-p0-01a tests/gap-p0-02a
node node_modules/typescript/bin/tsc --noEmit
```

Before repair, the first gate must exit 1 with exactly 48 feature failures and
73 passes. After independent acceptance and production repair, the exact
immutable 121-test gate, frozen 01A/01A2/02A/02B regressions, formal 15-root
baseline, TypeScript, accepted-lock audit, and forbidden-pattern audit must all
be green. A brand-new independent code reviewer must then review the repair; a
green Jest result alone is never delivery.

The Manager has confirmed that the separately owned Native Scaffold / quality
gate formal aggregate is green again. This corrected generation reran the
isolated Review3 gate. The previously green 01A2 and 02B roots do not import
this Review3 root, so their evidence is unaffected by these test-only edits.
The corrected TypeScript command was requested, but external runtime approval
was interrupted without diagnostic output; a fresh independent reviewer must
therefore confirm `tsc --noEmit` before acceptance. Formal/registry execution
remains an integration-stage gate and is not duplicated during this isolated
test-candidate signature.

## Manifest and immutability

`GAP_P0_03A_REVIEW3_LOCK.sha256.candidate` is generated after isolated test
evidence and mechanical inventory/format checks. Independent acceptance still
requires the TypeScript and regression gates above. It lists, in canonical
case-insensitive POSIX-relative order:

1. `GAP_P0_03A_REVIEW3_TEST_SPEC.md`; and
2. every regular TypeScript file recursively below
   `tests/gap-p0-03a-review3/`.

It lists no earlier P0-03A spec/test root and excludes itself and the audit-only
changelog. Each line is exactly:

```text
<lowercase SHA-256><two spaces><canonical POSIX relative path>
```

The lowercase SHA-256 of the complete manifest is the candidate self identity.
After signing, no listed byte may change. Any drift revokes the identity and
requires a new test-first revision and brand-new independent review.
