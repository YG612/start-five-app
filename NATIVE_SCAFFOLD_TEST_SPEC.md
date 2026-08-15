# Start Five native scaffold controlled Quality Gate integration amendment REVISION 2 candidate

## Status and revision boundary

Status: **CONTROLLED CONSISTENCY AMENDMENT REVISION 2 CANDIDATE, PENDING INDEPENDENT REVIEW.** The accepted native predecessor is the eight-entry `NATIVE_SCAFFOLD_LOCK.sha256` whose file SHA-256 is `a43d0902a45b5b33be8b5336e0701a5b2cd7e63c494f38cd5f4db46a5f2d6e7b`. It remains the formal native lock until this narrowly scoped replacement is independently reviewed and accepted. The immediately preceding candidate `d37d22bc4d512d08db9212a75c449fc8c1f1e2e24e8550f32418cdbfff2b4449` is **REVIEW FAILED / NEVER ACCEPTED**: its exact-path exemption was correct, but its extension filter failed to scan non-canonical Quality Gate `.txt` artifacts even when content detection had already found an absolute workspace or `outputs/` path. Earlier rejected native candidates likewise remain historical evidence only and must never be used for implementation.

Two contradictions were independently confirmed. First, NS-002 in the accepted predecessor froze the package default `scripts.test` as bare `jest`, while the independently accepted Quality Gate V2 contract requires the default entry to traverse its mandatory lock, inventory, integrity, and evidence preflights; the correct product value already present in `package.json` is retained. Second, an actual Quality Gate run writes two canonical evidence files whose diagnostic content necessarily contains the project path, but NS-005 treated that evidence as a cross-project isolation finding. The safe correction exempts only the two exact, case-sensitive, root POSIX relative paths `quality-reports/quality-gate-report.json` and `quality-reports/quality-gate-summary.txt`; it does not ignore their directory or relax content detection anywhere else.

This amendment changes only this specification, `tests/native-scaffold/toolchainConfig.contract.test.ts`, and `tests/native-scaffold/isolationAndPreservation.contract.test.ts`; it appends excluded audit evidence to `NATIVE_SCAFFOLD_LOCK_CHANGELOG.md` and emits a separate `NATIVE_SCAFFOLD_LOCK.sha256.candidate`. The formal `NATIVE_SCAFFOLD_LOCK.sha256`, the Quality Gate V2 specification/tests/manifest/bootstrap/registry, the other five native locked files, every production/native/package/configuration/dependency asset, and the separate bookkeeping project remain byte-identical.

After a fresh independent reviewer accepts the candidate manifest, its bytes may replace the formal native manifest through a separately controlled signing step; until then the candidate is not an implementation authority. Once accepted, this specification and every regular file under `tests/native-scaffold/` are immutable. The native contract supplements the seven formal generations below; it never replaces or weakens them:

| Formal manifest | Entries | Manifest SHA-256 |
|---|---:|---|
| `TEST_LOCK.sha256` | 13 | `9cce965ce8632b5c9acdca84a3c8ea02d4fac1b923bfd9fb8822fb221b4403ca` |
| `REVIEW1_LOCK.sha256` | 5 | `5261ee58167e31dd1677f533eaee570b8dd1ef1d8c1ccf21eb7581f8ee7f7a43` |
| `REVIEW2_LOCK.sha256` | 3 | `3f955e92d533566247b076187f79a7bbf5f3ad8359e2eb780a64e4e66aa8fd1b` |
| `REVIEW3_LOCK.sha256` | 3 | `e0611feac1b3da1c1813bab2928aba1196fb2399003e52fec8434dde60f79349` |
| `REVIEW4_LOCK.sha256` | 4 | `99e7f7566d2cff0c10e595d1952f361ab428c13b5014a98a65feebb73eb50040` |
| `PHASE4_LOCK.sha256` | 5 | `f407914c3aedf3f04d0bdb826d11379c27b283bbf4e1d3e8c7ee2075481a30dd` |
| `PHASE4_REVIEW_LOCK.sha256` | 5 | `b19863c03008600e5d85658c878ef2d3c8473b01a8c27653df4c9521abdbef4a` |

`PHASE4_REVIEW2_LOCK.sha256` and `QUALITY_GATE_LOCK.sha256` remain candidate generations and are deliberately excluded from this formal preservation set.

