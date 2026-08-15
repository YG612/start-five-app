# GAP-P0-01A2 Review1 additive regression candidate specification

## Status, authority, and immutable boundaries

Status: **RECORDED FOURTH-ROUND CANDIDATE; awaiting a fourth brand-new
independent test review.**

This additive test-first candidate responds only to the two defects found by
the final independent code review of the accepted GAP-P0-01A2 implementation:

1. the generic 256-array/512-container untrusted-value guard is incorrectly
   applied to the entire product task collection, creating a hidden lifetime
   task cap; and
2. successful lifecycle operation bindings live forever in an in-memory Map,
   while physical process restart loses them and can repeat create or delay.

The accepted and immutable GAP-P0-01A2 manifest self identity remains:

```text
6b92c2b1183f9173893f64d605fbde1dde95b0da6c4400029bfc762f7eb43d30
```

The first three Review1 draft identities were rejected by successive independent
test reviews:

```text
369653843c7389e00f661f212fac84acdfc9f489efb74c75247d8624a867c944
107dc61f8835d6d1495ec951281f29ee2f8560c16353c50a9e7526aa1ac1ea58
14047cb675218974b6cf856d46735ead5b63aed82bd8ee51b27ab67fb84c89ca
```

All three are revoked and grant no repair authority. This fourth-round candidate
incorporates every finding from all three reviews and requires a fourth, brand-new
independent reviewer.

The previously blocked execution gates were restored and run against the exact
fourth-round content. The candidate completed normally with 3 suites / 20 tests,
14 expected feature failures / 6 passing controls, zero snapshots, and no
timeout or open-handle warning. Frozen A2, A1, and the formal baseline are green;
the main TypeScript check, stable-lock audit, candidate inventory, and bypass
scans are also green. The manifest issued for this exact content is review
authority only: it grants no production-repair authority until the required
fourth independent reviewer accepts it.

This candidate does not amend or replace that contract. It adds only this
specification, regular files recursively below
`tests/gap-p0-01a2-review1/`, its own manifest, and an audit-only changelog.
The author changes no frozen A2 file, production source, dependency or package
file, native project, GAP-P0-02B/P0-04/QUALITY_GATE asset, earlier lock, or the
separate `outputs/qingji-ai` app.

No production repair is authorized until a new independent reviewer accepts
the final candidate identity. After acceptance, this specification and every
regular file below the new test root are immutable. The test author neither
implements the repair nor performs its code review.

## Frozen behavior that remains authoritative

The exact A1/A2 public types and runtime namespaces remain unchanged. In
particular, `TaskLifecycleService` still has exactly eleven methods, its factory
options remain exactly `repository`, `now`, and `idGenerator`, and every one of
the six mutation methods still requires the existing exact
`{operationId: string}` options record. This candidate adds no lifecycle
method, option, result property, Task field, or runtime export.

All accepted A2 normalization, error, clock/ID attempt, transaction,
idempotency, concurrency, detached-result, query, scheduling, score, and
tombstone semantics continue to apply. The same normalized operation ID and
command must permanently replay its first result; reuse across a different
kind, target, or normalized payload must remain `OPERATION_ID_CONFLICT`.
Replay and conflict consume zero task write, clock, and generated ID. Failure
does not reserve a successful operation binding and remains retryable under
the accepted attempt-scoped generator rules.

## Resource-budget layering and the product collection

The Phase4 plain-data defenses are security boundaries for one untrusted value,
not product cardinality limits. They remain exact:

- one ordinary array may contain at most 256 elements;
- one materialized value graph may contain at most 512 unique containers;
- the accepted depth, cycle, Proxy, accessor, symbol, sparse-array,
  non-finite-number, exact-key, and semantic validation defenses remain;
- a single Task's own `subtasks` array accepts 256 legal children and rejects
  257; and
- hostile Task/patch input remains fail-closed without leaking trap text or
  writing bytes.

The logical top-level product task collection is different. It supports an
arbitrary ordinary count and has no hidden 256, 512, or tombstone-derived cap.
Validation must process that trusted collection incrementally or through
bounded durable units while applying the full existing Task semantics to each
record and global ID uniqueness across all units. A repair may use a new
version, pages, shards, an index, streaming validation, compression, or another
equivalent design. Candidate tests do not name its keys, schema, page size, or
algorithm.

