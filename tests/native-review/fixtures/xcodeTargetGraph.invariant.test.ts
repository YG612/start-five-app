import {
  parsePbxProject,
  parseSchemeXml,
  validateSchemeTargetGraph,
} from './xcodeTargetGraph';

const APP_TARGET_ID = 'AAAAAAAAAAAAAAAAAAAAAAAA';
const APP_PRODUCT_ID = 'BBBBBBBBBBBBBBBBBBBBBBBB';
const TEST_TARGET_ID = 'CCCCCCCCCCCCCCCCCCCCCCCC';
const TEST_PRODUCT_ID = 'DDDDDDDDDDDDDDDDDDDDDDDD';
const PROJECT_ID = 'EEEEEEEEEEEEEEEEEEEEEEEE';
const WRONG_OBJECT_ID = 'FFFFFFFFFFFFFFFFFFFFFFFF';
const GROUP_PRODUCT_ID = '111111111111111111111111';
const TYPELESS_PRODUCT_ID = '222222222222222222222222';
const MISSING_ID = '999999999999999999999999';

function pbxFixture(
  testProductReference: string = TEST_PRODUCT_ID,
): string {
  return `// !$*UTF8*$!
{
  archiveVersion = 1;
  note = "isa = PBXNativeTarget; name = CommentOnlyTarget;";
  objects = {
    /* PBXNativeTarget in this comment must never become an object. */
    ${APP_PRODUCT_ID} /* StartFive.app */ = {
      isa = PBXFileReference;
      path = StartFive.app;
    };
    ${TEST_PRODUCT_ID} /* StartFiveTests.xctest */ = {
      isa = PBXFileReference;
      path = StartFiveTests.xctest;
    };
    ${WRONG_OBJECT_ID} /* NotATarget */ = {
      isa = PBXFileReference;
      path = NotATarget.xctest;
    };
    ${GROUP_PRODUCT_ID} /* Same-name group is not a product file */ = {
      isa = PBXGroup;
      name = StartFiveTests.xctest;
      path = StartFiveTests.xctest;
    };
    ${TYPELESS_PRODUCT_ID} /* Same-name object without isa */ = {
      name = StartFiveTests.xctest;
      path = StartFiveTests.xctest;
    };
    ${APP_TARGET_ID} /* StartFive */ = {
      isa = PBXNativeTarget;
      name = StartFive;
      productName = StartFive;
      productReference = ${APP_PRODUCT_ID} /* StartFive.app */;
      productType = "com.apple.product-type.application";
    };
    ${TEST_TARGET_ID} /* StartFiveTests */ = {
      isa = PBXNativeTarget;
      name = StartFiveTests;
      productName = StartFiveTests;
      productReference = ${testProductReference} /* candidate product object */;
      productType = "com.apple.product-type.bundle.unit-test";
    };
    ${PROJECT_ID} /* Project object */ = {
      isa = PBXProject;
      targets = (
        ${APP_TARGET_ID} /* StartFive */,
        ${TEST_TARGET_ID} /* StartFiveTests */,
      );
    };
  };
  rootObject = ${PROJECT_ID} /* Project object */;
}`;
}

type TestableOptions = {
  id: string;
  blueprintName: string;
  buildableName: string;
};

function buildableReference(options: TestableOptions): string {
  return `<BuildableReference
    BuildableIdentifier="primary"
    BlueprintIdentifier="${options.id}"
    BuildableName="${options.buildableName}"
    BlueprintName="${options.blueprintName}"
    ReferencedContainer="container:StartFive.xcodeproj">
  </BuildableReference>`;
}

function schemeFixture(
  testable: TestableOptions | null = {
    id: TEST_TARGET_ID,
    blueprintName: 'StartFiveTests',
    buildableName: 'StartFiveTests.xctest',
  },
): string {
  const appReference = buildableReference({
    id: APP_TARGET_ID,
    blueprintName: 'StartFive',
    buildableName: 'StartFive.app',
  });
  const testableXml =
    testable === null
      ? '<TestableReference skipped="NO"></TestableReference>'
      : `<TestableReference skipped="NO">${buildableReference(testable)}</TestableReference>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Fake: <BuildableReference BlueprintIdentifier="${MISSING_ID}"/> -->
<Scheme version="1.3">
  <BuildAction>
    <BuildActionEntries>
      <BuildActionEntry buildForArchiving="YES">${appReference}</BuildActionEntry>
    </BuildActionEntries>
  </BuildAction>
  <TestAction><Testables>${testableXml}</Testables></TestAction>
  <LaunchAction>${appReference}</LaunchAction>
  <ProfileAction>${appReference}</ProfileAction>
  <ArchiveAction buildConfiguration="Release"></ArchiveAction>
</Scheme>`;
}

