export {};

type FsApi = {readFileSync(path: string, encoding: 'utf8'): string};
const {readFileSync} = jest.requireActual<FsApi>('fs');

const main = 'android/app/src/main';
const kotlin = `${main}/java/com/startfive/app`;

describe('P10 Android notification and system-entry contract', () => {
  it('ships three exact notification actions carrying day and task identity', () => {
    const contract = readFileSync(`${kotlin}/notifications/NotificationContract.kt`, 'utf8');
    const receiver = readFileSync(`${kotlin}/notifications/NotificationAlarmReceiver.kt`, 'utf8');
    for (const kind of ['TAP_KIND_START_FIVE', 'TAP_KIND_DELAY_TEN', 'TAP_KIND_RESCHEDULE']) {
      expect(contract).toContain(kind);
      expect(receiver).toContain(`NotificationContract.${kind}`);
    }
    expect(receiver.match(/\.addAction\(/g)).toHaveLength(3);
    expect(receiver).toContain('putExtra(NotificationContract.EXTRA_DAY_KEY, dayKey)');
    expect(receiver).toContain('putExtra(NotificationContract.EXTRA_TASK_ID, taskId)');
  });

  it('forwards and consumes cold/hot taps exactly once with terminal-safe JS routing', () => {
    const activity = readFileSync(`${kotlin}/MainActivity.kt`, 'utf8');
    const module = readFileSync(`${kotlin}/notifications/StartFiveNotificationsModule.kt`, 'utf8');
    const screen = readFileSync('src/screens/QuadrantHomeScreen.tsx', 'utf8');
    expect(activity).toContain('receiveInitialTap(intent)');
    expect(activity).toContain('receiveTap(intent)');
    expect(module).toContain('initialTap.also { initialTap = null }');
    expect(module).toContain('source.action = null');
    expect(module).toContain('source.removeExtra(NotificationContract.EXTRA_TASK_ID)');
    expect(screen).toContain("candidate.status === 'pending' || candidate.status === 'in_progress'");
  });

  it('declares add, continue and start shortcuts plus bounded text sharing without a widget', () => {
    const shortcuts = readFileSync(`${main}/res/xml/shortcuts.xml`, 'utf8');
    const manifest = readFileSync(`${main}/AndroidManifest.xml`, 'utf8');
    const module = readFileSync(`${kotlin}/notifications/StartFiveNotificationsModule.kt`, 'utf8');
    for (const shortcut of ['add_task', 'continue_task', 'start_five']) {
      expect(shortcuts).toContain(`android:shortcutId="${shortcut}"`);
    }
    expect(manifest).toContain('android.app.shortcuts');
    expect(manifest).toContain('android.intent.action.SEND');
    expect(manifest).toContain('android:mimeType="text/plain"');
    expect(module).toContain('MAX_SHARED_TEXT_LENGTH');
    expect(module).toContain('.take(NotificationContract.MAX_SHARED_TEXT_LENGTH)');
    expect(module).toContain('source.removeExtra(Intent.EXTRA_TEXT)');
    expect(manifest).not.toMatch(/AppWidgetProvider|appwidget-provider/i);
  });
});