The boundary oracle starts from a legal current V1 envelope containing 255
records, proves read-only hydration is byte-silent, then creates records 256
and 257. A second path starts with 255 legal soft-deletion tombstones, creates
258 further records through the real repository, then creates record 514
through the lifecycle service. Its late records deliberately cross storage
boundaries and quadrants: logical records 510, 511, 512, 513, and 514 are Q2,
Q3, Q4, Q4, and Q1 respectively. Record 514 is the sole highest-priority
eligible recommendation. It proves:

- default and `includeDeleted` list cardinalities and durable insertion order;
- exact visible quadrant counts `[1, 1, 1, 256]`, exact key ordering across the
  late Q4 records, complete projection `allTasks`, preview size three, and
  coherent query totals;
- an exact recommendation ID for the unique post-512 Q1 task, rather than a
  merely non-null recommendation;
- global ID uniqueness across durable units: a fresh facade attempting to
  create the early `active-001` ID after record 514 receives
  `TASK_ALREADY_EXISTS`, performs no set/remove, and leaves the complete raw
  byte map unchanged;
- continued create/update/soft-delete after crossing both former boundaries;
- a genuinely new backend facade reparses and returns the complete collection;
- caller mutation of create input, mutation results, lists, projections, and
  query results cannot alter durable state; and
- each independently stored JSON unit still passes the same generic 256/512
  materialization guard.

Tombstones remain durable history and visible under `includeDeleted`, but they
never consume a finite product slot that blocks future creation.

## Current V1 and active GAP-P0-04 coordination

GAP-P0-04 remains authoritative for the exact current V1 task envelope and its
documented V0/default/raw migrations, quarantine, recovery, and fail-closed
rules. This candidate therefore requires:

- every previously legal V1 value remains readable without a write, sidecar,
  clock, ID, or eager upgrade;
- no ledger field is added to the exact V1 `{schema, version, tasks}` envelope;
- the P0-04 one-argument compatibility overload and all currently locked small
  V1 migration/recovery fixtures remain unchanged; and
- if a scalable representation beyond the V1 single-value budget is used,
  active P0-04 code must treat an unrecognized future representation as
  unsupported and preserve it byte-for-byte rather than downgrade, truncate,
  quarantine as corrupt, or silently replace it.

The scalable task representation and lifecycle operation metadata may use
additive private durable records. Their mutations must share the same physical
backend coordination boundary as P0-04 management. This candidate does not
modify P0-04 files or prescribe its future managed-schema extension.

## Durable operation identity

The process-local operation table may contain only currently in-flight work.
Concurrent same-command callers still converge on one in-flight mutation, but
both success and failure release that Promise/result record after settlement.
A later replay, including on the same service instance, consults durable
operation metadata. A controlled sidecar read failure after success must
therefore surface `TASK_STORAGE_READ_FAILED` with the caller-provided backend
fault as its identical `error.cause`; it cannot be hidden by a retained completed
Promise. The failed read performs zero set, remove, or forward mutation and
preserves the complete serialized raw map byte-for-byte. Retry on that same
service after the one-shot read failure returns the exact first result with the
same zero mutation counts and unchanged raw bytes.

Every successful mutation durably binds all of the information required by the
frozen A2 contract:

- normalized operation ID;
- mutation kind, target where present, and normalized command fingerprint;
- a detached first result sufficient for exact replay; and
- a deterministic digest or equivalent state binding that proves which task
  state the entry belongs to.

The metadata is versioned and stored outside the exact task V1 envelope. The
tests require only that surviving non-primary JSON records have a numeric
version and remain inside the generic materialization budget; they do not lock
key names or a concrete envelope. Create and each of update, soft-delete,
complete, reschedule, and delay get an independent single-record oracle. Each
oracle saves the complete serialized raw bytes after the first success, rebuilds
a real module-isolated runtime solely from those bytes, exactly replays the
result, and then submits a different target or normalized payload under the same
operation ID to require `OPERATION_ID_CONFLICT`. Immediately after both replay
and conflict, the reconstructed backend has empty set attempts, remove attempts,
and unified forward mutations; its raw bytes are identical to the saved string,
and clock/ID consumption is zero. Create conflict and a conflict against an old
high-volume operation remain side-effect free. Every returned task/completion
result is detached.

