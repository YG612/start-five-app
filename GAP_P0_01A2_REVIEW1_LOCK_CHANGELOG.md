# GAP-P0-01A2 Review1 additive lock audit log

## 2026-08-05 - fourth-round recorded candidate after execution-gate restoration

- Fourth-round candidate manifest self identity:
  `421c27b8ff83cc1c4cf4c42e44b38d9945fef7d00e438a6df5885145d16c905d`.
- The earlier five-line fourth-round content draft was never issued as an
  authoritative self and is superseded by this recorded candidate. Rejected
  identities `14047cb675218974b6cf856d46735ead5b63aed82bd8ee51b27ab67fb84c89ca`,
  `107dc61f8835d6d1495ec951281f29ee2f8560c16353c50a9e7526aa1ac1ea58`,
  and `369653843c7389e00f661f212fac84acdfc9f489efb74c75247d8624a867c944`
  remain revoked and grant no repair authority.
- Exact candidate inventory is five manifest entries: one specification and
  four regular files under `tests/gap-p0-01a2-review1/`. Manifest format,
  canonical ordering, path safety, uniqueness, presence, and every listed
  SHA-256 were independently rechecked with zero issue.
- The canonical VM-modules run with `--detectOpenHandles --verbose` completed
  normally: 3 suites / 20 tests, 14 expected feature failures / 6 passing
  controls, exit 1, zero snapshots, and no timeout or open-handle warning.
- The six legitimate greens are all four resource-layering controls, the
  serialized raw-byte reconstruction/isolation control, and the one-record
  `softDelete` physical-restart oracle. `softDelete` already returns the exact
  detached result, rejects the conflicting binding, consumes zero clock/ID,
  performs zero set/remove/forward mutation, and preserves complete source and
  restored raw bytes; it was not weakened merely to force a red result.
- The fourteen reds map to the reviewed defects: two large-collection paths
  hit the misplaced 256/512 materialization budget, while twelve durable-ledger
  paths expose retained settled state, absent exact restart replay, absent
  crash recovery/remove-stage compensation, missing bounded sidecars and
  corruption handling, and missing task-state mismatch protection.
- Frozen regressions are green: GAP-P0-01A2 10 suites / 91 tests; GAP-P0-01A
  3 suites / 10 tests; accepted/formally repaired roots 57 suites / 353 tests;
  all with zero snapshots. Main `tsc --noEmit` exits 0.
- Stable accepted-lock audit remains 16 manifests / 99 entries / zero format,
  order, path-safety, uniqueness, presence, or SHA issue. Frozen A2 self remains
  `6b92c2b1183f9173893f64d605fbde1dde95b0da6c4400029bfc762f7eb43d30`.
- Candidate inventory is exactly four test-root files. All thirteen forbidden
  scan categories are zero, including skip/focus/todo, TypeScript suppression
  or cast escape, explicit-any type, `Function`/`Reflect`, Jest replacement,
  fake timers, snapshots, sleep, direct timers, timeout increase, and any
  `qingji-ai` reference.
- No test content, frozen A2 asset, production source, package/configuration,
  other test or lock asset, native project, or `outputs/qingji-ai` content was
  changed. This exact self now waits for a fourth brand-new independent test
  reviewer; production repair remains prohibited until that reviewer passes it.

## 2026-08-05 — fourth-round unverified draft after third review failure

- Third-candidate identity
  `14047cb675218974b6cf856d46735ead5b63aed82bd8ee51b27ab67fb84c89ca`
  is revoked and grants no production-repair authority.
- No fourth-candidate self identity has been issued. The five-line manifest is
  only a content-hash draft; its complete-manifest SHA-256 is intentionally not
  computed or recorded as an authoritative identity before execution gates.
- Static inventory is 3 suites / 20 tests: durable ledger 14, large collection
  2, and resource controls 4. The expected current-production split is 15
  feature failures / 5 controls passing, but this is not a recorded test result.
- Each of create, update, soft-delete, complete, reschedule, and delay now has
  an independent single-record byte-only module-restart replay/conflict oracle.
  The oracle checks exact results/conflict, zero clock/ID, empty set/remove/
  unified-forward histories, and byte-identical complete raw storage after both
  replay and conflict. The 515-binding capacity oracle remains unchanged.
- `failNextSidecarRead` now receives the caller's `ReviewBackendFault`. The
  same-service read failure requires stable `TASK_STORAGE_READ_FAILED` with
  identity-equal `error.cause`, zero set/remove/forward mutation, and unchanged
  raw bytes; its one-shot retry must exactly replay with the same zero-write and
  byte-preservation guarantees.
