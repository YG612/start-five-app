import {
  TASK_LAYOUT_DRAG_START_SLOP_DP,
  TASK_LAYOUT_LONG_PRESS_MS,
  TASK_LAYOUT_PRE_ARM_SLOP_DP,
  constrainTaskCenter,
  nearestAvailablePlacement,
  normalizePointInRect,
  placementsDiffer,
  pointForPlacement,
  quadrantAtTaskCenter,
  taskLayoutReducer,
} from '../../src/domain/quadrantTaskLayout';
import {
  createQuadrantTaskLayoutRepository,
  QUADRANT_TASK_LAYOUT_STORAGE_KEY,
  validateQuadrantTaskLayoutBackup,
} from '../../src/data/quadrantTaskLayoutStore';
import {WorkspaceBackend, WorkspaceIds} from '../gap-p0-06r1/gapP006TestKit';
import {createStartFiveApp} from '../../src/app/startFiveApp';

const NOW = '2026-08-21T08:00:00.000Z';

type CryptoApi = Readonly<{
  createHash(algorithm: string): {
    update(value: string, encoding: string): {digest(encoding: string): string};
  };
}>;
const {createHash} = jest.requireActual<CryptoApi>('crypto');

function utf8Decode(bytes: Uint8Array): string {
  return decodeURIComponent([...bytes]
    .map(byte => `%${byte.toString(16).padStart(2, '0')}`)
    .join(''));
}

function utf8Encode(value: string): Uint8Array {
  const bytes: number[] = [];
  for (const character of value) {
    const point = character.codePointAt(0);
    if (point === undefined) continue;
    if (point <= 0x7f) bytes.push(point);
    else if (point <= 0x7ff) {
      bytes.push(0xc0 | (point >> 6), 0x80 | (point & 63));
    } else if (point <= 0xffff) {
      bytes.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 63), 0x80 | (point & 63));
    } else {
      bytes.push(0xf0 | (point >> 18), 0x80 | ((point >> 12) & 63), 0x80 | ((point >> 6) & 63), 0x80 | (point & 63));
    }
  }
  return Uint8Array.from(bytes);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  throw new Error('TEST_CANONICAL_VALUE_INVALID');
}

function downgradeBackup(
  bytes: Uint8Array,
  schemaVersion: 1 | 2 | 3,
): Uint8Array {
  const wire = JSON.parse(utf8Decode(bytes)) as {
    schemaVersion: number;
    createdAt: string;
    applicationVersion: string;
    manifest: {stores: Array<{alias: string; payloadId: string}>; references: unknown[]};
    payloads: Record<string, string>;
    contentDigestSha256: string;
  };
  const excluded = new Set<string>(schemaVersion === 1
    ? ['focusSchedules', 'quadrantHomePreferences', 'quadrantTaskLayout']
    : schemaVersion === 2
      ? ['quadrantHomePreferences', 'quadrantTaskLayout']
      : ['quadrantTaskLayout']);
  wire.schemaVersion = schemaVersion;
  wire.manifest.stores = wire.manifest.stores.filter(store => {
    if (!excluded.has(store.alias)) return true;
    delete wire.payloads[store.payloadId];
    return false;
  });
  const unsigned = {
    schemaVersion: wire.schemaVersion,
    createdAt: wire.createdAt,
    applicationVersion: wire.applicationVersion,
    manifest: wire.manifest,
    payloads: wire.payloads,
  };
  wire.contentDigestSha256 = createHash('sha256')
    .update(canonicalJson(unsigned), 'utf8')
    .digest('hex');
  return utf8Encode(canonicalJson(wire));
}

