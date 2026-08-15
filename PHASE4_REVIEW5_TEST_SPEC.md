# Phase 4 hardening review 5 locked-test specification

## Status, scope, and immutability

Status: **CANDIDATE, pending a brand-new independent test review.** This
test-first candidate covers ordinary performance and boundary correctness in
the shared plain-data materialization path used by repository mutations.

This candidate adds only this specification, `tests/phase4-review5/**`, and
`PHASE4_REVIEW5_LOCK.sha256`. It does not modify production code,
configuration, dependencies, package metadata, native artifacts, any prior
test/specification/manifest, or the separate `qingji-ai` project.

After a new independent reviewer accepts the candidate, this specification
and every regular file recursively below `tests/phase4-review5/` are
immutable. A production repair agent may not edit, regenerate, skip, focus,
weaken, replace, or selectively omit them. This test author must not implement
the repair or perform final code review.

The contract supplements every earlier repository, persistence, transaction,
native, and quality lock. It does not replace or weaken them.

## Defect boundary

`materializePlainJsonData` currently tracks only identities on the active
recursive path. After a child finishes, its identity is removed from that
set. An acyclic graph that references the same completed child twice is
therefore materialized once per logical path instead of once per unique
container identity.

The current implementation also has no explicit maximum for nested container
depth, array length, or total unique container identities. Its existing catch
boundary correctly maps a synchronous fixture-budget exception to
`TASK_SNAPSHOT_INVALID`, but a correct error identity alone does not prove
bounded traversal. Every red test therefore also asserts the successful
ordinary-property-read audit and requires that the independent audit itself
never be the component that stops traversal.

No test measures wall-clock time, schedules a timer, counts promise turns, or
generates an unbounded value.

## Fifteen-node acyclic shared graph

The locked fixture constructs exactly fifteen unique transparent Proxy
containers:

- one leaf owns `{terminal: 'shared-leaf'}`;
- fourteen successive parents each own `{left: child, right: child}` where
  both properties reference the same immediate child;
- the root therefore represents 16,384 conceptual leaf paths while retaining
  only fifteen unique container identities.

The helper invariant proves every level's two descriptor values are identical,
all fifteen identities along the chain are distinct, the leaf descriptor is
ordinary data, and descriptor inspection performs zero ordinary gets. A
separate fuse self-check proves that an attempted read beyond a configured
budget throws synchronously and records the exceeded attempt.

The graph Proxy forwards prototypes, keys, descriptors, and values through
`Reflect`. Its audit records only ordinary `get` operations. The production
contract permits no more than sixty such operations for this graph and tests
assert both `attempts <= 60` and `exceeded === false`. They intentionally do
not lock one implementation-specific exact count.

## Repository mutation contract for shared identities

The shared graph is exercised through three distinct public mutation paths:

1. facade `create`, as an invalid non-string description;
2. facade `update`, below an unknown patch key;
3. transaction-surface `update`, below the same unknown patch key.

Each operation must reject with `code` and `message` exactly equal to:

```text
TASK_SNAPSHOT_INVALID
```

For every rejection, the test requires:

- at least one graph ordinary get, no more than sixty, and no fixture-budget
  exceed;
- zero backend set/delete attempt and zero commit;
- durable bytes, the hydrated repository cache, and a freshly loaded view to
  remain equal to the original task set;
- a subsequent ordinary facade or transaction mutation to commit normally,
  proving queue and transaction state recovery.

These assertions prevent a correct error code produced only after repeated
path expansion from passing.

## Explicit deterministic limits

The boundary suite imports the production `materializePlainJsonData` function
directly. This avoids an unrelated invalid patch key becoming the reason a
boundary test passes.

### Nested containers: 256 accepted, 257 rejected

A root-to-leaf chain of 256 transparent containers, each with two ordinary
data properties, must materialize to a detached ordinary object and perform
exactly 512 audited gets. A chain of 257 containers must reject with
`TASK_SNAPSHOT_INVALID` before an ordinary get on container 257; its audit may
record at most 512 successful attempts and must not exceed its fuse.

