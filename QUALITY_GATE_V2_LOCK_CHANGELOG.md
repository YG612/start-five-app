# QUALITY-GATE-V2 candidate audit log

## 2026-08-05 - recorded expected-red candidate signing

- Status is RECORDED EXPECTED-RED CANDIDATE / SIGNED / AWAITING NEW
  INDEPENDENT TEST REVIEW / NO PRODUCTION AUTHORITY.
- The old QUALITY_GATE self
  5f2dfc85fc0fbabdf1f2e9546fb6536fcc353fc3437a14233ea2be33571189a0
  remains explicitly REJECTED and is not a stable accepted lock.
- Known old-candidate failures were fake string command parsing, missing exact
  order and invocation budgets, no real orchestrator API, contradictory
  manifest sorting, absent LF/CRLF/self/multi-lock cases, unsafe cwd/timeout
  behavior, and no trustworthy default quality entrypoint.
- V2 owns seven suites, 69 tests, one typed helper, one V2-local strict Node
  declaration file, and one lightweight real child-process fixture.
- Coverage includes exact full/test plans, every fail-fast position, real argv
  and process lifecycle, environment whitelist and injection resistance,
  multi-lock validation and accepted-root discovery, CLI exit mapping, fixed
  offline Android/JDK/SDK behavior, honest Windows iOS static scope, and atomic
  JSON/human evidence on both success and failure.
- Initial global TypeScript produced 37 V2-only diagnostics. The author fixed
  them without @types/node, any, as-unknown, suppression, production/config
  changes, or contract weakening. A local declaration file covers only the Node
  APIs exercised by V2. The invalid CLI argv parameter table was corrected so
  Jest supplies each complete argv array rather than only its first string.
- Global TypeScript then passed with zero diagnostics. V2 ran as exactly 7
  suites/69 tests: 68 legitimate expected-red failures and one control green.
  All red reasons were the absent production index.cjs/index.d.ts contract.
- Frozen 02A passed 4/13, frozen 02B passed 11/252, and the accepted formal
  baseline passed 57/353. V2 source forbidden scan reported zero hits.
- The real child fixture independently preserved argv/cwd/environment controls.
- Sixteen accepted manifests with 101 entries passed disk SHA audit with their
  previously accepted self identities unchanged.
- The unsigned draft was converted to QUALITY_GATE_V2_LOCK.sha256 after these
  gates. Its disk SHA-256 is the external candidate self recorded below after
  final manifest generation.
- Production, package/Jest configuration, native projects, prior locks/tests,
  active product work, rejected old QUALITY_GATE assets, and outputs/qingji-ai
  were not modified by this author.

Candidate self:
**42494312319ab9b2177200c2fc048b44748f527e9f5d1123f9aff709635c394f**.

### Independent review disposition

**REVOKED / REVIEW FAILED / NEVER ACCEPTED**. Independent review found five
material gaps: accepted review-root classification, real CLI child execution,
real-project iOS static auditing, fail-closed registry entry validation and
complete accepted inventory, and wall-clock-sensitive timeout/abort fixtures.
This self grants no implementation authority and must remain rejected history.

## 2026-08-05 - REVISION1 expected-red candidate signing

- Revision1 changes only this specification, tests/quality-gate-v2, the V2
  manifest, and this changelog. Production, package.json, tsconfig.json,
  jest.config.js, native files, other tests/locks, and outputs/qingji-ai were not
  modified.
- Accepted-root classification now proves frozen tests/review1 and review10 are
  accepted by registry status, while candidate, rejected, and unregistered
  review paths are excluded without substring heuristics. The real registry is
  locked to the exact 17 accepted manifests/roots and 116 accepted entries,
  including V2 itself, with old QUALITY_GATE explicitly rejected.
- Three tests spawn the real production cli.cjs. A checked-in Node recorder
  proves exact orchestrator argv/cwd/environment and secret stripping; real
  success, stage exit 23, and post-child lock corruption paths prevent empty,
  fixed-zero, or non-orchestrating entrypoints from passing.
- auditIosProjectStatic is now an exact public export with eight semantic check
  IDs. The real StartFive project and an independent semantic fixture are
  positive oracles; eight controlled mutations cover every check and reject an
  always-passed auditor without format snapshots.
