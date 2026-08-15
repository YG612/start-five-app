import {AppIntegrationBackend} from '../gap-p0-05r1/gapP005TestKit';

export type FocusRuntimeClock = Readonly<{
  nowMs(): number;
  subscribe(listener: () => void): () => void;
}>;

export class ManualFocusRuntimeClock implements FocusRuntimeClock {
  private currentMs: number;
  private readonly listeners = new Set<() => void>();

  constructor(initialIso: string) {
    this.currentMs = Date.parse(initialIso);
  }

  readonly nowMs = (): number => this.currentMs;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) {
        return;
      }
      subscribed = false;
      this.listeners.delete(listener);
    };
  };

  publishAt(iso: string): void {
    this.currentMs = Date.parse(iso);
    for (const listener of Array.from(this.listeners)) {
      listener();
    }
  }

  publish(): void {
    for (const listener of Array.from(this.listeners)) {
      listener();
    }
  }

  get subscriberCount(): number {
    return this.listeners.size;
  }
}

type FailedGet = Readonly<{key: string; reason: unknown}>;

export class BackendGetGate {
  entered = 0;
  private released = false;
  private resolveRelease!: () => void;
  private readonly releasePromise = new Promise<void>(resolve => {
    this.resolveRelease = resolve;
  });

  async enterAndWait(): Promise<void> {
    this.entered += 1;
    await this.releasePromise;
  }

  release(): void {
    if (this.released) {
      return;
    }
    this.released = true;
    this.resolveRelease();
  }
}

export class R2IntegrationBackend extends AppIntegrationBackend {
  private failedGet: FailedGet | null = null;
  private delayedGet: {
    key: string;
    value: string | null;
    gate: BackendGetGate;
  } | null = null;
  readonly failedGets: string[] = [];

  override async getItem(key: string): Promise<string | null> {
    const delayed = this.delayedGet;
    if (delayed !== null && delayed.key === key) {
      this.delayedGet = null;
      this.getCalls.push(key);
      await delayed.gate.enterAndWait();
      return delayed.value;
    }

    const failed = this.failedGet;
    if (failed !== null && failed.key === key) {
      this.failedGet = null;
      this.getCalls.push(key);
      this.failedGets.push(key);
      throw failed.reason;
    }
    return super.getItem(key);
  }

  failNextGetFor(key: string, reason: unknown): void {
    if (this.failedGet !== null) {
      throw new Error('GAP_P0_05R2_GET_FAILURE_ALREADY_ARMED');
    }
    this.failedGet = {key, reason};
  }

  delayNextGetFor(key: string, value: string | null): BackendGetGate {
    if (this.delayedGet !== null) {
      throw new Error('GAP_P0_05R2_GET_GATE_ALREADY_ARMED');
    }
    const gate = new BackendGetGate();
    this.delayedGet = {key, value, gate};
    return gate;
  }

  byteRestartR2(): R2IntegrationBackend {
    return new R2IntegrationBackend(this.rawEntries());
  }
}
