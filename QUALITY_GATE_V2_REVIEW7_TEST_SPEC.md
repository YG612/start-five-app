# Quality Gate V2 Review7 Test Specification

## Status and authority boundary

This is a new independent test-first generation. It changes no production
source, package script, accepted lock, registry entry, generated report, or
earlier review asset. Review4 remains frozen at candidate self SHA-256
`a3425a6fd3717cd76a35535ef9f078daf2bcf6a4bfd260e59ae45b6da659c05a`.

Review5 remains byte-exact at candidate self SHA-256
`51b7310aa27023946ca4419f5ed63acbeb81daa6c6c2d18a5ff335368cbcdecd`.
Review6 remains byte-exact at candidate self SHA-256
`06fef112b420faa514ceb13cf1131a1100f58d6796da40aab6835734ba4faec1`.
Both candidates were rejected by independent review and are therefore
**REVIEW FAILED / NEVER ACCEPTED / NO PRODUCTION AUTHORITY**. Review7
supersedes only their invalid or incomplete P1 oracles and edits no byte of
either candidate.

Review7 grants **NO PRODUCTION AUTHORITY** until a different fresh independent
reviewer accepts its complete candidate. The production precondition for the
first run is `scripts/quality-gate-v2/index.cjs` SHA-256
`45a6e9d3fd0aa742b8c4b14084114835088e71ebe04fbff5ae567978f84a3da2`.

## R7-001 - complete ancestor consistency on both trust branches

The launch trust surface contains two distinct branches and both are mandatory:

1. the selected JavaScript companion path; and
2. the current Node executable path used to launch that companion.

For each branch, a test-owned path contains at least five ordinary nested
directory levels between its trust root and final file. Independent cases
replace the first nested ancestor, a non-adjacent middle ancestor, and the
direct parent after initial validation and before launch.

For first-level and middle-level replacements, the fixture must save the final
file and direct-parent canonical identities before the change and prove again
immediately before launch that their `dev`, `ino`, and file-kind/mode identities
remain unchanged. The changed state must therefore reside above the direct
parent. Direct-parent replacement has its own independent case.

Every case uses the following architecture-neutral union oracle:

1. **Fail closed:** stable code-only
   `QUALITY_GATE_PNPM_LAUNCH_UNSAFE` before child, marker, report, recorder, or
   temporary-launch activity; or
2. **Bound execution:** success after executing exactly once only the baseline
   bytes/object identity validated for the relevant branch. The baseline
   marker and identity must be present; changed markers and changed identity
   must be absent.

The current-Node branch must observe the actual executable selected for the
child boundary, not merely repeat the companion oracle. No private production
symbols or hidden switches may be required.

A deliberately simplified local check that validates only the final file and
its direct parent is a mandatory negative control for each branch. It must:

- save the final-file and direct-parent canonical `dev`/`ino`/mode identities;
- replace a higher ancestor while preserving those two identities;
- re-check and prove those identities remain equal immediately before launch;
- run the changed payload exactly once; and
- be rejected by the same union predicate.

This establishes that final-plus-direct-parent validation is genuinely
insufficient and that the Review7 oracle detects the missing ancestor depth.
All synchronization is call-ordered; sleeps, timers, polling, races, and
wall-clock success oracles are forbidden.

## R7-002 - safe Windows path proof and validation-to-spawn binding

Mandatory safe controls cover all three public spellings:

- canonical drive-qualified backslash form (`C:\\...`);
- drive-qualified forward-slash form (`C:/...`); and
- a complete approved UNC server/share/file form (`\\\\server\\share\\...`).

Each control records an ordered validation trace. The trace must contain the
canonical target itself and the key ancestors from the applicable Windows root
through the target. Every trace item records canonical path, lossless `dev`,
lossless `ino`, and file-kind/mode identity; it is not enough to observe a
non-empty `lstat` call list.

At the one `shell: false` spawn boundary, the executable and, when applicable,
the companion argument are canonicalized and statted independently. Their
canonical path plus `dev`/`ino`/mode identity must match the corresponding
validated target exactly. Literal remaining argument compatibility must also
hold.

A deterministic misbinding negative control validates a different, unrelated
path/object and then attempts to launch the expected path/object. The binding
oracle must reject it even when both paths are individually ordinary and safe.
This proves validation events cannot be credited to the wrong spawn object.

