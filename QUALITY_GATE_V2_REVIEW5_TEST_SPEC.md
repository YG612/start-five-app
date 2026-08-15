# Quality Gate V2 Review5 Test Specification

## Status and authority boundary

This is a new, independent, test-first review generation. It changes no
production source, package script, accepted lock, registry entry, generated
report, or earlier review asset. The independently qualified Review4 candidate
is frozen at self SHA-256
`a3425a6fd3717cd76a35535ef9f078daf2bcf6a4bfd260e59ae45b6da659c05a`.
Review5 grants **NO PRODUCTION AUTHORITY** until a fresh independent reviewer
accepts its complete candidate.

The production precondition for the first run is
`scripts/quality-gate-v2/index.cjs` SHA-256
`45a6e9d3fd0aa742b8c4b14084114835088e71ebe04fbff5ae567978f84a3da2`.

## Confirmed defects

### R5-001 - canonical Windows launch path classification

`path.win32.isAbsolute()` is not sufficient proof of a drive-qualified or
complete UNC path. In particular, a root-relative token such as
`\qg\bin\pnpm.exe` can be validated against one current drive but later be
interpreted by a child launch relative to a different drive selected by the
child `cwd`. Validation and execution can therefore name different objects.

Before filesystem access, child creation, recorder output, or report output,
the resolver must reject with exact code-only
`QUALITY_GATE_PNPM_LAUNCH_UNSAFE` every empty, quoted, root-relative,
drive-relative, incomplete UNC, device-namespace, malformed-separator, or
otherwise non-canonical Windows path token. A canonical drive-qualified path
and a complete ordinary UNC server/share/file path are mandatory accepted
counterexamples when all filesystem trust checks succeed. A cross-drive
fixture must prove that validation-base resolution and launch-`cwd` resolution
of a root-relative spelling diverge, and that the shipped runner rejects that
spelling without reaching `spawn`.

### R5-002 - validation-to-launch identity binding

Repeated `lstat`/`realpath` checks followed by a pathname-based `spawn` do not
bind the validated object to the object actually executed. Review5 inserts a
deterministic, test-owned replacement exactly at the observable child-spawn
boundary. It replaces a validated JavaScript companion, or an ancestor that
contains it, with different ordinary bytes/identity. The contract requires
fail-closed rejection or execution of only the already-bound validated bytes;
the replacement payload must never execute. A negative control deliberately
implements check-then-spawn-by-path and proves that the same oracle detects the
replacement. Merely adding another pathname `lstat` is not sufficient.

The tests use explicit synchronous boundary hooks and process completion. They
do not use wall-clock timing, sleeps, races, polling, network access, or hidden
production keys.

### R5-003 - current Node ancestry and lossless file identities

Selecting the current `process.execPath` does not waive full ancestry
validation. Every component from its Windows root through the executable must
be checked as an ordinary non-reparse object even when the selected spelling
equals the current Node spelling.

All device and inode comparisons must be obtained losslessly. Review5 supplies
an identity pair whose `dev`/`ino` values differ above JavaScript's safe-integer
range but collide after Number coercion. The resolver must request and compare
BigInt identities and reject before child creation. A normal equal-BigInt
identity is the accepted counterexample.

## Required test evidence

1. Exact code-only unsafe diagnostics, zero child calls, and zero recorder or
   report artifacts for every rejected path and identity case.
2. Strong drive-qualified and complete-UNC accepted controls that reach the
   mocked `shell: false` spawn boundary exactly once.
3. Deterministic companion-byte and ancestor-identity replacement cases at the
   actual spawn boundary, with a safe-payload marker, hostile-payload marker,
   and a deliberately vulnerable negative control.
4. Full current-Node ancestry observation, including the equal-spelling case.
5. BigInt high-bit collision rejection and an equal-BigInt control.
6. Review4 remains 4 suites / 20 tests and Review2 remains 4 suites / 16 tests;
   both frozen manifests retain their exact self identities. The accepted
   Quality Gate V2, Native Scaffold, formal baseline, GAP-P0-02A,
   GAP-P0-02B, registry aggregate, and global TypeScript regressions remain
   green at the manager-provided baselines.

## Determinism and safety constraints

- Local test-owned fixtures only; no network, install, emulator, Gradle,
  CocoaPods, Xcode, or product-data mutation.
- No `skip`, `todo`, `only`, pending tests, snapshots, timer sleeps, timing
  success oracles, TypeScript suppressions, explicit `any`, or parent-process
  environment mutation.
- No direct production import of private symbols and no private/unobservable
  production switch. Public `createNodeProcessRunner` behavior and the real
  Node child boundary are the authority.
- Test doubles include hostile negative controls so an oracle cannot pass from
  a missing fixture, an unused hook, or an unconditional throw.
- Cleanup removes only resolved test-owned temporary roots.

## First-run and candidate rules

The first isolated Review5 run must show legitimate production-dependent reds
for the defects above while all helper, hostile-oracle, syntax-control,
identity-control, and frozen-history checks are green. If execution is refused
by the platform, the status is **UNEXECUTED** and no candidate lock is signed.

After format, coverage, red legitimacy, regression, static-forbidden-pattern,
and inventory checks are complete, generate
`QUALITY_GATE_V2_REVIEW5_LOCK.sha256.candidate` last. Its canonical inventory
is this specification first, followed by every regular file under
`tests/quality-gate-v2-review5/` in POSIX order. It excludes itself and
`QUALITY_GATE_V2_REVIEW5_LOCK_CHANGELOG.md`. The final state is **PENDING
INDEPENDENT REVIEW / NOT ACCEPTED / NO PRODUCTION AUTHORITY**.
