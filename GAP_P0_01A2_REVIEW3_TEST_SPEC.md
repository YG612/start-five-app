# GAP-P0-01A2 Review3 additive regression candidate specification

## Status and authority

Status: **RECORDED TEST-FIRST CANDIDATE; AWAITING A BRAND-NEW INDEPENDENT
TEST REVIEW.**

This candidate replaces only the unaccepted Review2 candidate as the proposed
additive regression gate.  It does not amend, replace, or weaken any accepted
GAP-P0-01A, GAP-P0-01A2, or GAP-P0-01A2 Review1 contract.

The GAP-P0-01A2 Review2 manifest self

```text
b71762ddd3cd3885ec9aff12189a86bc363338cfe0bfb0295708de280073413b
```

is **REVIEW FAILED / NEVER ACCEPTED**.  It is not “revoked”, because it never
became an accepted lock.  Its one specification and six candidate test files
remain byte-for-byte historical evidence and are not an executable dependency
of this candidate.

The accepted A2 and Review1 identities remain:

```text
GAP-P0-01A2:         6b92c2b1183f9173893f64d605fbde1dde95b0da6c4400029bfc762f7eb43d30
GAP-P0-01A2 Review1: 421c27b8ff83cc1c4cf4c42e44b38d9945fef7d00e438a6df5885145d16c905d
```

Review3 adds only this specification, six regular TypeScript files recursively
below `tests/gap-p0-01a2-review3/`, its own manifest, and an audit-only
changelog.  It changes no production source, package or project configuration,
accepted/frozen test, earlier manifest, native project, unrelated workstream,
or content under the separate `outputs/qingji-ai` project.

The candidate grants test-review authority only.  No production repair is
authorized until a brand-new reviewer accepts the exact Review3 manifest self.
After acceptance, this specification and all six Review3 TypeScript files are
immutable.

## Why Review2 failed independent review

The independent reviewer found the Review2 concurrency contract direction
valid but two executable oracles unsound and several capability boundaries
incomplete:

1. Its two-wrapper barriers paused an ordinary `setItem` after commit.  A valid
   backend that exposes physical compare/exchange but intentionally offers no
   usable ordinary mutation method could never reach the oracle.
2. Its update oracle required the A-then-B history: it required B’s returned
   task to contain A’s title and required the stored create order to be A then
   B.  B-then-A is an equally valid linearization.
3. Only a declared capability with a missing method was tested.  Wrong version,
   invalid/empty scope, invalid resolved values, synchronous throws, rejected
   promises, and the semantic distinction between `false` and a malformed
   result were absent.
4. The text said diagnostic `scope` was not physical identity but did not prove
   that two unrelated physical stores using the same scope remain independent.

Review3 corrects those test defects without changing the underlying product
requirement: shared physical state must be coordinated by a real backend atomic
primitive, not JavaScript wrapper identity or a diagnostic string.

## Optional physical atomic capability

### Public V1 shape

An async key/value backend may publish this additive capability:

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

The physical backend linearizes `compareExchangeItem` over every wrapper and
process that addresses the same actual storage.  Exact equality is over the
complete stored string or `null`; `desiredValue: null` is an atomic delete.

`scope` is required non-empty diagnostic metadata.  It is not a process mutex,
a globally unique physical identity, or evidence that two objects address the
same store.  Equal scope strings on unrelated physical stores must not couple
their progress.  Conversely, different wrapper and capability objects over the
same physical CAS must still preserve both successful operations.

The capability is optional.  A backend with no own or inherited
`startFiveAtomic` declaration retains the accepted single-facade compatibility
path.  This preserves all accepted A1/A2/Review1 behavior.

### CAS-only is a valid implementation

Once a valid V1 capability is declared, the durable operation must be able to
complete using reads and physical compare/exchange alone.  Ordinary `setItem`
and `removeItem` cannot be assumed available for mutation.  Review3’s valid
atomic double exposes those methods only for structural compatibility; every
ordinary mutation attempt is recorded and fails immediately.  All successful
atomic scenarios require zero such attempt.

Tests do not constrain coordination key names, tokens, retry count beyond one
demonstrated conflict, journal/page sizes, lock records, helping strategy, or
private algorithm.  A fenced journal, revision record, CAS state machine, or
equivalent design may be used.

### Exact capability validation and failure semantics

A declaration is invalid if any of these holds:

- `compareExchangeItem` is missing or not callable;
- `version` is not exactly numeric `1`;
- `scope` is not a string, is empty, or is whitespace-only; or
- an invocation resolves to anything other than the booleans `true` or `false`.

