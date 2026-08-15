# GAP-P0-05 AppRoot focus-session integration test specification

## Status and authority

Status: **PENDING ONE INDEPENDENT TEST REVIEW / NO PRODUCTION AUTHORITY.**

The original candidate manifest self
`428ba1ecf6bf19c895368367afb125588af92cfe114e92c5607b3bd7f0d04e22`
failed independent review before acceptance because its failure/retry case did
not distinguish a task-write failure from a later focus-write failure. It is
**REVIEW FAILED BEFORE ACCEPTANCE / NEVER ACCEPTED** and grants no authority.

GAP-P0-05 is a small, additive test-first slice for the missing integration
between the real application root's "start five minutes" journey and the
already-implemented focus-session service, repository, and persistent storage.
This specification and its tests grant no production authority until the exact
candidate bytes pass one independent test review and are frozen.

This slice must not modify production, GAP-P0-04, Phase4, GAP-P0-02B, or any
earlier test or lock. It reuses the established Phase4 `AppRoot` harness and
the accepted GAP-P0-02B public focus-session API; it does not duplicate or
reopen focus-session storage internals.

## Integration boundary

The preferred production seam is a private AppRoot provider/context that owns
the focus-session runtime assembled over the same injected backend as the core
task runtime. Public `CoreFlowScreenProps` and `CoreAppService` APIs should
remain byte-compatible unless an independently justified public contract is
required.

Creating the composition and constructing its React root element, before mount,
must perform no backend I/O. Runtime work begins only from an explicit user
action or an explicit post-mount hydration effect. All observable state must
come from successful public service calls, not from a parallel in-memory timer
model.

## Locked behavioral matrix (maximum six tests)

The candidate suite will contain no more than these six tests:

1. **Same-backend assembly and construction purity.** `AppRoot` assembles the
   task and focus-session runtimes over the same injected backend identity,
   while construction/render itself performs zero backend reads, writes, CAS
   operations, clock calls, or ID generation.
2. **Persist-before-running start.** One explicit start action creates exactly
   one running five-minute focus session bound to the selected task. The UI may
   display `running` only after the public start operation has durably
   succeeded; no duplicate session or parallel timer is created.
3. **Restart recovery.** A byte-only restart over the same persisted backend
   recovers the same session ID, task ID, and running status, and derives the
   correct remaining duration from an explicit injected clock.
4. **Exactly-once expiry.** Advancing an explicit manual clock to the deadline
   and invoking the public refresh/expiry boundary completes the session once.
   Repeated refreshes must not duplicate completion, persistence, or score
   effects.
5. **Interrupt then reopen.** Interrupting the running session persists the
   interruption and permits a later explicit start to create one new running
   session for the task without reviving or mutating the interrupted session.
6. **Task-first and focus-persist failure/retry.** One test executes two fresh
   backend branches completely before comparing their observations. A failure
   of the public task snapshot write must leave the exact task bytes and status
   unchanged, create no focus history, show no running UI, expose the error and
   keep retry enabled; retry must persist one in-progress task and consume one
   focus ID for one running session. Separately, a failure of the public focus
   snapshot write must observe the task already durably in progress, allow that
   recoverable partial state, create no focus history or running UI, expose the
   error and keep retry enabled; retry must create one running session without
   a second task-record side effect. These branches lock the order task commit,
   focus commit, then running UI, and reject focus-first split history.

## Determinism and fixture rules

- No sleep, wall-clock waiting, fake timers, timer advancement, network, or
  native module is permitted.
- Time and IDs are explicit injected dependencies with exact consumption
  counters.
- Failure injection is one-shot and addressed only by the two accepted public
  task/focus storage keys; it must not inspect serialized grammars, retries,
  queues, or any production-private key.
- Tests assert public AppRoot/UI behavior plus the accepted focus-session
  service/repository API and byte-only restart behavior.
- The fixture must distinguish construction, explicit start, restart,
  refresh/expiry, interrupt, and retry phases without self-fulfilling state.
- Existing GAP-P0-02B tests remain the authority for lower-level session
  repository/storage behavior; this slice asserts only real-app wiring and the
  user-visible lifecycle bridge.

## Required verification before candidate review

The test author must run only:

1. the new `tests/gap-p0-05` root;
2. main `tsc --noEmit`;
3. the focused Phase4 `startFiveApp` regression; and
4. the focused Phase4/CoreFlow regression relevant to the start-five journey.

The expected pre-repair result is at least one legitimate GAP-P0-05 feature
failure with deterministic normal completion, while distinguishing controls
and focused old regressions remain green.

## Final candidate inventory and recorded evidence

The exact candidate inventory is this specification plus the two regular
TypeScript files recursively below `tests/gap-p0-05/`:

| File | Purpose | Tests |
| --- | --- | ---: |
| `appRootFocusSession.contract.test.tsx` | real AppRoot start, restart, expiry, interrupt, and two-branch failure/retry bridge | 6 |
| `gapP005TestKit.ts` | same-backend byte restart, public focus oracle, explicit clock/IDs, set gate and one-shot failure | helper |

The final isolated new-root run used the pinned project Jest configuration,
`--runInBand`, zero coverage, `--detectOpenHandles`, and a roots override limited
to `tests/gap-p0-05`. It completed normally in 33.656 seconds with zero
snapshots and the required distinguishing result:

- 1 suite / 6 tests;
- 1 passing construction-purity control; and
- 5 legitimate feature failures: no focus persistence boundary is entered,
  restart remains idle instead of restoring the running session, deadline
  hydration leaves the durable session running, an existing durable session is
  not exposed for interruption, and both fresh failure branches prove the AppRoot
  still stops at its in-memory timer: the task-write retry reaches in-progress
  without a focus record, while the focus-write branch leaves the injected
  failure untouched, exposes false running, and disables retry.

Main `tsc --noEmit` completed with exit 0 and zero diagnostics against the same
final TypeScript bytes. The focused Phase4 `startFiveApp` suite passed 7/7, and
the focused locked `CoreFlowScreen` suite passed 2/2, both with zero snapshots.
No GAP-P0-02B bulk suite, broad suite, formal quality gate, or registry command
was run.

## Recommended production repair boundary

The minimum production boundary is `src/app/startFiveApp.tsx`, one private
AppRoot focus-runtime provider/context (new file or equivalent), and the
internal implementation of `src/screens/CoreFlowScreen.tsx`. The AppRoot should
compose `createPersistentFocusSessionStorage`, `createFocusSessionRepository`,
and `createFocusSessionService` over the exact injected backend, then expose
start/restore/expiry/interrupt state privately to the screen. The existing
public `CoreFlowScreenProps` and `CoreAppService` contracts should remain exact.
No change is expected in the already-tested GAP-P0-02B service, repository, or
storage semantics unless the frozen tests prove otherwise.

Candidate status remains **PENDING ONE INDEPENDENT TEST REVIEW / NO PRODUCTION
AUTHORITY**. Production repair is forbidden until that independent review
accepts the exact candidate manifest self.
