import {
  buildableReferencesByAction,
  descendantNodes,
  listSharedSchemeFiles,
  parsePbxProject,
  parseSchemeXml,
  readProjectText,
  validateSchemeTargetGraph,
} from './fixtures/xcodeTargetGraph';

const PBX_PROJECT_PATH = 'ios/StartFive.xcodeproj/project.pbxproj';
const SHARED_SCHEME_DIRECTORY =
  'ios/StartFive.xcodeproj/xcshareddata/xcschemes';
const REFERENCED_CONTAINER = 'container:StartFive.xcodeproj';

describe('NR-001 shared iOS scheme target graph contract', () => {
  it('contains a real canonical StartFive application PBXNativeTarget in PBXProject.targets', () => {
    const project = parsePbxProject(readProjectText(PBX_PROJECT_PATH));
    const applicationTargets = Array.from(project.nativeTargets.values()).filter(
      target => target.productType === 'com.apple.product-type.application',
    );

    expect(project.projectObjectIds).toHaveLength(1);
    expect(
      Array.from(project.projectTargetIds).every(id =>
        project.nativeTargets.has(id),
      ),
    ).toBe(true);
    expect(applicationTargets).toHaveLength(1);
    expect(applicationTargets[0]).toMatchObject({
      name: 'StartFive',
      productName: 'StartFive',
      productType: 'com.apple.product-type.application',
      buildableName: 'StartFive.app',
    });
    expect(project.projectTargetIds.has(applicationTargets[0]?.id ?? '')).toBe(
      true,
    );
  });

  it('resolves every BuildableReference and TestableReference to an exact real PBXNativeTarget', () => {
    const project = parsePbxProject(readProjectText(PBX_PROJECT_PATH));
    const schemeFiles = listSharedSchemeFiles(SHARED_SCHEME_DIRECTORY);
    const reports = schemeFiles.map(schemePath => ({
      schemePath,
      report: validateSchemeTargetGraph(
        project,
        parseSchemeXml(readProjectText(schemePath)),
        REFERENCED_CONTAINER,
      ),
    }));

    expect(schemeFiles.length).toBeGreaterThan(0);
    expect(
      reports.flatMap(({schemePath, report}) =>
        report.issues.map(issue => ({
          schemePath,
          code: issue.code,
          message: issue.message,
        })),
      ),
    ).toEqual([]);
  });

  it('routes Launch, Profile, and Archive through the canonical StartFive app target', () => {
    const project = parsePbxProject(readProjectText(PBX_PROJECT_PATH));
    const appTarget = Array.from(project.nativeTargets.values()).find(
      target =>
        target.name === 'StartFive' &&
        target.productType === 'com.apple.product-type.application',
    );
    if (appTarget === undefined) {
      throw new Error('Canonical StartFive application target is missing.');
    }

    for (const schemePath of listSharedSchemeFiles(SHARED_SCHEME_DIRECTORY)) {
      const scheme = parseSchemeXml(readProjectText(schemePath));
      for (const actionName of ['LaunchAction', 'ProfileAction']) {
        const references = buildableReferencesByAction(scheme, actionName);
        expect(references).toHaveLength(1);
        expect(references[0]?.attributes).toMatchObject({
          BlueprintIdentifier: appTarget.id,
          BlueprintName: appTarget.name,
          BuildableName: appTarget.buildableName,
          ReferencedContainer: REFERENCED_CONTAINER,
        });
      }

      const archiveActions = descendantNodes(scheme, 'ArchiveAction');
      expect(archiveActions).toHaveLength(1);
      expect(archiveActions[0]?.attributes.buildConfiguration).toBe('Release');

      const archiveBuildEntries = descendantNodes(
        scheme,
        'BuildActionEntry',
      ).filter(entry => {
        if (entry.attributes.buildForArchiving !== 'YES') {
          return false;
        }
        return descendantNodes(entry, 'BuildableReference').some(
          reference =>
            reference.attributes.BlueprintIdentifier === appTarget.id &&
            reference.attributes.BlueprintName === appTarget.name &&
            reference.attributes.BuildableName === appTarget.buildableName,
        );
      });
      expect(archiveBuildEntries).toHaveLength(1);
    }
  });
});
