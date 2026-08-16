import {createStartFiveApp} from '../../src/app/startFiveApp';
import {
  createQuadrantHomePreferences,
  QUADRANT_HOME_PREFERENCES_KEY,
} from '../../src/data/quadrantHomePreferences';
import {WorkspaceBackend, WorkspaceClock, WorkspaceIds} from '../gap-p0-06r1/gapP006TestKit';

const NOW = '2026-08-16T08:00:00.000Z';

describe('P18 preferences, backup and destructive reliability', () => {
  it('migrates v6 preferences to complete v7 defaults and maps the retired 45-minute default', async () => {
    const backend = new WorkspaceBackend();
    await backend.setItem(QUADRANT_HOME_PREFERENCES_KEY, JSON.stringify({
      version: 6,
      viewMode: 'map',
      theme: 'dark',
      reduceMotion: true,
      preferredFocusMinutes: 45,
    }));
    const preferences = createQuadrantHomePreferences(backend);
    await expect(preferences.readSettings()).resolves.toMatchObject({
      theme: 'dark',
      reduceMotion: true,
      preferredFocusMinutes: 50,
      preferredWeekdays: [1, 2, 3, 4, 5],
      preferredStartWindow: null,
      defaultProtectionLevel: 'REMINDER_ONLY',
      automaticUrgency: 'follow_due',
      screenReaderPreference: 'auto',
    });

    await preferences.writeSettings({
      preferredFocusMinutes: 25,
      preferredWeekdays: [2, 4, 6],
      defaultProtectionLevel: 'REDUCE_DISTRACTIONS',
    });
    const persisted = JSON.parse((await backend.getItem(QUADRANT_HOME_PREFERENCES_KEY))!) as {
      version: number;
      preferredWeekdays: number[];
    };
    expect(persisted).toMatchObject({version: 7, preferredWeekdays: [2, 4, 6]});
  });

  it('backs up v7 preferences in schema v3 without mutating an existing schedule', async () => {
    const sourceBackend = new WorkspaceBackend();
    const source = createStartFiveApp({
      storageBackend: sourceBackend,
      now: () => NOW,
      idGenerator: new WorkspaceIds(['schedule-existing']).next,
    });
    await source.focusSchedules.create({
      target: {kind: 'AUTO'},
      durationMinutes: 5,
      recurrence: {kind: 'DAILY', localTime: '20:30', timezone: 'Asia/Shanghai'},
      protectionLevel: 'REMINDER_ONLY',
    });
    const preferences = createQuadrantHomePreferences(sourceBackend);
    await preferences.writeSettings({
      preferredFocusMinutes: 25,
      preferredWeekdays: [1, 3, 5],
      preferredStartWindow: {startLocalTime: '19:00', endLocalTime: '21:00'},
      defaultProtectionLevel: 'REDUCE_DISTRACTIONS',
    });
    await expect(source.focusSchedules.list()).resolves.toEqual([
      expect.objectContaining({durationMinutes: 5, protectionLevel: 'REMINDER_ONLY'}),
    ]);

    const artifact = await source.localBackup.exportBackup();
    expect(artifact.preview.schemaVersion).toBe(3);
    expect(artifact.preview.stores).toContainEqual({
      alias: 'quadrantHomePreferences',
      recordCount: 1,
    });

    const targetBackend = new WorkspaceBackend();
    const target = createStartFiveApp({
      storageBackend: targetBackend,
      now: () => NOW,
      idGenerator: new WorkspaceIds(['target-unused']).next,
    });
    await target.localBackup.replaceBackup(artifact.bytes);
    await expect(createQuadrantHomePreferences(targetBackend).readSettings()).resolves.toMatchObject({
      preferredFocusMinutes: 25,
      preferredWeekdays: [1, 3, 5],
      preferredStartWindow: {startLocalTime: '19:00', endLocalTime: '21:00'},
      defaultProtectionLevel: 'REDUCE_DISTRACTIONS',
    });
  });

  it('clears tasks, schedules and preferences only through the explicit destructive service', async () => {
    const backend = new WorkspaceBackend();
    const clock = new WorkspaceClock(NOW);
    const composition = createStartFiveApp({
      storageBackend: backend,
      now: clock.now,
      idGenerator: new WorkspaceIds(['task-delete', 'schedule-delete']).next,
    });
    await composition.service.createTask(
      {title: '敏感任务', important: true, urgent: false},
      {operationId: 'p18:create-sensitive'},
    );
    await composition.focusSchedules.create({
      target: {kind: 'AUTO'},
      durationMinutes: 25,
      recurrence: {kind: 'ONCE', startsAt: '2026-08-17T08:00:00.000Z'},
      protectionLevel: 'REMINDER_ONLY',
    });
    await createQuadrantHomePreferences(backend).writeSettings({theme: 'dark'});

    await composition.localBackup.clearAllData();

    await expect(composition.repository.list()).resolves.toEqual([]);
    await expect(composition.focusSchedules.list()).resolves.toEqual([]);
    await expect(createQuadrantHomePreferences(backend).readSettings()).resolves.toMatchObject({
      theme: 'system',
      preferredFocusMinutes: 5,
    });
  });
});
