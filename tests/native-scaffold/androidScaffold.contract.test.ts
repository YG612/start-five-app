import {
  baseName,
  containsDebugSigningReference,
  extractBlocks,
  extension,
  fileSize,
  firstExisting,
  listRegularFiles,
  normalizeSource,
  numericAssignment,
  projectRelative,
  propertyValue,
  readAbsoluteText,
  readJson,
  readText,
  requireDirectory,
  requireFile,
} from './fixtures/nativeProject';

type AppIdentity = {
  name: string;
  displayName: string;
};

type ParsedUrl = {
  protocol: string;
  hostname: string;
  pathname: string;
  search: string;
  hash: string;
};

type UrlApi = {
  URL: new (source: string) => ParsedUrl;
};

const {URL: NodeUrl} = jest.requireActual<UrlApi>('url');

function executableSource(source: string): string {
  let result = '';
  let state:
    | 'code'
    | 'line-comment'
    | 'block-comment'
    | 'single-quote'
    | 'double-quote'
    | 'triple-double-quote'
    | 'template' = 'code';
  let escaped = false;

  const masked = (character: string): string =>
    character === '\n' || character === '\r' ? character : ' ';

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? '';
    const next = source[index + 1] ?? '';
    const following = source[index + 2] ?? '';

    if (state === 'line-comment') {
      if (character === '\n') {
        state = 'code';
      }
      result += masked(character);
      continue;
    }
    if (state === 'block-comment') {
      if (character === '*' && next === '/') {
        result += '  ';
        index += 1;
        state = 'code';
      } else {
        result += masked(character);
      }
      continue;
    }
    if (state === 'triple-double-quote') {
      if (character === '"' && next === '"' && following === '"') {
        result += '   ';
        index += 2;
        state = 'code';
      } else {
        result += masked(character);
      }
      continue;
    }
    if (
      state === 'single-quote' ||
      state === 'double-quote' ||
      state === 'template'
    ) {
      const delimiter =
        state === 'single-quote' ? "'" : state === 'double-quote' ? '"' : '`';
      result += masked(character);
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === delimiter) {
        state = 'code';
      }
      continue;
    }

    if (character === '/' && next === '/') {
      result += '  ';
      index += 1;
      state = 'line-comment';
    } else if (character === '/' && next === '*') {
      result += '  ';
      index += 1;
      state = 'block-comment';
    } else if (character === '"' && next === '"' && following === '"') {
      result += '   ';
      index += 2;
      state = 'triple-double-quote';
    } else if (character === "'") {
      result += ' ';
      state = 'single-quote';
    } else if (character === '"') {
      result += ' ';
      state = 'double-quote';
    } else if (character === '`') {
      result += ' ';
      state = 'template';
    } else {
      result += character;
    }
  }

  return normalizeSource(result);
}

function androidBuildFiles(): {root: string; app: string} {
  return {
    root: firstExisting(['android/build.gradle', 'android/build.gradle.kts']),
    app: firstExisting([
      'android/app/build.gradle',
      'android/app/build.gradle.kts',
    ]),
  };
}

function androidFiles(): string[] {
  return listRegularFiles(
    'android',
    new Set([
      '.cxx',
      '.externalNativeBuild',
      '.gradle',
      '.idea',
      '.kotlin',
      'build',
      'captures',
    ]),
  );
}

function hasLiteralCredential(source: string): boolean {
  const credentialAssignment =
    /["']?(?:api[_-]?key|client[_-]?(?:id|secret)|access[_-]?token|refresh[_-]?token|private[_-]?key|storeFile|storePassword|keyPassword|keyAlias)["']?(?:(?:\s*(?:=|:)\s*)|\s+)(?:["']([^"'\r\n]+)["']|([^\s#,}\]]+))/gi;
  for (const match of source.matchAll(credentialAssignment)) {
    const value = (match[1] ?? match[2] ?? '').trim();
    if (
      value !== '' &&
      !/^(?:\$\{[^}]+\}|<[^>]+>|YOUR[_-]|REPLACE[_-]?ME|CHANGEME|placeholder)/i.test(
        value,
      )
    ) {
      return true;
    }
  }
  return (
    /AIza[0-9A-Za-z_-]{35}/.test(source) ||
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source)
  );
}