## Test-first scope

This stage adds only an independent React Native 0.86 application entry and Android/iOS native scaffold around the already accepted Start Five core, durable persistence adapter, and `createStartFiveApp` composition root. Tests are authored and reviewed before scaffold generation, dependency installation, native build, or package merge.

The tests execute on Windows with Node/Jest. They do not require network access, an Android SDK invocation, an emulator, a phone, CocoaPods, Xcode, or macOS. iOS acceptance in this stage is explicitly static; an actual iOS compile remains a later macOS-only gate.

The implementation stage must merge an official RN 0.86-compatible scaffold directly into the existing `start-five` root. It must not nest a seed project, overwrite any accepted source/test/specification, or copy/reference the separate bookkeeping application.

## Review-driven corrections

The candidate retains all prior review-driven corrections and adds three narrowly scoped consistency corrections:

1. Phase 4 composition/persistence source sentinels and all seven formally accepted lock generations are protected together; the independently approved temporal-consistency replacements for Phase 4 and Phase 4 Review are used.
2. `App.tsx` is executed with isolated modules. It must reuse the accepted `createStartFiveApp`, inject the canonical React Native AsyncStorage backend seam, compose once, and stay stable across rerender. A default export may be a function, class, `memo`, or another valid React component type.
3. `index.js` is executed with a mocked `AppRegistry`. Its first registration argument must be strictly `app.json.name`, and its factory must return the default `App` object.
4. Every existing script/dependency/devDependency value is protected, including Babel core, Jest/React types, `babel-jest`, and `react-test-renderer`. The reviewed durable provider is a real direct dependency and its root pnpm importer entry, resolved version, and SHA-512 package integrity must agree. Arbitrary file/git/latest/workspace providers are not accepted.
5. Xcode objects retain their object IDs and are resolved through `PBXProject.targets` → the unique Start Five `PBXNativeTarget` → `buildConfigurationList` → `XCConfigurationList.buildConfigurations` → the referenced Debug/Release `XCBuildConfiguration` objects. Orphan bundle configurations and a Start Five target not referenced by the project are rejected. Orientation arrays parse every child and reject any non-`string` element.
6. Android credential scanning includes `google-services.json`, dotenv, JSON, YAML, Gradle, properties, and source forms. Groovy/Kotlin DSL release blocks may not reference debug signing through property/index access, `getByName`, `findByName`, `named(...).get()`, `named`, or equivalent covered calls; matching ignores comments and string literals. `distributionUrl` is parsed as an HTTPS URL whose host/path are exactly the Gradle 9.3.1 distribution.
7. Isolation scanning includes YAML, lock, C/C++, headers, and podspecs plus Windows/UNC and common Unix workspace absolute paths. Tests and generated/vendor trees are excluded so assertion text cannot self-trigger. `requireDirectory` verifies `isDirectory()`. Helper invariants exercise pnpm parsing, nested/comment/string-safe brace parsing, PBX object parsing, directory checks, and plist arrays.
8. The isolated `AppRoot` test double returns `null`, a valid React render result, so the test exercises composition and rerender stability without introducing an illegal React Native bare-text host child.
9. Android bootstrap follows the official React Native 0.86 template: `MainApplication` implements `ReactApplication`, exposes a lazy `ReactHost`, invokes `getDefaultReactHost` with `applicationContext` and `PackageList(this).packages`, and calls `loadReactNative(this)`. Structural checks operate on executable source with comments and string literals masked, so comments cannot satisfy the contract.
10. The preservation sentinel includes formal Review 4 plus the independently approved Phase 4 and Phase 4 Review lock replacements. Later Phase 4 Review 2 and quality-gate candidate locks are intentionally not promoted by this amendment.
11. The default package test path is the accepted Quality Gate V2 entry, not bare Jest: `scripts.test` is exactly `node scripts/quality-gate-v2/cli.cjs test`, and `scripts.quality:gate` is exactly `node scripts/quality-gate-v2/cli.cjs full`. Neither command may be replaced by an environment-dependent branch. The pre-existing locked-test and typecheck commands and the React Native start/Android/iOS commands remain exact; no `test:unit` escape hatch is added.
12. Quality Gate evidence is not mistaken for foreign-project contamination. Only `quality-reports/quality-gate-report.json` and `quality-reports/quality-gate-summary.txt`, expressed exactly as root POSIX relative paths with matching case, are canonical generated evidence. The directory remains traversed. Within the path family whose first POSIX segment case-insensitively equals `quality-reports`, `.txt`/`.TXT` and existing scanned-extension case variants are scan candidates; a summary artifact moved outside its one canonical path is also scanned. Thus unexpected JSON/YAML/TypeScript/text files, `archive/quality-gate-summary.txt`, nesting elsewhere, backslash or `./` spellings, and case variants still produce findings for Windows/UNC, Unix workspace, or another `outputs/` path content. Unrelated ordinary `.txt` files outside this narrow Quality Gate scope retain the predecessor's non-scanned behavior.

