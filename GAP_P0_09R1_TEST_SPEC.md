# GAP-P0-09R1 — Day closure and directed next-day focus corrected tests-first contract

## Controlled correction

The prior GAP-P0-09 candidate self
`a9a16d829ddf12086195bb132afbf166edb846c9e960a59bb3dcf443e9528fe6`
is **REVIEW FAILED BEFORE ACCEPTANCE / NEVER ACCEPTED**. Its Test 2 verified
only the post-press result and therefore could not prove that the fallback task
was still pending and no focus session was already visible before the recovery
CTA was pressed.

This R1 correction changes only that public precondition oracle. It does not
change Test 1, the shared kit, production, private seams, or persistence
assumptions.

## Scope and invariants

This gap drives `AppRoot`, visible UI, the public task service, structured
clocks, and byte restarts. It must not use private React contexts, persistence
keys/envelopes, sleeps, fake timers, or raw write counts.

- “Today” remains the existing UTC day (`now().slice(0, 10)`). Time-zone
  configuration is deliberately outside this slice.
- Ending a day summarizes already-durable completed tasks and acknowledged
  focus receipts. Only active (`pending` or `in_progress`) tasks are eligible
  as tomorrow's first item; completed and soft-deleted tasks are excluded.
- Re-render and byte restart converge to one selected task for that UTC day.
- On the next UTC day, the directed CTA starts the selected task itself, even
  when the ordinary recommendation points to another task.
- The directed-start intent is consumed only after the exact task start and an
  active focus session are confirmed. Task and intent persistence are separate;
  tests lock stable operation identity and final convergence, not a transient
  cross-store atomic state.
- If the selected task becomes completed or deleted before the next day, the
  app presents an explicit unavailable state and permits reselection or a
  one-tap start of the current recommendation; it never strands the user.

## Contract cases (exactly two public AppRoot/UI tests)

1. With unfinished A/B, completed C, and one acknowledged receipt, enter day
   closure from History. Verify the completion/focus summary, exclude C from
   candidates, select A, and retain exactly A across same-day re-render and
   byte restart. After crossing the UTC day boundary, verify the directed CTA
   starts A rather than recommended B, consumes once, and converges after
   restart with one history receipt and correct task/focus state.
2. Select A from the Workspace day-closure entry, then soft-delete A through
   public UI before the next day. After the UTC boundary, verify the explicit
   unavailable state and recovery routes. Immediately before pressing the
   current-recommendation CTA, visible UI must show no focus session for B and
   the public `service.getState()` must report B as `pending`; only then may the
   one-tap action start B. Verify restart convergence without a dead page or
   replayed intent.

## Controlled-run policy

Run TypeScript once and only Test 2 once. A missing public production entry may
remain the expected actionable red before the corrected precondition oracle is
reached. Do not run broad, registry, quality-gate, native, or unrelated suites.

## Frozen predecessor selves

- GAP-P0-09 prior candidate: `a9a16d829ddf12086195bb132afbf166edb846c9e960a59bb3dcf443e9528fe6`
  — **REVIEW FAILED BEFORE ACCEPTANCE / NEVER ACCEPTED**
- GAP-P0-08R1: `8e066a4bab0d505b7d1b46ce443d385390dc8ca358b0e69508572a8840afb24a`
- GAP-P0-08R2: `df3b3e738f29b4f13aebf8657e1b48bdb424a785947ae7981745d6ddc20ef995`
- GAP-P0-07R2: `a78b01e980c301c712bf6ec9553152b5c189e3c7eea45861a8c1e0f3b1d29c8e`

## R1 candidate outcome

The exact TypeScript and isolated Test 2 outcomes are recorded in the excluded
R1 lock changelog after their one permitted execution.
