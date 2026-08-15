# QUALITY-GATE-V2 Windows pnpm launch Review3 lock changelog

This audit file is intentionally excluded from
`QUALITY_GATE_V2_REVIEW3_LOCK.sha256`.

## 2026-08-06 - test-author candidate

The production precondition was verified before any Review3 file was written.
The abandoned untested resolver was absent, and
`scripts/quality-gate-v2/index.cjs` was exactly
`0d6b5c7b512d97847b8c6c208fd4abe4ff4a1c1db1679296e18c73446929dbae`.
Review2 passed 3 suites / 16 tests, accepted QUALITY-GATE-V2 passed 9 suites /
233 tests, and global TypeScript had zero diagnostics.

Review3 is a new self-contained test-only contract for the Windows condition
where PATH exposes `pnpm.cmd` but `spawn('pnpm', ..., {shell: false})` fails with
ENOENT. It requires a safe current-Node/regular-JavaScript launch, literal argv,
cwd and allowlisted environment preservation, CJS-before-MJS priority inside
one trusted identity, fail-closed regular-file/reparse/traversal/ambiguity
validation, and compatibility for native executables, explicit `--pnpm`,
generic executables, and the accepted non-Windows preflight.

### Candidate execution

The final isolated candidate was 4 suites / 21 tests: exactly **12 legitimate
expected reds and 9 independent greens** in 4.731 seconds. There were zero
snapshots and no fixture, junction-permission, cleanup, timeout, watchdog, or
open-handle warning.

- all 8 unsafe-candidate cases were red only because production lacks the new
  stable `QUALITY_GATE_PNPM_LAUNCH_UNSAFE` / `_AMBIGUOUS` pre-launch boundary;
- the real-CLI missing-companion case additionally proved that current code
  writes a failure report, which the new zero-side-effect contract forbids;
- the synthetic CJS default, direct MJS fallback, CJS priority, and real bundled
  `pnpm --version` launch were red only at the current bare-pnpm ENOENT defect;
- all zero-marker/recorder/PID/temp/report tree-snapshot controls ahead of the
  classification assertions behaved deterministically;
- all 8 compatibility/fixture controls were green; and
- dynamic, read-only bundled-layout discovery was independently green without
  an author-machine or bundled absolute path.

Two initial control-oracle mismatches were corrected before signing: Windows
may synthesize standard process-identity variables independently of the
runner's supplied environment, and successful CLI stdout appends the accepted
lock summary. The final fixtures therefore observe every runner-allowlisted
value, PATH spelling and forbidden-secret sentinel, while not misclassifying
host-synthesized values. The non-Windows report oracle was also aligned to the
accepted `failure.stderr` schema. After these corrections, the compatibility
suite was 8/8 green and no false red remained.

### Regression and trust evidence

All required accepted regressions passed:

- Review2: 3 suites / 16 tests;
- QUALITY-GATE-V2: 9 suites / 233 tests;
- Native scaffold: 6 suites / 30 tests;
- P0-02A: 4 suites / 13 tests;
- P0-02B: 11 suites / 252 tests;
- the remaining formal roots: 47 suites / 311 tests.

The last three relevant formal groups combine to the exact 57 suites / 354
tests formal baseline. Formal 57/354 plus QUALITY-GATE-V2 9/233 and P0-02B
11/252 combine to the exact accepted registry 77 suites / 839 tests, without
rerunning already-green groups. The shipped validator passed 17 accepted
manifests / 116 entries and retained the one rejected historical manifest.

Global TypeScript passed with zero diagnostics after the final test edit. Both
CJS and MJS companion fixtures passed direct Node syntax checks. The code-only
scan found zero hits across 18 forbidden families (focus/skip/todo, fake or
real timers, shell execution, exec APIs, network, install/build, suppression,
ambient-environment mutation, and machine/runtime pinning). The cross-project
and author-path scan was also zero, and all temporary roots were removed.

Trust identities remained exact:

- production index:
  `0d6b5c7b512d97847b8c6c208fd4abe4ff4a1c1db1679296e18c73446929dbae`;
- accepted QUALITY-GATE-V2 self:
  `3436439e37e461dc5a1141f61613e67e9eb5566538585bc0a956e2256e44d664`;
- Native final, retained candidate, and registry identity:
  `12958a547ebb739bb0d4dafe7029e3dc6274f9bfef763994afd892b249bb23db`;
- accepted Review2 self:
  `1c6d556b011f1778b33938bbb6f91d35eaeed959b43bdfad0fd4c7e20a507937`.

Review2's 8 listed entries independently revalidated with zero format, missing,
or hash errors.

### Frozen identity and status

The final Review3 manifest has 9 entries in specification-first canonical POSIX
order, no self entry, complete 9/9 inventory coverage, and zero format, missing,
hash, or ordering errors. Its unique self SHA-256 is:

`80e449728730919df121e07733add05c112a288e7ee0896e5f2f36ce26a2e012`

The Review3 specification, tests, fixtures, local type declarations, helper,
and manifest are now frozen. This candidate is **PENDING INDEPENDENT REVIEW /
NOT ACCEPTED / NO PRODUCTION AUTHORITY**. The two consecutive trusted
`pnpm test` runs remain a deliberately post-repair acceptance gate and were not
recursively invoked from the expected-red Jest candidate.

## 2026-08-06 - independent review result

Review3 is **REVIEW FAILED / NEVER ACCEPTED / NO PRODUCTION AUTHORITY**. Its
locked self remains
`80e449728730919df121e07733add05c112a288e7ee0896e5f2f36ce26a2e012`
with all 9 listed bytes intact, but the independent reviewer found two material
coverage gaps:

1. The real-CLI success oracle did not record the shipped CLI process PID and
   compare it with the final pnpm JavaScript companion's `process.ppid`.
   Consequently, marker absence plus `process.execPath` did not independently
   prove that the CLI/current Node directly spawned the companion without an
   intermediate Node or command interpreter.
2. Reparse coverage was limited to a PATH directory junction. It did not cover
   the selected `pnpm.cjs`, `pnpm.mjs`, wrapper, selected Node executable, or
   native executable candidate being a direct file symlink/reparse to outside
   the trusted boundary; it also did not prove that an invalid high-priority
   CJS file cannot downgrade to a valid MJS file, or distinguish an ordinary
   hard link from a reparse point.

During review, the reviewer executed the shipped CLI in a way that wrote
`quality-reports/quality-gate-report.json` and
`quality-reports/quality-gate-summary.txt` at 08:42:40. Those canonical reports
are outside Review3's lock and are retained as observed external review output;
the test author did not edit, delete, or manually restore them.

Review4 must be a new self-contained lock that preserves every qualified
Review3 behavior while adding real-process PPID lineage and direct-file reparse
coverage. Review3's specification, 8 test-root files, and manifest remain
immutable rejected history.
