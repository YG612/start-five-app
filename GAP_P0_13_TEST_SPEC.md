# GAP-P0-13 — local reminder preferences tests-first contract

## Scope

This slice turns the fixed `08:00Z` tomorrow-first action into a small,
re-enterable consumer preference flow. It keeps the existing day-closure
target, reminder scheduling state machine, stable logical notification ID,
permission policy, and notification-tap route. It does not add recurring
weekday reminders, multiple reminders, native timezone broadcasts, account or
cloud settings, or a general settings framework.

`StartFiveAppDependencies` gains only these optional public time seams when
`tomorrowFirstNotifications` is present:

```ts
currentTimeZone(): string
resolveLocalTrigger(input: {
  closureDayKey: string;
  wallClockTime: string; // canonical HH:mm
  timeZone: string;
  now: string;
}): string // a future ISO instant
```

Supplying exactly one of the two time seams is rejected synchronously with
`TOMORROW_FIRST_TIME_SEAMS_PARTIAL`, before any platform scheduling call.

The timezone model is **follow-device**. The resolver owns calendar and DST
gap/overlap policy. Product code must not bind tests or behavior to the host
process timezone. A missing pair preserves the predecessor's UTC-compatible
behavior; a partially supplied pair is invalid. Every foreground/cold-start
reconciliation calls `currentTimeZone()`, re-resolves the instant, and updates
the durable preference when the device zone changed. The app does not promise
to react while it is not running; native background `TIMEZONE_CHANGED`
handling is out of scope.

`resolveLocalTrigger` must return a parseable ISO instant strictly later than
its input `now`. A non-ISO or `<= now` result fails with the stable public
category `LOCAL_TRIGGER_NOT_FUTURE`; the preference and existing logical
reminder remain unchanged and the UI offers an understandable retry whose
accessibility label preserves that stable category. The
application service, rather than the platform bridge, enforces this boundary.

## Preference and UI semantics

- The durable tomorrow-first reminder preference advances to version 2 and
  contains the exact closure target, enabled state, canonical local wall-clock
  time, and the timezone/resolved instant used for the last convergence.
- The executable three-case suite does not claim to manufacture a legacy v1
  record. Final production review must verify that the strict parser accepts a
  valid v1 preference, migrates it atomically to v2 using `08:00` and
  `currentTimeZone()`, preserves enabled/target/reason, and keeps backup
  validation compatible with both versions until migration completes.
- The default wall-clock time is `08:00`. Time is a preference, not a new
  reminder identity: the logical ID stays `tomorrow-first:<closure-dayKey>`.
- The workspace exposes a re-enterable `提醒设置` panel. Its field is labelled
  `提醒时间`, and the user-visible summary uses `明日提醒：约 HH:mm` because OS
  delivery is not promised to the minute. Actions are `开启提醒`,
  `保存提醒时间`, `关闭提醒`, and `返回任务工作台` as applicable.
- Only a valid canonical `HH:mm` is saved. Changing time or timezone replaces
  the same logical reminder; it never creates a second active logical reminder.
  Byte restart with unchanged semantics is a no-op.
- Closing immediately cancels the logical reminder but never clears or changes
  the tomorrow-first selection. Reconciliation while disabled never requests
  permission. Re-enabling is an explicit user action and is the only path that
  may request `not_determined` permission; a denied result stays nonblocking and
  does not form a prompt loop in the session.
- Concurrent/rapid saves are monotonic: the last accepted user value wins in
  durable UI and scheduling state even when an older replace completes later.
  Timezone/DST/past-time recalculation preserves that wall-clock value. An
  invalid resolver result is not an accepted value and cannot cover the last
  valid schedule.

## Public contract — exactly three tests

1. Select A publicly, open reminder settings, enable the default local `08:00`,
   change it to `09:30`, and byte-restart. The stable logical ID has the exact
   injected local resolution, the UI retains `约 09:30`, and unchanged startup
   reconciliation makes no duplicate logical replacement.
2. Close an enabled reminder and prove the notification is cancelled while A
   remains the selected pending tomorrow-first task. Disabled reconciliation
   does not prompt. Only pressing `开启提醒` requests `not_determined` permission;
   denial is nonblocking, a repeated press does not loop, and the task/focus
   core remains usable.
3. Hold an older platform replacement while two UI saves are issued, then
   release it and require the last wall-clock value to win. Cold/foreground
   reconciliation after an injected timezone/DST change and after the resolved
   occurrence has passed must call the public resolver again and replace the
   same logical ID with its new future instant—without using the host timezone.
   A subsequent UI save whose resolver result is in the past shows a retryable
   error and leaves that valid schedule untouched; restoring the resolver and
   retrying converges the same logical ID to a strictly future instant.

## Test boundary and controlled evidence

The suite uses the real `createStartFiveApp`, `AppRoot`, visible UI, public task
service, public notification scheduler contract, byte restart, structured
clock, and the two time seams above. It does not read a private persistence key
or envelope, raw backend writes, or a raw notification call count. It uses no
sleep, fake timers, native implementation, or host timezone.

After the fixture typechecks, run only `tests/gap-p0-13` once with an explicit
candidate root, for example `jest --runInBand --coverage=false --roots
tests/gap-p0-13`. The legal red is
the absent reminder-settings UI/time seam and associated preference behavior.
Do not run old regressions, quality gates, native builds, or repository-wide
tests for this candidate.

## Frozen predecessor

- GAP-P0-12 R3 candidate self:
  `9937444684ff42bf076bce3c7aebc1d3493a9cc4de653dc44a7a0377dad8d8c8`

## Candidate evidence

- TypeScript: pending the single targeted typecheck.
- Isolated Jest: pending the single legal-red run.
- Candidate manifest: pending evidence capture; exactly this specification,
  one test kit, and one exactly-three-test suite.
