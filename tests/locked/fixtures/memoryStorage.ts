export class MemoryKeyValueStorage {
  private readonly values = new Map<string, string>();

  readonly setCalls: Array<{key: string; value: string}> = [];

  failNextSetWith: Error | null = null;

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    const failure = this.failNextSetWith;
    this.failNextSetWith = null;
    if (failure) {
      throw failure;
    }
    this.values.set(key, value);
    this.setCalls.push({key, value});
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }

  raw(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  seed(key: string, value: string): void {
    this.values.set(key, value);
  }
}