describe('P15R-04B persistent task layout mode', () => {
  it('locks the long-press and movement thresholds', () => {
    expect(TASK_LAYOUT_LONG_PRESS_MS).toBe(1_000);
    expect(TASK_LAYOUT_PRE_ARM_SLOP_DP).toBe(10);
    expect(TASK_LAYOUT_DRAG_START_SLOP_DP).toBe(6);
  });

  it('keeps one centralized armed task across release and supports both drag paths', () => {
    const armed = taskLayoutReducer({status: 'idle'}, {
      type: 'arm',
      taskId: 'task-1',
      originQuadrant: 'Q2',
      originPlacement: {xRatio: 0.25, yRatio: 0.75},
    });
    expect(armed).toEqual({
      status: 'armed',
      taskId: 'task-1',
      originQuadrant: 'Q2',
      originPlacement: {xRatio: 0.25, yRatio: 0.75},
    });
    const dragging = taskLayoutReducer(armed, {
      type: 'start_drag',
      pointerOffsetX: 12,
      pointerOffsetY: 18,
      candidateQuadrant: 'Q2',
    });
    expect(dragging).toMatchObject({status: 'dragging', taskId: 'task-1'});
    expect(taskLayoutReducer(dragging, {type: 'move', candidateQuadrant: 'Q1'}))
      .toMatchObject({status: 'dragging', candidateQuadrant: 'Q1'});
    expect(taskLayoutReducer(dragging, {type: 'cancel_drag'})).toEqual(armed);
    const committing = taskLayoutReducer(dragging, {type: 'commit'});
    expect(committing).toEqual({status: 'committing', taskId: 'task-1'});
    expect(taskLayoutReducer(committing, {
      type: 'settle',
      quadrant: 'Q1',
      placement: {xRatio: 0.5, yRatio: 0.25},
    })).toMatchObject({
      status: 'armed',
      taskId: 'task-1',
      originQuadrant: 'Q1',
      originPlacement: {xRatio: 0.5, yRatio: 0.25},
    });
    expect(taskLayoutReducer(armed, {type: 'exit'})).toEqual({status: 'idle'});
  });

  it('uses the task center for real quadrant rectangles and rejects map exterior', () => {
    const rects = {
      Q3: {x: 0, y: 0, width: 100, height: 100},
      Q1: {x: 100, y: 0, width: 100, height: 100},
      Q4: {x: 0, y: 100, width: 100, height: 100},
      Q2: {x: 100, y: 100, width: 100, height: 100},
    } as const;
    expect(quadrantAtTaskCenter({x: 150, y: 50}, rects)).toBe('Q1');
    expect(quadrantAtTaskCenter({x: 50, y: 150}, rects)).toBe('Q4');
    expect(quadrantAtTaskCenter({x: 201, y: 50}, rects)).toBeNull();
  });

  it('normalizes positions, constrains full cards and deterministically avoids overlap', () => {
    const rect = {x: 10, y: 20, width: 120, height: 90};
    const placement = normalizePointInRect({x: 70, y: 65}, rect);
    expect(pointForPlacement(placement, rect)).toEqual({x: 70, y: 65});
    expect(constrainTaskCenter({x: -20, y: 300}, rect, {width: 40, height: 30}))
      .toEqual({x: 30, y: 95});
    const available = nearestAvailablePlacement({
      desired: {xRatio: 0.5, yRatio: 0.5},
      contentRect: rect,
      taskSize: {width: 30, height: 24},
      occupied: [{placement: {xRatio: 0.5, yRatio: 0.5}, size: {width: 30, height: 24}}],
      divisions: 6,
    });
    expect(placementsDiffer(available, {xRatio: 0.5, yRatio: 0.5})).toBe(true);
    expect(available.xRatio).toBeGreaterThanOrEqual(0);
    expect(available.yRatio).toBeLessThanOrEqual(1);
  });

  it('persists valid records, isolates one corrupt record and removes orphans', async () => {
    const backend = new WorkspaceBackend();
    await backend.setItem(QUADRANT_TASK_LAYOUT_STORAGE_KEY, JSON.stringify({
      version: 1,
      records: [
        {taskId: 'valid', placement: {xRatio: 0.25, yRatio: 0.75}},
        {taskId: 'broken', placement: {xRatio: 4, yRatio: 'bad'}},
      ],
    }));
    expect(validateQuadrantTaskLayoutBackup(await backend.getItem(QUADRANT_TASK_LAYOUT_STORAGE_KEY))).toBe(1);
    expect(() => validateQuadrantTaskLayoutBackup('{not-json')).toThrow('QUADRANT_LAYOUT_BACKUP_INVALID');
    const repository = createQuadrantTaskLayoutRepository(backend);
    await expect(repository.read()).resolves.toEqual({
      valid: {xRatio: 0.25, yRatio: 0.75},
    });
    await repository.upsert('next', {xRatio: 0.5, yRatio: 0.5});
    await repository.removeOrphans(new Set(['next']));
    await expect(repository.read()).resolves.toEqual({next: {xRatio: 0.5, yRatio: 0.5}});
  });

  it('exports schema v4 and restores task placements with the task identity intact', async () => {
    const sourceBackend = new WorkspaceBackend();
    const source = createStartFiveApp({
      storageBackend: sourceBackend,
      now: () => NOW,
      idGenerator: new WorkspaceIds(['layout-task']).next,
    });
    const task = await source.service.createTask(
      {title: '准备答辩', important: true, urgent: false},
      {operationId: 'layout:create'},
    );
    await createQuadrantTaskLayoutRepository(sourceBackend)
      .upsert(task.id, {xRatio: 0.75, yRatio: 0.25});
    const artifact = await source.localBackup.exportBackup();
    expect(artifact.preview.schemaVersion).toBe(4);
    expect(artifact.preview.stores).toContainEqual({alias: 'quadrantTaskLayout', recordCount: 1});

    const targetBackend = new WorkspaceBackend();
    const target = createStartFiveApp({
      storageBackend: targetBackend,
      now: () => NOW,
      idGenerator: new WorkspaceIds(['unused']).next,
    });
    await target.localBackup.replaceBackup(artifact.bytes);
    await expect(createQuadrantTaskLayoutRepository(targetBackend).read(new Set([task.id])))
      .resolves.toEqual({[task.id]: {xRatio: 0.75, yRatio: 0.25}});
    await expect(target.repository.list()).resolves.toEqual([
      expect.objectContaining({id: task.id, title: '准备答辩'}),
    ]);
  });

  it.each([1, 2, 3] as const)('continues to inspect a valid schema v%s backup', async schemaVersion => {
    const backend = new WorkspaceBackend();
    const source = createStartFiveApp({
      storageBackend: backend,
      now: () => NOW,
      idGenerator: new WorkspaceIds([`legacy-${schemaVersion}`]).next,
    });
    await source.service.createTask(
      {title: `旧备份 ${schemaVersion}`, important: false, urgent: false},
      {operationId: `legacy:${schemaVersion}`},
    );
    const current = await source.localBackup.exportBackup();
    const legacy = downgradeBackup(current.bytes, schemaVersion);
    await expect(source.localBackup.inspectBackup(legacy)).resolves.toMatchObject({
      preview: {schemaVersion, taskCount: 1},
    });
  });
});
