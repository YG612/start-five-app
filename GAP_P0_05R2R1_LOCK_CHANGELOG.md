# GAP-P0-05R2R1 candidate lock changelog

## Status

**PENDING ONE INDEPENDENT REVIEW / NO PRODUCTION AUTHORITY.**

Candidate manifest self:
`9031255d2a10c53ce27fa6d12d4338b1ff1b794fc3554b59428ef37827045048`.

This changelog is intentionally excluded from the three-entry candidate manifest.

## Controlled predecessor disposition

The frozen GAP-P0-05R2 candidate self
`235a5782e22d0f81cc754c89d833f8dae8fa0aecbc5e92fb164a2ad2cb244e84`
passed independent test review. Its C fixture is now **CONTROLLED SUPERSEDED FOR
FIXTURE CONSISTENCY / NEVER ACCEPTED AS FINAL PRODUCTION GATE** because its
pending-restore completion-node capture conflicts with the later independently
reviewed GAP-P0-05R3 pending/error UI contract. This is not a quality-failure
designation for the frozen R2 assets, which remain unchanged.

## Exact delta

- Cases A and B remain behaviorally equivalent to frozen R2.
- `gapP005R2TestKit.ts` is byte-for-byte identical to frozen R2 (SHA-256
  `dfd6990746fee39bcdb948d6344eca93689e7ac5ee6633dcb34447e8be82475c`).
- Case C now restores an authoritative `in_progress` task with one durable
  running focus in one real `AppRoot`. It locks that `完成任务` is absent while
  running and that task status/raw bytes remain unchanged; after public durable
  interruption the completion action appears and may complete the task; a
  byte-only restart preserves one interrupted history entry with no extra ID.
- No production, R2, R3, R1, or older test asset changed.

GAP-P0-05R2R1 C owns the running-state UI gate. GAP-P0-05R3 case 2 owns the
pending/error UI gate. Final independent production code review must confirm,
as a hard release condition, that completion rendering and the completion
handler use the same current `taskCompletionBlocked` predicate/ref.

## Verification evidence

- Isolated R2R1 Jest root: **1 suite passed / 3 tests passed / 0 snapshots**;
  Jest time 8.588 seconds (A 1470 ms, B 92 ms, C 93 ms).
- Main `tsc --noEmit`: exit 0.
- No R2, R3, R1, Phase4, full-suite, or quality-gate run was performed.

The candidate contains exactly three regular LF/no-BOM entries and exactly
three `it(...)` tests. One fresh independent reviewer must accept the exact
self above before it can authorize any production work.
