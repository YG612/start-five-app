import type {FocusRuntimeClock} from './focusSessionRuntime';
import {
  createStartFiveApp,
  type StartFiveAppComposition,
  type StartFiveAppDependencies,
} from './startFiveApp';

function createDefaultClock(): FocusRuntimeClock {
  return {
    nowMs: Date.now,
    subscribe(listener) {
      const interval = setInterval(listener, 1_000);
      return () => clearInterval(interval);
    },
  };
}

/** Explicit current product entry; the legacy factory keeps its P4 boot seam. */
export function createCurrentStartFiveApp(
  dependencies: StartFiveAppDependencies,
): StartFiveAppComposition {
  return createStartFiveApp({
    ...dependencies,
    focusRuntimeClock:
      dependencies.focusRuntimeClock ?? createDefaultClock(),
  });
}
