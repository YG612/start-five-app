# QUALITY-GATE-V2 test-first candidate specification

## Status and authority

Status: **RECORDED EXPECTED-RED REVISION6 CANDIDATE / SIGNED / AWAITING
SEVENTH INDEPENDENT TEST REVIEW / NO PRODUCTION AUTHORITY**.

Superseded Revision5 status: **REVOKED / REVIEW FAILED / NEVER ACCEPTED**.

Superseded Revision4 status: **REVOKED / REVIEW FAILED / NEVER ACCEPTED**.

Superseded Revision3 status: **REVOKED / REVIEW FAILED / NEVER ACCEPTED**.

Superseded Revision2 status: **REVOKED / REVIEW FAILED / NEVER ACCEPTED**.

Superseded Revision1 status: **REVOKED / REVIEW FAILED / NEVER ACCEPTED**.

All six prior candidate identities failed their respective independent reviews
and are **REVOKED / REVIEW FAILED / NEVER ACCEPTED**:

- initial: 42494312319ab9b2177200c2fc048b44748f527e9f5d1123f9aff709635c394f
- Revision1: 664bb52bcf59f90b0d33f83a328eb19333b9810f14ac819b9e8f66a632a1f07a
- Revision2: 22d73d1a2c5318036c71ea74f90649796cec22156036f8305336449850db992d
- Revision3: f06a6faff18ac9d08abd1b1b9f56cdf68eb44806e384d84fed6b35b7f6c0bff8
- Revision4: 1fae0f0d514bf5dfffd34f13b0927b63ad1443e2d50347e5d291724d364c57ea
- Revision5: d80e62286a079c45f656f8cb366ab37072511dba0a2f020f23af89d3e4eaec64

Revision6 was re-executed and signed under a new identity for a seventh
brand-new independent review. Production implementation remains forbidden.

This is a clean parallel replacement for the rejected quality-gate candidate.
It does not modify or rely on the rejected assets. The old
QUALITY_GATE_LOCK.sha256 self identity is
5f2dfc85fc0fbabdf1f2e9546fb6536fcc353fc3437a14233ea2be33571189a0.
That identity is REJECTED, is not a stable accepted lock, and must never enter
a green baseline. Its review found string-based fake command parsing, no exact
stage sequence or call count, no real orchestrator contract, contradictory
manifest ordering, missing LF/CRLF/self/multi-lock coverage, and unsafe CLI
cwd, timeout, and process behavior.

V2 adds only this specification, files below tests/quality-gate-v2, the signed
candidate QUALITY_GATE_V2_LOCK.sha256, and the audit-only changelog. A minimal
nodeTestRuntime.d.ts supplies strictly typed Node declarations only to this
test directory; it does not change the product TypeScript configuration or
runtime. The author changed no production, package script, Jest configuration,
native project, prior test/spec/lock, active product candidate, or
the separate pre-existing application project.

Execution resumed on 2026-08-06. The test author ran every candidate and
regression gate recorded below, corrected only V2-owned type/test defects, and
signed the resulting disk bytes. No production repair may start until a
brand-new independent test reviewer accepts the candidate semantics, legitimate
expected-red result, identity, and regression evidence.

## Future implementation boundary

After test verification and independent acceptance only, a repair agent may add
scripts/quality-gate-v2/index.cjs, index.d.ts, cli.cjs, minimum private files,
quality-gate.acceptance.json, and minimum package/Jest entrypoint changes.
Application business code, native application configuration, frozen tests, and
unrelated locks may not change. CommonJS lets the CLI run under pinned Node
without adding a TypeScript runtime dependency.

## Public surface

index.cjs owns exactly these enumerable exports:

