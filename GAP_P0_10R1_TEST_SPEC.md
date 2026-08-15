# GAP-P0-10R1 — reminder convergence and failure-classification contract

## Scope

Exactly three deterministic tests cover recovery gaps left by GAP-P0-10. They use only the exported tomorrow-first reminder service, the injected backend/notification contracts, logical scheduler state, and exported `TaskWorkspaceScreen` props. They do not inspect persistence keys/envelopes, backend write counts, private React context, timers, or native vendor details.

## Locked cases

1. **Orphan recovery.** After public `enable` has durably scheduled an exact tomorrow-first target, a byte restart receives a day-closure snapshot with no record. Public `reconcile` must cancel both the logical platform reminder and its durable scheduling state and return `idle`. A second byte restart reads the public scheduling snapshot as disabled; reconciliation with the still-empty closure must remain idle with no platform reminder and no new logical replacement.
2. **Permission drift.** After a granted reminder is scheduled, the injected permission changes to `denied` while the target remains otherwise usable. Explicit public `reconcile` must re-read permission, cancel the reminder, converge durable state to denied/disabled semantics, and never request permission from a background reconciliation. A byte-restarted service and repository must retain that denied/disabled state; reconciling the same exact target must not schedule it again.
3. **Failure classification and retry UI.** When `TomorrowFirstReminderService.enable` rejects with a scheduler/repository error, the mounted workspace must show `提醒设置失败，请重试` plus `重试设置明日提醒`; it must not show the permission-denied copy. Retrying through that visible action invokes `enable` again and clears the error after success.

## Minimal production contract

- Reconciliation owns orphan cleanup even when the current day-closure record is absent.
- Reconciliation re-checks current permission without prompting and cancels a formerly scheduled reminder after permission drift.
- Workspace reminder state distinguishes `denied` results from operational exceptions, exposes a visible retry, and guards mounted state writes.

## Controlled run

Run only `tests/gap-p0-10r1/tomorrowFirstReminderRecovery.contract.test.tsx` once, then run TypeScript once. Current GAP-P0-10 production is expected to fail all three behavioral cases; no older regression or native build belongs to this candidate run.

## Candidate evidence

- Isolated Jest: pending controlled run.
- TypeScript: pending controlled run.
