# GAP-P0-11R1 — authoritative task presence and retryable bootstrap

## Controlled correction

The prior candidate self `acd0369a98d724fb944f22f22e6a948b9007731ae5c9e2d9f830e010a184ae60` is **REVIEW FAILED BEFORE ACCEPTANCE / NEVER ACCEPTED**. It imported the not-yet-existing production type and therefore made the tests-first candidate fail TypeScript before production implementation. This correction replaces only that import with a structurally equivalent local public-contract interface. Both scenarios, dependency injection shape, UI oracles, and required production export remain unchanged.

## Scope

Exactly two focused AppRoot tests close the two remaining first-activation P0 findings. They use only the exported `TaskDurablePresenceProbe` contract, a public structural fake, the existing public memory backend's generic next-read failure, visible UI, and a byte restart. They do not read or write persistence keys, envelopes, atomic records, journals, locks, backend call counts, private React context, timers, or notification internals.

## Locked cases

1. **Authoritative task presence with a missing mirror.** The application-layer boot decision must delegate durable task presence to the injected public storage-layer probe. A public fake returning `present` represents an authoritative atomic task state after byte restart even when no main mirror is observable to the application. The mounted AppRoot must not show first activation; a normal workspace or a fail-closed/error state is acceptable, and notification permission remains untouched.
2. **Retryable bootstrap read failure.** A generic fail-next-read during bootstrap must show `启动状态读取失败` and the visible action `重试首次启动检查`. Pressing that action retries in the same mounted AppRoot. Once the one-shot failure is consumed, a truly empty backend must show `开始我的第一项`, without remounting and without requesting notification permission.

## Required production contract

- Export `TaskDurablePresenceProbe` from the data/storage boundary with a public result that distinguishes `absent` from `present`; first-activation dependencies may inject this probe, and the boot decision must actually delegate to it.
- The default production probe, constructed beside task persistence rather than in React/UI code, must fail closed on read/corruption errors and recognize every durable representation that can be authoritative for the task repository: the main mirror plus published atomic authority, recoverable journal, and held/published lock state. The behavioral test deliberately does not encode those private representations; an independent static review must verify this storage-layer mapping.
- `present` can never be interpreted as a new install. `absent` is eligible for onboarding only after the other durable user-data probes also report absence.
- Bootstrap error UI owns an explicit retry callback. Retry re-runs the complete activation-marker and durable-presence check in the existing mount; it must not request notification permission.

## Controlled run

Run only `tests/gap-p0-11r1/firstActivationPresenceRecovery.contract.test.tsx` once, then TypeScript once. The expected tests-first reds are the missing public presence-probe delegation and missing retry action. Do not run older suites, quality gates, native builds, or repeat the candidate run.

## Frozen predecessor

- GAP-P0-11 candidate self: recorded by the parent freeze ledger; this R1 candidate does not alter it.

## Candidate evidence

- Isolated Jest: the corrected candidate's single controlled run executed exactly two tests; both reached the current application and retained the intended production reds. The injected public probe was called 0 rather than 1 time, and the bootstrap read-error UI lacked `重试首次启动检查`.
- TypeScript: the corrected candidate's single controlled run completed with 0 errors.
