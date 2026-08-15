# GAP-P0-04 lock audit log

## 2026-08-05 - initial test-first candidate

- Candidate manifest self identity:
  `cf194460f60e974a5d8d55c7c77f20dfb9123588e52a3ad4375520763ef54d0e`.
- Manifest inventory: one specification, one P0-04 helper, and seven discovered
  test suites; nine entries total.
- Candidate baseline with `--detectOpenHandles`: 7 suites / 61 tests, 54
  expected behavior failures and 7 passing independent controls; normal exit
  with no open-handle warning.
- Accepted regression baseline: 57 suites / 353 tests green.
- Accepted lock baseline: 15 manifests / 87 listed entries / zero drift.
- Main `tsc --noEmit`: green.
- Candidate bypass scan: zero skip/only/todo, TypeScript suppression,
  explicit `any`, `as unknown`, Jest module replacement, fake timers, sleep,
  direct timeout/interval, real clock read, or network call.
- Production source, earlier tests/specifications/manifests, native projects,
  package/configuration files, and `outputs/qingji-ai` were not modified by
  this test author.
- Concurrent, not-yet-accepted GAP-P0-01A2 and GAP-P0-02B candidates were
  explicitly excluded from stable regression/manifest evidence.
- P0-04 is Task-storage-only. It does not change or share schema/key/state with
  FocusSession persistence owned by GAP-P0-02B.

This audit log is intentionally excluded from `GAP_P0_04_LOCK.sha256`, matching
the existing changelog convention. Any listed-file change requires a new
manifest identity and a brand-new independent review before production repair.

## 2026-08-05 - second-round test-review repair candidate

- The initial identity
  `cf194460f60e974a5d8d55c7c77f20dfb9123588e52a3ad4375520763ef54d0e`
  is revoked. The only current candidate self identity is
  `49759447cf785560c9704475bb09147615b03f5107d9e7723414261ca317c624`.
- Manifest inventory: one specification, one P0-04 helper, and eight discovered
  test suites; ten entries total, with zero format, path, inventory, duplicate,
  missing-file, or hash issue.
- Candidate baseline with `--detectOpenHandles`: 8 suites / 156 tests, 145
  expected feature failures and 11 passing independent controls; zero snapshots,
  no open-handle warning, and normal completion after 10.7 seconds.
- The revision replaces raw restore with validated canonical recovery, adds
  crash/restart pending-state recovery at every mutation boundary, shared
  physical-backend linearization, bounded caller/backup materialization at the
  exact 256/257 and 512/513 boundaries, full Task/Subtask and A2 planning-field
  validation, managed-runtime/compiler surface checks, and FocusSession-key
  isolation.
- The final author self-audit removed masking extra fields from pending-metadata
  adversaries and now proves that integrity, pending, and invalid-backup errors
  do not retain caller or durable payload as `cause`.
- Accepted regression baseline: 57 suites / 353 tests green, zero snapshots.
- Accepted lock baseline: 15 manifests / 87 listed entries / zero drift.
- Main `tsc --noEmit`: green. Candidate forbidden-pattern scan: zero hits across
  nine candidate files and eight suites.
- Production source, earlier accepted artifacts, active GAP-P0-01A2 and
  GAP-P0-02B artifacts, native projects, package/configuration files, and
  `outputs/qingji-ai` were not modified by this test author.
- This candidate remains non-authorizing until a brand-new independent reviewer
  accepts the exact current self identity. Any listed-file change revokes it and
  requires a new complete review.

## 2026-08-05 - third-round test-review repair candidate

- The second-round identity
  `49759447cf785560c9704475bb09147615b03f5107d9e7723414261ca317c624`
  failed independent review and is revoked. The only current candidate self
  identity is
  `5286830e53d5e3122b8da41346a2a0f0fe084896f4c2c7da032669cc4a664683`.
- Manifest inventory: one specification, two P0-04 helpers, and nine discovered
  test suites; twelve entries total, with zero format, path, inventory,
  duplicate, missing-file, or hash issue.
