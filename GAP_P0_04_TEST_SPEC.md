# GAP-P0-04 task-data migration and recovery candidate specification

## Status, authority, and immutability

Status: **SEVENTH-ROUND CANDIDATE, pending a brand-new independent seventh-round
test review.**

The superseded candidate identities
`cf194460f60e974a5d8d55c7c77f20dfb9123588e52a3ad4375520763ef54d0e`
and
`49759447cf785560c9704475bb09147615b03f5107d9e7723414261ca317c624`
and
`5286830e53d5e3122b8da41346a2a0f0fe084896f4c2c7da032669cc4a664683`
and
`2523707ee646fcfb9a322636610be69648406e83d856eca4393d6ccc98fe74de`
and
`e3c99a0f74ecc83d4d5d064acc0addbf7992bcee4a6dd2b9f8ae92bcdcb24555`
and
`9b411ffb555a7900268c1b18921385b18f2ce0f738d0194d7075b66adc415442`
are revoked and must not authorize production work. This seventh-round revision
retains the validated recovery design and sixth-round coverage while closing
the sixth review's missing executable success oracles for legal raw empty Task
arrays in both recovery entry paths.

This test-first candidate owns only:

- this specification;
- regular files recursively below `tests/gap-p0-04/`;
- `GAP_P0_04_LOCK.sha256`; and
- the audit-only `GAP_P0_04_LOCK_CHANGELOG.md`.

The test author changes no production source, package/configuration file,
native project, previously accepted test/specification/manifest, active
GAP-P0-01A2 or GAP-P0-02B candidate, QUALITY_GATE candidate, or the separate
`outputs/qingji-ai` app. No P0-04 production implementation is authorized
until a brand-new reviewer accepts the final self identity. Once accepted,
the specification and every regular file under `tests/gap-p0-04/` are locked;
a repair agent may not edit, regenerate, skip, focus, weaken, replace, or
selectively omit them.

## Safety decision

Unreadable task data uses this default:

```text
fail closed + preserve original bytes + require an explicit recovery action
```

Malformed, unsupported, invalid, conflicting, or interrupted state is never
silently converted to an empty list, overwritten, downgraded, or deleted.
Automatic migration applies only to the three documented predecessor formats.
Every recovery backup is retained permanently by this stage; there is no
backup-delete API.

The old byte-for-byte raw restore is prohibited. Both `recover` and `restore`
must validate a bounded plain-data graph and the complete Task/Subtask snapshot
semantics, then write one canonical V1 envelope. No explicit action may copy
unvalidated backup bytes back to the online task key.

## Existing contracts that remain authoritative

- current key: `start-five.tasks.v1`;
- historical key: `start-five.tasks`;
- schema: `start-five.tasks`;
- current `version`: `1`;
- current envelope keys: exactly `schema`, `version`, `tasks`;
- repository-facing adapter value: a JSON Task array;
- full accepted temporal, lifecycle, score, uniqueness, and parent/child
  semantics from `assertValidTaskSnapshot`;
- plain-data depth limit 256, array-length limit 256, and unique-container
  limit 512;
- backend failures retain exact cause identity;
- coordination identity is the physical backend, not an adapter facade; and
- no invalid read path performs a set or remove.

Task and Subtask objects must have their accepted exact required keys. The
three optional A2 planning properties may be absent on predecessor data;
migration preserves supplied legal records and does not invent them.

## Compatibility overload and managed overload

The original overload remains source-compatible and behavior-compatible:

```ts
createPersistentTaskStorage(backend): KeyValueStorage;
```

In particular, compatibility-mode hydration reads only the current key exactly
once, whether the current value is absent or a legal canonical V1 value. It does
not gain a historical-key probe or management methods.
A runtime green control seeds a legal raw Task array under the historical key
while leaving the current key empty. The one-argument adapter must return
`null`, read the current key exactly once, leave the historical bytes exact,
perform no set/remove, and expose none of the four management methods.
A second green control seeds canonical V1 under the current key and locks the
same single current-key read, exact bytes, and zero mutation.

Managed mode is enabled only when dependencies are supplied:

