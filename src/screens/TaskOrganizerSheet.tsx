import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type {TaskLifecycleTaskPatch} from '../application/coreAppService';
import type {ReceiptHistorySnapshot} from '../application/postFocusReviewService';
import {useTaskWorkspaceRuntime} from '../app/taskWorkspaceRuntime';
import {
  AppBottomSheet,
  AppBottomSheetScrollView,
  AppBottomSheetSectionList,
} from '../components/AppBottomSheet';
import type {Task} from '../domain/task';
import {effectiveQuadrantForTask} from '../domain/taskPriority';
import {
  archiveTask,
  classifyUnsortedTask,
  isTaskArchived,
  isTaskUnsorted,
  restoreArchivedTask,
  searchTasksPage,
  selectBacklogCandidates,
  type TaskSearchStatus,
} from '../domain/taskOrganization';

export type TaskOrganizerMode =
  | 'capture'
  | 'search'
  | 'triage'
  | 'completed'
  | 'backlog';

type OrganizerMetricName =
  | 'quick_capture_started'
  | 'quick_capture_saved'
  | 'triage_started'
  | 'triage_completed'
  | 'search_opened'
  | 'search_result_action'
  | 'backlog_review_action';

type Props = Readonly<{
  mode: TaskOrganizerMode;
  now: string;
  activeFocusTaskId: string | null;
  initialTaskId?: string | null;
  history: Readonly<{listReceiptHistory(): Promise<ReceiptHistorySnapshot>}>;
  onClose(): void;
  onOpenTask(taskId: string): void;
  onStartTask(taskId: string): void;
  onMetric(name: OrganizerMetricName, fields?: Record<string, unknown>): void;
}>;

const MODE_TITLE: Readonly<Record<TaskOrganizerMode, string>> = {
  capture: '先记下',
  search: '查找任务',
  triage: '待判断',
  completed: '已完成任务',
  backlog: '整理一下',
};

const STATUS_TEXT: Readonly<Record<TaskSearchStatus, string>> = {
  ACTIVE: '进行中',
  UNSORTED: '待判断',
  COMPLETED: '已完成',
  ARCHIVED: '已归档',
};

const QUADRANT_TEXT = {
  Q1: '救火区',
  Q2: '成长区',
  Q3: '干扰区',
  Q4: '清理区',
} as const;

function asPatch(value: Partial<Omit<Task, 'id'>>): TaskLifecycleTaskPatch {
  return value as TaskLifecycleTaskPatch;
}

function completedGroup(task: Task, nowInput: string): string {
  const completed = Date.parse(task.completedAt ?? task.updatedAt);
  const now = Date.parse(nowInput);
  const today = new Date(now).toISOString().slice(0, 10);
  if (new Date(completed).toISOString().slice(0, 10) === today) return '今天';
  if (now - completed < 7 * 86_400_000) return '近 7 天';
  return '更早';
}

function Button(props: Readonly<{
  label: string;
  onPress(): void;
  disabled?: boolean;
  quiet?: boolean;
}>): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={[styles.button, props.quiet && styles.quietButton, props.disabled && styles.disabled]}>
      <Text style={[styles.buttonText, props.quiet && styles.quietButtonText]}>{props.label}</Text>
    </Pressable>
  );
}

