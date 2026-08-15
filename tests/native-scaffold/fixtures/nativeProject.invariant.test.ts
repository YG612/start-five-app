import {
  assignmentValue,
  containsDebugSigningReference,
  extractBlocks,
  parsePbxObjects,
  pnpmPackageHasIntegrity,
  readPnpmImporterEntry,
  readText,
  requireDirectory,
  resolvePbxTargetConfigurationChain,
  xmlArrayStringValues,
} from './nativeProject';

const validPbxProject = `
  AAAAAAAAAAAAAAAAAAAAAAAA /* Project object */ = {
    isa = PBXProject;
    targets = (
      BBBBBBBBBBBBBBBBBBBBBBBB /* StartFive */,
    );
  };
  BBBBBBBBBBBBBBBBBBBBBBBB /* StartFive */ = {
    isa = PBXNativeTarget;
    buildConfigurationList = CCCCCCCCCCCCCCCCCCCCCCCC /* Build configuration list */;
    name = StartFive;
    productType = "com.apple.product-type.application";
  };
  CCCCCCCCCCCCCCCCCCCCCCCC /* Build configuration list */ = {
    isa = XCConfigurationList;
    buildConfigurations = (
      DDDDDDDDDDDDDDDDDDDDDDDD /* Debug */,
      EEEEEEEEEEEEEEEEEEEEEEEE /* Release */,
    );
  };
  DDDDDDDDDDDDDDDDDDDDDDDD /* Debug */ = {
    isa = XCBuildConfiguration;
    buildSettings = {
      INFOPLIST_FILE = StartFive/Info.plist;
      PRODUCT_BUNDLE_IDENTIFIER = com.startfive.app;
    };
    name = Debug;
  };
  EEEEEEEEEEEEEEEEEEEEEEEE /* Release */ = {
    isa = XCBuildConfiguration;
    buildSettings = {
      INFOPLIST_FILE = StartFive/Info.plist;
      PRODUCT_BUNDLE_IDENTIFIER = com.startfive.app;
    };
    name = Release;
  };
`;