```ts
type TaskDataRecoveryDependencies = {
  now(): string;
  idGenerator(): string;
};

createPersistentTaskStorage(
  backend,
  dependencies: TaskDataRecoveryDependencies,
): ManagedTaskStorage;
```

`ManagedTaskStorage` extends `KeyValueStorage` by exactly these methods:

```ts
interface TaskDataRecoveryController {
  inspect(): Promise<TaskDataInspection>;
  quarantine(): Promise<QuarantineReceipt>;
  recover(backupKey: string, candidate: unknown): Promise<RecoveryReceipt>;
  restore(backupKey: string): Promise<RestoreReceipt>;
}
```

Ordinary hydration and migration consume neither `now` nor `idGenerator`.
Only a new explicit quarantine consumes them.
Every managed hydration decision reads `start-five.tasks.v1` first and
`start-five.tasks` second, exactly once each, including when current is already
legal V1. It may decide only after both reads, so divergent legal historical
data cannot be hidden by a current-key short circuit. A legal current V1 with
no historical value remains byte-stable and performs no set/remove. A
malformed, unsupported, or invalid current value is not cached as an empty
snapshot or as a completed read: two consecutive managed hydration attempts
each repeat the exact current-then-historical pair, return the same stable
classification with undefined payload cause, and perform no mutation.

## Independent application composition

Recovery is exposed through a new composition factory rather than by adding
methods to the existing app or lifecycle service:

```ts
createStartFiveManagedRuntime(dependencies): {
  app: StartFiveAppComposition;
  recovery: TaskDataRecoveryController;
};
```

The returned object has exactly `app` and `recovery`. `app` retains exactly
`AppRoot`, `repository`, and `service`; its legacy `CoreAppService` remains the
accepted exact seven-method surface. The separate A1/A2
`TaskLifecycleService` remains the accepted exact eleven-method surface:

```text
complete, create, delay, getById, getQuadrantProjection, getQueryResult,
getRecommendation, list, reschedule, softDelete, update
```

The recovery controller has exactly the four management methods and is not
the app service. The existing `createStartFiveApp` return type and runtime
shape remain unchanged, while its repository hydration must use managed
migration. The managed-runtime controller must use the exact caller-supplied
clock and ID functions; optional existing network composition remains
compatible.

The compiler contract imports `createStartFiveManagedRuntime` directly from
the real production `src/app/startFiveManagedRuntime` module. It does not use
the runtime-loader helper or a reflected local module type. It proves one exact
dependency parameter, a synchronous exact `{app, recovery}` return,
`StartFiveAppComposition`, the exact four-method recovery controller, the full
`TaskDataInspection` union, and the exact `QuarantineReceipt`,
`RecoveryReceipt`, and `RestoreReceipt` shapes.

P0-04 owns its compiler helper independently; it neither imports nor changes
the GAP-P0-01A helper. The helper uses the real TypeScript compiler, a real
filesystem-backed `CompilerHost`, project strictness/options, and
`jsx: ReactJSX`. Only the named virtual contract root exists in memory; every
production module, including `startFiveApp.tsx` and
`startFiveManagedRuntime`, must resolve from disk. Green controls prove the
real TSX app import produces zero diagnostics and no TS6142, a deliberately
missing production module produces TS2307, and a real semantic mismatch
produces TS2322. There is no module shadow, diagnostic suppression, or unsafe
type escape.

The module loader test maps only an exact missing
`../../src/app/startFiveManagedRuntime` module to a deterministic red-baseline
sentinel. Nested missing imports, syntax failures, and arbitrary loader errors
are rethrown by identity; tests contain no production fallback.

## Legal formats and canonicalization

Only these parsed shapes are legal inputs to recovery:

1. exact current envelope: `{schema, version: 1, tasks}`;
2. exact V0 envelope: `{schema, version: 0, tasks}`;
3. exact documented default envelope: `{schema, tasks}`; or
4. a raw Task array.

An empty raw Task array is deliberately legal and represents a legal empty
snapshot. The invalid-root array controls therefore use an array containing a
non-Task primitive; they do not contradict or revoke legal `[]` recovery.