export function TaskOrganizerSheet(props: Props): React.JSX.Element {
  const runtime = useTaskWorkspaceRuntime();
  const [mode, setMode] = React.useState(props.mode);
  const [title, setTitle] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');
  const [searchPage, setSearchPage] = React.useState(0);
  const [important, setImportant] = React.useState(false);
  const [urgent, setUrgent] = React.useState(false);
  const [triageTaskId, setTriageTaskId] = React.useState<string | null>(
    props.initialTaskId ?? null,
  );
  const [pending, setPending] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [undoArchivedTask, setUndoArchivedTask] = React.useState<Task | null>(null);
  const [focusSecondsByTask, setFocusSecondsByTask] = React.useState<Readonly<Record<string, number>>>({});
  const initialMetricRef = React.useRef(false);

  React.useEffect(() => {
    if (initialMetricRef.current) return;
    initialMetricRef.current = true;
    if (mode === 'capture') props.onMetric('quick_capture_started');
    if (mode === 'triage') props.onMetric('triage_started');
    if (mode === 'search') props.onMetric('search_opened');
  }, [mode, props]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setSearchPage(0);
    }, 150);
    return () => clearTimeout(timer);
  }, [query]);

  React.useEffect(() => {
    if (mode !== 'completed') return;
    let current = true;
    void props.history.listReceiptHistory().then(snapshot => {
      if (!current) return;
      const totals: Record<string, number> = {};
      for (const receipt of snapshot.receipts) {
        totals[receipt.taskId] = (totals[receipt.taskId] ?? 0) + receipt.actualSeconds;
      }
      setFocusSecondsByTask(totals);
    }).catch(() => undefined);
    return () => { current = false; };
  }, [mode, props.history]);

  if (runtime === null) return <></>;
  const allTasks = runtime.snapshot.tasks;
  const unsorted = allTasks
    .filter(task => task.deletedAt === null && isTaskUnsorted(task))
    .slice(0, 3);
  const currentUnsorted =
    unsorted.find(task => task.id === triageTaskId) ?? unsorted[0] ?? null;
  const search = searchTasksPage(allTasks, debouncedQuery, searchPage, 25);
  const results = search.items;
  const completed = allTasks
    .filter(task => task.deletedAt === null && task.status === 'completed')
    .sort((left, right) => (right.completedAt ?? '').localeCompare(left.completedAt ?? ''));
  const backlog = selectBacklogCandidates(
    allTasks,
    props.now,
    props.activeFocusTaskId,
  );
  const completedSections = (['今天', '近 7 天', '更早'] as const)
    .map(group => ({
      title: group,
      data: completed.filter(task => completedGroup(task, props.now) === group),
    }))
    .filter(section => section.data.length > 0);

  const run = (work: () => Promise<unknown>, success?: () => void): void => {
    setPending(true);
    setNotice(null);
    void work().then(() => success?.()).catch(() => {
      setNotice('操作没有保存，请重试。');
    }).finally(() => setPending(false));
  };

  const openTask = (task: Task): void => {
    props.onMetric('search_result_action', {status: isTaskArchived(task) ? 'ARCHIVED' : task.status});
    props.onOpenTask(task.id);
  };

  const capture = (): void => {
    const clean = title.trim();
    if (clean === '') {
      setNotice('写一句任务名称就可以保存。');
      return;
    }
    run(
      () => runtime.createTask({
        title: clean,
        description: '',
        important: false,
        urgent: false,
        placementState: 'UNSORTED',
      }),
      () => {
        props.onMetric('quick_capture_saved');
        props.onClose();
      },
    );
  };

  const classify = (): void => {
    if (currentUnsorted === null) return;
    run(
      () => runtime.updateTask(
        currentUnsorted.id,
        asPatch(classifyUnsortedTask(currentUnsorted, {important, urgent}, props.now)),
      ),
      () => {
        props.onMetric('triage_completed', {taskRef: currentUnsorted.id});
        setTriageTaskId(null);
        setImportant(false);
        setUrgent(false);
        setNotice('已放入四象限。');
      },
    );
  };

  const restoreCompleted = (task: Task): void => {
    run(() => runtime.restoreCompletedTask(task.id), () => {
      props.onMetric('search_result_action', {status: 'COMPLETED', action: 'restore'});
      setNotice('已恢复，原来的成长值不会重复增加。');
    });
  };

  const completeActive = (task: Task): void => {
    run(() => runtime.completeTask(task.id), () => {
      props.onMetric('search_result_action', {status: 'ACTIVE', action: 'complete'});
      setNotice('任务已完成。');
    });
  };

  const restoreArchived = (task: Task): void => {
    run(
      () => runtime.updateTask(task.id, asPatch(restoreArchivedTask(task, props.now))),
      () => {
        props.onMetric('search_result_action', {status: 'ARCHIVED', action: 'restore'});
        setNotice('已恢复到待判断。');
      },
    );
  };

  const archive = (task: Task): void => {
    run(
      () => runtime.updateTask(task.id, asPatch(archiveTask(task, 'NO_LONGER_NEEDED', props.now))),
      () => {
        props.onMetric('backlog_review_action', {action: 'archive', taskRef: task.id});
        setUndoArchivedTask(task);
        setNotice('已归档，不会增加成长值。');
      },
    );
  };

  const keep = (task: Task): void => {
    run(
      () => runtime.updateTask(task.id, {lastMeaningfulActivityAt: props.now}),
      () => {
        props.onMetric('backlog_review_action', {action: 'keep', taskRef: task.id});
        setNotice('已保留。');
      },
    );
  };

  return (
    <AppBottomSheet
      dirty={mode === 'capture' && title.trim() !== ''}
      dismissPolicy="confirmDirty"
      onDismissAttempt={() => {
        props.onClose();
        return true;
      }}
      title={MODE_TITLE[mode]}>
      <View style={styles.organizerBody}>
          <View style={styles.tabs}>
            {(['capture', 'search', 'triage', 'completed', 'backlog'] as const).map(item => (
              <Pressable key={item} onPress={() => setMode(item)} style={styles.tab}>
                <Text style={[styles.tabText, mode === item && styles.tabTextSelected]}>
                  {MODE_TITLE[item]}
                </Text>
              </Pressable>
            ))}
          </View>
          {notice === null ? null : <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
          {mode === 'completed' ? (
            <AppBottomSheetSectionList
              contentContainerStyle={styles.body}
              keyExtractor={task => task.id}
              ListEmptyComponent={<Text style={styles.empty}>还没有已完成任务。</Text>}
              renderSectionHeader={({section}) => (
                <Text style={styles.groupTitle}>{section.title}</Text>
              )}
              renderItem={({item: task}) => (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>{task.title}</Text>
                  <Text style={styles.meta}>
                    {task.completedAt ?? task.updatedAt} · {QUADRANT_TEXT[effectiveQuadrantForTask(task, props.now)]}
                  </Text>
                  <Text style={styles.meta}>
                    实际专注 {Math.round((focusSecondsByTask[task.id] ?? 0) / 60)} 分钟 · 完成任务 +{task.score ?? 0} 成长值
                  </Text>
                  <View style={styles.actions}>
                    <Button label="查看" onPress={() => openTask(task)} quiet />
                    <Button disabled={pending} label="恢复任务" onPress={() => restoreCompleted(task)} quiet />
                  </View>
                </View>
              )}
              sections={completedSections}
              stickySectionHeadersEnabled={false}
            />
          ) : (
          <AppBottomSheetScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {mode === 'capture' ? (
              <View style={styles.section}>
                <Text style={styles.hint}>只写一句也能保存，稍后再判断重要和紧急。</Text>
                <TextInput
                  accessibilityLabel="快速记录任务名称"
                  autoFocus
                  onChangeText={setTitle}
                  onSubmitEditing={capture}
                  placeholder="例如：给客户回复方案"
                  returnKeyType="done"
                  style={styles.input}
                  value={title}
                />
                <Button disabled={pending} label="保存到待判断" onPress={capture} />
              </View>
            ) : null}

            {mode === 'search' ? (
              <View style={styles.section}>
                <TextInput
                  accessibilityLabel="搜索任务"
                  autoFocus
                  onChangeText={setQuery}
                  placeholder="标题、第一步或备注"
                  style={styles.input}
                  value={query}
                />
                <Text style={styles.hint}>{query.trim() === '' ? '最近 5 项' : `找到 ${search.total} 项，已显示 ${results.length} 项`}</Text>
                {results.map(result => (
                  <View key={result.task.id} style={styles.card}>
                    <Text style={styles.cardTitle}>{result.task.title}</Text>
                    <Text style={styles.meta}>
                      {STATUS_TEXT[result.status]}
                      {result.status === 'ACTIVE'
                        ? ` · ${QUADRANT_TEXT[effectiveQuadrantForTask(result.task, props.now)]}`
                        : ''}
                    </Text>
                    <View style={styles.actions}>
                      {result.status === 'COMPLETED' ? (
                        <>
                          <Button label="查看" onPress={() => openTask(result.task)} quiet />
                          <Button disabled={pending} label="恢复" onPress={() => restoreCompleted(result.task)} quiet />
                        </>
                      ) : result.status === 'ARCHIVED' ? (
                        <Button disabled={pending} label="恢复到待判断" onPress={() => restoreArchived(result.task)} quiet />
                      ) : result.status === 'UNSORTED' ? (
                        <>
                          <Button label="判断" onPress={() => {
                            setTriageTaskId(result.task.id);
                            setMode('triage');
                          }} quiet />
                          <Button label="编辑" onPress={() => openTask(result.task)} quiet />
                        </>
                      ) : (
                        <>
                          <Button label="开始" onPress={() => {
                            props.onMetric('search_result_action', {status: 'ACTIVE', action: 'start'});
                            props.onStartTask(result.task.id);
                          }} quiet />
                          <Button label="编辑" onPress={() => openTask(result.task)} quiet />
                          <Button disabled={pending} label="完成" onPress={() => completeActive(result.task)} quiet />
                        </>
                      )}
                    </View>
                  </View>
                ))}
                {query.trim() !== '' && results.length === 0 ? (
                  <Button label="记下这个任务" onPress={() => {
                    setTitle(query.trim());
                    setMode('capture');
                  }} quiet />
                ) : null}
                {search.hasMore ? (
                  <Button label="加载更多搜索结果" onPress={() => setSearchPage(page => page + 1)} quiet />
                ) : null}
              </View>
            ) : null}

            {mode === 'triage' ? (
              <View style={styles.section}>
                {currentUnsorted === null ? (
                  <Text style={styles.empty}>待判断已经整理完了。</Text>
                ) : (
                  <View style={styles.card}>
                    <Text style={styles.meta}>本次最多 3 项 · 还剩 {unsorted.length}</Text>
                    <Text style={styles.cardTitle}>{currentUnsorted.title}</Text>
                    <Text style={styles.question}>这件事重要吗？</Text>
                    <View style={styles.actions}>
                      <Button label="重要" onPress={() => setImportant(true)} quiet={!important} />
                      <Button label="不重要" onPress={() => setImportant(false)} quiet={important} />
                    </View>
                    <Text style={styles.question}>需要尽快处理吗？</Text>
                    <View style={styles.actions}>
                      <Button label="紧急" onPress={() => setUrgent(true)} quiet={!urgent} />
                      <Button label="不紧急" onPress={() => setUrgent(false)} quiet={urgent} />
                    </View>
                    <Button disabled={pending} label="放入四象限" onPress={classify} />
                  </View>
                )}
              </View>
            ) : null}

            {mode === 'backlog' ? (
              <View style={styles.section}>
                <Text style={styles.hint}>只显示 14 天没有推进、且当前可处理的任务，最多 5 项。</Text>
                {backlog.map(task => (
                  <View key={task.id} style={styles.card}>
                    <Text style={styles.cardTitle}>{task.title}</Text>
                    <View style={styles.actions}>
                      <Button disabled={pending} label="保留" onPress={() => keep(task)} quiet />
                      <Button label="安排时间" onPress={() => props.onOpenTask(task.id)} quiet />
                      <Button label="缩小范围" onPress={() => props.onOpenTask(task.id)} quiet />
                      <Button disabled={pending} label="不再需要" onPress={() => archive(task)} quiet />
                    </View>
                  </View>
                ))}
                {backlog.length === 0 ? <Text style={styles.empty}>现在没有需要整理的积压任务。</Text> : null}
                {undoArchivedTask === null ? null : (
                  <Button
                    disabled={pending}
                    label="撤销刚才的归档"
                    onPress={() => run(
                      () => runtime.updateTask(
                        undoArchivedTask.id,
                        asPatch(restoreArchivedTask({...undoArchivedTask, archivedAt: props.now}, props.now)),
                      ),
                      () => {
                        setUndoArchivedTask(null);
                        setNotice('已撤销归档，任务回到待判断。');
                      },
                    )}
                    quiet
                  />
                )}
              </View>
            ) : null}
          </AppBottomSheetScrollView>
          )}
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  organizerBody: {minHeight: '60%'},
  tabs: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 12},
  tab: {backgroundColor: '#E2E8F0', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7},
  tabText: {color: '#475569', fontSize: 12},
  tabTextSelected: {color: '#1D4ED8', fontWeight: '800'},
  body: {padding: 20, paddingBottom: 40},
  section: {gap: 12},
  input: {backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', borderRadius: 14, borderWidth: 1, color: '#0F172A', fontSize: 16, padding: 14},
  button: {alignItems: 'center', backgroundColor: '#2563EB', borderRadius: 12, justifyContent: 'center', minHeight: 42, paddingHorizontal: 14, paddingVertical: 10},
  quietButton: {backgroundColor: '#DBEAFE'},
  disabled: {opacity: 0.45},
  buttonText: {color: '#FFFFFF', fontWeight: '700'},
  quietButtonText: {color: '#1D4ED8'},
  hint: {color: '#64748B', lineHeight: 20},
  notice: {backgroundColor: '#ECFDF5', color: '#166534', marginHorizontal: 20, marginTop: 12, padding: 10},
  card: {backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', borderRadius: 16, borderWidth: 1, gap: 9, padding: 14},
  cardTitle: {color: '#0F172A', fontSize: 16, fontWeight: '700'},
  meta: {color: '#64748B', fontSize: 12},
  question: {color: '#334155', fontWeight: '700', marginTop: 6},
  actions: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  groupTitle: {color: '#334155', fontSize: 15, fontWeight: '800', marginBottom: 8, marginTop: 12},
  empty: {color: '#64748B', paddingVertical: 28, textAlign: 'center'},
});
