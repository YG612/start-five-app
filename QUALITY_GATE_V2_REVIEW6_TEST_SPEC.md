# Quality Gate V2 Review6 Test Specification

## Status and authority boundary

This is a new independent test-first generation. It changes no production
source, package script, accepted lock, registry entry, generated report, or
earlier review asset. Review4 remains frozen at candidate self SHA-256
`a3425a6fd3717cd76a35535ef9f078daf2bcf6a4bfd260e59ae45b6da659c05a`.

Review5 remains byte-exact at candidate self SHA-256
`51b7310aa27023946ca4419f5ed63acbeb81daa6c6c2d18a5ff335368cbcdecd`
with seven manifest entries. Independent review rejected that candidate. It
is therefore **REVIEW FAILED / NEVER ACCEPTED / NO PRODUCTION AUTHORITY**.
Review6 supersedes its three invalid or incomplete P1 oracles without editing
any Review5 byte.

Review6 grants **NO PRODUCTION AUTHORITY** until a different fresh independent
reviewer accepts its complete candidate. The production precondition for the
first run is `scripts/quality-gate-v2/index.cjs` SHA-256
`45a6e9d3fd0aa742b8c4b14084114835088e71ebe04fbff5ae567978f84a3da2`.

## R6-001 - validation-to-launch binding with a union oracle

A compliant resolver may close the validation-to-launch gap by either of two
architectures. The tests must accept exactly this union:

1. **Fail closed:** a stable code-only `QUALITY_GATE_PNPM_LAUNCH_UNSAFE`
   rejection occurs before any child, baseline marker, changed-file marker, report,
   recorder, or temporary launch artifact exists; or
2. **Bound execution:** the process succeeds after executing exactly once the
   baseline bytes or file identity that was validated. The baseline payload
   identity, stdout, and single marker prove the binding; the changed-file
   marker and changed identity remain absent.

The oracle must not require a private symbol, a hidden production switch, an
implementation-specific file-descriptor design, or any particular architecture.
A deliberately simplified local check-then-launch-by-path control must execute
the changed replacement file and be rejected by the same union predicate. This
negative control proves that the union does not turn an inconsistent launch into an
accepted fail-closed result.

The replacement is deterministic and occurs at a public observable child
boundary. It covers direct companion-byte replacement and containing-ancestor
replacement. Synchronization is call-ordered, not time-based: no sleeps,
polling, races, or wall-clock success oracle.

## R6-002 - multi-level local path consistency

A test-owned local path contains four nested ordinary directory levels before
the selected JavaScript file. Independent cases change each of these positions
after the initial inspection and before process launch:

- the first nested level;
- a non-adjacent middle level; and
- the direct parent of the selected file.

Each case uses the R6-001 union oracle: the program must either return stable
code-only `QUALITY_GATE_PNPM_LAUNCH_UNSAFE` before child or marker activity, or
execute exactly once only the baseline file confirmed during inspection. A
fully unchanged ordinary chain is a strong green control that reaches one
shell-free child boundary and writes one baseline marker.

A deliberately simplified local example that inspects only the selected file
and its direct parent misses a first-level state change and runs the changed
file. The Review6 union oracle must reject that result, proving the four-level
matrix distinguishes incomplete checking.

## R6-003 - public CLI grammar before launch safety

Error ownership follows the public CLI layers:

- an explicit empty `--pnpm` value is malformed CLI input and must emit exact
  code-only `QUALITY_GATE_CLI_USAGE` before untrusted filesystem access, child
  creation, report output, recorder output, or launch temporary artifacts;
- root-relative, drive-relative, incomplete UNC, and Windows device-namespace
  tokens are syntactically present but launch-unsafe and must emit exact
  code-only `QUALITY_GATE_PNPM_LAUNCH_UNSAFE` before the same side effects;
- quoted or leading/trailing-whitespace values are rejected at the public CLI
  parser with exact code-only `QUALITY_GATE_CLI_USAGE` and must never cross
  into filesystem or child launch;
- canonical drive-qualified paths using either `\` or `/`, and a complete
  approved UNC server/share/file path, are mandatory safe controls.

Every safe control must prove that the string validated and the fully qualified
object passed to `spawn` denote the same Windows path. It must reach exactly
one `shell: false` boundary with literal argument compatibility. A forward-slash
drive spelling may be normalized once to its canonical fully qualified launch
spelling; it must not be rejected merely for using `/`.

## R6-004 - lossless filesystem identities

All device and inode comparisons used for launch trust must be lossless. Tests
supply two `dev`/`ino` pairs above JavaScript's safe-integer range that differ
as BigInt but collide after Number coercion. The changed pair must fail closed
before child creation. An unchanged equal-BigInt identity is the mandatory
accepted control. The test observes only public behavior and ordinary `fs`
calls; it does not import a private comparison helper.

## Frozen compatibility and first-run evidence

Review6 must independently prove:

1. Review5 remains the exact seven-entry self identity above and is recorded as
   **REVIEW FAILED / NEVER ACCEPTED** in both the Review6 identity test and
   Review6 changelog.
2. Review4 remains 4 suites / 20 tests at its exact frozen candidate identity.
3. Review2 remains 16 tests at its exact accepted identity.
4. Accepted Quality Gate V2 remains 9 suites / 233 tests, Native Scaffold
   remains 6 suites / 30 tests, the formal baseline remains 57 suites / 354
   tests, GAP-P0-02A remains 4 suites / 13 tests, GAP-P0-02B remains 11 suites /
   252 tests, the accepted registry aggregate remains 77 suites / 839 tests,
   and global `tsc --noEmit` has zero diagnostics.

The initial isolated Review6 run against the production precondition must show
only legitimate production-dependent reds for the contracts above. Helper,
negative-control, syntax-control, equal-identity-control, and frozen-history
tests must be green. If the platform cannot execute a required fixture, the
result is **UNEXECUTED**; no `skip`, conditional pass, or candidate signature
is permitted.

The formal Quality Gate CLI must not be run during authoring, so the canonical
pair in `quality-reports/` is not overwritten.

## Determinism, safety, and lock rules

- Local test-owned fixtures only; no network, install, emulator, Gradle,
  CocoaPods, Xcode, or product-data mutation.
- No focused, skipped, pending, or snapshot tests; no timers, sleeps, polling,
  timing success oracle, TypeScript suppression, or explicit `any`.
- No parent-process environment mutation, shell launch, private production
  symbol, or unobservable production key.
- Cleanup is restricted to resolved Review6-owned temporary roots.
- Test assets must contain no secrets or host-specific personal data.

After format, coverage, red legitimacy, regression, static-forbidden-pattern,
and inventory checks pass, generate
`QUALITY_GATE_V2_REVIEW6_LOCK.sha256.candidate` last. Its canonical inventory
is this specification first, followed by every regular file under
`tests/quality-gate-v2-review6/` in POSIX order. It excludes itself and
`QUALITY_GATE_V2_REVIEW6_LOCK_CHANGELOG.md`. The final state is **PENDING
INDEPENDENT REVIEW / NOT ACCEPTED / NO PRODUCTION AUTHORITY**.
