# GAP-P0-01A2 Review3 additive lock audit log

## 2026-08-06 - supersede failed Review2 oracle and record Review3 candidate

- GAP-P0-01A2 Review2 self
  `b71762ddd3cd3885ec9aff12189a86bc363338cfe0bfb0295708de280073413b`
  is **REVIEW FAILED / NEVER ACCEPTED**. It is not described as revoked. Its
  seven manifest-listed historical assets still have exact disk hashes and the
  Review2 manifest itself still hashes to that self; zero old byte was changed.
- Review3 corrects the failed concurrency oracle. Its valid physical backend
  permits mutation only through the public V1 `compareExchangeItem` capability;
  ordinary `setItem`/`removeItem` attempts fail and are asserted absent. The
  deterministic gates observe only public CAS entry and contain no timer,
  sleep, elapsed-time, private-key, private-queue, or ordinary-write oracle.
- Concurrent create accepts either durable task order while preserving both
  exact results and operation bindings. Concurrent disjoint update accepts
  exactly either complete A-then-B or B-then-A linearization history; it no
  longer requires B to observe A. Fresh-wrapper replay proves both bindings and
  exact byte stability.
- An independent causal-progress test pauses store A at public CAS while store
  B, an unrelated physical map with the same diagnostic scope, must complete.
  This rejects global scope locking without a fragile wall-clock assertion.
- The fail-closed capability matrix covers missing method, unsupported numeric
  version, non-numeric version, empty scope, whitespace scope, non-string
  scope, non-boolean resolved value, synchronous throw, and rejected promise.
  Each path requires zero clock/ID use, zero ordinary mutation, byte stability,
  and no private request leak. A separate test proves boolean `false` is a
  retryable comparison miss, not an invalid capability result.
- Review3 independently copies forward the qualified strong-digest, result
  validation, global operation-ID uniqueness, header privacy, scalable page
  integrity, journal grammar/key-domain/preflight, and compensation boundaries.
  It does not import the failed Review2 candidate as an executable dependency.

## Exact candidate and gate evidence

- Final candidate manifest self:
  `ee3d8e53b08faa1c5ac580ceaf12452e4c4badfb743ef22433a534dbd362bb87`.
- Exact inventory: one specification plus six regular TypeScript files below
  `tests/gap-p0-01a2-review3/`; seven manifest entries in spec-first canonical
  POSIX order, no self entry, no missing or extra inventory file, and every
  listed SHA-256 matches disk.
- Canonical pinned-Node VM-modules run with `--runInBand`,
  `--detectOpenHandles`, `--verbose`, and zero coverage: 5 suites / 38 tests,
  35 expected current-production feature failures / 3 legitimate passing
  controls, exit 1, zero snapshots, normal completion in 4.106 seconds, and no
  timeout or open-handle warning.
- The only greens are the independent SHA-256 standard-vector control, the
  accepted conflict non-disclosure control, and the accepted no-capability
  single-facade compatibility path. The 35 reds map to 13 atomic/capability,
  four ledger-integrity, three uniqueness/privacy, five scalable-integrity,
  and ten journal contracts.
- Main `tsc --noEmit`: exit 0 with zero diagnostics.
- Frozen/accepted regressions all pass with zero snapshots:
  - GAP-P0-01A2 Review1: 3 suites / 20 tests;
  - GAP-P0-01A2: 10 suites / 91 tests;
  - GAP-P0-01A: 3 suites / 10 tests;
  - GAP-P0-02A: 4 suites / 13 tests;
  - GAP-P0-02B: 11 suites / 252 tests; and
  - accepted/formally repaired baseline: 57 suites / 353 tests.
- Sixteen stable manifests / 101 entries pass exact line format,
  spec-first/canonical ordering, Windows-safe path, global path uniqueness,
  file presence, and disk SHA validation with zero issue.
- The six Review3 TypeScript files have zero match across all forbidden
  categories: skip/focus/todo; timeout increase; fake timers; snapshots; sleep;
  direct timers; TypeScript suppression; explicit-any; `as unknown`; `Function`
  or `Reflect`; Jest replacement/production mock; native/network access; and
  `qingji-ai`.
- No production source, package/Jest/TypeScript configuration, accepted/frozen
  test or lock, native project, other workstream, or separate
  `outputs/qingji-ai` content was changed by this author.

This exact candidate is stopped and awaits a brand-new independent test
reviewer. It grants no production-repair authority until that reviewer accepts
self `ee3d8e53b08faa1c5ac580ceaf12452e4c4badfb743ef22433a534dbd362bb87`.
After acceptance, the specification and all six files under the Review3 test
root become immutable.

This changelog is intentionally excluded from
`GAP_P0_01A2_REVIEW3_LOCK.sha256`.
