# QUALITY-GATE-V2 Windows PATH post-acceptance Review2 specification

## Status, predecessor disposition, and authority

- Review1 self
  `5129206bffb81e77d1487b7b3a3ac9e2ee3e9270750549ec4424196c7d801b45`
  is **REVIEW FAILED / NEVER ACCEPTED**. Its functional PATH contracts remain
  valid, but its ambient-environment immutability oracle inspected only the
  parent Jest process and did not observe the process executing production.
- Review1 manifest and all six listed files are immutable rejected history and
  are not dependencies of this suite.
- Review2 is a completely self-contained test-only replacement. It copies all
  qualified Review1 contracts and adds the missing same-process oracle.
- Review2 is outside `quality-gate.acceptance.json`. It remains **PENDING
  INDEPENDENT REVIEW / NOT ACCEPTED / NO PRODUCTION AUTHORITY** until a new
  independent reviewer returns PASS.
- After the final Review2 manifest is signed, its specification and complete
  `tests/quality-gate-v2-review2/**` inventory are immutable. Only the excluded
  Review2 changelog may record review disposition.

The accepted production baseline remains QUALITY-GATE-V2 self
`3436439e37e461dc5a1141f61613e67e9eb5566538585bc0a956e2256e44d664`.

## Defect contract retained from Review1

On `win32`, all own environment keys whose spelling equals `PATH` under ASCII
case-insensitive comparison represent one Windows PATH identity:

- a single `Path`, `pAtH`, `PaTh`, or other mixed-case string-valued key must
  become one downstream canonical `PATH` with the byte-exact value;
- canonical `PATH` remains a positive control;
- multiple variants with byte-identical values may collapse to one canonical
  `PATH`;
- conflicting string values reject with stable code
  `QUALITY_GATE_ENV_PATH_CONFLICT` before runner, report, recorder, ready
  marker, or stage PID side effects;
- non-`win32` semantics must not case-fold PATH keys and must retain the
  existing `QUALITY_GATE_PLATFORM_UNSUPPORTED` boundary.

The real CLI fixture runs the shipped `cli.cjs` export after spreading its
actual child `process.env`. A fixed local `exec` probe proves executable lookup
from an exact PATH, preservation of existing allowlisted environment values,
removal of forbidden/bootstrap secrets, exact argv/cwd, and `shell:false`
behavior. The accepted root argument
`tests/no-shell&mkdir shell-evidence` must remain one literal argv item, and no
`shell-evidence` directory may be created.

## Review2 same-process ambient environment contract

The production implementation may construct and return/use a detached
canonical child environment. It must never add, delete, rename, or change any
own enumerable key/value on ambient `process.env`.

An independent Node fixture executes in a fresh child only to isolate test
controls from the parent Jest worker. The evidence itself is not inferred from
parent isolation: inside that one child process it performs, in order:

1. a full snapshot of every own enumerable `process.env` key and value;
2. invocation and awaiting of the shipped production `runCliProcess` function;
3. another full snapshot immediately after production settles;
4. a case-sensitive, value-sensitive, deterministic diff.

Both snapshots use stable UTF-16 code-unit ordering and preserve original key
casing. Evidence records the same PID before the call, at the call boundary,
and after the call. The before/after arrays must be exactly equal and the diff
must be empty for both canonical `PATH` and the repaired only-`Path` path.

This is an observable contract, not an implementation-location requirement.
Production may normalize wherever appropriate provided it operates on a
detached object and satisfies all functional and immutability evidence.

## Oracle self-controls and restoration

The same fixture contains three test-only mutation controls for its own
snapshot/diff mechanism. They do not call production:

1. add a new environment key;
2. change the existing PATH value;
3. delete the existing PATH spelling and recreate the same value under a
   different key casing.

Each control must produce the exact case/value-sensitive diff. A `finally`
block then deletes the current full environment and reconstructs the original
snapshot with exact casing and values. Evidence must show byte-for-byte equal
original/restored arrays and an empty restoration diff. A control that fails
to detect its mutation or fails full restoration exits nonzero and invalidates
the candidate.

No oracle uses fake timers, timer advancement, network, dependency install,
build, external service, production mock, snapshot assertion, skip/focus/todo,
or TypeScript suppression. All evidence and reports live only under tracked
temp directories and are removed after every test.

## Test inventory and initial expected disposition

### `pathEnvironment.contract.test.ts` — 7 tests

- unique `Path`, `pAtH`, and `PaTh`: three expected reds;
- canonical `PATH`: one independent green;
- equal noncanonical variants: one expected red;
- conflicting variants with zero side effects: one expected red;
- non-Windows exact-key semantics: one independent green.

### `realCliPathEnvironment.contract.test.ts` — 4 tests

- real only-`Path` process start: one expected red;
- real canonical `PATH`: one independent green;
- real identical `Path`/`PATH`: one independent green;
- real conflicting spread fail-closed: one expected red.

