# GAP-P0-05R2R1 controlled test-consistency specification

## Status and authority

- Status: `PENDING ONE INDEPENDENT REVIEW / NO PRODUCTION AUTHORITY`.
- This slice is additive and test-only. It does not authorize production changes.
- Frozen GAP-P0-05R2 candidate self `235a5782e22d0f81cc754c89d833f8dae8fa0aecbc5e92fb164a2ad2cb244e84` passed independent test review. Its case C fixture is now `CONTROLLED SUPERSEDED FOR FIXTURE CONSISTENCY / NEVER ACCEPTED AS FINAL PRODUCTION GATE` because capturing task completion while focus restore was pending conflicts with the later independently reviewed GAP-P0-05R3 pending-hide contract.
- The original GAP-P0-05R2 spec and two TypeScript assets remain byte-frozen and are not modified.

## Scope and invariants

R2R1 mechanically copies the three GAP-P0-05R2 tests/assets and keeps exactly three `it(...)` cases. Cases A and B are behaviorally unchanged. The sole behavior delta is case C. There are no timers, sleeps, process-level unhandled-rejection listeners, private production props/handlers, network calls, or production-only test branches.

### A — restore recovery and latest generation

Unchanged from GAP-P0-05R2: real `AppRoot`/public UI recovers readable and corrupt focus restore failures on the same mount; an explicit public retry starts a newer generation whose result wins over a late older restore.

### B — deadline finish persistence failure

Unchanged from GAP-P0-05R2: structured focus runtime clock drives deadline completion; a one-shot focus persistence failure produces a visible actionable error without fake completion, and explicit retry durably completes exactly once.

### C — running UI completion gate and durable interruption

1. On one real backend, seed authoritative task A as `in_progress`, with its step complete and one durable `running` focus session bound to A.
2. Mount one real `AppRoot` and complete restore. While focus is running, `完成任务` must not render; task status and raw task bytes stay unchanged, focus history remains one running session, and restore consumes no new ID.
3. Interrupt through the public UI. Only after the interrupted session is durably persisted may `完成任务` appear and become enabled; task status/bytes remain unchanged until that public action is pressed.
4. Press the newly rendered public completion action. A byte-only restart must preserve task A as `completed` and exactly the same single `interrupted` focus history; no focus ID or history entry is added.

R2R1 C locks the running-state UI gate. The independently reviewed GAP-P0-05R3 case 2 owns pending/error completion hiding. A direct stale-node second-guard fixture is not expressible through the current public UI without violating real button eligibility, so final independent production code review must confirm as a hard release condition that both completion rendering and the completion handler consume the same current `taskCompletionBlocked` predicate/ref.

## Locked inventory

The candidate manifest must contain exactly these three regular LF/no-BOM files:

1. `GAP_P0_05R2R1_TEST_SPEC.md`
2. `tests/gap-p0-05r2r1/appRootFocusResilience.contract.test.tsx`
3. `tests/gap-p0-05r2r1/gapP005R2TestKit.ts`

`GAP_P0_05R2R1_LOCK_CHANGELOG.md` is intentionally excluded from the candidate self because it records the self digest.

## Verification gate

- Run only the isolated R2R1 Jest root once.
- Run TypeScript `tsc --noEmit` once.
- Do not run GAP-P0-05R2, GAP-P0-05R1, GAP-P0-05R3, Phase4, or the full suite.
- Any production authorization requires one fresh independent review of the resulting R2R1 candidate.
