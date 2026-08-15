# GAP-P0-04 sixth-round test rework plan

> **NON-BINDING / INPUTS NOT VERIFIED / NO TEST CHANGES / NO SELF**
>
> This is an independent rework-planning note only. It does not modify or
> replace the existing GAP-P0-04 specification, tests, helpers, manifest, or
> changelog. It is not an executable test candidate, lock asset, review result,
> or production-repair authority.

## 1. Current authority state

The Manager has revoked the fifth-round candidate identity abbreviated as
`e3c99…4555`. The complete 64-character identity has not been read in this turn,
so this planning file does not attempt to reproduce or formally record it. No
sixth-round candidate identity exists.

The shared environment currently blocks access to the pinned project runtime,
and this agent is expressly prohibited from using shell, Jest, or TypeScript.
The available non-shell tools do not expose workspace file contents. Therefore,
the agent has not read the current P0-04 specification, test suites, helpers,
manifest, changelog, storage API, exact error definitions, or inspection union.

The terms `WRONG_ROOT`, `CANDIDATE_INVALID`, and `TARGET_OCCUPIED` below are only
abbreviations supplied by the Manager. Their complete stable codes, precedence,
error shapes, and applicable rows must be copied from the authoritative P0-04
assets before tests are changed. This file does not lock those abbreviations as
new API.

## 2. Minimal sixth-round objective

Once authoritative inputs can be read, revise only the existing P0-04 test-first
assets to close four review gaps:

1. complete wrong-root candidate coverage for caller recovery and backup restore;
2. occupied-target precedence for every non-empty current value;
3. explicit zero-dependency and secret-redaction assertions on unsupported/extra
   current hydration and restore rows; and
4. deep detachment across every variant of the existing inspect discriminated
   union.

The eventual test author must preserve all existing accepted behavior and make
the smallest edits necessary. Production, other GAP assets, package/native files,
and `outputs/qingji-ai` remain out of scope.

## 3. Authoritative inputs to read first

Do not begin executable edits until the following current files are read in full:

1. GAP-P0-04 test specification, especially:
   - recover caller candidate classification;
   - restore-backup classification;
   - occupied-target priority;
   - exact read/write/remove/clock/ID budgets;
   - stable errors and redaction rules; and
   - the complete inspect discriminated union.
2. Every regular file in the current P0-04 test root, including shared helpers
   and compiler/runtime public-contract tests.
3. Current P0-04 manifest and audit changelog, including the exact revoked
   fifth-round self identity and recorded suite/test inventory.
4. Production persistent-task-storage API and errors, read-only for context.
5. Frozen storage/task tests that P0-04 coordinates with, read-only.
6. Current formal-regression root list and stable-lock audit exclusions that
   produced the Manager-supplied 353-test and 15-manifest/87-entry references.

Before editing, write down the exact answers to these questions:

- Does caller recovery accept already-parsed values, JSON text, or a typed
  candidate wrapper?
- Which wrong-root values map to the existing wrong-root error, and which map to
  the broader candidate-invalid error?
- Does an object missing `tasks` count as wrong root, invalid envelope, missing
  field, or another existing category?
- For restore, is backup read before or after checking that current storage is
  empty?
- Does candidate validation occur before or after occupied-target detection?
- What exact current values count as occupied: any non-null raw value, any
  non-empty string, or another definition?
- Are clock and ID dependencies available on management factories, and what are
  their exact names/types?
- What are every inspect union discriminator and nested field, including raw
  value and conflict/unreadable details?
- What exact object/string inspection surfaces are already required to redact
  storage payloads?

## 4. Rework item 1 — recover/restore wrong-root tables

### 4.1 Caller recovery candidate table

Create a typed table through the existing recovery helper/API for every row
below. The actual value representation must follow the verified caller contract.

| Planning row | Semantic candidate | Classification to copy from current spec | Required side-effect oracle |
|---|---|---|---|
| RC-01 | null | Verify `WRONG_ROOT` versus `CANDIDATE_INVALID` | No primary write/remove; backup unchanged; clock/ID zero |
| RC-02 | string | Verify from current spec | Same |
| RC-03 | finite number | Verify from current spec | Same |
| RC-04 | boolean | Verify from current spec | Same |
| RC-05 | array | Verify from current spec | Same |
| RC-06 | empty object | Verify from current spec | Same |
| RC-07 | object missing `tasks` | Verify exact existing category | Same |
| RC-08 | any additional legal-JSON wrong-root fixture already named by the spec | Verify exact existing category | Same |

Each row must additionally prove:

- the exact stable error shape already required by P0-04;
- current primary bytes remain absent/unchanged according to the precondition;
- the complete backup raw bytes remain byte-for-byte unchanged;
- zero primary-key set/remove attempts;
- zero clock and generated-ID dependency use;
- the exact read budget from the existing contract; and
- no fallback that interprets a wrong root as an empty `{tasks: []}` snapshot.