- Registry validation adds 27 fail-closed entry cases plus unknown top-level,
  unknown-status discovery, duplicate-manifest, multi-lock, line-ending,
  inventory, self, path, ordering, duplicate, and content cases. Status,
  ordering, manifest/spec/inventory/test-root field types, safe paths,
  uniqueness, known fields, and accepted self are all explicit.
- The 100/500 ms wall-clock oracles were removed. Timeout and external abort
  attach a watcher before launch, wait for the child ready marker, and then use
  dedicated AbortControllers. ProcessResult records deadline/signal/no-timeout;
  20 seconds and the real-CLI 30-second watchdog only prevent hangs.
- Global TypeScript passed with zero diagnostics. Revision1 ran as 9 suites/113
  tests: 112 legitimate expected-red failures and one independent control green,
  with no open-handle warning. Three reds were missing cli.cjs; all others were
  missing index.cjs/index.d.ts.
- Frozen 02A passed 4/13, frozen 02B passed 11/252, and formal accepted baseline
  passed 57/353. Sixteen stable manifests/101 entries retained exact disk hashes
  and accepted self identities. V2 forbidden/cross-project scan reported zero
  hits. Direct child and recorder argv/cwd/environment controls passed.
- The new manifest has 15 entries in spec-first canonical POSIX order and no
  self entry. Its external Revision1 candidate self is recorded below after
  final disk generation.

Revision1 candidate self:
**664bb52bcf59f90b0d33f83a328eb19333b9810f14ac819b9e8f66a632a1f07a**.

### Revision1 independent review disposition

**REVOKED / REVIEW FAILED / NEVER ACCEPTED**. The second independent review
found two remaining gaps: no real ready-child case exercised timeoutMs's own
deadline, and iOS mutations allowed unrelated checks to fail because they only
required the target check to be present. This self grants no implementation
authority and remains rejected history.

No implementation is authorized until a brand-new independent reviewer accepts
all five corrections, candidate semantics, real-red legitimacy, disk identity,
and regression evidence.

## Revision2 minimal correction and re-sign

Revision2 changed only the two independently rejected contracts and their
supporting evidence:

- A real ready-PID holding child now exercises timeoutMs's own deadline without
  timeoutSignal or external AbortSignal. The result must preserve null exit,
  non-null signal, timedOut true, and timeoutSource deadline. A separate
  PID-status child proves there is no surviving process; 20 seconds is used only
  as that probe's hang watchdog.
- Every iOS mutation now has an independent fixed exact failure set, and every
  remaining check must be passed. The two authoritative dependency cases use
  minimal linked sets; the other six use singleton sets. An implementation that
  fails all eight checks is therefore rejected.

Global TypeScript passed with zero diagnostics. Revision2 ran as 9 suites/114
tests: 113 legitimate expected-red failures and one independent control green,
with no timeout or open-handle warning. Direct argv/cwd/environment/recorder and
ready-PID termination controls passed. Frozen 02A passed 4/13, frozen 02B passed
11/252, and the formal accepted baseline passed 57/353. Sixteen stable
manifests/101 entries retained exact hashes and accepted self identities. The
V2 forbidden, shell/network, and independent-project boundary scan found zero
hits.

The Revision2 manifest has 15 entries in spec-first canonical POSIX order, no
self entry, complete inventory coverage, and zero hash or ordering errors.

Revision2 candidate self:
**22d73d1a2c5318036c71ea74f90649796cec22156036f8305336449850db992d**.

This candidate is frozen pending a third brand-new independent test review. It
grants no production implementation authority until that reviewer accepts it.

### Revision2 independent review disposition

**REVOKED / REVIEW FAILED / NEVER ACCEPTED**. The third independent review
found three remaining gaps: the mutable registry could exclude the V2 candidate
from default execution, candidate/rejected registry entries could evade strict
shape validation, and top-level timeout/abort report evidence was not proved by
real CLI artifacts. This self grants no implementation authority and remains
rejected history.

## 2026-08-05 - REVISION3 minimal correction and re-sign

Revision3 changes only the three gaps identified by the third independent
review and their V2-owned supporting assets:

