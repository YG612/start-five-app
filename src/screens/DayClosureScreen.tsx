import React, {useEffect, useState} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type {
  DayClosureService,
  DayClosureSnapshot,
} from '../application/dayClosureService';
import type {
  TomorrowFirstReminderResult,
  TomorrowFirstReminderService,
} from '../application/tomorrowFirstNotifications';
import {LOCAL_TRIGGER_NOT_FUTURE} from '../application/tomorrowFirstNotifications';

const DEFAULT_REMINDER_TIME = '08:00';
const REMINDER_TIME_ERROR = '提醒时间无效，请重试';

function Button({
  label,
  onPress,
  disabled = false,
}: Readonly<{
  label: string;
  onPress(): void | Promise<void>;
  disabled?: boolean;
}>): React.JSX.Element {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && styles.disabled]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export function DayClosureScreen({
  service,
  tomorrowFirstReminder,
  onConfirmed,
  onBack,
}: Readonly<{
  service: DayClosureService;
  tomorrowFirstReminder?: TomorrowFirstReminderService;
  onConfirmed(snapshot: DayClosureSnapshot): void;
  onBack(): void;
}>): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<DayClosureSnapshot | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorAccessibilityLabel, setErrorAccessibilityLabel] = useState<string | null>(null);
  const [reminderStatus, setReminderStatus] = useState<TomorrowFirstReminderResult>('idle');
  const [reminderSettingsOpen, setReminderSettingsOpen] = useState(false);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState(DEFAULT_REMINDER_TIME);
  const [savedReminderTime, setSavedReminderTime] = useState(DEFAULT_REMINDER_TIME);

  const reminderSettingsAvailable =
    tomorrowFirstReminder?.settingsEnabled === true &&
    tomorrowFirstReminder.getSettings !== undefined &&
    tomorrowFirstReminder.saveTime !== undefined &&
    tomorrowFirstReminder.disable !== undefined;

  useEffect(() => {
    let current = true;
    void service.load().then(async next => {
      if (!current) {
        return;
      }
      setSnapshot(next);
      setSelectedTaskId(
        next.record?.state === 'pending' ? next.record.targetTaskId : null,
      );
      if (reminderSettingsAvailable) {
        const settings = await tomorrowFirstReminder.getSettings!();
        if (current) {
          setReminderEnabled(settings.enabled);
          setReminderTime(settings.wallClockTime);
          setSavedReminderTime(settings.wallClockTime);
          setReminderStatus(settings.status);
        }
      }
    }).catch(reason => {
      if (current) {
        setError(reason instanceof Error ? reason.message : 'DAY_CLOSURE_LOAD_FAILED');
      }
    });
    return () => {
      current = false;
    };
  }, [reminderSettingsAvailable, service, tomorrowFirstReminder]);

  function clearOperationError(): void {
    setError(null);
    setErrorAccessibilityLabel(null);
  }

  function reportReminderError(reason: unknown, fallback: string): void {
    const code = reason instanceof Error ? reason.message : fallback;
    if (
      code === LOCAL_TRIGGER_NOT_FUTURE ||
      code === 'TOMORROW_FIRST_WALL_CLOCK_INVALID'
    ) {
      setError(REMINDER_TIME_ERROR);
      setErrorAccessibilityLabel(LOCAL_TRIGGER_NOT_FUTURE);
      return;
    }
    setError(code);
    setErrorAccessibilityLabel(null);
  }

  function confirm(): void {
    if (selectedTaskId === null || pending) {
      return;
    }
    setPending(true);
    clearOperationError();
    void service.choose(selectedTaskId)
      .then(next => {
        setSnapshot(next);
        void tomorrowFirstReminder?.reconcile(next)
          .then(setReminderStatus)
          .catch(() => undefined);
        onConfirmed(next);
      })
      .catch(reason => {
        setError(reason instanceof Error ? reason.message : 'DAY_CLOSURE_CHOOSE_FAILED');
      })
      .finally(() => setPending(false));
  }

  function enableReminder(): void {
    if (snapshot === null || tomorrowFirstReminder === undefined) {
      return;
    }
    const requestedTime = reminderTime;
    clearOperationError();
    void tomorrowFirstReminder.enable(
      snapshot,
      reminderSettingsAvailable ? requestedTime : undefined,
    )
      .then(status => {
        setReminderStatus(status);
        if (reminderSettingsAvailable) {
          setReminderEnabled(status === 'scheduled');
          if (status === 'scheduled') {
            setSavedReminderTime(requestedTime);
          }
        }
      })
      .catch(reason => {
        reportReminderError(reason, 'REMINDER_ENABLE_FAILED');
      });
  }

  function saveReminderTime(): void {
    if (snapshot === null || tomorrowFirstReminder?.saveTime === undefined) {
      return;
    }
    const requestedTime = reminderTime;
    clearOperationError();
    void tomorrowFirstReminder.saveTime(snapshot, requestedTime)
      .then(status => {
        setReminderStatus(status);
        setReminderEnabled(status === 'scheduled');
        if (status === 'scheduled') {
          setSavedReminderTime(requestedTime);
        }
      })
      .catch(reason => {
        reportReminderError(reason, 'REMINDER_SAVE_FAILED');
      });
  }

  function disableReminder(): void {
    if (snapshot === null || tomorrowFirstReminder?.disable === undefined) {
      return;
    }
    clearOperationError();
    void tomorrowFirstReminder.disable(snapshot)
      .then(status => {
        setReminderStatus(status);
        setReminderEnabled(false);
      })
      .catch(reason => {
        reportReminderError(reason, 'REMINDER_DISABLE_FAILED');
      });
  }

  const selectedTarget = snapshot?.record?.state === 'pending'
    ? snapshot.candidates.find(task => task.id === snapshot.record?.targetTaskId) ?? null
    : null;

  return (
    <View style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>今日回顾</Text>
        {snapshot !== null ? (
          <>
            <View style={styles.panel}>
              <Text style={styles.summary}>今日完成：{snapshot.completedToday}项</Text>
              <Text style={styles.summary}>
                今日专注：{snapshot.focusCountToday}次 / {snapshot.focusMinutesToday}分钟
              </Text>
            </View>
            <Text style={styles.sectionTitle}>选择明日第一项</Text>
            {snapshot.candidates.map(task => (
              <Button
                key={task.id}
                label={`选择明日第一项：${task.title}`}
                onPress={() => setSelectedTaskId(task.id)}
              />
            ))}
            <Button
              disabled={selectedTaskId === null || pending}
              label="确认明日第一项"
              onPress={confirm}
            />
            {selectedTarget === null ? null : (
              <View style={styles.panel}>
                <Text style={styles.summary}>明日第一项已设定：{selectedTarget.title}</Text>
                {tomorrowFirstReminder === undefined ? null : reminderSettingsAvailable ? (
                  <>
                    <Button
                      label="提醒设置"
                      onPress={() => setReminderSettingsOpen(true)}
                    />
                    {reminderSettingsOpen ? (
                      <View style={styles.reminderSettings}>
                        <TextInput
                          accessibilityLabel="提醒时间"
                          autoCapitalize="none"
                          onChangeText={setReminderTime}
                          style={styles.timeInput}
                          value={reminderTime}
                        />
                        {reminderEnabled ? (
                          <>
                            <Button
                              label="保存提醒时间"
                              onPress={saveReminderTime}
                            />
                            <Button label="关闭提醒" onPress={disableReminder} />
                          </>
                        ) : (
                          <Button label="开启提醒" onPress={enableReminder} />
                        )}
                      </View>
                    ) : null}
                  </>
                ) : (
                  <Button
                    disabled={pending}
                    label="设置明日 08:00 提醒"
                    onPress={enableReminder}
                  />
                )}
                {reminderStatus === 'scheduled' ? (
                  <Text style={styles.status}>
                    {reminderSettingsAvailable
                      ? `明日提醒：约 ${savedReminderTime}`
                      : '明日提醒已设置'}
                  </Text>
                ) : null}
                {reminderStatus === 'denied' ? (
                  <Text style={styles.status}>提醒未开启，不影响明日第一项</Text>
                ) : null}
              </View>
            )}
          </>
        ) : null}
        {error !== null ? (
          <Text
            accessibilityLabel={errorAccessibilityLabel ?? undefined}
            style={styles.error}>
            {error}
          </Text>
        ) : null}
        <Button label="回到象限" onPress={onBack} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: '#F3F7F6'},
  content: {padding: 20, gap: 14},
  title: {color: '#173F3A', fontSize: 28, fontWeight: '800'},
  sectionTitle: {color: '#173F3A', fontSize: 18, fontWeight: '800'},
  panel: {backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, gap: 8},
  summary: {color: '#173F3A', fontSize: 16, fontWeight: '700'},
  button: {minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#247A6B', borderRadius: 12, padding: 12},
  buttonText: {color: '#FFFFFF', fontSize: 16, fontWeight: '800'},
  disabled: {opacity: 0.45},
  error: {color: '#9C2F24', fontSize: 14},
  status: {color: '#516862', fontSize: 14, lineHeight: 20},
  reminderSettings: {gap: 8},
  timeInput: {
    minHeight: 48,
    borderColor: '#A8BDB8',
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    color: '#173F3A',
    fontSize: 16,
    paddingHorizontal: 14,
  },
});
