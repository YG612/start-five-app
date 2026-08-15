import * as path from 'node:path';
import {
  EXPECTED_STAGE_ORDER,
  EXPECTED_TEST_STAGE_ORDER,
  createQualityGateHarness,
  loadQualityGateProduction,
  type ProcessRequest,
} from './qualityGateV2TestKit';

function processRequests(
  plan: ReturnType<
    ReturnType<
      typeof loadQualityGateProduction
    >['createQualityGateOrchestrator']
  >['plan'] extends (mode: never) => infer Result ? Result : never,
): ProcessRequest[] {
  const requests: ProcessRequest[] = [];
  for (const stage of plan) {
    if (stage.request !== null) {
      requests.push(stage.request);
    }
  }
  return requests;
}

describe('QUALITY-GATE-V2 exact Windows plan', () => {
  it('owns the exact full and default-test stage order', () => {
    const production = loadQualityGateProduction();
    expect(production.QUALITY_GATE_STAGE_ORDER).toEqual(EXPECTED_STAGE_ORDER);
    expect(production.QUALITY_GATE_TEST_STAGE_ORDER).toEqual(
      EXPECTED_TEST_STAGE_ORDER,
    );
  });

  it('plans ten ordered stages and exactly eight process invocations for full mode', () => {
    const production = loadQualityGateProduction();
    const harness = createQualityGateHarness();
    const orchestrator = production.createQualityGateOrchestrator(
      harness.options,
    );
    const plan = orchestrator.plan('full');

    expect(plan.map(stage => stage.id)).toEqual(EXPECTED_STAGE_ORDER);
    expect(plan.map(stage => stage.kind)).toEqual([
      'process',
      'process',
      'process',
      'process',
      'process',
      'process',
      'process',
      'process',
      'internal',
      'internal',
    ]);
    expect(processRequests(plan)).toHaveLength(8);
    expect(harness.runner.calls).toEqual([]);
  });

  it('builds one accepted-root Jest command without expected-red candidates', () => {
    const production = loadQualityGateProduction();
    const harness = createQualityGateHarness();
    const orchestrator = production.createQualityGateOrchestrator(
      harness.options,
    );
    const formal = orchestrator.plan('full')[0];

    expect(formal).toEqual({
      id: 'formal-tests',
      kind: 'process',
      request: {
        executable: harness.options.runtime.pnpmExecutable,
        args: [
          'exec',
          'jest',
          '--runInBand',
          '--ci',
          '--coverage=false',
          '--roots',
          'tests/accepted-a',
          'tests/accepted-b',
        ],
        cwd: harness.options.projectRoot,
        env: {
          ANDROID_HOME: harness.options.runtime.androidSdkRoot,
          ANDROID_SDK_ROOT: harness.options.runtime.androidSdkRoot,
          CI: '1',
          JAVA_HOME: harness.options.runtime.javaHome,
          PATH: harness.options.runtime.path,
        },
        timeoutMs: harness.options.timeoutMs,
      },
    });
    expect(JSON.stringify(formal)).not.toContain('candidate');
    expect(JSON.stringify(formal)).not.toContain('rejected');
  });

  it('runs strict TypeScript immediately after accepted formal tests', () => {
    const production = loadQualityGateProduction();
    const harness = createQualityGateHarness();
    const orchestrator = production.createQualityGateOrchestrator(
      harness.options,
    );
    const plan = orchestrator.plan('full');

    expect(plan[1]).toMatchObject({
      id: 'typecheck',
      kind: 'process',
      request: {
        executable: harness.options.runtime.pnpmExecutable,
        args: ['exec', 'tsc', '--noEmit'],
        cwd: harness.options.projectRoot,
        timeoutMs: harness.options.timeoutMs,
      },
    });
  });

  it('uses offline Gradle with fixed JDK and SDK for lint, unit tests, and debug assembly', () => {
    const production = loadQualityGateProduction();
    const harness = createQualityGateHarness();
    const orchestrator = production.createQualityGateOrchestrator(
      harness.options,
    );
    const plan = orchestrator.plan('full');
    const gradle = path.win32.join(
      harness.options.projectRoot,
      'android',
      'gradlew.bat',
    );
    const androidCwd = path.win32.join(
      harness.options.projectRoot,
      'android',
    );

    expect(plan.slice(2, 5)).toEqual([
      {
        id: 'android-lint',
        kind: 'process',
        request: expect.objectContaining({
          executable: gradle,
          args: [
            '--offline',
            '--no-daemon',
            '--stacktrace',
            ':app:lintDebug',
          ],
          cwd: androidCwd,
          env: expect.objectContaining({
            JAVA_HOME: harness.options.runtime.javaHome,
            ANDROID_HOME: harness.options.runtime.androidSdkRoot,
            ANDROID_SDK_ROOT: harness.options.runtime.androidSdkRoot,
          }),
        }),
      },
      {
        id: 'android-unit-tests',
        kind: 'process',
        request: expect.objectContaining({
          executable: gradle,
          args: [
            '--offline',
            '--no-daemon',
            '--stacktrace',
            ':app:testDebugUnitTest',
          ],
          cwd: androidCwd,
        }),
      },
      {
        id: 'android-assemble',
        kind: 'process',
        request: expect.objectContaining({
          executable: gradle,
          args: [
            '--offline',
            '--no-daemon',
            '--stacktrace',
            ':app:assembleDebug',
          ],
          cwd: androidCwd,
        }),
      },
    ]);
  });

  it('verifies signature, alignment, and package metadata on the produced APK', () => {
    const production = loadQualityGateProduction();
    const harness = createQualityGateHarness();
    const orchestrator = production.createQualityGateOrchestrator(
      harness.options,
    );
    const plan = orchestrator.plan('full');
    const buildTools = path.win32.join(
      harness.options.runtime.androidSdkRoot,
      'build-tools',
      harness.options.runtime.androidBuildToolsVersion,
    );
    const apk = path.win32.join(
      harness.options.projectRoot,
      'android',
      'app',
      'build',
      'outputs',
      'apk',
      'debug',
      'app-debug.apk',
    );

    expect(plan.slice(5, 8)).toEqual([
      {
        id: 'android-signature',
        kind: 'process',
        request: expect.objectContaining({
          executable: path.win32.join(buildTools, 'apksigner.bat'),
          args: ['verify', '--verbose', '--print-certs', apk],
        }),
      },
      {
        id: 'android-zipalign',
        kind: 'process',
        request: expect.objectContaining({
          executable: path.win32.join(buildTools, 'zipalign.exe'),
          args: ['-c', '-P', '16', '-v', '4', apk],
        }),
      },
      {
        id: 'android-package-manifest',
        kind: 'process',
        request: expect.objectContaining({
          executable: path.win32.join(buildTools, 'aapt.exe'),
          args: ['dump', 'badging', apk],
        }),
      },
    ]);
  });

  it('keeps manifest validation and iOS static audit internal and never claims a Windows iOS build', () => {
    const production = loadQualityGateProduction();
    const harness = createQualityGateHarness();
    const orchestrator = production.createQualityGateOrchestrator(
      harness.options,
    );
    const full = orchestrator.plan('full');
    const testOnly = orchestrator.plan('test');

    expect(full.slice(8)).toEqual([
      {id: 'lock-manifests', kind: 'internal', request: null},
      {id: 'ios-static-audit', kind: 'internal', request: null},
    ]);
    expect(testOnly.map(stage => stage.id)).toEqual(
      EXPECTED_TEST_STAGE_ORDER,
    );
    expect(processRequests(testOnly)).toHaveLength(1);
    const serialized = JSON.stringify([full, testOnly]).toLowerCase();
    expect(serialized).not.toContain('xcodebuild');
    expect(serialized).not.toContain('ios build passed');
  });
});
