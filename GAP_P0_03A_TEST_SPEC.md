# GAP-P0-03A reminder scheduling and delay diagnosis test-first candidate

## Status and authority

Status: **REVOKED / IMPLEMENTATION CODE REVIEW FAILED / NEVER ACCEPTED /
NO PRODUCTION AUTHORITY**.

The former REVISION2 self
`1eac48d2c03dd020a6d85f748f7f2df8939275ebc86c6b57f51b3a49c5cff190`
is historical evidence only. Its tests became green, but the subsequent
independent implementation review found material durability, identity,
prototype-safety, numeric-validation, and recovery defects. It also proved one
contract contradiction: cold-start durable diagnosis-operation replay must
perform a read-only operation lookup before context, while the former
terminal/new-operation oracle prohibited every repository read. Those
requirements cannot both be satisfied.

The contradiction is being corrected only through the controlled
`GAP_P0_03A_REVIEW1_TEST_SPEC.md` candidate. That candidate requires exactly
one read-only durable operation lookup for each normalized diagnosis submit
command, while retaining zero transaction attempt, commit, write, clock, ID,
or diagnosis creation for a new command rejected by terminal/deleted or
incoherent context. Pre-command normalization failures such as an invalid
reason or over-limit private text remain I/O-free. This historical document
and its former self grant no repair authority.

This historical REVISION2 candidate superseded the planning assumptions in
`GAP_P0_03A_DESIGN_DRAFT.md`, which remains non-binding. Independent reviews
failed and explicitly revoked both former manifest selves
`47810aeadb68bb62282565e6f7fc5df2e7c837bcc66ee2481b55d69971d43aae`
and `9499146b7ed5f33390a59f97c64c07e39ea04006424b95c14e1b7f2d8be476c6`.
Neither was ever accepted or granted production authority.
`GAP_P0_03A_LOCK.sha256` is the content identity presented for review, and its
external self is recorded in `GAP_P0_03A_LOCK_CHANGELOG.md` after all gates and
final manifest generation. The manifest/self is a frozen review identity, not
an acceptance claim. No production agent may implement until a brand-new
independent test reviewer returns PASS and the Manager accepts that exact self.

The author changed only this specification, regular TypeScript files below
`tests/gap-p0-03a/`, the P0-03A content manifest, and its audit-only changelog.
The author did not change production, configuration, dependencies, native
projects, any prior test/specification/lock, or the separate
`outputs/qingji-ai` bookkeeping application.

## Authoritative inputs personally verified

The test author read the original
`C:\Users\25328\Desktop\app需求分析.docx`, the current manager backlog, the
non-binding 03A design draft, current production source, Jest/TypeScript/package
configuration, and the following exact frozen identities:

- GAP-P0-01A2 Task lifecycle behavior:
  `6b92c2b1183f9173893f64d605fbde1dde95b0da6c4400029bfc762f7eb43d30`;
- GAP-P0-02A FocusSession public foundation:
  `a6576289ac7488aa001a5313e688ef4725849778c1ea497ceb4d581c9f935a28`;
- GAP-P0-02B FocusSession behavior:
  `9389a01da6f468227de0edf5673c101fc3ea412ba3b24fddaff10a7cb0ab8bd8`.

The PRD sections that directly govern this candidate are task planning and
first-step fields, delay interaction, delay diagnosis, Focus interruption,
reminder types and intensity, reports, notification content/actions,
notification permission, privacy/offline/stability, MVP scope, the repeated-
delay user flow, and reminder-start success metrics.

The input review produced two binding corrections to the design draft:

1. The PRD supplies nine human diagnosis reasons, not the draft's five-category
   simplification: task too large, unclear how to start, fear of poor quality,
   boring, too tired, insufficient time, distracted, not necessary now, and
   other. The public service does not invent wire strings for them; the exact
   stable keys are supplied by explicit policy. Tests use one-to-one stable keys
   for all nine PRD reasons.