Managed automatic hydration recognizes legal predecessors only at their
documented locations:

1. V0 envelope at the current key;
2. default envelope at the current key; or
3. raw Task array at the historical key.

Current/V0/default envelopes with extra keys are invalid. Foreign schemas and
versions `-1`, string, `null`, fractional, or future values are unsupported,
not guessed. Valid JSON with invalid records under the historical key remains
unreadable and byte-stable.
The historical key accepts only the raw Task-array predecessor. A current, V0,
or default envelope under that key is `TASK_SNAPSHOT_INVALID` /
`WRONG_ROOT`; both task-key values remain exact and no set/remove or recovery
dependency call occurs. Malformed historical JSON is classified as
`TASK_SNAPSHOT_CORRUPT` / `MALFORMED_JSON` only after the exact two-key read;
read-only inspection identifies `start-five.tasks` as its source without
mutating or disclosing the payload.

Every successful migration, recover, or restore writes the deterministic
canonical value:

```json
{"schema":"start-five.tasks","version":1,"tasks":[]}
```

The example shows empty tasks; real legal tasks are preserved in order. The
serializer uses no clock, ID, random source, or locale.

For each of the four legal formats, successful `recover` and `restore` perform
exactly one current-key set attempt and one matching commit. The sole value is
the canonical V1 envelope; no raw, V0, default, array, or other intermediate
value is ever attempted. Recovery/restore never remove or rewrite the backup.

An in-place predecessor migration performs one current-key set and no remove.
A historical migration validates first, sets current, then removes historical.
If set fails, historical remains and current is absent. If cleanup fails, both
copies remain. An exact equivalent pair retries only the missing remove; a
different legal history at each key rejects `TASK_MIGRATION_CONFLICT` and
preserves both. Cleanup retry is locked across a genuine cold boundary: the
failed facade is discarded, a brand-new backend facade over only the shared
durable Map is passed to an independently loaded managed-storage module, and
the retry performs zero set, exactly one historical remove, no clock/ID call,
and no canonical-current rewrite. Divergence checks apply equally when the
current-key legal value is V1, V0, or the documented default envelope.

## Bounded materialization and full semantics

Before accepting any caller candidate, recovery must detach it through the
accepted bounded plain-data materializer. It rejects cycles, revoked or
throwing Proxies, accessors, symbol keys, sparse arrays, non-finite values,
depth beyond 256, arrays beyond 256, and more than 512 unique containers.
Accessor getters are never invoked. Engine exceptions and caller-controlled
trap text are not disclosed.

The non-finite boundary is locked before JSON serialization: three otherwise
legal pending Task candidates with `scoreAwardedAt: null` are passed directly
as objects with `score` set to `NaN`, `Infinity`, or `-Infinity`. Each returns
the exact invalid-candidate error with undefined cause, consumes no
backend/clock/ID operation, performs no set/remove, and discloses no candidate
marker. Three independent green controls JSON-round-trip those same fixture
shapes, prove the score becomes `null`, and pass the resulting snapshot through
the real `assertValidTaskSnapshot`. Therefore an implementation that serializes
before materialization would accept the control form and cannot obtain a false
green rejection from unrelated completed-task score/award coherence.

The resource fixtures are exact and otherwise semantically legal:

- 256 Subtasks succeeds and 257 fails;
- 512 unique containers succeeds and 513 fails; and
- cycle/depth behavior is reached through an otherwise legal required Task
  field, not through a missing field or early primitive type error.

One shared pure-JSON matrix supplies twenty single-target semantic
adversaries to both `recover` and `restore`. Every paired control is accepted by
the established strict snapshot validator, every invalid value survives an
exact JSON round trip, and all fields other than the named target remain legal.
The matrix covers duplicate Task and Subtask IDs, Subtask-parent mismatch,
Task and Subtask extra keys, Task and Subtask timestamp order, pending and
completed Task/Subtask lifecycle coherence, score/award-time pairing and score
integerness, all three parent/child temporal boundaries, and each of the three
A2 planning fields. Foreign schema and all unsupported version forms remain in
the format matrix.