- A fixed-path bootstrap validates QUALITY_GATE_V2_LOCK.sha256,
  QUALITY_GATE_V2_TEST_SPEC.md, and the complete tests/quality-gate-v2
  inventory before mutable registry discovery. Its expected manifest self is
  an external canonical SHA-256 trust input, never a value derived from the
  tested registry or stored inside locked V2 assets. Missing/malformed trust,
  content mutation, coordinated manifest/registry identity mutation, unlisted
  inventory, and alternate-manifest substitution all fail closed.
- The registry must contain the exact accepted V2 bootstrap identity. Six real
  cli.cjs counterexamples cover deletion, candidate/rejected downgrade,
  replacement path, replacement self, and coordinated identity tampering; no
  stage recorder may start, while JSON and human failure artifacts remain
  mandatory.
- The 27 invalid registry-entry cases now run under accepted, candidate, and
  rejected status for 81 structural cases. Discovery and validation must both
  reject every case, plus unknown top-level and duplicate-manifest shapes.
- QualityGateReport and human summaries preserve exact exitCode, signal,
  timedOut, and timeoutSource. Real ready-PID CLI cases require exit 124 for its
  own deadline and exit 130 for external abort, exact artifact pairs, preserved
  evidence, and independent proof that no stage PID survives.

The final expected-red run was exactly 9 suites/187 tests: 186 legitimate
contract failures and one independent control green, with
--detectOpenHandles and no open-handle warning. Global TypeScript passed with
zero diagnostics. Frozen 02A passed 4/13, frozen 02B passed 11/252, and the
formal accepted baseline passed 57/353. Sixteen stable manifests/101 entries
retained exact disk hashes with zero format, path, file, or SHA errors. The
14-file V2 forbidden/shell/network/cross-project scan reported zero hits.

Direct fixture verification found and corrected one V2-owned missing closing
brace in the newly added abort harness before signing. Both executable fixtures
then passed Node syntax checks; the direct argv and recorder structure controls
passed. No production, package/Jest/TypeScript configuration, native project,
prior test/lock, active product candidate, rejected QUALITY_GATE asset, or
outputs/qingji-ai file was modified by the V2 author.

The Revision3 manifest has 15 entries in spec-first canonical POSIX order, no
self entry, complete inventory coverage, and zero hash or ordering errors.

Revision3 candidate self:
**f06a6faff18ac9d08abd1b1b9f56cdf68eb44806e384d84fed6b35b7f6c0bff8**.

This candidate is frozen pending a fourth brand-new independent test review.
It grants no production implementation authority until that reviewer accepts
the bootstrap trust boundary, structural registry matrix, real CLI evidence,
all prior corrections, expected-red legitimacy, and exact disk identity.

### Revision3 independent review disposition

**REVOKED / REVIEW FAILED / NEVER ACCEPTED**. The fourth independent review
found two remaining gaps: real cli.cjs did not exercise missing or malformed
QUALITY_GATE_V2_BOOTSTRAP_SELF_SHA256 entry-environment values, and registry
top-level schema/version/locks type failures were not sent through both public
discovery and validation paths plus the real CLI preflight. This self grants no
implementation authority and remains rejected history.

## 2026-08-05 - REVISION4 minimal correction and re-sign

Revision4 changes only the two gaps identified by the fourth independent
review:

- Six independent real cli.cjs environment counterexamples cover an absent,
  empty, 63-character lowercase, 65-character lowercase, 64-character
  uppercase, and canonical lowercase-but-mismatched
  QUALITY_GATE_V2_BOOTSTRAP_SELF_SHA256. Malformed values require
  QUALITY_GATE_V2_BOOTSTRAP_TRUST_INVALID; the valid mismatch requires
  QUALITY_GATE_V2_BOOTSTRAP_SELF_MISMATCH. Every case returns nonzero before
  any recorder/PID/formal child, writes the exact JSON/human artifact pair, and
  forbids fallback trust derived from manifest or registry bytes.
- Fifteen hard-coded registry top-level documents cover wrong, missing, null,
  and wrong-type schema/version/locks fields plus null, array, and string
  documents. Every case rejects through both discoverAcceptedTestRoots and
  validateLockManifests with QUALITY_GATE_REGISTRY_INVALID. The same fifteen
  cases run through real cli.cjs preflight and require nonzero exit, absent
  recorder/PID markers, stable error evidence, and the exact report pair.