For operation-ledger restart or replay oracles, a new facade alone is
insufficient. The test serializes the complete sorted raw key/value map,
constructs a backend by parsing only that string into a new `Map`, and proves
the source and restored stores do not share mutations. It then uses
`jest.isolateModulesAsync` with real dynamic imports of persistent storage,
repository, and lifecycle modules. Jest restores the outer module registry
when the isolated callback finishes. No mock, replacement, shared backend
coordinator, production module instance, completed Promise, Map entry, or
object reference crosses that boundary. A module-level table holding the full
result plus a placeholder durable sidecar therefore cannot satisfy replay.

## Bounded-state decision

Permanent exact replay for arbitrary IDs cannot coexist with deleting all
information about old IDs. TTL expiry or simple capacity eviction would make a
later create/delay retry indistinguishable from a new command and is therefore
prohibited. This candidate chooses bounded persistent units rather than silent
forgetting:

- each durable JSON unit must stay within the existing 256-array and
  512-container guard;
- implementations may shard, page, index, or compress those units;
- exactly 515 settled operation bindings must succeed: binding 1 is create,
  binding 2 is non-idempotent delay, and bindings 3 through 515 are 513 updates
  of the same target. The 1st, 2nd, 3rd, 256th, 257th, 513th, 514th, and 515th
  results must still replay exactly after a byte-only module-isolated restart
  with zero clock, generated ID, set, or remove. This rejects a hidden 512 cap
  scoped per mutation kind or target, not only a global ledger cap;
- the in-memory in-flight table releases every settled record; and
- no completed ID may be silently evicted or re-executed.

Total durable history necessarily grows with permanently replayable operations;
the bounded property is the size of each materialized unit and the active
in-memory working set. This is the information-preserving alternative to an
unsafe fixed lifetime capacity. If metadata is malformed or its task-state
binding no longer matches, mutations fail closed rather than guess or repeat.

## Recoverable linear atomicity

The accepted backend exposes only independent asynchronous `getItem`,
`setItem`, and `removeItem`; it has no multi-key transaction or compare-and-set.
It is therefore impossible to claim that task bytes and an additive ledger are
one physical write without breaking P0-04's exact V1 envelope. The required
guarantee is **recoverable linear atomicity**:

- before a success resolves, task state, durable operation binding, and any
  crash journal represent one committed logical mutation;
- a normal settled success leaves no cleanup that a restart must mutate;
- a caught failure at any dynamically observed forward write stage compensates
  every affected durable unit back to its exact pre-call bytes and does not
  publish staged cache state;
- the same operation ID can then retry and commit once;
- a fresh facade observing a committed intermediate write before the original
  caller settles deterministically completes/replays that same logical
  operation without another clock or generated ID; and
- if an interrupted state is divergent and cannot be proven as the before or
  after state, all new mutations fail closed with
  `TASK_OPERATION_LEDGER_INDETERMINATE` before task write, clock, or ID.

The failure matrix does not name a task key, sidecar key, schema, journal, or
write order. For both create and non-idempotent delay it first runs an
equivalent successful mutation and records every `setItem` and `removeItem` in
one ordered ordinal stream. It then rebuilds the identical pre-state and
injects an exact fail-before fault object at every observed ordinal, thereby
covering every dynamically observed mutation kind. Each successful flow must
contain a remove stage; every such remove ordinal is additionally failed after
the deletion has taken effect and before the backend call resolves. Every
point must surface `TASK_STORAGE_WRITE_FAILED` with the identical cause object,
restore the complete sorted raw map byte-for-byte, expose the old logical state
through the current facade, and permit the same operation ID to retry once. A
module-isolated replay rebuilt only from the retry's serialized raw bytes then
consumes zero dependency or backend mutation, proving create was not duplicated
and delay was not applied twice.

A commit-after-write barrier supplies a process-style interruption oracle.
While the original caller is still provably unsettled, a first fresh facade
recovers the result and queries the durable task. Before releasing the original
barrier, a second independently constructed facade replays the same detached
result with zero clock, ID, set, or remove. Only after both restart observations
finish is the blocked caller released. This distinguishes durable recovery from
sharing the original in-memory Promise.

## Corruption, external recovery, and stable errors

Malformed durable operation metadata rejects
`TASK_OPERATION_LEDGER_CORRUPT`; it is preserved, consumes no clock/ID, and
performs no set or remove. Both replay of an old operation and an otherwise
valid mutation carrying a brand-new operation ID fail with that code, and the
complete raw map remains byte-for-byte unchanged. Restoring the exact saved
metadata bytes makes the original operation replayable again. Unsupported and
semantically invalid future metadata may use the corresponding stable codes
`TASK_OPERATION_LEDGER_UNSUPPORTED` and `TASK_OPERATION_LEDGER_INVALID`.

