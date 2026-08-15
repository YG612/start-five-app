# QUALITY-GATE-V2 Review5 candidate changelog

This audit file is intentionally excluded from
`QUALITY_GATE_V2_REVIEW5_LOCK.sha256.candidate`.

## 2026-08-08 - independent test-author candidate

Review5 is a new test-first generation for the static-review findings that
remained after the independently qualified Review4 repair. Review4 remains
byte-exact at self SHA-256
`a3425a6fd3717cd76a35535ef9f078daf2bcf6a4bfd260e59ae45b6da659c05a`
with all 12 listed assets intact. Review2 remains byte-exact at self SHA-256
`1c6d556b011f1778b33938bbb6f91d35eaeed959b43bdfad0fd4c7e20a507937`.

The production precondition remained exact throughout authoring:

- `scripts/quality-gate-v2/index.cjs`:
  `45a6e9d3fd0aa742b8c4b14084114835088e71ebe04fbff5ae567978f84a3da2`;
- accepted QUALITY-GATE-V2 self:
  `3436439e37e461dc5a1141f61613e67e9eb5566538585bc0a956e2256e44d664`;
- accepted Native Scaffold self:
  `12958a547ebb739bb0d4dafe7029e3dc6274f9bfef763994afd892b249bb23db`;
- acceptance registry:
  `d1ca79bae09382942056b233aadf754ca4cf27c98c5ff2841481e6207641f075`;
- `package.json`:
  `db3e71219f55e03a27c3af8ed81d34478fa03d662441b4d588793720ceb6ac35`.

No production file, package script, accepted lock, registry entry, generated
report, Review2 asset, or Review4 asset was changed.

### Test design and first-run evidence

The Windows syntax matrix uses only the public `runCliProcess` surface with a
real synthetic bootstrap and the actual configured-pnpm preflight. It does not
access the private preflight symbol. The matrix covers empty, quoted,
drive-relative, both root-relative separator spellings, incomplete UNC,
extended/device namespace, whitespace, and non-canonical separator inputs.
Canonical drive-qualified and complete UNC paths are positive controls that
reach the mocked `shell: false` spawn boundary exactly once. The cross-drive
case independently proves the same root-relative spelling resolves to
different C-drive validation and D-drive launch objects.

The TOCTOU tests replace either the companion bytes or its containing ancestor
inside the observed production `spawn` boundary, then delegate to the real
Node spawn. Safe and hostile payloads have distinct locked identities and
exclusive markers. Current production executes the hostile bytes in both
cases. A deliberately vulnerable local check-then-spawn negative control
proves the oracle detects the replacement without wall-clock timing.

The current-Node test injects a reparse ancestor below the root and requires
the equal-spelling `process.execPath` selection to traverse it. The BigInt test
uses two identities above the safe-integer range that are unequal as BigInt but
equal after Number coercion, plus an unchanged-identity control.

The final isolated Review5 run was 4 suites / 25 tests: exactly **9 legitimate
expected reds and 16 independent greens** in 5.084 seconds, with zero snapshots
and no open-handle warning. The nine reds are five public-CLI path cases,
current-Node ancestor validation, the high-bit identity collision, companion
replacement, and ancestor replacement. All hostile controls and frozen
identity checks are green.

### Regression and environment evidence

All required regressions passed using the canonical real path of the bundled
Node runtime:

- Review4: 4 suites / 20 tests;
- Review2: 3 suites / 16 tests;
- accepted QUALITY-GATE-V2: 9 suites / 233 tests;
- Native Scaffold: 6 suites / 30 tests;
- formal 15-root baseline: 57 suites / 354 tests;
- GAP-P0-02A: 4 suites / 13 tests;
- GAP-P0-02B: 11 suites / 252 tests;
- accepted registry aggregate: 77 suites / 839 tests;
- global `tsc --noEmit`: zero diagnostics.

The canonical runtime is the exact same file identity as the configured
`C:\Users\25328\.cache\codex-runtimes` alias. The alias itself contains a
reparse ancestor, so security preflight correctly rejects child launches that
are deliberately run through that alias. Read-only `lstat`/`realpath`
inspection proved the canonical and alias `node.exe` have equal device/inode;
the regression rerun through the canonical path then passed 16/16. This is an
environment-path distinction, not a production or frozen-test change.

The formal Quality Gate CLI was not run. Canonical report identities remain:

- `quality-reports/quality-gate-report.json`:
  `f89ef0ce96c777991180892fda033239ce677b2229bc93d0c5f132e31b08425a`;
- `quality-reports/quality-gate-summary.txt`:
  `250c25bc006f102d9c2ffe508a209f81ad38a8432a02d3c99fff31e6d9229e15`.

Nine forbidden-pattern families over the six Review5 test assets produced
zero hits: focus/skip/todo, TypeScript suppressions, explicit `any`, timers or
sleeps, network APIs, install commands, `shell: true`, and snapshots. All
fixtures are local, explicitly synchronized, and cleaned only under their own
resolved temporary roots.

### Candidate status

The candidate contains seven entries in specification-first canonical POSIX
order: this specification and all six regular files under
`tests/quality-gate-v2-review5/`. It excludes itself and this changelog. Its
unique self SHA-256 is
`51b7310aa27023946ca4419f5ed63acbeb81daa6c6c2d18a5ff335368cbcdecd`.
The manifest revalidation reported 7/7 files present, 7/7 entry hashes exact,
canonical ordering, exact inventory equality, and no self entry.

Its
state is **PENDING INDEPENDENT REVIEW / NOT ACCEPTED / NO PRODUCTION
AUTHORITY**. The candidate is not added to the acceptance registry.