The tests must not define a new classification rule. If the current specification
is ambiguous for any row, stop and send that ambiguity to the Manager before
locking tests.

### 4.2 Restore-backup parsed-root table

Independently seed the backup with syntactically legal JSON whose parsed root is
each semantic value below. Use the exact backup key/API already supplied by the
test helper; do not lock a new key or schema.

| Planning row | Backup JSON meaning | Classification to copy from current spec | Required side-effect oracle |
|---|---|---|---|
| RB-01 | null | Verify `WRONG_ROOT` versus `CANDIDATE_INVALID` | No primary write/remove; exact backup bytes retained; clock/ID zero |
| RB-02 | string | Verify from current spec | Same |
| RB-03 | finite number | Verify from current spec | Same |
| RB-04 | boolean | Verify from current spec | Same |
| RB-05 | array | Verify from current spec | Same |
| RB-06 | empty object | Verify from current spec | Same |
| RB-07 | object missing `tasks` | Verify exact existing category | Same |
| RB-08 | any additional legal-JSON wrong-root fixture already named by the spec | Verify exact existing category | Same |

For each row, assert the exact current/backup read budget separately. A caller
candidate and stored backup may intentionally use different validation paths;
one table must not stand in for the other.

## 5. Rework item 2 — occupied-target precedence

The review requirement is that recovery/restore never overwrites an occupied
current target merely because its bytes are malformed, unsupported, or the wrong
root. Build the minimum table below for both caller recovery and backup restore,
subject to the verified API.

| Planning row | Non-empty current bytes | Why it is adversarial | Required result |
|---|---|---|---|
| OT-01 | Malformed JSON | Parser failure could incorrectly outrank occupancy | Existing `TARGET_OCCUPIED` result has priority |
| OT-02 | Unsupported future envelope carrying a unique secret marker | Version/schema path could inspect or rewrite it | Occupied priority; bytes and secret remain untouched/unexposed |
| OT-03 | Legal JSON with primitive wrong root | Wrong-root validation could incorrectly outrank occupancy | Occupied priority; exact current bytes unchanged |

Every occupied row must verify:

- the exact stable occupied-target code/error shape from the current spec;
- current raw bytes are byte-for-byte unchanged;
- zero set/remove/forward mutation attempts provided by the existing helper;
- zero clock and ID use;
- no backup/candidate parsing or read when the current spec requires an early
  occupancy exit; otherwise, the exact bounded read budget already specified;
- no backup deletion or candidate normalization; and
- error message, cause, stringification, and supported inspection output do not
  reveal the secret marker.

Do not infer the behavior of an empty string or whitespace-only current value.
Add those rows only if the authoritative spec explicitly defines whether they
are occupied.

## 6. Rework item 3 — explicit dependencies and redaction

Locate every existing parameterized row for:

- unsupported current-envelope hydration;
- extra-key current-envelope hydration;
- unsupported backup restore; and
- extra-key backup restore.

Give each row its own explicit counting/forbidden dependency spies using the
actual factory signature. Do not rely on one outer spy, a default dependency, or
the absence of an assertion.

For every row, assert:

1. clock consumption is exactly zero;
2. generated-ID consumption is exactly zero;
3. the precise current/backup read budget from the existing specification;
4. set/remove attempts are exactly zero unless an existing quarantine rule
   explicitly requires otherwise;
5. complete current and backup bytes remain exactly as required;
6. a unique secret marker embedded deeply in the adversarial payload does not
   occur in:
   - error `message`;
   - exposed `cause` or cause message;
   - normal string coercion;
   - the project's supported error-inspection/serialization surface; or
   - any inspect result returned to the caller; and
7. the stable public error fields remain exact without copying raw payload data.

Use the existing redaction oracle. Do not introduce Node-specific inspection as
a new product API. If the current tests use a standard inspection helper, extend
that helper consistently.

## 7. Rework item 4 — inspect union detachment

First copy the actual union discriminators and fields from the authoritative
P0-04 type. The Manager-supplied semantic variants are:

- empty;
- current;
- legacy;
- conflict; and
- unreadable.

Do not assume those are the literal discriminator strings.

For each verified variant, build a dedicated backend fixture and run this oracle:

1. Save the complete backend raw snapshot and observation counters.
2. Call inspect once and capture the full result.
3. Mutate every reachable mutable part of the first result that exists for that
   variant, including nested objects, arrays, and any exposed raw/metadata
   container. Strings themselves are immutable, so mutate their containing
   property/object rather than pretending to mutate a string value.
4. Confirm backend bytes and backend observation history are unchanged by caller
   mutation.
