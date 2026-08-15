# Start Five review-1 locked regression contract

Status: **LOCKED after `REVIEW1_LOCK.sha256` is generated.** Production and repair agents must not edit this file or anything under `tests/review1/`. The review-1 manifest covers this document and every file below `tests/review1/`, sorted by POSIX-style relative path.

This contract supplements, and never replaces, the original `TEST_SPEC.md` and `tests/locked/**`. Acceptance requires both locked suites to pass.

## R1-A — The five-minute timer is reachable from the product flow

`CoreFlowScreen` must connect the existing product action `开始5分钟` to an observable timer controller. The screen keeps its original `{ service }` contract and may additionally accept these test seams (equivalent names are not permitted because the regression tests compile against them):

```ts
type CoreFlowTimerState = 'idle' | 'running' | 'paused' | 'finished';

type CoreFlowTimerSnapshot = {
  state: CoreFlowTimerState;
  durationMs: number;
  remainingMs: number;
};

type CoreFlowTimerController = {
  getSnapshot(): CoreFlowTimerSnapshot;
  subscribe(listener: (snapshot: CoreFlowTimerSnapshot) => void): () => void;
  start(): void;
  pause(): void;
  resume(): void;
  handleAppState(state: 'active' | 'background' | 'inactive'): void;
  dispose(): void;
};

type CoreFlowAppStateSource = {
  addEventListener(
    event: 'change',
    listener: (state: 'active' | 'background' | 'inactive') => void,
  ): {remove(): void};
};
```

`CoreFlowScreenProps` adds optional `timerController?: CoreFlowTimerController` and `appStateSource?: CoreFlowAppStateSource`. Production defaults must adapt `FiveMinuteTimer` and React Native `AppState`; tests inject deterministic substitutes where isolation is useful.

`src/screens/CoreFlowScreen.tsx` also exports the minimal auditable default factory below. It must wrap a real `FiveMinuteTimer`, publish snapshots after controller transitions and natural completion, and remain deterministic with the injected duration/clock.

```ts
function createDefaultCoreFlowTimerController(options?: {
  durationMs?: number;
  now?: () => number;
}): CoreFlowTimerController;
```

When `timerController` is omitted, `CoreFlowScreen` must create this default controller, subscribe to it, and use React Native `AppState` as the default lifecycle source. The regressions exercise this no-injection production path with fake time and prototype observation; they never wait five real minutes.

- The timer starts only after `service.startRecommended(...)` succeeds. A rapid duplicate press and a later press during the same session must not start either the service action or timer twice.
- If `service.startRecommended(...)` rejects, `timer.start()` is not called, the visible state remains `未开始`, and the start action becomes available for a later successful retry.
- The observable state is rendered with accessibility label `5分钟计时状态` and stable text `计时状态：未开始`, `计时状态：进行中`, `计时状态：已暂停`, or `计时状态：已结束`.
- Remaining time is rendered with accessibility label `5分钟剩余时间` and stable `剩余时间：MM:SS`, rounding any positive partial second up so the display never reaches zero early. Fixed boundaries include `60001 ms -> 01:01`, `1 ms -> 00:01`, and `0 ms -> 00:00`.
- A running session exposes `暂停计时`; a paused session exposes `继续计时`. These controls call the corresponding controller methods once.
- Natural completion renders the live feedback `5分钟已结束，可以继续下一小步。` and `剩余时间：00:00`.
- While mounted, every `background`, `inactive`, and `active` notification is forwarded in order to `handleAppState`.
- Unmount removes the AppState listener, unsubscribes from timer snapshots, and calls `dispose()` exactly once.

All React Native Testing Library 14 `render` and `fireEvent` calls in the review suite are awaited.

## R1-B — Terminal tasks cannot gain a first step

