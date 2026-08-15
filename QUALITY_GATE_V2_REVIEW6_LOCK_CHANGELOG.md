# QUALITY-GATE-V2 Review6 candidate changelog

This audit file is intentionally excluded from
`QUALITY_GATE_V2_REVIEW6_LOCK.sha256.candidate`.

## 2026-08-08 - independent test-author generation

Review6 is a new test-first correction generation. It changes no production
source, package script, accepted lock, registry entry, generated report, or
earlier review asset.

Review5 remains byte-exact at candidate self SHA-256
`51b7310aa27023946ca4419f5ed63acbeb81daa6c6c2d18a5ff335368cbcdecd`
with seven entries. Its independent review result is **REVIEW FAILED / NEVER ACCEPTED**
and it has **NO PRODUCTION AUTHORITY**. Review6 does not edit or reuse its
candidate authority.

Review4 remains byte-exact at candidate self SHA-256
`a3425a6fd3717cd76a35535ef9f078daf2bcf6a4bfd260e59ae45b6da659c05a`.
Review2 remains byte-exact at accepted self SHA-256
`1c6d556b011f1778b33938bbb6f91d35eaeed959b43bdfad0fd4c7e20a507937`.

### Design record

The validation-to-launch tests use a two-result union oracle. They accept only
a stable code-only pre-launch rejection with zero child/marker/report/recorder/
temporary output, or one successful execution of the exact baseline file
confirmed during inspection with no changed-file marker. A simplified
check-then-launch-by-path example executes the changed fixture and is rejected
by the same oracle.

The local path-consistency matrix uses four nested ordinary test-owned
directories. Independent cases change the first level, a middle level, and the
direct parent after inspection and before launch. A fully unchanged chain is
the positive control. A direct-parent-only simplified example proves why the
entire chain must be considered.

The public CLI matrix assigns empty, quoted, and whitespace-only formatting
errors to `QUALITY_GATE_CLI_USAGE`; separates syntactically present but invalid
Windows path forms into `QUALITY_GATE_PNPM_LAUNCH_UNSAFE`; and requires
backslash drive-qualified, forward-slash drive-qualified, and complete approved
UNC controls to validate and launch the same fully qualified object.

The lossless-identity matrix uses BigInt values above the safe-integer range,
including a changed pair that collides only after Number conversion and an
unchanged equal-identity control.

### Evidence and candidate status

The final isolated Review6 run used the canonical, non-reparse Node runtime
identity at
`D:\CodexData\Caches\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`.
It completed as 5 suites / 29 tests with exactly **12 legitimate expected reds
and 17 independent greens**, zero snapshots, and no open-handle warning:

- validation-to-launch union: 2 expected production reds and 1 distinguishing
  simplified-example green;
- four-level local path matrix: 3 expected production reds and 2 controls green;
- public CLI layering/path matrix: 6 expected production reds and 7 controls
  green;
- BigInt identity matrix: 1 expected production red and 2 controls green; and
- frozen identity/history: 5/5 green.

The expected reds are limited to the new production-dependent contracts. Every
fixture, state-change trigger, simplified-example discriminator, strong path
control, equal-identity control, and frozen-history check is green. The
state-change cases prove the requested local directory change actually occurred
before evaluating the union oracle.

All required regressions passed through the same canonical runtime:

- Review4: 4 suites / 20 tests;
- Review2: 3 suites / 16 tests;
- accepted QUALITY-GATE-V2: 9 suites / 233 tests;
- Native Scaffold: 6 suites / 30 tests;
- GAP-P0-02A: 4 suites / 13 tests;
- GAP-P0-02B: 11 suites / 252 tests;
- formal 15-root baseline: 57 suites / 354 tests;
- accepted registry 17-root aggregate: 77 suites / 839 tests; and
- global `tsc --noEmit`: zero diagnostics.

An initial read-only regression invocation used the configured
`C:\Users\25328\.cache\codex-runtimes` alias. Real-process checks correctly
rejected that spelling because an ancestor is a reparse identity. Native
`realpath` proved the alias resolves to the canonical D: runtime above. The
complete canonical rerun then passed every required baseline. This was an
environment spelling correction only; no production or frozen file changed.

Ten static forbidden-pattern families over all seven Review6 test assets have
zero hits: focused/skipped/pending tests, TypeScript suppressions, explicit
`any`, timer/sleep APIs, network APIs, install/build commands, `shell: true`,
snapshots, parent-environment mutation, and private preflight access. There are
no leftover `start-five-qgv2-review6-*` temporary roots.

The production index remains SHA-256
`45a6e9d3fd0aa742b8c4b14084114835088e71ebe04fbff5ae567978f84a3da2`.
The acceptance registry and package identities remain
`d1ca79bae09382942056b233aadf754ca4cf27c98c5ff2841481e6207641f075`
and `db3e71219f55e03a27c3af8ed81d34478fa03d662441b4d588793720ceb6ac35`.
The canonical generated report pair remains byte-exact at
`f89ef0ce96c777991180892fda033239ce677b2229bc93d0c5f132e31b08425a`
and `250c25bc006f102d9c2ffe508a209f81ad38a8432a02d3c99fff31e6d9229e15`.
The formal Quality Gate CLI was not run.

The candidate inventory is exactly eight entries: this specification first,
then all seven regular assets under `tests/quality-gate-v2-review6/` in
canonical POSIX order. Mechanical revalidation found 8/8 files present, 8/8
entry hashes exact, exact inventory equality, canonical ordering, no self entry,
8 LF / 0 CR / 1014 bytes. Its unique candidate self SHA-256 is
`06fef112b420faa514ceb13cf1131a1100f58d6796da40aab6835734ba4faec1`.

Review6 is now frozen **PENDING INDEPENDENT REVIEW / NOT ACCEPTED / NO
PRODUCTION AUTHORITY**. No Review6 specification, test, declaration, helper, or
candidate-manifest byte may change during implementation or review.
