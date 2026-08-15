# Start Five locked test contract

Status: **LOCKED after `TEST_LOCK.sha256` is generated.** Production agents must not edit this file or anything under `tests/locked/`. The lock manifest covers this document and every locked test/fixture, sorted by stable POSIX-style relative path.

## Runtime and test boundary

- Target runtime: React Native 0.86, React 19, TypeScript, Jest 29, React Native Testing Library 14.
- The app is local-first: no account and no network are required for the complete core flow.
- All domain timestamps are canonical UTC ISO-8601 strings (`Date#toISOString()`). This applies to `createTask`, `createFirstStep`, `startTask`, `completeSubtask`, and `completeTask`. Tests freeze time; production code may not read ambient wall-clock time when a clock is injected.
- Timer production default is exactly `300000` ms. A shorter duration is injectable in tests.
- Error assertions use stable error `code` values; messages and localized copy may vary.
- Paths and named exports below are the production interface. Tests intentionally fail with `Cannot find module` until production modules exist.

## Production interfaces fixed by the tests

### `src/domain/task.ts` — SF-001, SF-002

Exports `Task`, `Subtask`, `TaskInput`, `DomainError`, `createTask`, `createFirstStep`, `startTask`, `completeSubtask`, and `completeTask`.

- `createTask(input, { id, now })` trims title, creates a `pending` task, preserves binary `important`/`urgent`, canonicalizes optional `startAt`/`dueAt`, and starts with `subtasks: []` and `deletedAt: null`.
- Blank titles fail with `TITLE_REQUIRED`. Invalid `startAt`, `dueAt`, or operation `now` values fail with `INVALID_TIMESTAMP`. `startAt > dueAt` fails with `INVALID_TIME_RANGE`; equality is valid.
- `createFirstStep(task, input, { id, now })` trims a nonblank title, creates a `pending` subtask whose `taskId` equals its parent, appends it after existing subtasks, and rejects blank text with `SUBTASK_TITLE_REQUIRED`.
- The only successful completion path is `pending -> in_progress -> completed`. A `pending` task cannot complete directly, and a `cancelled` task cannot complete; both fail with `INVALID_TASK_TRANSITION`. Starting an already started task is idempotent. Completed/cancelled tasks cannot start (`INVALID_TASK_TRANSITION`). An `in_progress` task with unfinished subtasks cannot complete (`UNFINISHED_SUBTASKS`). Completing an already completed subtask or task is idempotent and must preserve the first completion timestamp.

### Compile-time public type contract

`tests/locked/contracts/publicTypes.ts` is included by `tsc --noEmit` and fixes the named exports and strict structural types. Fixtures must use `Partial<Task>` / `Partial<Subtask>` overrides and return explicit production `Task` / `Subtask` types; `Record<string, unknown>` is forbidden.

- `Subtask`: `{ id, taskId, title, status: 'pending' | 'completed', createdAt, updatedAt, completedAt: string | null }`.
- `Task`: `{ id, title, description, important, urgent, status: 'pending' | 'in_progress' | 'completed' | 'cancelled', startAt, dueAt, createdAt, updatedAt, startedAt, completedAt, deletedAt, score, scoreAwardedAt, subtasks }`; nullable time/score fields use `string | null` / `number | null`, and `subtasks` is `Subtask[]`.
- `TaskInput`: required `title`, `important`, `urgent`; optional `description`, `startAt`, `dueAt`, with time inputs accepting `string | null`.
- `DomainError` is a named runtime export whose instance extends `Error` and has readonly string `code`.
- `KeyValueStorage` strictly exports async `getItem`, `setItem`, and `removeItem`.
- `TaskRepository` strictly exports async `create`, `getById`, `list`, `update`, `softDelete`, and generic `transaction`; the transaction callback exposes the full CRUD/read/soft-delete surface.

### `src/domain/quadrant.ts` — SF-003

Exports `getQuadrant(important, urgent)` and `QUADRANT_POSITION`.

| important | urgent | quadrant | fixed grid position | order |
|---|---|---|---|---|
| true | true | `Q1` | row 0, column 0 | 0 |
| true | false | `Q2` | row 0, column 1 | 1 |
| false | true | `Q3` | row 1, column 0 | 2 |
| false | false | `Q4` | row 1, column 1 | 3 |

Only literal booleans are valid; non-booleans fail with `INVALID_QUADRANT_FLAG`.

### `src/data/taskRepository.ts` — SF-004

Exports `KeyValueStorage`, `TaskRepository`, and `createTaskRepository(storage, key?)`. The default storage key is `start-five.tasks.v1`; a supplied custom key is used exclusively and survives repository reload. Methods are async: `create`, `getById`, `list`, `update`, `softDelete`, and `transaction(work)`.

- `list()` and `getById()` hide soft-deleted records. `{ includeDeleted: true }` reveals them.
- Repeated `softDelete(id, deletedAt)` is idempotent and preserves the first deletion timestamp.
- Re-instantiating the repository over the same storage reloads equivalent data.
- Duplicate IDs fail with `TASK_ALREADY_EXISTS`; missing updates/deletes fail with `TASK_NOT_FOUND`.
- A failed mutation leaves the prior durable snapshot byte-for-byte unchanged.
- `transaction` exposes `create`, `getById`, `list`, `update`, and `softDelete`. Reads inside the transaction observe staged changes, including deletion visibility options. A thrown callback rolls back all writes and read-visible changes; success commits the complete result atomically with one storage write.