- QUALITY_GATE_ENV_ALLOWLIST
- QUALITY_GATE_REPORT_SCHEMA
- QUALITY_GATE_REPORT_VERSION
- QUALITY_GATE_STAGE_ORDER
- QUALITY_GATE_TEST_STAGE_ORDER
- QUALITY_GATE_V2_BOOTSTRAP_MANIFEST
- QUALITY_GATE_V2_BOOTSTRAP_SPEC
- QUALITY_GATE_V2_BOOTSTRAP_TEST_ROOT
- auditIosProjectStatic
- createAtomicQualityGateReportWriter
- createNodeProcessRunner
- createQualityGateOrchestrator
- discoverAcceptedTestRoots
- parseQualityGateCliArgs
- runQualityGateCli
- validateLockManifests
- validateQualityGateV2Bootstrap

index.d.ts supplies strict ProcessRequest, ProcessResult, ProcessRunner,
QualityGateReport, CreateQualityGateOptions, orchestrator, validator, writer,
iOS static-audit, V2 bootstrap, and CLI types verified by a real TypeScript
CompilerHost.
Process results distinguish deadline timeout, controlled timeout signal, and no
timeout. Report schema is start-five.quality-gate-report and version is 1.

## Exact stages and commands

Full mode order is:

1. formal-tests
2. typecheck
3. android-lint
4. android-unit-tests
5. android-assemble
6. android-signature
7. android-zipalign
8. android-package-manifest
9. lock-manifests
10. ios-static-audit

The first eight stages invoke ProcessRunner exactly once. Lock validation and
iOS audit are internal typed stages. A successful full run makes eight process
calls, one validation, one iOS audit, and one report write. Test mode is exactly
formal-tests then lock-manifests, with one process call and no Android/iOS call.

Formal tests use one executable and argv array:
pnpm exec jest --runInBand --ci --coverage=false --roots followed by every
accepted root. The real registry contract fixes 17 accepted manifests/roots,
including frozen tests/review1 and the accepted V2 lock. Candidate, rejected,
draft, and unregistered review roots are absent by validated registry status,
never by a substring rule. TypeScript is exactly pnpm exec tsc --noEmit.

Android uses checked-in android/gradlew.bat, Android cwd, fixed JDK 17/SDK/Build
Tools/PATH, and --offline --no-daemon --stacktrace for :app:lintDebug,
:app:testDebugUnitTest, and :app:assembleDebug. APK evidence uses absolute
Build Tools executables for apksigner verify with certs, zipalign check, and
aapt dump badging. No network command is allowed. Windows never invokes
xcodebuild or claims an iOS build; the last stage is explicitly static audit.

## Fail-fast evidence

Any nonzero exit, null exit with signal, timeout, validation error, or iOS audit
failure stops immediately. No later stage runs and remaining stages are marked
skipped. Failed stage and top-level report preserve exact exit code, signal,
timeout state, `timeoutSource` (`deadline`, `signal`, or null), stdout, and
stderr. Failure still writes one JSON report and one human summary.
Report-writer failure exposes QUALITY_GATE_REPORT_WRITE_FAILED with identical
cause.

A table covers every executable failure position and exact index-plus-one call
budget. Additional tests cover timeout, abort, lock failure, iOS failure,
writer failure, success, and test mode.

## Real ProcessRunner

ProcessRunner accepts executable and argv separately, exact cwd, allowlisted
environment, a deadline, an optional external AbortSignal, and an optional
controlled timeout AbortSignal. It directly spawns without a shell or command
reconstruction. ProcessResult identifies deadline versus controlled-signal
timeout, so a broad watchdog cannot impersonate the behavior oracle.

A real lightweight fixture verifies Windows-sensitive spaces, quotes,
ampersand, pipe, caret, percent, semicolon, dollar, redirection, Unicode, and a
sentinel path remain exact argv and cannot create the sentinel. Tests cover cwd,
environment secret stripping, forbidden-key rejection before child start, and
nonzero exit/stdout/stderr. The public deadline case attaches a file-system
watcher before launch, receives a real holding child's PID marker, supplies only
timeoutMs as its termination input, and requires null exit, a non-null signal,
timedOut true, and timeoutSource deadline. An independent PID-status child then
proves the holding child no longer exists; its 20 second watchdog only prevents
a probe hang. Controlled-timeout-signal and external-abort cases use distinct
ready handshakes and distinct AbortControllers. No case compares elapsed
wall-clock duration, sleeps, or uses fake timers.

