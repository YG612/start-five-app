# Test Lock Changelog

## 2026-08-04 — Controlled unlock authorized by CEO

- Authorization: the CEO explicitly authorized a controlled test-only correction to improve project quality and continue delivery.
- Reason for review: React Native Testing Library 14 uses async event handling and `act`; the locked UI test invoked `fireEvent.press(...)` and `fireEvent.changeText(...)` without awaiting them, which caused overlapping async `act()` work and cross-test contamination.
- Scope: only `tests/locked/application/CoreFlowScreen.test.tsx` changed. Exactly 16 existing `fireEvent` calls received an `await`; test names, assertions, text, step order, and business semantics were not changed.
- Previous `TEST_LOCK.sha256` file SHA-256: `c23885816f2a6c2e711f7f8f465dfd9a0ce6602fea3c39183379a2ddcf0459c3`.
- New `TEST_LOCK.sha256` file SHA-256: `9cce965ce8632b5c9acdca84a3c8ea02d4fac1b923bfd9fb8822fb221b4403ca`.
- Previous target-file SHA-256: `494751afb695fe82a385a6187b57c3959902e689eda662373616bf7a619bcbc8`.
- New target-file SHA-256: `060bf454c14c980aadfb774ef2d28902d24bc3515799abd4a982c946d403ccc8`.
- Lock coverage remains 13 files: `TEST_SPEC.md` plus every file under `tests/locked`, using stable POSIX-style relative paths. This changelog and the lock manifest itself are excluded from manifest coverage.