The safe-path controls may use a test-owned virtual Windows filesystem and
spawn recorder. They must still exercise the public CLI and real production
control flow; they may not import a private production helper or assert merely
that some filesystem call occurred.

## R7-003 - public CLI rejection layering without overconstraint

An explicit empty `--pnpm` value is malformed CLI input. It must emit exact
code-only `QUALITY_GATE_CLI_USAGE` before untrusted filesystem access, child
creation, report output, recorder output, or temporary launch artifacts.

Quoted and leading/trailing-whitespace values are unsafe, but their public
ownership may legitimately be either the CLI grammar layer or launch-safety
layer. Each must therefore return exactly one of:

- code-only `QUALITY_GATE_CLI_USAGE`; or
- code-only `QUALITY_GATE_PNPM_LAUNCH_UNSAFE`.

If the result is `QUALITY_GATE_CLI_USAGE`, it must be pre-filesystem. If the
result is `QUALITY_GATE_PNPM_LAUNCH_UNSAFE`, only the filesystem inspection
needed to classify and reject that token is allowed. In both cases there must
be zero child, report, recorder, or temporary-launch activity. No additional
text, stack, path, or platform error may leak.

Root-relative, drive-relative, incomplete UNC, and Windows device-namespace
tokens remain exact code-only `QUALITY_GATE_PNPM_LAUNCH_UNSAFE` before child,
report, recorder, or temporary-launch activity.

## R7-004 - retained Review6 valid contracts

Review7 retains the valid portions of Review6 without inheriting its rejected
oracles:

- the validation-to-launch union rejects a changed launch and accepts only
  fail-closed or baseline-bound execution;
- `dev` and `ino` comparisons are lossless BigInt comparisons, including a
  pair above JavaScript's safe-integer range that collides after Number
  coercion;
- canonical drive, complete UNC, root-relative, drive-relative, incomplete
  UNC, and device-namespace classifications remain explicit;
- all failure results are stable code-only public failures.

## Frozen compatibility and first-run evidence

Review7 must independently prove:

1. Review5 remains the exact seven-entry self identity above and is recorded as
   **REVIEW FAILED / NEVER ACCEPTED**.
2. Review6 remains the exact eight-entry self identity above and is recorded as
   **REVIEW FAILED / NEVER ACCEPTED**.
3. Review4 remains 4 suites / 20 tests at its exact frozen candidate identity.
4. Review2 remains 16 tests at its exact accepted identity.
5. Accepted Quality Gate V2 remains 9 suites / 233 tests, Native Scaffold
   remains 6 suites / 30 tests, the formal baseline remains 57 suites / 354
   tests, GAP-P0-02A remains 4 suites / 13 tests, GAP-P0-02B remains 11 suites /
   252 tests, the accepted registry aggregate remains 77 suites / 839 tests,
   and global `tsc --noEmit` has zero diagnostics.

The initial isolated Review7 run against the production precondition must show
only legitimate production-dependent reds. Helper, negative-control,
syntax-layer, equal-identity, path-binding, and frozen-history tests must be
green. The D: canonical Node runtime and its C: alias must be proven to have
equal `dev`/`ino` identity. If a required fixture cannot execute, the result is
**UNEXECUTED**: no `skip`, conditional pass, or candidate signature is allowed.

The formal Quality Gate CLI must not be run during authoring, so the canonical
pair in `quality-reports/` is not overwritten.

## Determinism, safety, and lock rules

- Local test-owned fixtures only; no network, install, emulator, Gradle,
  CocoaPods, Xcode, or product-data mutation.
- No focused, skipped, pending, or snapshot tests; no timers, sleeps, polling,
  timing success oracle, TypeScript suppression, or explicit `any`.
- No parent-process environment mutation, shell launch, private production
  symbol, or unobservable production key.
- Cleanup is restricted to resolved Review7-owned temporary roots.
- Test assets contain no secrets or host-specific personal data.

After format, coverage, legitimate-red, regression, static-forbidden-pattern,
inventory, and runtime-alias checks pass, generate
`QUALITY_GATE_V2_REVIEW7_LOCK.sha256.candidate` last. Its canonical inventory
is this specification first, followed by every regular file under
`tests/quality-gate-v2-review7/` in POSIX order. It excludes itself and
`QUALITY_GATE_V2_REVIEW7_LOCK_CHANGELOG.md`. The final state is **PENDING
INDEPENDENT REVIEW / NOT ACCEPTED / NO PRODUCTION AUTHORITY**.