The exact sorted allowlist is ANDROID_HOME, ANDROID_SDK_ROOT, CI, ComSpec,
JAVA_HOME, NODE_OPTIONS, PATH, PATHEXT, SystemRoot, TEMP, and TMP.

## Non-circular V2 bootstrap trust boundary

The default CLI must validate V2 before consulting mutable registry status or
discovering any Jest root. The bootstrap paths are fixed public constants:
QUALITY_GATE_V2_LOCK.sha256, QUALITY_GATE_V2_TEST_SPEC.md, and
tests/quality-gate-v2. A caller-provided expected V2 manifest self SHA-256 is
the independent trust input. The production CLI receives it through the
dedicated QUALITY_GATE_V2_BOOTSTRAP_SELF_SHA256 entry boundary; it is never
stored inside the manifest or any V2-locked asset, because doing so would create
a self-hash cycle. Missing, malformed, uppercase, or otherwise non-canonical
trust input fails closed before a stage child starts. The bootstrap value is
removed from the formal-test child environment together with ambient secrets.
The real cli.cjs entrypoint is the oracle for six independent environment
counterexamples: the variable is absent, empty, 63 lowercase characters, 65
lowercase characters, 64 uppercase characters, or a canonical lowercase
64-character value that does not equal the fixed bootstrap manifest self.
Malformed values return QUALITY_GATE_V2_BOOTSTRAP_TRUST_INVALID and the valid
mismatch returns QUALITY_GATE_V2_BOOTSTRAP_SELF_MISMATCH. No implementation may
compute or recover a fallback trust value from the manifest or registry.

validateQualityGateV2Bootstrap must open only the fixed manifest path, require
the fixed spec and complete fixed test-root inventory, validate every lowercase
SHA-256 entry against disk, reject unlisted inventory files, and compare the
manifest bytes to the independent expected self. An alternate manifest with
identical contents cannot replace the fixed path. The test oracle is an
independent synthetic fixture with hard-coded file hashes and a hard-coded
external manifest self; it is not derived from the registry or the candidate
being validated.

After fixed bootstrap validation, the registry must contain exactly one
structurally valid accepted entry whose manifest, status, ordering, spec path,
inventory roots, test roots, and expected self match the fixed bootstrap
identity. Registry deletion, candidate downgrade, rejected downgrade,
replacement manifest path, replacement registry self, and coordinated
manifest-plus-registry identity tampering all run through the real cli.cjs
entrypoint. Every counterexample must return nonzero, start no formal-test
child, name the stable bootstrap error, and still write the exact JSON/summary
artifact pair. Thus mutable registry selection cannot exclude, substitute, or
re-sign the V2 tests that police the registry itself.

The CLI's active registry identity is independently fixed to the Windows-
normalized `<projectRoot>/quality-gate.acceptance.json`. `--registry` may only
spell that same identity: separator variants, reducible dot segments, a
relative default path resolved from the project-root cwd, and Windows case
variants are accepted and returned as the canonical project-root spelling.
Any same-project alternate file, path that traverses to another directory, or
path reached through a reparse point is rejected before orchestration with
QUALITY_GATE_CLI_REGISTRY_NOT_AUTHORITATIVE. This CLI-only authority rule does
not narrow the public discoverAcceptedTestRoots or validateLockManifests
interfaces; their independently generated synthetic registries remain valid
unit-test inputs.

Omitting `--registry` is not a separate selection capability. The real final
`node scripts/quality-gate-v2/cli.cjs test` entry binds the registry to the
authoritative file beneath the effective project root. With no explicit
`--project-root`, the entry cwd is the project root. With an explicit project
root, that value wins even when the child cwd contains a structurally valid
default-named attacker registry retaining V2 but excluding product locks. Two
real child controls require the formal argv to retain the frozen product root,
so an implementation cannot special-case only the explicit `--registry`
branch or resolve the default registry from the wrong cwd.

