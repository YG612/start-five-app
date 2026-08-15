# GAP-P0-01A2 Review5 record-CAS ABA regression candidate specification

## Status and authority

Status: **PENDING ONE INDEPENDENT TEST REVIEW / NO PRODUCTION AUTHORITY.**

Review5 is a minimal additive test-first candidate for one P1 defect found by
the independent Review4 production-code review. It does not modify or weaken
any accepted or frozen test. The earlier Review4 candidate self
`0872512a6c6a1241eaf119c19ac79f2b29961719e388a469d3372413bcd37f80`
passed its test review but failed the subsequent code review and is
**NEVER ACCEPTED**. It grants no production authority.

The Review5 candidate contains this specification and the regular TypeScript
files recursively below `tests/gap-p0-01a2-review5/`. Its candidate manifest
is not an accepted lock. Only one brand-new independent test reviewer may
accept the exact candidate bytes and authorize a separate production repair.

## Single P1 finding

The recoverable atomic path checks that a published operation still owns its
coordination record and then performs the task-record compare-and-exchange in a
separate asynchronous call. The ownership read and the record CAS therefore do
not form one atomic fence.

A delayed owner can pass the ownership read and enter its task-record CAS. A
helper can then finish that operation and release its coordination record. A
new operation can commit a later generation whose logical task serialization
is byte-for-byte equal to the delayed CAS expected value. Releasing the old CAS
then permits a classic ABA match: current production can write the old owner's
task bytes over the new generation while leaving the newer operation ledger or
cache-version bytes in place.

This is a record-level ABA defect. Review5 does not reopen Review4 recovery,
cache coherence, legacy compatibility, or unrelated task semantics.

## Deterministic public-CAS fixture

The self-contained fixture publishes only the accepted public V1 capability:

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

Distinct backend wrappers address one physical `Map`. Ordinary `setItem` and
`removeItem` writes fail. A gate on wrapper A pauses its next public CAS for the
primary task record before the physical comparison. The gate records that A
previously read the dynamically observed published-owner key and exact owner
value, proving that production reached the vulnerable boundary only after its
owner-fence check. No private lock key, plan grammar, ledger key, retry count,
queue, journal shape, timer, sleep, fake clock, native module, or network
facility is asserted.

While A is paused, a helper wrapper completes A's public plan and releases the
owner. Wrapper B then commits a new unique operation ID and restores the same
task's complete logical JSON bytes to A's before-image. A and B use explicit
clock values; B uses the original millisecond so the logical serialized task is
exactly restored. Releasing A exposes whether its stale record CAS writes.

A conforming implementation may attach or compare a physical generation,
combine fencing with the record transition, or use any equivalent mechanism.
The contract does not freeze a physical record format. It requires only that
the stale A transition not apply and that B remain the durable winner.

## Required observable invariants

After B has returned successfully and delayed A is released:

1. A's boundary records a prior exact owner read, proving the intended CAS
   boundary was reached.
2. B's returned logical task serialization exactly equals the initial task
   serialization, establishing the ABA before-image without inspecting a
   private physical grammar.
3. The delayed A task-record comparison must not apply.
4. Both live wrappers and a byte-only fresh restart must list B's exact task.
5. Replaying B's operation after restart must return B's exact result with no
   clock or ID use and no raw-byte mutation.
6. A and B together consume exactly two operation clocks and zero task IDs;
   helper, read, and replay paths consume neither dependency.
7. No ordinary backend mutation is attempted.

These assertions jointly reject task overwrite, mixed task/ledger generation,
mixed cache-version generation, in-process-only repair, and duplicate
dependency use.

## Minimal distinguishing control

The no-delay control runs the same A update followed by the same unique B
restore without a CAS gate. Both calls must succeed, both live wrappers and a
fresh restart must expose B, both operation IDs must replay without dependencies
or byte changes, and aggregate clock/ID counts must remain two/zero. This proves
that valid A/B lifecycle behavior and the byte-exact restoration are not the
source of the adversarial failure.

## Candidate inventory and expected pre-repair result

The candidate contains one suite with two tests and one typed helper:

| File | Purpose | Tests |
| --- | --- | ---: |
| `recordCasAba.contract.test.ts` | delayed record-CAS ABA plus no-delay control | 2 |
| `review5AbaTestKit.ts` | public physical CAS store, gate, runtimes and counters | helper |

Before production repair, the isolated Review5 run must show at least one
legitimate feature failure and a green no-delay control, with zero snapshots
and normal completion. Main `tsc --noEmit` must remain green. Review4's 9 tests
and the frozen GAP-P0-01A2 91-test identity are sampled without broad or formal
quality-gate execution.

## Recorded exact-candidate evidence

The Manager executed the exact final Review5 test bytes with the pinned project
Jest configuration, `--runInBand`, zero coverage, and a roots override limited
to `tests/gap-p0-01a2-review5`:

- 1 suite / 2 tests;
- exact 1 legitimate feature failure / 1 legitimate passing control;
- exit 1, zero snapshots, normal completion in 4.933 seconds; and
- the feature failure deterministically reports
  `TASK_OPERATION_LEDGER_STATE_MISMATCH` after the stale A record CAS produces
  mixed durable task/ledger/version state.

The green test is the no-delay A-then-B byte-restoration and durable-replay
control. Main `tsc --noEmit` completed with exit 0 and zero diagnostics against
the same final TypeScript bytes. No fixture or expectation was changed after
this evidence was obtained.

The formal/global quality-gate CLI and registry are intentionally outside this
single-P1 test-author task and are not claimed. Status remains **PENDING ONE
INDEPENDENT TEST REVIEW / NO PRODUCTION AUTHORITY** until an independent reviewer
accepts the exact candidate-manifest self.

