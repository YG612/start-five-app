# GAP-P0-09R2 — durable directed-start recovery contract

## Scope

This correction covers only the two durable recovery windows left open after
GAP-P0-09R1. It uses the exported `createDayClosureService` dependency boundary,
public AppRoot/UI, structured clocks, and byte restarts. It does not inspect
persistence keys or envelopes, count raw writes, use private React contexts, or
depend on timers or scheduling races.

## Contract cases (exactly two tests)

1. Select task A on day one. On day two, reject the exported
   `startSelectedTask` dependency once, after the closure service has durably
   entered `starting`. Across a byte restart, `load()` must retain the original
   day key, exact target A, and operation ID. Public AppRoot must expose the
   explicit continue CTA. Retrying through that CTA starts exact A, confirms an
   active focus for A, consumes the intent, and a further byte restart neither
   replays the CTA nor starts B.
2. Select A, then make A terminal so B becomes the current recommendation.
   Reject B's selected-task start once. The recovery record must retain the
   original closure day key, exact target B, and one stable operation ID while B
   remains pending and no active focus exists. After a byte restart, explicit
   retry starts exact B and consumes the same intent.

## Controlled run

Run TypeScript once and this test file once. Production recovery changes were
already present before this R2 asset was authored, so the first isolated test
execution is expected to be green; any red result is recorded honestly and
fixed only if it identifies a contract or fixture defect.