5. Call inspect a second time.
6. Assert the second result is deeply equal to the original expected value but
   does not share any mutable object/array reference with the first result.
7. Assert the first and second calls each consume exactly the variant-specific
   current/backup read budget, with zero writes/removes and zero clock/ID use.
8. For conflict/unreadable variants, assert the verified error/diagnostic fields
   remain redacted and do not leak seeded secret markers.

### Provisional inspect matrix

| Planning row | Fixture intent | Mutable surfaces to discover after reading type | I/O budget source |
|---|---|---|---|
| IN-01 | Empty current and backup | Top-level result and any arrays | Current spec |
| IN-02 | Valid current snapshot | Nested metadata/tasks/raw wrapper if exposed | Current spec |
| IN-03 | Restorable legacy/backup state | Nested legacy descriptor and arrays | Current spec |
| IN-04 | Current/backup conflict | Both descriptors and conflict details | Current spec |
| IN-05 | Unreadable backend state | Redacted diagnostic/cause containers | Current spec |

The helper must compare reference identity recursively only across verified plain
data. It must not execute accessors, Proxy traps, or arbitrary prototypes to prove
detachment.

## 8. Suggested executable test organization

This is a planning layout only. Reuse current files when that is the smaller
change; do not create new suites merely to match these labels.

| Planned block | Parameter rows | Purpose |
|---|---:|---|
| Caller candidate wrong roots | 7 minimum, plus verified additional row | Classification and zero side effects |
| Restore backup wrong roots | 7 minimum, plus verified additional row | Independent stored-JSON path |
| Occupied target | 3 current fixtures × 2 recovery entry paths | Priority, no read/overwrite/leak |
| Unsupported/extra dependency/privacy | Existing current + restore rows | Explicit per-row spies and redaction |
| Inspect detachment | 5 semantic union variants | Two-call deep isolation and exact I/O |

The provisional matrix implies at least 25 parameter rows before counting the
existing unsupported/extra cases. That is not an official added-test count.
After reading the current suites, retain existing rows and add only missing cases;
do not duplicate already locked coverage. The final inventory and expected
red/green split must come from actual test discovery, never this arithmetic.

## 9. Deterministic and quality constraints

The eventual rework must:

- use real production factories/modules and existing typed test backends;
- avoid mock/replacement of production modules;
- use no sleep, real/fake timers, network, device, or native dependency;
- use no skipped/focused/todo tests or timeout increase;
- use no TypeScript suppression, explicit `any`, or unsafe cast escape;
- inject caller-owned fault objects where exact cause identity is required;
- compare raw bytes, not only parsed equality, where preservation is promised;
- assert every dependency and I/O budget explicitly per table row; and
- remain entirely within the verified P0-04 asset scope until tests are accepted.

## 10. UNVERIFIED draft and manifest procedure

After inputs are verified and tests are edited:

1. Mark the P0-04 specification `UNVERIFIED` while runtime gates remain blocked.
2. Update its inventory using static test discovery only as a draft; label any
   red/green number as an expectation until Jest actually runs.
3. Update listed-file content hashes in the existing manifest as a draft if the
   Manager authorizes it, but do not compute, publish, or treat the complete
   manifest hash as a candidate self.
4. Add an audit-only changelog section that reproduces the exact revoked fifth
   self from the existing file and says no sixth self exists.
5. Stop at the execution-gate boundary.

This planning turn performs none of those edits. It adds only this file.

## 11. Gates after runtime access returns

The exact commands must be copied from the current P0-04 specification after it
is read. The Manager has supplied these expected gate categories, not verified
commands or current results:

1. P0-04 candidate Jest roots with honest suite/test/red/green, snapshot,
   timeout, and open-handle results;
2. accepted/formally repaired regression roots, historically referenced as 353
   tests, using the exact current root list;
3. `tsc --noEmit` through the pinned runtime;
4. candidate bypass/static scans; and
5. stable manifest audit, historically referenced as 15 manifests / 87 entries,
   using the exact current exclusion list.

The eventual test author must record raw exit codes and actual totals. Historical
353 and 15/87 values are expectations to verify, not results claimed here.

## 12. Required workflow after gates

1. If any gate contradicts this plan, preserve the raw evidence and revise only
   the tests/specification through the Manager workflow.
2. When every test asset and recorded result is final, regenerate the official
   manifest last and compute one new exact self identity.
3. Stop all edits immediately after signing.
4. Dispatch a brand-new independent P0-04 test reviewer who did not author or
   previously review this candidate.
5. Only that reviewer's acceptance of the exact self may authorize production
   repair; a green candidate run alone is not delivery.

Until these steps occur, this file remains **NON-BINDING / INPUTS NOT VERIFIED /
NO TEST CHANGES / NO SELF**.