These eleven tests reproduce Review1's exact qualified baseline:
**7 legitimate red + 4 independent green**.

### `ambientProcessEnvironment.contract.test.ts` — 5 tests

- only-`Path` production call: exact empty ambient diff plus repaired PATH
  behavior, initially expected red on the functional PATH assertion;
- canonical `PATH` production call: exact empty ambient diff, independent
  green;
- add-key detector/restoration control: green;
- PATH-value detector/restoration control: green;
- PATH-key-shape detector/restoration control: green.

Expected Review2 total before production repair: **3 suites / 16 tests: 8
legitimate red + 8 independent green controls**. Counts must be confirmed by
real execution before signing.

## Candidate inventory

- `QUALITY_GATE_V2_REVIEW2_TEST_SPEC.md`
- `tests/quality-gate-v2-review2/ambientProcessEnvironment.contract.test.ts`
- `tests/quality-gate-v2-review2/fixtures/ambientProcessEnvironment.cjs`
- `tests/quality-gate-v2-review2/fixtures/fastPnpmProbe.cjs`
- `tests/quality-gate-v2-review2/fixtures/spreadCliEntry.cjs`
- `tests/quality-gate-v2-review2/pathEnvironment.contract.test.ts`
- `tests/quality-gate-v2-review2/qualityGateV2Review2TestKit.ts`
- `tests/quality-gate-v2-review2/realCliPathEnvironment.contract.test.ts`

`QUALITY_GATE_V2_REVIEW2_LOCK_CHANGELOG.md` is audit-only and excluded from
the manifest. The manifest has no self entry.

## Required author verification

- isolated Review2 with `--runInBand --ci --coverage=false
  --detectOpenHandles`, exact red/green mapping, zero snapshot/open-handle
  warning;
- QG V2 233, Native scaffold 30, formal baseline 354, P0-02A 13, P0-02B
  252, and complete accepted registry 839;
- global `tsc --noEmit` and direct `node --check` for all three CJS fixtures;
- shipped validation of 17 accepted manifests / 116 entries, accepted V2 self,
  and Native final/candidate/registry identity;
- exact Review1 self and all 6 listed hashes unchanged;
- complete Review2 inventory, manifest order/hashes, and forbidden-pattern,
  cross-project, ambient mutation, and temp-leak scans.

## Author verification evidence

The final pre-sign Review2 logic ran exactly **3 suites / 16 tests: 8
legitimate expected-red failures + 8 independent green controls** in 4.595
seconds with `--runInBand --ci --coverage=false --detectOpenHandles`. Jest
reported zero snapshots and no fixture, permission, restore, watchdog,
timeout, or open-handle warning.

The copied 11-test functional baseline retained Review1's exact 7-red/4-green
split. The five new same-process tests added one legitimate functional red and
four greens:

- only-`Path` captured identical, fully sorted before/after ambient snapshots,
  one PID, and an empty diff before correctly failing only because production
  returned exit 1;
- canonical `PATH` captured identical snapshots and an empty diff while the
  production call passed;
- add-key, PATH-value, and PATH-key-shape controls each produced their exact
  deterministic diff, then reconstructed the full original environment in
  `finally` with exact array equality and empty restoration diff.

The test helper uses a bounded synchronous child watchdog and contains no
explicit timer API. All three CJS fixtures passed direct `node --check`.
Global `tsc --noEmit` passed with zero diagnostics after the final helper
change.

All required frozen regressions passed without retries:

- accepted QG V2: 9 suites / 233 tests;
- Native scaffold: 6 suites / 30 tests;
- formal baseline: 57 suites / 354 tests;
- P0-02A: 4 suites / 13 tests;
- P0-02B: 11 suites / 252 tests;
- complete accepted registry: 77 suites / 839 tests.

The shipped validator passed 17 accepted manifests / 116 entries and retained
one rejected historical manifest. Accepted QG V2 bootstrap self remained
`3436439e37e461dc5a1141f61613e67e9eb5566538585bc0a956e2256e44d664`.
Native final manifest, retained `.candidate`, and registry identity all
remained
`12958a547ebb739bb0d4dafe7029e3dc6274f9bfef763994afd892b249bb23db`.
Rejected Review1 remained exact self
`5129206bffb81e77d1487b7b3a3ac9e2ee3e9270750549ec4424196c7d801b45`
with 6 entries / zero entry errors.

The 9-file pre-manifest scan covered 11 forbidden pattern families, including
focus/skip/todo, snapshots, module mocks, fake/explicit timer APIs,
TypeScript suppressions, unsafe casts, shell execution, network APIs,
cross-project references, and child-process shell APIs: zero hits. Six
intentional `process.env` mutation lines were confined to the independent
ambient oracle fixture; unauthorized mutation hits were zero. Review2 temp
fixture leaks were zero. No external failure, overlapping write, or shared
asset interference was observed.