Malformed declarations fail closed before task clock or task-ID generation,
before task/ledger mutation, and without falling back to ordinary mutation or
an object/scope keyed process lock.  A synchronous CAS throw or rejected CAS
promise has the same fail-closed, byte-preserving behavior.  Error text and
serialized errors must not disclose request content.

Boolean `false` is not an invalid return.  It is an authoritative comparison
miss.  The implementation must re-read/retry in a bounded, safe manner; the
test forces one miss and requires the operation to complete with more than one
CAS observation and no ordinary mutation.

## Deterministic, implementation-neutral concurrency oracles

### Public-boundary scheduling

The valid test store contains a real physical `Map` and distinct wrapper and
capability objects.  Its only gate pauses an invocation at the public
`compareExchangeItem` boundary before the physical comparison.  It never waits
for or inspects an ordinary set, a production key, a private queue, a journal
shape, or a retry counter.

The test first proves that the operation reaches public CAS before settling.
It then starts the other facade and proves that facade also reaches physical
CAS before releasing the first gate.  This produces an actual comparison miss
when both wrappers address one physical store.  There is no sleep, direct
timer, fake timer, elapsed-time threshold, or probabilistic scheduler.

### Two-wrapper creates

Two distinct wrappers create two different tasks under different operation IDs.
Both operations must fulfill.  A fresh third wrapper must contain both exact
returned tasks, with distinct generated IDs, in either durable order.  Each
operation ID must replay its own exact result using zero clock/ID and with the
complete physical byte map unchanged.  Both original wrappers must have used
CAS and none may use ordinary mutation.

### Two-wrapper disjoint updates

Two wrappers update one task concurrently: A changes only the title and B only
the description.  Review3 accepts exactly either legal serial history:

- A then B: A returns new-title/old-description; B and final state contain
  new-title/new-description; or
- B then A: B returns old-title/new-description; A and final state contain
  new-title/new-description.

No other returned/final combination is accepted.  Both original operation IDs
then replay their exact historical results from fresh bytes without mutation.
This proves result binding, not merely a lucky final state.

### Equal-scope unrelated physical stores

Two separate physical maps intentionally publish the exact same diagnostic
scope.  Store A is paused at its public CAS boundary.  A complete create on
store B must finish while A remains unsettled; only then is A released.  Each
store must contain only its own returned task.  This is a causal progress
oracle with no wall-clock assertion and rejects a global mutex keyed by scope.

## Strong ledger integrity and semantic validation

Review3 independently carries forward the qualified non-concurrency boundaries
rather than importing the failed Review2 candidate as a required-green root.

All strong digests are SHA-256 over UTF-8 bytes with this encoding:

```text
sha256-v1:<64 lowercase hexadecimal digits>
```

The typed helper implements an independent platform-neutral SHA-256 oracle and
pins the empty string, `abc`, and `先做5分钟` public vectors.  It imports no
production hashing, Node crypto, native module, network code, or generated
oracle.

For ordered ledger pages, with `H` denoting the encoded digest and raw length
measured in UTF-8 bytes:

```text
D0     = H("start-five.operation-ledger.v2:empty")
D(i+1) = H("start-five.operation-ledger.v2:page:" + pageNumber + ":" +
           D(i) + ":" + utf8ByteLength(rawPage) + ":" + rawPage)
```

The header’s `ledgerDigest` equals the final chain.  A 257-position legal-JSON,
same-length result mutation matrix must reject every changed byte as
`TASK_OPERATION_LEDGER_CORRUPT`, before dependencies or writes.  The current
sampled digest accepts 233 changed positions.  A 105-operation ledger also
challenges seven positions on every page.  An independently re-signed `{}`
result must pass integrity then fail semantic validation as
`TASK_OPERATION_LEDGER_INVALID`.

## Global operation-ID uniqueness and private metadata

Every ledger read validates operation-ID uniqueness across every entry and
page, even when neither duplicate is the requested ID.  Review3 independently
re-signs same-page and cross-page duplicate forgeries with the valid strong
page chain, so the required result is semantic
`TASK_OPERATION_LEDGER_INVALID`, not a digest shortcut.

`taskBinding`, request `fingerprint`, `ledgerDigest`, and scalable `taskDigest`
are versioned fixed-size strong digests.  The header and fingerprint may not
embed title, description, first-step, escaped raw task JSON, or grow with those
fields.  Conflict errors, storage keys, and mutation histories must not disclose
the original or conflicting command text.  User-visible replay results still
contain the accepted task fields.

## Scalable task page integrity

The scalable task header binds every complete ordered raw task page through the
same chain with domain `start-five.task-pages.v2`.  Starting from 255 valid V1
tasks and three real creates, Review3 requires more than one scalable page and
challenges:

- a same-length semantic title change in every page;
- a two-task reorder within one page;
- a complete task-array swap between pages while page numbers/count remain
  valid; and
