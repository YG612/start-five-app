# QUALITY-GATE-V2 Review3 locked test specification

## 1. Purpose and status

This is a test-only post-acceptance review for the Windows process-launch path.
It does not authorize a production implementation and it does not replace any
accepted QUALITY-GATE-V2, Native, Phase4, or P0 contract.

The accepted production baseline was read before this candidate was authored:

- `scripts/quality-gate-v2/index.cjs` SHA-256 was
  `0d6b5c7b512d97847b8c6c208fd4abe4ff4a1c1db1679296e18c73446929dbae`;
- the abandoned, untested pnpm resolver was absent;
- Review2 passed 3 suites / 16 tests;
- QUALITY-GATE-V2 passed 9 suites / 233 tests; and
- global TypeScript completed with zero diagnostics.

The defect under review is narrow: on Windows, the logical default formal-test
executable is the bare name `pnpm`, while the accepted runner uses
`child_process.spawn(..., {shell: false})`. A PATH that exposes only
`pnpm.cmd` cannot be treated as a safely executable program. Enabling a shell
would make the command line injectable and is forbidden.

## 2. Immutable scope

The Review3 lock inventory is exactly:

1. this specification; and
2. every regular file below `tests/quality-gate-v2-review3`.

`QUALITY_GATE_V2_REVIEW3_LOCK_CHANGELOG.md` is excluded evidence. Once the
manifest has one final self SHA-256, the specification, tests, fixtures, helper,
and manifest are immutable. A production agent may not edit any Review3 file.

## 3. Technical-neutral launch contract

### 3.1 Logical plan versus actual process

The orchestration plan may continue to express the default package-manager
executable as the logical token `pnpm`. Before an actual Windows child is
started, the shipped path must convert that logical token into one of these
safe launch forms:

- a genuine, regular native executable launched directly; or
- the current trusted Node executable followed by one validated JavaScript
  pnpm entry file.

The actual child must always use `shell: false`. A `.cmd`, `.bat`, `.ps1`, or
other command-interpreter wrapper must never be executed, sourced, parsed as a
command line, or passed through `cmd.exe`/PowerShell. The tests place an active
`pnpm.cmd` lure in a directory containing spaces and `&`; execution of the lure
leaves a marker and fails the contract.

The pnpm arguments, working directory, and allowlisted environment must remain
byte-for-byte logical equivalents at the companion entry. Spaces, `&`, quotes,
and empty argv values remain single argv elements. No ambient secret may be
forwarded. Request objects must not be mutated.

### 3.2 Companion priority and trust boundary

For one canonical physical tool identity, a regular `pnpm.cjs` is preferred to
`pnpm.mjs`; `pnpm.mjs` is the fallback only when no `pnpm.cjs` candidate exists.
An invalid higher-priority candidate is a fail-closed condition, not permission
to downgrade. Current bundled layouts whose safe entry is below the trusted
Node/pnpm installation rather than beside `pnpm.cmd` remain valid when the same
physical trust boundary is proven.

Every selected executable and every selected companion must be a regular file.
The candidate itself and every existing ancestor between its allowed root and
the file must be free of symbolic-link, junction, or other reparse identity.
Traversal outside the allowed tool/runtime root is forbidden. The implementation
must not learn a launch target by executing or command-parsing the lure wrapper.

PATH matching is Windows-case-insensitive. More than one distinct eligible
tool identity is ambiguous. Repeating one identity, including a spelling that
differs only by case, is also rejected rather than silently changing precedence.
Within the one accepted identity, the `.cjs` then `.mjs` priority above is the
only permitted tie-break.

Unsafe/missing/non-regular/reparse/traversal candidates reject with the stable
code `QUALITY_GATE_PNPM_LAUNCH_UNSAFE`. Duplicate or case-conflicting PATH
candidates reject with `QUALITY_GATE_PNPM_LAUNCH_AMBIGUOUS`. Rejection happens
before any child is created and leaves no lure marker, companion recorder, PID,
temporary report, summary, or partial file.

