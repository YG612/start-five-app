# Native final-review locked-test specification

## Status, scope, and immutability

Status: **CANDIDATE, pending a brand-new independent test review.** This is the test-first contract for the remaining iOS shared-scheme target-graph finding: `StartFive.xcscheme` contains a `StartFiveTests` `TestableReference` whose `BlueprintIdentifier` does not resolve to any real `PBXNativeTarget` in `project.pbxproj`.

This candidate adds only this specification, `tests/native-review/**`, and `NATIVE_REVIEW_LOCK.sha256`. It does not modify the Xcode project or scheme, Android files, application/production source, package or tool configuration, any earlier test/specification/manifest, or the separate `qingji-ai` project.

After an independent test reviewer accepts the candidate, this specification and every regular file recursively below `tests/native-review/` are immutable. A repair agent may change only the native production project. It must not edit, regenerate, skip, focus, weaken, replace, or selectively omit these tests.

## Production-facing contract

For every regular `*.xcscheme` below `ios/StartFive.xcodeproj/xcshareddata/xcschemes`:

1. Every structural `BuildableReference`, including every reference nested below a `TestableReference`, has the required `BlueprintIdentifier`, `BlueprintName`, `BuildableName`, and `ReferencedContainer` attributes.
2. `BlueprintIdentifier` resolves through the parsed `objects` dictionary in `ios/StartFive.xcodeproj/project.pbxproj` to a real `PBXNativeTarget`; pointing at a missing identifier, a different PBX object type, or a native target omitted from `PBXProject.targets` is invalid.
3. `BlueprintName` exactly matches the resolved native target's `name`.
4. `BuildableName` exactly matches the resolved target's product file. The target's `productReference` must exist, resolve to a PBX object whose `isa` is exactly `PBXFileReference`, and expose `path` or `name`; only then may the graph compare the referenced product name. A missing reference/object/type/name or a reference to any other PBX object type is a stable graph issue.
5. `ReferencedContainer` is exactly `container:StartFive.xcodeproj`.
6. A populated `TestableReference` owns exactly one `BuildableReference`, and its resolved target has an Apple unit-test or UI-test product type. An empty `<Testables>` collection, or absence of testables, is legal.
7. The one canonical `StartFive` application target remains a real `PBXNativeTarget` in `PBXProject.targets`, with product `StartFive.app`.
8. `LaunchAction` and `ProfileAction` each refer to that exact application target. `ArchiveAction` uses `Release`, and the scheme has exactly one `BuildActionEntry` for the same application target with `buildForArchiving="YES"`. Xcode schemes do not place a `BuildableReference` directly inside `ArchiveAction`, so the locked archive route is the structural link through its archive-enabled build entry.

The contract does not prescribe the repair. A minimal conforming repair may delete the invalid `TestableReference` or leave `Testables` empty because no iOS test target exists. A future implementation may instead add a complete real `StartFiveTests` target and product to the PBX object graph. Either path must satisfy the same target-resolution contract.

## Structural parsing and false-green resistance

`tests/native-review/fixtures/xcodeTargetGraph.ts` is locked test-only infrastructure. It does not import or implement native production behavior.

- The PBX reader tokenizes and parses the OpenStep property-list grammar into dictionaries and arrays. It skips line/block comments and treats quoted text as data, so a target name in a comment or string cannot produce a false PBX object.
- The scheme reader constructs an XML element/attribute tree and walks real descendants. It does not discover targets with a text search or a regular expression over comments.
- Both parsers accept LF and CRLF input and an optional UTF-8 BOM.
- The helper resolves object identity, project membership, target type, product-reference existence and exact `PBXFileReference` type, product-file name, action ancestry, and testable ancestry before reporting a graph result. It emits distinct stable issues for a missing `productReference`, a missing referenced object, missing `isa`, wrong `isa`, and a product file with neither `path` nor `name`.
- Fixture self-tests prove a legal app-plus-test graph, a truly missing/orphan blueprint identifier, a blueprint identifier that points to an existing non-target PBX object, mismatched blueprint/product names, misuse of an application target as a testable, and a `TestableReference` with no buildable child. Three additional anti-false-green fixtures point the test target's `productReference` at a same-name/same-path `PBXGroup`, at a same-name object with no `isa`, and at an absent PBX object; all must be rejected even though untyped name matching alone would appear valid.

The tests use only synchronous reads of repository files. They create no timer, network request, child process, watcher, platform handle, snapshot, or generated native artifact. No test is skipped, focused, pending, or conditional on Xcode/macOS availability. This is a Windows-compatible static graph audit; it does not claim to build or execute iOS code.

## Locked coverage and counts

| Suite | Tests | Primary coverage |
|---|---:|---|
| `tests/native-review/iosSchemeTargetGraph.contract.test.ts` | 3 | canonical PBX app graph; exhaustive shared-scheme reference resolution; Launch/Profile/Archive positive route |
| `tests/native-review/fixtures/xcodeTargetGraph.invariant.test.ts` | 9 | CRLF/comment-safe legal graph; blueprint orphan/wrong-object/name/target/testable controls; same-name PBXGroup, missing-isa, and missing-product-object controls |

The candidate contains **2 suites / 12 tests**, plus one locked helper file.

