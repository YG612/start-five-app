import {
  baseName,
  extension,
  listRegularFiles,
  projectRelative,
  readAbsoluteText,
  readText,
  requireDirectory,
  requireFile,
  sha256File,
  verifyLockManifest,
} from './fixtures/nativeProject';

const sourceSentinels: ReadonlyArray<readonly [string, RegExp]> = [
  ['src/app/startFiveApp.tsx', /export function createStartFiveApp\b/],
  ['src/application/coreAppService.ts', /export function createCoreAppService\b/],
  [
    'src/data/persistentTaskStorage.ts',
    /export function createPersistentTaskStorage\b/,
  ],
  ['src/data/taskRepository.ts', /export function createTaskRepository\b/],
  ['src/domain/nextStep.ts', /export function selectNextStep\b/],
  ['src/domain/quadrant.ts', /export function getQuadrant\b/],
  ['src/domain/recommendation.ts', /export function recommendNextTask\b/],
  ['src/domain/scoring.ts', /export function awardCompletionScore\b/],
  ['src/domain/task.ts', /export function createTask\b/],
  ['src/screens/CoreFlowScreen.tsx', /export function CoreFlowScreen\b/],
  ['src/services/fiveMinuteTimer.ts', /export class FiveMinuteTimer\b/],
];

const ignoredGeneratedDirectories = new Set([
  '.cxx',
  '.cxx-short',
  '.externalNativeBuild',
  '.git',
  '.gradle',
  '.idea',
  '.kotlin',
  '.short-app-build',
  'DerivedData',
  'Pods',
  'build',
  'captures',
  'coverage',
  'dist',
  'node_modules',
  'tests',
  'vendor',
  'xcuserdata',
]);

const isolationScannedExtensions = new Set([
  '',
  '.c',
  '.cc',
  '.cpp',
  '.cxx',
  '.gradle',
  '.h',
  '.hpp',
  '.java',
  '.js',
  '.json',
  '.kt',
  '.kts',
  '.lock',
  '.m',
  '.mm',
  '.pbxproj',
  '.plist',
  '.podfile',
  '.podspec',
  '.properties',
  '.rb',
  '.storyboard',
  '.swift',
  '.ts',
  '.tsx',
  '.xcconfig',
  '.xcscheme',
  '.xml',
  '.yaml',
  '.yml',
]);

const canonicalGeneratedQualityGateReportPaths = new Set<string>([
  'quality-reports/quality-gate-report.json',
  'quality-reports/quality-gate-summary.txt',
]);

