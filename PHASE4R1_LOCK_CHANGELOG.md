# Phase 4 R1 candidate changelog

## Status and exact delta

- Status: `PENDING ONE INDEPENDENT REVIEW / NO PRODUCTION AUTHORITY`.
- Added only `PHASE4R1_TEST_SPEC.md` and
  `tests/phase4-r1/startFiveApp.contract.test.tsx`; this changelog and candidate
  manifest are audit-only and excluded from the two-entry manifest.
- No production, original Phase 4 asset, package/Jest/TypeScript configuration,
  native project, registry, unrelated workstream, or bookkeeping-project file
  was edited.
- The R1 suite preserves the original seven public composition cases. It
  removes every raw `backend.getCalls` key/count/order assertion, because the
  shared backend now legitimately hydrates independent accepted review and day
  closure stores.
- Public replacements prove durable UI hydration, exact exposed-service use
  without a prescribed internal call count, shared repository/service state,
  hydration-ready offline UI, and `TASK_SNAPSHOT_CORRUPT` through the service
  and visible UI without an invented task.

## Controlled validation

- Initial R1 run: `6 passed / 1 failed / 0 snapshots`. The sole failure was a
  test-query uniqueness mistake: the visible corrupt-state code appeared twice,
  so `getByText` rejected multiple valid matches. It was mechanically corrected
  to require one or more matches.
- Authorized correction run: `7 passed / 7 total / 0 snapshots`.
- Initial TypeScript `--noEmit` found one test-only typing issue: Jest's
  `SpyInstance` type is not directly callable. The public service call was
  mechanically changed from `getState()` to
  `composition.service.getState()` while retaining the spy as call evidence.
- Authorized TypeScript correction run: exit `0`, no diagnostics.
- No original Phase 4, broad, native, registry, quality-gate, or unrelated
  suite ran. Jest was not rerun after the type-only service-call spelling fix.

One fresh independent reviewer must accept the exact candidate identity before
this compatibility correction is treated as frozen.

