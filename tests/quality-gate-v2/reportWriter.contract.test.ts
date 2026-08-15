import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  cleanupTempDirectories,
  createTempDirectory,
  expectRejectCode,
  loadQualityGateProduction,
  readJsonRecord,
  type QualityGateReport,
} from './qualityGateV2TestKit';

type FailureProcessEvidence = Readonly<{
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  timeoutSource: 'deadline' | 'signal' | null;
  stdout: string;
  stderr: string;
}>;

const DEFAULT_FAILURE_EVIDENCE: FailureProcessEvidence = {
  exitCode: 23,
  signal: null,
  timedOut: false,
  timeoutSource: null,
  stdout: 'failing stdout evidence',
  stderr: 'failing stderr evidence',
};

function report(
  runId: string,
  status: 'passed' | 'failed' = 'passed',
  failureEvidence: FailureProcessEvidence = DEFAULT_FAILURE_EVIDENCE,
): QualityGateReport {
  const failed = status === 'failed';
  return {
    schema: 'start-five.quality-gate-report',
    version: 1,
    runId,
    mode: 'full',
    platform: 'win32',
    status,
    projectRoot: 'C:\\workspace\\start-five',
    startedAt: '2026-08-05T12:00:00.000Z',
    finishedAt: '2026-08-05T12:01:00.000Z',
    stages: [
      {
        id: 'formal-tests',
        status: failed ? 'failed' : 'passed',
        request: {
          executable: 'C:\\runtime\\pnpm.cmd',
          args: ['exec', 'jest'],
          cwd: 'C:\\workspace\\start-five',
          env: {CI: '1'},
          timeoutMs: 120_000,
        },
        result: {
          exitCode: failed ? failureEvidence.exitCode : 0,
          signal: failed ? failureEvidence.signal : null,
          stdout: failed ? failureEvidence.stdout : 'passing stdout',
          stderr: failed ? failureEvidence.stderr : '',
          timedOut: failed ? failureEvidence.timedOut : false,
          timeoutSource: failed ? failureEvidence.timeoutSource : null,
          durationMs: 50,
        },
        startedAt: '2026-08-05T12:00:00.000Z',
        finishedAt: '2026-08-05T12:00:01.000Z',
      },
    ],
    failure: failed
      ? {
          stageId: 'formal-tests',
          ...failureEvidence,
        }
      : null,
  };
}

afterEach(() => {
  cleanupTempDirectories();
});

