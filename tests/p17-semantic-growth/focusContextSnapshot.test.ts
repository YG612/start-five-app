import {createCurrentFocusSessionService} from '../../src/application/currentFocusSessionService';
import {
  createCurrentFocusSessionRepository,
} from '../../src/data/currentFocusSessionRepository';
import {validateFocusSessionBackup} from '../../src/data/focusSessionBackupValidation';
import {
  CURRENT_FOCUS_SESSION_SNAPSHOT_SCHEMA as FOCUS_SESSION_SNAPSHOT_SCHEMA,
  CURRENT_FOCUS_SESSION_SNAPSHOT_VERSION as FOCUS_SESSION_SNAPSHOT_VERSION,
  CURRENT_FOCUS_SESSION_STORAGE_KEY as FOCUS_SESSION_STORAGE_KEY,
  createCurrentFocusSessionStorage,
} from '../../src/data/currentFocusSessionStorage';
import {WorkspaceBackend} from '../gap-p0-06r1/gapP006TestKit';
import {
  makeLocalBackupHarness,
  requireLocalBackup,
  seedPublicTask,
} from '../gap-p0-12/gapP012TestKit';

const NOW = '2026-08-16T08:00:00.000Z';

const legacySession = {
  id: 'legacy-focus',
  taskId: 'legacy-task',
  plannedMinutes: 5,
  status: 'completed',
  startedAt: NOW,
  plannedEndAt: '2026-08-16T08:05:00.000Z',
  endedAt: '2026-08-16T08:05:00.000Z',
  actualSeconds: 300,
  interruptionReason: null,
  createdAt: NOW,
  updatedAt: '2026-08-16T08:05:00.000Z',
} as const;

describe('P17 FocusContextSnapshot persistence', () => {
  it('captures task meaning once and persists it in the v2 envelope', async () => {
    const backend = new WorkspaceBackend();
    const service = createCurrentFocusSessionService({
      repository: createCurrentFocusSessionRepository(
        createCurrentFocusSessionStorage(backend),
      ),
      now: () => NOW,
      idGenerator: () => 'focus-with-context',
      async resolveContextSnapshot(taskId, _startedAt, focusScheduleId) {
        return {
          taskId,
          quadrantAtStart: 'Q2',
          importanceScoreAtStart: 82,
          effectiveUrgencyAtStart: 24,
          dueAtAtStart: '2026-08-20T08:00:00.000Z',
          ...(focusScheduleId === undefined ? {} : {focusScheduleId}),
        };
      },
    });

    const started = await service.start({
      taskId: 'task-1',
      plannedMinutes: 25,
      focusScheduleId: 'schedule-1',
    });
    expect(started.snapshot).toEqual({
      taskId: 'task-1',
      quadrantAtStart: 'Q2',
      importanceScoreAtStart: 82,
      effectiveUrgencyAtStart: 24,
      dueAtAtStart: '2026-08-20T08:00:00.000Z',
      focusScheduleId: 'schedule-1',
    });
    const raw = JSON.parse((await backend.getItem('start-five.focus-sessions.v1'))!) as {
      version: number;
      sessions: Array<{snapshot: unknown}>;
    };
    expect(raw.version).toBe(2);
    expect(raw.sessions[0]?.snapshot).toEqual(started.snapshot);
  });

  it('accepts legacy v1 backup records without inventing historical context', async () => {
    const backend = new WorkspaceBackend();
    const raw = JSON.stringify({
      schema: FOCUS_SESSION_SNAPSHOT_SCHEMA,
      version: 1,
      sessions: [legacySession],
    });
    await backend.setItem('start-five.focus-sessions.v1', raw);
    expect(validateFocusSessionBackup(raw)).toBe(1);
    await expect(createCurrentFocusSessionRepository(
      createCurrentFocusSessionStorage(backend),
    ).list()).resolves.toEqual([legacySession]);
    expect(FOCUS_SESSION_SNAPSHOT_VERSION).toBe(2);
  });

  it('exports and restores the v2 context snapshot through the local backup', async () => {
    const source = makeLocalBackupHarness({idPrefix: 'p17-source'});
    await seedPublicTask(source, '备份中的重要任务', 'p17:source');
    const taskId = (await source.composition.service.getState()).tasks[0]!.id;
    const v2Session = {
      ...legacySession,
      id: 'focus-backup-v2',
      taskId,
      snapshot: {
        taskId,
        quadrantAtStart: 'Q2',
        importanceScoreAtStart: 80,
        effectiveUrgencyAtStart: 20,
      },
    };
    await source.backend.setItem(FOCUS_SESSION_STORAGE_KEY, JSON.stringify({
      schema: FOCUS_SESSION_SNAPSHOT_SCHEMA,
      version: FOCUS_SESSION_SNAPSHOT_VERSION,
      sessions: [v2Session],
    }));
    const artifact = await requireLocalBackup(source.composition).exportBackup();

    const target = makeLocalBackupHarness({idPrefix: 'p17-target'});
    await requireLocalBackup(target.composition).restoreBackup(artifact.bytes);
    const restored = JSON.parse((await target.backend.getItem(FOCUS_SESSION_STORAGE_KEY))!) as {
      version: number;
      sessions: Array<{snapshot: unknown}>;
    };
    expect(restored.version).toBe(2);
    expect(restored.sessions[0]?.snapshot).toEqual(v2Session.snapshot);
  });
});