const legacyName = ['qing', 'ji'].join('');
const legacyPattern = new RegExp(legacyName, 'i');
const windowsAbsolutePath =
  /(?:^|[\s"'`=(,:])(?:[A-Za-z]:[\\/]|\\\\[^\\/\s]+[\\/][^\\/\s]+[\\/])/m;
const unixAbsoluteWorkspacePath =
  /(?:^|[\s"'`=(,:])\/(?:Users|home|mnt|tmp|Volumes|workspace|workspaces)\/[A-Za-z0-9._~/-]+/m;

function isCanonicalGeneratedQualityGateReport(relativePath: string): boolean {
  return canonicalGeneratedQualityGateReportPaths.has(relativePath);
}

function firstPosixSegment(relativePath: string): string {
  const separatorIndex = relativePath.indexOf('/');
  return (
    separatorIndex === -1
      ? relativePath
      : relativePath.slice(0, separatorIndex)
  ).toLowerCase();
}

function isQualityGateTextScanCandidate(relativePath: string): boolean {
  if (extension(relativePath).toLowerCase() !== '.txt') {
    return false;
  }
  return (
    firstPosixSegment(relativePath) === 'quality-reports' ||
    baseName(relativePath).toLowerCase() === 'quality-gate-summary.txt'
  );
}

function isIsolationScanCandidate(relativePath: string): boolean {
  const fileExtension = extension(relativePath);
  const qualityReportsCaseVariant =
    firstPosixSegment(relativePath) === 'quality-reports' &&
    isolationScannedExtensions.has(fileExtension.toLowerCase());
  return (
    !isCanonicalGeneratedQualityGateReport(relativePath) &&
    (isolationScannedExtensions.has(fileExtension) ||
      qualityReportsCaseVariant ||
      isQualityGateTextScanCandidate(relativePath))
  );
}

function containsIsolationFinding(
  relativePath: string,
  source: string,
): boolean {
  return (
    legacyPattern.test(relativePath) ||
    legacyPattern.test(source) ||
    /记账|bookkeep(?:er|ing)?|ledger\s+app/i.test(source) ||
    windowsAbsolutePath.test(source) ||
    unixAbsoluteWorkspacePath.test(source) ||
    /file:\/\//i.test(source) ||
    /(?:^|[\\/])outputs[\\/]/i.test(source)
  );
}

function recordsIsolationFinding(
  relativePath: string,
  source: string,
): boolean {
  return (
    isIsolationScanCandidate(relativePath) &&
    containsIsolationFinding(relativePath, source)
  );
}

describe('NS-005 isolated-project and accepted-asset preservation contract', () => {
  it('preserves every accepted core, persistence, composition, and screen sentinel', () => {
    for (const [relativePath, sentinel] of sourceSentinels) {
      requireFile(relativePath);
      expect(readText(relativePath)).toMatch(sentinel);
    }
  });

  it('preserves all seven formal lock generations and their locked assets byte-for-byte', () => {
    const expectedManifests = new Map<
      string,
      {entryCount: number; sha256: string}
    >([
      [
        'TEST_LOCK.sha256',
        {
          entryCount: 13,
          sha256:
            '9cce965ce8632b5c9acdca84a3c8ea02d4fac1b923bfd9fb8822fb221b4403ca',
        },
      ],
      [
        'REVIEW1_LOCK.sha256',
        {
          entryCount: 5,
          sha256:
            '5261ee58167e31dd1677f533eaee570b8dd1ef1d8c1ccf21eb7581f8ee7f7a43',
        },
      ],
      [
        'REVIEW2_LOCK.sha256',
        {
          entryCount: 3,
          sha256:
            '3f955e92d533566247b076187f79a7bbf5f3ad8359e2eb780a64e4e66aa8fd1b',
        },
      ],
      [
        'REVIEW3_LOCK.sha256',
        {
          entryCount: 3,
          sha256:
            'e0611feac1b3da1c1813bab2928aba1196fb2399003e52fec8434dde60f79349',
        },
      ],
      [
        'REVIEW4_LOCK.sha256',
        {
          entryCount: 4,
          sha256:
            '99e7f7566d2cff0c10e595d1952f361ab428c13b5014a98a65feebb73eb50040',
        },
      ],
      [
        'PHASE4_LOCK.sha256',
        {
          entryCount: 5,
          sha256:
            'f407914c3aedf3f04d0bdb826d11379c27b283bbf4e1d3e8c7ee2075481a30dd',
        },
      ],
      [
        'PHASE4_REVIEW_LOCK.sha256',
        {
          entryCount: 5,
          sha256:
            'b19863c03008600e5d85658c878ef2d3c8473b01a8c27653df4c9521abdbef4a',
        },
      ],
    ]);

    for (const [manifestPath, expected] of expectedManifests) {
      const verification = verifyLockManifest(manifestPath);
      expect(sha256File(manifestPath)).toBe(expected.sha256);
      expect(verification.entryCount).toBe(expected.entryCount);
      expect(verification.errors).toEqual([]);
    }
  });

  it('scans source/config/native YAML, locks, C/C++, and podspecs without scanning tests or generated vendors', () => {
    const productionFiles = listRegularFiles(
      '.',
      ignoredGeneratedDirectories,
    ).filter(absolutePath =>
      isIsolationScanCandidate(projectRelative(absolutePath)),
    );
    const findings: string[] = [];

    expect(productionFiles.length).toBeGreaterThan(0);
    for (const absolutePath of productionFiles) {
      const relativePath = projectRelative(absolutePath);
      const source = readAbsoluteText(absolutePath);
      if (recordsIsolationFinding(relativePath, source)) {
        findings.push(relativePath);
      }
    }

    expect(findings).toEqual([]);
  });

  it('exempts only the two exact root POSIX quality-gate reports without creating a scan blind spot', () => {
    expect(ignoredGeneratedDirectories.has('quality-reports')).toBe(false);
    expect([...canonicalGeneratedQualityGateReportPaths]).toEqual([
      'quality-reports/quality-gate-report.json',
      'quality-reports/quality-gate-summary.txt',
    ]);
    for (const relativePath of canonicalGeneratedQualityGateReportPaths) {
      expect(isCanonicalGeneratedQualityGateReport(relativePath)).toBe(true);
      expect(isIsolationScanCandidate(relativePath)).toBe(false);
    }

    const scannedCounterexamples: ReadonlyArray<
      readonly [relativePath: string, hostileSource: string]
    > = [
      [
        'quality-reports/unexpected.json',
        String.raw`C:\workspace\another-project\secret.json`,
      ],
      [
        'quality-reports/unexpected.yaml',
        '/workspace/another-project/secret.yaml',
      ],
      ['quality-reports/unexpected.ts', '../outputs/another-project/index.ts'],
      [
        'quality-reports/unexpected.txt',
        String.raw`C:\workspace\another-project\unexpected.txt`,
      ],
      [
        'quality-reports/unexpected.TXT',
        '/workspace/another-project/unexpected.TXT',
      ],
      [
        'quality-reports/unexpected.JSON',
        '../outputs/another-project/unexpected.JSON',
      ],
      [
        'archive/quality-gate-report.json',
        String.raw`D:\workspace\another-project\report.json`,
      ],
      [
        'archive/quality-gate-summary.txt',
        String.raw`D:\workspace\another-project\summary.txt`,
      ],
      [
        'Quality-Reports/quality-gate-report.json',
        '/home/runner/workspaces/another-project/report.json',
      ],
      [
        'Quality-Reports/quality-gate-summary.txt',
        '/home/runner/workspaces/another-project/summary.txt',
      ],
      [
        'quality-reports/Quality-Gate-Report.json',
        '/outputs/another-project/report.json',
      ],
      [
        'quality-reports/Quality-Gate-Summary.txt',
        '/outputs/another-project/summary.txt',
      ],
      [
        'quality-reports/quality-gate-summary.TXT',
        String.raw`C:\workspace\another-project\summary.TXT`,
      ],
      [
        String.raw`quality-reports\quality-gate-report.json`,
        String.raw`\\server\share\another-project\report.json`,
      ],
      [
        './quality-reports/quality-gate-report.json',
        '/tmp/another-project/report.json',
      ],
    ];

    for (const [relativePath, hostileSource] of scannedCounterexamples) {
      expect(isCanonicalGeneratedQualityGateReport(relativePath)).toBe(false);
      expect(isIsolationScanCandidate(relativePath)).toBe(true);
      expect(recordsIsolationFinding(relativePath, hostileSource)).toBe(true);
    }
    const ordinaryTextCounterexamples: ReadonlyArray<
      readonly [relativePath: string, hostileSource: string]
    > = [
      ['README.txt', String.raw`C:\workspace\another-project\README.txt`],
      ['docs/notes.TXT', '/workspace/another-project/notes.TXT'],
      ['archive/unexpected.txt', '../outputs/another-project/unexpected.txt'],
    ];
    for (const [relativePath, hostileSource] of ordinaryTextCounterexamples) {
      expect(containsIsolationFinding(relativePath, hostileSource)).toBe(true);
      expect(isIsolationScanCandidate(relativePath)).toBe(false);
      expect(recordsIsolationFinding(relativePath, hostileSource)).toBe(false);
    }
    expect(
      containsIsolationFinding(
        'quality-reports/quality-gate-report.json',
        String.raw`C:\workspace\another-project\report.json`,
      ),
    ).toBe(true);
    expect(
      recordsIsolationFinding(
        'quality-reports/quality-gate-report.json',
        String.raw`C:\workspace\another-project\report.json`,
      ),
    ).toBe(false);
  });

  it('merges the native scaffold at the project root instead of nesting another app', () => {
    requireDirectory('android');
    requireDirectory('ios');
    requireFile('app.json');
    const projectFiles = listRegularFiles('.', ignoredGeneratedDirectories);
    const appJsonFiles = projectFiles
      .filter(path => baseName(path) === 'app.json')
      .map(projectRelative);
    const packageFiles = projectFiles
      .filter(path => baseName(path) === 'package.json')
      .map(projectRelative);

    expect(appJsonFiles).toEqual(['app.json']);
    expect(packageFiles).toEqual(['package.json']);
  });
});