- `createFirstStep` rejects both `completed` and `cancelled` parents with `DomainError('TERMINAL_TASK')`. It returns no modified aggregate.
- `CoreAppService.addFirstStep` propagates `TERMINAL_TASK`. The repository snapshot remains deeply and byte-for-byte equivalent, and durable storage receives no additional write.
- For a `completed` or `cancelled` active task, `CoreFlowScreen` must hide or disable all first-step entry controls: `添加第一小步`, `第一小步`, and `保存小步`. A disabled `TextInput` uses `editable={false}` or an accessible disabled state; buttons expose an accessible disabled state.

## R1-C — Request-bound, bounded operation idempotency

An `operationId` identifies one normalized mutation request, not merely one mutation kind.

- Reusing an ID with the same kind and the same normalized arguments reuses the original in-flight or settled result across `createCoreAppService` reconstruction and performs no additional work or durable write.
- Reusing an ID with the same kind but different normalized arguments rejects with `DomainError('OPERATION_ID_CONFLICT')` before ID generation, repository mutation, or any other side effect.
- Normalization follows the domain boundary: operation IDs and entity IDs are exact strings after the existing required-ID validation; task and first-step titles use their trimmed values; omitted optional task description/timestamps equal their domain defaults (`''`/`null`); timestamps compare by canonical UTC ISO value. Boolean flags remain part of the request.
- Parameter binding applies to `createTask`, `addFirstStep`, `finishStep`, and `finishTask`. `startRecommended` has no mutation parameters beyond its operation ID and kind.

`src/application/coreAppService.ts` exports this auditable registry API:

```ts
type OperationRegistryRequest = {
  operationId: string;
  kind: 'createTask' | 'addFirstStep' | 'startRecommended' | 'finishStep' | 'finishTask';
  fingerprint: string;
};

type OperationRegistry = {
  readonly size: number;
  run<T>(request: OperationRegistryRequest, work: () => Promise<T>): Promise<T>;
};

function createOperationRegistry(options: {maxEntries: number}): OperationRegistry;
```

`maxEntries` must be a positive integer (`INVALID_OPERATION_REGISTRY_CAPACITY` otherwise). The registry never exceeds this bound. It may evict the least-recently-used settled record, but never an in-flight record. If no settled record is available at capacity, a distinct new request rejects with `OPERATION_REGISTRY_CAPACITY` without invoking `work`. A rejected work promise removes its own record so the same request can retry.

`CreateCoreAppServiceDependencies` adds optional `operationRegistry?: OperationRegistry`. Supplying it makes every mutation use that registry. Without it, services created for the same repository share a production registry with a finite capacity.

For a read-only audit of that default path, `src/application/coreAppService.ts` also exports:

```ts
const DEFAULT_OPERATION_REGISTRY_CAPACITY: number;

function getDefaultOperationRegistryDiagnostics(
  repository: TaskRepository,
): Readonly<{size: number; maxEntries: number}>;
```

The default capacity is an integer from 1 through 256. Diagnostics return a snapshot and cannot mutate registry state. Reconstructing a service over the same repository shares the default registry; running more unique settled operations than the default capacity keeps `size <= maxEntries`, evicts an old settled entry, reuses a recent duplicate, and does not retain the original unbounded `Map` behavior.

## Review-1 coverage map

| Finding | Locked regression suite |
|---|---|
| R1-A timer reachability, observable UI, pause/resume, lifecycle, finish and cleanup | `tests/review1/CoreFlowTimer.integration.test.tsx` |
| R1-B terminal aggregate/service/UI protection | `tests/review1/terminalFirstStep.regression.test.tsx` |
| R1-C normalized request conflicts and bounded registry | `tests/review1/operationRegistry.regression.test.ts` |

## Lock and acceptance

1. `REVIEW1_LOCK.sha256` is generated last from `REVIEW1_TEST_SPEC.md` plus every file under `tests/review1`, sorted by stable POSIX-style relative path.
2. Any later review-1 hash mismatch is a process failure, even when tests pass.
3. Original `TEST_LOCK.sha256` verification, all original locked tests, every review-1 regression, and `tsc --noEmit` must pass before independent re-review.