describe('NS-003 Android RN 0.86 scaffold contract', () => {
  it('contains a complete Gradle wrapper and one canonical app source topology', () => {
    requireDirectory('android');
    const requiredFiles = [
      'android/gradlew',
      'android/gradlew.bat',
      'android/gradle/wrapper/gradle-wrapper.jar',
      'android/gradle/wrapper/gradle-wrapper.properties',
      'android/gradle.properties',
      'android/app/src/main/AndroidManifest.xml',
      'android/app/src/main/res/values/strings.xml',
      'android/app/src/main/res/values/styles.xml',
      'android/app/proguard-rules.pro',
    ];
    for (const relativePath of requiredFiles) {
      requireFile(relativePath);
    }
    firstExisting(['android/settings.gradle', 'android/settings.gradle.kts']);
    androidBuildFiles();
    const files = androidFiles().map(projectRelative);
    const activities = files.filter(path => /\/MainActivity\.(?:kt|java)$/.test(path));
    const applications = files.filter(path =>
      /\/MainApplication\.(?:kt|java)$/.test(path),
    );

    expect(activities).toEqual([
      expect.stringMatching(
        /^android\/app\/src\/main\/java\/com\/startfive\/app\/MainActivity\.(?:kt|java)$/,
      ),
    ]);
    expect(applications).toEqual([
      expect.stringMatching(
        /^android\/app\/src\/main\/java\/com\/startfive\/app\/MainApplication\.(?:kt|java)$/,
      ),
    ]);
    expect(fileSize('android/gradle/wrapper/gradle-wrapper.jar')).toBeGreaterThan(
      10_000,
    );
    expect(fileSize('android/gradlew')).toBeGreaterThan(1_000);
    expect(fileSize('android/gradlew.bat')).toBeGreaterThan(1_000);
  });

  it('uses com.startfive.app and one registered StartFive component everywhere', () => {
    const identity = readJson<AppIdentity>('app.json');
    const buildFiles = androidBuildFiles();
    const appBuild = normalizeSource(readText(buildFiles.app));
    const manifest = normalizeSource(
      readText('android/app/src/main/AndroidManifest.xml'),
    );
    const strings = readText('android/app/src/main/res/values/strings.xml');
    const mainActivity = normalizeSource(
      readText(
        firstExisting([
          'android/app/src/main/java/com/startfive/app/MainActivity.kt',
          'android/app/src/main/java/com/startfive/app/MainActivity.java',
        ]),
      ),
    );
    const mainApplication = normalizeSource(
      readText(
        firstExisting([
          'android/app/src/main/java/com/startfive/app/MainApplication.kt',
          'android/app/src/main/java/com/startfive/app/MainApplication.java',
        ]),
      ),
    );

    expect(appBuild).toMatch(/namespace\s*(?:=)?\s*["']com\.startfive\.app["']/);
    expect(appBuild).toMatch(
      /applicationId\s*(?:=)?\s*["']com\.startfive\.app["']/,
    );
    expect(mainActivity).toMatch(/package\s+com\.startfive\.app\b/);
    expect(mainApplication).toMatch(/package\s+com\.startfive\.app\b/);
    expect(mainActivity).toMatch(new RegExp(`["']${identity.name}["']`));
    expect(mainActivity).toMatch(/getMainComponentName|mainComponentName/);
    expect(mainApplication).toMatch(/class\s+MainApplication\b/);
    expect(manifest).toMatch(/android:name=["']\.MainApplication["']/);
    expect(manifest).toMatch(/android:name=["']\.MainActivity["']/);
    expect(manifest).toMatch(/android:exported=["']true["']/);
    expect(manifest).toMatch(/android\.intent\.action\.MAIN/);
    expect(manifest).toMatch(/android\.intent\.category\.LAUNCHER/);
    expect(manifest).toMatch(/android:label=["']@string\/app_name["']/);
    expect(strings).toMatch(
      new RegExp(
        `<string\\s+name=["']app_name["'][^>]*>${identity.displayName}</string>`,
      ),
    );
  });

  it('pins SDK/NDK/Kotlin and parses the official Gradle 9.3.1 distribution URL', () => {
    const buildFiles = androidBuildFiles();
    const combinedBuild = `${readText(buildFiles.root)}\n${readText(
      buildFiles.app,
    )}`;
    const wrapper = readText(
      'android/gradle/wrapper/gradle-wrapper.properties',
    );
    const rawDistribution = propertyValue(wrapper, 'distributionUrl');
    expect(typeof rawDistribution).toBe('string');
    if (rawDistribution === null) {
      throw new Error('Gradle wrapper distributionUrl is missing.');
    }
    const distributionUrl = new NodeUrl(rawDistribution.replace(/\\:/g, ':'));

    expect(numericAssignment(combinedBuild, ['minSdkVersion', 'minSdk'])).toBe(
      24,
    );
    expect(
      numericAssignment(combinedBuild, ['targetSdkVersion', 'targetSdk']),
    ).toBe(36);
    expect(
      numericAssignment(combinedBuild, ['compileSdkVersion', 'compileSdk']),
    ).toBe(36);
    expect(combinedBuild).toMatch(
      /buildToolsVersion\s*(?:=)?\s*["']36\.0\.0["']/,
    );
    expect(combinedBuild).toMatch(
      /ndkVersion\s*(?:=)?\s*["']27\.1\.12297006["']/,
    );
    expect(combinedBuild).toMatch(/kotlinVersion\s*(?:=)?\s*["']2\.1\.20["']/);
    expect(combinedBuild).toMatch(/com\.android\.tools\.build:gradle/);
    expect(distributionUrl.protocol).toBe('https:');
    expect(distributionUrl.hostname).toBe('services.gradle.org');
    expect(distributionUrl.pathname).toMatch(
      /^\/distributions\/gradle-9\.3\.1-(?:bin|all)\.zip$/,
    );
    expect(distributionUrl.search).toBe('');
    expect(distributionUrl.hash).toBe('');
    expect(propertyValue(wrapper, 'validateDistributionUrl')).toBe('true');
  });

  it('enables Hermes consistently through the RN Gradle plugin', () => {
    const buildFiles = androidBuildFiles();
    const appBuild = normalizeSource(readText(buildFiles.app));
    const properties = readText('android/gradle.properties');

    expect(propertyValue(properties, 'hermesEnabled')).toBe('true');
    expect(propertyValue(properties, 'newArchEnabled')).toBe('true');
    expect(appBuild).toMatch(/com\.facebook\.react/);
    expect(appBuild).toMatch(/react-android/);
    expect(appBuild).toMatch(/hermesEnabled\s*\.\s*toBoolean\s*\(\s*\)/);
    expect(appBuild).toMatch(/hermes-android/);
    expect(appBuild).not.toMatch(/enableHermes\s*(?:=|:)/);
  });

  it('wires RN settings, autolinking, and the native application bootstrap', () => {
    const settingsPath = firstExisting([
      'android/settings.gradle',
      'android/settings.gradle.kts',
    ]);
    const settings = normalizeSource(readText(settingsPath));
    const buildFiles = androidBuildFiles();
    const rootBuild = normalizeSource(readText(buildFiles.root));
    const appBuild = normalizeSource(readText(buildFiles.app));
    const mainApplicationSource = readText(
      firstExisting([
        'android/app/src/main/java/com/startfive/app/MainApplication.kt',
        'android/app/src/main/java/com/startfive/app/MainApplication.java',
      ]),
    );
    const mainApplicationCode = executableSource(mainApplicationSource);
    const applicationBlocks = extractBlocks(
      mainApplicationSource,
      /class\s+MainApplication\s*:\s*Application\s*\(\s*\)\s*,\s*ReactApplication\s*\{/g,
    );

    expect(settings).toMatch(/rootProject\.name\s*=\s*["']StartFive["']/);
    expect(settings).toMatch(/com\.facebook\.react\.settings/);
    expect(settings).toMatch(/autolinkLibrariesFromCommand/);
    expect(settings).toMatch(/include\s*(?:\(\s*)?["']:app["']\s*\)?/);
    expect(rootBuild).toMatch(/com\.facebook\.react\.rootproject/);
    expect(appBuild).toMatch(/com\.android\.application/);
    expect(appBuild).toMatch(/org\.jetbrains\.kotlin\.android/);
    expect(appBuild).toMatch(/autolinkLibrariesWithApp/);
    expect(mainApplicationCode).toMatch(
      /import\s+com\.facebook\.react\.ReactHost\b/,
    );
    expect(mainApplicationCode).toMatch(
      /import\s+com\.facebook\.react\.defaults\.DefaultReactHost\.getDefaultReactHost\b/,
    );
    expect(applicationBlocks).toHaveLength(1);
    const applicationBlock = applicationBlocks[0];
    if (applicationBlock === undefined) {
      throw new Error('MainApplication must implement the RN 0.86 ReactApplication structure.');
    }
    const reactHostBlocks = extractBlocks(
      applicationBlock,
      /override\s+val\s+reactHost\s*:\s*ReactHost\s+by\s+lazy\s*\{/g,
    );
    expect(reactHostBlocks).toHaveLength(1);
    const reactHostBlock = reactHostBlocks[0];
    if (reactHostBlock === undefined) {
      throw new Error('MainApplication must expose one lazy ReactHost.');
    }
    const reactHostCode = executableSource(reactHostBlock);
    expect(reactHostCode).toMatch(/\bgetDefaultReactHost\s*\(/);
    expect(reactHostCode).toMatch(/\bcontext\s*=\s*applicationContext\b/);
    expect(reactHostCode).toMatch(
      /\bpackageList\s*=\s*PackageList\s*\(\s*this\s*\)\s*\.\s*packages\b/,
    );
    const onCreateBlocks = extractBlocks(
      applicationBlock,
      /override\s+fun\s+onCreate\s*\(\s*\)\s*\{/g,
    );
    expect(onCreateBlocks).toHaveLength(1);
    expect(executableSource(onCreateBlocks[0] ?? '')).toMatch(
      /\bloadReactNative\s*\(\s*this\s*\)/,
    );
  });

  it('scans JSON, dotenv, YAML, Gradle, and source files for signing material and credentials', () => {
    const files = androidFiles();
    const relativeFiles = files.map(projectRelative);
    const forbiddenMaterial = relativeFiles.filter(relativePath =>
      /(?:^|\/)(?:google-services\.json|[^/]+\.(?:jks|keystore|p12|pem|key))$/i.test(
        relativePath,
      ),
    );
    const textExtensions = new Set([
      '',
      '.env',
      '.gradle',
      '.java',
      '.json',
      '.kt',
      '.kts',
      '.pro',
      '.properties',
      '.xml',
      '.yaml',
      '.yml',
    ]);
    const credentialFindings: string[] = [];

    for (const absolutePath of files) {
      const fileName = baseName(absolutePath);
      if (
        !textExtensions.has(extension(absolutePath)) &&
        !/^\.env(?:\.|$)/i.test(fileName)
      ) {
        continue;
      }
      if (hasLiteralCredential(readAbsoluteText(absolutePath))) {
        credentialFindings.push(projectRelative(absolutePath));
      }
    }

    const appBuild = readText(androidBuildFiles().app);
    const releaseBlocks = extractBlocks(
      appBuild,
      /(?:\brelease\s*|\b(?:getByName|named|create)\s*\(\s*["']release["']\s*\)\s*)\{/g,
    );
    expect(releaseBlocks.length).toBeGreaterThan(0);
    for (const releaseBlock of releaseBlocks) {
      expect(containsDebugSigningReference(releaseBlock)).toBe(false);
    }
    expect(forbiddenMaterial).toEqual([]);
    expect(credentialFindings).toEqual([]);
    expect(relativeFiles.some(path => baseName(path) === 'gradle-wrapper.jar')).toBe(
      true,
    );
  });
});