The omitted-registry branch is also subject to the same reparse rejection as
the explicit branch. A real child supplies its project root through a Windows
directory junction whose default registry is a valid V2-only document that
excludes the frozen product lock. It must fail at lock-preflight with exit 1,
QUALITY_GATE_CLI_REGISTRY_NOT_AUTHORITATIVE, the exact JSON/human artifact
pair, and no recorder or ready-PID evidence. Thus a reparse path cannot turn
the implicit default into an alternate-registry bypass.

A real cli.cjs counterexample selects a structurally valid same-project
alternate registry that retains the exact accepted V2 bootstrap identity but
removes the frozen product lock. It must return exit 1 with the stable registry
authority error, create neither recorder nor PID/formal-child evidence, and
still write exactly the JSON report and human summary with lock-preflight
failure evidence. Therefore an alternate registry cannot preserve the V2
policeman while silently excluding the product tests it is meant to run.

## Real iOS static audit

auditIosProjectStatic is an explicit public function and the orchestrator's
final Windows-only internal stage. Its result has scope windows-static-only and
exactly eight semantic checks: Xcode project, application target, shared scheme,
scheme/target graph, Info.plist security/launch identity, privacy manifest,
React Native Podfile, and React Native entry module.

The checked-in StartFive iOS project and an independent representative fixture
must pass without exact-file snapshots. Eight controlled mutations each remove
or corrupt one semantic obligation. Their failure sets are independent fixed
oracles: missing Xcode project fails xcode-project, application-target, and
scheme-target-graph; missing shared scheme fails shared-scheme and
scheme-target-graph; each of the other six mutations fails exactly its one
corresponding check. Every check outside the fixed failure set must pass. Thus
an always-passed auditor and an auditor that marks all eight checks failed are
both red, without brittle whitespace or Xcode serialization assertions.
Windows never invokes xcodebuild or reports an iOS build.

## Manifest registry

quality-gate.acceptance.json uses schema start-five.quality-lock-registry,
version 1, and status accepted, candidate, or rejected. Only accepted locks are
validated and contribute test roots. The old rejected quality identity remains
rejected history with no root.

Every registry entry is fail-closed for its exact known fields, field types,
status, ordering, manifest, spec path, inventory roots, test roots, and expected
self. All paths must be safe canonical POSIX relatives; roots and manifests must
be unique under Windows case rules; test roots must be covered by inventory.
Accepted draft manifests, malformed hashes, incoherent ordering/spec pairs,
unknown statuses, unknown entry fields, and unknown top-level fields reject.
Candidate and rejected entries remain structurally validated but do not
contribute roots or file hashes.

The structural rejection oracle is an explicit 27-case invalid-entry matrix
executed independently under accepted, candidate, and rejected status: 81
cases total. Status changes selection only; it never weakens schema, type,
unknown-field, path-safety, uniqueness, status-coherence, ordering, inventory,
or self-identity validation. Each matrix case must fail through both
discoverAcceptedTestRoots and validateLockManifests with
QUALITY_GATE_REGISTRY_ENTRY_INVALID. Unknown top-level fields and duplicate
manifest identities likewise fail through both public paths, so discovery
cannot become a permissive bypass around validation.

Fifteen independent top-level registry counterexamples cover wrong, missing,
null, and wrong-type schema/version/locks fields plus null, array, and string
registry documents. Every case must fail through both
discoverAcceptedTestRoots and validateLockManifests with
QUALITY_GATE_REGISTRY_INVALID. The same 15 documents also run through real
cli.cjs preflight: each must return nonzero, preserve the stable error in exact
JSON and human artifacts, and leave both recorder and ready-PID markers absent.
Status filtering or bootstrap matching cannot bypass this top-level shape gate.

