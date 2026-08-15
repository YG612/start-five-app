# GAP-P0-02B Review1 additive regression draft specification

## Status and authority

Status: **UNVERIFIED CANDIDATE DRAFT / NOT LOCKED / NO REPAIR AUTHORITY.**

This additive test-first draft responds only to three defects reported by the
independent final code review of the GAP-P0-02B implementation:

1. a repository facade can capture old durable bytes, observe a newer shared
   revision after another facade commits, and incorrectly publish the old
   bytes as if they belonged to that newer revision;
2. a leaked transaction surface remains callable after its callback Promise
   has settled while the outer transaction is waiting for its durable commit;
   and
3. a canonical clock at the ECMAScript `Date` maximum can overflow while
   calculating `plannedEndAt` and leak a native `RangeError` after repository
   and ID dependencies have already been used.

The accepted GAP-P0-02B assets remain unchanged and authoritative. Their exact
manifest self identity is:

```text
9389a01da6f468227de0edf5673c101fc3ea412ba3b24fddaff10a7cb0ab8bd8
```

This draft adds only this specification, regular files recursively below
`tests/gap-p0-02b-review1/`, an audit-only changelog, and an explicitly unsigned
manifest draft. It does not amend, supersede, or unlock any GAP-P0-02B file.
It changes no production source, package/configuration file, native project,
other test/specification/manifest, active GAP-P0-01A2 Review1 or GAP-P0-04
asset, rejected QUALITY_GATE asset, or the separate `outputs/qingji-ai` app.

The authoring environment reached a platform-wide execution-usage limit after
the files were written. Consequently Jest, TypeScript, stable regression, and
manifest gates could not be executed by either the test author or Manager.
Static inspection is complete, but predicted counts are not evidence. The
file `GAP_P0_02B_REVIEW1_LOCK.sha256.draft` is deliberately not a lock, and its
SHA-256 must not be described as a candidate self identity. Production repair
is forbidden until all commands in this document run with the exact expected
results, the final manifest is generated from those verified bytes, and a
brand-new independent test reviewer accepts that final identity.

## Frozen public behavior

All accepted GAP-P0-02A and GAP-P0-02B public types, exports, factories,
repository/storage ports, service methods, validation rules, state-machine
semantics, error codes, persistence envelope, detachment rules, ordering, and
cross-facade linearization remain exact. This draft adds no public method,
field, option, error code, storage key, schema field, or dependency.

After verification and independent test acceptance only, a repair agent may
make the minimum internal changes to the existing focus-session production
modules necessary to pass these tests. It may not edit any frozen or Review1
test asset.

## Revision-safe hydration

The tests use the real production persistent-storage adapter and repository
factory. Two independently constructed repository facades share the same real
storage object and key, so they also share the production coordinator while
retaining separate facade caches.

A deterministic read barrier captures facade A's old bytes before returning
them. Facade B has already hydrated that old state, commits a new terminal
session while A's read is blocked, and advances the shared revision. Only then
is A's old read released. A correct hydration algorithm must compare the
revision associated with the captured read to the current revision and re-read
until it can publish bytes from a stable revision. It may not label old bytes
with the post-commit revision.

Observable requirements are:

- the backend action sequence through hydration is exactly `get, get, set,
  get`: B preheat, A captured old read, B commit, A mandatory re-read;
- A's raced `load`, subsequent `list`, and subsequent `get` all contain B's
  record, and the latter cache reads add no backend I/O;
- a later direct A `save` followed by an A transaction `save` preserves B's
  record in insertion order, in A's cache, B's refreshed cache, and the exact
  durable envelope; and
- if A's mandatory re-read fails, the persistent adapter exposes
  `FOCUS_SESSION_STORAGE_READ_FAILED` with the exact cause, no stale cache is
  published, and a following real transaction rehydrates, preserves B, commits
  its own record, and proves the shared mutation queue remains usable.

The failure/recovery action sequence is exactly `get, get, set, get, get,
set`. No sleep, timer, scheduler guess, mock, or fake repository is used.

## Transaction callback lifetime

The authority of a `FocusSessionTransaction` surface ends when the callback
Promise settles, not when the outer repository transaction finishes its later
commit. A deterministic backend write barrier is entered only after the
callback returned its result and the production repository attempted the
single commit. While that write is still blocked and the outer operation is
provably unsettled, all four leaked methods are invoked immediately:

```text
load
list
get
save
```

Every call must reject with
`FOCUS_SESSION_REPOSITORY_TRANSACTION_EXPIRED`. In particular, the late `save`
must not mutate staged state or create a cache/durable divergence.

The successful-commit path releases the barrier and requires both current and
fresh repository views plus durable bytes to contain only the callback's first
record. The failure path injects one exact error after the barrier is released,
requires `FOCUS_SESSION_STORAGE_WRITE_FAILED` with that same cause, requires
empty durable/cache state, then performs a normal save and fresh-facade read to
prove the queue recovered. Both paths inspect real production repository and
persistent-storage behavior.

