# GAP-P0-01A2 Review2 additive regression candidate specification

## Status and authority

Status: **RECORDED TEST-FIRST CANDIDATE; AWAITING A BRAND-NEW INDEPENDENT
TEST REVIEW.**

This is a new, additive test candidate created after the independent code review
of the GAP-P0-01A2 Review1 repair found five classes of untested defects.  It
does not amend, replace, or weaken any accepted A1, A2, or Review1 contract.

The accepted A2 manifest self remains:

```text
6b92c2b1183f9173893f64d605fbde1dde95b0da6c4400029bfc762f7eb43d30
```

The accepted Review1 candidate identity inspected before this work remains:

```text
421c27b8ff83cc1c4cf4c42e44b38d9945fef7d00e438a6df5885145d16c905d
```

Review2 adds only this specification, regular files recursively below
`tests/gap-p0-01a2-review2/`, its own manifest, and an audit-only changelog.
It changes no production source, package or project configuration, frozen test,
earlier manifest, native project, unrelated workstream, or content under the
separate `outputs/qingji-ai` project.

The candidate manifest grants review authority only.  No production change is
authorized until a brand-new reviewer, with no A2 implementation or code-review
role, accepts the exact candidate self identity.  After acceptance, this
specification and every regular file below the Review2 test root are immutable.

## Reviewed defects addressed

The candidate closes test gaps for all of the following independent review
findings:

1. Two different backend wrapper objects over one physical store do not share
   the current object-identity queue.  Their multi-record operations can both
   report success while a stale writer removes a later operation's returned
   task, binding, or patch.
2. The current ledger digest samples at a length-derived stride.  A long page
   has many valid, same-length byte mutations that retain the same digest.
3. Ledger operation-ID uniqueness is checked only for the operation currently
   requested.  A duplicate unrelated ID elsewhere in one page or another page
   is not rejected.
4. The ledger header's task binding and request fingerprint contain complete
   task/request text and grow linearly with private title, description, and
   first-step content.
5. Scalable task pages have no cryptographic binding to the header, page bytes,
   or global ordering.  The recovery journal accepts arbitrary storage keys,
   has no explicit state or full-content digest, does not preflight the intended
   page/header graph, and can leave partial recovery writes after failure.

## Feasibility decision: an authoritative physical atomic primitive is required

### Why `getItem` / `setItem` / `removeItem` cannot satisfy the contract

There is no correct algorithm over only asynchronous read, unconditional write,
and remove that can distinguish these executions:

- two processes read the same old bytes, independently compute valid new task,
  page, header, and journal bytes, and then interleave unconditional writes;
- one process crashes after a subset of those writes and another process reads
  and helps the journal; or
- two wrapper objects are distinct in JavaScript but point at the same physical
  database.

Retrying reads or comparing an object reference does not create a
linearization point.  A stale writer can always overwrite a later successful
writer after its final check.  A process-local `WeakMap`, mutex, or module
singleton also cannot establish cross-process physical identity.  Review2
therefore does not lock a speculative retry count, lease timeout, sampled check,
or wrapper-identity heuristic.

### Minimum explicit V1 capability

An async key/value backend that opts into shared physical coordination publishes
this additive capability:

```ts
interface StartFiveAtomicCapabilityV1 {
  readonly version: 1;
  readonly scope: string;
  compareExchangeItem(
    key: string,
    expectedValue: string | null,
    desiredValue: string | null,
  ): Promise<boolean>;
}

interface AtomicBackend {
  readonly startFiveAtomic: StartFiveAtomicCapabilityV1;
}
```

`compareExchangeItem` is linearized by the physical backend across every
wrapper and process publishing that physical scope.  `scope` is stable
diagnostic metadata only; it must never be used as an object-identity mutex or
treated as proof that two unrelated stores are the same.  The implementation
may use a fenced journal, revision record, helping protocol, or equivalent
correct CAS design.  Tests do not lock its coordination key, token format,
retry scheduling, page size, or private algorithm.

The accepted backend with no `startFiveAtomic` property remains compatible for
the old single-facade path.  A backend that declares `startFiveAtomic` but has a
missing method, unsupported version, invalid scope, invalid return, or rejected
atomic call must fail closed before task clock/ID consumption or task/ledger
mutation.  It may not silently downgrade to object identity.

### Two-wrapper linearization oracles

Two independent wrapper objects share one physical map and one actual CAS
implementation.  Wrapper A pauses after its first ordinary committed set while
wrapper B begins through a separately observed backend activity.  No timer,
sleep, probabilistic schedule, or timeout is an oracle.

- Concurrent creates use different operation IDs, clocks, and generated IDs.
  If both fulfill, every returned task and both permanent bindings must survive
  the physical bytes and a fresh wrapper.  Exact replays use zero clock/ID and
  leave the complete physical byte map unchanged.
