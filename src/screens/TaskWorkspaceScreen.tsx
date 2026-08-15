import React, {useEffect, useRef, useState} from 'react';
import {
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type {CoreAppService} from '../application/coreAppService';
import type {
  DayClosureService,
  DayClosureSnapshot,
} from '../application/dayClosureService';
import type {FocusHistoryQuery} from './FocusHistoryScreen';
import {useAppFocusSessionRuntime} from '../app/focusSessionRuntime';
import {usePostFocusReviewRuntime} from '../app/postFocusReviewRuntime';
import {useTaskWorkspaceRuntime} from '../app/taskWorkspaceRuntime';
import type {Quadrant} from '../domain/quadrant';
import type {Task} from '../domain/task';
import {CoreFlowScreen} from './CoreFlowScreen';
import {FocusHistoryScreen} from './FocusHistoryScreen';
import {DayClosureScreen} from './DayClosureScreen';
import type {
  TomorrowFirstReminderService,
  TomorrowFirstTap,
} from '../application/tomorrowFirstNotifications';
import type {LocalBackupService} from '../application/localBackupService';
import {
  LocalBackupScreen,
  type BackupFileBridge,
} from './LocalBackupScreen';

type TaskWorkspaceScreenProps = Readonly<{
  service: CoreAppService;
  dayClosure: DayClosureService;
  reviewHistory: FocusHistoryQuery;
  historyNow(): string;
  tomorrowFirstReminder?: TomorrowFirstReminderService;
  initialTomorrowFirstTap?: TomorrowFirstTap | null;
  subscribeTomorrowFirstTap?: (
    listener: (tap: TomorrowFirstTap) => void,
  ) => () => void;
  localBackup?: LocalBackupService;
  backupFileBridge?: BackupFileBridge;
}>;

type ButtonProps = Readonly<{
  label: string;
  displayLabel?: string;
  onPress(): void | Promise<void>;
  disabled?: boolean;
  secondary?: boolean;
}>;

const QUADRANT_COPY: Readonly<Record<Quadrant, Readonly<{
  title: string;
  taskLabel: string;
}>>> = {
  Q1: {title: '救火区', taskLabel: '救火区任务'},
  Q2: {title: '成长区', taskLabel: '成长区任务'},
  Q3: {title: '干扰区', taskLabel: '干扰区任务'},
  Q4: {title: '清理区', taskLabel: '清理区任务'},
};

function Button({
  label,
  displayLabel = label,
  onPress,
  disabled = false,
  secondary = false,
}: ButtonProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        secondary && styles.secondaryButton,
        disabled && styles.disabled,
      ]}>
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>
        {displayLabel}
      </Text>
    </Pressable>
  );
}

function Checkbox({
  label,
  checked,
  onPress,
}: Readonly<{
  label: string;
  checked: boolean;
  onPress(): void;
}>): React.JSX.Element {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="checkbox"
      accessibilityState={{checked}}
      onPress={onPress}
      style={[styles.checkbox, checked && styles.checkboxSelected]}>
      <Text style={styles.checkboxText}>{label}</Text>
    </Pressable>
  );
}

function QuadrantTaskCard({
  quadrant,
  task,
  recommended,
  onPress,
}: Readonly<{
  quadrant: Quadrant;
  task: Task;
  recommended: boolean;
  onPress(): void;
}>): React.JSX.Element {
  const label = `${QUADRANT_COPY[quadrant].taskLabel}：${task.title}`;
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.taskCard}>
      <Text style={styles.taskTitle}>
        {recommended ? '查看今日推荐任务' : task.title}
      </Text>
      <Text style={styles.taskMeta}>
        {task.status === 'in_progress' ? '进行中' : '待开始'}
      </Text>
    </Pressable>
  );
}

