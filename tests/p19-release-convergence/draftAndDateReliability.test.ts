import {
  createTaskDraftStore,
  TASK_DRAFT_STORAGE_KEY,
  TASK_DRAFT_TTL_MS,
} from '../../src/data/taskDraftStore';
import type {AsyncKeyValueBackend} from '../../src/data/persistentTaskStorage';
import {dateKeyInTimeZone} from '../../src/domain/localDate';
import {formatFocusSummary} from '../../src/presentation/focusSummary';

class MemoryBackend implements AsyncKeyValueBackend {
  readonly values = new Map<string, string>();
  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}

describe('P19 draft and local-date reliability', () => {
  it('isolates bad storage, restores the latest live draft and expires old input', async () => {
    const backend = new MemoryBackend();
    const store = createTaskDraftStore(backend);
    backend.values.set(TASK_DRAFT_STORAGE_KEY, '{bad json');
    await expect(store.latest('2026-08-21T00:00:00.000Z')).resolves.toBeNull();

    const updatedAt = '2026-08-21T00:00:00.000Z';
    await store.upsert({
      id: 'create:one',
      taskId: null,
      payload: '{"title":"不会丢失"}',
      updatedAt,
      expiresAt: new Date(Date.parse(updatedAt) + TASK_DRAFT_TTL_MS).toISOString(),
    });
    await expect(store.latest('2026-08-22T00:00:00.000Z')).resolves.toMatchObject({
      id: 'create:one',
      payload: '{"title":"不会丢失"}',
    });
    await store.clearExpired('2026-09-21T00:00:00.001Z');
    await expect(store.latest('2026-09-21T00:00:00.001Z')).resolves.toBeNull();
  });

  it('uses the configured local day and explains sub-minute focus totals', () => {
    expect(dateKeyInTimeZone('2026-08-20T16:30:00.000Z', 'Asia/Shanghai')).toBe('2026-08-21');
    expect(dateKeyInTimeZone('2026-08-21T00:30:00.000Z', 'America/Los_Angeles')).toBe('2026-08-20');
    expect(formatFocusSummary(2, 0)).toBe('2次 / 不足1分钟');
    expect(formatFocusSummary(2, 5)).toBe('2次 / 5分钟');
  });
});
