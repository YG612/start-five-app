# GAP-P0-10 candidate lock changelog (excluded from lock)

1. Isolated red run: only `tests/gap-p0-10/tomorrowFirstNotifications.contract.test.tsx` ran under the `tests/gap-p0-10` root; all 3 scenarios produced legitimate capability reds. TypeScript completed with 0 errors.
2. Observed failures: the existing app has no `设置明日 08:00 提醒` action, and notification cold/hot return does not route to the exact `明日第一项` card.
3. Smallest production contract: keep day closure nonblocking when permission is denied, schedule or replace one logical reminder for the exact persisted target, cancel unavailable targets, hydrate without duplicate scheduling, and route notification taps to the exact card without auto-starting focus.

Excluded boundaries: this slice does not lock OS delivery guarantees, background execution timing, notification-vendor implementation details, or any change to the existing UTC day rule.
