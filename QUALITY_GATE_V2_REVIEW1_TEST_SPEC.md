# QUALITY-GATE-V2 post-acceptance Review1 test specification

## Status and authority

- Candidate scope: Windows environment-key canonicalization at the real
  QUALITY-GATE-V2 CLI/process-start boundary.
- Parent accepted baseline: `QUALITY_GATE_V2_LOCK.sha256`, self SHA-256
  `3436439e37e461dc5a1141f61613e67e9eb5566538585bc0a956e2256e44d664`,
  15 locked entries.
- This Review1 suite is test-only and is not part of the accepted registry.
- The final candidate remains **PENDING INDEPENDENT REVIEW**. It grants no
  production implementation authority until a brand-new reviewer confirms
  its behavior, expected-red legitimacy, regressions, inventory, and self
  identity.
- Once `QUALITY_GATE_V2_REVIEW1_LOCK.sha256` is signed, its specification and
  `tests/quality-gate-v2-review1/**` inventory are immutable. The excluded
  changelog may record review disposition without altering the candidate.

## Defect statement

On Windows, Node can enumerate the inherited executable-search environment
key as `Path`, while a spread copy (`{...process.env}`) is an ordinary,
case-sensitive JavaScript object. A CLI/runtime boundary that reads only
`environment.PATH` then derives an empty stage PATH. The real stage runner
uses `spawn(..., {shell: false})`; its trusted `pnpm`/Node executable cannot be
resolved and the gate fails before the formal stage with
`QUALITY_GATE_PROCESS_START_FAILED`.

The accepted V2 suite proves allowlisting and no-shell process execution, but
does not bind this Windows environment-key spelling behavior through a spread
CLI environment.

## Locked behavioral contract

### 1. Windows PATH identity

For a `win32` CLI invocation, all own environment keys whose spelling equals
`PATH` under ASCII case-insensitive comparison form one Windows PATH identity.

- Exactly one string-valued spelling, including `Path`, `pAtH`, or any other
  mixed-case spelling, supplies the stage executable-search value.
- The downstream stage environment exposes that identity as one canonical
  `PATH` entry with the byte-exact original value.
- Two or more spellings with byte-identical string values may be collapsed to
  that one canonical `PATH` entry.
- Conflicting string values reject deterministically with the stable code
  `QUALITY_GATE_ENV_PATH_CONFLICT`.
- Canonicalization operates on a copy. It must not mutate the caller's
  environment object or the ambient `process.env`.

This contract is implementation-neutral: normalization may live at any CLI,
runtime, or process-runner boundary, provided every observable below holds.

### 2. Conflict fail-closed boundary

A Windows PATH conflict is an entry-boundary configuration error, not a gate
stage failure. Before starting any stage child it must:

- reject the exported CLI operation with code
  `QUALITY_GATE_ENV_PATH_CONFLICT`;
- make a real CLI child exit 1 and expose that exact code on stderr;
- create no JSON report, human summary, recorder, ready marker, or stage PID;
- make no call to an injected process runner.

The zero-report requirement prevents ambiguous evidence that could otherwise
mislabel an invalid host environment as a formal-test result.

### 3. Non-Windows semantics

Case folding is Windows-specific. For a non-`win32` invocation, distinct
`PATH` and `Path` keys must not trigger
`QUALITY_GATE_ENV_PATH_CONFLICT`. The existing platform guard remains
authoritative and returns/reports `QUALITY_GATE_PLATFORM_UNSUPPORTED` before
any stage child. This suite does not expand product support beyond Windows.

### 4. Real process-start proof

The real-child fixture launches the shipped `cli.cjs` export in a fresh Node
process. It deliberately spreads the child's real environment before calling
`runCliProcess`, reproducing the plain-object boundary. Its path family is:

- only `Path` plus the trusted bootstrap self for the defect proof; or
- only canonical `PATH` for an independent positive control.

The formal-stage executable is the basename of the real Node executable, so
it can start only through the supplied PATH. A fixed local `exec` probe exits
immediately instead of running Jest, installing dependencies, building, or
using the network. The probe requires:

- the byte-exact canonical PATH;
- one case-insensitive PATH key in the stage child;
- preservation of the existing allowed `ComSpec`, `NODE_OPTIONS`, `PATHEXT`,
  `SystemRoot`, `TEMP`, and `TMP` values;
- authoritative CLI overrides for Android/JAVA/CI values;
- absence of the bootstrap secret and a forbidden ambient secret;
- exact argv/cwd evidence.

A frozen accepted test root contains the literal argument
`tests/no-shell&mkdir shell-evidence`. The probe must receive that exact single
argument, the lock-validation suffix must remain one exactly parseable JSON
document, and no `shell-evidence` directory may be created. This independently
proves that the real stage did not introduce a shell.

All fixture projects, reports, recorders, and markers live under tracked temp
directories and are removed in `afterEach`. Tests pass explicit child
environments and never assign to or delete from `process.env`.

## Test inventory and expected initial disposition

### `tests/quality-gate-v2-review1/pathEnvironment.contract.test.ts`

1. Three Windows unique-spelling cases (`Path`, `pAtH`, `PaTh`) require exact
   canonical stage PATH. Initially expected red.
