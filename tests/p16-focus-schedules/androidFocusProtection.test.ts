import fs from 'node:fs';
import path from 'node:path';

declare const __dirname: string;

describe('P16 Android focus notifications', () => {
  it('provides restart-safe schedule actions and an escapable ongoing focus notification', () => {
    const root = path.resolve(__dirname, '..', '..');
    const alarm = fs.readFileSync(path.join(
      root,
      'android/app/src/main/java/com/startfive/app/notifications/NotificationAlarmReceiver.kt',
    ), 'utf8');
    const module = fs.readFileSync(path.join(
      root,
      'android/app/src/main/java/com/startfive/app/notifications/StartFiveNotificationsModule.kt',
    ), 'utf8');
    const scheduler = fs.readFileSync(path.join(
      root,
      'android/app/src/main/java/com/startfive/app/notifications/NotificationAlarmScheduler.kt',
    ), 'utf8');
    const boot = fs.readFileSync(path.join(
      root,
      'android/app/src/main/java/com/startfive/app/notifications/NotificationBootReceiver.kt',
    ), 'utf8');
    const manifest = fs.readFileSync(path.join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');

    expect(alarm).toContain('focus-schedule:');
    expect(alarm).toContain('TAP_KIND_FOCUS_SCHEDULE_START_FIVE');
    expect(alarm).toContain('TAP_KIND_FOCUS_SCHEDULE_DELAY_TEN');
    expect(alarm).toContain('TAP_KIND_FOCUS_SCHEDULE_OPEN');
    expect(alarm).toContain('FOCUS_QUIET_UNTIL_KEY');
    expect(alarm).toContain('EXTRA_NOTIFICATION_BODY');
    expect(module).toContain('fun startFocusOngoing');
    expect(module).toContain('.setOngoing(true)');
    expect(module).toContain('TAP_KIND_FOCUS_ONGOING_CONTINUE');
    expect(module).toContain('TAP_KIND_FOCUS_ONGOING_END');
    expect(module).toContain('FOCUS_QUIET_STATE_WRITE_FAILED');
    expect(scheduler).toContain('EXTRA_NOTIFICATION_TITLE');
    expect(scheduler).toContain('EXTRA_NOTIFICATION_BODY');
    expect(boot).toContain('NotificationAlarmScheduler.schedule');
    expect(manifest).toContain('android.permission.RECEIVE_BOOT_COMPLETED');
    expect(manifest).not.toMatch(/BIND_ACCESSIBILITY_SERVICE|BIND_VPN_SERVICE|DEVICE_ADMIN/);
  });
});
