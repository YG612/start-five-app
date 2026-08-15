import {
  cleanupTempDirectories,
  EXPECTED_IOS_STATIC_CHECK_IDS,
  loadQualityGateProduction,
  projectRoot,
  type IosStaticAuditResult,
} from './qualityGateV2TestKit';
import {
  createIosProjectFixture,
  IOS_PROJECT_MUTATIONS,
} from './fixtures/iosProjectFixture';

function expectCompleteStaticEvidence(result: IosStaticAuditResult): void {
  expect(result.scope).toBe('windows-static-only');
  expect(result.checks.map(check => check.id)).toEqual(
    EXPECTED_IOS_STATIC_CHECK_IDS,
  );
  expect(new Set(result.checks.map(check => check.id)).size).toBe(
    EXPECTED_IOS_STATIC_CHECK_IDS.length,
  );
  expect(result.checks.every(check => check.detail.trim().length > 0)).toBe(
    true,
  );
  expect(result.detail.trim().length).toBeGreaterThan(0);
}

afterEach(() => {
  cleanupTempDirectories();
});

describe('QUALITY-GATE-V2 real iOS project static audit', () => {
  it('passes the checked-in StartFive project with complete static-only evidence', async () => {
    const production = loadQualityGateProduction();

    const result = await production.auditIosProjectStatic({
      projectRoot: projectRoot(),
    });

    expectCompleteStaticEvidence(result);
    expect(result.status).toBe('passed');
    expect(result.checks.every(check => check.status === 'passed')).toBe(true);
    expect(result.detail.toLowerCase()).toContain('static');
    expect(result.detail.toLowerCase()).not.toContain('ios build passed');
  });

  it('passes an independent semantic iOS project fixture without exact-file snapshots', async () => {
    const production = loadQualityGateProduction();
    const root = createIosProjectFixture();

    const result = await production.auditIosProjectStatic({projectRoot: root});

    expectCompleteStaticEvidence(result);
    expect(result.status).toBe('passed');
    expect(result.checks.every(check => check.status === 'passed')).toBe(true);
  });

  it.each(IOS_PROJECT_MUTATIONS)(
    'reports only the independently specified failures for mutation $id',
    async ({id, expectedFailedCheckIds}) => {
      const production = loadQualityGateProduction();
      const root = createIosProjectFixture(id);

      const result = await production.auditIosProjectStatic({
        projectRoot: root,
      });

      expectCompleteStaticEvidence(result);
      expect(result.status).toBe('failed');
      const actualFailedCheckIds = result.checks
        .filter(check => check.status === 'failed')
        .map(check => check.id);
      const actualPassedCheckIds = result.checks
        .filter(check => check.status === 'passed')
        .map(check => check.id);
      const expectedPassedCheckIds = EXPECTED_IOS_STATIC_CHECK_IDS.filter(
        checkId => !expectedFailedCheckIds.includes(checkId),
      );

      expect(actualFailedCheckIds).toEqual(expectedFailedCheckIds);
      expect(actualPassedCheckIds).toEqual(expectedPassedCheckIds);
    },
  );
});