2. Canonical `PATH` is an independent control and the frozen input object must
   remain unchanged. Initially expected green.
3. Two noncanonical spellings with the same value collapse to one PATH.
   Initially expected red.
4. Conflicting spellings reject with the stable code and zero reports/runner
   calls/markers. Initially expected red.
5. A non-Windows conflict preserves the existing unsupported-platform result,
   does not Windows-fold keys, and starts no stage. Initially expected green.

### `tests/quality-gate-v2-review1/realCliPathEnvironment.contract.test.ts`

1. A real spread-entry child with only `Path` reaches the fast stage probe,
   preserves the exact allowed environment, and emits no shell evidence.
   Initially expected red.
2. A real child with canonical `PATH` supplies an independent process-start
   control. Initially expected green.
3. A real child with identical `Path`/`PATH` values canonicalizes safely.
   Initially expected green.
4. A real child with conflicting values exits before reports, recorder, or PID
   evidence and emits `QUALITY_GATE_ENV_PATH_CONFLICT`. Initially expected
   red.

Expected initial total: **2 suites / 11 tests: 7 legitimate red + 4 independent
green controls**. Any timeout, fixture/permission failure, open-handle warning,
snapshot, skip/focus/todo, mock of the production module, TypeScript
suppression, unsafe cast, network/install/build action, or unrelated failure
invalidates the candidate.

## Candidate inventory

- `QUALITY_GATE_V2_REVIEW1_TEST_SPEC.md`
- `tests/quality-gate-v2-review1/fixtures/fastPnpmProbe.cjs`
- `tests/quality-gate-v2-review1/fixtures/spreadCliEntry.cjs`
- `tests/quality-gate-v2-review1/pathEnvironment.contract.test.ts`
- `tests/quality-gate-v2-review1/qualityGateV2Review1TestKit.ts`
- `tests/quality-gate-v2-review1/realCliPathEnvironment.contract.test.ts`

`QUALITY_GATE_V2_REVIEW1_LOCK_CHANGELOG.md` is audit-only and intentionally
excluded from the immutable manifest. The manifest itself has no self entry.

## Required verification before independent review

The author must record:

- the isolated Review1 run with exact suites/tests/red/green counts,
  `--runInBand --ci --coverage=false --detectOpenHandles`;
- the accepted QUALITY-GATE-V2 233-test suite;
- accepted Native 30-test suite;
- formal accepted baseline;
- frozen P0-02A 13 tests and P0-02B 252 tests;
- global `tsc --noEmit`;
- direct `node --check` for both executable fixtures;
- stable-lock/self/registry identity validation, including accepted V2 self
  `3436439e37e461dc5a1141f61613e67e9eb5566538585bc0a956e2256e44d664`
  and Native self
  `12958a547ebb739bb0d4dafe7029e3dc6274f9bfef763994afd892b249bb23db`;
- forbidden-pattern and cross-project reference scans limited to the new
  Review1 assets.

## Author verification evidence

The final pre-sign test logic ran exactly **2 suites / 11 tests: 7 legitimate
expected-red failures + 4 independent green controls** in 3.835 seconds with
`--runInBand --ci --coverage=false --detectOpenHandles`. Jest reported zero
snapshots and no watchdog, permission, fixture, timeout, or open-handle
warning. The seven failures were exactly:

- three unique mixed-case PATH spellings reached the stage as `PATH: ""`;
- two equal noncanonical spellings reached the stage as `PATH: ""`;
- a conflicting unit environment was accepted instead of rejecting with the
  locked stable code;
- a real only-`Path` spread failed with
  `QUALITY_GATE_PROCESS_START_FAILED: node.exe` before the probe;
- a real conflicting spread started the probe and exited 0.

The four controls were canonical `PATH` through the injected runner, the
non-Windows unsupported-platform guard, canonical `PATH` through the real
process-start fixture, and identical `Path` plus `PATH` through that real
fixture.

All frozen regressions passed without retries:

- accepted QUALITY-GATE-V2: 9 suites / 233 tests;
- Native scaffold: 6 suites / 30 tests; combined Native review/scaffold:
  8 suites / 42 tests;
- formal baseline excluding separately counted QG V2 and P0-02B:
  57 suites / 354 tests;
- frozen P0-02A: 4 suites / 13 tests;
- frozen P0-02B: 11 suites / 252 tests;
- complete current accepted registry: 77 suites / 839 tests.

Global `tsc --noEmit` passed with zero diagnostics. Both CJS fixtures passed
direct `node --check`. The shipped validator passed 17 accepted manifests / 116
entries and retained one rejected manifest as excluded history. It validated
the accepted V2 bootstrap at 15 entries and exact self
`3436439e37e461dc5a1141f61613e67e9eb5566538585bc0a956e2256e44d664`.
The Native final manifest, retained `.candidate`, and registry binding all
remained byte-identical at
`12958a547ebb739bb0d4dafe7029e3dc6274f9bfef763994afd892b249bb23db`.

The 7-file pre-manifest forbidden scan covered focus/skip/todo, snapshots,
production module mocks, fake timers, TypeScript suppressions, unsafe casts,
shell execution, network APIs, cross-project references, and child-process
shell APIs: 10 patterns / zero hits. A separate scan found zero `process.env`
mutations and zero leaked Review1 temp directories.
