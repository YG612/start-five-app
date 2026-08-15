# GAP-P0-09 candidate lock changelog (excluded from lock)

1. Isolated red run: `tests/gap-p0-09` was the only new test root; it produced 2/2 legitimate red cases. TypeScript completed with 0 errors.
2. Observed failure: Test 1 reached acknowledged focus history with completed C plus active A/B, then the public History screen lacked `结束今天`. Test 2 reached the Workspace with A/B, then the public Workspace screen lacked `结束今天`.
3. Smallest production contract: add the public day-closure entry and flow, persist one eligible tomorrow-first selection, surface its next-UTC-day directed start, consume it only after the selected task and active focus are confirmed, and provide explicit reselection/current-recommendation recovery when that selection becomes unavailable.

Excluded boundaries: this slice retains the existing UTC date rule (`now().slice(0, 10)`) and does not lock transient atomicity across separate task and intent stores.