This limit remains compatible with the locked Review3 256-wrapper case:
bounded inspection may reject before reaching that case's getter leaf, and the
getter must still remain uncalled while the public error stays stable.

### Arrays: length 256 accepted, 257 rejected

A transparent array of length 256 must materialize to an equal detached array
with exactly 256 audited entry gets. Length 257 must reject with
`TASK_SNAPSHOT_INVALID` after descriptor/length inspection but before reading
any entry, so its audited get count is exactly zero.

### Unique containers: 512 accepted, 513 rejected

An exact-count balanced tree is built with one transparent Proxy per container
and exactly three ordinary properties per node: `slot`, `left`, and `right`.
The 512-container root must materialize to a detached ordinary object with
exactly 1,536 audited gets. The 513-container root must reject before an
ordinary read beyond the first 512 unique identities, with at most 1,536
audited gets and without exceeding the fixture fuse.

The helper invariant independently proves exact identity counts of 512 and
513 before either graph is read. The fixtures never create more than the 513
containers required to prove this boundary.

## Green controls

Four pre-repair green controls constrain the repair:

- the fixture invariant proves the fifteen-node sharing shape, exact boundary
  fixture sizes, zero pre-use reads, and synchronous fuse behavior;
- a real one-node self-cycle remains distinguishable from acyclic sharing and
  rejects stably after one audited get;
- a valid task behind a transparent Proxy, containing a small transparent
  three-element subtask array, still creates and commits normally;
- a real backend `setItem` exception remains
  `TASK_STORAGE_WRITE_FAILED`, leaves durable/cache state aligned, and permits
  a later successful write.

The repair therefore cannot reject every Proxy, reject all nested containers,
or map storage commit failures to `TASK_SNAPSHOT_INVALID`.

## Locked infrastructure and exact production imports

`tests/phase4-review5/phase4Review5Fixtures.ts` is test-only infrastructure.
It provides fixed task/envelope builders, a controlled backend, outcome
summaries, exact bounded graph builders, transparent Proxy wrappers, and an
ordinary-get audit. It contains no repository, persistence, validation, or
repair implementation.

The suites statically import the exact production modules they exercise:

- `src/data/taskSnapshotValidation.ts`;
- `src/data/taskRepository.ts`;
- `src/data/persistentTaskStorage.ts`;
- `src/domain/task.ts` for types only.

There is no dynamic production loader or catch-and-relabel import wrapper.
Module, transform, syntax, and top-level production failures surface directly.

There is no skipped, focused, pending, or snapshot-only test; no timer,
interval, fake clock, network call, platform handle, increased Jest timeout,
TypeScript suppression, explicit `any`, unresolved deferred, or generated
large payload.

## Locked coverage and counts

| Contract | Locked suite | Tests |
|---|---|---:|
| Fixture sharing, exact sizes, and audit-fuse self-proof | `tests/phase4-review5/helperInvariant.contract.test.ts` | 1 |
| Array, depth, unique-container limits plus small legal input | `tests/phase4-review5/resourceBudgets.regression.test.ts` | 4 |
| Facade create/update shared-graph atomicity and recovery | `tests/phase4-review5/sharedDagFacade.regression.test.ts` | 2 |
| Transaction shared-graph rollback plus real cycle control | `tests/phase4-review5/sharedDagTransactionAndCycle.regression.test.ts` | 2 |
| Real storage-write error preservation and recovery | `tests/phase4-review5/storageBoundary.control.test.ts` | 1 |

The candidate contains **5 suites / 10 tests**, plus one locked helper file.

## Recorded pre-fix baseline

Recorded on 2026-08-05 after the Review4 repair and before any Review5
production repair:

- Review5 with `--detectOpenHandles`: **5 suites executed, 10 tests
  discovered, 6 failed and 4 passed**;
- facade create, facade update, and transaction update each reached the 61st
  graph get and tripped the sixty-get fixture fuse;
- array length 257 attempted its first entry get instead of rejecting at the
  length boundary;
- depth 257 attempted the 513th get instead of rejecting before container
  257;