2. The PRD does not specify universal reminder offsets, repeated-delay counts,
   dismissal counts, risk window, progress threshold, private-text limit,
   timezone persistence format, or notification storage wire schema. Every one
   of those values is therefore an explicit policy/context input. This
   candidate does not silently turn an example number into product policy.

## Scope split

### 03A: platform-independent core

This candidate locks:

- pure reminder-plan derivation from a frozen A2 `Task`, explicit `now`, an
  explicit timezone context, explicit progress, and explicit rules;
- a transaction-based reminder coordinator using abstract durable-state plus
  platform-state query and atomic scheduler-replacement ports;
- tri-state permission results supplied by composition;
- deterministic generation replacement, cancellation, compensation, 03A-local
  replay/conflict, byte-only restart repair, deep isolation, and cross-facade
  behavior;
- pure delay-diagnosis eligibility from a Task, optional FocusSession, explicit
  current time, explicit signals, and explicit policy;
- diagnosis submission/query/summary behavior using coherent context and
  durable repository ports; and
- privacy boundaries for reminder intents, private diagnosis text, suggestions,
  errors, and summaries.

### 03B: deliberately deferred

03A does not select or import a notification package. iOS/Android permission
prompts, channels/categories, OS scheduling limits, lock-screen copy, deep
links, actions, background callbacks, application lifecycle listeners, clock
and timezone event sources, device storage adapters, and actual notification
delivery remain 03B work. The 03B adapters must later satisfy the ports already
locked here and require their own test-first/device review chain.

## Authorized future production boundary

After independent acceptance only, an implementation agent may add exactly:

- `src/application/reminderScheduling.ts`;
- `src/application/delayDiagnosis.ts`;
- minimum private helpers inside those two files.

No A2 or 02B public interface, Task/Focus repository, CoreFlow controller,
screen, native project, dependency, package script, Jest configuration, or
TypeScript configuration change is required or authorized by this candidate.

The two runtime modules own exact enumerable namespaces:

```text
reminderScheduling:
  createReminderSchedulingService
  deriveReminderPlan

delayDiagnosis:
  createDelayDiagnosisService
  deriveDelayDiagnosisEligibility
```

All other named public contracts are type-only exports. The exact structural
types and factory signatures are compiled with a real in-memory TypeScript
`CompilerHost`. Construction is synchronous and performs no repository/context
read, write, scheduler call, clock/ID call, timer, network access, native access,
or deferred microtask work.

## Reminder plan contract

### Explicit rule model

Each rule contains a stable ID, one PRD reminder kind, an anchor, a signed
integer minute offset, and either an explicit progress threshold or null:

```text
kinds: planning | start | progress | rescue | overdue_decision
anchors: scheduled_start | due
```

Rules anchored to a missing Task instant produce nothing. A progress-conditional
rule requires non-null progress strictly below its explicit threshold.
Unconditioned rules are not affected by progress. The diagnosis risk threshold
uses the same authoritative strict comparison. With explicit threshold `0.5`
and otherwise identical Task, risk-window, clock, Focus, and signal inputs,
`0.499999999999` qualifies while exact `0.5` and `0.500000000001` do not.

A2 already normalizes `scheduledStartAt`/legacy `startAt` and `dueAt` to
absolute instants. 03A therefore performs instant arithmetic and canonicalizes
results to millisecond UTC; it does not reinterpret those accepted instants as
host-local wall time. Changing the explicit timezone context re-evaluates the
plan deterministically but does not churn an unchanged absolute plan. Tests use
DST gap/overlap offset inputs and two timezone IDs to distinguish this from an
implicit host-time implementation.

Trigger times earlier than explicit `now` are expired and omitted. A trigger
exactly equal to `now` remains eligible. This prevents catch-up bursts while
leaving no one-millisecond gap at the boundary. Output is ordered by trigger
instant, then rule ID. Completed, cancelled, and deleted tasks produce no
intent even when their anchors are present.