Restore applies the same JSON parse, bounded materialization, exact-shape, and
full semantic validation to backup text. Its 256/257 and 512/513 boundaries
are locked independently from caller-candidate recovery.
For every shared semantic failure, restore leaves backup bytes exact, leaves
the current key empty, performs zero set/remove, returns the stable invalid
backup code, retains no payload as cause, and discloses no case marker.

Invalid-root classification is locked independently for caller recovery and
stored-backup restore. The matrix includes `null`, string/number/boolean
primitives, a raw array containing a non-Task primitive, an empty object, and
an otherwise shaped current envelope missing `tasks`. `recover` rejects every
row as `TASK_RECOVERY_CANDIDATE_INVALID` / `INVALID_SNAPSHOT` before all backend,
clock, and ID I/O. `restore` rejects the JSON form of every row as
`TASK_RECOVERY_BACKUP_INVALID` after exactly one backup-key read and before any
current-key read, mutation, clock, or ID use. In both paths the backup stays
byte-exact and the current key remains absent, so no invalid root can be
reinterpreted as a default empty snapshot.

## Integrity classification and non-disclosure

Managed hydration uses these stable public outcomes:

| Condition | Code/message | Category |
|---|---|---|
| JSON parse failure | `TASK_SNAPSHOT_CORRUPT` | `MALFORMED_JSON` |
| wrong root for the key/format | `TASK_SNAPSHOT_INVALID` | `WRONG_ROOT` |
| foreign schema | `TASK_SNAPSHOT_UNSUPPORTED` | `UNSUPPORTED_SCHEMA` |
| unsupported version | `TASK_SNAPSHOT_UNSUPPORTED` | `UNSUPPORTED_VERSION` |
| invalid exact shape, graph, resource bound, or semantics | `TASK_SNAPSHOT_INVALID` | `INVALID_SNAPSHOT` |

Integrity failures preserve source bytes exactly, perform no write/delete,
consume no recovery dependency, and do not create an empty cache. Public
message, stack construction, category, cause, and enumerable serialization do
not expose raw bytes, titles, descriptions, IDs, trap text, or other
caller-controlled payload. Integrity failures do not retain payload as cause.
Representative malformed, unsupported-schema/version, wrong-root,
extra-key, and semantically invalid current values are hydrated twice; every
attempt independently reads current then historical and rejects, proving the
first failure cannot poison the repository with an empty or cached result.
Every foreign-schema row, each of the five unsupported-version rows, and each
current/V0/default extra-key row carries its own secret marker and explicit
clock/ID counters. Both hydration attempts and a subsequent read-only
inspection consume zero clock and zero generated IDs; the inspection adds
exactly one current-then-historical read pair. Message, cause, string coercion,
enumerable error text, and inspection output expose none of the marker.

Backend failures retain only the exact backend-thrown value as cause and use:

```text
TASK_STORAGE_READ_FAILED
TASK_STORAGE_WRITE_FAILED
TASK_STORAGE_REMOVE_FAILED
```

## Read-only inspection

`inspect()` never migrates, quarantines, restores, recovers, generates an ID,
or reads a clock. It returns a detached record:

```ts
type TaskDataInspection =
  | {state: 'empty'}
  | {state: 'current'; schema: 'start-five.tasks'; version: 1; taskCount: number}
  | {
      state: 'legacy';
      sourceKey: 'start-five.tasks.v1' | 'start-five.tasks';
      fromVersion: 0 | 'default';
      taskCount: number;
    }
  | {
      state: 'unreadable';
      sourceKey: 'start-five.tasks.v1' | 'start-five.tasks';
      category: TaskDataIntegrityCategory;
    }
  | {
      state: 'conflict';
      currentKey: 'start-five.tasks.v1';
      legacyKey: 'start-five.tasks';
    };
```

