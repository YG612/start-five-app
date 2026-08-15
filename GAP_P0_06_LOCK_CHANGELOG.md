# GAP-P0-06 candidate lock changelog

## Status

**PENDING ONE INDEPENDENT TEST REVIEW / NO PRODUCTION AUTHORITY.**

Candidate manifest self:
`74747883719b353243aacdbae245e29607d2f268404e2564186dc1495605873d`.

This changelog and the candidate manifest itself are excluded from the three-entry manifest.

## Candidate scope

The candidate adds only one test specification and one isolated test root containing a small public-AppRoot testkit plus one suite with exactly six user journeys. It changes no production file, existing test, accepted lock, registry, package file, report, or sibling project.

The six locked journeys are:

1. cold-start projection of all active tasks into 救火/成长/干扰/清理, with completed and soft-deleted tasks excluded;
2. UI creation into the correct quadrant with byte-only restart persistence;
3. arbitrary-card detail selection with task-bound step, score, and focus context;
4. title/importance editing, quadrant movement, one-shot write failure, no false UI, and explicit retry;
5. delete confirmation/cancel, soft-delete, recommendation removal, and restart persistence; and
6. existing recommendation winner to existing five-minute focus, including byte-only running-session restore.

All final observations use `createStartFiveApp(...).AppRoot` and the same injected backend. Fixture preparation uses only public services. The testkit never imports a private Provider/context or hand-writes task/focus storage keys or envelopes.

## Controlled fixture correction before signing

The first diagnostic run found four expected missing-workspace failures and two fixture-preparation failures with `TASK_OPERATION_LEDGER_STATE_MISMATCH`. Before any candidate was signed, the two fixtures were corrected only by completing their lifecycle-ledger seed mutations before legacy CoreAppService substep/start controls mutate the same durable snapshot. Operation IDs and all six UI oracles were unchanged.

The sole post-correction GAP-P0-06 run then completed normally:

- **1 suite failed / 6 tests failed / 0 snapshots**;
- all public seed controls completed without repository, clock, ID, or fixture failure;
- two tests failed on missing `任务工作台`;
- two tests failed on missing public quadrant-card controls; and
- two tests failed on missing automatic `今日推荐` UI.

This is the intended legal red against the current single-task CoreFlow UI. No further GAP-P0-06 run was performed.

## Direct controls

- Main `tsc --noEmit`: exit 0.
- The single directly related Phase4 AppRoot control: **1 suite passed / 7 tests passed / 0 snapshots**.
- No broad regression, quality gate, network test, fake timer, native build, or unrelated suite was run by this test-author task.

## Mechanical result

The candidate contains exactly three new manifest entries, one describe block, and exactly six `it(...)` cases. It uses an explicit ISO clock and explicit ID sequences, a deterministic focus-runtime clock subscription, public service seed helpers, and byte-copy restarts. It contains no sleep, Jest fake timers, process-level rejection listener, network call, focused/skipped test, or production test branch.

One fresh independent reviewer must accept the exact manifest self above before a production agent may use these tests. Once accepted, the three candidate assets are immutable for the repair cycle.