Each intent contains only Task ID, rule ID, reminder kind, and canonical trigger
instant. It never embeds title, description, first step, diagnosis text, or
notification copy. Returned arrays and records are detached from caller input
and later derivations.

## Reminder coordination contract

The coordinator exposes exactly `reconcile` and `getState`. It receives the
complete explicit planning input plus a permission result and operation ID.

### Permission and generations

- First material state is generation 1.
- `denied` and `not_determined` preserve an explainable intent plan but mark it
  unscheduled; they never request permission.
- Initial blocked permission produces no scheduler call.
- A later grant atomically installs the plan; a later denial atomically removes
  it.
- Any changed plan or permission creates exactly the next generation.
- A title/quadrant-only edit or timezone-context change that leaves absolute
  instants unchanged performs no durable write. A semantically identical replay
  also performs no durable write; it performs no replacement only when the
  queried platform view already matches the durable expected generation.
- Terminal/deleted input replaces the current generation with an empty,
  unscheduled generation. Restart reconciliation cannot rebuild it.

The scheduler port deliberately exposes only `get(taskId)` plus atomic
`replace(previous, next)`, not a native package API. `get` returns a detached
snapshot of the currently installed schedule for that Task or null. A fulfilled
replace leaves exactly `next` authoritative when scheduled, and removes the
Task's platform schedule when `next.scheduled` is false; a rejected replace
leaves `previous` authoritative. 03B owns the platform-specific query,
replacement, and compensation necessary to satisfy that port. Replacement is
an exact compare-and-swap: the complete installed snapshot identity, generation,
permission, intents, and scheduled state must equal `request.previous`; a stale
or otherwise unequal previous snapshot rejects without changing platform bytes.

The repository transaction is the durable linearization boundary. If the
scheduler applies `next` but repository commit rejects, the coordinator invokes
the same atomic port to restore the exact logical previous generation before
rethrowing the original repository error. The failed operation is not bound and
is retryable. Scheduler rejection likewise leaves durable bytes unchanged and
is retryable. Tests use exact error object identity rather than invented wrapper
messages. The compensation oracle independently locks both complete requests:
forward `{previous: before, next: failed-new-generation}` followed by rollback
`{previous: failed-new-generation, next: before}`. The scheduler double enforces
the full previous snapshot rather than silently ignoring the CAS handle.

### 03A operation identity and deferred A2 shared-ledger slice

The reminder state retains a 03A-owned operation binding for its current
generation. The same operation and normalized fingerprint durably replays;
current-generation reuse with a different fingerprint rejects
`REMINDER_OPERATION_CONFLICT` with zero durable or platform mutation. Failed
work does not bind the operation. Tests prove this behavior after reconstruction
from copied repository bytes and an independently reconstructed platform view.

A2 remains the intended authoritative global ledger for operation IDs across
Task generations and mutation kinds, but the required A2 Review1 durable-ledger
interface has not been frozen and accepted. This REVISION2 self therefore does
**not** claim cross-service shared-ledger replay, conflict-before-reminder, or
atomic A2-to-03A dispatch. No test imports an A2 facade to simulate that missing
guarantee. That integration is a later controlled slice dependent on an
accepted A2 Review1 contract and requires new test-first review; it cannot be
inferred or implemented under this identity. Frozen A2 helpers remain usable
only as accepted Task fixtures and no-auto-mutation byte controls.

New facades reconstruct solely from copied durable repository bytes and an
independent byte-serialized scheduler view. On replay/restart, an empty platform
view, a view containing only unrelated Tasks, or a stale target generation must
converge to the durable expected generation without rewriting repository bytes.
Stale target data must be removed. A matching platform view performs no
replacement. No test shares a Map, promise, module registry, or prior returned
object. Two facades over one physical repository/scheduler pair are additionally
forced through a manual barrier and converge to one latest generation.