Caller mutation of one result cannot affect later inspection or durable state.
A single inspection always reads current then historical exactly once. Empty,
current, every legal predecessor representation, conflict, and unreadable
fixtures are each inspected twice. Every first result is caller-mutated across
all of its reachable mutable fields; this mutation performs no backend event,
changes no durable byte, and cannot affect the second result. The two results
share no mutable object reference at any depth, and both calls independently
consume their exact two-read budget with zero set/remove/clock/ID use.
Conflict and unreadable fixtures carry distinct source markers which are absent
from both inspection results.
A backend read error remains a storage read error with exact cause.

## Crash-restart-safe quarantine

The fixed internal pending key is:

```text
start-five.tasks.recovery.pending.v1
```

It is not a public management method or a FocusSession key. Its exact internal
record is behavior-locked:

```json
{
  "schema": "start-five.task-recovery-pending",
  "version": 1,
  "operation": "quarantine",
  "sourceKey": "start-five.tasks.v1",
  "backupKey": "start-five.tasks.quarantine.backup-001",
  "category": "MALFORMED_JSON",
  "createdAt": "2026-08-05T08:00:00.000Z"
}
```

Before starting a new quarantine, the controller reads and validates pending
metadata. A valid pending record is resumed across a new adapter/backend
facade using the same source, backup key, category, and created time; restart
must not call `now` or `idGenerator`. Malformed, foreign, extra-key,
noncanonical-time, non-task-source, or invalid-suffix pending metadata rejects
`TASK_RECOVERY_PENDING_INVALID`, preserves all bytes, and performs no mutation
or generator call.
The exact-shape matrix additionally rejects unsupported `version`,
`operation`, and `category` values, each of the seven required fields omitted
one at a time, and a wrong runtime type for each field. Every case contains no
unrelated extra key that could mask the named failure, retains no payload
cause, and leaves the source and pending bytes exact.

For a new unreadable source, quarantine performs at most one canonical clock
read followed by at most one ID generation. The timestamp must equal its
finite millisecond UTC `toISOString()` form. The ID must be nonblank and free
of control characters. Invalid values reject
`TASK_RECOVERY_CLOCK_INVALID`/`TASK_RECOVERY_ID_INVALID` before mutation.

The backup key is `start-five.tasks.quarantine.<id>`. New mutation order is:

1. persist the pending record;
2. read the backup key and either verify an exact retry or set source bytes
   byte-for-byte;
3. remove the source key;
4. remove the pending record.

If the newly generated backup key already contains bytes exactly equal to the
source, quarantine still commits pending first but does not rewrite the backup;
its mutation order is pending set, source remove, pending remove. A fresh
facade then observes completed empty state as not requiring quarantine,
consumes no generator, and retains the backup permanently.

A different existing backup rejects `TASK_RECOVERY_BACKUP_CONFLICT`. A
pending-write failure leaves source intact. Backup read/set failure leaves
pending and source. Source-remove failure leaves pending, source, and backup.
Final pending-cleanup failure leaves pending and backup after source removal.
Every retained pending state resumes after restart with its original key and
no new generator call; an exact backup is not rewritten. Current and
historical source retries are both locked. Empty, healthy, and legally
migratable states reject `TASK_RECOVERY_NOT_REQUIRED`; divergent legal keys
remain `TASK_MIGRATION_CONFLICT`.

The detached success receipt is exactly:

```ts
type QuarantineReceipt = {
  state: 'quarantined';
  backupKey: string;
  category: TaskDataIntegrityCategory;
  createdAt: string;
};
```

## Validated recover

`recover(backupKey, candidate)` validates a legal quarantine key and captures
the entire legal-format candidate before its first backend I/O. Invalid key or
candidate performs zero backend I/O and consumes no dependencies. Every
candidate failure has exactly:

```text
code/message: TASK_RECOVERY_CANDIDATE_INVALID
category: INVALID_SNAPSHOT
cause: undefined
```

After validation, backup must exist and current target must be empty. Missing
backup and occupied target reject `TASK_RECOVERY_BACKUP_NOT_FOUND` and
`TASK_RECOVERY_TARGET_OCCUPIED`. Recovery writes one canonical V1 envelope,
never removes/rewrites backup, and returns:

```ts
type RecoveryReceipt = {
  state: 'recovered';
  backupKey: string;
  version: 1;
  taskCount: number;
};
```

