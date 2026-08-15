# GAP-P0-05R4 corrected candidate lock changelog

## Status

**PENDING ONE INDEPENDENT REVIEW / NO PRODUCTION AUTHORITY.**

Candidate manifest self:
`54e242d12c03ad16a4f25a6f660f569b0fbda9e15d93cacef3000a9dc84ffbfb`.

This changelog is excluded from the two-entry candidate manifest.

## Rejected predecessor

Prior R4 self `a06c8d476ce46a3b619fb17d141f43e7c6dcbafe8991f27374d55be3470a84ba` is **REVIEW FAILED BEFORE ACCEPTANCE / NEVER ACCEPTED**. Its old ordering could allow a shared tail to serialize the stale restore before the main write and admit a false green. It granted no test or production authority.

## Controlled correction

R4 still adds only one spec and exactly one real-AppRoot test. It modifies no production or frozen R3/R2R1/R2/R1 asset.

After the old restore focus get is captured and pending, the corrected test arms a second one-shot gate for the next focus get. Public start reaches its first main focus I/O and stops there. The old restore read is then released and is proven settled by the same-mount public restore-retry state clearing plus an explicit microtask barrier. While the main get remains pending, focus write/remove deltas must be zero. Only then is main get released, after which all durable/UI/restart controls must hold.

## Current-production red evidence

The sole corrected R4 run completed normally in 6.459 seconds:

- **1 suite failed / 1 test failed / 0 snapshots**;
- main focus get entered and stayed pending;
- old restore settled, but made one focus write instead of zero; removes stayed zero;
- after main release, public history and two byte-only restarts correctly held N running plus S completed, with the expected ID/deadline and running UI; and
- total focus writes were two instead of exactly one.

This is the precise missing synchronous pre-I/O generation invalidation. Main `tsc --noEmit` exited 0. No older root, broad suite, Phase4, or quality gate was run.

## Mechanical result

The candidate contains exactly two regular LF-only, BOM-free new assets and exactly one `it(...)`. It contains no sleep, fake/global timer, process rejection listener, network call, private production import, focused/skipped test, or production test branch. One fresh independent reviewer must accept the exact self above before production work may begin.