## NS-001 — Identity, registration, and durable app composition

- Root `app.json` is exactly `{ "name": "StartFive", "displayName": "先做5分钟" }`; the technical name is a valid RN component identifier.
- Root `index.js` is executed, not source-token inspected. It calls `AppRegistry.registerComponent` exactly once with `app.json.name` and a factory that returns the exact default export of `App.tsx`.
- Root `App.tsx` default-exports a renderable React component. The contract deliberately permits `React.memo` and does not require `typeof App === "function"`.
- `App.tsx` reuses `src/app/startFiveApp.tsx#createStartFiveApp`; it must not rebuild an ad-hoc service/repository or bypass the accepted Phase 4 composition.
- The native durable seam is the reviewed `@react-native-async-storage/async-storage` default API, whose `getItem`, `setItem`, and `removeItem` surface satisfies the accepted `AsyncKeyValueBackend` contract. The exact backend object plus callable `now` and `idGenerator` are passed to `createStartFiveApp`; no startup network adapter is injected.
- Initial render and rerender execute the composed `AppRoot` while `createStartFiveApp` is called exactly once; the test double may return `null`, which is a valid React render result.

## NS-002 — Package, lockfile, Babel, Metro, and TypeScript

- The project identity, private flag, Node engine, and every pre-native script/dependency/devDependency value remain present and unchanged.
- The default `test` script is exactly `node scripts/quality-gate-v2/cli.cjs test`, and `quality:gate` is exactly `node scripts/quality-gate-v2/cli.cjs full`. Bare `jest`, wrapper indirection, shell/environment branching, and a `test:unit` bypass are rejected.
- The preserved auxiliary scripts are exactly `test:locked` = `jest --runInBand tests/locked`, `test:locked:ci` = `jest --runInBand --ci --coverage=false tests/locked`, and `typecheck` = `tsc --noEmit`.
- Native scripts are exactly `react-native start`, `react-native run-android`, and `react-native run-ios`.
- React Native and its Babel/Jest/Metro/TypeScript configurations remain on `0.86.0`; React and renderer remain `19.2.3`. Community CLI packages are published semantic versions on major 20.
- `@react-native-async-storage/async-storage` is a direct production dependency with a published semantic version/range. `latest`, wildcard, URL, git, file, link, and workspace references do not satisfy the version grammar.
- `pnpm-lock.yaml` is parsed at the root importer. The durable backend, Metro configuration, and three CLI direct dependencies must have specifiers identical to `package.json`, resolved versions, package entries, and SHA-512 integrity.
- Babel configuration is executed and includes `module:@react-native/babel-preset`.
- Metro configuration is executed against isolated `getDefaultConfig`/`mergeConfig` ports. It must call `getDefaultConfig` with the real project root, merge once, export the merged result, and have no external `watchFolders` root.
- Strict TypeScript includes root `App.tsx`, `src`, and all test generations without weakening `noEmit`, `noUncheckedIndexedAccess`, or `exactOptionalPropertyTypes`.

## NS-003 — Android native contract

