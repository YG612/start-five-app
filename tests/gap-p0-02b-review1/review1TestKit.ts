import type {FocusSession} from '../../src/domain/focusSession';
import type {FocusSessionAsyncKeyValueBackend} from '../../src/data/persistentFocusSessionStorage';

export type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve(value: T): void;
}>;

export function createDeferred<T>(): Deferred<T> {
  let resolver: ((value: T) => void) | undefined;
  const promise = new Promise<T>(resolve => {
    resolver = resolve;
  });
  return {
    promise,
    resolve(value: T): void {
      if (resolver === undefined) {
        throw new Error('GAP_P0_02B_REVIEW1_DEFERRED_NOT_READY');
      }
      resolver(value);
    },
  };
}

export type ManualBarrier = Readonly<{
  entered: Promise<void>;
  release(): void;
}>;

type InternalBarrier = {
  enteredGate: Deferred<void>;
  releaseGate: Deferred<void>;
  released: boolean;
};

function createBarrier(): InternalBarrier {
  return {
    enteredGate: createDeferred<void>(),
    releaseGate: createDeferred<void>(),
    released: false,
  };
}

function publicBarrier(barrier: InternalBarrier): ManualBarrier {
  return {
    entered: barrier.enteredGate.promise,
    release(): void {
      if (!barrier.released) {
        barrier.released = true;
        barrier.releaseGate.resolve(undefined);
      }
    },
  };
}

type PendingWriteBarrier = {
  barrier: InternalBarrier;
  failureAfterRelease: Error | null;
};

export class Review1Backend implements FocusSessionAsyncKeyValueBackend {
  readonly actions: Array<'get' | 'set' | 'remove'> = [];
  readonly reads: string[] = [];
  readonly writes: Array<Readonly<{key: string; value: string}>> = [];
  readonly deletes: string[] = [];

  private readonly values: Map<string, string>;
  private nextReadBarrier: InternalBarrier | null = null;
  private nextWriteBarrier: PendingWriteBarrier | null = null;
  private readonly readFailures: Error[] = [];

  constructor(values: Map<string, string> = new Map()) {
    this.values = values;
  }

  fork(): Review1Backend {
    return new Review1Backend(this.values);
  }

  raw(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  failNextRead(error: Error): void {
    this.readFailures.push(error);
  }

  blockNextReadAfterCapture(): ManualBarrier {
    if (this.nextReadBarrier !== null) {
      throw new Error('GAP_P0_02B_REVIEW1_READ_BARRIER_ALREADY_ARMED');
    }
    const barrier = createBarrier();
    this.nextReadBarrier = barrier;
    return publicBarrier(barrier);
  }

  blockNextWriteBeforeEffect(
    failureAfterRelease: Error | null = null,
  ): ManualBarrier {
    if (this.nextWriteBarrier !== null) {
      throw new Error('GAP_P0_02B_REVIEW1_WRITE_BARRIER_ALREADY_ARMED');
    }
    const barrier = createBarrier();
    this.nextWriteBarrier = {barrier, failureAfterRelease};
    return publicBarrier(barrier);
  }

  async getItem(key: string): Promise<string | null> {
    this.actions.push('get');
    this.reads.push(key);
    const failure = this.readFailures.shift();
    if (failure !== undefined) {
      throw failure;
    }

    const captured = this.raw(key);
    const barrier = this.nextReadBarrier;
    this.nextReadBarrier = null;
    if (barrier !== null) {
      barrier.enteredGate.resolve(undefined);
      await barrier.releaseGate.promise;
    }
    return captured;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.actions.push('set');
    this.writes.push({key, value});
    const pending = this.nextWriteBarrier;
    this.nextWriteBarrier = null;
    if (pending !== null) {
      pending.barrier.enteredGate.resolve(undefined);
      await pending.barrier.releaseGate.promise;
      if (pending.failureAfterRelease !== null) {
        throw pending.failureAfterRelease;
      }
    }
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.actions.push('remove');
    this.deletes.push(key);
    this.values.delete(key);
  }
}

export class Review1SentinelError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'Review1SentinelError';
    this.code = code;
  }
}

export function completedSession(
  id: string,
  taskId: string,
  startedAt = '2026-08-05T08:00:00.000Z',
): FocusSession {
  const plannedEndAt = new Date(Date.parse(startedAt) + 300_000).toISOString();
  return {
    id,
    taskId,
    plannedMinutes: 5,
    status: 'completed',
    startedAt,
    plannedEndAt,
    endedAt: plannedEndAt,
    actualSeconds: 300,
    interruptionReason: null,
    createdAt: startedAt,
    updatedAt: plannedEndAt,
  };
}

export async function expectRejectCode(
  promise: Promise<unknown>,
  code: string,
): Promise<unknown> {
  try {
    await promise;
  } catch (error: unknown) {
    expect(error).toMatchObject({code});
    return error;
  }
  throw new Error(`GAP_P0_02B_REVIEW1_EXPECTED_REJECTION:${code}`);
}

export function errorCause(error: unknown): unknown {
  if (typeof error !== 'object' || error === null || !('cause' in error)) {
    throw new Error('GAP_P0_02B_REVIEW1_ERROR_CAUSE_REQUIRED');
  }
  return error.cause;
}