Caller mutation while the backup read is blocked cannot affect the captured
write. A write failure leaves target empty and backup exact, retains cause,
and is retryable. Backup read failure performs no write/delete and retains
exact cause.

For a legal captured candidate, recover reads the backup key and then the
current key exactly once. A non-empty current value has occupied-target
priority whether its bytes are canonical, malformed, unsupported-version, or
wrong-root. Those four rows return the exact payload-free occupied error,
preserve current and backup bytes, perform no set/remove, and consume zero
clock/ID calls. A following inspection uses its own current-then-historical
read pair and discloses no seeded marker.

A dedicated executable recover oracle passes raw `[]` as the caller candidate.
It must return exactly `{state: 'recovered', backupKey, version: 1,
taskCount: 0}`, write the canonical empty V1 envelope exactly once, retain the
original backup bytes, read only backup then current, never touch the historical
key, remove nothing, and consume zero clock/ID calls. Mutating every receipt
field performs no backend event or durable change. A repeated recover with raw
`[]` reads backup then current again and returns the exact occupied-target error
without a second write, proving canonical empty V1 is occupied rather than
silently replaceable.

## Validated restore (no raw restore)

`restore(backupKey)` validates the key, requires a backup, parses and fully
validates its text as one of the four legal formats, requires an empty current
target, and writes canonical V1. Malformed, foreign, unsupported-version,
extra-key, semantically invalid, or resource-exceeding backup text rejects
`TASK_RECOVERY_BACKUP_INVALID`; it performs no online set/remove, leaks no
payload, and preserves backup bytes.

The detached receipt is exactly:

```ts
type RestoreReceipt = {
  state: 'restored';
  backupKey: string;
  version: 1;
  taskCount: number;
};
```

There is deliberately no `rawPreserved` receipt and no path that writes raw
backup text online. Read/write failures retain cause. Success and failure both
retain backup permanently.

For a legal validated backup, restore reads the backup key and then the current
key exactly once. Canonical, malformed, unsupported-version, and wrong-root
non-empty current bytes all have occupied-target priority. Every row preserves
both byte strings, performs no mutation, consumes zero recovery dependencies,
and returns the exact payload-free occupied error. Unsupported and extra-key
backup rows also carry a distinct secret marker each: invalid restore performs
exactly one backup read, zero current reads and mutations, and zero clock/ID
calls; a following empty-state inspection consumes exactly the separate
current-then-historical read pair without exposing the marker.

A separate executable restore oracle stores the exact backup bytes `[]`. It
must return exactly `{state: 'restored', backupKey, version: 1, taskCount: 0}`,
write the canonical empty V1 envelope once, retain the original `[]` backup,
read only backup then current, never touch the historical key, remove nothing,
and consume zero clock/ID calls. Receipt mutation cannot change backend bytes or
observation history. Repeating restore performs the same two reads and returns
the exact occupied-target error with no second write. These two executable
oracles kill an implementation that accepts non-empty raw arrays but rejects
the legal empty raw array.

## Shared linearization

Migration, quarantine, recover, and restore share one non-poisoning operation
queue for the same physical backend and task keys, including across distinct
managed facades. Deterministic barriers lock:

- concurrent migration to one set and one cleanup remove;
- migration before restore, with later restore observing occupied target;
- quarantine before recover, allowing quarantine cleanup then recovery;
- recover before restore, with later restore observing occupied target; and
- retry after a failed operation, proving rejection does not poison the queue.

No implementation may perform occupancy checks outside the shared
linearization boundary and later overwrite a winner.

## FocusSession isolation

The sentinel key `start-five.focus-sessions.v1` is seeded for each management
operation. `inspect`, `quarantine`, `recover`, and `restore` must not read,
write, or remove it, and its bytes remain exact. P0-04 does not import or alter
FocusSession domain/service/repository types, focus storage/schema, P0-02A/B,
account sync, cloud migration, network recovery, timers, UI copy, or a reset
flow.

## Candidate coverage and red baseline