Each accepted lock declares ordering posix or spec-first-posix. This supports
different historical accepted conventions without contradictory global rules.
Validation covers multiple manifests, LF and CRLF, lowercase SHA-256 plus two
spaces, expected manifest self hash, forbidden self entry, missing files,
inventory omissions/extras, exact and Windows-case duplicates, and canonical
safe POSIX-relative paths. Traversal, dot, absolute, drive, and backslash paths
reject. Validation returns the exact sorted accepted manifest/root inventory and
the exact excluded manifest/status inventory. The real registry contract is 17
accepted manifests, 17 roots, and 116 accepted manifest entries after Revision
1; the old QUALITY_GATE is the explicit rejected entry.

## Default CLI and reports

After repair package scripts are exactly:

- test: node scripts/quality-gate-v2/cli.cjs test
- quality:gate: node scripts/quality-gate-v2/cli.cjs full

Thus default test cannot silently inherit locked-only Jest roots. CLI consumes
the original argv array and supports exact project root, report directory,
timeout, Node, pnpm, JDK, SDK, and Build Tools values. Its optional registry
argument is only an equivalent spelling of the fixed authoritative default;
it is not a registry-selection capability. Unknown, missing, or invalid values
reject with QUALITY_GATE_CLI_USAGE, while a non-authoritative registry rejects
with QUALITY_GATE_CLI_REGISTRY_NOT_AUTHORITATIVE. Help starts no process. Child
failure returns its code; timeout maps to 124 and SIGINT to 130 while evidence
and JSON remain available.

Thirty-six tests exercise the real production scripts/quality-gate-v2/cli.cjs
with Node, including one exported CLI process entry used only to inject a real
external AbortSignal. Three of those tests omit `--registry`: one executes the
final entry with both project-root and registry defaults, one proves an
explicit project-root wins over a different attacker cwd, and one proves the
implicit default cannot cross a real project-root junction to a V2-only
registry.
A checked-in recorder executes as the planned pnpm child and proves exact argv,
cwd, environment filtering, stdout/stderr, and success report. A real exit 23
must propagate through CLI evidence. A post-child manifest mutation must fail
the internal lock stage. Six bootstrap/registry identity counterexamples, six
bootstrap entry-environment counterexamples, and fifteen registry top-level
  counterexamples and the alternate-registry authority counterexample must all
  fail before the recorder or PID marker begins while
still writing both reports. A real ready-PID holding stage must be terminated
by the CLI's own deadline, return 124, preserve null exit/SIGTERM/timedOut
true/timeoutSource deadline, write both reports, and leave no live PID. A
distinct real external abort after the same ready handshake must return 130,
preserve null exit/SIGTERM/timedOut false/timeoutSource null plus the abort
reason in JSON and human text, write both reports, and leave no live PID. Empty entry
files, fixed-zero exits, or logic that never invokes the orchestrator cannot
satisfy these contracts. A 30 second test-side child watchdog only prevents a
hang and is not asserted as behavior.

The atomic writer produces exactly quality-gate-report.json and
quality-gate-summary.txt. JSON reproduces the typed report. Human text includes
run ID, outcome, stages, and failure evidence. Unique temp files are renamed
and cleaned; repeated/concurrent writes leave one coherent pair and no temp
residue. Invalid report directory fails stably without overwriting it.

## Recorded inventory and pre-repair result

- publicSurface.contract.test.ts: 3 tests, recorded 1 green and 2 red.
- orchestratorPlan.contract.test.ts: 7 tests, recorded 7 red.
- orchestratorExecution.contract.test.ts: 15 tests, recorded 15 red.
- processRunner.contract.test.ts: 8 tests, recorded 8 red.
- manifestValidation.contract.test.ts: 126 tests, recorded 126 red.
- reportWriter.contract.test.ts: 8 tests, recorded 8 red.
- cliAndEntry.contract.test.ts: 20 tests, recorded 19 red and 1 independent
  junction-lifecycle control green.
