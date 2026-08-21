import {readFileSync} from 'node:fs';

describe('P19 internal Android package isolation', () => {
  it('installs beside the production package without replacing user data', () => {
    const buildGradle = readFileSync('android/app/build.gradle', 'utf8');

    expect(buildGradle).toMatch(/internal\s*\{[\s\S]*applicationIdSuffix\s+"\.internal"/);
    expect(buildGradle).toMatch(/internal\s*\{[\s\S]*versionNameSuffix\s+"-internal"/);
    expect(buildGradle).toMatch(/defaultConfig\s*\{[\s\S]*applicationId\s+"com\.startfive\.app"/);
  });
});
