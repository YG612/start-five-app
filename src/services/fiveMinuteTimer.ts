export const DEFAULT_DURATION_MS = 300_000;

type TimerState = 'idle' | 'running' | 'paused' | 'finished';
type SupportedAppState = 'active' | 'background' | 'inactive';

type FiveMinuteTimerOptions = {
  durationMs?: number;
  now?: () => number;
  onFinish?: () => void;
};

type TimerSnapshot = {
  state: TimerState;
  durationMs: number;
  remainingMs: number;
  startedAtMs: number | null;
  finishedAtMs: number | null;
};

class TimerError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'TimerError';
    this.code = code;
  }
}

export class FiveMinuteTimer {
  private readonly durationMs: number;
  private readonly now: () => number;
  private readonly onFinish: (() => void) | undefined;

  private state: TimerState = 'idle';
  private remainingMs: number;
  private startedAtMs: number | null = null;
  private finishedAtMs: number | null = null;
  private runningSinceMs: number | null = null;
  private scheduledFinish: ReturnType<typeof setTimeout> | null = null;
  private finishNotified = false;
  private disposed = false;

  constructor(options: FiveMinuteTimerOptions = {}) {
    const durationMs = options.durationMs ?? DEFAULT_DURATION_MS;
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new TimerError('INVALID_TIMER_DURATION');
    }

    this.durationMs = durationMs;
    this.remainingMs = durationMs;
    this.now = options.now ?? (() => Date.now());
    this.onFinish = options.onFinish;
  }

  start(): void {
    if (this.disposed || this.state !== 'idle') {
      return;
    }

    const nowMs = this.now();
    this.state = 'running';
    this.startedAtMs = nowMs;
    this.runningSinceMs = nowMs;
    this.scheduleFinish();
  }

  pause(): void {
    if (this.disposed || this.state !== 'running') {
      return;
    }

    if (this.finishIfExpired()) {
      return;
    }

    this.remainingMs = this.calculateRemaining(this.now());
    this.runningSinceMs = null;
    this.state = 'paused';
    this.clearScheduledFinish();
  }

  resume(): void {
    if (this.disposed || this.state !== 'paused') {
      return;
    }

    this.state = 'running';
    this.runningSinceMs = this.now();
    this.scheduleFinish();
  }

  handleAppState(appState: SupportedAppState): void {
    void appState;
    if (this.disposed || this.state !== 'running') {
      return;
    }

    if (this.finishIfExpired()) {
      return;
    }

    const nowMs = this.now();
    this.remainingMs = this.calculateRemaining(nowMs);
    this.runningSinceMs = nowMs;
    this.scheduleFinish();
  }

  finish(): void {
    if (this.disposed || this.state === 'finished') {
      return;
    }

    if (this.state === 'running' && this.finishIfExpired()) {
      return;
    }

    this.completeAt(this.now());
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    if (this.state === 'running') {
      this.remainingMs = this.calculateRemaining(this.now());
      this.runningSinceMs = null;
    }
    this.clearScheduledFinish();
    this.disposed = true;
  }

  getSnapshot(): TimerSnapshot {
    if (!this.disposed && this.state === 'running') {
      this.finishIfExpired();
    }

    return {
      state: this.state,
      durationMs: this.durationMs,
      remainingMs:
        this.state === 'running'
          ? this.calculateRemaining(this.now())
          : this.remainingMs,
      startedAtMs: this.startedAtMs,
      finishedAtMs: this.finishedAtMs,
    };
  }

  private calculateRemaining(nowMs: number): number {
    if (this.state !== 'running' || this.runningSinceMs === null) {
      return this.remainingMs;
    }

    const elapsedMs = Math.max(0, nowMs - this.runningSinceMs);
    return Math.max(0, this.remainingMs - elapsedMs);
  }

  private finishIfExpired(): boolean {
    if (this.state !== 'running' || this.runningSinceMs === null) {
      return false;
    }

    const nowMs = this.now();
    if (this.calculateRemaining(nowMs) > 0) {
      return false;
    }

    this.completeAt(this.runningSinceMs + this.remainingMs);
    return true;
  }

  private scheduleFinish(): void {
    this.clearScheduledFinish();
    if (this.disposed || this.state !== 'running') {
      return;
    }

    const delayMs = this.calculateRemaining(this.now());
    if (delayMs <= 0) {
      this.finishIfExpired();
      return;
    }

    this.scheduledFinish = setTimeout(() => {
      this.scheduledFinish = null;
      if (!this.finishIfExpired()) {
        this.scheduleFinish();
      }
    }, delayMs);
  }

  private clearScheduledFinish(): void {
    if (this.scheduledFinish === null) {
      return;
    }

    clearTimeout(this.scheduledFinish);
    this.scheduledFinish = null;
  }

  private completeAt(finishedAtMs: number): void {
    if (this.state === 'finished') {
      return;
    }

    this.clearScheduledFinish();
    this.state = 'finished';
    this.remainingMs = 0;
    this.runningSinceMs = null;
    this.finishedAtMs = finishedAtMs;

    if (!this.finishNotified) {
      this.finishNotified = true;
      this.onFinish?.();
    }
  }
}
