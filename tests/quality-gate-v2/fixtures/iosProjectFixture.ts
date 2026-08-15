import {
  createTempDirectory,
  writeText,
  type IosStaticCheckId,
} from '../qualityGateV2TestKit';

const TARGET_ID = '111111111111111111111111';

const VALID_IOS_PROJECT_FILES: Readonly<Record<string, string>> = {
  'app.json': JSON.stringify({name: 'StartFive', displayName: 'Start Five'}),
  'ios/StartFive.xcodeproj/project.pbxproj': [
    '// !$*UTF8*$!',
    'objects = {',
    TARGET_ID + ' /* StartFive */ = {',
    '  isa = PBXNativeTarget;',
    '  name = StartFive;',
    '  productName = StartFive;',
    '  productType = "com.apple.product-type.application";',
    '};',
    '};',
    'targets = (',
    '  ' + TARGET_ID + ' /* StartFive */,',
    ');',
    'INFOPLIST_FILE = StartFive/Info.plist;',
    'PRODUCT_BUNDLE_IDENTIFIER = "com.startfive.app";',
  ].join('\n'),
  'ios/StartFive.xcodeproj/xcshareddata/xcschemes/StartFive.xcscheme': [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Scheme version="1.3">',
    '  <BuildAction><BuildActionEntries><BuildActionEntry>',
    '    <BuildableReference',
    '      BlueprintIdentifier="' + TARGET_ID + '"',
    '      BuildableName="StartFive.app"',
    '      BlueprintName="StartFive"',
    '      ReferencedContainer="container:StartFive.xcodeproj">',
    '    </BuildableReference>',
    '  </BuildActionEntry></BuildActionEntries></BuildAction>',
    '  <TestAction><Testables></Testables></TestAction>',
    '</Scheme>',
  ].join('\n'),
  'ios/StartFive/Info.plist': [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<plist version="1.0"><dict>',
    '<key>CFBundleDisplayName</key><string>Start Five</string>',
    '<key>CFBundleIdentifier</key>',
    '<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>',
    '<key>UILaunchStoryboardName</key><string>LaunchScreen</string>',
    '<key>NSAppTransportSecurity</key><dict>',
    '<key>NSAllowsArbitraryLoads</key><false/>',
    '</dict>',
    '</dict></plist>',
  ].join('\n'),
  'ios/StartFive/PrivacyInfo.xcprivacy': [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<plist version="1.0"><dict>',
    '<key>NSPrivacyTracking</key><false/>',
    '<key>NSPrivacyCollectedDataTypes</key><array/>',
    '<key>NSPrivacyAccessedAPITypes</key><array/>',
    '</dict></plist>',
  ].join('\n'),
  'ios/Podfile': [
    'platform :ios, min_ios_version_supported',
    "target 'StartFive' do",
    '  config = use_native_modules!',
    '  use_react_native!(',
    '    :path => config[:reactNativePath],',
    '    :app_path => "#{Pod::Config.instance.installation_root}/.."',
    '  )',
    'end',
  ].join('\n'),
  'ios/StartFive/AppDelegate.swift': [
    'import React',
    'import React_RCTAppDelegate',
    '@main class AppDelegate: UIResponder, UIApplicationDelegate {',
    '  func start() {',
    '    factory.startReactNative(',
    '      withModuleName: "StartFive",',
    '      in: window,',
    '      launchOptions: nil',
    '    )',
    '  }',
    '}',
  ].join('\n'),
};

