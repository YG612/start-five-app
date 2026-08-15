import {
  assignmentValue,
  baseName,
  extractPbxObjects,
  listRegularFiles,
  normalizeSource,
  projectRelative,
  readAbsoluteText,
  readJson,
  readText,
  requireDirectory,
  requireFile,
  resolvePbxTargetConfigurationChain,
  xmlArrayStringValues,
  xmlStringValue,
} from './fixtures/nativeProject';

type AppIdentity = {
  name: string;
  displayName: string;
};

function iosFiles(): string[] {
  return listRegularFiles(
    'ios',
    new Set([
      '.bundle',
      '.xcode.env.local',
      'DerivedData',
      'Pods',
      'build',
      'xcuserdata',
    ]),
  );
}

function singleFileNamed(fileName: string): string {
  const matches = iosFiles().filter(path => baseName(path) === fileName);
  expect(matches.map(projectRelative)).toHaveLength(1);
  const match = matches[0];
  if (match === undefined) {
    throw new Error(`Required iOS file is missing: ${fileName}`);
  }
  return match;
}

describe('NS-004 iOS RN 0.86 static scaffold contract', () => {
  it('contains one canonical Xcode project, app target, delegate, plist, launch screen, and privacy manifest', () => {
    requireDirectory('ios');
    requireFile('ios/Podfile');
    requireFile('ios/StartFive/Info.plist');
    requireFile('ios/StartFive/LaunchScreen.storyboard');
    requireFile('ios/StartFive/PrivacyInfo.xcprivacy');
    const files = iosFiles().map(projectRelative);
    const projectFiles = files.filter(path => /\.xcodeproj\/project\.pbxproj$/.test(path));
    const delegates = files.filter(path => /\/AppDelegate\.(?:swift|m|mm)$/.test(path));
    const project = readText('ios/StartFive.xcodeproj/project.pbxproj');
    const applicationTargets = extractPbxObjects(project, 'PBXNativeTarget').filter(
      target =>
        assignmentValue(target, 'productType') ===
        'com.apple.product-type.application',
    );

    expect(projectFiles).toEqual(['ios/StartFive.xcodeproj/project.pbxproj']);
    expect(delegates).toHaveLength(1);
    expect(delegates[0]).toMatch(/^ios\/StartFive\/AppDelegate\.(?:swift|m|mm)$/);
    expect(extractPbxObjects(project, 'PBXProject')).toHaveLength(1);
    expect(applicationTargets).toHaveLength(1);
    expect(assignmentValue(applicationTargets[0] ?? '', 'name')).toBe(
      'StartFive',
    );
    expect(projectRelative(singleFileNamed('Info.plist'))).toBe(
      'ios/StartFive/Info.plist',
    );
  });

  it('binds exactly one StartFive Debug and Release app configuration to com.startfive.app', () => {
    const project = readText('ios/StartFive.xcodeproj/project.pbxproj');
    const chain = resolvePbxTargetConfigurationChain(project, 'StartFive');
    const byName = new Map(
      chain.configurations.map(configuration => [
        assignmentValue(configuration.body, 'name'),
        configuration,
      ]),
    );

    expect(chain.configurations).toHaveLength(2);
    expect(Array.from(byName.keys()).sort()).toEqual(['Debug', 'Release']);
    for (const configurationName of ['Debug', 'Release']) {
      const configuration = byName.get(configurationName);
      expect(configuration).toBeDefined();
      if (configuration === undefined) {
        throw new Error(`Missing StartFive ${configurationName} configuration.`);
      }
      expect(
        assignmentValue(configuration.body, 'PRODUCT_BUNDLE_IDENTIFIER'),
      ).toBe('com.startfive.app');
      expect(assignmentValue(configuration.body, 'INFOPLIST_FILE')).toMatch(
        /^(?:"?)StartFive\/Info\.plist(?:"?)$/,
      );
    }
    expect(project).not.toMatch(/org\.reactjs\.native\.example/i);
    expect(project).not.toMatch(
      /PRODUCT_BUNDLE_IDENTIFIER\s*=\s*["']?(?:com\.)?qing/i,
    );
  });

  it('boots the same StartFive React component through the single RN 0.86 app delegate', () => {
    const identity = readJson<AppIdentity>('app.json');
    const appDelegatePath = singleFileNamed(
      iosFiles().some(path => baseName(path) === 'AppDelegate.swift')
        ? 'AppDelegate.swift'
        : iosFiles().some(path => baseName(path) === 'AppDelegate.mm')
          ? 'AppDelegate.mm'
          : 'AppDelegate.m',
    );
    const appDelegate = normalizeSource(readAbsoluteText(appDelegatePath));

    expect(appDelegate).toMatch(/(?:import|#import).*(?:React|RCTAppDelegate)/);
    expect(appDelegate).toMatch(/RCTReactNativeFactory|RCTAppDelegate/);
    expect(appDelegate).toMatch(
      new RegExp(
        `(?:withModuleName\\s*:\\s*|moduleName\\s*=\\s*|return\\s+@?)["']${identity.name}["']`,
      ),
    );
    expect(appDelegate).toMatch(
      /RCTBundleURLProvider|bundleURL|sourceURLForBridge/,
    );
  });

  it('uses the product name, launch screen, non-empty valid orientations, and safe transport defaults', () => {
    const identity = readJson<AppIdentity>('app.json');
    const infoPlist = readText('ios/StartFive/Info.plist');
    const allowedOrientations = new Set([
      'UIInterfaceOrientationLandscapeLeft',
      'UIInterfaceOrientationLandscapeRight',
      'UIInterfaceOrientationPortrait',
      'UIInterfaceOrientationPortraitUpsideDown',
    ]);
    const phoneOrientations = xmlArrayStringValues(
      infoPlist,
      'UISupportedInterfaceOrientations',
    );
    const tabletOrientations = xmlArrayStringValues(
      infoPlist,
      'UISupportedInterfaceOrientations~ipad',
    );

    expect(xmlStringValue(infoPlist, 'CFBundleDisplayName')).toBe(
      identity.displayName,
    );
    expect(xmlStringValue(infoPlist, 'CFBundleName')).toBe('$(PRODUCT_NAME)');
    expect(xmlStringValue(infoPlist, 'UILaunchStoryboardName')).toBe(
      'LaunchScreen',
    );
    expect(phoneOrientations).not.toBeNull();
    expect(phoneOrientations?.length ?? 0).toBeGreaterThan(0);
    expect(
      phoneOrientations?.every(orientation =>
        allowedOrientations.has(orientation),
      ),
    ).toBe(true);
    if (tabletOrientations !== null) {
      expect(tabletOrientations.length).toBeGreaterThan(0);
      expect(
        tabletOrientations.every(orientation =>
          allowedOrientations.has(orientation),
        ),
      ).toBe(true);
    }
    expect(infoPlist).not.toMatch(
      /<key>NSAllowsArbitraryLoads<\/key>\s*<true\s*\/>/,
    );
  });

  it('uses exactly one StartFive CocoaPods target with RN autolinking', () => {
    const podfile = normalizeSource(readText('ios/Podfile'));
    const podTargets = Array.from(
      podfile.matchAll(/\btarget\s+["']([^"']+)["']\s+do\b/g),
      match => match[1],
    );

    expect(podfile).toMatch(/prepare_react_native_project!/);
    expect(podfile).toMatch(/use_native_modules!/);
    expect(podfile).toMatch(/use_react_native!/);
    expect(podTargets).toEqual(['StartFive']);
  });

  it('keeps every explicit Podfile and Xcode deployment target at iOS 15.1 or newer', () => {
    const podfile = readText('ios/Podfile');
    const project = readText('ios/StartFive.xcodeproj/project.pbxproj');
    const projectTargets = Array.from(
      project.matchAll(
        /IPHONEOS_DEPLOYMENT_TARGET\s*=\s*["']?(\d+(?:\.\d+)?)["']?\s*;/g,
      ),
      match => Number(match[1]),
    );
    const explicitPodTargets = Array.from(
      podfile.matchAll(
        /(?:platform\s*:ios\s*,|IPHONEOS_DEPLOYMENT_TARGET|deployment[_A-Za-z]*target)[^\d\r\n]{0,64}(\d+(?:\.\d+)?)/gi,
      ),
      match => Number(match[1]),
    );

    expect(podfile).toMatch(
      /platform\s*:ios\s*,\s*(?:min_ios_version_supported|["']\d+(?:\.\d+)?["'])/,
    );
    expect(projectTargets.length).toBeGreaterThanOrEqual(2);
    expect(projectTargets.every(target => target >= 15.1)).toBe(true);
    expect(explicitPodTargets.every(target => target >= 15.1)).toBe(true);
  });
});
