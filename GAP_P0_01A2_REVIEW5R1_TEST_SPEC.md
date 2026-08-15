# GAP-P0-01A2 Review5R1 controlled test-consistency correction

## Status and authority

Status: **PENDING ONE INDEPENDENT TEST REVIEW / NO PRODUCTION AUTHORITY.**

Review5R1 is a controlled, additive correction of the Review5 test fixture. It
does not modify the original Review5 specification, tests, candidate, or
changelog. Original Review5 candidate self
`cb335bd66869bd1da1b4af09cdf4b45f7a00d26d3980fb0931ba02b3c8392187`
remains byte-for-byte unchanged and is **CONTROLLED SUPERSEDED / NEVER
ACCEPTED**. It grants no production authority.

This R1 candidate contains this specification and two regular TypeScript files
recursively below `tests/gap-p0-01a2-review5r1/`. Its candidate manifest is not
an accepted lock. Only acceptance of the exact R1 candidate bytes by one new
independent test reviewer may authorize the already-separate production result
to proceed to code review.

## Corrected fixture inconsistency

The original fixture armed `DelayedPrimaryRecordCas` before operation A. Its
public CAS implementation retained that armed gate in a local `gate` variable
for every CAS call. Although only the primary task-record condition entered and
waited on the gate, the unconditional trailing `gate?.settle(applied)` also ran
for the earlier successful plan-lock CAS. Consequently `boundary.applied`
resolved `true` before the delayed task-record CAS occurred.

That early signal made the original oracle report that the stale task-record
CAS wrote even when production diagnostics and durable state proved the actual
delayed comparison did not apply. The production diagnostic identity used for
this correction is:

```text
src/data/taskRepository.ts
9795542d40a52f5eeab6e7eb89bfdeedbb58dfb70064865ae4736b6df3f5705d
```

This identity is diagnostic evidence only and is deliberately excluded from
the R1 candidate lock. R1 neither accepts nor locks production bytes.

## Exact permitted correction

The two Review5 TypeScript files are mechanically copied into the R1 directory.
The contract suite and every assertion remain semantically identical. The only
fixture change is local ownership of the delayed signal:

1. read the currently armed gate into `armedGate`;
2. initialize `delayedGate` to `null`;
3. assign `delayedGate = armedGate` only inside the primary task-record CAS
   condition immediately before `enter` and `waitForRelease`; and
4. call `delayedGate?.settle(applied)` after the physical comparison.

Therefore only the CAS invocation that actually entered and awaited the
primary-record gate may resolve its `applied` promise. The earlier plan-lock
CAS cannot settle that promise. No test expectation, API call, operation ID,
clock, dependency counter, restart oracle, raw-byte oracle, or ordinary-write
oracle changes.

## Test matrix and expected evidence

R1 remains one suite with two tests and one typed helper:

| File | Purpose | Tests |
| --- | --- | ---: |
| `recordCasAba.contract.test.ts` | delayed record-CAS ABA plus no-delay control | 2 |
| `review5AbaTestKit.ts` | public physical CAS store, corrected gate, runtimes and counters | helper |

Against production before the record-generation repair, the corrected
adversarial oracle remains one legitimate red and the no-delay control remains
green. Against the current repaired production identity recorded above, both
tests may be green. In either case the gate must now report only the actual
delayed primary-record CAS result. Main `tsc --noEmit` must remain green.

The candidate inventory is exactly this specification plus the two R1
TypeScript files. The changelog is audit-only and excluded. Production source,
all original Review5 bytes, earlier tests and locks, package/Jest/TypeScript
configuration, registry, reports, native assets, unrelated workstreams, and
`outputs/qingji-ai` are outside this correction and must remain unchanged.