- The complete Gradle wrapper, settings/root/app build files, properties, manifest, resources, ProGuard rules, and one canonical `MainActivity`/`MainApplication` pair exist. Wrapper scripts/jar have non-placeholder sizes.
- Namespace/application ID and Java/Kotlin package path are uniquely `com.startfive.app`; the launcher, activity, resources, and React component use the shared `StartFive`/`先做5分钟` identity.
- The verified RN 0.86 baseline remains min SDK 24, target/compile SDK 36, Build Tools 36.0.0, NDK 27.1.12297006, Kotlin 2.1.20, RN-supplied AGP, and Gradle 9.3.1.
- The wrapper URL parses to HTTPS host `services.gradle.org`, path `/distributions/gradle-9.3.1-bin.zip` or `-all.zip`, with no query/fragment; `validateDistributionUrl=true` is mandatory.
- RN settings/autolinking/root/app plugins and native bootstrap are structurally complete. The official RN 0.86 New Architecture form is required: `MainApplication : Application(), ReactApplication`, one lazy `ReactHost`, `getDefaultReactHost(context = applicationContext, packageList = PackageList(this).packages...)`, and `loadReactNative(this)`. These key calls must occur in executable code, not comments or string literals. New Architecture and Hermes are enabled consistently with `react-android`/`hermes-android`.
- No keystore/private key/signing material, `google-services.json`, literal signing credential, Google API key, client secret, access/refresh token, or private key is committed. Common JSON/dotenv/YAML/Gradle/property/source encodings are scanned.
- Every Groovy or Kotlin DSL release block is brace-parsed and must not reference debug signing by property/index access or `getByName`, `findByName`, `named`, `named(...).get()`, `getAt`, `maybeCreate`, or `create` syntax. Commented examples and string literals are not treated as executable signing configuration.

## NS-004 — iOS static native contract

- Exactly one canonical `StartFive.xcodeproj/project.pbxproj`, `PBXProject`, Start Five application `PBXNativeTarget`, app delegate, Info.plist, launch storyboard, and privacy manifest exist.
- Object IDs and references must form the real chain `PBXProject.targets` → unique Start Five application `PBXNativeTarget` → `buildConfigurationList` → `XCConfigurationList.buildConfigurations` → exactly two referenced `XCBuildConfiguration` objects. Those objects are Debug and Release, both bind `StartFive/Info.plist`, and both use `com.startfive.app`. A matching orphan configuration or a configuration attached to the wrong/unreferenced target cannot satisfy the contract.
- The single app delegate uses the RN 0.86 factory/app-delegate bootstrap, resolves the JavaScript bundle, and starts the same `StartFive` component.
- Info.plist displays `先做5分钟`, retains `$(PRODUCT_NAME)`, uses `LaunchScreen`, and does not enable arbitrary network loads. Its phone orientation array is non-empty, every child is a `string`, and every value is a valid iOS orientation constant. If an iPad array exists, the same complete-child, non-empty, and value rules apply; mixed `integer`, `dict`, boolean, or other nodes fail.
- Podfile declares exactly one `StartFive` target and uses RN preparation, native-module autolinking, and `use_react_native!`.
- The Podfile platform is explicit or uses RN's `min_ios_version_supported`. Every explicit Podfile deployment target and every explicit Xcode `IPHONEOS_DEPLOYMENT_TARGET` is at least 15.1.

## NS-005 — Isolation and accepted-asset preservation

- Eleven distinctive exports across app composition, application, persistent/data storage, domain, service, and screen modules act as overwrite/delete sentinels.
- Every entry in all seven formal manifests is re-hashed, and each manifest's entry count and own SHA-256 are fixed by this candidate. Candidate Phase 4 Review 2 and quality-gate generations are outside this formal set.
- Isolation scanning is rooted only in `start-five`. It includes relevant source, native, configuration, JSON/XML/plist, YAML/lock, C/C++/header, Ruby/Podfile/podspec, Xcode, and TypeScript/JavaScript files.
- The scan rejects bookkeeping identity/code references, `file://`, another `outputs/` project, generalized Windows drive/UNC absolute paths, and common macOS/Linux workspace absolute paths.
- It excludes `.git`, tests, dependencies, generated build/cache trees, Pods, DerivedData, coverage, distributions, vendors, and Xcode user data to prevent self-report and generated noise.
- It exempts exactly the two canonical root POSIX Quality Gate evidence paths `quality-reports/quality-gate-report.json` and `quality-reports/quality-gate-summary.txt`. `quality-reports` is never added to the ignored-directory set, and no basename, prefix, substring, glob, path normalization, or case-insensitive rule may broaden the exemption. A dedicated oracle proves that unexpected `.json`, `.yaml`, `.ts`, `.txt`, and `.TXT` files in the case-insensitive first-segment `quality-reports` family, moved `quality-gate-summary.txt` artifacts, nested copies, separator variants, and case variants remain scanned and report hostile absolute/workspace/`outputs/` content. Separate negative controls prove that unrelated root/docs/archive `.txt` files retain the old scan range and do not create project-wide text false positives.
- There is exactly one root `app.json` and one root `package.json`; `android` and `ios` are root directories, not files or a nested generated project.