### 3.3 Compatibility controls

- A genuine regular `pnpm.exe` remains a direct, shell-free executable and its
  argv is not rewritten.
- An explicit `--pnpm` value remains exact in CLI parsing and orchestration; it
  is not mistaken for the default bare token.
- Non-Windows CLI behavior remains the accepted stable
  `QUALITY_GATE_PLATFORM_UNSUPPORTED` preflight with zero stage process calls.
- Generic explicit executables continue to use the existing process-runner
  semantics.

These controls prevent a repair from becoming a machine-specific resolver or a
global rewrite of arbitrary commands.

## 4. Fixtures and independence

The suite is completely self-contained. Temporary project/tool directories are
created below the operating-system test temp root and removed after every test.
It never assigns to, deletes from, or permanently alters `process.env`.

The CJS and MJS companions record the received argv, cwd, selected Node
executable, PID, every runner-allowlisted value, the Windows PATH-key spelling,
and an explicit forbidden-secret sentinel. Standard process-identity variables
that Windows or the host may synthesize independently are outside the runner's
forwarding contract and are not mistaken for application forwarding. The
fixtures use only Node built-ins. The `.cmd` lure writes a marker if a shell or
wrapper ever executes it. Failure tests compare a content-hashed tree snapshot
before and after the call, so an unobserved temporary/report side effect also
fails. One real-CLI failure control proves that this zero-report boundary is not
limited to a direct runner call.

One read-only integration control dynamically discovers the current compatible
bundled layout from PATH and structural relationships. It contains no author
username, cache root, drive, bundled absolute path, or version. It never writes
to the runtime. Its launch assertion runs only `pnpm --version`; it performs no
network request, install, build, or package mutation.

No test uses a shell, network, timer, fake timer, install, build, focused/skipped
test, conditional suppression, or platform skip.

## 5. Candidate expectation

Before repair, the isolated candidate must contain a meaningful mixture:

- legitimate expected reds proving the unsafe Windows default is unresolved;
- independent greens proving fixtures, native executable behavior, explicit
  override preservation, non-Windows preservation, and bundled discovery; and
- zero snapshots, timeout warnings, fixture errors, or open-handle warnings.

A production repair is eligible for independent review only when every Review3
test is green without editing this lock and all accepted regressions remain
green.

## 6. Required post-repair acceptance

The production/review handoff must record all of the following:

1. isolated Review3 green twice in fresh processes;
2. Review2 3 suites / 16 tests green;
3. QUALITY-GATE-V2 9 suites / 233 tests green;
4. Native 6 suites / 30 tests green;
5. formal 57 suites / 354 tests green;
6. P0-02A 4 suites / 13 tests and P0-02B 11 suites / 252 tests green;
7. registry 77 suites / 839 tests green;
8. global TypeScript zero diagnostics;
9. accepted-lock validation green, with QUALITY-GATE-V2 self
   `3436439e37e461dc5a1141f61613e67e9eb5566538585bc0a956e2256e44d664`,
   Native final/candidate identity
   `12958a547ebb739bb0d4dafe7029e3dc6274f9bfef763994afd892b249bb23db`,
   and Review2 self
   `1c6d556b011f1778b33938bbb6f91d35eaeed959b43bdfad0fd4c7e20a507937`;
10. the trusted repository command `pnpm test` succeeds twice consecutively,
    using the dynamically discovered current bundled layout and without an
    explicit `--pnpm` workaround.

The two recursive top-level `pnpm test` acceptances are deliberately an external
post-repair gate, not a test that recursively invokes itself from Jest.

## 7. Review decision

A fresh reviewer with no Review3 authorship or production role must recompute
the manifest self, inspect every fixture and oracle, reproduce the red/green
split, and decide PASS or FAIL. Only a PASS may release the locked suite to a
production repair agent.
