# Quality Gate V2 Review4 Test Specification

## Status and independence

This is a new test-first review generation authored independently from the Quality Gate V2 production implementation and its code reviewers. It does not authorize production changes until the complete candidate is independently reviewed and accepted.

The Review3 candidate whose external manifest identity begins with `80e449` is historical evidence only and is **REVIEW FAILED / NEVER ACCEPTED**. Its nine locked assets must remain byte-identical. Review4 is a separate specification, test root, changelog, and candidate manifest.

## Confirmed defect

The shipped resolver does not prove that the final executable JavaScript companion is a direct child of the shipped `scripts/quality-gate-v2/cli.cjs` process. A path may resolve through an unsafe intermediate Node process while preserving otherwise plausible executable, hash, and recorder evidence. The current production `scripts/quality-gate-v2/index.cjs` identity beginning with `0d6b5c` contains no adequate resolver for this process-lineage invariant.

Direct-file reparse aliases are also an unresolved trust boundary. On Windows, a same-volume file hard link can reproduce an existing WindowsApps-style file reparse point. Any candidate resolution that reaches a reparse alias of a pnpm wrapper, `pnpm.cjs`, `pnpm.mjs`, Node executable, or another executable file must fail closed before any untrusted child, recorder, report, or temporary report artifact is created. A normal non-reparse hard link remains an allowed control. Existing PATH-directory junction rejection remains mandatory.

## Locked Review4 requirements

### R4-001 — direct shipped-CLI lineage oracle

1. The test launches the shipped `scripts/quality-gate-v2/cli.cjs` in a real Jest parent process and records the returned CLI PID.
2. The final JavaScript companion records its own PID and direct parent PID through a test-owned recorder channel.
3. The positive control requires `companion.ppid === cliPid` and proves the final companion ran exactly once: the append-only JSONL recorder must contain exactly one complete record, its PID/PPID/argv identities must be unique, and the entire shipped-CLI stdout must exactly equal one complete stable companion JSON event line followed by the deterministic accepted lock-summary JSON. Prefix matching and unvalidated extra output are forbidden.
4. A negative-control fixture implements a fake CLI A that launches an intermediate Node process B, which launches companion C. The same oracle must reject this two-hop lineage even if C otherwise emits syntactically valid recorder evidence.
5. The oracle must use runtime-created values only. Absolute machine paths, real PIDs, usernames, and volatile timestamps must not enter the locked specification, source fixtures, changelog identity fields, or candidate manifest.

### R4-002 — direct-file reparse fail-closed matrix

The real shipped CLI must reject each reachable direct-file reparse candidate for:

- a pnpm command wrapper;
- the `pnpm.cjs` companion;
- the `pnpm.mjs` companion;
- the selected Node executable;
- a generic executable-file candidate.

Each unsafe fixture must be constructed from an existing file reparse point by a same-volume `fs.linkSync` operation, verified with `lstat`, and removed by the test fixture. A high-priority unsafe candidate followed by a lower-priority valid candidate must still reject instead of falling through to the valid candidate.

All unsafe cases must fail before any child or recorder invocation and before either canonical report or any temporary report artifact is created. Unsafe real-CLI cases preload an opt-in test-owned child-creation guard that covers every ordinary Node child API. A separate constant ready marker proves the guard was loaded; an attempted child writes only a constant external attempt marker and is blocked before the alias can execute, while a correct preflight leaves that attempt marker absent. Exact stable diagnostics are the error code alone; the entire stderr or error message must equal that code, with zero temporary-root, absolute-path, PID, or PPID content.

### R4-003 — safe controls and preservation

1. A normal same-volume hard link whose source and destination are ordinary regular files is accepted when every other trust invariant is valid.
2. A PATH directory junction remains rejected before child execution and report creation.
3. Existing Review3 behavior remains covered by a compatibility matrix without importing, modifying, or executing the failed Review3 root as authority.
4. Production code, package scripts, accepted locks, registry entries, generated reports, and every Review3 locked asset remain unchanged during Review4 test authoring.

## Test design constraints

- Windows-only filesystem behavior is exercised directly; there are no skip/focus/todo/pending modifiers.
- Tests use only local processes and test-owned temporary directories. No network, install, emulator, Gradle build, CocoaPods, Xcode, or product-data mutation is permitted.
- The child-creation guard is enabled only inside unsafe shipped-CLI subprocesses through runtime-built environment values. It never mutates the Jest parent environment and never persists attempted executable names, arguments, paths, or process identities.
- Fixtures clean only their own resolved temporary paths.
- No timer sleeps or timing-dependent success oracle is allowed. Process completion and recorder evidence are synchronized by explicit exit/IPC/file-state boundaries.
- No TypeScript suppression, explicit `any`, snapshot oracle, mutable accepted test, or production source edit is allowed.
- A missing Windows reparse prerequisite is a deterministic test failure, not a skip.

## Expected test-first state

Before production repair, all independent helper/fixture controls must pass and every requirement that depends on the missing resolver or fail-closed reparse enforcement must fail for the precise reason specified above. The candidate must have no open-handle warning and zero snapshots.

After production repair, Review4 must be green together with:

- the immutable Review3 nine-asset compatibility matrix;
- the formal 15-root baseline: 57 suites / 354 tests;
- accepted Quality Gate V2: 9 suites / 233 tests;
- Native Scaffold: 6 suites / 30 tests;
- GAP-P0-02A: 4 suites / 13 tests;
- GAP-P0-02B: 11 suites / 252 tests;
- registry aggregate: 839 tests under the manager-specified accepted roots;
- global `tsc --noEmit` with zero diagnostics;
- all applicable accepted manifests and the Review4 candidate manifest with zero drift.

## Candidate and review boundary

`QUALITY_GATE_V2_REVIEW4_LOCK.sha256.candidate` is generated last with this specification first and every regular file under `tests/quality-gate-v2-review4/` in canonical POSIX order. It excludes itself and the lock-excluded changelog. The candidate grants no production authority until a completely fresh independent reviewer verifies semantics, real-red legitimacy, identity, determinism, hostile controls, regressions, and the unchanged Review3 assets.
