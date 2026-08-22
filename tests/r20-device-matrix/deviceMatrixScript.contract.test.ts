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
    expect(source).toContain('[int]$CaptureSettleMilliseconds = 1500');
    expect(source).toContain('Start-Sleep -Milliseconds $CaptureSettleMilliseconds');
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

  test('falls back to persisted UiModeManager values when Android 16 rejects a no-argument night-mode read', () => {
    expect(source).toContain("@('cmd', 'uimode', 'night') -AllowFailure");
    expect(source).toContain("Get-SettingValue -Namespace 'secure' -Name 'ui_night_mode'");
    expect(source).toContain("Get-SettingValue -Namespace 'secure' -Name 'ui_night_mode_custom_type'");
    expect(source).toContain("'3' {");
    expect(source).toContain("return 'custom_bedtime'");
    expect(source).toContain("return 'custom_schedule'");
    expect(source).not.toContain("else { 'auto' }");
  });

  test('uses bounded adb child processes instead of treating stderr progress as failure', () => {
    expect(source).toContain('[int]$TimeoutSeconds = 45');
    expect(source).toContain('$processInfo = [System.Diagnostics.ProcessStartInfo]::new()');
    expect(source).toContain('$processInfo.RedirectStandardOutput = $true');
    expect(source).toContain('$processInfo.RedirectStandardError = $true');
    expect(source).toContain('$process.StandardOutput.ReadToEndAsync()');
    expect(source).toContain('$process.StandardError.ReadToEndAsync()');
    expect(source).toContain('$process.WaitForExit($TimeoutSeconds * 1000)');
    expect(source).toContain('$process.Kill()');
    expect(source).toContain('$exitCode = $process.ExitCode');
    expect(source).toContain("-TimeoutSeconds 180");
  });
});