- Candidate baseline with `--detectOpenHandles`: 9 suites / 220 tests, 207
  expected feature failures and 13 passing independent controls; zero
  snapshots, no open-handle warning, and normal completion after 9.9 seconds.
- A shared pure-JSON twenty-case semantic matrix now runs identically through
  caller-candidate recovery and backup-text restore. It covers exact Task and
  Subtask identity, key, time, lifecycle, score, parent/child, and A2 planning
  semantics; every restore failure preserves backup bytes, an empty online key,
  zero mutations, and a payload-free cause.
- The compiler contract now imports the real managed-runtime module directly
  and proves the exact dependency parameter, synchronous runtime result,
  app/controller boundary, inspection union, and all three success receipts
  including the retained exact restore receipt.
- The one-argument runtime control proves current-key-only behavior and no
  management methods. Historical-key envelopes are rejected as wrong-root.
  Pending metadata now covers invalid version/operation/category, every missing
  field, every wrong field type, and an equal pre-existing generated backup
  without rewrite across completed restart.
- Accepted regression baseline: 57 suites / 353 tests green, zero snapshots.
  Main `tsc --noEmit`: green. Accepted lock baseline: 15 manifests / 87 entries
  / zero drift. Candidate forbidden-pattern scan: zero hits across eleven
  candidate files and nine suites.
- Production source, earlier accepted artifacts, active GAP-P0-01A2 and
  GAP-P0-02B artifacts, native projects, package/configuration files, and
  `outputs/qingji-ai` were not modified by this test author.
- This candidate remains non-authorizing until a brand-new independent
  third-round reviewer accepts the exact current self identity. Any listed-file
  change revokes it and requires another complete review.

## 2026-08-05 - fourth-round test-review repair candidate

- The third-round identity
  `5286830e53d5e3122b8da41346a2a0f0fe084896f4c2c7da032669cc4a664683`
  failed independent review and is revoked. The only current candidate self
  identity is
  `2523707ee646fcfb9a322636610be69648406e83d856eca4393d6ccc98fe74de`.
- Manifest inventory: one specification, three P0-04 helpers, and ten discovered
  test suites; fourteen entries total, with exact format, POSIX ordering,
  complete inventory, unique paths, existing files, and matching hashes.
- Candidate baseline with `--detectOpenHandles`: 10 suites / 226 tests, 211
  expected feature failures and 15 passing independent controls; zero
  snapshots, no open-handle warning, and normal completion after 30.8 seconds.
- Managed hydration now locks one current-key read followed by one historical-key
  read before every decision, including legal current V1. Both one-argument
  compatibility controls remain current-key-only with one read and zero
  mutation.
- P0-04 now owns an independent real-filesystem TypeScript `CompilerHost` with
  React JSX enabled. Real TSX resolution, missing-module TS2307, and semantic
  TS2322 green controls prove there is no production-module shadow or diagnostic
  suppression; the feature contract imports the real managed-runtime module.
- All four legal formats through both recover and restore now require exactly
  one current-key set attempt and matching commit whose sole value is canonical
  V1. Direct caller candidates containing `NaN`, positive infinity, or negative
  infinity are rejected before serialization and before all backend/clock/ID
  activity, with the exact payload-free invalid-candidate error.
- Accepted regression baseline: 57 suites / 353 tests green, zero snapshots.
  Main `tsc --noEmit`: green. Accepted lock baseline: 15 manifests / 87 entries
  / zero drift. Case-sensitive candidate forbidden-pattern scan: zero hits
  across thirteen candidate files and ten suites.
- Production source, earlier accepted artifacts, active GAP-P0-01A2 and
  GAP-P0-02B artifacts, native projects, package/configuration files, and
  `outputs/qingji-ai` were not modified by this test author.
- This candidate remains non-authorizing until a brand-new independent
  fourth-round reviewer accepts the exact current self identity. Any listed-file
  change revokes it and requires another complete review.

## 2026-08-05 - fifth-round test-review repair candidate