## Canonical Date upper boundary

The exact canonical ECMAScript upper timestamp is:

```text
+275760-09-13T00:00:00.000Z
```

For each accepted positive duration `2 | 5 | 15 | 25 | 50`, starting at that
timestamp necessarily makes `plannedEndAt` unrepresentable. The service must
reject with the already declared stable code `FOCUS_SESSION_INVALID_CLOCK`.
It must not leak `RangeError`, must sample the clock exactly once, must not call
the ID generator, and must perform zero backend `getItem`, `setItem`, or
`removeItem` operations. This requires validating the derived end timestamp
before entering repository I/O.

For every duration, a paired control starts exactly `duration` minutes before
the maximum. Its planned end lands exactly on the maximum and must succeed with
one clock sample, one ID, one durable read, and one durable write. These controls
prevent an implementation from imposing an arbitrary earlier cutoff.

## Draft inventory and predicted pre-repair baseline

The draft contains one typed helper and three discovered suites:

| Suite | Tests | Predicted green | Predicted red | Responsibility |
|---|---:|---:|---:|---|
| `hydrationRevisionRace.contract.test.ts` | 2 | 0 | 2 | stale-read revision retry, preservation, read failure, queue recovery |
| `transactionSurfaceExpiry.contract.test.ts` | 2 | 0 | 2 | callback-end expiry during successful/failed blocked commit |
| `dateBoundary.contract.test.ts` | 10 | 5 | 5 | five overflow rejections and five exact-boundary controls |
| **Predicted total** | **14** | **5** | **9** | **must be confirmed before signing** |

The nine predicted red tests are expected to fail against the reviewed current
implementation for the three known defects. The five predicted controls should
pass. These numbers were derived by static inspection only and must not be
reported as a run result.

The draft source scan found zero focused/skipped/todo/pending test mode,
TypeScript suppression, `as any`, `as unknown`, Jest module replacement, fake
timer, direct timeout/interval, sleep, or snapshot-only assertion. Tests use no
network, device, native runtime, or scheduling delay.

## Mandatory verification commands and exact expected gates

Run from `outputs/start-five` with the pinned Node/pnpm runtime on `PATH`:

```powershell
pnpm exec jest --runInBand --ci --coverage=false --detectOpenHandles --roots tests/gap-p0-02b-review1
pnpm exec jest --runInBand --ci --coverage=false --roots tests/gap-p0-02b
pnpm exec jest --runInBand --ci --coverage=false --roots tests/gap-p0-02a
pnpm exec jest --runInBand --ci --coverage=false --roots tests/locked tests/review1 tests/review2 tests/review3 tests/review4 tests/phase4 tests/phase4-review tests/phase4-review2 tests/phase4-review3 tests/phase4-review4 tests/phase4-review5 tests/native-scaffold tests/native-review tests/gap-p0-01a tests/gap-p0-02a
pnpm exec tsc --noEmit
```

Before a final manifest may be signed, all of these must be true:

1. Review1 is discovered as exactly 3 suites / 14 tests and exits normally
   with exactly 9 feature failures / 5 controls passing, zero snapshot, timeout,
   or open-handle warning;
2. frozen GAP-P0-02B is exactly 11 suites / 252 tests green;
3. frozen GAP-P0-02A is exactly 4 suites / 13 tests green;
4. the accepted/formally repaired baseline is exactly 57 suites / 353 tests
   green;
5. main `tsc --noEmit` is green;
6. the established stable-lock audit, excluding active GAP-P0-01A2 Review1,
   GAP-P0-04, this draft/candidate, and rejected QUALITY_GATE, reports exactly
   16 manifests / 101 entries / zero format, canonical-order, path-safety,
   uniqueness, presence, or SHA-256 issue; and
7. the full bypass scan remains zero.

If any observed count, failure reason, TypeScript diagnostic, open handle, or
stable-lock result differs, this draft must be corrected by the test author and
re-run before independent review. A repair agent must never reinterpret an
unexpected test failure as implementation authority.

## Final manifest procedure

After all mandatory gates pass, regenerate a final
`GAP_P0_02B_REVIEW1_LOCK.sha256` from the then-current verified bytes. It must
list this specification first, followed by every regular file recursively below
`tests/gap-p0-02b-review1/`, sorted by canonical POSIX relative path. It excludes
itself, the `.draft` file, and the audit-only changelog. Each line is exactly:

```text
<lowercase SHA-256><two spaces><POSIX relative path>
```

Only the lowercase SHA-256 of that verified final manifest may become the
candidate self identity. The unsigned draft manifest records current static
bytes solely to make later drift review straightforward; it freezes nothing.
After signing, a brand-new independent test reviewer must validate semantics,
red/green legitimacy, inventory, and identity before any production repair is
dispatched.
