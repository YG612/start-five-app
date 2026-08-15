# Phase 4 Test Lock Changelog

## 2026-08-04T23:42:21+08:00 - CEO-authorized controlled semantic-consistency amendment

- Standing authorization: the CEO explicitly authorized autonomous correction of low-risk, provable test contradictions while continuing high-quality delivery, without asking again for routine authorization.
- Reason: a legal deletion event must satisfy `updatedAt >= deletedAt`, consistent with the newly accepted final-review temporal rule. The `q4-cancelled` positive round-trip fixture inherited `updatedAt: 2026-08-04T10:00:00.000Z` while explicitly setting `deletedAt: 2026-08-04T10:20:00.000Z`, so it contradicted the rule it was intended to validate.
- Exact amendment: only the `q4-cancelled` task override in `tests/phase4/phase4Fixtures.ts` now sets `updatedAt: 2026-08-04T10:20:00.000Z`, equal to its unchanged `deletedAt` value. No assertion, other fixture, production file, configuration, or other lock artifact changed.
- Previous `tests/phase4/phase4Fixtures.ts` SHA-256: `919255509ef4947818ef241ab96d9df7fdb101d0fb9ffc4e3a48fbc4e0b8f385`.
- New `tests/phase4/phase4Fixtures.ts` SHA-256: `02870b5b5fa53d2dcd9f2ba58029c62ecdbdde2d71f8c098a203def56b0ab794`.
- `PHASE4_TEST_SPEC.md` did not record the conflicting concrete timestamps and remains byte-identical at SHA-256 `58b371327bc8c034fca5a41f671ec300ffcdeb2a58fb061b8803a3ee10def34f`.
- Previous `PHASE4_LOCK.sha256` file SHA-256: `c29a737da1e8cd431c3b462246d8638e3ed1c036dcacdb503f47168739823fb9`.
- New `PHASE4_LOCK.sha256` file SHA-256: `60039810988c00ebf34ead63c4c42a3bf47374a966dfa1acdd207d3aa9d6d21d`.
- Manifest coverage remains the specification plus every regular file under `tests/phase4/`, sorted by POSIX-style relative path. This changelog and the manifest itself are excluded, following the established `TEST_LOCK_CHANGELOG.md` and `REVIEW2_LOCK_CHANGELOG.md` precedent.

## 2026-08-05T02:40:22+08:00 - CEO-authorized controlled parent/subtask temporal-consistency amendment

- Standing authorization: the CEO authorized autonomous correction of low-risk, provable test contradictions while preserving the locked test-first and independent-review workflow.
- Reason: the newly frozen `PHASE4_REVIEW3_TEST_SPEC.md` requires every subtask `updatedAt` to be no later than its parent task `updatedAt`. The positive `q2-in-progress` fixture had parent `updatedAt: 2026-08-04T10:05:00.000Z` while its completed child had unchanged `updatedAt: 2026-08-04T10:06:00.000Z`, so the fixture contradicted the accepted aggregate temporal invariant.
- Exact amendment: only the `q2-in-progress` parent override in `tests/phase4/phase4Fixtures.ts` changes `updatedAt` from `2026-08-04T10:05:00.000Z` to `2026-08-04T10:06:00.000Z`. Its `startedAt`, every child field, all assertions, test names, production files, configurations, native files, other tests, and other lock artifacts remain unchanged.
- Previous `tests/phase4/phase4Fixtures.ts` SHA-256: `02870b5b5fa53d2dcd9f2ba58029c62ecdbdde2d71f8c098a203def56b0ab794`.
- New `tests/phase4/phase4Fixtures.ts` SHA-256: `c6e58d31dddd12c6a2872a4942d98f8f4edf6e7657f361a2d1ca6c830cb52514`.
- Previous `PHASE4_LOCK.sha256` file SHA-256: `60039810988c00ebf34ead63c4c42a3bf47374a966dfa1acdd207d3aa9d6d21d`.
- New `PHASE4_LOCK.sha256` file SHA-256: `f407914c3aedf3f04d0bdb826d11379c27b283bbf4e1d3e8c7ee2075481a30dd`.
- Manifest coverage, sorting, separators, and two-space format remain unchanged: the specification plus every regular file under `tests/phase4/`; this changelog and the manifest itself remain outside the manifest domain.
- This is a one-off controlled correction of a proven positive-fixture contradiction. It neither weakens an assertion nor establishes a precedent for relaxing or rewriting locked tests.