## Locked coverage map

| Suite | Tests | Primary contract |
|---|---:|---|
| `tests/native-scaffold/rootRegistration.contract.test.tsx` | 3 | NS-001 identity, executed registration, one durable composition |
| `tests/native-scaffold/toolchainConfig.contract.test.ts` | 5 | NS-002 preservation, pnpm consistency, executed configs, TS coverage |
| `tests/native-scaffold/androidScaffold.contract.test.ts` | 6 | NS-003 topology, identity, versions/URL, Hermes, bootstrap, security |
| `tests/native-scaffold/iosScaffold.contract.test.ts` | 6 | NS-004 canonical objects, Debug/Release, delegate, plist, Pods, deployment |
| `tests/native-scaffold/isolationAndPreservation.contract.test.ts` | 5 | NS-005 sentinels, seven formal locks, exact QG evidence boundary, isolation, root merge |
| `tests/native-scaffold/fixtures/nativeProject.invariant.test.ts` | 5 | Helper directory/pnpm plus PBX-chain, debug-signing, and plist-node invariants |

`tests/native-scaffold/fixtures/nativeProject.ts` is test-only infrastructure and is included in the native lock. It performs read-only inspection and hashing; it contains no scaffold or production implementation.

## Recorded baselines and acceptance

1. The predecessor's no-scaffold test-first baseline, recorded on 2026-08-04, remains historical evidence: **6 suites / 29 tests discovered; 20 expected failures and 9 passes** before implementation. This amendment does not rewrite that history.
2. The earlier seven-generation acceptance baseline of **24 suites / 218 tests** and the pre-amendment 15-root baseline of **57 suites / 353 tests** remain historical evidence. This candidate's controlled regression baseline is **57 suites / 354 tests** across the same 15 roots in the canonical command below.
3. `tsc --noEmit` must remain green with the current App/native implementation and all included test generations.
4. Executable candidate test sources contain no Jest skip/focus/todo/pending modifier, TypeScript suppression, explicit `any`, timer, real wait, network request, package install, emulator command, Android build, CocoaPods command, or Xcode invocation.
5. `NATIVE_SCAFFOLD_LOCK.sha256.candidate` is generated last from this specification and every regular file under `tests/native-scaffold/`, sorted by canonical POSIX project-relative path with the specification first. It contains the same eight-path inventory as the accepted predecessor, does not list itself or the excluded changelog, and its own SHA-256 is reported separately. The formal `NATIVE_SCAFFOLD_LOCK.sha256` is not overwritten before independent acceptance.
6. Before formal freezing, a fresh independent audit agent must verify the exact three locked-asset changes (this specification, NS-002's toolchain contract, and NS-005's isolation contract), the exact-path/non-blind-spot oracle, package and Quality Gate V2 preservation, determinism, non-brittleness, all formal locks, and the candidate native lock.
7. All 30 native tests, all 354 tests in the current 15-root formal regression set, typecheck, the relevant formal manifests, and the candidate native manifest must be green/valid before this candidate can replace its accepted predecessor. If the still-formal predecessor causes Quality Gate V2's lock preflight to fail before signing, that expected transitional result is recorded rather than weakening either contract.

## Canonical local commands

From the `outputs/start-five` project root with the repository's pinned Node/pnpm runtime on `PATH`:

```text
pnpm exec jest --runInBand --ci --coverage=false --roots tests/native-scaffold
pnpm exec jest --runInBand --ci --coverage=false --roots tests/gap-p0-01a tests/gap-p0-02a tests/native-review tests/native-scaffold tests/phase4 tests/phase4-review tests/phase4-review2 tests/phase4-review3 tests/phase4-review4 tests/phase4-review5 tests/review1 tests/review2 tests/review3 tests/review4 tests/locked
pnpm exec tsc --noEmit
```