## Recorded pre-fix baseline

Recorded on 2026-08-05 against the current isolated `start-five` native candidate, before any scheme repair:

- complete `tests/native-review` run: **2 suites executed / 12 tests discovered; 1 failed and 11 passed**;
- the sole red test is the exhaustive real-project graph contract: `TestAction/TestableReference` uses `BlueprintIdentifier` `00E356ED1AD99517003FC87E`, which is absent from the PBX objects and therefore cannot resolve to a `PBXNativeTarget`;
- the canonical PBX application graph and the separate Launch/Profile/Archive route test are green;
- all nine helper invariant tests are green, including legal, orphan/wrong-object blueprint identifiers and all three adversarial `productReference` fixtures;
- the same complete run with `--detectOpenHandles` reports the identical **1 red / 11 green** result, exits normally after reporting the expected assertion failure, and emits no open-handle warning;
- the predecessor native scaffold baseline remains **6 suites / 29 tests green**;
- the eight established formal data/application roots remain **28 suites / 253 tests green**;
- `tsc --noEmit` is green with this candidate included.

The one red result is production/native-project defect evidence, not a harness failure. The eleven green results are deliberate parser, product-reference, project, and action-route controls.

## Predecessor lock baseline

The candidate supplements rather than replaces earlier contracts. At authoring time these predecessor manifests verify with no listed-file drift; their manifest-file identities are:

| Manifest | Manifest SHA-256 |
|---|---|
| `TEST_LOCK.sha256` | `9cce965ce8632b5c9acdca84a3c8ea02d4fac1b923bfd9fb8822fb221b4403ca` |
| `REVIEW1_LOCK.sha256` | `5261ee58167e31dd1677f533eaee570b8dd1ef1d8c1ccf21eb7581f8ee7f7a43` |
| `REVIEW2_LOCK.sha256` | `3f955e92d533566247b076187f79a7bbf5f3ad8359e2eb780a64e4e66aa8fd1b` |
| `REVIEW3_LOCK.sha256` | `e0611feac1b3da1c1813bab2928aba1196fb2399003e52fec8434dde60f79349` |
| `PHASE4_LOCK.sha256` | `f407914c3aedf3f04d0bdb826d11379c27b283bbf4e1d3e8c7ee2075481a30dd` |
| `PHASE4_REVIEW_LOCK.sha256` | `b19863c03008600e5d85658c878ef2d3c8473b01a8c27653df4c9521abdbef4a` |
| `REVIEW4_LOCK.sha256` | `99e7f7566d2cff0c10e595d1952f361ab428c13b5014a98a65feebb73eb50040` |
| `PHASE4_REVIEW2_LOCK.sha256` | `e73b7e1d9a0de3d8c85ed936028abf3d7b984d682e531e476d0f173247161ebb` |
| `NATIVE_SCAFFOLD_LOCK.sha256` | `debe5b370a4e8b8988a26d6ac69f77c0823c10ac472e4e054aa939094f49b690` |

Concurrently authored candidate locks are not silently promoted to accepted predecessors by this specification. They are reviewed and frozen through their own workflows.

## Repair acceptance

No repair agent receives this candidate until a brand-new independent test reviewer approves its scope, structural parsing, fixture self-proof, implementability, deterministic teardown, predecessor consistency, and manifest.

After that gate, repair acceptance requires all of the following without changing this lock:

1. Native final review is 2 suites / 12 tests green.
2. Native scaffold remains 6 suites / 29 tests green.
3. The eight established formal roots remain 28 suites / 253 tests green.
4. The relevant unified run is green and `tsc --noEmit` remains green.
5. Every accepted predecessor manifest and `NATIVE_REVIEW_LOCK.sha256` verifies with zero drift.
6. A brand-new independent code reviewer, with no overlap with this test author or the native repair agent, approves the exact scheme change and all evidence.

Any repair failure returns to a native repair agent and then repeats the complete independent review. Tests remain locked.

## Canonical commands

From the `outputs/start-five` project root with the project's pinned Node/pnpm runtime on `PATH`:

```powershell
pnpm exec jest --runInBand --ci --coverage=false --roots tests/native-review
pnpm exec jest --runInBand --ci --coverage=false --detectOpenHandles --roots tests/native-review
pnpm exec jest --runInBand --ci --coverage=false --roots tests/native-scaffold
pnpm exec jest --runInBand --ci --coverage=false --roots tests/locked tests/review1 tests/review2 tests/review3 tests/phase4 tests/phase4-review tests/review4 tests/phase4-review2
pnpm exec jest --runInBand --ci --coverage=false --roots tests/native-scaffold tests/native-review
pnpm exec tsc --noEmit
```

## Lock construction and verification

`NATIVE_REVIEW_LOCK.sha256` is generated last. It lists this specification first, followed by every regular file recursively below `tests/native-review/`, sorted by POSIX-style relative path. The manifest does not include itself.

Each line is exactly:

```text
<lowercase SHA-256><two spaces><POSIX relative path>
```

Verification recomputes SHA-256 for every listed path and compares it with the first field. The manifest's own independent identity is the lowercase SHA-256 of `NATIVE_REVIEW_LOCK.sha256`. Any mismatch is lock drift and blocks repair or delivery.