The final expected-red run was exactly 9 suites/220 tests: 219 legitimate
contract failures and one independent control green, with
--detectOpenHandles and no open-handle warning. Global TypeScript passed with
zero diagnostics. Direct fixture syntax/argv/recorder controls passed. Frozen
02A passed 4/13, frozen 02B passed 11/252, and the formal accepted baseline
passed 57/353. Sixteen stable manifests/101 entries retained exact hashes with
zero errors. The 14-file focus/skip/snapshot/mock/fake-timer/suppression/unsafe-
type/shell/network/cross-project scan reported zero hits.

The Revision4 manifest has 15 entries in spec-first canonical POSIX order, no
self entry, complete inventory coverage, and zero hash or ordering errors. No
production, config, other lock/test, native project, or outputs/qingji-ai file
was modified by the V2 author.

Revision4 candidate self:
**1fae0f0d514bf5dfffd34f13b0927b63ad1443e2d50347e5d291724d364c57ea**.

This candidate is frozen pending a fifth brand-new independent test review. It
grants no production implementation authority until that reviewer accepts all
Revision4 corrections, prior strong oracles, expected-red legitimacy, exact
disk identity, and regression evidence.

### Revision4 independent review disposition

**REVOKED / REVIEW FAILED / NEVER ACCEPTED**. The fifth independent review
found one remaining authority gap: cli.cjs accepted a caller-selected
`--registry` file, so a structurally valid alternate registry could retain the
exact V2 bootstrap identity while excluding accepted product locks. Revision4
self `1fae0f0d514bf5dfffd34f13b0927b63ad1443e2d50347e5d291724d364c57ea`
grants no implementation authority and remains rejected history.

## 2026-08-06 - REVISION5 authoritative CLI registry correction and re-sign

Revision5 changes only the gap identified by the fifth independent review and
its V2-owned evidence:

- The CLI active registry is fixed to the Windows-normalized
  `<projectRoot>/quality-gate.acceptance.json`. Three positive contracts cover
  separator plus reducible dot-segment spelling, Windows case-insensitive
  spelling, and a relative default path resolved from project-root cwd. The
  parser returns the canonical project-root spelling in every accepted case.
- A same-project alternate file, traversal to a sibling registry, and a real
  Windows directory junction/reparse input all reject with
  `QUALITY_GATE_CLI_REGISTRY_NOT_AUTHORITATIVE`. The public discovery and
  validation APIs retain their injected-registry contract, as proved by the
  existing independent synthetic positive fixtures.
- A real cli.cjs child counterexample uses a valid same-project alternate
  registry that contains the exact accepted V2 bootstrap identity and omits
  `FROZEN_REVIEW1_LOCK.sha256`. It requires exit 1 and the stable authority
  code before any recorder, PID, or formal child, while still requiring exactly
  `quality-gate-report.json` and `quality-gate-summary.txt` with lock-preflight
  failure evidence.

The final expected-red run was exactly 9 suites/227 tests: 226 legitimate
contract failures and one independent control green, with
`--detectOpenHandles`, zero snapshots, and no open-handle warning. The new real
junction fixture created and executed successfully; it produced no permission
or fixture error. Global TypeScript passed with zero diagnostics. Frozen 02A
passed 4 suites/13 tests, frozen 02B passed 11 suites/252 tests, and the formal
accepted baseline passed 57 suites/353 tests.

Both executable fixtures passed direct Node syntax checks. The direct child
argv control preserved spaces plus ampersand, pipe, caret, percent, semicolon,
dollar, redirection, and Unicode as two exact arguments. Sixteen stable
manifests with 101 entries passed disk SHA validation with zero missing,
malformed, unsafe-path, or content errors. The 14-file V2
focus/skip/snapshot/module-mock/fake-timer/suppression/unsafe-type/shell/network/
cross-project scan reported zero hits.

The Revision5 manifest has 15 entries in spec-first canonical POSIX order, no
self entry, complete inventory coverage, and zero hash or ordering errors. No
production, package/Jest/TypeScript configuration, native project, prior
test/lock, active product candidate, rejected QUALITY_GATE asset, or
`outputs/qingji-ai` file was modified by this author.