- realCliChild.contract.test.ts: 36 tests, recorded 36 red.
- iosStaticAudit.contract.test.ts: 10 tests, recorded 10 red.

The exact Revision6 pre-repair command discovered 9 suites and 233 tests: 231
expected contract failures and two independent controls green. Thirty-six
real-CLI failures are caused by the deliberately absent production cli.cjs;
194 failures are caused by absent index.cjs or index.d.ts, and the package
entrypoint contract is red because production scripts are deliberately not yet
installed. The two green controls are the independent SHA/fixture vector and
the real junction create/access/injected-reject/finally-cleanup lifecycle.
There was no V2 source type error, unrelated test import error, fixture or
permission error, snapshot, timeout, or open-handle warning. Jest exited 1
because the expected-red candidate correctly rejects the absent implementation.

There is one typed helper, one V2-local declaration file, two executable child
fixtures, and one semantic iOS fixture generator. Candidate source uses no
focus/skip/todo/pending, snapshot oracle, production module replacement, fake
timer, TypeScript suppression, as-any, as-unknown, or explicit any. It uses no
shell, network, or business wall-clock oracle. A source scan reported zero
forbidden or cross-project hits.

## Executed verification record

From outputs/start-five with pinned Node/pnpm:

1. pnpm exec jest --runInBand --ci --coverage=false --detectOpenHandles
   --roots tests/quality-gate-v2
2. pnpm exec jest --runInBand --ci --coverage=false --roots tests/gap-p0-02b
3. pnpm exec jest --runInBand --ci --coverage=false --roots tests/gap-p0-02a
4. pnpm exec jest --runInBand --ci --coverage=false --roots tests/locked
   tests/review1 tests/review2 tests/review3 tests/review4 tests/phase4
   tests/phase4-review tests/phase4-review2 tests/phase4-review3
   tests/phase4-review4 tests/phase4-review5 tests/native-scaffold
   tests/native-review tests/gap-p0-01a tests/gap-p0-02a
5. pnpm exec tsc --noEmit

Recorded on 2026-08-06 with pinned local Node/pnpm:

- V2 Revision6: 9 suites/233 tests, 231 expected red and 2 controls green, with
  --detectOpenHandles and no open-handle warning.
- Frozen 02B: 11 suites/252 tests green.
- Frozen 02A: 4 suites/13 tests green.
- Formal accepted baseline: 57 suites/353 tests green.
- Global pnpm exec tsc --noEmit: exit 0 with zero diagnostics.
- Direct child and recorder controls preserved argv containing spaces,
  ampersand, pipe, caret, semicolon, and Unicode; recorder argv/cwd/environment
  records were exact, and both executable fixtures passed Node syntax checks.
  Bootstrap and ambient secret values are observable by the recorder control,
  so the real CLI contract must strip both before spawning it. The ready-PID
  holding child closed under SIGTERM and the independent PID-status probe
  reported terminated.
- Stable-lock audit: 16 accepted manifests/101 entries, zero missing, malformed,
  or SHA mismatch; every manifest self matched its previously accepted identity.
- The rejected QUALITY_GATE identity, active product candidates, and V2 itself
  were excluded from the accepted baseline audit.

## Candidate signing and review boundary

QUALITY_GATE_V2_LOCK.sha256 contains the specification first, followed by every
V2 test asset in canonical POSIX order. It has no self entry. Its external
SHA-256 is the candidate self identity reported in the changelog and Manager
handoff.

The first six signed candidates failed review and all six selfs remain revoked
history. Revision6 is signed only by the external manifest self recorded in the
changelog; that identity is deliberately absent from locked assets to avoid a
self-hash cycle. It grants no production authority until a seventh brand-new
independent test reviewer accepts all corrections, semantics, real-red
legitimacy, identity, regressions, bootstrap entry-environment trust, registry
top-level structure, explicit and implicit authoritative CLI registry
selection, junction lifecycle evidence, and rejected-lock exclusion.
