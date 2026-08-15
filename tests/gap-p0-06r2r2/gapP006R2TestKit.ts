import {
  P0_06_AT,
  WorkspaceBackend,
  WorkspaceClock,
} from '../gap-p0-06r1/gapP006TestKit';

export class RefreshFailureClock extends WorkspaceClock {
  private nextFailure: unknown | null = null;

  override readonly now = (): string => {
    this.calls += 1;
    if (this.nextFailure !== null) {
      const failure = this.nextFailure;
      this.nextFailure = null;
      throw failure;
    }
    return P0_06_AT;
  };

  failNextNow(reason: unknown): void {
    if (this.nextFailure !== null) {
      throw new Error('GAP_P0_06R2_CLOCK_FAILURE_ALREADY_ARMED');
    }
    this.nextFailure = reason;
  }
}

/** Arms one deterministic clock failure only after the first durable commit. */
export class PostCommitRefreshFailureBackend extends WorkspaceBackend {
  private armAfterFirstCommit = true;

  constructor(private readonly clock: RefreshFailureClock) {
    super();
  }

  override async setItem(key: string, value: string): Promise<void> {
    await super.setItem(key, value);
    if (this.armAfterFirstCommit) {
      this.armAfterFirstCommit = false;
      this.clock.failNextNow(new Error('GAP_P0_06R2_REFRESH_NOW_FAILED'));
    }
  }
}