## Delay diagnosis eligibility contract

The detector is pure. Thresholds are supplied by policy and the result uses this
stable trigger order:

1. `scheduled_start_missed`;
2. `repeated_delay`;
3. `reminder_dismissed`;
4. `due_progress_risk`;
5. `user_stuck`;
6. `focus_interrupted`.

The scheduled-start trigger is inclusive at the planned instant only when the
Task has not actually started. Repeated-delay and dismissal thresholds are
inclusive. Due-risk is inclusive at the configured future window and requires
progress strictly below the configured ratio. A Focus trigger requires an
interrupted session whose Task ID matches. Completed, cancelled, or deleted
Tasks are wholly ineligible. An already-started Task is not classified as
missed solely because its planned time passed.

Eligibility creates no diagnosis automatically. Submission must name one
trigger present in the freshly derived result; otherwise it rejects
`DELAY_DIAGNOSIS_TRIGGER_NOT_ELIGIBLE` with no record.

Submission against a completed, cancelled, or deleted authoritative Task
rejects the stable code `DELAY_DIAGNOSIS_TASK_TERMINAL`. Each terminal class is
independently locked at service level: context may be read once, but repository
raw bytes remain null/unchanged, repository read and transaction-attempt counts
remain zero, no commit or record occurs, and clock/ID remain unused.

## Diagnosis submission, association, and privacy

The context port supplies one coherent authoritative Task and optional
FocusSession snapshot. Missing Task, missing requested session, and cross-task
session fail respectively with:

```text
DELAY_DIAGNOSIS_TASK_NOT_FOUND
DELAY_DIAGNOSIS_SESSION_NOT_FOUND
DELAY_DIAGNOSIS_SESSION_TASK_MISMATCH
```

The reason must match one explicit `allowedReasonKeys` entry. Invalid reason
rejects `DELAY_DIAGNOSIS_REASON_INVALID` before context, repository, clock, or
ID use. Private text is trimmed; blank becomes null. Its limit is explicit
Unicode code points, not UTF-16 units. Over-limit input rejects
`DELAY_DIAGNOSIS_PRIVATE_TEXT_TOO_LONG`, and the error must not contain the
private value. A whitespace-only value containing ASCII space, tab, newline,
non-breaking space, em space, and ideographic space is returned and persisted
as exact `null`, never an empty string. Byte-only restart, query, and operation
replay must retain `null`; repository/context diagnostics must not retain the
original whitespace sequence.

Private text is also forbidden from every failure surface for invalid reason,
ineligible trigger, missing Task/session, cross-Task association, operation
conflict, terminal Task, and storage commit failure. Every test line uses an
independent secret and inspects the direct error message, `String(error)`,
direct cause message/value, serialized error/cause exposure, serialized
repository bytes, and instrumented context/repository/clock/ID port logs. Only a
successful committed diagnosis may retain its private text in durable diagnosis
bytes; failure diagnostics and logs never do.

Suggestions are detached proposals only:

```text
first_step(value)
estimated_minutes(value)
reschedule(scheduledStartAt)
```

Persisting or querying a suggestion never invokes a Task or Focus mutation.
The test seeds real A2 Task bytes and real 02B Focus bytes and proves both remain
byte-identical after diagnosis submission and caller mutation.

Diagnosis operations are durably bound by normalized fingerprint. Same command
replays the first detached result with no context/clock/ID/write; conflicting
reuse rejects `DELAY_DIAGNOSIS_OPERATION_CONFLICT`. Two facades racing the same
operation use a manual commit barrier and converge to one record/commit. A
failed commit publishes neither diagnosis nor binding; the same operation may
retry. Clock and ID generation are attempt-scoped, so the retry consumes the
next scripted values and failed values never enter bytes.

