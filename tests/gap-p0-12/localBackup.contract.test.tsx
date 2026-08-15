import React from 'react';
import {render, waitFor} from '@testing-library/react-native';
import {FIRST_ACTIVATION_TITLE} from '../gap-p0-11/gapP011TestKit';
import {
  expectDifferentBytes,
  expectSameBytes,
  expectUniqueLogicalIds,
  expectValidSevenStorePreview,
  makeInvalidBackupVectors,
  makeLocalBackupHarness,
  requireLocalBackup,
  seedPublicTask,
  sha256Hex,
} from './gapP012TestKit';

describe('GAP-P0-12 local backup / empty-install restore contract', () => {
  test('journey 1: export waits for a real public task mutation and returns only the after-write snapshot', async () => {
    const source = makeLocalBackupHarness({idPrefix: 'p012-export'});
    await seedPublicTask(
      source,
      'export baseline task',
      'p012:export:baseline',
    );
    const localBackup = requireLocalBackup(source.composition);
    const backendBefore = source.backend.stableByteSnapshot();
    const schedulerBefore = source.scheduler.snapshot();
    const first = await localBackup.exportBackup();

    expect(first.digestSha256).toBe(sha256Hex(first.bytes));
    expectValidSevenStorePreview(first.preview);
    await expect(localBackup.inspectBackup(first.bytes)).resolves.toEqual({
      digestSha256: first.digestSha256,
      preview: first.preview,
    });
    expectSameBytes(source.backend.stableByteSnapshot(), backendBefore);
    expect(source.scheduler.snapshot()).toEqual(schedulerBefore);

    const pause = source.backend.writerGate.armNextSet();
    const publicWrite = source.composition.service.createTask(
      {title: 'concurrent public task', important: false, urgent: false},
      {operationId: 'p012:export:concurrent'},
    );
    await pause.reached;
    const exportDuringWrite = localBackup.exportBackup();
    pause.release();
    await publicWrite;

    const concurrent = await exportDuringWrite;
    const afterWrite = await localBackup.exportBackup();
    expectSameBytes(concurrent.bytes, afterWrite.bytes);
    expect(concurrent.digestSha256).toBe(afterWrite.digestSha256);
    expectDifferentBytes(concurrent.bytes, first.bytes);
    expect(afterWrite.digestSha256).not.toBe(first.digestSha256);
    expect(concurrent.digestSha256).toBe(sha256Hex(concurrent.bytes));
    expect(afterWrite.digestSha256).toBe(sha256Hex(afterWrite.bytes));
    expect(source.scheduler.snapshot()).toEqual(schedulerBefore);
  });

  test('journey 2: all invalid vectors and a nonempty target reject without changing public or durable state', async () => {
    const source = makeLocalBackupHarness({idPrefix: 'p012-invalid-source'});
    await seedPublicTask(
      source,
      'invalid-vector source task',
      'p012:invalid:source',
    );
    const sourceBackup = await requireLocalBackup(
      source.composition,
    ).exportBackup();
    const invalidVectors = makeInvalidBackupVectors(sourceBackup.bytes);

    for (const [name, bytes] of Object.entries(invalidVectors)) {
      const target = makeLocalBackupHarness({
        idPrefix: `p012-invalid-${name}`,
      });
      const localBackup = requireLocalBackup(target.composition);
      const durableBefore = target.backend.stableByteSnapshot();
      const publicBefore = await target.composition.service.getState();
      const historyBefore = await target.composition.reviewHistory.listReceiptHistory();
      const schedulerBefore = target.scheduler.snapshot();

      await expect(localBackup.restoreBackup(bytes)).rejects.toBeDefined();
      expectSameBytes(target.backend.stableByteSnapshot(), durableBefore);
      expect(await target.composition.service.getState()).toEqual(publicBefore);
      expect(
        await target.composition.reviewHistory.listReceiptHistory(),
      ).toEqual(historyBefore);
      expect(target.scheduler.snapshot()).toEqual(schedulerBefore);
    }

    const nonempty = makeLocalBackupHarness({idPrefix: 'p012-nonempty'});
    await seedPublicTask(
      nonempty,
      'existing target task',
      'p012:nonempty:target',
    );
    const nonemptyBackup = requireLocalBackup(nonempty.composition);
    const durableBefore = nonempty.backend.stableByteSnapshot();
    const publicBefore = await nonempty.composition.service.getState();
    const historyBefore = await nonempty.composition.reviewHistory.listReceiptHistory();
    const schedulerBefore = nonempty.scheduler.snapshot();

    await expect(
      nonemptyBackup.restoreBackup(sourceBackup.bytes),
    ).rejects.toBeDefined();
    expectSameBytes(nonempty.backend.stableByteSnapshot(), durableBefore);
    expect(await nonempty.composition.service.getState()).toEqual(publicBefore);
    expect(
      await nonempty.composition.reviewHistory.listReceiptHistory(),
    ).toEqual(historyBefore);
    expect(nonempty.scheduler.snapshot()).toEqual(schedulerBefore);
  });

  test('journey 3: byte restart finishes generic-fault recovery before the first activation route and stays idempotent', async () => {
    const source = makeLocalBackupHarness({idPrefix: 'p012-recovery-source'});
    await seedPublicTask(
      source,
      'restored public task',
      'p012:recovery:source',
    );
    const sourceBackup = await requireLocalBackup(
      source.composition,
    ).exportBackup();
    const sourceState = await source.composition.service.getState();
    const sourceHistory = await source.composition.reviewHistory.listReceiptHistory();

    for (const ordinal of [1, 2, 4]) {
      const target = makeLocalBackupHarness({
        idPrefix: `p012-recovery-target-${ordinal}`,
      });
      const firstBootBackup = requireLocalBackup(target.composition);
      target.backend.failOnNthFutureSet(ordinal);
      await expect(
        firstBootBackup.restoreBackup(sourceBackup.bytes),
      ).rejects.toMatchObject({code: 'INJECTED_KV_SET_FAILURE'});
      target.backend.clearFailure();

      const restartedBackend = target.backend.byteRestart();
      const restarted = makeLocalBackupHarness({
        idPrefix: `p012-recovery-restart-${ordinal}`,
        backend: restartedBackend,
        scheduler: target.scheduler,
      });
      const restartedBackup = requireLocalBackup(restarted.composition);
      const screen = await render(<restarted.composition.AppRoot />);
      let firstScreenUnmounted = false;
      try {
        let onboardingWasObserved =
          screen.queryByRole('header', {name: FIRST_ACTIVATION_TITLE}) !== null;
        await waitFor(() =>
          {
            onboardingWasObserved =
              onboardingWasObserved ||
              screen.queryByRole('header', {name: FIRST_ACTIVATION_TITLE}) !==
                null;
            expect(
            screen.getByRole('tab', {name: '象限'}),
            ).toBeTruthy();
          },
          {timeout: 3_000, interval: 10},
        );
        expect(onboardingWasObserved).toBe(false);

        expect(await restarted.composition.service.getState()).toEqual(
          sourceState,
        );
        expect(
          await restarted.composition.reviewHistory.listReceiptHistory(),
        ).toEqual(sourceHistory);
        const recovered = await restartedBackup.exportBackup();
        expectSameBytes(recovered.bytes, sourceBackup.bytes);
        expect(recovered.digestSha256).toBe(sourceBackup.digestSha256);
        expect(recovered.preview).toEqual(sourceBackup.preview);

        await restartedBackup.recoverPendingRestore();
        await expect(
          restartedBackup.restoreBackup(sourceBackup.bytes),
        ).resolves.toMatchObject({status: 'already_restored'});
        const afterInitialReconcile = restarted.scheduler.snapshot();
        expect(afterInitialReconcile.replaceCalls).toBeLessThanOrEqual(1);
        expectUniqueLogicalIds(restarted.scheduler);

        await restartedBackup.recoverPendingRestore();
        await expect(
          restartedBackup.restoreBackup(sourceBackup.bytes),
        ).resolves.toMatchObject({status: 'already_restored'});
        const afterRepeatedCalls = restarted.scheduler.snapshot();
        expect(afterRepeatedCalls.replaceCalls).toBe(
          afterInitialReconcile.replaceCalls,
        );
        expect(afterRepeatedCalls.logicalIds).toEqual(
          afterInitialReconcile.logicalIds,
        );

        await screen.unmount();
        firstScreenUnmounted = true;
        const secondRestart = makeLocalBackupHarness({
          idPrefix: `p012-recovery-second-restart-${ordinal}`,
          backend: restarted.backend.byteRestart(),
          scheduler: restarted.scheduler,
        });
        const secondBackup = requireLocalBackup(secondRestart.composition);
        const secondScreen = await render(<secondRestart.composition.AppRoot />);
        try {
          await waitFor(
            () =>
              expect(
                secondScreen.getByRole('tab', {name: '象限'}),
              ).toBeTruthy(),
            {timeout: 3_000, interval: 10},
          );
          await secondBackup.recoverPendingRestore();
          await expect(
            secondBackup.restoreBackup(sourceBackup.bytes),
          ).resolves.toMatchObject({status: 'already_restored'});
          expect(await secondRestart.composition.service.getState()).toEqual(
            sourceState,
          );
          expect(
            await secondRestart.composition.reviewHistory.listReceiptHistory(),
          ).toEqual(sourceHistory);
          const afterSecondRestart = secondRestart.scheduler.snapshot();
          expect(afterSecondRestart.replaceCalls).toBe(
            afterInitialReconcile.replaceCalls,
          );
          expect(afterSecondRestart.logicalIds).toEqual(
            afterInitialReconcile.logicalIds,
          );
          const repeated = await secondBackup.exportBackup();
          expectSameBytes(repeated.bytes, sourceBackup.bytes);
          expect(repeated.digestSha256).toBe(sourceBackup.digestSha256);
          expect(repeated.preview).toEqual(sourceBackup.preview);
          expectUniqueLogicalIds(secondRestart.scheduler);
        } finally {
          await secondScreen.unmount();
        }
      } finally {
        if (!firstScreenUnmounted) {
          await screen.unmount();
        }
      }
    }
  });
});
