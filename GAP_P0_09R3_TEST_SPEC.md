# GAP-P0-09R3 — same-session fallback recovery UI contract

## Scope

Exactly one exported `TaskWorkspaceScreen` component test covers the missing
same-session recovery branch. The test drives public component props and the
exported runtime-hook seams only; it does not inspect private React contexts,
persistence envelopes, timers, or AppRoot scheduling.

## Contract case (exactly one test)

Given a next-day `resolved_deleted` record for unavailable task A and current
recommendation B, the first press of `开始当前推荐5分钟` rejects after the public
day-closure service has durably moved to `starting` B. The screen must reload
the public snapshot in the same mounted session, replace the fallback CTA with
`继续明日第一项：B` / `继续开始明日第一项5分钟`, and must not keep offering
`开始当前推荐5分钟`. Pressing the continue CTA then starts exact B and consumes
the intent.

## Controlled run

Run only this test file once against current production. Its initial expected
state is red until the rejected fallback-start branch reloads the public
day-closure snapshot. Do not run broad or unrelated suites for this candidate.