Operation metadata is bound to canonical task state. If P0-04 or another
explicit recovery action replaces the valid V1 task bytes while old ledger
bytes remain, both an old replay and a brand-new operation-ID mutation fail
closed with
`TASK_OPERATION_LEDGER_STATE_MISMATCH`. They do not return a stale result or
execute create/delay again, consume clock/ID, set, remove, or edit any damaged
sidecar. The complete raw map remains unchanged. Ordinary read methods may
still expose the valid recovered task state. A future coordinated recovery
flow can replace or reconcile ledger metadata explicitly; silent
reconciliation is forbidden.

Backend failures continue to use the accepted task-storage read/write/remove
codes and preserve the exact cause. Existing `OPERATION_ID_REQUIRED` and
`OPERATION_ID_CONFLICT` are unchanged.

## Candidate inventory and recorded red baseline

| Suite | Tests | Baseline green | Baseline red | Responsibility |
|---|---:|---:|---:|---|
| `resourceLayering.control.test.ts` | 4 | 4 | 0 | Preserve generic 256/512, targeted subtasks, and Proxy defenses |
| `largeTaskCollection.contract.test.ts` | 2 | 0 | 2 | 255-to-257, post-512 quadrants/recommendation, duplicate ID, restart/isolation |
| `durableOperationLedger.contract.test.ts` | 14 | 2 | 12 | Byte-only module isolation, six independent single-record replay/conflict oracles, exact read cause, restart/barrier replay, set/remove rollback, mixed 515 bindings, corruption/state mismatch |
| **Total** | **20** | **6** | **14** | |

One typed non-suite helper supplies serialized physical byte maps,
module-isolated facades, unified write/remove failure and barrier controls,
counted/forbidden dependencies, and legal task
fixtures. Against the current accepted A2 production implementation, all three
suites and twenty tests were discovered: fourteen feature assertions fail for
the two code-review defects and six independent resource/test-harness controls
pass. The run completed normally with zero snapshots and no timeout or
open-handle warning.

The six passing controls are the four resource-layering tests, the serialized
raw-byte backend reconstruction/isolation control, and the one-record
`softDelete` physical-restart oracle. The latter is a legitimate behavior
control, not a false green: the current implementation already reproduces the
exact detached deletion result, rejects the conflicting binding, consumes zero
clock/ID, performs zero set/remove/forward mutation, and preserves both restored
and source raw bytes. The contract specifies observable behavior rather than a
mandatory implementation mechanism, so it must not be weakened merely to make
the current production result red.

The fourteen failures are attributable to the target defects: the two large
collection paths fail at the misplaced generic materialization budget; the
other twelve expose retained settled in-flight state, missing exact durable
create/update/complete/reschedule/delay replay, missing crash recovery and
remove-stage compensation, absent bounded sidecars for 515 bindings and
corruption handling, and absent task-state mismatch protection.

The candidate contains no skip/focus/todo/pending mode, timeout increase,
sleep, direct timer/interval, fake timer, snapshot-only oracle, Jest module
replacement, network/device/native dependency, TypeScript suppression,
explicit `any`, `as any`, or `as unknown` escape. It imports and calls real
production factories and validation functions.

The deliberate `jest.isolateModulesAsync` call is an isolation boundary, not a
replacement: its callback uses literal real dynamic imports and never calls
`jest.mock`, `jest.doMock`, `jest.setMock`, or an equivalent substitution API.

## Recorded compatibility evidence

Recorded on 2026-08-05 against the accepted A2 production implementation:

- this fourth candidate with `--detectOpenHandles`: **3 suites / 20 tests,
  14 expected feature failures / 6 passing resource/test-harness controls**,
  zero snapshots, normal exit, and no timeout or open-handle warning;
- frozen GAP-P0-01A2: **10 suites / 91 tests green**;
- accepted GAP-P0-01A: **3 suites / 10 tests green**;
- accepted/formally repaired roots: **57 suites / 353 tests green**;
- main `tsc --noEmit`: green;
- stable lock audit, explicitly excluding active GAP-P0-02B, active GAP-P0-04,
  this candidate, and rejected QUALITY_GATE: **16 manifests / 99 entries /
  zero issues** across format, ordering, path safety, uniqueness, presence, and
  SHA-256; and