export const IOS_PROJECT_MUTATIONS: readonly Readonly<{
  id:
    | 'missing-xcode-project'
    | 'missing-shared-scheme'
    | 'stale-scheme-target'
    | 'non-application-target'
    | 'arbitrary-network-loads'
    | 'missing-privacy-manifest'
    | 'missing-react-native-pod'
    | 'wrong-react-native-module';
  expectedFailedCheckIds: readonly IosStaticCheckId[];
}>[] = [
  {
    id: 'missing-xcode-project',
    expectedFailedCheckIds: [
      'xcode-project',
      'application-target',
      'scheme-target-graph',
    ],
  },
  {
    id: 'missing-shared-scheme',
    expectedFailedCheckIds: ['shared-scheme', 'scheme-target-graph'],
  },
  {
    id: 'stale-scheme-target',
    expectedFailedCheckIds: ['scheme-target-graph'],
  },
  {
    id: 'non-application-target',
    expectedFailedCheckIds: ['application-target'],
  },
  {
    id: 'arbitrary-network-loads',
    expectedFailedCheckIds: ['info-plist'],
  },
  {
    id: 'missing-privacy-manifest',
    expectedFailedCheckIds: ['privacy-manifest'],
  },
  {
    id: 'missing-react-native-pod',
    expectedFailedCheckIds: ['react-native-pod'],
  },
  {
    id: 'wrong-react-native-module',
    expectedFailedCheckIds: ['react-native-entry'],
  },
];

export type IosProjectMutationId =
  (typeof IOS_PROJECT_MUTATIONS)[number]['id'];

function requiredFile(
  files: Readonly<Record<string, string>>,
  relativePath: string,
): string {
  const value = files[relativePath];
  if (value === undefined) {
    throw new Error('QUALITY_GATE_V2_IOS_FIXTURE_FILE_REQUIRED:' + relativePath);
  }
  return value;
}

function replaceRequired(
  files: Record<string, string>,
  relativePath: string,
  expected: string,
  replacement: string,
): void {
  const original = requiredFile(files, relativePath);
  const mutated = original.replace(expected, replacement);
  if (mutated === original) {
    throw new Error('QUALITY_GATE_V2_IOS_MUTATION_NOT_APPLIED:' + relativePath);
  }
  files[relativePath] = mutated;
}

function mutateFiles(
  mutation: IosProjectMutationId,
): Readonly<Record<string, string>> {
  const files: Record<string, string> = {...VALID_IOS_PROJECT_FILES};
  switch (mutation) {
    case 'missing-xcode-project':
      delete files['ios/StartFive.xcodeproj/project.pbxproj'];
      break;
    case 'missing-shared-scheme':
      delete files[
        'ios/StartFive.xcodeproj/xcshareddata/xcschemes/StartFive.xcscheme'
      ];
      break;
    case 'stale-scheme-target':
      replaceRequired(
        files,
        'ios/StartFive.xcodeproj/xcshareddata/xcschemes/StartFive.xcscheme',
        TARGET_ID,
        '222222222222222222222222',
      );
      break;
    case 'non-application-target':
      replaceRequired(
        files,
        'ios/StartFive.xcodeproj/project.pbxproj',
        'com.apple.product-type.application',
        'com.apple.product-type.framework',
      );
      break;
    case 'arbitrary-network-loads':
      replaceRequired(
        files,
        'ios/StartFive/Info.plist',
        '<key>NSAllowsArbitraryLoads</key><false/>',
        '<key>NSAllowsArbitraryLoads</key><true/>',
      );
      break;
    case 'missing-privacy-manifest':
      delete files['ios/StartFive/PrivacyInfo.xcprivacy'];
      break;
    case 'missing-react-native-pod':
      replaceRequired(
        files,
        'ios/Podfile',
        'use_react_native!(',
        'use_native_placeholder!(',
      );
      break;
    case 'wrong-react-native-module':
      replaceRequired(
        files,
        'ios/StartFive/AppDelegate.swift',
        'withModuleName: "StartFive"',
        'withModuleName: "WrongModule"',
      );
      break;
  }
  return files;
}

export function createIosProjectFixture(
  mutation?: IosProjectMutationId,
): string {
  const root = createTempDirectory();
  const files =
    mutation === undefined ? VALID_IOS_PROJECT_FILES : mutateFiles(mutation);
  for (const [relativePath, content] of Object.entries(files)) {
    writeText(root, relativePath, content);
  }
  return root;
}