export function TaskWorkspaceScreen({
  service,
  dayClosure,
  reviewHistory,
  historyNow,
  tomorrowFirstReminder,
  initialTomorrowFirstTap = null,
  subscribeTomorrowFirstTap,
  localBackup,
  backupFileBridge,
}: TaskWorkspaceScreenProps): React.JSX.Element {
  const workspace = useTaskWorkspaceRuntime();
  const focusRuntime = useAppFocusSessionRuntime();
  const reviewRuntime = usePostFocusReviewRuntime();
  const [creating, setCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createImportant, setCreateImportant] = useState(false);
  const [createUrgent, setCreateUrgent] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editImportant, setEditImportant] = useState(false);
  const [editUrgent, setEditUrgent] = useState(false);
  const [editFailed, setEditFailed] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState(false);
  const [historyDay, setHistoryDay] = useState<string | null>(null);
  const [dayClosureOpen, setDayClosureOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [dayClosureSnapshot, setDayClosureSnapshot] =
    useState<DayClosureSnapshot | null>(null);
  const [dayClosurePending, setDayClosurePending] = useState(false);
  const [dayClosureError, setDayClosureError] = useState<string | null>(null);
  const [reminderStatus, setReminderStatus] = useState<
    'denied' | 'scheduled' | 'error' | null
  >(null);
  const [reminderSettingsOpen, setReminderSettingsOpen] = useState(false);
  const [reminderAcceptedTime, setReminderAcceptedTime] = useState('08:00');
  const [reminderDraftTime, setReminderDraftTime] = useState('08:00');
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderErrorCode, setReminderErrorCode] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const reminderRequestRef = useRef(0);
  const reminderReadRef = useRef(0);
  const reminderDraftDirtyRef = useRef(false);
  const reminderDraftGenerationRef = useRef(0);
  const [tomorrowRoute, setTomorrowRoute] = useState<TomorrowFirstTap | null>(
    initialTomorrowFirstTap,
  );
  const autoOpenedTaskIdsRef = useRef(new Set<string>());
  const autoOpenedFocusSessionIdsRef = useRef(new Set<string>());

  const selectedTaskIdentity = workspace?.selectedTask?.id ?? null;

  async function refreshReminderSettings(
    syncDraft = false,
    expectedRequest = reminderRequestRef.current,
  ): Promise<void> {
    if (tomorrowFirstReminder?.getSettings === undefined) {
      return;
    }
    const read = reminderReadRef.current + 1;
    reminderReadRef.current = read;
    const draftGeneration = reminderDraftGenerationRef.current;
    const settings = await tomorrowFirstReminder.getSettings();
    if (
      !mountedRef.current ||
      reminderReadRef.current !== read ||
      reminderRequestRef.current !== expectedRequest
    ) {
      return;
    }
    setReminderAcceptedTime(settings.wallClockTime);
    if (
      reminderDraftGenerationRef.current === draftGeneration &&
      (syncDraft || !reminderDraftDirtyRef.current)
    ) {
      reminderDraftDirtyRef.current = false;
      setReminderDraftTime(settings.wallClockTime);
    }
    setReminderEnabled(settings.enabled);
    setReminderStatus(settings.status === 'idle' ? null : settings.status);
  }
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      reminderRequestRef.current += 1;
      reminderReadRef.current += 1;
    };
  }, []);
  useEffect(() => {
    if (initialTomorrowFirstTap !== null) {
      setTomorrowRoute(initialTomorrowFirstTap);
    }
  }, [initialTomorrowFirstTap]);
  useEffect(() => {
    let current = true;
    void dayClosure.load().then(next => {
      if (current) {
        setDayClosureSnapshot(next);
        void tomorrowFirstReminder?.reconcile(next)
          .then(result => {
            if (current) {
              setReminderStatus(result === 'idle' ? null : result);
              return refreshReminderSettings();
            }
            return undefined;
          })
          .catch(() => refreshReminderSettings().catch(() => undefined));
      }
    }).catch(reason => {
      if (current) {
        setDayClosureError(
          reason instanceof Error ? reason.message : 'DAY_CLOSURE_LOAD_FAILED',
        );
      }
    });
    return () => {
      current = false;
    };
  }, [dayClosure, tomorrowFirstReminder]);
  useEffect(() => {
    if (tomorrowFirstReminder === undefined) {
      return undefined;
    }
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        return;
      }
      void dayClosure.load().then(async next => {
        if (!mountedRef.current) {
          return;
        }
        setDayClosureSnapshot(next);
        await tomorrowFirstReminder.reconcile(next);
        await refreshReminderSettings();
      }).catch(() => undefined);
    });
    return () => subscription.remove();
  }, [dayClosure, tomorrowFirstReminder]);
  useEffect(() => {
    if (subscribeTomorrowFirstTap === undefined) {
      return undefined;
    }
    return subscribeTomorrowFirstTap(tap => {
      setTomorrowRoute(tap);
      setHistoryDay(null);
      setDayClosureOpen(false);
      workspace?.closeTask();
      void dayClosure.load().then(next => {
        setDayClosureSnapshot(next);
        void tomorrowFirstReminder?.reconcile(next).catch(() => undefined);
      }).catch(() => undefined);
    });
  }, [dayClosure, subscribeTomorrowFirstTap, tomorrowFirstReminder, workspace]);
  useEffect(() => {
    setEditing(false);
    setEditFailed(false);
    setDeleteConfirmation(false);
  }, [selectedTaskIdentity]);

  useEffect(() => {
    const recommendation = workspace?.snapshot.recommendation ?? null;
    if (
      workspace === null ||
      workspace.snapshot.loaded !== true ||
      recommendation?.status !== 'in_progress' ||
      autoOpenedTaskIdsRef.current.has(recommendation.id)
    ) {
      return;
    }
    autoOpenedTaskIdsRef.current.add(recommendation.id);
    workspace.selectTask(recommendation.id);
  }, [workspace]);

  useEffect(() => {
    const activeSession =
      focusRuntime?.snapshot.state === 'running'
        ? focusRuntime.snapshot.activeSession
        : null;
    if (
      workspace === null ||
      activeSession === null ||
      (workspace.selectedTask !== null &&
        workspace.selectedTask.id !== activeSession.taskId) ||
      autoOpenedFocusSessionIdsRef.current.has(activeSession.id) ||
      !workspace.snapshot.tasks.some(task => task.id === activeSession.taskId)
    ) {
      return;
    }
    autoOpenedFocusSessionIdsRef.current.add(activeSession.id);
    if (autoOpenedTaskIdsRef.current.has(activeSession.taskId)) {
      return;
    }
    autoOpenedTaskIdsRef.current.add(activeSession.taskId);
    workspace.selectTask(activeSession.taskId);
  }, [focusRuntime, workspace]);

  if (workspace === null) {
    return <CoreFlowScreen service={service} />;
  }

  if (backupOpen && localBackup !== undefined && backupFileBridge !== undefined) {
    return (
      <LocalBackupScreen
        bridge={backupFileBridge}
        localBackup={localBackup}
        now={historyNow}
        onBack={() => setBackupOpen(false)}
        onRestored={async () => {
          await workspace.refreshProjection();
          workspace.closeTask();
          setBackupOpen(false);
        }}
      />
    );
  }

  if (dayClosureOpen) {
    return (
      <DayClosureScreen
        service={dayClosure}
        onBack={() => setDayClosureOpen(false)}
        onConfirmed={next => {
          setDayClosureSnapshot(next);
          void tomorrowFirstReminder?.reconcile(next).catch(() => undefined);
          setHistoryDay(null);
          setDayClosureOpen(false);
          workspace.closeTask();
        }}
      />
    );
  }

  if (historyDay !== null) {
    return (
      <FocusHistoryScreen
        day={historyDay}
        history={reviewHistory}
        onBack={() => setHistoryDay(null)}
        onEndToday={() => setDayClosureOpen(true)}
      />
    );
  }

  const runtime = workspace;
  const {snapshot, selectedTask} = runtime;
  const activeFocusTask =
    focusRuntime?.snapshot.activeSession === null ||
    focusRuntime?.snapshot.activeSession === undefined
      ? null
      : snapshot.tasks.find(
          task => task.id === focusRuntime.snapshot.activeSession?.taskId,
        ) ?? null;

  const closureRecord = dayClosureSnapshot?.record ?? null;
  const closureTarget = dayClosureSnapshot?.target ?? null;
  const closureIsNextDay =
    closureRecord !== null &&
    dayClosureSnapshot !== null &&
    closureRecord.dayKey < dayClosureSnapshot.currentDay;
  const closureUnavailable =
    closureRecord?.state === 'resolved_completed' ||
    closureRecord?.state === 'resolved_deleted';
  const routeMatches =
    tomorrowRoute !== null &&
    'dayKey' in tomorrowRoute &&
    closureRecord !== null &&
    tomorrowRoute.dayKey === closureRecord.dayKey &&
    tomorrowRoute.taskId === closureRecord.targetTaskId;
  const routeUnavailable = tomorrowRoute !== null && (!routeMatches || closureUnavailable || closureTarget === null);

  function setTomorrowReminder(): void {
    if (tomorrowFirstReminder === undefined || dayClosureSnapshot === null) {
      return;
    }
    const request = reminderRequestRef.current + 1;
    reminderRequestRef.current = request;
    setReminderStatus(null);
    setDayClosurePending(true);
    void tomorrowFirstReminder.enable(dayClosureSnapshot)
      .then(result => {
        if (mountedRef.current && reminderRequestRef.current === request) {
          setReminderStatus(result === 'idle' ? null : result);
        }
      })
      .catch(() => {
        if (mountedRef.current && reminderRequestRef.current === request) {
          setReminderStatus('error');
        }
      })
      .finally(() => {
        if (mountedRef.current && reminderRequestRef.current === request) {
          setDayClosurePending(false);
        }
      });
  }

  function openReminderSettings(): void {
    reminderDraftDirtyRef.current = false;
    setReminderDraftTime(reminderAcceptedTime);
    setReminderErrorCode(null);
    setReminderSettingsOpen(true);
    void refreshReminderSettings(true).catch(() => undefined);
  }

  function enableLocalReminder(): void {
    if (tomorrowFirstReminder === undefined || dayClosureSnapshot === null) {
      return;
    }
    const request = reminderRequestRef.current + 1;
    reminderRequestRef.current = request;
    setReminderStatus(null);
    setReminderErrorCode(null);
    void tomorrowFirstReminder.enable(dayClosureSnapshot, reminderDraftTime)
      .then(async result => {
        if (mountedRef.current && reminderRequestRef.current === request) {
          setReminderStatus(result === 'idle' ? null : result);
          reminderDraftDirtyRef.current = false;
          await refreshReminderSettings(true, request);
        }
      })
      .catch(reason => {
        if (mountedRef.current && reminderRequestRef.current === request) {
          const code =
            reason instanceof Error ? reason.message : 'REMINDER_SETTINGS_FAILED';
          setReminderErrorCode(code);
          setReminderStatus('error');
        }
      });
  }

  function saveLocalReminderTime(): void {
    if (
      tomorrowFirstReminder?.saveTime === undefined ||
      dayClosureSnapshot === null
    ) {
      return;
    }
    const acceptedValue = reminderDraftTime;
    const request = reminderRequestRef.current + 1;
    reminderRequestRef.current = request;
    setReminderErrorCode(null);
    void tomorrowFirstReminder.saveTime(dayClosureSnapshot, acceptedValue)
      .then(async result => {
        if (mountedRef.current && reminderRequestRef.current === request) {
          setReminderStatus(result === 'idle' ? null : result);
          reminderDraftDirtyRef.current = false;
          await refreshReminderSettings(true, request);
        }
      })
      .catch(reason => {
        if (mountedRef.current && reminderRequestRef.current === request) {
          const code =
            reason instanceof Error ? reason.message : 'REMINDER_SETTINGS_FAILED';
          setReminderErrorCode(code);
          setReminderStatus('error');
        }
      });
  }

  function disableLocalReminder(): void {
    if (
      tomorrowFirstReminder?.disable === undefined ||
      dayClosureSnapshot === null
    ) {
      return;
    }
    const request = reminderRequestRef.current + 1;
    reminderRequestRef.current = request;
    setReminderErrorCode(null);
    void tomorrowFirstReminder.disable(dayClosureSnapshot)
      .then(async result => {
        if (mountedRef.current && reminderRequestRef.current === request) {
          setReminderStatus(result === 'idle' ? null : result);
          reminderDraftDirtyRef.current = false;
          await refreshReminderSettings(true, request);
          setReminderSettingsOpen(false);
        }
      })
      .catch(reason => {
        if (mountedRef.current && reminderRequestRef.current === request) {
          setReminderErrorCode(
            reason instanceof Error ? reason.message : 'REMINDER_SETTINGS_FAILED',
          );
          setReminderStatus('error');
        }
      });
  }

  function startTomorrowFirst(): void {
    if (focusRuntime === null || dayClosurePending) {
      return;
    }
    setDayClosurePending(true);
    setDayClosureError(null);
    void dayClosure
      .startAndConsume(taskId => focusRuntime.start(taskId))
      .then(async next => {
        await runtime.refreshAfterDurableCommit().catch(() => undefined);
        setDayClosureSnapshot(next);
      })
      .catch(reason => {
        setDayClosureError(
          reason instanceof Error ? reason.message : 'DAY_CLOSURE_START_FAILED',
        );
        void dayClosure.load().then(setDayClosureSnapshot).catch(() => undefined);
      })
      .finally(() => setDayClosurePending(false));
  }

  function startCurrentRecommendation(): void {
    if (focusRuntime === null || dayClosurePending) {
      return;
    }
    setDayClosurePending(true);
    setDayClosureError(null);
    void dayClosure
      .startCurrentRecommendation(taskId => focusRuntime.start(taskId))
      .then(async next => {
        await runtime.refreshAfterDurableCommit().catch(() => undefined);
        setDayClosureSnapshot(next);
      })
      .catch(reason => {
        setDayClosureError(
          reason instanceof Error ? reason.message : 'DAY_CLOSURE_START_FAILED',
        );
        void dayClosure.load().then(setDayClosureSnapshot).catch(() => undefined);
      })
      .finally(() => setDayClosurePending(false));
  }

  function openCreate(): void {
    runtime.clearError();
    setCreateTitle('');
    setCreateImportant(false);
    setCreateUrgent(false);
    setCreating(true);
  }

  function saveCreate(): Promise<void> {
    return runtime
      .createTask({
        title: createTitle,
        description: '',
        important: createImportant,
        urgent: createUrgent,
        scheduledStartAt: null,
        dueAt: null,
        estimatedMinutes: 5,
        firstStep: null,
      })
      .then(() => {
        setCreating(false);
      })
      .catch(() => undefined);
  }

  function openEdit(task: Task): void {
    runtime.clearError();
    setEditTitle(task.title);
    setEditImportant(task.important);
    setEditUrgent(task.urgent);
    setEditFailed(false);
    setEditing(true);
  }

  function saveEdit(task: Task): Promise<void> {
    runtime.clearError();
    return runtime
      .updateTask(task.id, {
        title: editTitle,
        important: editImportant,
        urgent: editUrgent,
      })
      .then(() => undefined)
      .catch(() => {
        setEditFailed(true);
      });
  }

  function confirmDelete(task: Task): Promise<void> {
    return runtime
      .softDeleteTask(task.id)
      .then(async () => {
        const next = await dayClosure.load();
        setDayClosureSnapshot(next);
        await tomorrowFirstReminder?.reconcile(next);
      })
      .catch(() => undefined);
  }

  function retryWorkspaceRefresh(): Promise<void> {
    return runtime.refresh().catch(() => undefined);
  }

  if (selectedTask !== null) {
    return (
      <View style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text accessibilityRole="header" style={styles.title}>
            我的象限
          </Text>
          <Button label="今日回顾" onPress={() => setDayClosureOpen(true)} />
          {localBackup !== undefined && backupFileBridge !== undefined ? (
            <Button label="数据与备份" onPress={() => setBackupOpen(true)} />
          ) : null}
          <Button
            label="今日记录"
            onPress={() => setHistoryDay(historyNow().slice(0, 10))}
          />
          {snapshot.recommendation?.id === selectedTask.id ? (
            <Text style={styles.recommendationText}>
              今日推荐：{selectedTask.title}
            </Text>
          ) : null}
          {activeFocusTask !== null && activeFocusTask.id !== selectedTask.id ? (
            <View style={styles.panel}>
              <Text style={styles.taskTitle}>
                专注任务：{activeFocusTask.title}
              </Text>
            </View>
          ) : null}
          {snapshot.quadrants?.map(bucket => (
            <View key={bucket.quadrant} style={styles.panel}>
              <Text style={styles.sectionTitle}>
                {QUADRANT_COPY[bucket.quadrant].title}
              </Text>
              {bucket.allTasks.map(task => (
                <QuadrantTaskCard
                  key={task.id}
                  quadrant={bucket.quadrant}
                  recommended={snapshot.recommendation?.id === task.id}
                  task={task}
                  onPress={() => runtime.selectTask(task.id)}
                />
              ))}
            </View>
          ))}
          <View style={styles.detailPanel}>
            <Text accessibilityRole="header" style={styles.detailTitle}>
              任务详情：{selectedTask.title}
            </Text>
            <View style={styles.row}>
              <Button
                label="编辑任务"
                onPress={() => openEdit(selectedTask)}
                secondary
              />
              <Button
                label="删除任务"
                onPress={() => setDeleteConfirmation(true)}
                secondary
              />
              <Button
                label="回到象限"
                onPress={runtime.closeTask}
                secondary
              />
            </View>

            {editing ? (
              <View style={styles.panel}>
                <TextInput
                  accessibilityLabel="编辑任务名称"
                  onChangeText={setEditTitle}
                  style={styles.input}
                  value={editTitle}
                />
                <View style={styles.row}>
                  <Checkbox
                    checked={editImportant}
                    label="编辑重要"
                    onPress={() => setEditImportant(value => !value)}
                  />
                  <Checkbox
                    checked={editUrgent}
                    label="编辑紧急"
                    onPress={() => setEditUrgent(value => !value)}
                  />
                </View>
                <Button
                  disabled={snapshot.mutationPending}
                  label={editFailed ? '重试保存修改' : '保存修改'}
                  onPress={() => saveEdit(selectedTask)}
                />
              </View>
            ) : null}

            {deleteConfirmation ? (
              <View style={styles.confirmation}>
                <Text style={styles.confirmationText}>
                  确认删除“{selectedTask.title}”？
                </Text>
                <View style={styles.row}>
                  <Button
                    label="取消删除"
                    onPress={() => setDeleteConfirmation(false)}
                    secondary
                  />
                  <Button
                    disabled={snapshot.mutationPending}
                    label="确认删除"
                    onPress={() => confirmDelete(selectedTask)}
                  />
                </View>
              </View>
            ) : null}

            <CoreFlowScreen key={selectedTask.id} service={service} />
          </View>

          {snapshot.errorText !== null ? (
            <Text accessibilityLiveRegion="assertive" style={styles.error}>
              {snapshot.errorText}
            </Text>
          ) : null}
          {snapshot.refreshErrorText !== null ? (
            <>
              <Text accessibilityLiveRegion="assertive" style={styles.error}>
                {snapshot.refreshErrorText}
              </Text>
              <Button
                disabled={snapshot.refreshPending}
                label="重试刷新象限"
                onPress={retryWorkspaceRefresh}
              />
            </>
          ) : null}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          {tomorrowRoute === null ? '我的象限' : '明日第一项'}
        </Text>
        {tomorrowRoute !== null ? (
          <Button label="回到象限" onPress={() => setTomorrowRoute(null)} />
        ) : null}
        {closureRecord !== null && closureRecord.state === 'pending' && !closureIsNextDay && closureTarget !== null ? (
          <View style={styles.recommendation}>
            <Text style={styles.recommendationText}>
              明日第一项已设定：{closureTarget.title}
            </Text>
            {tomorrowFirstReminder !== undefined ? (
              tomorrowFirstReminder.settingsEnabled === true ? (
                <>
                  <Button label="提醒设置" onPress={openReminderSettings} />
                  {reminderEnabled ? (
                    <Text style={styles.subtitle}>
                      明日提醒：约 {reminderAcceptedTime}
                    </Text>
                  ) : null}
                </>
              ) : (
                <Button
                  disabled={dayClosurePending}
                  label="设置明日 08:00 提醒"
                  onPress={setTomorrowReminder}
                />
              )
            ) : null}
            {reminderSettingsOpen &&
            tomorrowFirstReminder?.settingsEnabled === true ? (
              <View style={styles.recommendation}>
                <Text style={styles.subtitle}>提醒时间</Text>
                <TextInput
                  accessibilityLabel="提醒时间"
                  onChangeText={value => {
                    reminderDraftDirtyRef.current = true;
                    reminderDraftGenerationRef.current += 1;
                    setReminderDraftTime(value);
                  }}
                  style={styles.input}
                  value={reminderDraftTime}
                />
                {reminderEnabled ? (
                  <>
                    <Button
                      label="保存提醒时间"
                      onPress={saveLocalReminderTime}
                    />
                    <Button
                      label="关闭提醒"
                      onPress={disableLocalReminder}
                      secondary
                    />
                  </>
                ) : (
                  <Button label="开启提醒" onPress={enableLocalReminder} />
                )}
                <Button
                  label="回到象限"
                  onPress={() => setReminderSettingsOpen(false)}
                  secondary
                />
              </View>
            ) : null}
            {reminderStatus === 'denied' ? (
              <Text style={styles.subtitle}>提醒未开启，不影响明日第一项</Text>
            ) : null}
            {reminderStatus === 'error' ? (
              <>
                <Text
                  accessibilityLabel={reminderErrorCode ?? undefined}
                  accessibilityLiveRegion="assertive"
                  style={styles.error}>
                  {reminderErrorCode === 'LOCAL_TRIGGER_NOT_FUTURE'
                    ? '提醒时间无效，请重试'
                    : '提醒设置失败，请重试'}
                </Text>
                {tomorrowFirstReminder?.settingsEnabled === true ? null : (
                  <Button
                    disabled={dayClosurePending}
                    label="重试设置明日提醒"
                    onPress={setTomorrowReminder}
                  />
                )}
              </>
            ) : null}
          </View>
        ) : null}
        {routeUnavailable ? (
          <View style={styles.recommendation}>
            <Text style={styles.recommendationText}>
              明日第一项已不可用：{closureTarget?.title ?? '原任务'}
            </Text>
            <Button label="重新选择明日第一项" onPress={() => setDayClosureOpen(true)} />
          </View>
        ) : null}
        {closureRecord !== null &&
        (closureRecord.state === 'starting' ||
          (closureRecord.state === 'pending' && closureIsNextDay)) &&
        closureTarget !== null ? (
          <View style={styles.recommendation}>
            <Text style={styles.recommendationText}>
              {closureRecord.state === 'starting'
                ? `继续明日第一项：${closureTarget.title}`
                : `明日第一项：${closureTarget.title}`}
            </Text>
            <Button
              disabled={dayClosurePending}
              label={
                closureRecord.state === 'starting'
                  ? '继续开始明日第一项5分钟'
                  : '开始明日第一项5分钟'
              }
              onPress={startTomorrowFirst}
            />
            {tomorrowFirstReminder?.settingsEnabled === true ? (
              <Button label="提醒设置" onPress={openReminderSettings} />
            ) : null}
            {tomorrowFirstReminder?.settingsEnabled === true &&
            reminderEnabled ? (
              <Text style={styles.subtitle}>
                明日提醒：约 {reminderAcceptedTime}
              </Text>
            ) : null}
            {reminderSettingsOpen &&
            tomorrowFirstReminder?.settingsEnabled === true ? (
              <View style={styles.recommendation}>
                <Text style={styles.subtitle}>提醒时间</Text>
                <TextInput
                  accessibilityLabel="提醒时间"
                  onChangeText={value => {
                    reminderDraftDirtyRef.current = true;
                    reminderDraftGenerationRef.current += 1;
                    setReminderDraftTime(value);
                  }}
                  style={styles.input}
                  value={reminderDraftTime}
                />
                {reminderEnabled ? (
                  <>
                    <Button label="保存提醒时间" onPress={saveLocalReminderTime} />
                    <Button label="关闭提醒" onPress={disableLocalReminder} secondary />
                  </>
                ) : (
                  <Button label="开启提醒" onPress={enableLocalReminder} />
                )}
                <Button
                  label="回到象限"
                  onPress={() => setReminderSettingsOpen(false)}
                  secondary
                />
              </View>
            ) : null}
            {reminderStatus === 'error' ? (
              <Text
                accessibilityLabel={reminderErrorCode ?? undefined}
                accessibilityLiveRegion="assertive"
                style={styles.error}>
                {reminderErrorCode === 'LOCAL_TRIGGER_NOT_FUTURE'
                  ? '提醒时间无效，请重试'
                  : '提醒设置失败，请重试'}
              </Text>
            ) : null}
          </View>
        ) : null}
        {closureIsNextDay && closureUnavailable && tomorrowRoute === null ? (
          <View style={styles.recommendation}>
            <Text style={styles.recommendationText}>
              明日第一项已不可用：{closureTarget?.title ?? '原任务'}
            </Text>
            <Button
              label="重新选择明日第一项"
              onPress={() => setDayClosureOpen(true)}
            />
            {snapshot.recommendation !== null ? (
              <Button
                disabled={dayClosurePending}
                label="开始当前推荐5分钟"
                onPress={startCurrentRecommendation}
              />
            ) : null}
          </View>
        ) : null}
        {dayClosureError !== null ? (
          <Text accessibilityLiveRegion="assertive" style={styles.error}>
            {dayClosureError}
          </Text>
        ) : null}
        <Text style={styles.subtitle}>
          把精力放在此刻最值得推进的一件事上。
        </Text>
        {reviewRuntime?.snapshot.todaySummary !== null &&
        reviewRuntime?.snapshot.todaySummary !== undefined ? (
          <Text style={styles.subtitle}>
            今日专注：{reviewRuntime.snapshot.todaySummary.count}次 /{' '}
            {reviewRuntime.snapshot.todaySummary.minutes}分钟
          </Text>
        ) : null}

        <Button label="今日记录" onPress={() => setHistoryDay(historyNow().slice(0, 10))} />
        <Button label="今日回顾" onPress={() => setDayClosureOpen(true)} />
        {localBackup !== undefined && backupFileBridge !== undefined ? (
          <Button label="数据与备份" onPress={() => setBackupOpen(true)} />
        ) : null}
        <Button label="新建任务" onPress={openCreate} />
        {creating ? (
          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>新建任务</Text>
            <TextInput
              accessibilityLabel="任务名称"
              onChangeText={setCreateTitle}
              placeholder="输入清晰、可行动的任务"
              style={styles.input}
              value={createTitle}
            />
            <View style={styles.row}>
              <Checkbox
                checked={createImportant}
                label="重要"
                onPress={() => setCreateImportant(value => !value)}
              />
              <Checkbox
                checked={createUrgent}
                label="紧急"
                onPress={() => setCreateUrgent(value => !value)}
              />
            </View>
            <Button
              disabled={snapshot.mutationPending}
              label="保存任务"
              onPress={saveCreate}
            />
          </View>
        ) : null}

        {snapshot.recommendation !== null ? (
          <View style={styles.recommendation}>
            <Text style={styles.recommendationText}>
              今日推荐：{snapshot.recommendation.title}
            </Text>
            <Button
              displayLabel="打开推荐详情"
              label={`打开今日推荐：${snapshot.recommendation.title}`}
              onPress={() =>
                runtime.selectTask(snapshot.recommendation?.id ?? '')
              }
            />
          </View>
        ) : null}

        {snapshot.quadrants?.map(bucket => (
          <View key={bucket.quadrant} style={styles.panel}>
            <Text style={styles.sectionTitle}>
              {QUADRANT_COPY[bucket.quadrant].title}
            </Text>
            {bucket.allTasks.map(task => (
              <QuadrantTaskCard
                key={task.id}
                quadrant={bucket.quadrant}
                recommended={snapshot.recommendation?.id === task.id}
                task={task}
                onPress={() => runtime.selectTask(task.id)}
              />
            ))}
          </View>
        ))}

        {snapshot.loaded &&
        snapshot.quadrants?.every(bucket => bucket.totalCount === 0) ? (
          <Text style={styles.empty}>还没有活动任务，先新建一项吧。</Text>
        ) : null}

        {selectedTask === null && focusRuntime !== null ? (
          <View style={styles.panel}>
            <Text style={styles.taskMeta}>
              计时状态：
              {focusRuntime.snapshot.state === 'running'
                ? '进行中'
                : focusRuntime.snapshot.state === 'finished'
                  ? '已结束'
                  : '未开始'}
            </Text>
            {activeFocusTask !== null ? (
              <Text style={styles.taskTitle}>
                专注任务：{activeFocusTask.title}
              </Text>
            ) : null}
          </View>
        ) : null}

        {snapshot.errorText !== null ? (
          <Text accessibilityLiveRegion="assertive" style={styles.error}>
            {snapshot.errorText}
          </Text>
        ) : null}
        {snapshot.refreshErrorText !== null ? (
          <>
            <Text accessibilityLiveRegion="assertive" style={styles.error}>
              {snapshot.refreshErrorText}
            </Text>
            <Button
              disabled={snapshot.refreshPending}
              label="重试刷新象限"
              onPress={retryWorkspaceRefresh}
            />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: '#F3F7F6'},
  content: {padding: 20, gap: 14},
  title: {color: '#173F3A', fontSize: 28, fontWeight: '800'},
  subtitle: {color: '#526A66', fontSize: 15},
  panel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  recommendation: {
    backgroundColor: '#DDEFEA',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  recommendationText: {color: '#173F3A', fontSize: 18, fontWeight: '800'},
  sectionTitle: {color: '#173F3A', fontSize: 18, fontWeight: '800'},
  input: {
    minHeight: 48,
    borderColor: '#91A9A5',
    borderRadius: 12,
    borderWidth: 1,
    color: '#173F3A',
    fontSize: 16,
    paddingHorizontal: 14,
  },
  row: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  checkbox: {
    minHeight: 44,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: '#91A9A5',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  checkboxSelected: {backgroundColor: '#D5ECE7', borderColor: '#247A6B'},
  checkboxText: {color: '#173F3A', fontSize: 15, fontWeight: '700'},
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#247A6B',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  secondaryButton: {backgroundColor: '#E3ECEA'},
  buttonText: {color: '#FFFFFF', fontSize: 16, fontWeight: '800'},
  secondaryButtonText: {color: '#173F3A'},
  disabled: {opacity: 0.45},
  taskCard: {
    minHeight: 56,
    borderColor: '#D4E0DE',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  taskTitle: {color: '#173F3A', fontSize: 16, fontWeight: '700'},
  taskMeta: {color: '#526A66', fontSize: 14},
  empty: {color: '#526A66', textAlign: 'center', paddingVertical: 12},
  detailPanel: {backgroundColor: '#EAF3F1', borderRadius: 18, padding: 10, gap: 12},
  detailTitle: {color: '#173F3A', fontSize: 22, fontWeight: '800'},
  confirmation: {backgroundColor: '#FFF3EF', borderRadius: 14, padding: 14, gap: 12},
  confirmationText: {color: '#7A2D23', fontSize: 16, fontWeight: '700'},
  error: {color: '#9C2F24', fontSize: 14},
});
