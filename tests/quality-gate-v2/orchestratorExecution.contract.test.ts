import {
  EXPECTED_STAGE_ORDER,
  EXPECTED_IOS_STATIC_CHECK_IDS,
  createQualityGateHarness,
  errorCause,
  expectRejectCode,
  failedResult,
  loadQualityGateProduction,
  successResult,
} from './qualityGateV2TestKit';

const PROCESS_STAGE_IDS = EXPECTED_STAGE_ORDER.slice(0, 8);

describe('QUALITY-GATE-V2 fail-fast execution', () => {
  it('executes every full-mode stage once in order and writes one passing report', async () => {
    const production = loadQualityGateProduction();
    const harness = createQualityGateHarness();
    const orchestrator = production.createQualityGateOrchestrator(
      harness.options,
    );

    const report = await orchestrator.run('full');

    expect(harness.runner.calls).toHaveLength(8);
    expect(harness.lockValidator.calls).toBe(1);
    expect(harness.iosAuditor.calls).toBe(1);
    expect(harness.reportWriter.reports).toHaveLength(1);
    expect(report.status).toBe('passed');
    expect(report.failure).toBeNull();
    expect(report.stages.map(stage => stage.id)).toEqual(
      EXPECTED_STAGE_ORDER,
    );
    expect(report.stages.map(stage => stage.status)).toEqual(
      EXPECTED_STAGE_ORDER.map(() => 'passed'),
    );
    expect(report.stages[9]).toMatchObject({
      id: 'ios-static-audit',
      status: 'passed',
      request: null,
      result: {
        exitCode: 0,
        stdout: expect.stringContaining('Static iOS audit only'),
      },
    });
    expect(report).toEqual(harness.reportWriter.reports[0]);
  });

  it.each(PROCESS_STAGE_IDS.map((stageId, index) => ({stageId, index})))(
    'stops immediately at $stageId and preserves its exact process evidence',
    async ({stageId, index}) => {
      const results = PROCESS_STAGE_IDS.map((_, resultIndex) =>
        resultIndex === index
          ? failedResult(
              20 + index,
              'stdout-' + stageId,
              'stderr-' + stageId,
            )
          : successResult(),
      );
      const production = loadQualityGateProduction();
      const harness = createQualityGateHarness(results);
      const orchestrator = production.createQualityGateOrchestrator(
        harness.options,
      );

      const report = await orchestrator.run('full');

      expect(harness.runner.calls).toHaveLength(index + 1);
      expect(harness.lockValidator.calls).toBe(0);
      expect(harness.iosAuditor.calls).toBe(0);
      expect(harness.reportWriter.reports).toHaveLength(1);
      expect(report.status).toBe('failed');
      expect(report.failure).toEqual({
        stageId,
        exitCode: 20 + index,
        signal: null,
        timedOut: false,
        timeoutSource: null,
        stdout: 'stdout-' + stageId,
        stderr: 'stderr-' + stageId,
      });
      expect(report.stages[index]).toMatchObject({
        id: stageId,
        status: 'failed',
        result: {
          exitCode: 20 + index,
          stdout: 'stdout-' + stageId,
          stderr: 'stderr-' + stageId,
        },
      });
      expect(
        report.stages.slice(index + 1).every(stage => stage.status === 'skipped'),
      ).toBe(true);
    },
  );

  it('stops on timeout and preserves null exit, timeout, stdout, and stderr', async () => {
    const timeout = successResult({
      exitCode: null,
      signal: 'SIGTERM',
      stdout: 'before timeout',
      stderr: 'timeout detail',
      timedOut: true,
      timeoutSource: 'deadline',
      durationMs: 120_000,
    });
    const production = loadQualityGateProduction();
    const harness = createQualityGateHarness([timeout]);
    const orchestrator = production.createQualityGateOrchestrator(
      harness.options,
    );

    const report = await orchestrator.run('full');

    expect(harness.runner.calls).toHaveLength(1);
    expect(report.failure).toEqual({
      stageId: 'formal-tests',
      exitCode: null,
      signal: 'SIGTERM',
      timedOut: true,
      timeoutSource: 'deadline',
      stdout: 'before timeout',
      stderr: 'timeout detail',
    });
    expect(report.stages.slice(1).every(stage => stage.status === 'skipped')).toBe(
      true,
    );
  });

  it('stops on an external abort signal and preserves the child signal', async () => {
    const aborted = successResult({
      exitCode: null,
      signal: 'SIGINT',
      stderr: 'quality gate aborted',
    });
    const production = loadQualityGateProduction();
    const harness = createQualityGateHarness([aborted]);
    const orchestrator = production.createQualityGateOrchestrator(
      harness.options,
    );

    const report = await orchestrator.run('full');

    expect(report.status).toBe('failed');
    expect(report.failure).toEqual({
      stageId: 'formal-tests',
      exitCode: null,
      signal: 'SIGINT',
      timedOut: false,
      timeoutSource: null,
      stdout: '',
      stderr: 'quality gate aborted',
    });
    expect(harness.runner.calls).toHaveLength(1);
  });

  it('records lock validation failure, skips iOS audit, and still writes evidence', async () => {
    const production = loadQualityGateProduction();
    const harness = createQualityGateHarness();
    const validationFailure = Object.assign(
      new Error('lock hash mismatch'),
      {code: 'QUALITY_GATE_MANIFEST_SHA_MISMATCH'},
    );
    harness.lockValidator.failure = validationFailure;
    const orchestrator = production.createQualityGateOrchestrator(
      harness.options,
    );

    const report = await orchestrator.run('full');

    expect(harness.runner.calls).toHaveLength(8);
    expect(harness.lockValidator.calls).toBe(1);
    expect(harness.iosAuditor.calls).toBe(0);
    expect(report.status).toBe('failed');
    expect(report.failure).toMatchObject({
      stageId: 'lock-manifests',
      exitCode: 1,
      timedOut: false,
      timeoutSource: null,
      stderr: expect.stringContaining('QUALITY_GATE_MANIFEST_SHA_MISMATCH'),
    });
    expect(report.stages[9]).toMatchObject({
      id: 'ios-static-audit',
      status: 'skipped',
    });
    expect(harness.reportWriter.reports).toEqual([report]);
  });

  it('reports an iOS static-audit failure without ever presenting it as a build', async () => {
    const production = loadQualityGateProduction();
    const harness = createQualityGateHarness();
    harness.iosAuditor.result = {
      status: 'failed',
      scope: 'windows-static-only',
      detail: 'Missing shared scheme; Windows static audit failed.',
      checks: EXPECTED_IOS_STATIC_CHECK_IDS.map(id => ({
        id,
        status: id === 'shared-scheme' ? 'failed' : 'passed',
        detail:
          id === 'shared-scheme'
            ? 'Missing shared scheme.'
            : 'Passed static check: ' + id,
      })),
    };
    const orchestrator = production.createQualityGateOrchestrator(
      harness.options,
    );

    const report = await orchestrator.run('full');

    expect(harness.runner.calls).toHaveLength(8);
    expect(report.status).toBe('failed');
    expect(report.failure).toMatchObject({
      stageId: 'ios-static-audit',
      exitCode: 1,
      timeoutSource: null,
      stderr: expect.stringContaining('Windows static audit failed'),
    });
    expect(JSON.stringify(report).toLowerCase()).not.toContain(
      'ios build passed',
    );
    expect(harness.reportWriter.reports).toEqual([report]);
  });

  it('propagates atomic report-writer failure with its exact cause', async () => {
    const production = loadQualityGateProduction();
    const harness = createQualityGateHarness();
    const cause = new Error('disk full sentinel');
    harness.reportWriter.failure = cause;
    const orchestrator = production.createQualityGateOrchestrator(
      harness.options,
    );

    const exposed = await expectRejectCode(
      orchestrator.run('full'),
      'QUALITY_GATE_REPORT_WRITE_FAILED',
    );

    expect(errorCause(exposed)).toBe(cause);
    expect(harness.reportWriter.reports).toHaveLength(1);
  });

  it('runs only formal tests and manifest validation in default-test mode', async () => {
    const production = loadQualityGateProduction();
    const harness = createQualityGateHarness();
    const orchestrator = production.createQualityGateOrchestrator(
      harness.options,
    );

    const report = await orchestrator.run('test');

    expect(harness.runner.calls).toHaveLength(1);
    expect(harness.lockValidator.calls).toBe(1);
    expect(harness.iosAuditor.calls).toBe(0);
    expect(report.stages.map(stage => stage.id)).toEqual([
      'formal-tests',
      'lock-manifests',
    ]);
    expect(report.status).toBe('passed');
    expect(harness.reportWriter.reports).toEqual([report]);
  });
});
