# Phase 4 Review Test Lock Changelog

## 2026-08-04T23:42:21+08:00 - CEO-authorized controlled semantic-consistency amendment

- Standing authorization: the CEO explicitly authorized autonomous correction of low-risk, provable test contradictions while continuing high-quality delivery, without asking again for routine authorization.
- Reason: a legal deletion event must satisfy `updatedAt >= deletedAt`, consistent with the newly accepted final-review temporal rule. The two positive controls inherited `updatedAt: 2026-08-04T14:00:00.000Z` while explicitly setting `deletedAt: 2026-08-04T14:04:00.000Z`, so they contradicted the rule they were intended to validate.
- Exact amendment: only the `legal-cancelled-deleted` and `legal-pending-deleted` task overrides in `tests/phase4-review/snapshotSemanticValidation.regression.test.ts` now set `updatedAt: 2026-08-04T14:04:00.000Z`, equal to their unchanged `deletedAt` value. No assertion, case name, invalid case, helper, production file, configuration, or other lock artifact changed.
- Previous `tests/phase4-review/snapshotSemanticValidation.regression.test.ts` SHA-256: `0334a15e7a91ef89d8c2425a915d54843ec24a5d3f2a1b61c4524ae42f5b66a9`.
- New `tests/phase4-review/snapshotSemanticValidation.regression.test.ts` SHA-256: `6e013a105d75a899d66b9dca57d7811cd8ff2ee07e8d063f06de93f812b09c3e`.
- `PHASE4_REVIEW_TEST_SPEC.md` did not record the conflicting concrete timestamps and remains byte-identical at SHA-256 `5a91a1f0c649eb1e2bff432a49d572c76e806ecaf3e5b3929615b921b80dddc9`.
- Previous `PHASE4_REVIEW_LOCK.sha256` file SHA-256: `da5b2632ed84fb4593e4b1f50b1adb6a599694b00d3308992bd3ebaea2e79eb2`.
- New `PHASE4_REVIEW_LOCK.sha256` file SHA-256: `b19863c03008600e5d85658c878ef2d3c8473b01a8c27653df4c9521abdbef4a`.
- Manifest coverage remains the specification plus every regular file under `tests/phase4-review/`, sorted by POSIX-style relative path. This changelog and the manifest itself are excluded, following the established `TEST_LOCK_CHANGELOG.md` and `REVIEW2_LOCK_CHANGELOG.md` precedent.