| Suite | Tests | Baseline green | Baseline red |
|---|---:|---:|---:|
| `corruptionClassification.contract.test.ts` | 26 | 0 | 26 |
| `focusIsolation.contract.test.ts` | 4 | 0 | 4 |
| `helperInvariant.control.test.ts` | 9 | 9 | 0 |
| `inMemoryTypecheck.invariant.test.ts` | 3 | 3 | 0 |
| `migration.contract.test.ts` | 11 | 0 | 11 |
| `migrationAtomicityConcurrency.contract.test.ts` | 10 | 1 | 9 |
| `publicTypeContract.contract.test.ts` | 4 | 1 | 3 |
| `quarantineRestore.contract.test.ts` | 86 | 0 | 86 |
| `recoverCandidateValidation.contract.test.ts` | 61 | 3 | 58 |
| `semanticParity.contract.test.ts` | 41 | 1 | 40 |
| **Total** | **255** | **18** | **237** |

The complete baseline recorded with open-handle detection is 10 suites / 255
tests, with 18 green controls, 237 feature failures, zero snapshots, no
open-handle warning, and normal completion after 24.926 seconds. Expected green
controls cover the real no-I/O factory, one-argument runtime isolation,
deterministic backend failures/barriers, exact boundary fixtures, pure-JSON
semantic-matrix controls, adversary construction, current V1 compatibility
hydration, the existing one-argument type boundary, accepted backend read
handling, the three non-finite JSON-null strict-validator controls, and the
three independent real-compiler-host invariants. All feature behavior remains
red against pre-P0-04 production.

Candidate tests use no skip/focus/todo/pending mode, snapshots as sole oracle,
sleep, direct timer/interval, fake timer, network, device/native dependency,
timeout increase, TypeScript suppression, explicit `any`, Jest module
replacement, or production fallback implementation.

## Regression, lock, and repair gates

Before final candidate locking, the test author must record:

1. the complete P0-04 run with `--detectOpenHandles` and exact counts;
2. accepted stable roots: 57 suites / 353 tests green;
3. main `tsc --noEmit` green;
4. all 15 applicable accepted manifests / 87 entries with zero drift;
5. no bypass mode and no forbidden candidate pattern;
6. no modification outside the P0-04 candidate boundary; and
7. the new manifest self identity.

Active GAP-P0-01A2, GAP-P0-02B, and QUALITY_GATE roots/manifests remain
excluded from P0-04 stable regression evidence as directed. They are not
owned, changed, or silently accepted by this candidate.

After independent test acceptance, production repair is limited to
`src/data/persistentTaskStorage.ts`, independently justified private Task
storage helpers, the new independent managed-runtime module, and the minimal
`src/app/startFiveApp.tsx` composition integration. Repair must make every
locked P0-04 test green, keep accepted regressions/typecheck/manifests green,
preserve FocusSession and `outputs/qingji-ai`, and then undergo a brand-new
independent code review. Any failed review returns to production repair and
then repeats the complete review; tests remain immutable.

## Canonical commands

From `outputs/start-five` with the pinned Node/pnpm runtime on `PATH`:

```powershell
pnpm exec jest --runInBand --ci --coverage=false --detectOpenHandles --roots tests/gap-p0-04
pnpm exec jest --runInBand --ci --coverage=false --roots tests/locked tests/review1 tests/review2 tests/review3 tests/phase4 tests/phase4-review tests/review4 tests/phase4-review2 tests/phase4-review3 tests/phase4-review4 tests/phase4-review5 tests/native-scaffold tests/native-review tests/gap-p0-01a tests/gap-p0-02a
pnpm exec tsc --noEmit
```

## Manifest construction

`GAP_P0_04_LOCK.sha256` is generated last. It lists this specification first,
then every regular file recursively below `tests/gap-p0-04/`, sorted by
POSIX-style relative path. Manifest and changelog do not include themselves.
Each line is exactly:

```text
<lowercase SHA-256><two spaces><POSIX relative path>
```

The lowercase SHA-256 of the manifest itself is the candidate self identity.
Any later change to a listed file requires a new identity and another
independent test review; silent regeneration is forbidden.
