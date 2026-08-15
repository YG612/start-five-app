type FsApi = {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: 'utf8'): string;
  readdirSync(path: string): string[];
  statSync(path: string): {isDirectory(): boolean};
};

const {existsSync, readFileSync, readdirSync, statSync} =
  jest.requireActual<FsApi>('fs');

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap(name => {
    const path = `${root}/${name}`;
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('P7 product resources and copy', () => {
  it('has no engineering terms in user-facing source folders', () => {
    const roots = ['screens', 'components', 'presentation'].map(name => `src/${name}`);
    const text = roots.flatMap(sourceFiles).map(file => readFileSync(file, 'utf8')).join('\n');
    for (const forbidden of ['工作台', '回执', '幂等', '运行时', 'Repository', '数据迁移']) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('uses branded legacy and adaptive Android launcher resources', () => {
    const main = 'android/app/src/main';
    const manifest = readFileSync(`${main}/AndroidManifest.xml`, 'utf8');
    expect(manifest).toContain('android:icon="@mipmap/start_five_launcher"');
    expect(manifest).toContain('android:roundIcon="@mipmap/start_five_launcher_round"');
    expect(manifest).not.toContain('@mipmap/ic_launcher');
    for (const relative of [
      ['res', 'drawable', 'start_five_brand_foreground.xml'],
      ['res', 'mipmap-anydpi', 'start_five_launcher.xml'],
      ['res', 'mipmap-anydpi', 'start_five_launcher_round.xml'],
      ['res', 'mipmap-anydpi-v26', 'start_five_launcher.xml'],
      ['res', 'mipmap-anydpi-v26', 'start_five_launcher_round.xml'],
    ]) {
      expect(existsSync(`${main}/${relative.join('/')}`)).toBe(true);
    }
    expect(readFileSync(`${main}/res/drawable/start_five_brand_foreground.xml`, 'utf8'))
      .toContain('#F7B955');
  });

  it('ships no network analytics SDK', () => {
    const manifest = readFileSync('package.json', 'utf8').toLowerCase();
    expect(manifest).not.toMatch(/segment|mixpanel|amplitude|firebase-analytics|appcenter-analytics/);
  });
});