- Code-only static scans report zero skip/focus/todo, TypeScript suppression,
  unsafe cast, explicit-any type, Jest replacement, fake timer, snapshot,
  sleep, direct timer/interval, timeout increase, or `Function`/`Reflect` use.
  The intentional isolation apparatus remains three real dynamic imports and
  one `jest.isolateModulesAsync` call.
- The author and Manager were both prevented from running the pinned runtime by
  the shared environment's exhausted approval-usage limit. A default sandbox
  attempt failed before Jest launched and is not evidence. No Jest, TypeScript,
  frozen-regression, stable-lock, red/green, timeout, or open-handle claim is
  made for this draft.
- The exact commands and expected exit/test counts are recorded in the draft
  specification. Work stops at the execution-gate boundary. After access is
  restored, every gate must run and be recorded before signing, then a fourth
  brand-new independent test reviewer must review that eventual exact self.

## 2026-08-05 — replacement after second independent test-review failure

- The rejected replacement identity
  `107dc61f8835d6d1495ec951281f29ee2f8560c16353c50a9e7526aa1ac1ea58`
  is revoked and grants no production-repair authority. The earlier rejected
  identity remains historical and revoked as recorded below.
- Third candidate manifest self identity:
  `14047cb675218974b6cf856d46735ead5b63aed82bd8ee51b27ab67fb84c89ca`.
- Inventory is one additive specification, one typed helper, and three test
  suites: five manifest entries with zero format, inventory, order,
  path-safety, missing-file, duplicate, or SHA issue.
- Candidate baseline uses Node VM modules because the test intentionally loads
  real application modules inside `jest.isolateModulesAsync`: 3 suites / 16
  tests, 11 expected defect failures and 5 passing independent controls; zero
  snapshots, normal exit, and no timeout or open-handle warning.
- Review finding 1 is closed in the tests: the backend now assigns one ordered
  forward-mutation ordinal across both `setItem` and `removeItem`. Successful
  create/delay probes discover the actual stages; fail-before is exercised at
  every observed ordinal and mutation kind, and fail-after is exercised for
  every observed remove ordinal after deletion takes effect. Each path checks
  exact `TASK_STORAGE_WRITE_FAILED` cause, complete raw-map rollback, the old
  current-facade view, one same-ID retry, and byte-reconstructed replay with
  zero writes, without binding a storage key or ledger schema.
- Review finding 2 is closed in the tests: every physical-restart scenario
  serializes only durable raw bytes, reconstructs a wholly new `Map`, and
  dynamically imports the real persistent storage, repository, and application
  modules inside an isolated registry. No coordinator, `Map`, object reference,
  module replacement, mock, or placeholder sidecar is shared across restart;
  isolation restoration is covered by the surrounding controls.
- Review finding 3 is closed in the tests: capacity is exactly 515 bindings —
  one create, one non-idempotent delay, and 513 same-target updates. Independent
  byte-only restarts replay positions 1, 2, 3, 256, 257, 513, 514, and 515 with
  exact results and zero clock, ID, set, or remove dependency use, while the
  contract continues to bound each operation kind/target unit at 512.
- Frozen regressions remain green: GAP-P0-01A2 10 suites / 91 tests;
  GAP-P0-01A 3 suites / 10 tests; accepted/formally repaired roots 57 suites /
  353 tests; main `tsc --noEmit`.
- Stable manifest audit explicitly excludes active GAP-P0-02B, active
  GAP-P0-04, this candidate, and rejected QUALITY_GATE: 16 manifests /
  99 entries / zero issues. All bypass categories are zero; the candidate has
  three expected literal dynamic imports and one `isolateModulesAsync` use.
- Frozen GAP-P0-01A2 self remains
  `6b92c2b1183f9173893f64d605fbde1dde95b0da6c4400029bfc762f7eb43d30`.
- The third candidate is stopped. A third brand-new independent test reviewer
  must accept this exact self identity before any production repair resumes.

## 2026-08-05 — replacement after first independent test-review failure

- The rejected first-draft identity
  `369653843c7389e00f661f212fac84acdfc9f489efb74c75247d8624a867c944`
  is revoked and grants no production-repair authority.
- Replacement candidate manifest self identity:
  `107dc61f8835d6d1495ec951281f29ee2f8560c16353c50a9e7526aa1ac1ea58`.
- Inventory remains one additive specification, one typed helper, and three
  test suites: five manifest entries with zero format, inventory, order,
  path-safety, missing-file, duplicate, or SHA issue.
- Candidate baseline with `--detectOpenHandles`: 3 suites / 15 tests, 11
  expected defect failures and 4 passing independent resource/security
  controls; zero snapshots, normal exit, and no timeout or open-handle warning.
