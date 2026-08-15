# GAP-P0-01A2 Review4 additive regression candidate specification

## Status and authority

Status: **PENDING ONE INDEPENDENT TEST REVIEW; NO PRODUCTION AUTHORITY.**

This candidate adds regression coverage for two defects found by the independent
post-Review3 code review. It does not modify, replace, reinterpret, or weaken
the accepted GAP-P0-01A, GAP-P0-01A2, GAP-P0-01A2 Review1, or GAP-P0-01A2
Review3 contract.

The accepted Review3 manifest self remains:

```text
ee3d8e53b08faa1c5ac580ceaf12452e4c4badfb743ef22433a534dbd362bb87
```

All seven entries named by that manifest and the manifest itself must remain
byte-for-byte exact. Review4 adds only this specification, four regular
TypeScript files recursively below `tests/gap-p0-01a2-review4/`, its own
candidate manifest, and an audit-only changelog. It changes no production source,
package/Jest/TypeScript configuration, native project, quality-gate asset,
accepted or frozen test/lock, other workstream, or separate `outputs/qingji-ai`
content.

The earlier unsigned draft-manifest self
`b8e1c8a313db3bb390f24561689ec8c4b63afb49506dd2968670dc73c4ad2871`
is **UNVERIFIED / NEVER ACCEPTED**. It grants no authority. The exact candidate
bytes described here remain mutable only for independent test-review
correction. They become locked only if a brand-new independent reviewer accepts
the exact candidate manifest self. Until then, no production repair is
authorized.

## Independent code-review findings covered

### Recoverability gap after a successful physical CAS

The accepted physical-CAS implementation writes a coordination value before
it creates a recoverable journal. If a process disappears after that CAS has
physically succeeded but before the boolean result reaches its wrapper, the
coordination value remains permanently occupied. Every new wrapper exhausts a
fixed retry loop and returns `TASK_ATOMIC_COORDINATION_BUSY`; journal recovery
is unreachable.

### Cache-coherence gap between physical-store wrappers

Repository state is cached under JavaScript object identity. Two wrappers may
both hydrate from the same physical CAS store. After one wrapper commits, the
other wrapper has no durable invalidation signal and may return its old task
list forever, even though a fresh wrapper reads the committed data.

## Public physical-CAS fault model

