# GAP-P0-05R4 synchronous restore-generation invalidation contract

## Status and authority

Status: **PENDING ONE INDEPENDENT REVIEW / NO PRODUCTION AUTHORITY**.

R4 is additive test-only work. It changes no production or frozen asset and contains exactly one `it(...)` test. It depends on, but does not include or modify, these frozen candidate selves:

- GAP-P0-05R3: `4827837e39c8b3393ed21962f246345df315d60f2a64bc4744a16f568bff81a1`;
- GAP-P0-05R2R1: `9031255d2a10c53ce27fa6d12d4338b1ff1b794fc3554b59428ef37827045048`;
- GAP-P0-05R2: `235a5782e22d0f81cc754c89d833f8dae8fa0aecbc5e92fb164a2ad2cb244e84`.

The prior R4 candidate self `a06c8d476ce46a3b619fb17d141f43e7c6dcbafe8991f27374d55be3470a84ba` is **REVIEW FAILED BEFORE ACCEPTANCE / NEVER ACCEPTED**. Its final-state-only ordering could allow a shared tail to serialize the stale write before the main write and therefore admit a false green. It grants no test or production authority.

## Single locked contract

On one real backend and one real `createStartFiveApp(...).AppRoot`:

1. Seed one authoritative `in_progress` task and one old durable running focus session S. Set the injected clock to S's deadline, so S is expired.
2. Start restore with a one-shot focus `getItem` gate that already captured S's old bytes but defers returning them. The public UI is mounted while restore remains pending.
3. Once the old restore get has entered, arm a second one-shot backend gate that intercepts only the next focus `getItem`. Use public `推荐下一项` and `开始5分钟`; the main start reaches its first focus I/O and remains stopped at that second get gate.
4. While the main get is still pending, release the old captured S bytes and let the old restore continuation fully settle. The same mounted public `重试恢复专注` pending state must clear (plus an explicit microtask barrier). Relative to the pre-start baseline, focus writes and removes must remain exactly zero. This proves the public start invalidated the old generation before entering main focus I/O.
5. Release the main get. The public start must durably complete, and the late old restore result must not append, overwrite, or publish stale UI.
6. Public history and two byte-only backend restarts must contain exactly S as `completed` and one new session N as the only `running` entry. N keeps its generated ID and five-minute deadline; there is no duplicate history or extra focus write/remove. The mounted UI remains on N.

The accepted repair is generation invalidation at public start entry, before any main focus I/O. Waiting for restore readiness, hiding/disabling public start while restore is pending, or relying only on a post-I/O generation check does not satisfy R4.

## Determinism and boundaries

- Real AppRoot, public accessible UI actions, real in-memory backend, explicit ISO/runtime clocks, and one-shot storage gates only.
- No sleep, fake/global timer, process-level rejection listener, network, private production import, test-only production grammar, or production branch.
- The test does not prescribe whether valid later storage work uses serialization or CAS; it locks synchronous generation ownership and the final durable linearized result.

## Candidate inventory and verification

The minimal R4 candidate contains only these two new regular LF/no-BOM files:

1. `GAP_P0_05R4_TEST_SPEC.md`;
2. `tests/gap-p0-05r4/appRootRestoreStartGeneration.contract.test.tsx`.

Only the isolated R4 Jest root and main `tsc --noEmit` were run. The corrected isolated R4 root completed normally in 6.459 seconds with **1 suite failed / 1 test failed / 0 snapshots**. It produced the exact current-production red without tail-order ambiguity: the main focus get entered and remained pending; after the old get was released, public restore retry disappeared and the explicit barrier completed, but the stale restore had added one focus write instead of zero. After the main get was released, N running plus S completed, UI, public history, ID/deadline, and both byte-only restarts were all correct, while the total focus writes remained two instead of the required one. Focus removes stayed zero. Main `tsc --noEmit` exited 0.

No R3, R2R1, R2, R1, Phase4, broad suite, or quality gate was run. One fresh independent reviewer must accept the exact candidate before any production authority exists.