- Review finding 1: the backend now fails the Nth forward `setItem` without
  naming a key or schema. Equivalent successful create/delay runs discover N,
  then every ordinal proves exact error cause, complete raw-map rollback,
  current-facade old state, same-ID retry, and non-duplicating durable replay.
- Review finding 2: the original caller stays behind its committed-write
  barrier until a first restart both replays and queries the durable task and a
  second brand-new facade replays the same result with zero dependency or
  backend mutation.
- Review finding 3: corrupt-ledger and task-state-digest mismatch paths each
  reject both an old replay and a brand-new operation-ID mutation. Checks occur
  immediately after each call and prove zero clock/ID/set/remove plus exact
  preservation of the complete raw map.
- Review finding 4: logical records 510-514 span Q2/Q3/Q4/Q4/Q1; the candidate
  asserts exact `[1,1,1,256]` quadrant counts, Q4 key order, the unique
  post-512 recommendation ID, and a fresh cross-unit duplicate-ID failure with
  zero byte change.
- Review finding 5: 513 durable bindings are mixed: position 1 create,
  position 2 non-idempotent delay, and later updates. Physical restart exactly
  replays positions 1, 2, 256, 257, and 513 with zero clock/ID/set/remove.
- Frozen regressions remain green: GAP-P0-01A2 10 suites / 91 tests;
  GAP-P0-01A 3 suites / 10 tests; accepted/formally repaired roots 57 suites /
  353 tests; main `tsc --noEmit`.
- Stable manifest audit explicitly excludes active GAP-P0-02B, active
  GAP-P0-04, this candidate, and rejected QUALITY_GATE: 16 manifests /
  99 entries / zero issues. All thirteen bypass categories are zero, including
  the required case-sensitive `Function`/`Reflect` scan.
- Frozen GAP-P0-01A2 self remains
  `6b92c2b1183f9173893f64d605fbde1dde95b0da6c4400029bfc762f7eb43d30`.
- The replacement candidate is now stopped and must be reviewed by a second
  brand-new independent test reviewer before production repair resumes.

## 2026-08-05 — rejected first draft (historical, no authority)

- Candidate manifest self identity:
  `369653843c7389e00f661f212fac84acdfc9f489efb74c75247d8624a867c944`.
- Frozen GAP-P0-01A2 self remains unchanged:
  `6b92c2b1183f9173893f64d605fbde1dde95b0da6c4400029bfc762f7eb43d30`.
- Inventory: one additive specification, one typed helper, and three test
  suites; five manifest entries with zero format, inventory, ordering, path,
  missing-file, or SHA issue.
- Candidate baseline with `--detectOpenHandles`: 3 suites / 17 tests, 11
  expected defect failures and 6 passing independent security/failure
  controls; zero snapshots and no timeout or open-handle warning.
- Frozen regressions: GAP-P0-01A2 10 suites / 91 tests green; GAP-P0-01A
  3 suites / 10 tests green; accepted/formally repaired roots 57 suites /
  353 tests green; main `tsc --noEmit` green.
- Stable manifest audit explicitly excludes active GAP-P0-02B, active
  GAP-P0-04, this candidate, and rejected QUALITY_GATE: 16 manifests /
  99 entries / zero format, order, path-safety, uniqueness, presence, or SHA
  issues.
- Contract decision: retain generic one-value array256/container512 and Proxy
  defenses while removing the hidden logical task-collection cap. Preserve
  legal V1 reads and P0-04 fail-closed compatibility; allow implementation-
  private scalable records without locking their schema or sharding algorithm.
- Operation decision: settled in-flight records are released; permanent exact
  replay uses versioned, bounded durable units and no silent TTL/capacity
  eviction. Task and ledger changes provide recoverable linear atomicity over
  the existing single-key KV API, caught-failure exact rollback, crash-journal
  recovery, and fail-closed corruption/state-mismatch handling.
- Candidate scan: zero skip/only/todo/pending alias, timeout increase,
  TypeScript suppression or cast escape, explicit-any type, case-sensitive
  `Function`/`Reflect`, Jest replacement, fake timer, snapshot assertion,
  sleep, direct timeout, or direct interval.
- The test author changed only this additive specification, the new test root,
  this manifest, and this audit-only changelog. Production, frozen A2,
  dependencies, native projects, other test/lock assets, and
  `outputs/qingji-ai` were not modified.

This changelog is intentionally excluded from
`GAP_P0_01A2_REVIEW1_LOCK.sha256`. Any candidate content change requires a new
self identity and another independent test review before production repair.
