import {
  activeLowEnergyMode,
  enableLowEnergyMode,
  lowEnergyTaskCandidates,
} from '../../src/domain/lowEnergyMode';
import {
  createQuadrantHomePreferences,
  QUADRANT_HOME_PREFERENCES_KEY,
  validateQuadrantHomePreferencesBackup,
} from '../../src/data/quadrantHomePreferences';
import {makeTask} from '../locked/fixtures/taskFactory';

class Backend {
  readonly values = new Map<string, string>();
  async getItem(key: string): Promise<string | null> { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string): Promise<void> { this.values.set(key, value); }
  async removeItem(key: string): Promise<void> { this.values.delete(key); }
}

describe('P9-02 low energy mode', () => {
  it('expires at the next local midnight for UTC and explicit offsets', () => {
    expect(enableLowEnergyMode('2026-08-14T23:30:00.000Z', 2).expiresAt)
      .toBe('2026-08-15T00:00:00.000Z');
    expect(enableLowEnergyMode('2026-08-14T23:30:00+08:00', 5).expiresAt)
      .toBe('2026-08-14T16:00:00.000Z');
  });

  it('is active during the day, expires without task mutation, and can be closed manually', () => {
    const tasks = [makeTask({id: 'a'}), makeTask({id: 'b'})];
    const before = JSON.stringify(tasks);
    const enabled = enableLowEnergyMode('2026-08-14T08:00:00.000Z', 2);
    expect(activeLowEnergyMode(enabled, '2026-08-14T10:00:00.000Z')).toEqual(enabled);
    expect(activeLowEnergyMode(enabled, enabled.expiresAt ?? '')).toMatchObject({enabled: false});
    expect(JSON.stringify(tasks)).toBe(before);
  });

  it('prefers explicit steps estimated at no more than 15 minutes and leaves full access intact', () => {
    const tasks = [
      makeTask({id: 'long', firstStep: '先开始', estimatedMinutes: 30}),
      makeTask({id: 'gentle', firstStep: '打开文件', estimatedMinutes: 15}),
      makeTask({id: 'unclear', firstStep: null, estimatedMinutes: 5}),
    ];
    expect(lowEnergyTaskCandidates(tasks).map(task => task.id)).toEqual(['gentle']);
    expect(tasks).toHaveLength(3);
  });

  it('persists and validates the local preference backup without task fields', async () => {
    const backend = new Backend();
    const preferences = createQuadrantHomePreferences(backend);
    const lowEnergyMode = enableLowEnergyMode('2026-08-14T08:00:00.000Z', 5);
    await preferences.writeSettings({lowEnergyMode});
    await expect(preferences.readSettings()).resolves.toMatchObject({lowEnergyMode});
    const raw = backend.values.get(QUADRANT_HOME_PREFERENCES_KEY) ?? null;
    expect(validateQuadrantHomePreferencesBackup(raw)).toBe(1);
    expect(raw).not.toContain('taskId');
  });
});
