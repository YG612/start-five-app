import {
  packageMajor,
  pnpmPackageHasIntegrity,
  projectPath,
  projectRoot,
  readJson,
  readPnpmImporterEntry,
  readText,
  requireFile,
} from './fixtures/nativeProject';

type PackageJson = {
  name?: unknown;
  private?: unknown;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: Record<string, string>;
};

type TsConfig = {
  extends?: unknown;
  compilerOptions?: Record<string, unknown>;
  include?: unknown;
};

type BabelConfig = {
  presets?: unknown;
};

type MetroOverride = {
  watchFolders?: unknown;
};

const preservedScripts = {
  test: 'node scripts/quality-gate-v2/cli.cjs test',
  'quality:gate': 'node scripts/quality-gate-v2/cli.cjs full',
  'test:locked': 'jest --runInBand tests/locked',
  'test:locked:ci': 'jest --runInBand --ci --coverage=false tests/locked',
  typecheck: 'tsc --noEmit',
} as const;

const preservedDependencies = {
  '@babel/runtime': '7.29.7',
  react: '19.2.3',
  'react-native': '0.86.0',
} as const;

const preservedDevDependencies = {
  '@babel/core': '^7.28.0',
  '@react-native/babel-preset': '0.86.0',
  '@react-native/jest-preset': '0.86.0',
  '@react-native/typescript-config': '0.86.0',
  '@testing-library/react-native': '^14.0.0',
  '@types/jest': '^29.5.14',
  '@types/react': '^19.2.0',
  'babel-jest': '^29.7.0',
  jest: '^29.7.0',
  'react-test-renderer': '19.2.3',
  typescript: '^5.9.0',
} as const;

const durableBackendPackage = '@react-native-async-storage/async-storage';