- The fourth-round identity
  `2523707ee646fcfb9a322636610be69648406e83d856eca4393d6ccc98fe74de`
  failed independent review and is revoked. The only current candidate self
  identity is
  `e3c99a0f74ecc83d4d5d064acc0addbf7992bcee4a6dd2b9f8ae92bcdcb24555`.
- Manifest inventory remains one specification, three P0-04 helpers, and ten
  discovered test suites: fourteen entries with canonical POSIX paths and a
  complete recursive test-root inventory.
- Candidate baseline with `--detectOpenHandles`: 10 suites / 232 tests, 214
  expected feature failures and 18 passing independent controls; zero
  snapshots, no open-handle warning, and normal completion after 17.0 seconds.
- The three direct non-finite recovery candidates are now otherwise-legal
  pending Tasks with `scoreAwardedAt: null`. Three green controls prove their
  JSON-round-tripped `score: null` forms are accepted by the real strict
  snapshot validator, so the original `NaN`/positive-infinity/
  negative-infinity rejections cannot be masked by unrelated completion
  coherence.
- Cleanup retry after a historical-remove failure now discards the original
  storage facade and production module registry. A fresh backend over only the
  shared durable Map and an isolated managed-storage module must perform zero
  set, exactly one historical remove, no canonical-current rewrite, and zero
  clock/ID use.
- Malformed, unsupported, wrong-root, extra-key, and semantically invalid
  current data are hydrated twice through the same managed facade. Every
  attempt independently reads current then historical, returns the same stable
  payload-free classification, and performs no mutation. Malformed historical
  bytes additionally prove exact two-key hydration and inspection source
  classification.
- Divergent legal two-key history is now parameterized for V1, V0, and the
  documented default envelope at the current key. Each case preserves both raw
  values, reads the exact key pair, consumes no dependency, and rejects before
  set/remove.
- Accepted regression baseline remains 57 suites / 353 tests green and main
  `tsc --noEmit` remains green. The stable 15-manifest / 87-entry inventory is
  outside the P0-04 candidate boundary, remains byte-untouched, and was recorded
  with zero drift by the immediately preceding independent review.
- Case-sensitive candidate test scan reports zero bypass mode, TypeScript
  suppression/cast escape, explicit-any type, Jest module replacement, fake
  timer, snapshot, sleep, direct timer, timeout increase, or cross-project
  reference.
- Production, previous accepted locks, active GAP-P0-01A2/GAP-P0-02B and
  QUALITY_GATE assets, native/package configuration, and `outputs/qingji-ai`
  were not modified. This fifth-round candidate is stopped and grants no
  production authority until a brand-new independent fifth-round reviewer
  accepts its exact self identity.

## 2026-08-05 - sixth-round test-review repair candidate

- The fifth-round identity
  `e3c99a0f74ecc83d4d5d064acc0addbf7992bcee4a6dd2b9f8ae92bcdcb24555`
  failed independent review and is revoked. The only current candidate self
  identity is
  `9b411ffb555a7900268c1b18921385b18f2ce0f738d0194d7075b66adc415442`.
- Manifest inventory remains one specification, three P0-04 helpers, and ten
  discovered test suites: fourteen entries with canonical POSIX paths,
  complete recursive inventory, unique paths, matching hashes, and zero drift.
- Candidate baseline with `--detectOpenHandles`: 10 suites / 253 tests, 235
  expected feature failures and 18 passing independent controls; zero
  snapshots, no open-handle warning, and normal completion after 26.802
  seconds.
- Caller recovery and stored-backup restore now independently reject seven
  invalid-root forms without defaulting to an empty snapshot. Recovery locks
  zero backend/dependency I/O; restore locks one backup read, zero current
  reads, and byte-exact preservation.
- Recover and restore each retain the accepted canonical occupied-target row
  and add malformed, unsupported-version, and wrong-root non-empty current
  bytes. Every row locks occupied priority, backup-then-current reads, exact
  bytes, zero mutation/dependency use, and payload-free inspection.