The typed test double implements only the accepted public V1 seam:

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
```

Distinct wrapper and capability objects address one real shared `Map`. An
after-commit fault is armed before a lifecycle create. It activates on the
next comparison that both succeeds and actually changes the physical value.
The double first performs the requested comparison and mutation, then signals
the test, and finally either never returns the boolean acknowledgement or
withholds it behind an explicit release gate.

The oracle does not inspect or predict a production key, token, owner value,
JSON grammar, retry count, journal shape, queue, mutex, or cache structure. It
does not use elapsed time, timers, sleeps, scheduler probability, a native
module, or a network facility. To prove that the orphan has been cleared or
superseded, the test only retains the dynamic key/value pair supplied by
production to that observed public CAS call and later requires the physical
value at that same observed key to differ.

A no-op comparison does not activate the fault because it has not written new
coordination or recovery state. Preliminary public probes are allowed; the
first successful state-changing CAS must itself be safe to recover if its
acknowledgement is lost.

## Recoverable coordination and fencing contract

Review4 does not prescribe a lock record, prepared record, fencing token,
helping state machine, revision graph, or private key. A prepared operation
whose initial atomic write contains enough information to help is one valid
design. Any equivalent design is valid if it satisfies all observable
requirements below.

### Lost acknowledgement, same operation ID

After the first wrapper's successful state-changing CAS acknowledgement is
permanently lost, an independent wrapper submits the same command and
operation ID. It must converge without waiting for the vanished wrapper,
return exactly one task, and consume exactly one task ID and one task clock in
aggregate across the vanished and helping wrappers. The dynamically observed
orphan value must be cleared or replaced.

A reconstructed physical store made only from the final raw bytes must replay
the same operation and result with zero clock/ID use, one stored task, and no
byte mutation. This rules out an in-process-only recovery cache.

### Lost acknowledgement, different operation ID

After the same fault, a new wrapper submits a different create and operation
ID. It must safely resolve or help the orphan before advancing the new
operation. A byte-only restart must replay both operation IDs with zero
dependencies and contain exactly the two distinct returned tasks. Aggregate
clock and ID use across the two logical creates is exactly two. The orphan CAS
value must no longer remain active.

### Delayed old owner

A third scenario withholds, rather than permanently loses, the successful CAS
acknowledgement. A different wrapper must safely help and advance another
operation while that acknowledgement is withheld. The test then releases the
old wrapper. Both calls must fulfill, exactly two tasks and two operation
bindings must exist, and byte-stable replay must return both exact results.

This is the fencing oracle. An implementation cannot pass by simply stealing
an apparently live owner and allowing the delayed owner to perform the same
logical mutation again. Safe helping, version fencing, authoritative compare
failures followed by replay, or another equivalent serializable mechanism is
allowed.

Every valid atomic path continues to use reads and public CAS only. Ordinary
`setItem` and `removeItem` mutation attempts fail in the test double and must
remain absent.

## Cross-wrapper cache-coherence contract

### Bidirectional visibility

Two distinct wrappers over one real physical CAS store both list the empty
task set before mutation, establishing independent prehydrated caches. Wrapper
A then creates and updates a task; wrapper B's `list` and `getById` must expose
each committed result. Wrapper B then updates the task; wrapper A's `list` and
`getById` must expose that result. A fresh wrapper must agree exactly.

### Concurrent convergence

Both wrappers prehydrate before two concurrent creates. A deterministic gate
at the public CAS boundary establishes overlap and an actual physical
comparison race without any timing threshold. After both operations fulfill,
wrapper A, wrapper B, and a fresh wrapper must return the exact same complete
ordered task list containing both results. Either legal serial order remains
accepted, matching Review3.

### Preserve useful caching

Coherence cannot be manufactured by discarding all cache value and reloading
the complete public primary task snapshot on every read. After an initial clean
hydrate, repeated `list`, `getById`, and query projections on the same wrapper
must not read `TASK_STORAGE_KEY` again while no other wrapper has committed.

This check deliberately permits a lightweight sidecar/revision read, a public
CAS coherence probe, or an equivalent invalidation mechanism. It does not
require zero total backend observations and does not name a private sidecar
key. After another wrapper commits, re-reading the primary snapshot or task
pages is expected and allowed.

### Nested result clone isolation

Two wrappers hydrate the same task containing a nested subtask. Mutating the
top-level and nested fields returned to either caller must not change the other
caller's already-returned object, either wrapper's subsequent reads, or the raw
physical bytes. The test applies this oracle in both wrapper directions. This
direct Review4 control prevents cache coherence from introducing shared mutable
task or subtask graphs.

## Compatibility and isolation controls

The accepted no-capability single-facade path must still create, update, and
list using ordinary durable storage.

Two unrelated physical maps intentionally publish the same diagnostic
`scope`. Store A is paused at its public CAS boundary while store B completes a
create. Only then is A released. Each fresh store wrapper must contain only its
own task. This preserves Review3's rule that scope is diagnostic metadata, not
a global physical identity or process mutex.

## Candidate inventory and test matrix

The candidate contains three suites, nine tests, and one typed helper:

| File | Contract area | Tests |
| --- | --- | ---: |
| `orphanAtomicRecovery.contract.test.ts` | lost same/new operation help, byte restart, delayed-owner fencing | 3 |
| `crossWrapperCacheCoherence.contract.test.ts` | bidirectional refresh, clean-read caching, nested clone isolation, concurrent convergence | 4 |
| `compatibilityIsolation.contract.test.ts` | no-capability single facade and equal-scope physical isolation | 2 |

`review4TestKit.ts` contains only typed backends, physical CAS observations,
deterministic promise gates, dependency counters, input builders, and runtime
assembly. It does not copy, mock, replace, or patch a production module.

## Recorded current-production result

The canonical candidate command uses the pinned Node runtime with VM modules,
project Jest configuration, a temporary `--roots` override pointing only at
`tests/gap-p0-01a2-review4`, `--runInBand`, `--detectOpenHandles`, verbose
reporting, and zero coverage. No project configuration is changed.

Recorded candidate result:

- 3 suites / 9 tests;
- 5 expected feature failures / 4 legitimate passing controls;
- exit 1, zero snapshots, normal completion in 4.719 seconds, and no
  open-handle warning; and
- main `tsc --noEmit`: exit 0 with zero diagnostics.

The five failures are the three orphan/delayed-owner recovery contracts, all
currently returning `TASK_ATOMIC_COORDINATION_BUSY`, and the two stale-cache
contracts. The four greens are clean same-wrapper primary-byte caching, direct
bidirectional nested-result clone isolation, the accepted no-capability
single-facade path, and equal-scope unrelated-store isolation. No expectation
was weakened to manufacture the split.

## Candidate gates and remaining independent review

The following evidence is recorded against the exact candidate test
bytes:

1. Review4 candidate: 3 suites / 9 tests, exact 5-red / 4-green split, zero
   snapshots, and no open-handle warning.
2. Frozen GAP-P0-01A2: 10 suites / 91 tests green.
3. Frozen GAP-P0-02A: 4 suites / 13 tests green.
4. Frozen GAP-P0-02B: 11 suites / 252 tests green.
5. Main `tsc --noEmit`: exit 0.
6. The four Review4 TypeScript files: zero forbidden-category match.
7. Accepted Review3 self and all seven entries, and frozen GAP-P0-01A2 self and
   all twelve entries: exact disk match.
8. Candidate inventory and every candidate-manifest SHA-256: exact.

The formal/global registry and formal quality-gate CLI are intentionally not
run by this scoped test-finalization task. They are neither claimed nor used to
weaken the candidate.

Exactly one gate remains: a brand-new independent test review of the exact
candidate manifest self. Only that acceptance may authorize a separate repair
agent. After repair, all nine Review4 tests and every required frozen regression
must pass, followed by a separate independent code review.