function expectPublishedVersionRange(version: string): void {
  expect(version).toMatch(/^(?:\^|~)?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
}

function expectLockedDirectDependency(
  lockSource: string,
  group: 'dependencies' | 'devDependencies',
  packageName: string,
  specifier: string,
): void {
  const entry = readPnpmImporterEntry(lockSource, group, packageName);
  expect(entry).not.toBeNull();
  expect(entry?.specifier).toBe(specifier);
  if (entry === null) {
    throw new Error(`pnpm root importer is missing ${packageName}.`);
  }
  expect(
    pnpmPackageHasIntegrity(lockSource, packageName, entry.version),
  ).toBe(true);
}

describe('NS-002 React Native 0.86 JavaScript toolchain contract', () => {
  it('preserves every tested package entry while adding exact native commands and reviewed dependencies', () => {
    const packageJson = readJson<PackageJson>('package.json');
    const scripts = packageJson.scripts ?? {};
    const dependencies = packageJson.dependencies ?? {};
    const devDependencies = packageJson.devDependencies ?? {};

    expect(packageJson.name).toBe('start-five');
    expect(packageJson.private).toBe(true);
    expect(packageJson.engines?.node).toBe('>=20');
    expect(scripts).toEqual(
      expect.objectContaining({
        ...preservedScripts,
        start: 'react-native start',
        android: 'react-native run-android',
        ios: 'react-native run-ios',
      }),
    );
    expect(scripts.test).not.toBe('jest');
    expect(scripts).not.toHaveProperty('test:unit');
    expect(dependencies).toEqual(
      expect.objectContaining(preservedDependencies),
    );
    expect(devDependencies).toEqual(
      expect.objectContaining({
        ...preservedDevDependencies,
        '@react-native/metro-config': '0.86.0',
      }),
    );

    const durableVersion = dependencies[durableBackendPackage];
    expect(typeof durableVersion).toBe('string');
    if (durableVersion === undefined) {
      throw new Error(`Missing reviewed durable backend ${durableBackendPackage}.`);
    }
    expectPublishedVersionRange(durableVersion);

    for (const packageName of [
      '@react-native-community/cli',
      '@react-native-community/cli-platform-android',
      '@react-native-community/cli-platform-ios',
    ]) {
      const version = devDependencies[packageName];
      expect(typeof version).toBe('string');
      if (version === undefined) {
        throw new Error(`Missing official RN CLI dependency ${packageName}.`);
      }
      expectPublishedVersionRange(version);
      expect(packageMajor(version)).toBe(20);
    }
  });

  it('keeps package.json and pnpm-lock.yaml consistent for every native addition and the durable backend', () => {
    const packageJson = readJson<PackageJson>('package.json');
    const dependencies = packageJson.dependencies ?? {};
    const devDependencies = packageJson.devDependencies ?? {};
    const lockSource = readText('pnpm-lock.yaml');
    const durableVersion = dependencies[durableBackendPackage];
    expect(typeof durableVersion).toBe('string');
    if (durableVersion === undefined) {
      throw new Error(`Missing reviewed durable backend ${durableBackendPackage}.`);
    }
    expectLockedDirectDependency(
      lockSource,
      'dependencies',
      durableBackendPackage,
      durableVersion,
    );

    for (const packageName of [
      '@react-native/metro-config',
      '@react-native-community/cli',
      '@react-native-community/cli-platform-android',
      '@react-native-community/cli-platform-ios',
    ]) {
      const specifier = devDependencies[packageName];
      expect(typeof specifier).toBe('string');
      if (specifier === undefined) {
        throw new Error(`Missing native development dependency ${packageName}.`);
      }
      expectLockedDirectDependency(
        lockSource,
        'devDependencies',
        packageName,
        specifier,
      );
    }
  });

  it('executes the Babel configuration and keeps the RN 0.86 preset', () => {
    const babelConfig = jest.requireActual<BabelConfig>(
      projectPath('babel.config.js'),
    );
    expect(babelConfig).toEqual(
      expect.objectContaining({
        presets: expect.arrayContaining(['module:@react-native/babel-preset']),
      }),
    );
  });

  it('executes Metro configuration through official defaults without an external watch root', () => {
    requireFile('metro.config.js');
    const defaults = {resolver: {sourceExts: ['js', 'tsx']}};
    const merged = {marker: 'merged-config'};
    const getDefaultConfig = jest.fn(() => defaults);
    const observedOverrides: MetroOverride[] = [];
    const mergeConfig = jest.fn(
      (receivedDefaults: unknown, override: MetroOverride) => {
        expect(receivedDefaults).toBe(defaults);
        observedOverrides.push(override);
        return merged;
      },
    );
    let exportedConfig: unknown;

    jest.isolateModules(() => {
      jest.doMock(
        '@react-native/metro-config',
        () => ({getDefaultConfig, mergeConfig}),
        {virtual: true},
      );
      exportedConfig = jest.requireActual(projectPath('metro.config.js'));
    });

    expect(getDefaultConfig).toHaveBeenCalledTimes(1);
    expect(getDefaultConfig).toHaveBeenCalledWith(projectRoot);
    expect(mergeConfig).toHaveBeenCalledTimes(1);
    expect(observedOverrides).toHaveLength(1);
    const watchFolders = observedOverrides[0]?.watchFolders;
    expect(watchFolders === undefined ||
      (Array.isArray(watchFolders) && watchFolders.length === 0)).toBe(true);
    expect(exportedConfig).toBe(merged);
  });

  it('type-checks App.tsx, src, and every locked test under strict settings', () => {
    const tsConfig = readJson<TsConfig>('tsconfig.json');
    const compilerOptions = tsConfig.compilerOptions ?? {};
    const include = Array.isArray(tsConfig.include)
      ? tsConfig.include.filter(
          (entry): entry is string => typeof entry === 'string',
        )
      : [];

    expect(tsConfig.extends).toBe('@react-native/typescript-config');
    expect(compilerOptions).toEqual(
      expect.objectContaining({
        strict: true,
        noEmit: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
      }),
    );
    expect(
      include.some(entry => {
        const normalizedEntry = entry.replace(/^\.\//, '');
        return ['App.tsx', '*.tsx', '**/*.tsx', '**/*'].includes(
          normalizedEntry,
        );
      }),
    ).toBe(true);
    expect(include.some(entry => /(?:^|\/)src(?:\/|\*|$)/.test(entry))).toBe(
      true,
    );
    expect(
      include.some(entry => /(?:^|\/)tests(?:\/|\*|$)/.test(entry)),
    ).toBe(true);
  });
});