- a fixed-length header digest nibble change.

Every path fails `TASK_SNAPSHOT_CORRUPT` before mutation and preserves the exact
tampered byte map.  Semantic validity and page counts alone are insufficient.

## Journal grammar, domain, preflight, and compensation

The durable journal is version `2`, state `prepared`, with exactly the accepted
operation metadata, `resultJson`, `beforeJson`, `afterJson`, and
`journalDigest`.  Its independent digest is:

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

Recovery preflights the complete journal, every before/after value, exact
private key domain, intended task and ledger graphs, counts, strong digests, and
operation/result relationship before its first write.  Integrity-valid
forgeries cover an unrelated key, a path-like sibling, `__proto__`,
`constructor`, `prototype`, an own top-level `__proto__`, unsupported version,
unknown state, and an intended page whose header digest was not updated.

If a physical write commits and then reports failure during recovery, recovery
compensates to the exact prepared bytes, preserves the original cause, and
remains exactly retryable.  A retry completes the prepared operation, removes
the journal, returns the original result with zero clock/ID, and reaches the
uninterrupted reference bytes.

## Candidate inventory and test matrix

The candidate contains five suites, 38 tests, and one typed helper:

| File | Contract area | Tests |
| --- | --- | ---: |
| `atomicCoordination.contract.test.ts` | CAS-only concurrency, both serial histories, equal-scope independence, validation matrix, false miss, legacy compatibility | 14 |
| `ledgerIntegrity.contract.test.ts` | SHA-256 controls, full-byte ledger chain, semantic result validation | 5 |
| `ledgerUniquenessPrivacy.contract.test.ts` | global ID uniqueness, fixed metadata, non-disclosure | 4 |
| `scalableTaskIntegrity.contract.test.ts` | task header/page/order integrity | 5 |
| `journalValidation.contract.test.ts` | journal grammar, key domain, preflight, compensation | 10 |

`review3TestKit.ts` contains only typed doubles, public-CAS gates, byte
reconstruction, strict JSON guards, independent digest constants, and
deterministic mutation builders.  It does not replace, mock, or copy a
production module.

## Recorded current-production baseline

The canonical command uses the pinned Node runtime, VM modules, `--runInBand`,
`--detectOpenHandles`, `--verbose`, zero coverage, and a temporary Jest `--roots`
override pointing only at `tests/gap-p0-01a2-review3`.  Project configuration is
unchanged.

Recorded exact pre-manifest result:

- 5 suites / 38 tests;
- 35 expected feature failures / 3 legitimate passing controls;
- exit 1 and zero snapshots;
- 6.677 seconds, normal completion, no timeout or open-handle warning; and
- main `tsc --noEmit` exit 0.

The only greens are the independent SHA-256 vector control, accepted conflict
non-disclosure control, and accepted no-capability single-facade path.  The 35
reds map to 13 atomic/capability paths, four ledger-integrity paths, three
uniqueness/privacy paths, five scalable-integrity paths, and ten journal paths.
No feature expectation was weakened to manufacture the count.

## Required gates before independent review and repair

Before issuing a formal self identity, the author must record all of these
against the exact candidate bytes:

1. Review3 candidate: 5 suites / 38 tests with the exact 35-red / 3-green split,
   zero snapshots, and no timeout/open-handle warning.
2. GAP-P0-01A2 Review1: 3 suites / 20 tests green.
3. Frozen GAP-P0-01A2: 10 suites / 91 tests green.
4. Frozen GAP-P0-01A: 3 suites / 10 tests green.
5. Frozen GAP-P0-02A: 4 suites / 13 tests green.
6. Frozen GAP-P0-02B: 11 suites / 252 tests green.
7. Accepted/formally repaired baseline: 57 suites / 353 tests green.
8. Main `tsc --noEmit` exit 0.
9. Stable accepted-manifest audit: exact format, canonical order, path safety,
   uniqueness, file presence, and every listed SHA-256.
10. Candidate inventory: exactly this specification plus all six regular files
    recursively below `tests/gap-p0-01a2-review3/`.
11. Forbidden scan: no skip/focus/todo, timeout increase, fake timer, snapshot,
    sleep, direct timer, TypeScript suppression, explicit-any type,
    `as unknown`, `Function`, `Reflect`, Jest replacement, production mock,
    native/network access, or `qingji-ai` reference.
12. Review2 historical bytes still match all seven entries in self
    `b71762ddd3cd3885ec9aff12189a86bc363338cfe0bfb0295708de280073413b`.

Only after a new independent test reviewer accepts the exact Review3 self may a
repair agent change production.  The test author must not implement or review
that repair.  After repair, all 38 Review3 tests and every frozen regression
must pass, followed by a separate independent code review.
