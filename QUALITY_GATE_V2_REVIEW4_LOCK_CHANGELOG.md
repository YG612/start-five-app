# QUALITY-GATE-V2 Windows pnpm launch Review4 lock changelog

This audit file is intentionally excluded from
`QUALITY_GATE_V2_REVIEW4_LOCK.sha256.candidate`.

## 2026-08-06 - independent test-author candidate

Review4 was authored as a new test-only generation after Review3 was recorded
as **REVIEW FAILED / NEVER ACCEPTED / NO PRODUCTION AUTHORITY**. Review3 remains
byte-identical at self SHA-256
`80e449728730919df121e07733add05c112a288e7ee0896e5f2f36ce26a2e012`
with all 9 listed assets intact. Review4 never imports or executes that failed
root as authority; it independently preserves the qualified behavior.

The production precondition remained exact throughout authoring:

- `scripts/quality-gate-v2/index.cjs`:
  `0d6b5c7b512d97847b8c6c208fd4abe4ff4a1c1db1679296e18c73446929dbae`;
- accepted QUALITY-GATE-V2 self:
  `3436439e37e461dc5a1141f61613e67e9eb5566538585bc0a956e2256e44d664`;
- accepted Native Scaffold self:
  `12958a547ebb739bb0d4dafe7029e3dc6274f9bfef763994afd892b249bb23db`;
- acceptance registry:
  `d1ca79bae09382942056b233aadf754ca4cf27c98c5ff2841481e6207641f075`;
- `package.json`:
  `db3e71219f55e03a27c3af8ed81d34478fa03d662441b4d588793720ceb6ac35`;
- `pnpm-lock.yaml`:
  `da6a507aee8cc62f16e221c9391faab29b2d5793e75ccf743a47c59ecd2d8d2f`.

No production file, package script, accepted lock, registry entry, or Review3
asset was changed.

### Locked evidence

The direct-lineage contract launches the shipped CLI as a real child of Jest,
captures its PID at runtime, and requires the final JavaScript companion's
direct parent PID to equal it. CJS and MJS companions append complete JSONL
records instead of overwriting evidence. The positive oracle locks exactly one
record, unique PID/PPID/argv identities, exact argv/cwd/runtime/Node identity,
and the complete deterministic shipped-CLI stdout. A fake A-to-B-to-C process
chain is an independent green negative control for the same parent oracle.

The fail-closed matrix covers direct-file reparses for the command wrapper,
`pnpm.cjs`, `pnpm.mjs`, selected Node executable, and explicit executable. It
also covers unsafe high-priority CJS followed by valid MJS, an ordinary regular
hard link control, and the retained PATH-directory junction rejection. Unsafe
real-CLI cases opt in to a test-owned preload guard. A READY marker proves the
guard loaded; all seven ordinary Node child APIs are blocked, and any attempted
child writes only a constant marker before throwing. Every safe preflight
requires that attempt marker, companion record, wrapper marker, report tree,
and temporary report evidence remain absent. No uncontrolled alias is launched.

Unsafe and ambiguous CLI diagnostics are exact code-only strings, not partial
matches. The tests explicitly exclude the runtime temporary root, its parent,
the runtime CLI PID, and PID/PPID labels. The explicit executable boundary also
requires exact error `code` and `message` with a zero-call spawn mock.

### Pre-sign audit and candidate execution

A separate read-only pre-sign audit initially found three P1 coverage gaps:
zero-child evidence, overwriteable exactly-once evidence, and partial diagnostic
matching. Signing was stopped. Those gaps were closed before lock generation.
A final read-only post-fix audit reported **CLEAR TO SIGN**, 12 assets, no
remaining P0/P1 blocker, and no file edits.

The final isolated candidate run was 4 suites / 20 tests: exactly **13
legitimate expected reds and 7 independent greens** in 5.099 seconds, with zero
snapshots and no fixture, permission, cleanup, timeout, watchdog, or open-handle
warning. The 13 reds are the positive direct-lineage case, seven reparse or
junction enforcement cases, and five preserved resolver behaviors. They fail
only because the frozen production still performs the bare-pnpm launch and
lacks the required safe resolver plus exact UNSAFE/AMBIGUOUS preflight boundary.
READY guard checks execute before the unsafe classification assertions. The
seven greens cover the A-to-B-to-C oracle, ordinary hard link boundary, explicit
argument parsing, generic shell-free execution, non-Windows preflight, and two
independent Review3 history/identity checks.

### Regression and trust evidence

All required final regressions passed:

- formal 15-root baseline: 57 suites / 354 tests;
- accepted QUALITY-GATE-V2: 9 suites / 233 tests;
- Native Scaffold: 6 suites / 30 tests;
- GAP-P0-02A: 4 suites / 13 tests;
- GAP-P0-02B: 11 suites / 252 tests;
- accepted registry aggregate: 77 suites / 839 tests;
- global `tsc --noEmit`: zero diagnostics;
- five CJS/MJS fixture syntax checks: all passed.

The shipped manifest validator independently revalidated all 17 accepted locks
and 116 listed entries with zero self, format, inventory, ordering, missing, or
entry-hash errors. The final Review4 scan covered 12 assets and 13 forbidden
families with zero hits: focus/skip/todo, TypeScript suppressions or explicit
`any`, timers/waits, snapshots, network, install/build commands, `shell: true`,
machine paths, literal PID values, parent-environment mutation, direct alias
launch, and loose companion-stdout matching.

The formal Quality Gate CLI was deliberately not run during Review4 authoring.
The canonical report files remain the prior external Review3 review output:

- `quality-reports/quality-gate-report.json`:
  `f89ef0ce96c777991180892fda033239ce677b2229bc93d0c5f132e31b08425a`;
- `quality-reports/quality-gate-summary.txt`:
  `250c25bc006f102d9c2ffe508a209f81ad38a8432a02d3c99fff31e6d9229e15`.

Both retained their original 08:42:40 review timestamps.

### Frozen candidate identity and status

The Review4 candidate has 12 entries in specification-first canonical POSIX
order. It covers the specification plus all 11 regular files under
`tests/quality-gate-v2-review4/`, excludes itself and this changelog, and has no
unlisted or missing asset. Its unique self SHA-256 is:

`a3425a6fd3717cd76a35535ef9f078daf2bcf6a4bfd260e59ae45b6da659c05a`

The specification, tests, fixtures, local type declaration, helper, and
candidate manifest are now frozen. This candidate is **PENDING FRESH
INDEPENDENT REVIEW / NOT ACCEPTED / NO PRODUCTION AUTHORITY**. It is not added
to the acceptance registry and grants no repair or delivery authority.