Task queries sort `createdAt` descending then ID ascending. The ordering oracle
uses five records spanning three distinct timestamps, with three deliberately
out-of-order IDs sharing one timestamp; the independent expected constant kills
an implementation that sorts only by ID. Byte-only restart rehydrates diagnoses
and operation replay from copied serialized state. Every record, array,
suggestion, and replay result is deeply detached.

Summary contains only total and deterministic key/count arrays by stable reason
and trigger, each ordered by key. It never contains private text, suggestion
values, Task text, or Focus interruption text.

## Deterministic test infrastructure

The candidate uses test-only typed ports, not test implementations of product
planning or diagnosis behavior:

- byte-serialized reminder and diagnosis repository doubles with FIFO
  transactions, commit fault injection, and independent restart parsing;
- an independent byte-serialized scheduler view with detached `get`, exact
  full-snapshot compare-and-swap `replace`, mismatch/failure injection, and no
  shared Map state;
- scripted clock and ID sequences that fail loudly when exhausted;
- a coherent Task/Focus context double plus value-free port event logs used only
  to assert failure privacy and zero-side-effect ordering;
- manual Promise barriers with no timer, sleep, polling, or timeout heuristic;
- frozen A2 and 02B helpers only for accepted Task/Focus fixtures and the
  no-auto-mutation integration controls; and
- guarded `jest.requireActual` loading of the two real production modules.

No product test is conditional on feature presence. Missing modules produce
method-specific `GAP_P0_03A_IMPLEMENTATION_REQUIRED` failures while all suites
still discover. The candidate uses no network/device API, module replacement,
fake timer, snapshot assertion, TypeScript suppression, `any`, `as any`,
`as unknown`, skip/focus/todo, direct timeout/interval, sleep, polling, dynamic
self-consistent oracle, or weak existence-only behavior assertion.

## Candidate suite inventory

| Suite | Tests | Responsibility |
|---|---:|---|
| `publicSurface.contract.test.ts` | 4 | Real CompilerHost exact positive/negative types, exact runtime namespaces, zero-effect construction, no native/timer/network coupling |
| `reminderPolicy.contract.test.ts` | 9 | Explicit rule plan, anchors, exact/expired boundary, progress, DST/timezone, terminal filtering, privacy/detachment |
| `reminderCoordination.contract.test.ts` | 16 | Permission tri-state, latest generation, no churn, cancellation, 03A-local durable replay/conflict, exact forward/compensation CAS requests, empty/missing/stale platform restart repair, cross-facade barrier |
| `delayDiagnosis.contract.test.ts` | 35 | Isolated strict progress boundary, nine reasons, terminal rejection, association, failure privacy, whitespace-to-null restart/replay, suggestions, durable replay/conflict, rollback, three-time/tie ordering, summary, concurrency |
| `helperInvariant.control.test.ts` | 4 | Independent byte repositories, enforced full-snapshot scheduler CAS, rollback, and barrier controls |

The candidate contains **5 suites / 68 tests**, plus one typed non-suite helper.
The intended pre-implementation split is **64 product-contract red / 4 helper
control green**.

## Executed candidate and regression evidence

The following evidence was recorded on 2026-08-05 from `outputs/start-five`
with pinned local Node/pnpm. No test or helper content changed after the final
03A candidate run:

- P0-03A REVISION2: 5 suites / 68 tests, exactly 4 product suites failed and 1
  helper suite passed; exactly 64 product-contract tests were red and all 4
  helper controls were green. Every product failure traced to the deliberate
  absence of the two authorized production modules: the real CompilerHost
  surface tests observed missing-module diagnostics, while guarded runtime
  loaders reported `GAP_P0_03A_IMPLEMENTATION_REQUIRED`. Jest reported 0
  snapshots, 20.775 seconds, and no open-handle warning under
  `--detectOpenHandles`.
