import React from 'react';
import {
  act,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react-native';
import {
  createStartFiveApp,
  type StartFiveAppComposition,
} from '../../src/app/startFiveApp';
import type {Quadrant} from '../../src/domain/quadrant';
import type {Task} from '../../src/domain/task';

export const P0_07_STARTED_AT = '2026-08-10T08:00:00.000Z';
export const P0_07_NATURAL_END_AT = '2026-08-10T08:05:00.000Z';
export const P0_07_EARLY_END_AT = '2026-08-10T08:02:00.000Z';

export type AppScreen = Awaited<ReturnType<typeof render>>;

export class PublicMemoryBackend {
  private readonly values = new Map<string, string>();
  private readFailureArmed = false;
  private readFailure: unknown = null;

  constructor(entries: readonly (readonly [string, string])[] = []) {
    for (const [key, value] of entries) {
      this.values.set(key, value);
    }
  }

  async getItem(key: string): Promise<string | null> {
    if (this.readFailureArmed) {
      this.readFailureArmed = false;
      const failure = this.readFailure;
      this.readFailure = null;
      throw failure;
    }
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }

  failNextRead(reason: unknown): void {
    if (this.readFailureArmed) {
      throw new Error('GAP_P0_07_READ_FAILURE_ALREADY_ARMED');
    }
    this.readFailureArmed = true;
    this.readFailure = reason;
  }

  stableByteSnapshot(): string {
    return JSON.stringify(
      Array.from(this.values.entries()).sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0,
      ),
    );
  }

  byteRestart(): PublicMemoryBackend {
    return new PublicMemoryBackend(
      Array.from(this.values.entries()).map(([key, value]) =>
        [key, value] as const,
      ),
    );
  }
}

export class MutableIsoClock {
  private current: string;

  constructor(initial: string = P0_07_STARTED_AT) {
    this.current = initial;
  }

  readonly now = (): string => this.current;

  set(iso: string): void {
    this.current = iso;
  }
}

export class ManualFocusRuntimeClock {
  private currentMs: number;
  private readonly listeners = new Set<() => void>();

  constructor(initial: string = P0_07_STARTED_AT) {
    this.currentMs = Date.parse(initial);
  }

  readonly nowMs = (): number => this.currentMs;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  publishAt(iso: string): void {
    this.currentMs = Date.parse(iso);
    for (const listener of Array.from(this.listeners)) {
      listener();
    }
  }
}

export class SequenceIds {
  private index = 0;

  constructor(private readonly prefix: string) {}

  readonly next = (): string => {
    this.index += 1;
    return `${this.prefix}-${String(this.index).padStart(4, '0')}`;
  };
}

export type P007Harness = Readonly<{
  backend: PublicMemoryBackend;
  clock: MutableIsoClock;
  runtimeClock: ManualFocusRuntimeClock;
  composition: StartFiveAppComposition;
}>;

export function createP007Harness(options: {
  backend?: PublicMemoryBackend;
  at?: string;
  idPrefix: string;
}): P007Harness {
  const backend = options.backend ?? new PublicMemoryBackend();
  const at = options.at ?? P0_07_STARTED_AT;
  const clock = new MutableIsoClock(at);
  const runtimeClock = new ManualFocusRuntimeClock(at);
  const ids = new SequenceIds(options.idPrefix);
  const composition = createStartFiveApp({
    storageBackend: backend,
    now: clock.now,
    idGenerator: ids.next,
    focusRuntimeClock: runtimeClock,
  });
  return {backend, clock, runtimeClock, composition};
}

export async function seedTaskWithStep(
  harness: P007Harness,
  input: Readonly<{
    title: string;
    stepTitle: string;
    important: boolean;
    urgent: boolean;
    operationPrefix: string;
  }>,
): Promise<Task> {
  const created = await harness.composition.service.createTask(
    {
      title: input.title,
      important: input.important,
      urgent: input.urgent,
    },
    {operationId: `${input.operationPrefix}:create`},
  );
  return harness.composition.service.addFirstStep(
    created.id,
    {title: input.stepTitle},
    {operationId: `${input.operationPrefix}:step`},
  );
}

export async function flushUiWork(turns = 100): Promise<void> {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
  }
}

export async function renderHarness(harness: P007Harness): Promise<AppScreen> {
  const screen = await render(React.createElement(harness.composition.AppRoot));
  await act(async () => {
    await flushUiWork();
  });
  return screen;
}

const CARD_LABEL: Readonly<Record<Quadrant, string>> = {
  Q1: '救火区任务',
  Q2: '成长区任务',
  Q3: '干扰区任务',
  Q4: '清理区任务',
};

export async function startFocusFromWorkspace(
  screen: AppScreen,
  quadrant: Quadrant,
  title: string,
): Promise<void> {
  await waitFor(() =>
    expect(
      screen.getByRole('button', {
        name: `${CARD_LABEL[quadrant]}：${title}`,
      }),
    ).toBeTruthy(),
  );
  await fireEvent.press(
    screen.getByRole('button', {
      name: `${CARD_LABEL[quadrant]}：${title}`,
    }),
  );
  await waitFor(() =>
    expect(screen.getByText('快速编辑任务')).toBeTruthy(),
  );
  await fireEvent.press(
    screen.getByRole('button', {name: '先做5分钟'}),
  );
  await waitFor(() =>
    expect(screen.getByText('正在先做 5 分钟')).toBeTruthy(),
  );
  expect(screen.getByText(title)).toBeTruthy();
}

export async function publishRuntimeAt(
  harness: P007Harness,
  iso: string,
): Promise<void> {
  harness.clock.set(iso);
  await act(async () => {
    harness.runtimeClock.publishAt(iso);
    await flushUiWork(160);
  });
}