describe('QUALITY-GATE-V2 atomic evidence reports', () => {
  it('atomically writes exact machine JSON and a human summary for success', async () => {
    const production = loadQualityGateProduction();
    const directory = createTempDirectory();
    const writer = production.createAtomicQualityGateReportWriter({
      reportDirectory: directory,
    });
    const value = report('passing-run');

    const artifacts = await writer.write(value);

    expect(artifacts).toEqual({
      jsonPath: path.join(directory, 'quality-gate-report.json'),
      summaryPath: path.join(directory, 'quality-gate-summary.txt'),
    });
    expect(readJsonRecord(artifacts.jsonPath)).toEqual(value);
    const summary = fs.readFileSync(artifacts.summaryPath, 'utf8');
    expect(summary).toContain('passing-run');
    expect(summary).toContain('PASSED');
    expect(summary).toContain('formal-tests');
    expect(fs.readdirSync(directory).sort()).toEqual([
      'quality-gate-report.json',
      'quality-gate-summary.txt',
    ]);
  });

  it('retains exact failure exit/stdout/stderr in both evidence formats', async () => {
    const production = loadQualityGateProduction();
    const directory = createTempDirectory();
    const writer = production.createAtomicQualityGateReportWriter({
      reportDirectory: directory,
    });
    const value = report('failed-run', 'failed');

    const artifacts = await writer.write(value);

    expect(readJsonRecord(artifacts.jsonPath)).toEqual(value);
    const summary = fs.readFileSync(artifacts.summaryPath, 'utf8');
    expect(summary).toContain('FAILED');
    expect(summary).toContain('exitCode: 23');
    expect(summary).toContain('failing stdout evidence');
    expect(summary).toContain('failing stderr evidence');
  });

  it.each([
    {
      label: 'deadline',
      evidence: {
        exitCode: null,
        signal: 'SIGTERM',
        timedOut: true,
        timeoutSource: 'deadline',
        stdout: 'deadline stdout evidence',
        stderr: 'deadline stderr evidence',
      } as const,
    },
    {
      label: 'controlled timeout signal',
      evidence: {
        exitCode: null,
        signal: 'SIGTERM',
        timedOut: true,
        timeoutSource: 'signal',
        stdout: 'signal stdout evidence',
        stderr: 'signal stderr evidence',
      } as const,
    },
    {
      label: 'external abort',
      evidence: {
        exitCode: null,
        signal: 'SIGTERM',
        timedOut: false,
        timeoutSource: null,
        stdout: 'abort stdout evidence',
        stderr: 'abort stderr evidence',
      } as const,
    },
  ])('writes exact $label process evidence to JSON and human summary', async ({
    label,
    evidence,
  }) => {
    const production = loadQualityGateProduction();
    const directory = createTempDirectory();
    const writer = production.createAtomicQualityGateReportWriter({
      reportDirectory: directory,
    });
    const value = report('process-evidence-' + label, 'failed', evidence);

    const artifacts = await writer.write(value);

    expect(readJsonRecord(artifacts.jsonPath)).toEqual(value);
    expect(readJsonRecord(artifacts.jsonPath)).toMatchObject({
      stages: [
        {
          id: 'formal-tests',
          status: 'failed',
          result: evidence,
        },
      ],
      failure: {stageId: 'formal-tests', ...evidence},
    });
    const summary = fs.readFileSync(artifacts.summaryPath, 'utf8');
    expect(summary).toContain('exitCode: ' + String(evidence.exitCode));
    expect(summary).toContain('signal: ' + String(evidence.signal));
    expect(summary).toContain('timedOut: ' + String(evidence.timedOut));
    expect(summary).toContain(
      'timeoutSource: ' + String(evidence.timeoutSource),
    );
    expect(summary).toContain(evidence.stdout);
    expect(summary).toContain(evidence.stderr);
  });

  it('replaces prior evidence as one coherent run and leaves no temporary file', async () => {
    const production = loadQualityGateProduction();
    const directory = createTempDirectory();
    const writer = production.createAtomicQualityGateReportWriter({
      reportDirectory: directory,
    });
    await writer.write(report('first-run', 'failed'));

    const artifacts = await writer.write(report('second-run'));

    expect(readJsonRecord(artifacts.jsonPath)).toMatchObject({
      runId: 'second-run',
      status: 'passed',
    });
    const summary = fs.readFileSync(artifacts.summaryPath, 'utf8');
    expect(summary).toContain('second-run');
    expect(summary).not.toContain('first-run');
    expect(
      fs.readdirSync(directory).some(name => name.includes('.tmp')),
    ).toBe(false);
  });

  it('uses collision-safe atomic temp names for concurrent writers', async () => {
    const production = loadQualityGateProduction();
    const directory = createTempDirectory();
    const writer = production.createAtomicQualityGateReportWriter({
      reportDirectory: directory,
    });

    const outcomes = await Promise.all([
      writer.write(report('concurrent-a')),
      writer.write(report('concurrent-b', 'failed')),
    ]);

    expect(outcomes[0]).toEqual(outcomes[1]);
    const machine = readJsonRecord(outcomes[0].jsonPath);
    const summary = fs.readFileSync(outcomes[0].summaryPath, 'utf8');
    const finalRunId = machine.runId;
    expect(['concurrent-a', 'concurrent-b']).toContain(finalRunId);
    expect(summary).toContain(String(finalRunId));
    expect(fs.readdirSync(directory)).toHaveLength(2);
  });

  it('returns a stable write error when the report directory is not a directory', async () => {
    const production = loadQualityGateProduction();
    const directory = createTempDirectory();
    const filePath = path.join(directory, 'not-a-directory');
    fs.writeFileSync(filePath, 'occupied', 'utf8');
    const writer = production.createAtomicQualityGateReportWriter({
      reportDirectory: filePath,
    });

    await expectRejectCode(
      writer.write(report('write-failure')),
      'QUALITY_GATE_REPORT_WRITE_FAILED',
    );
    expect(fs.readFileSync(filePath, 'utf8')).toBe('occupied');
  });
});
