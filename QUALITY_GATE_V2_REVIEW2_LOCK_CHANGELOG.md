# QUALITY-GATE-V2 Windows PATH Review2 lock changelog

This audit file is intentionally excluded from
`QUALITY_GATE_V2_REVIEW2_LOCK.sha256`.

## 2026-08-06 - Review2 same-process ambient oracle

Review1 self
`5129206bffb81e77d1487b7b3a3ac9e2ee3e9270750549ec4424196c7d801b45`
is **REVIEW FAILED / NEVER ACCEPTED**. The independent review accepted its
functional Windows PATH coverage but rejected its ambient `process.env`
immutability proof because it only compared the parent Jest worker around a
separate child.

Review2 is a new self-contained suite. It copies every qualified functional,
conflict, non-Windows, allowlist, no-shell, and side-effect contract and adds a
fixture that snapshots the full ambient environment immediately before and
after invoking production in that same process. Three mutation controls prove
case/value-sensitive diff detection and full `finally` restoration.

No Review1 listed byte, production file, accepted QG/Native asset, package,
registry, other test/lock, or unrelated project file is authorized for change.
Until independent Review2 PASS, this candidate is **PENDING REVIEW / NOT
ACCEPTED / NO PRODUCTION AUTHORITY**.

### Author verification

The final isolated run was 3 suites / 16 tests: exactly 8 legitimate expected
reds and 8 independent greens, with zero snapshots and no fixture, restore,
timeout, or open-handle warning. The old functional subset remained 7 red / 4
green; the same-process addition was 1 red / 4 green. All three active mutation
controls emitted exact diffs and exact full-environment restoration evidence.

Global TypeScript passed with zero diagnostics, and all three CJS fixtures
passed direct syntax checks. QG 9/233, Native 6/30, formal 57/354, P0-02A 4/13,
P0-02B 11/252, and registry 77/839 all passed. The shipped validator passed 17
accepted manifests / 116 entries.

QG self remained `3436439e37e461dc5a1141f61613e67e9eb5566538585bc0a956e2256e44d664`.
Native final/candidate/registry remained
`12958a547ebb739bb0d4dafe7029e3dc6274f9bfef763994afd892b249bb23db`.
Review1 remained exact self
`5129206bffb81e77d1487b7b3a3ac9e2ee3e9270750549ec4424196c7d801b45`
with all 6 listed hashes intact.

Eleven forbidden pattern families across 9 pre-manifest Review2 files produced
zero hits. All six intentional ambient-mutation lines were confined to the
oracle fixture; unauthorized hits and temp leaks were zero. No external
failure or overlapping shared-file interference occurred.

The final manifest has 8 entries in spec-first canonical POSIX order, no self
entry, complete 8/8 specification/test inventory coverage, and zero
missing/hash/order errors. Candidate self SHA-256:

`1c6d556b011f1778b33938bbb6f91d35eaeed959b43bdfad0fd4c7e20a507937`

The Review2 specification, tests, fixtures, helper, and manifest are now
frozen. Only this excluded changelog may record the new independent review.
The candidate remains **PENDING REVIEW / NOT ACCEPTED / NO PRODUCTION
AUTHORITY**.
