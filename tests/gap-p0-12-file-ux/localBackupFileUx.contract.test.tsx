import React from 'react';
import {
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react-native';
import {
  createStartFiveApp,
  type StartFiveAppComposition,
  type StartFiveAppDependencies,
} from '../../src/app/startFiveApp';
import type {FocusRuntimeClock} from '../../src/app/focusSessionRuntime';
import {
  FIXED_NOW,
  MutableAsyncKV,
  MutableReminderScheduler,
  expectSameBytes,
  seedPublicTask,
} from '../gap-p0-12/gapP012TestKit';

type BackupFile = Readonly<{name: string; bytes: string}>;
type BackupSaveRequest = Readonly<{
  suggestedName: string;
  mimeType: 'application/json';
  bytes: string;
}>;
type BackupFileBridge = Readonly<{
  save(request: BackupSaveRequest): Promise<'saved' | 'cancelled'>;
  pick(): Promise<BackupFile | null>;
}>;

type FileUxDependencies = StartFiveAppDependencies & Readonly<{
  backupFileBridge?: BackupFileBridge;
}>;

const createFileUxApp = createStartFiveApp as unknown as (
  dependencies: FileUxDependencies,
) => StartFiveAppComposition;

class FixedRuntimeClock implements FocusRuntimeClock {
  nowMs = (): number => Date.parse(FIXED_NOW);

  subscribe(_listener: () => void): () => void {
    return () => undefined;
  }
}

class BackupFileBridgeFake implements BackupFileBridge {
  readonly saveRequests: BackupSaveRequest[] = [];
  pickCalls = 0;
  private readonly saveResults: Array<'saved' | 'cancelled'>;
  private readonly pickResults: Array<BackupFile | null>;

  constructor(options: Readonly<{
    saveResults?: readonly ('saved' | 'cancelled')[];
    pickResults?: readonly (BackupFile | null)[];
  }> = {}) {
    this.saveResults = [...(options.saveResults ?? [])];
    this.pickResults = [...(options.pickResults ?? [])];
  }

  async save(request: BackupSaveRequest): Promise<'saved' | 'cancelled'> {
    this.saveRequests.push({...request});
    return this.saveResults.shift() ?? 'saved';
  }

  async pick(): Promise<BackupFile | null> {
    this.pickCalls += 1;
    const next = this.pickResults.shift();
    return next === undefined ? null : next;
  }
}

type Harness = Readonly<{
  backend: MutableAsyncKV;
  scheduler: MutableReminderScheduler;
  composition: StartFiveAppComposition;
}>;

function createHarness(options: Readonly<{
  idPrefix: string;
  bridge: BackupFileBridge;
  backend?: MutableAsyncKV;
}>): Harness {
  const backend = options.backend ?? new MutableAsyncKV();
  const scheduler = new MutableReminderScheduler();
  let idOrdinal = 0;
  const composition = createFileUxApp({
    storageBackend: backend,
    now: () => FIXED_NOW,
    idGenerator: () => {
      idOrdinal += 1;
      return `${options.idPrefix}-${idOrdinal}`;
    },
    focusRuntimeClock: new FixedRuntimeClock(),
    tomorrowFirstNotifications: scheduler,
    backupFileBridge: options.bridge,
  });
  return {backend, scheduler, composition};
}

function utf8Text(bytes: Uint8Array): string {
  let encoded = '';
  for (const byte of bytes) {
    encoded += `%${byte.toString(16).padStart(2, '0')}`;
  }
  return decodeURIComponent(encoded);
}

async function renderWorkspace(harness: Harness) {
  const screen = await render(React.createElement(harness.composition.AppRoot));
  await waitFor(() =>
    expect(screen.getByRole('button', {name: '结束今天'})).toBeTruthy(),
  );
  return screen;
}

async function openBackupPage(
  screen: Awaited<ReturnType<typeof render>>,
): Promise<void> {
  await fireEvent.press(
    screen.getByRole('button', {name: '数据与备份'}),
  );
  await waitFor(() =>
    expect(screen.getByRole('header', {name: '数据与备份'})).toBeTruthy(),
  );
}

describe('GAP-P0-12 file backup UX', () => {
  test('workspace export hands the exact JSON artifact to the bridge; cancel is harmless and save is confirmed', async () => {
    const bridge = new BackupFileBridgeFake({
      saveResults: ['cancelled', 'saved'],
    });
    const harness = createHarness({idPrefix: 'p012-file-export', bridge});
    await seedPublicTask(
      harness,
      '需要随备份导出的任务',
      'p012:file:export:seed',
    );
    const durableBefore = harness.backend.stableByteSnapshot();
    const stateBefore = await harness.composition.service.getState();
    const historyBefore =
      await harness.composition.reviewHistory.listReceiptHistory();
    const schedulerBefore = harness.scheduler.snapshot();
    const artifact = await harness.composition.localBackup.exportBackup();
    const exactRequest: BackupSaveRequest = {
      suggestedName: 'start-five-backup-2026-08-12.json',
      mimeType: 'application/json',
      bytes: utf8Text(artifact.bytes),
    };
    const screen = await renderWorkspace(harness);

    try {
      await openBackupPage(screen);
      await fireEvent.press(
        screen.getByRole('button', {name: '导出备份'}),
      );
      await waitFor(() => expect(bridge.saveRequests).toHaveLength(1));
      expect(bridge.saveRequests[0]).toEqual(exactRequest);
      expect(screen.getByRole('header', {name: '数据与备份'})).toBeTruthy();
      expect(screen.queryByText('导出失败')).toBeNull();

      await fireEvent.press(
        screen.getByRole('button', {name: '导出备份'}),
      );
      await waitFor(() =>
        expect(screen.getByText('备份已保存')).toBeTruthy(),
      );
      expect(bridge.saveRequests).toEqual([exactRequest, exactRequest]);
      expectSameBytes(harness.backend.stableByteSnapshot(), durableBefore);
      expect(await harness.composition.service.getState()).toEqual(stateBefore);
      expect(
        await harness.composition.reviewHistory.listReceiptHistory(),
      ).toEqual(historyBefore);
      expect(harness.scheduler.snapshot()).toEqual(schedulerBefore);
    } finally {
      await screen.unmount();
    }
  });

  test('import is inspect-first: picker/preview/cancel/back never write, and only explicit confirmation restores an empty install', async () => {
    const sourceBridge = new BackupFileBridgeFake();
    const source = createHarness({
      idPrefix: 'p012-file-import-source',
      bridge: sourceBridge,
    });
    await seedPublicTask(
      source,
      '从文件恢复的精确任务',
      'p012:file:import:source',
    );
    const sourceState = await source.composition.service.getState();
    const artifact = await source.composition.localBackup.exportBackup();
    const validFile = {
      name: 'start-five-valid.json',
      bytes: utf8Text(artifact.bytes),
    } as const;
    const bridge = new BackupFileBridgeFake({
      pickResults: [
        null,
        {name: '损坏的备份.json', bytes: '{"broken":true}'},
        validFile,
        validFile,
      ],
    });
    const target = createHarness({idPrefix: 'p012-file-import', bridge});
    const emptyState = await target.composition.service.getState();
    const durableBefore = target.backend.stableByteSnapshot();
    const historyBefore =
      await target.composition.reviewHistory.listReceiptHistory();
    const schedulerBefore = target.scheduler.snapshot();
    const screen = await renderWorkspace(target);

    try {
      await openBackupPage(screen);

      await fireEvent.press(
        screen.getByRole('button', {name: '导入备份'}),
      );
      expect(screen.getByRole('header', {name: '数据与备份'})).toBeTruthy();
      expectSameBytes(target.backend.stableByteSnapshot(), durableBefore);

      await fireEvent.press(
        screen.getByRole('button', {name: '导入备份'}),
      );
      await waitFor(() =>
        expect(
          screen.getByText('无法读取备份文件，请选择有效的备份'),
        ).toBeTruthy(),
      );
      expectSameBytes(target.backend.stableByteSnapshot(), durableBefore);
      expect(await target.composition.service.getState()).toEqual(emptyState);

      await fireEvent.press(
        screen.getByRole('button', {name: '导入备份'}),
      );
      await waitFor(() =>
        expect(screen.getByText('备份文件：start-five-valid.json')).toBeTruthy(),
      );
      expect(screen.getByText('数据区：7')).toBeTruthy();
      expect(
        screen.getByText(`记录总数：${artifact.preview.totalRecordCount}`),
      ).toBeTruthy();
      expect(
        screen.getByText(`提醒记录：${artifact.preview.notificationCount}`),
      ).toBeTruthy();
      expectSameBytes(target.backend.stableByteSnapshot(), durableBefore);
      expect(await target.composition.service.getState()).toEqual(emptyState);

      await fireEvent.press(
        screen.getByRole('button', {name: '取消恢复'}),
      );
      expectSameBytes(target.backend.stableByteSnapshot(), durableBefore);
      await fireEvent.press(
        screen.getByRole('button', {name: '返回工作台'}),
      );
      await waitFor(() =>
        expect(screen.getByRole('header', {name: '任务工作台'})).toBeTruthy(),
      );
      expectSameBytes(target.backend.stableByteSnapshot(), durableBefore);
      expect(
        await target.composition.reviewHistory.listReceiptHistory(),
      ).toEqual(historyBefore);
      expect(target.scheduler.snapshot()).toEqual(schedulerBefore);

      await openBackupPage(screen);
      await fireEvent.press(
        screen.getByRole('button', {name: '导入备份'}),
      );
      await waitFor(() =>
        expect(screen.getByRole('button', {name: '确认恢复'})).toBeTruthy(),
      );
      expectSameBytes(target.backend.stableByteSnapshot(), durableBefore);
      await fireEvent.press(
        screen.getByRole('button', {name: '确认恢复'}),
      );
      await waitFor(() =>
        expect(screen.getByRole('header', {name: '任务工作台'})).toBeTruthy(),
      );
      expect(await target.composition.service.getState()).toEqual(sourceState);
    } finally {
      await screen.unmount();
    }

    const nonemptyBridge = new BackupFileBridgeFake({
      pickResults: [validFile],
    });
    const nonempty = createHarness({
      idPrefix: 'p012-file-import-nonempty',
      bridge: nonemptyBridge,
    });
    await seedPublicTask(
      nonempty,
      '非空安装已有任务',
      'p012:file:import:nonempty',
    );
    const nonemptyDurableBefore = nonempty.backend.stableByteSnapshot();
    const nonemptyStateBefore = await nonempty.composition.service.getState();
    const nonemptyHistoryBefore =
      await nonempty.composition.reviewHistory.listReceiptHistory();
    const nonemptySchedulerBefore = nonempty.scheduler.snapshot();
    const nonemptyScreen = await renderWorkspace(nonempty);
    try {
      await openBackupPage(nonemptyScreen);
      await fireEvent.press(
        nonemptyScreen.getByRole('button', {name: '导入备份'}),
      );
      await waitFor(() =>
        expect(
          nonemptyScreen.getByText('备份文件：start-five-valid.json'),
        ).toBeTruthy(),
      );
      expect(nonemptyScreen.getByText('数据区：7')).toBeTruthy();
      expect(nonemptyBridge.pickCalls).toBe(1);
      expect(nonemptyBridge.saveRequests).toHaveLength(0);
      expectSameBytes(
        nonempty.backend.stableByteSnapshot(),
        nonemptyDurableBefore,
      );
      expect(await nonempty.composition.service.getState()).toEqual(
        nonemptyStateBefore,
      );

      await fireEvent.press(
        nonemptyScreen.getByRole('button', {name: '确认恢复'}),
      );
      await waitFor(() =>
        expect(nonemptyScreen.getByText('仅支持空安装恢复')).toBeTruthy(),
      );
      expect(nonemptyBridge.pickCalls).toBe(1);
      expect(nonemptyBridge.saveRequests).toHaveLength(0);
      expectSameBytes(
        nonempty.backend.stableByteSnapshot(),
        nonemptyDurableBefore,
      );
      expect(await nonempty.composition.service.getState()).toEqual(
        nonemptyStateBefore,
      );
      expect(
        await nonempty.composition.reviewHistory.listReceiptHistory(),
      ).toEqual(nonemptyHistoryBefore);
      expect(nonempty.scheduler.snapshot()).toEqual(nonemptySchedulerBefore);
    } finally {
      await nonemptyScreen.unmount();
    }
  });
});
