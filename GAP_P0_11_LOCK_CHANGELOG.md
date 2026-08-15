# GAP-P0-11 candidate lock changelog (excluded from lock)

1. Isolated red run: exactly `tests/gap-p0-11/firstActivation.contract.test.tsx` ran with an explicit `tests/gap-p0-11` root; all 3 scenarios reached the current application and failed at the missing first-activation UI. TypeScript completed with 0 errors.
2. Observed legal reds: a brand-new enabled composition still renders `任务工作台`; therefore `开始我的第一项`, `第一项任务标题`, and `暂时跳过` are absent. No fixture, import, private-key, timer, or notification-permission failure was observed.
3. Smallest production contract: honor optional `public.firstActivation`, distinguish known-new from upgrade/unknown state fail-closed, persist skip/complete monotonically, and create plus precisely start one stable first task before completing activation. The task-created/activation-marker failure invariant remains a static requirement because no deterministic public failure seam exists.

Command setup note: two earlier Jest invocations stopped in configuration validation with 0 tests executed (missing explicit config, then a file mistakenly supplied as a root). They are not red evidence and did not exercise the fixture or product.
