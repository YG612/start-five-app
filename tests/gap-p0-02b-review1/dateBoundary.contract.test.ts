import {createFocusSessionService} from '../../src/application/focusSessionService';
import {createFocusSessionRepository} from '../../src/data/focusSessionRepository';
import {createPersistentFocusSessionStorage} from '../../src/data/persistentFocusSessionStorage';
import type {FocusDurationMinutes} from '../../src/domain/focusSession';
import {
  expectRejectCode,
  Review1Backend,
} from './review1TestKit';

const DATE_MAX = '+275760-09-13T00:00:00.000Z';
const DURATIONS: readonly FocusDurationMinutes[] = [2, 5, 15, 25, 50];

describe('GAP-P0-02B Review1 representable Date boundary', () => {
  it.each(DURATIONS)(
    'rejects %i minutes overflowing the canonical Date maximum before repository I/O or ID generation',
    async plannedMinutes => {
      const backend = new Review1Backend();
      const repository = createFocusSessionRepository(
        createPersistentFocusSessionStorage(backend),
      );
      let clockCalls = 0;
      let idCalls = 0;
      const service = createFocusSessionService({
        repository,
        now(): string {
          clockCalls += 1;
          return DATE_MAX;
        },
        idGenerator(): string {
          idCalls += 1;
          return `focus-overflow-${String(plannedMinutes)}`;
        },
      });

      const error = await expectRejectCode(
        service.start({taskId: 'task-date-max', plannedMinutes}),
        'FOCUS_SESSION_INVALID_CLOCK',
      );
      expect(error).not.toBeInstanceOf(RangeError);
      expect({clockCalls, idCalls}).toEqual({clockCalls: 1, idCalls: 0});
      expect(backend.actions).toEqual([]);
      expect(backend.reads).toEqual([]);
      expect(backend.writes).toEqual([]);
      expect(backend.deletes).toEqual([]);
    },
  );

  it.each(DURATIONS)(
    'accepts %i minutes when plannedEndAt lands exactly on the canonical Date maximum',
    async plannedMinutes => {
      const backend = new Review1Backend();
      const repository = createFocusSessionRepository(
        createPersistentFocusSessionStorage(backend),
      );
      const latestStart = new Date(
        Date.parse(DATE_MAX) - plannedMinutes * 60_000,
      ).toISOString();
      let clockCalls = 0;
      let idCalls = 0;
      const generatedId = `focus-date-edge-${String(plannedMinutes)}`;
      const service = createFocusSessionService({
        repository,
        now(): string {
          clockCalls += 1;
          return latestStart;
        },
        idGenerator(): string {
          idCalls += 1;
          return generatedId;
        },
      });

      const session = await service.start({
        taskId: `task-date-edge-${String(plannedMinutes)}`,
        plannedMinutes,
      });
      expect(session).toMatchObject({
        id: generatedId,
        plannedMinutes,
        status: 'running',
        startedAt: latestStart,
        plannedEndAt: DATE_MAX,
        createdAt: latestStart,
        updatedAt: latestStart,
      });
      expect({clockCalls, idCalls}).toEqual({clockCalls: 1, idCalls: 1});
      expect(backend.actions).toEqual(['get', 'set']);
      expect(backend.reads).toHaveLength(1);
      expect(backend.writes).toHaveLength(1);
      expect(backend.deletes).toEqual([]);
      await expect(repository.get(generatedId)).resolves.toEqual(session);
    },
  );
});