### `src/domain/nextStep.ts` and `src/domain/recommendation.ts` — SF-005, SF-006

- `selectNextStep(task)` returns the first non-completed subtask in array order, or `null`. It never returns a subtask belonging to a different task; malformed ownership fails with `SUBTASK_PARENT_MISMATCH`.
- `recommendNextTask(tasks)` first filters completed, cancelled, and soft-deleted tasks. Comparison is deterministic and lexicographic by these keys, in this exact order:
  1. already started (`in_progress`) before `pending`;
  2. important `true` before `false`;
  3. urgent `true` before `false`;
  4. due time ascending, with no due time last;
  5. creation time ascending;
  6. task ID ascending by JavaScript string comparison.
- An empty eligible set returns `null`. Input order cannot affect the result.

### `src/services/fiveMinuteTimer.ts` — SF-007

Exports `DEFAULT_DURATION_MS` and `FiveMinuteTimer`.

- Constructor accepts `{ durationMs?, now?, onFinish? }`; `durationMs` must be positive.
- `start`, `pause`, `resume`, `handleAppState('active' | 'background' | 'inactive')`, `finish`, `dispose`, and `getSnapshot` form the public API.
- Snapshot contains `state: 'idle' | 'running' | 'paused' | 'finished'`, `durationMs`, `remainingMs`, `startedAtMs`, `finishedAtMs`.
- Fake-clock time is authoritative. Paused time is excluded. Both `background` and `inactive` time count while running and neither state auto-pauses; explicitly paused timers stay paused across every app-state transition. App-state round trips must not create duplicate timers. `finish` and natural expiry invoke `onFinish` at most once. Repeated finish is idempotent. `dispose` clears scheduled work.

### `src/domain/scoring.ts` — SF-008

Exports `BASE_SCORE_BY_QUADRANT` (`Q1=35`, `Q2=45`, `Q3=15`, `Q4=5`) and `awardCompletionScore(task, completedAt)`.

- The first award returns an updated task and the matching points.
- Further awards for the same completed task return zero and preserve the original points/time.

### `src/application/coreAppService.ts` and `src/screens/CoreFlowScreen.tsx` — SF-009

- `createCoreAppService({ repository, now, idGenerator, network? })` supports these async calls without network/account dependencies: `createTask(input, { operationId })`, `addFirstStep(taskId, input, { operationId })`, `chooseRecommended()`, `startRecommended({ operationId })`, `finishStep(taskId, stepId, { operationId })`, `finishTask(taskId, { operationId })`, and `getState()`.
- `finishTask` returns `{ task, points }`. `getState` returns at least `{ tasks, totalScore }`, where `totalScore` is the sum of durable once-only awards.
- Duplicate user submissions with the same `operationId` are idempotent across service recreation for `createTask`, `addFirstStep`, `startRecommended`, `finishStep`, and `finishTask`. A duplicate produces the same result, performs no additional durable write, creates no extra child, and awards no extra score. Completion score remains durable in `getState()` across service reconstruction; retrying completion under a different operation ID returns zero additional points.
- `CoreFlowScreen` accepts `{ service }` and provides accessible controls/labels used by the locked page-flow test: `新建任务`, `任务名称`, `重要`, `紧急`, `保存任务`, `添加第一小步`, `第一小步`, `保存小步`, `推荐下一项`, `开始5分钟`, `完成小步`, `完成任务`. Its stable state text is `任务：<title>`, `小步：<title>`, `推荐：<title>`, `当前小步：<title>`, `小步状态：已完成`, and `本次积分：<points>`.
- The screen must not call a supplied `network` adapter during the core flow.

## Locked coverage map

| Requirement | Locked suite |
|---|---|
| SF-001 task/subtask validation and state machine | `tests/locked/domain/task.test.ts` |
| SF-002 UTC ISO and start/due validation | `tests/locked/domain/task.test.ts` |
| SF-003 binary four-quadrant truth table and placement | `tests/locked/domain/quadrant.test.ts` |
| SF-004 repository CRUD, soft delete, reload, idempotency, transaction | `tests/locked/data/taskRepository.test.ts` |
| SF-005 first-step ownership and next selection | `tests/locked/domain/nextStep.test.ts` |
| SF-006 deterministic recommendation and tie-breaking | `tests/locked/domain/recommendation.test.ts` |
| SF-007 timer/fake clock/pause/resume/background/idempotent end | `tests/locked/services/fiveMinuteTimer.test.ts` |
| SF-008 base score 35/45/15/5 and once-only award | `tests/locked/domain/scoring.test.ts` |
| SF-009 no-account/no-network service and screen flow, dedupe | `tests/locked/application/coreAppService.test.ts`, `tests/locked/application/CoreFlowScreen.test.tsx` |
| Strict exported TypeScript contracts and typed fixtures | `tests/locked/contracts/publicTypes.ts`, `tests/locked/fixtures/taskFactory.ts` |

## Lock and acceptance

1. `TEST_LOCK.sha256` is generated last from `TEST_SPEC.md` plus every file under `tests/locked`, sorted by stable relative path.
2. Any later hash mismatch is a process failure, even if tests pass.
3. Implementation acceptance requires the unchanged locked suite to pass, typechecking to pass, and an independent review.
