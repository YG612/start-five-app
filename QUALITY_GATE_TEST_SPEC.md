# Quality-command and test-lock verifier specification

## Status and scope

Status: **CANDIDATE, pending independent test review.** This test-first lock closes the false-green delivery path in which the package's default `test` command follows `jest.config.js` and therefore executes only `tests/locked`, while accepted Review and Phase-4 suites remain invisible.

This candidate adds this specification and test-only files below `tests/quality-gate/` only. It does not change production code, `package.json`, Jest/TypeScript/Babel configuration, dependencies, scripts, native scaffold candidates, any earlier specification/test/manifest, or the separate `qingji-ai` project. `QUALITY_GATE_LOCK.sha256` is generated last and freezes the candidate before any command/verifier implementation is dispatched.

The accepted test baseline at authoring time is exactly:

- `TEST_LOCK.sha256`;
- `REVIEW1_LOCK.sha256`, `REVIEW2_LOCK.sha256`, `REVIEW3_LOCK.sha256`, and `REVIEW4_LOCK.sha256`;
- `PHASE4_LOCK.sha256` and `PHASE4_REVIEW_LOCK.sha256`.

`NATIVE_SCAFFOLD_LOCK.sha256` remains a candidate with expected-red tests and is deliberately outside the formal quality run.

## Package quality-command contract

### Default entry and fail-fast propagation

The package's mandatory `test` entry resolves through zero or more package-script aliases to one complete quality pipeline. The resolved terminal stages are exactly these responsibilities:

1. one Jest unit/regression run;
2. one TypeScript `tsc --noEmit` run;
3. one invocation of `scripts/verifyTestLocks.cjs`.

The same three-stage pipeline must also be independently addressable through a non-`test` package script, and each responsibility must have an independently executable single-responsibility package-script entry. Script names other than the mandatory `test` entry are not prescribed. Aliases may use `pnpm`, `npm`, or `yarn` package-script syntax.

Every composed stage uses fail-fast `&&`. Newlines, semicolons, pipes, `||`, and background/single-ampersand composition are rejected because they can hide or detach a non-zero exit. Cycles and missing script aliases are rejected. These structural assertions prove non-zero propagation without recursively launching a package manager from inside Jest.

### Exact unit-test domain

The one resolved Jest terminal explicitly names, in any command order, exactly these POSIX-normalized roots:

- `tests/locked`;
- `tests/review1`;
- `tests/review2`;
- `tests/review3`;
- `tests/review4`;
- `tests/phase4`;
- `tests/phase4-review`;
- `tests/quality-gate` (this gate protects its own command contract once accepted).

The command must not include `tests/native-scaffold`. Relying on the current default Jest root is not sufficient. The unit command uses `--runInBand`, `--ci`, and `--coverage=false`; the typecheck terminal uses `--noEmit`.

The quality graph is local and Windows-compatible. It contains no shell-only environment/export syntax, Bash dependency, `/dev` path, network/install/download command, dependency addition, cache clearing, snapshot/test rewrite option, output redirection, or destructive deletion stage.

## Test-lock verifier contract

The implementation target is the local, dependency-free CommonJS module `scripts/verifyTestLocks.cjs`. It exposes this stable, testable surface:

- `FORMAL_LOCK_FILES`: exactly the eight sorted names `PHASE4_LOCK.sha256`, `PHASE4_REVIEW_LOCK.sha256`, `QUALITY_GATE_LOCK.sha256`, `REVIEW1_LOCK.sha256`, `REVIEW2_LOCK.sha256`, `REVIEW3_LOCK.sha256`, `REVIEW4_LOCK.sha256`, and `TEST_LOCK.sha256`;
- `verifyManifest(rootDir, manifestPath)`: returns `{ok: boolean, errors: string[]}` without mutating files;
- `verifyAllLocks(rootDir)`: verifies exactly `FORMAL_LOCK_FILES` and returns the same result shape.

The CLI defaults to the project root/current formal set. Test-only black-box selection is supported with `--root <directory>` and repeatable `--lock <relative-manifest>`. A successful selection exits zero; any parse, path, existence, or hash error exits non-zero. This is exercised only with temporary fixture directories, never by corrupting or rewriting a real lock.

### Canonical manifest rules

Every non-empty logical record is exactly:

```text
<64 lowercase hexadecimal SHA-256 characters><two spaces><POSIX relative path>
```

The verifier:

- hashes and compares every listed regular file;
- rejects missing files and mismatches;
- rejects uppercase/short hashes, one or three separator spaces, blank records, and backslash paths;
- rejects duplicate paths;
- rejects POSIX absolute paths, Windows drive-absolute paths, UNC-like paths, and any `..` traversal that can escape the supplied root;
- requires strict ascending POSIX relative-path order;
- verifies only entries declared by the formal manifests. The manifest cannot hash itself, and changelogs are not implicitly added to the hash domain;
- does not auto-discover or validate the native candidate as a formal lock.

## Locked coverage

The candidate contains **2 suites / 24 tests**:

- `tests/quality-gate/packageQualityScripts.contract.test.ts`: 5 structural package-command tests covering the complete default/dedicated pipeline, exact formal roots and native exclusion, standalone responsibilities, deterministic flags/Windows compatibility, and local non-mutating operation;
- `tests/quality-gate/testLockVerifier.contract.test.ts`: 19 pure/black-box verifier tests covering the exact formal set and current locks, one legal manifest, missing/mismatched files, six bad record formats, duplication, five absolute/traversal variants, ordering, and both CLI exit directions;
- `tests/quality-gate/qualityCommandContract.ts`: locked test-only script resolver/classifier and canonical expected sets. It executes no command and performs no I/O.

No quality-gate Jest test invokes `pnpm`, `npm`, `yarn`, Jest, TypeScript, or the default quality pipeline. Package scripts are parsed structurally; verifier behavior uses pure calls and direct Node CLI subprocesses against isolated OS-temporary fixtures. This avoids recursive Jest execution and keeps the baseline deterministic.

## Recorded pre-fix baseline

Recorded on 2026-08-04 before creating `QUALITY_GATE_LOCK.sha256` and before any package/verifier repair:

- `tests/quality-gate`: **2 suites executed / 24 tests discovered; 23 failed and 1 passed**;
- all 19 verifier tests fail at the missing `scripts/verifyTestLocks.cjs` precondition, including both CLI cases, so a generic missing-module exit cannot create a false green;
- four package-command tests fail because default `test` is bare `jest`, has no explicit accepted roots/CI flags, does not run typecheck/lock verification, and has no independent lock responsibility;
- the one green control confirms the existing bare `jest` command itself contains no network, cache-clearing, rewrite, redirection, or destructive token;
- failures are finite contract assertions: there is no recursive package-manager/Jest invocation, real-time wait, network access, timeout, open handle, unhandled rejection, or real-lock mutation;
- `tsc --noEmit` passes with the candidate present;
- all accepted earlier tests remain **24 suites / 218 tests green**;
- all seven accepted earlier manifests verify with zero drift. Their manifest identities are:
  - `TEST_LOCK.sha256`: `9cce965ce8632b5c9acdca84a3c8ea02d4fac1b923bfd9fb8822fb221b4403ca`;
  - `REVIEW1_LOCK.sha256`: `5261ee58167e31dd1677f533eaee570b8dd1ef1d8c1ccf21eb7581f8ee7f7a43`;
  - `REVIEW2_LOCK.sha256`: `3f955e92d533566247b076187f79a7bbf5f3ad8359e2eb780a64e4e66aa8fd1b`;
  - `REVIEW3_LOCK.sha256`: `e0611feac1b3da1c1813bab2928aba1196fb2399003e52fec8434dde60f79349`;
  - `REVIEW4_LOCK.sha256`: `99e7f7566d2cff0c10e595d1952f361ab428c13b5014a98a65feebb73eb50040`;
  - `PHASE4_LOCK.sha256`: `c29a737da1e8cd431c3b462246d8638e3ed1c036dcacdb503f47168739823fb9`;
  - `PHASE4_REVIEW_LOCK.sha256`: `da5b2632ed84fb4593e4b1f50b1adb6a599694b00d3308992bd3ebaea2e79eb2`.

## Repair and delivery acceptance

After this candidate passes independent test review and is frozen, implementation acceptance requires all of the following:

1. The quality-gate candidate is 2 suites / 24 tests green without modifying its locked files.
2. The explicit accepted baseline remains 24 suites / 218 tests green.
3. The unified unit run, now including this gate, is 26 suites / 242 tests green and still excludes the native candidate.
4. `pnpm test` completes the unit run, `tsc --noEmit`, and formal lock verification; an independently executed failure-injection/audit confirms no stage's non-zero exit can be swallowed.
5. Each responsibility is separately invocable, local, finite, Windows-compatible, and non-mutating.
6. All eight formal manifests, including `QUALITY_GATE_LOCK.sha256`, verify with zero drift.
7. A fresh reviewer with no overlap with the test author or implementation agent approves the tests, implementation, command evidence, and lock evidence.

## Canonical authoring commands

From the isolated `outputs/start-five` root with the pinned local Node/pnpm runtime on `PATH`:

```powershell
pnpm exec tsc --noEmit
pnpm exec jest --runInBand --ci --coverage=false --roots tests/quality-gate
pnpm exec jest --runInBand --ci --coverage=false --roots tests/locked tests/review1 tests/review2 tests/review3 tests/review4 tests/phase4 tests/phase4-review
```

## Lock construction

`QUALITY_GATE_LOCK.sha256` is generated last. It lists this specification followed by every regular file recursively below `tests/quality-gate/`, sorted by POSIX-style relative path. The manifest does not include itself.

Each line is exactly the canonical lowercase SHA-256, two spaces, and POSIX relative path. After generation, the specification, helper, and tests are immutable throughout implementation and review. The manifest's independent identity is the lowercase SHA-256 of `QUALITY_GATE_LOCK.sha256`.