function issueCodes(
  options: TestableOptions | null,
  testProductReference: string = TEST_PRODUCT_ID,
): string[] {
  const project = parsePbxProject(pbxFixture(testProductReference));
  const scheme = parseSchemeXml(schemeFixture(options));
  return validateSchemeTargetGraph(
    project,
    scheme,
    'container:StartFive.xcodeproj',
  ).issues.map(issue => issue.code);
}

describe('NR-H helper invariants for structural Xcode target resolution', () => {
  it('parses a valid CRLF PBX/scheme graph without treating comments or quoted text as targets', () => {
    const project = parsePbxProject(pbxFixture().replace(/\n/g, '\r\n'));
    const scheme = parseSchemeXml(schemeFixture().replace(/\n/g, '\r\n'));
    const report = validateSchemeTargetGraph(
      project,
      scheme,
      'container:StartFive.xcodeproj',
    );

    expect(Array.from(project.nativeTargets.keys()).sort()).toEqual(
      [APP_TARGET_ID, TEST_TARGET_ID].sort(),
    );
    expect(report).toEqual({
      issues: [],
      buildableReferenceCount: 4,
      testableReferenceCount: 1,
    });
  });

  it('rejects a well-formed orphan BlueprintIdentifier that is absent from PBX objects', () => {
    expect(
      issueCodes({
        id: MISSING_ID,
        blueprintName: 'StartFiveTests',
        buildableName: 'StartFiveTests.xctest',
      }),
    ).toEqual(['UNKNOWN_BLUEPRINT_IDENTIFIER']);
  });

  it('rejects an existing PBX object identifier when the object is not a PBXNativeTarget', () => {
    expect(
      issueCodes({
        id: WRONG_OBJECT_ID,
        blueprintName: 'StartFiveTests',
        buildableName: 'StartFiveTests.xctest',
      }),
    ).toEqual(['BLUEPRINT_NOT_NATIVE_TARGET']);
  });

  it('rejects BlueprintName and BuildableName that disagree with the resolved target', () => {
    expect(
      issueCodes({
        id: TEST_TARGET_ID,
        blueprintName: 'WrongTests',
        buildableName: 'WrongTests.xctest',
      }),
    ).toEqual(['BLUEPRINT_NAME_MISMATCH', 'BUILDABLE_NAME_MISMATCH']);
  });

  it('rejects an application target when it is nested in a TestableReference', () => {
    expect(
      issueCodes({
        id: APP_TARGET_ID,
        blueprintName: 'StartFive',
        buildableName: 'StartFive.app',
      }),
    ).toEqual(['TESTABLE_NOT_TEST_TARGET']);
  });

  it('rejects a TestableReference node that does not own a BuildableReference', () => {
    expect(issueCodes(null)).toEqual(['TESTABLE_WITHOUT_BUILDABLE_REFERENCE']);
  });

  it('rejects a same-name PBXGroup used as target.productReference', () => {
    expect(
      issueCodes(
        {
          id: TEST_TARGET_ID,
          blueprintName: 'StartFiveTests',
          buildableName: 'StartFiveTests.xctest',
        },
        GROUP_PRODUCT_ID,
      ),
    ).toEqual(['TARGET_PRODUCT_NOT_FILE_REFERENCE']);
  });

  it('rejects a same-name product object whose isa type is missing', () => {
    expect(
      issueCodes(
        {
          id: TEST_TARGET_ID,
          blueprintName: 'StartFiveTests',
          buildableName: 'StartFiveTests.xctest',
        },
        TYPELESS_PRODUCT_ID,
      ),
    ).toEqual(['TARGET_PRODUCT_REFERENCE_TYPE_MISSING']);
  });

  it('rejects a target.productReference whose PBX object is missing', () => {
    expect(
      issueCodes(
        {
          id: TEST_TARGET_ID,
          blueprintName: 'StartFiveTests',
          buildableName: 'StartFiveTests.xctest',
        },
        MISSING_ID,
      ),
    ).toEqual(['TARGET_PRODUCT_OBJECT_MISSING']);
  });
});
