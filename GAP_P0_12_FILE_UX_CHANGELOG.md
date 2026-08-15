# GAP-P0-12 file backup UX tests-first changelog

- 2026-08-13: Added one focused specification and one exactly-two-test public
  AppRoot suite for export file handoff and inspect-before-restore import UX.
- TypeScript passes with zero diagnostics.
- Scoped Jest constructs the real compositions and reports exactly two legal
  red failures, both solely at the absent workspace entry **数据与备份**.
- No production file was changed and no broad regression suite was run.
- 2026-08-13: REVIEW FAILED BEFORE ACCEPTANCE / NEVER ACCEPTED — obsolete
  candidate self SHA-256
  `179cadc34c8f1cb9f3e48d2db01f79fd56fcfecbfed3edec552580a0dad630f4`.
  Its import journey stated the nonempty-install rule but did not exercise the
  real nonempty AppRoot UI path.
- The corrected candidate keeps exactly two tests and adds a separately seeded
  nonempty public AppRoot: valid preview remains available, explicit confirm
  shows **仅支持空安装恢复**, and picker calls, save calls, durable bytes, public
  tasks, history, and scheduling remain unchanged.
