# GAP-P0-01A2 Review4 additive lock audit log

## 2026-08-06 - create unsigned Review4 test-first draft

- Independent post-Review3 code review found two untested production defects:
  a successful physical-CAS coordination write can become a permanent orphan
  when its acknowledgement is lost, and independently hydrated wrappers over
  one physical CAS backend can return stale task caches indefinitely.
- Review4 adds one specification plus four regular TypeScript files under
  `tests/gap-p0-01a2-review4/`. No production, configuration, native,
  quality-gate, accepted/frozen test or lock, earlier candidate, other
  workstream, or `outputs/qingji-ai` file was modified by this author.
- Accepted Review3 manifest self
  `ee3d8e53b08faa1c5ac580ceaf12452e4c4badfb743ef22433a534dbd362bb87`
  and all seven listed entries were rehashed and remain byte-for-byte exact.
- The public fault double applies a successful, state-changing
  `compareExchangeItem` mutation before losing or delaying its return value.
  Tests retain only the dynamic public-call key/value to verify later
  replacement. They assert no private key/value grammar, timer, retry count,
  queue, journal shape, or implementation lock structure.
- A delayed-return fencing case prevents a naive active-lock steal from
  passing: the old wrapper resumes after the helper advances, and the final
  durable state/replays must still contain exactly two logical results.
- Cache tests use distinct wrappers and capability objects over one real
  physical Map, prehydrate both wrappers, require bidirectional visibility and
  concurrent convergence, and preserve useful caching by forbidding repeated
  reads of only the public primary task snapshot during an unchanged period.
  Lightweight CAS or sidecar coherence probes remain allowed.

## Local draft evidence

- Review4: 3 suites / 8 tests, 5 expected feature failures / 3 legitimate
  controls, exit 1, zero snapshots, 4.187 seconds, normal completion, and no
  open-handle warning.
- Main `tsc --noEmit`: exit 0 with zero diagnostics.
- Accepted Review3: 5 suites / 38 tests green.
- Accepted Review1: 3 suites / 20 tests green.
- Frozen GAP-P0-01A2: 10 suites / 91 tests green.
- Frozen GAP-P0-01A: 3 suites / 10 tests green.
- Frozen GAP-P0-02A: 4 suites / 13 tests green.
- Frozen GAP-P0-02B: 11 suites / 252 tests green.
- Four Review4 TypeScript files: zero match across skip/focus/todo, test-limit
  change, fake timer, snapshot, sleep/direct timer, TypeScript suppression,
  explicit-any, `as unknown`, `Function`/`Reflect`, Jest replacement or
  production mock, native/network access, and `qingji-ai` categories.

## Controlled-transition hold

The manager-controlled Native/quality-gate transition is not yet declared
complete. A read-only global manifest check currently reports
`QUALITY_GATE_MANIFEST_SHA_MISMATCH: NATIVE_SCAFFOLD_TEST_SPEC.md`, consistent
with that known transition. The 57-suite / 353-test formal baseline and final
global manifest gate are therefore not claimed.

The companion manifest remains
`GAP_P0_01A2_REVIEW4_LOCK.sha256.draft`. It is not a signed/accepted lock and
grants no production-repair authority. After manager notification, the author
must rerun the formal/global gates, update exact evidence if necessary, and
hand the resulting exact candidate to a brand-new independent test reviewer.

The exact unsigned draft-manifest self at this hold point is
`b8e1c8a313db3bb390f24561689ec8c4b63afb49506dd2968670dc73c4ad2871`.

This changelog is intentionally excluded from the draft manifest.

## 2026-08-09 - supersede unsigned draft and record Review4 candidate

- The unsigned draft-manifest self
  `b8e1c8a313db3bb390f24561689ec8c4b63afb49506dd2968670dc73c4ad2871`
  is **UNVERIFIED / NEVER ACCEPTED**. It granted no production authority and
  remains historical evidence only.
- A direct nested-result clone control was added to the Review4 cache suite.
  Two independently hydrated wrappers read one task containing a subtask;
  top-level and nested caller mutations are applied in both wrapper directions.
  The other caller's existing object, both wrappers' subsequent reads, and the
  complete raw physical byte map must remain unchanged.
- No production source, accepted/frozen test or lock, package/Jest/TypeScript
  configuration, registry, report, native project, unrelated workstream, or
  `outputs/qingji-ai` content was changed by this finalization.

### Exact candidate and scoped evidence

- Final candidate manifest self:
  `0872512a6c6a1241eaf119c19ac79f2b29961719e388a469d3372413bcd37f80`.
- Exact inventory: one specification plus four regular TypeScript files below
  `tests/gap-p0-01a2-review4/`; five canonical spec-first manifest entries, no
  self entry, no missing/extra/reparse inventory file, and every listed SHA-256
  matches disk.
- Review4 isolated run: 3 suites / 9 tests, exact 5 expected current-production
  feature failures / 4 legitimate passing controls, exit 1, zero snapshots,
  normal completion in 4.719 seconds, and no open-handle warning. The reds are
  three lost/delayed CAS-ack recovery paths returning
  `TASK_ATOMIC_COORDINATION_BUSY` and two stale-cache paths. The greens are
  clean-read caching, nested clone isolation, legacy no-capability behavior,
  and equal-scope physical-store isolation.
- Main `tsc --noEmit`: exit 0 with zero diagnostics.
- Scoped frozen regressions: GAP-P0-01A2 10 suites / 91 tests, GAP-P0-02A
  4 suites / 13 tests, and GAP-P0-02B 11 suites / 252 tests; combined 25 suites
  / 356 tests green with zero snapshots.
- The four Review4 TypeScript files have zero forbidden-category match across
  skip/focus/todo, timeout change, fake timer, snapshot, sleep/direct timer,
  TypeScript suppression, explicit `any`, `as unknown`, capital `Function` or
  `Reflect`, Jest replacement/production mock, native/network access, and
  `qingji-ai` reference.
- Frozen GAP-P0-01A2 self
  `6b92c2b1183f9173893f64d605fbde1dde95b0da6c4400029bfc762f7eb43d30`
  and all twelve entries, plus Review3 self
  `ee3d8e53b08faa1c5ac580ceaf12452e4c4badfb743ef22433a534dbd362bb87`
  and all seven entries, remain exact.
- Formal quality-gate CLI and global registry audit were intentionally not run
  by this scoped finalizer and are not claimed.

Status: **PENDING ONE INDEPENDENT TEST REVIEW / NO PRODUCTION AUTHORITY.**
Only acceptance of exact candidate self
`0872512a6c6a1241eaf119c19ac79f2b29961719e388a469d3372413bcd37f80`
may authorize a separate production repair agent.

This changelog is intentionally excluded from both the historical draft and
the candidate manifest.