- Frozen GAP-P0-01A2: 10 suites / 91 tests green, 0 snapshots, 6.152 seconds.
- Frozen GAP-P0-01A: 3 suites / 10 tests green, 0 snapshots, 10.016 seconds.
- Frozen GAP-P0-02B: 11 suites / 252 tests green, 0 snapshots, 12.402 seconds.
- Frozen GAP-P0-02A: 4 suites / 13 tests green, 0 snapshots, 16.964 seconds.
- Accepted/formally repaired baseline: 57 suites / 353 tests green, 0
  snapshots, 58.215 seconds.
- Global `pnpm exec tsc --noEmit`: exit 0 with zero diagnostics.
- Case-sensitive PowerShell-native bypass scan: 6 candidate TypeScript assets,
  zero hits across unsafe casts, explicit `any`, suppressions, Jest
  replacement/skip/focus/todo, fake or wall timers, snapshots, and
  reflection/dynamic-function, network, or native-access patterns. Separate
  scope scans found no A2 facade/shared scheduler-current usage and no Map in
  the scheduler section; scheduler state is byte-serialized, with the only
  test-helper Maps belonging to the diagnosis context fixture.
- Stable-lock audit: 17 manifests / 113 entries, zero missing manifests/files,
  malformed lines, unsafe/duplicate/self paths, ordering failures, content SHA
  mismatches, or manifest-self mismatches. This consists of the historical
  accepted/formally repaired 15-manifest / 87-entry baseline plus frozen valid
  GAP-P0-01A2 (12 entries) and GAP-P0-02B (14 entries).
- The audit explicitly excluded active GAP-P0-01A2 Review1, GAP-P0-02B Review1
  draft, GAP-P0-04, the rejected QUALITY_GATE identity, the revoked
  QUALITY_GATE_V2 candidate, and this P0-03A candidate. None is silently
  promoted into the accepted baseline.

## Required gates before signing

From `outputs/start-five` with pinned Node/pnpm:

```powershell
pnpm exec jest --runInBand --ci --coverage=false --detectOpenHandles --roots tests/gap-p0-03a
pnpm exec jest --runInBand --ci --coverage=false --roots tests/gap-p0-01a2
pnpm exec jest --runInBand --ci --coverage=false --roots tests/gap-p0-01a
pnpm exec jest --runInBand --ci --coverage=false --roots tests/gap-p0-02b
pnpm exec jest --runInBand --ci --coverage=false --roots tests/gap-p0-02a
pnpm exec jest --runInBand --ci --coverage=false --roots tests/locked tests/review1 tests/review2 tests/review3 tests/review4 tests/phase4 tests/phase4-review tests/phase4-review2 tests/phase4-review3 tests/phase4-review4 tests/phase4-review5 tests/native-scaffold tests/native-review tests/gap-p0-01a tests/gap-p0-02a
pnpm exec tsc --noEmit
```

The author must also verify every previously accepted/frozen manifest with zero
drift, exclude rejected/draft/active candidates explicitly, and run a
case-sensitive candidate bypass scan. After the recorded gates are clean, the
author generates the content manifest last, records its external self identity,
and freezes it as **CANDIDATE / FROZEN FOR REVIEW / UNVERIFIED / NO PRODUCTION
AUTHORITY**. The author then stops for a brand-new independent test reviewer and
does not implement production.

## Historical review gate (superseded)

The gate below records what REVISION2 required before its implementation. It is
superseded and must not be used to authorize repair. Only the exact Review1
manifest, after a brand-new independent test-review PASS, can become repair
authority.

An independent test reviewer must personally rerun the candidate, frozen
regressions, TypeScript, manifest audit, and bypass scan; verify the recorded
`GAP_P0_03A_LOCK.sha256` self identity; and inspect semantic strength rather
than relying on this author's counts. The manifest is a review identity, not an
acceptance claim. Only after PASS may the Manager mark this exact identity
accepted and dispatch production repair. A review finding revokes this identity
and requires changed content, a new manifest/self, and another independent
review. The implementation must then make all locked 03A tests green without
test changes and must pass a new independent code review. A green Jest run alone
is never delivery.