- Disjoint concurrent title/description updates to one task must produce a
  state compatible with one serial order.  Because the second result observes
  the first committed title, the final state must preserve both fields.  Both
  original operation IDs replay their exact results from a fresh wrapper.
- Both wrappers must actually exercise physical compare/exchange.  A lucky
  scheduler result without the authoritative capability is not evidence.

## Strong integrity wire contract

### Digest representation

All Review2 strong digests use SHA-256 over UTF-8 bytes and the fixed encoding:

```text
sha256-v1:<64 lowercase hexadecimal digits>
```

The test helper contains an independent, platform-neutral SHA-256 implementation
and pins the empty string, `abc`, and Chinese product-name standard vectors.
It does not import production hashing, Node crypto, a native module, network
code, or an implementation-generated oracle.

### Ledger page chain

Let `H(text)` be the versioned digest above and let raw-page length mean UTF-8
byte length.  Ordered raw ledger pages use this domain-separated chain:

```text
D0    = H("start-five.operation-ledger.v2:empty")
D(i+1)= H("start-five.operation-ledger.v2:page:" + pageNumber + ":" +
          D(i) + ":" + utf8ByteLength(rawPage) + ":" + rawPage)
```

The header's `ledgerDigest` equals the final chain value.  Therefore every byte
of every page, the page number, page order, entry metadata, fingerprint, and
serialized result is covered.  The header and every page are validated before
replay, conflict handling, new work, dependency use, or writes.

The deterministic long-page matrix changes each of 257 consecutive result-text
bytes independently from `Q` to `R`.  Every mutation remains legal JSON and the
same length.  Each must fail as `TASK_OPERATION_LEDGER_CORRUPT`, use zero clock
and ID, perform zero set/remove, and preserve the complete tampered byte map.
The current sampled digest misses 233 of those 257 concrete mutations.

Every page in a ledger of 105 operations is independently challenged at seven
widely separated legal result positions.  A separate test recomputes a fully
valid strong chain after replacing an entry result with `{}`; integrity must
then pass and semantic result validation must return
`TASK_OPERATION_LEDGER_INVALID`, proving corruption and semantic validation are
not conflated.

### Global operation-ID uniqueness

Every ledger read validates operation-ID uniqueness across every entry in every
page, regardless of the currently requested ID.  Two test forgeries copy a
non-requested ID:

- between two entries in one page; and
- from the first page into the second page.

The independent test oracle recomputes the correct strong ledger chain after
each forgery.  Therefore the expected exact error is
`TASK_OPERATION_LEDGER_INVALID`, not a digest-corruption shortcut.  Both paths
use zero dependency and zero durable mutation and preserve all source bytes.

### Fixed-size private metadata

`taskBinding`, `fingerprint`, `ledgerDigest`, and `taskDigest` are versioned,
fixed-size strong digests.  The request fingerprint remains collision-resistant
over the accepted normalized kind, target, and payload semantics, but it must
not contain raw title, description, first-step, or task JSON.  The task binding
cryptographically commits to the exact durable task state without embedding it.

Equivalent one-operation stores with short text and text hundreds of bytes long
must have equal-length ledger headers and equal-length fingerprint fields.
Headers contain none of the three unique secret markers or escaped raw task
field names.  Conflict errors, serialized errors, storage keys, and mutation
histories must not disclose either the original or conflicting command text.
The intended business result still replays exactly as required by frozen A2;
this privacy rule does not remove user-visible task fields from that result.

## Scalable task header, page, and ordering integrity

The scalable task header adds `taskDigest` using the same chain construction
with domain `start-five.task-pages.v2`.  It binds each complete raw page, page
number, UTF-8 length, and page order.  The header continues to carry and validate
its schema/version/pageCount/totalCount contract.

The tests begin with 255 legal V1 tasks and create three more through real
lifecycle operations, forcing at least two bounded scalable pages.  Byte-only
fresh backends then challenge:

- a same-length semantic title edit in every page;
- a semantic swap of two tasks within one page;
- a swap of the complete task arrays between two pages while retaining valid
  page numbers and total count; and
- one same-length `taskDigest` nibble edit.

All paths must fail `TASK_SNAPSHOT_CORRUPT` before writes, leave the supplied raw
bytes unchanged, and never attempt repair.  Legal task semantics, count checks,
and page numbers alone are insufficient.

## Journal grammar, key domain, preflight, and compensation

The Review2 journal is version 2, has explicit `state: "prepared"`, and contains
exactly the versioned operation metadata, `resultJson`, `beforeJson`,
`afterJson`, and a `journalDigest`.  The digest uses:

```text
H("start-five.operation-journal.v2:" + JSON.stringify({
  version,
  state,
  operationId,
  kind,
  fingerprint,
  resultJson,
  beforeJson,
  afterJson
}))
```

Its fingerprint is the same fixed strong request digest.  Unsupported versions
fail `TASK_OPERATION_LEDGER_UNSUPPORTED`; missing/extra fields, unknown states,
invalid digests, or invalid changes fail `TASK_OPERATION_LEDGER_INVALID`.

Before applying any change, recovery validates the complete journal, every
before/after key and value, the exact private key domain for the selected primary
task key, the intended task header/pages, the intended ledger header/pages,
their counts and strong digests, and the operation/result relationship.  Change
keys may not escape to unrelated records, path-like siblings, the journal key,
or prototype-sensitive names.  Integrity-valid forgeries cover:

- an unrelated victim key;
- `../start-five.tasks.v1`;
- `__proto__`, `constructor`, and `prototype` change keys;
- an own top-level `__proto__` field; and
- a changed intended ledger page whose intended header digest is unchanged.

Every negative path is byte-silent.  If a backend fault occurs after a recovery
write has physically committed, recovery compensates all applied changes back
to the exact prepared byte map, keeps the original cause, and remains exactly
retryable.  The retry completes the prepared operation, removes the journal,
returns the original result with zero clock/ID use, and reaches the exact bytes
of the uninterrupted reference execution.

## Candidate inventory and test matrix

The candidate has five suites, 28 tests, and one typed common helper:

| File | Contract area | Tests |
| --- | --- | ---: |
| `atomicCoordination.contract.test.ts` | physical CAS, two-wrapper create/update, invalid capability, legacy compatibility | 4 |
| `ledgerIntegrity.contract.test.ts` | SHA-256 controls, full-byte page chain, result semantics | 5 |
| `ledgerUniquenessPrivacy.contract.test.ts` | same/cross-page ID uniqueness, fixed metadata, no error leak | 4 |
| `scalableTaskIntegrity.contract.test.ts` | task header/page/ordering integrity | 5 |
| `journalValidation.contract.test.ts` | journal format, five key-domain cases, version/state, prototype, preflight, compensation | 10 |

The common helper contains only typed doubles, barriers, raw-byte reconstruction,
strict JSON guards, independent digest constants, and deterministic mutation
builders.  It does not replace, mock, or copy production modules.

## Recorded current-production baseline

The canonical command uses the pinned Node runtime, VM modules, `--runInBand`,
`--detectOpenHandles`, `--verbose`, zero coverage, and a temporary Jest `--roots`
override pointing only at `tests/gap-p0-01a2-review2`.  The project Jest config is
not modified.

Recorded result for the exact pre-manifest candidate content:

- 5 suites / 28 tests;
- 25 expected feature failures / 3 legitimate passing controls;
- exit 1, zero snapshots;
- normal completion with no timeout or open-handle warning; and
- main `tsc --noEmit` exit 0.

The three greens are intentionally independent controls: all three SHA-256
standard vectors in one test, existing conflict-error non-disclosure, and the
accepted legacy single-facade compatibility path.  No feature expectation was
weakened to force a red count.

The 25 reds map directly to the reviewed defects: three atomic capability paths,
four ledger integrity paths, two global uniqueness paths, one private metadata
path, all five scalable integrity paths, and all ten journal paths.

## Required gates before review and repair

Before issuing the manifest self, the author must record all of these against
the exact candidate bytes:

1. Review2 candidate: 5 suites / 28 tests with the recorded 25 red / 3 green
   current-production split, zero snapshots, and no open-handle warning.
2. GAP-P0-01A2 Review1: 3 suites / 20 tests green.
3. Frozen GAP-P0-01A2: 10 suites / 91 tests green.
4. Frozen GAP-P0-01A: 3 suites / 10 tests green.
5. Frozen GAP-P0-02A and GAP-P0-02B test roots green.
6. Accepted/formally repaired baseline roots: 57 suites / 353 tests green.
7. Main `tsc --noEmit` exit 0.
8. Stable accepted-manifest audit: exact format, canonical order, path safety,
   uniqueness, file presence, and every listed SHA-256.
9. Candidate inventory and digest audit: only this spec plus every regular file
   recursively below the Review2 test root.
10. Forbidden scan: no skip/focus/todo, timeout increase, fake timer, snapshot,
    sleep, direct timer, TypeScript suppression, explicit-any type, `as unknown`,
    `Function`, `Reflect`, Jest replacement, production mock, native/network use,
    or `qingji-ai` reference.

Only after a new independent test reviewer accepts the exact self may a repair
agent change production.  The test author does not implement or review that
repair.  After repair, all Review2 tests and every frozen regression must pass,
then a separate new code-review agent must inspect the production change.