- frozen A2 manifest self remains
  `6b92c2b1183f9173893f64d605fbde1dde95b0da6c4400029bfc762f7eb43d30`.

The candidate bypass scan reports zero focused/skipped/todo/pending test,
TypeScript suppression or cast escape, explicit-any type, case-sensitive
`Function`/`Reflect`, Jest module replacement, fake timer, snapshot assertion,
sleep, direct timeout/interval, or timeout increase.

## Regression, repair, and review gates

Before candidate review, the test author must record:

1. this candidate's exact red/green baseline with `--detectOpenHandles`;
2. frozen GAP-P0-01A2: 10 suites / 91 tests green;
3. accepted GAP-P0-01A: 3 suites / 10 tests green;
4. accepted/formally repaired baseline: 57 suites / 353 tests green;
5. main `tsc --noEmit` green;
6. all applicable stable manifests, explicitly excluding active GAP-P0-02B,
   active GAP-P0-04, this candidate, and rejected QUALITY_GATE, have zero
   format, ordering, path-safety, presence, uniqueness, or SHA issue;
7. candidate bypass scans are zero; and
8. the independent manifest inventory and self identity are recorded.

After a new reviewer accepts the tests, a repair agent may change only the
minimum production task validation/repository/persistent-storage/lifecycle
internals and add private data helpers needed to satisfy this contract. It may
not change frozen tests, public A1/A2 shapes, P0-04 candidate files, package or
native configuration, FocusSession work, or `outputs/qingji-ai`. The repair
must pass every new and frozen gate, then undergo a brand-new independent code
review. A green candidate run alone is not delivery.

## Canonical commands

From `outputs/start-five`, using the exact pinned desktop runtime:

The candidate alone enables Node VM modules because Jest 29 otherwise rejects
real dynamic imports before executing the isolation callback. The setting is
restored immediately afterward and is not a package or production change.

```powershell
$review1PreviousPath = $env:PATH
$review1PreviousNodeOptions = $env:NODE_OPTIONS
$review1NodeBin = 'C:\Users\25328\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin'
$review1Pnpm = 'C:\Users\25328\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd'
$env:PATH = "$review1NodeBin;$env:PATH"
$env:NODE_OPTIONS = '--experimental-vm-modules --no-warnings'
& $review1Pnpm exec jest --runInBand --ci --coverage=false --detectOpenHandles --roots tests/gap-p0-01a2-review1
$review1CandidateExit = $LASTEXITCODE
$env:NODE_OPTIONS = $review1PreviousNodeOptions
& $review1Pnpm exec jest --runInBand --ci --coverage=false --roots tests/gap-p0-01a2
$review1FrozenA2Exit = $LASTEXITCODE
& $review1Pnpm exec jest --runInBand --ci --coverage=false --roots tests/gap-p0-01a
$review1FrozenA1Exit = $LASTEXITCODE
& $review1Pnpm exec jest --runInBand --ci --coverage=false --roots tests/locked tests/review1 tests/review2 tests/review3 tests/review4 tests/phase4 tests/phase4-review tests/phase4-review2 tests/phase4-review3 tests/phase4-review4 tests/phase4-review5 tests/native-scaffold tests/native-review tests/gap-p0-01a tests/gap-p0-02a
$review1FormalRootsExit = $LASTEXITCODE
& $review1Pnpm exec tsc --noEmit
$review1TypeScriptExit = $LASTEXITCODE
$env:PATH = $review1PreviousPath

[pscustomobject]@{
  Candidate = $review1CandidateExit
  FrozenA2 = $review1FrozenA2Exit
  FrozenA1 = $review1FrozenA1Exit
  FormalRoots = $review1FormalRootsExit
  TypeScript = $review1TypeScriptExit
}
```

Before production repair, the recorded current-production baseline reports
candidate exit 1 with exactly 14 feature failures / 6 passes, while FrozenA2,
FrozenA1, FormalRoots, and TypeScript each report exit 0.

## Manifest construction

`GAP_P0_01A2_REVIEW1_LOCK.sha256` is generated last. It lists this
specification first, followed by every regular file recursively below
`tests/gap-p0-01a2-review1/`, sorted by canonical POSIX relative path. It
excludes itself and the audit-only changelog. Each record is exactly:

```text
<lowercase SHA-256><two spaces><POSIX relative path>
```

The lowercase SHA-256 of the complete manifest is the candidate self identity.
Any listed-file drift revokes the candidate and requires a new independent
test review before production repair.
