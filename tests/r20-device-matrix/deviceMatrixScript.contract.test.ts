import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const scriptPath = path.join(root, 'scripts', 'run-android-device-matrix.ps1');

describe('R20-02 Android device matrix runner', () => {
  const source = fs.readFileSync(scriptPath, 'utf8');

  test('requires an explicit device and preserves installed user data', () => {
    expect(source).toContain('[Parameter(Mandatory = $true)]');
    expect(source).toContain('[string]$Serial');
    expect(source).toContain("'install', '-r', $ApkPath");
    expect(source).not.toMatch(/\b(uninstall|pm',\s*'clear|pm clear)\b/);
  });

  test('covers the required viewport, font, theme and motion matrix', () => {
    expect(source).toContain('$widthsDp = @(320, 360, 412)');
    expect(source).toContain('$fontScales = @(1.0, 1.3, 1.6, 2.0)');
    expect(source).toContain("$themes = @('light', 'dark')");
    expect(source).toContain("$motionModes = @('regular', 'reduced')");
  });

  test('captures auditable artifacts and labels the evidence boundary', () => {
    expect(source).toContain("'screen.png'");
    expect(source).toContain("'window.xml'");
    expect(source).toContain("'launch.txt'");
    expect(source).toContain("'logcat.txt'");
    expect(source).toContain("'matrix-results.csv'");
    expect(source).toContain("evidenceType = 'AUTO_CAPTURE_NOT_MANUAL_ACCEPTANCE'");
    expect(source).toContain('manualAcceptanceStillRequired = $true');
  });

  test('restores every device setting changed by the matrix', () => {
    expect(source).toMatch(/finally\s*\{/);
    expect(source).toContain("@('wm', 'density', 'reset')");
    expect(source).toContain("@('settings', 'put', 'system', 'font_scale', $originalFontScale) -AllowFailure");
    expect(source).toContain("@('cmd', 'uimode', 'night', $originalNightMode)");
    expect(source).toContain("@('settings', 'put', 'global', 'window_animation_scale', $originalWindowAnimation) -AllowFailure");
    expect(source).toContain("@('settings', 'put', 'global', 'transition_animation_scale', $originalTransitionAnimation) -AllowFailure");
    expect(source).toContain("@('settings', 'put', 'global', 'animator_duration_scale', $originalAnimatorDuration) -AllowFailure");
  });
});