- unique-container count 513 attempted the 1,537th get instead of rejecting
  before reading beyond identity 512;
- all six failures already returned the stable invalid-snapshot identity, and
  failed only because the independent audit recorded `exceeded === true`;
- fixture invariants, actual-cycle distinction, small legal transparent input,
  and real storage-write preservation were four green controls;
- the run terminated normally in 5.323 seconds with no timeout, unhandled
  rejection, open-handle warning, discovery mismatch, or transform/import
  failure;
- `tsc --noEmit` was green.

The six red tests are precise traversal/limit evidence. The four green tests
prevent an over-broad rejection or catch boundary.

## Recorded unaffected-regression baseline

Also recorded on 2026-08-05 before any Review5 production repair:

- all prior applicable formal, Review3, Review4, Native Scaffold, and Native
  Final Review roots completed **45 suites / 320 tests green** in 34.068
  seconds;
- the constituent locked counts remain 28/253 formal, 5/18 Review3, 4/8
  Review4, 6/29 Native Scaffold, and 2/12 Native Final Review;
- `tsc --noEmit` exited successfully with no diagnostics;
- all fourteen pre-Review5 project-root manifests, containing 78 listed
  entries, had valid listed-file hashes and zero drift;
- the Review5 inventory contained six regular files, five test suites, and no
  forbidden test selection, TypeScript suppression, explicit `any`, timer,
  real-time clock read, snapshot-only assertion, or module replacement.

## Repair acceptance

No production repair receives this candidate until a brand-new independent
reviewer approves fixture validity, boundary semantics, implementability,
coverage, prior-lock consistency, exact counts, and manifest.

After acceptance, repair requires all of the following without changing this
lock:

1. Phase 4 Hardening Review5: 5 suites / 10 tests green, including
   `--detectOpenHandles`.
2. Original eight formal roots: 28 suites / 253 tests green.
3. Phase 4 Hardening Review3: 5 suites / 18 tests green.
4. Phase 4 Hardening Review4: 4 suites / 8 tests green.
5. Native Scaffold: 6 suites / 29 tests green.
6. Native Final Review: 2 suites / 12 tests green.
7. All prior applicable roots remain 45 suites / 320 tests green; adding
   Review5 produces 50 suites / 330 tests green.
8. `tsc --noEmit` is green.
9. Every applicable accepted manifest and this manifest verify with zero
   drift.
10. A brand-new independent code reviewer, with no overlap with this test
    author or the production repair agent, approves implementation and
    evidence.

Any repair failure returns to production repair and repeats independent code
review. Tests remain locked.

## Canonical commands

From `outputs/start-five` with the pinned Node/pnpm runtime on `PATH`:

```powershell
pnpm exec jest --runInBand --ci --coverage=false --roots tests/phase4-review5
pnpm exec jest --runInBand --ci --coverage=false --detectOpenHandles --roots tests/phase4-review5
pnpm exec jest --runInBand --ci --coverage=false --roots tests/locked tests/review1 tests/review2 tests/review3 tests/phase4 tests/phase4-review tests/review4 tests/phase4-review2 tests/phase4-review3 tests/phase4-review4 tests/native-scaffold tests/native-review
pnpm exec jest --runInBand --ci --coverage=false --roots tests/locked tests/review1 tests/review2 tests/review3 tests/phase4 tests/phase4-review tests/review4 tests/phase4-review2 tests/phase4-review3 tests/phase4-review4 tests/native-scaffold tests/native-review tests/phase4-review5
pnpm exec tsc --noEmit
```

## Lock construction and verification

`PHASE4_REVIEW5_LOCK.sha256` is generated last. It lists this specification
first, followed by every regular file recursively below
`tests/phase4-review5/`, sorted by POSIX-style relative path. The manifest does
not include itself.

Each line is exactly:

```text
<lowercase SHA-256><two spaces><POSIX relative path>
```

The manifest's own independent identity is the lowercase SHA-256 of
`PHASE4_REVIEW5_LOCK.sha256`. Any mismatch is lock drift and blocks repair or
delivery.