Revision5 candidate self:
**d80e62286a079c45f656f8cb366ab37072511dba0a2f020f23af89d3e4eaec64**.

This candidate is frozen pending a sixth brand-new independent test review. It
grants no production implementation authority until that reviewer accepts the
authoritative CLI registry boundary, all prior strong oracles, expected-red
legitimacy, exact disk identity, and regression evidence.

### Revision5 independent review disposition

**REVOKED / REVIEW FAILED / NEVER ACCEPTED**. The sixth independent review
found three remaining test-asset gaps. First, the specification still presented
Revision4/fifth-review text as current status. Second, every real CLI child
supplied `--registry`, while the package assertion only compared a string, so a
malicious implementation could select an alternate registry only when the
option was omitted; all parser calls also used `cwd === projectRoot`. Third,
the junction test loaded the deliberately absent production module before it
created the junction, so the recorded red run never proved creation, linked
access, rejection, or cleanup. Revision5 self
`d80e62286a079c45f656f8cb366ab37072511dba0a2f020f23af89d3e4eaec64`
grants no implementation authority and remains rejected history.

## 2026-08-06 - REVISION6 implicit-registry and junction-oracle correction

Revision6 changes only this specification, cliAndEntry.contract.test.ts,
realCliChild.contract.test.ts, this manifest, and this audit changelog:

- The specification status now consistently identifies Revision6 as signed,
  awaiting the seventh independent review, with all six prior identities
  explicitly REVIEW FAILED / NEVER ACCEPTED.
- Two parser contracts omit `--registry`. They prove that an explicit
  project-root wins over a different cwd and that, when project-root is also
  omitted, the entry cwd supplies both defaults.
- Three real Node children omit `--registry`. The first executes the final
  cli.cjs test entry with both defaults and requires the frozen product root in
  exact recorder argv. The second gives the child a different cwd containing a
  structurally valid default-named V2-only attacker registry while preserving
  an explicit project-root; it also requires the product root. The third sends
  the implicit default through a real project-root junction to a V2-only
  registry and requires exit 1,
  QUALITY_GATE_CLI_REGISTRY_NOT_AUTHORITATIVE, exact JSON/human
  lock-preflight evidence, and no recorder or PID.
- The unit-level Windows junction oracle now creates and accesses the junction
  before production loading, captures the stable rejection, and removes it in
  `finally` while proving the target survived. An injected minimal rejection
  control executes that entire lifecycle independently of missing production;
  the production callback remains the expected-red contract.

Global TypeScript passed with zero diagnostics. The exact signed test logic ran
as 9 suites/233 tests: 231 legitimate expected-red failures and two independent
controls green, with `--detectOpenHandles`, zero snapshots, and no open-handle
warning. The junction lifecycle control was also isolated and passed 1/1.
Frozen 02A passed 4 suites/13 tests, frozen 02B passed 11 suites/252 tests, and
the formal accepted baseline passed 57 suites/353 tests.

Both executable fixtures passed direct Node syntax checks. The direct argv
fixture preserved spaces, ampersand, pipe, caret, percent, semicolon, dollar,
redirection, and Unicode as two exact arguments. Sixteen stable manifests with
101 entries passed disk SHA validation with zero missing, malformed, unsafe
path, or content errors and retained their prior self identities. The 14-file
V2 focus/skip/todo/snapshot/module-mock/fake-timer/TypeScript-suppression/
unsafe-cast/shell/network/cross-project scan reported zero hits.

The Revision6 manifest has 15 entries in spec-first canonical POSIX order, no
self entry, and exact complete inventory coverage. No production,
package/Jest/TypeScript configuration, native project, prior test/lock, active
product candidate, rejected QUALITY_GATE asset, or `outputs/qingji-ai` file was
modified by this author.

Revision6 candidate self:
**3436439e37e461dc5a1141f61613e67e9eb5566538585bc0a956e2256e44d664**.

This candidate is frozen pending a seventh brand-new independent test review.
It grants no production implementation authority until that reviewer accepts
the implicit and explicit authoritative-registry boundary, cwd/project-root
semantics, real junction lifecycle and preflight evidence, all prior strong
oracles, expected-red legitimacy, exact disk identity, and regressions.
