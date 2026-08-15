# QUALITY-GATE-V2 Review1 lock changelog

This file is audit-only and intentionally excluded from
`QUALITY_GATE_V2_REVIEW1_LOCK.sha256`.

## 2026-08-06 - Initial post-acceptance Windows PATH candidate

The accepted QUALITY-GATE-V2 self
`3436439e37e461dc5a1141f61613e67e9eb5566538585bc0a956e2256e44d664`
was not modified. A new, separate test-only Review1 suite was authored for a
Windows environment-key defect found after acceptance: Node may enumerate
`Path`, a spread produces a plain case-sensitive object, and the gate reads
only `PATH` before a `shell:false` process start.

The candidate defines stable conflict code
`QUALITY_GATE_ENV_PATH_CONFLICT`, exact unique/equal/conflicting Windows PATH
semantics, non-Windows case sensitivity, zero conflict side effects, input
immutability, and a real fast CLI/process-start fixture. The fixture uses no
network, install, Jest stage, Android/iOS build, or external service.

This changelog will receive exact run counts, regression evidence, manifest
self SHA-256, and independent-review disposition after the candidate is
verified and signed. Until a brand-new independent reviewer returns PASS, the
candidate is **PENDING REVIEW / NOT ACCEPTED / NO PRODUCTION AUTHORITY**.

### Author verification

The isolated suite ran as 2 suites / 11 tests: exactly 7 legitimate expected
reds and 4 independent green controls, with zero snapshots and no timeout,
watchdog, fixture, permission, or open-handle warning. Global TypeScript passed
with zero diagnostics, and both CJS fixtures passed direct Node syntax checks.

Frozen regressions passed as QG V2 9/233, Native scaffold 6/30 (combined Native
8/42), formal 57/354, P0-02A 4/13, P0-02B 11/252, and the complete current
accepted registry 77/839. The shipped lock validator passed 17 accepted
manifests / 116 entries while retaining one rejected historical manifest.
Accepted QG V2 self remained `3436439e37e461dc5a1141f61613e67e9eb5566538585bc0a956e2256e44d664`.
The Native final/candidate/registry identity remained
`12958a547ebb739bb0d4dafe7029e3dc6274f9bfef763994afd892b249bb23db`,
and the `.candidate` file remains present.

Ten forbidden-pattern families across the 7 pre-manifest Review1 files
produced zero hits. No ambient `process.env` mutation and no leaked temp
fixture directory was found. No external interference or overlapping shared
file change was observed during the verification batch.

The final manifest contains 6 entries in spec-first canonical POSIX order,
has no self entry, exactly covers the specification plus complete Review1 test
inventory, and has zero missing/hash/order errors. Candidate self SHA-256:

`5129206bffb81e77d1487b7b3a3ac9e2ee3e9270750549ec4424196c7d801b45`

The specification, tests, fixtures, helper, and manifest are now frozen. Only
this excluded changelog may record the new independent review result. The
candidate remains **PENDING REVIEW / NOT ACCEPTED / NO PRODUCTION AUTHORITY**.