describe('native scaffold test-helper invariants', () => {
  it('requires an actual directory rather than accepting any existing path', () => {
    expect(() => requireDirectory('package.json')).toThrow(
      'Required project directory is missing: package.json',
    );
    expect(requireDirectory('src')).toMatch(/[\\/]src$/);
  });

  it('parses the root pnpm importer and verifies a real integrity-bearing package entry', () => {
    const lockSource = readText('pnpm-lock.yaml');
    expect(readPnpmImporterEntry(lockSource, 'dependencies', 'react')).toEqual({
      specifier: '19.2.3',
      version: '19.2.3',
    });
    expect(pnpmPackageHasIntegrity(lockSource, 'react', '19.2.3')).toBe(true);
    expect(
      readPnpmImporterEntry(lockSource, 'dependencies', 'not-installed'),
    ).toBeNull();
  });

  it('extracts nested Groovy/Kotlin blocks and resolves the complete PBX target configuration chain', () => {
    const gradle = `
      // release { signingConfig signingConfigs.debug }
      def ignored = "release { fake }"
      release {
        proguardFiles(getDefaultProguardFile("rules { stable }"))
        nested { value = true }
      }
      getByName("release") {
        signingConfig = signingConfigs.getByName("release")
      }
    `;
    const blocks = extractBlocks(
      gradle,
      /(?:\brelease\s*|\bgetByName\s*\(\s*["']release["']\s*\)\s*)\{/g,
    );
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain('nested { value = true }');
    expect(blocks[1]).toContain('signingConfigs.getByName("release")');

    const objects = parsePbxObjects(validPbxProject);
    expect(objects.map(object => object.id)).toEqual([
      'AAAAAAAAAAAAAAAAAAAAAAAA',
      'BBBBBBBBBBBBBBBBBBBBBBBB',
      'CCCCCCCCCCCCCCCCCCCCCCCC',
      'DDDDDDDDDDDDDDDDDDDDDDDD',
      'EEEEEEEEEEEEEEEEEEEEEEEE',
    ]);
    const chain = resolvePbxTargetConfigurationChain(
      validPbxProject,
      'StartFive',
    );
    expect(chain.project.id).toBe('AAAAAAAAAAAAAAAAAAAAAAAA');
    expect(chain.target.id).toBe('BBBBBBBBBBBBBBBBBBBBBBBB');
    expect(chain.configurationList.id).toBe('CCCCCCCCCCCCCCCCCCCCCCCC');
    expect(chain.configurations.map(configuration => configuration.id)).toEqual([
      'DDDDDDDDDDDDDDDDDDDDDDDD',
      'EEEEEEEEEEEEEEEEEEEEEEEE',
    ]);
    expect(
      chain.configurations.map(configuration =>
        assignmentValue(configuration.body, 'name'),
      ),
    ).toEqual(['Debug', 'Release']);

    const wrongProjectTarget = validPbxProject.replace(
      'BBBBBBBBBBBBBBBBBBBBBBBB /* StartFive */,',
      '999999999999999999999999 /* WrongTarget */,',
    );
    expect(() =>
      resolvePbxTargetConfigurationChain(wrongProjectTarget, 'StartFive'),
    ).toThrow('StartFive target is not referenced by PBXProject.targets.');

    const orphanConfiguration = `${validPbxProject}
      FFFFFFFFFFFFFFFFFFFFFFFF /* Orphan */ = {
        isa = XCBuildConfiguration;
        buildSettings = {
          PRODUCT_BUNDLE_IDENTIFIER = com.wrong.orphan;
        };
        name = Debug;
      };
    `;
    expect(() =>
      resolvePbxTargetConfigurationChain(orphanConfiguration, 'StartFive'),
    ).toThrow('Found an orphan bundle-bearing XCBuildConfiguration.');
  });

  it('detects equivalent Groovy/KTS debug-signing calls only in executable code', () => {
    for (const source of [
      'signingConfig signingConfigs.debug',
      'signingConfig = signingConfigs["debug"]',
      'signingConfig = signingConfigs.getByName("debug")',
      'signingConfig = signingConfigs.findByName("debug")',
      'signingConfig = signingConfigs.named("debug")',
      'signingConfig = signingConfigs.named("debug").get()',
      'signingConfig = signingConfigs.getAt("debug")',
    ]) {
      expect(containsDebugSigningReference(source)).toBe(true);
    }
    expect(
      containsDebugSigningReference(`
        // signingConfig = signingConfigs.named("debug").get()
        def note = 'signingConfig = signingConfigs.findByName("debug")'
        signingConfig = signingConfigs.named("release").get()
      `),
    ).toBe(false);
  });

  it('extracts non-empty plist arrays and distinguishes a missing key', () => {
    const plist = `
      <key>UISupportedInterfaceOrientations</key>
      <array>
        <string>UIInterfaceOrientationPortrait</string>
        <string>UIInterfaceOrientationLandscapeLeft</string>
      </array>
    `;
    expect(
      xmlArrayStringValues(plist, 'UISupportedInterfaceOrientations'),
    ).toEqual([
      'UIInterfaceOrientationPortrait',
      'UIInterfaceOrientationLandscapeLeft',
    ]);
    expect(xmlArrayStringValues(plist, 'Missing')).toBeNull();

    for (const nonStringChild of [
      '<integer>1</integer>',
      '<dict><key>value</key><string>ignored</string></dict>',
      '<true/>',
    ]) {
      const mixedPlist = `
        <key>UISupportedInterfaceOrientations</key>
        <array>
          <string>UIInterfaceOrientationPortrait</string>
          ${nonStringChild}
        </array>
      `;
      expect(() =>
        xmlArrayStringValues(
          mixedPlist,
          'UISupportedInterfaceOrientations',
        ),
      ).toThrow(
        'Plist array UISupportedInterfaceOrientations contains a non-string child.',
      );
    }
  });
});