- Unsupported/extra current hydration and invalid backup restore now give each
  row explicit zero clock/ID assertions, exact read budgets, distinct secret
  markers, exact cause fields, and message/string/enumerable/inspection
  redaction.
- Empty, current, all predecessor representations, conflict, and unreadable
  inspection paths run twice. Caller mutation creates no backend event, durable
  bytes remain exact, each call reads current then historical once, and the
  results share no mutable reference at any depth.
- Accepted regression baseline is 57 suites / 353 tests green, zero snapshots,
  completing after 43.364 seconds. Main `tsc --noEmit` is green.
- Strict accepted-lock audit is green for 15 manifests / 87 entries with zero
  format, missing-file, duplicate-path, path-escape, or hash-drift issue.
  Case-sensitive scan across all thirteen P0-04 test/helper files reports zero
  bypass mode, TypeScript suppression/cast escape, explicit-any type, Jest
  module replacement, fake timer, snapshot, sleep/direct timer, timeout
  increase, network use, or cross-project reference.
- This test author modified only the P0-04 specification, three P0-04 contract
  suites, candidate manifest, and this audit log. Production source, previous
  accepted locks, active GAP-P0-01A2/GAP-P0-02B and QUALITY_GATE assets, native
  and package configuration, and `outputs/qingji-ai` were not modified.
- This sixth-round candidate is stopped and grants no production authority
  until a brand-new independent sixth-round reviewer accepts the exact current
  self identity. Any listed-file change revokes it and requires a new complete
  test review.

## 2026-08-05 - seventh-round test-review repair candidate

- The sixth-round identity
  `9b411ffb555a7900268c1b18921385b18f2ce0f738d0194d7075b66adc415442`
  failed independent review and is revoked. The only current candidate self
  identity is
  `830e79d97426bdd2d49db301cad79e2c273a12310121f4b27e5d92c957acea88`.
- Manifest inventory remains one specification, three P0-04 helpers, and ten
  discovered test suites: fourteen entries with exact format, canonical POSIX
  ordering, complete recursive inventory, unique paths, existing files, and
  matching hashes.
- Candidate baseline with `--detectOpenHandles`: 10 suites / 255 tests, 237
  expected feature failures and 18 passing independent controls; zero
  snapshots, no open-handle warning, and normal completion after 24.926
  seconds.
- A dedicated caller-recovery success oracle now passes the legal raw empty
  Task array `[]`. It locks the exact zero-task receipt, one canonical empty V1
  write, retained backup bytes, backup-then-current reads only, no historical
  read/remove/clock/ID use, mutation-detached receipt, and an exact occupied
  rejection with no second write on repetition.
- A separate stored-backup restore oracle starts from the exact bytes `[]` and
  locks the same canonical zero-task outcome, exact restored receipt, retained
  raw backup, read/write budgets, zero dependencies, detached receipt, and
  occupied-target behavior on repetition. Together the two executable oracles
  kill implementations that accept non-empty raw Task arrays but reject the
  legal empty raw array.
- Accepted regression baseline is 57 suites / 353 tests green, zero snapshots,
  completing after 96.806 seconds. A final independent global `tsc --noEmit`
  rerun is green with exit code zero.
- Strict accepted-lock audit is green for 15 manifests / 87 entries with zero
  format, missing-file, duplicate-path, path-escape, or hash-drift issue.
  Case-sensitive scan across all thirteen P0-04 test/helper files reports zero
  bypass mode, TypeScript suppression/cast escape, explicit-any type, Jest
  module replacement, fake timer, snapshot, sleep/direct timer, timeout
  increase, network use, or cross-project reference.
- This test author modified only the P0-04 specification, the quarantine/restore
  and candidate-recovery contract suites, the candidate manifest, and this
  audit log. Production source, package/configuration, other tests or locks,
  active concurrent assets, and `outputs/qingji-ai` were not modified.
- This seventh-round candidate is stopped and grants no production authority
  until a brand-new independent seventh-round reviewer accepts the exact
  current self identity. Any listed-file change revokes it and requires a new
  complete test review.
