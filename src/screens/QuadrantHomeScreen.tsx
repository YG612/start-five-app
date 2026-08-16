import React from 'react';
import {
  AccessibilityInfo,
  AppState,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import type {CoreAppService} from '../application/coreAppService';
import {postponeTaskTenMinutes} from '../application/reminderScheduling';
import type {
  DayClosureService,
  DayClosureSnapshot,
} from '../application/dayClosureService';
import type {LocalBackupService} from '../application/localBackupService';
import type {
  QuadrantHomePreferences,
  QuadrantHomeSettings,
  QuadrantHomeViewMode,
} from '../data/quadrantHomePreferences';
import {useAppFocusSessionRuntime} from '../app/focusSessionRuntime';
import {useTaskWorkspaceRuntime} from '../app/taskWorkspaceRuntime';
import type {Quadrant} from '../domain/quadrant';
import {
  flagsForQuadrant,
  projectTaskToQuadrantMap,
  quadrantForMapDrop,
  QUADRANT_HOME_META,
  QUADRANT_LIST_ORDER,
  QUADRANT_MAP_ROWS,
  QUADRANT_NODE_SLOTS,
  selectVisibleQuadrantTasks,
} from '../domain/quadrantHome';
import type {PlannedWorkSession, Task, TaskProgress} from '../domain/task';
import {DayClosureScreen} from './DayClosureScreen';
import {FocusHistoryScreen, type FocusHistoryQuery} from './FocusHistoryScreen';
import {LocalBackupScreen, type BackupFileBridge} from './LocalBackupScreen';
import type {
  LocalTriggerInput,
  TomorrowFirstNotifications,
  TomorrowFirstTap,
} from '../application/tomorrowFirstNotifications';
import type {
  TomorrowFirstReminderResult,
  TomorrowFirstReminderService,
} from '../application/tomorrowFirstNotifications';
import {
  AppBottomSheet,
  type SheetDismissReason,
} from '../components/AppBottomSheet';
import {
  APP_PAGE_TOKENS,
  EmptyState,
  HeroPanel,
  InlineNotice,
  MetricItem,
  PageHeader,
  SectionHeader,
  SettingsRow,
} from '../components/AppPage';
import {selectHomeContinuation} from '../domain/homeContinuation';
import {
  homePrimaryActionKey,
  selectHomePrimaryAction,
  type HomePrimaryAction,
} from '../domain/homePrimaryAction';
import {
  recordProductMetric,
  type ProductEventName,
  type ProductMetricClock,
  type ProductMetricPort,
} from '../application/productMetrics';
import {USER_COPY, userFacingError} from '../presentation/userCopy';
import {
  deriveQuadrantFromPriority,
  effectiveQuadrantForTask,
  effectiveUrgencyForTask,
  legacyPriorityCoordinates,
  priorityCoordinatesForTask,
  resolveMapNodeCollisions,
  scoresForMapDrop,
  isPointInsideMapBounds,
  TASK_PRIORITY_SCHEMA_VERSION,
  type RepeatRule,
  type TaskWithPriority,
  type UrgencyMode,
} from '../domain/taskPriority';
import {
  parseQuickTaskSentence,
  QUICK_TASK_WARNING_LENGTH,
} from '../domain/quickTaskParser';
import {copyTaskInput} from '../domain/taskRecurrence';
import {selectActionPointer} from '../domain/actionPointer';
import {
  activeLowEnergyMode,
  DEFAULT_LOW_ENERGY_MODE,
  enableLowEnergyMode,
  lowEnergyTaskCandidates,
} from '../domain/lowEnergyMode';
import {
  createStuckRepairRecord,
  createTaskRescuePlan,
  isTaskEligibleForRescue,
  postponePromptKey,
  shouldShowPostponeRepair,
  TASK_SUPPORT_SCHEMA_VERSION,
  type RepairAction,
  type StuckReason,
  type TaskWithSupport,
} from '../domain/taskSupport';
import {
  resolveNextStartShortcut,
  type NextStartShortcut,
} from '../application/nextStartScheduling';
import {
  FIRST_START_REWARD_POINTS,
  growthProgressForScore,
  growthRewardsForTask,
  recentGrowthRewards,
  type GrowthProgress,
  type TaskWithGrowth,
} from '../domain/growth';
import {
  selectGrowthInsight,
  type GrowthInsight,
} from '../domain/growthInsights';
import {
  isTaskInQuadrants,
  isTaskUnsorted,
  selectHomeVisibleTasks,
} from '../domain/taskOrganization';
import {
  TaskOrganizerSheet,
  type TaskOrganizerMode,
} from './TaskOrganizerSheet';
import {TaskProgressSheet, type P13TaskPatch} from './TaskProgressSheet';
import {
  bindPlannedWorkSessionFocus,
  cloneTaskStepTemplate,
  completeActiveTaskStep,
  settlePlannedWorkSession,
} from '../domain/taskExecutionPlan';
import {
  selectFocusDurationRecommendation,
  type FocusDurationRecommendation,
} from '../domain/focusDurationRecommendation';
import type {FocusSession} from '../domain/focusSession';
import {
  compactTaskLabelConfig,
  getCompactTaskLabel,
} from '../domain/taskDisplay';
import {
  formatAgendaTime,
  formatPageDate,
  selectFocusAgenda,
  selectGrowthPageSummary,
  selectTodayFocusAgenda,
} from '../domain/pageExperience';

type MainTab = 'quadrants' | 'focus' | 'growth' | 'mine';
type ViewMode = QuadrantHomeViewMode;
type DueShortcut = 'none' | 'today' | 'tomorrow';
type FocusContinuationContext = Readonly<{
  taskId: string;
  focusSessionId: string;
  plannedSessionId?: string;
}>;
type TaskPanelLayer = 'action' | 'details' | 'reschedule' | 'stuck' | 'rescue' | 'more';

const DarkThemeContext = React.createContext(false);

type QuadrantHomeScreenProps = Readonly<{
  service: CoreAppService;
  dayClosure: DayClosureService;
  reviewHistory: FocusHistoryQuery;
  focusHistory?: Readonly<{listHistory(): Promise<readonly FocusSession[]>}>;
  homeStartedAtMs: number;
  metricClock: ProductMetricClock;
  metricPort: ProductMetricPort;
  metricSessionId: string;
  now(): string;
  currentTimeZone?(): string;
  resolveLocalTrigger?(input: LocalTriggerInput): string;
  preferences: QuadrantHomePreferences;
  localBackup?: LocalBackupService;
  backupFileBridge?: BackupFileBridge;
  notifications?: TomorrowFirstNotifications;
  tomorrowFirstReminder?: TomorrowFirstReminderService;
  renderReviewSheet?(onReturned: () => void): React.ReactNode;
}>;

type StuckRepairSubmission = Readonly<{
  reason: StuckReason;
  action: RepairAction;
  firstStep: string | null;
  note: string | null;
  focusMinutes: 2 | 5 | null;
  nextStartShortcut?: NextStartShortcut;
}>;

type RescueSubmission = Readonly<{
  minimumDeliverable: string;
  nextRequiredStep: string;
  optionalScopeToDrop: string;
  focusMinutes: 5 | 15 | 25;
}>;

type TaskDraft = Readonly<{
  quickInput: string;
  title: string;
  firstStep: string;
  quadrant: Quadrant;
  due: DueShortcut;
  dueAt: string | null;
  estimatedMinutes: number | null;
  repeatRule: RepeatRule | null;
  confidence: number;
}>;

type CreateDraftContext = {
  draftId: string;
  sourceQuadrant: Quadrant | null;
  quadrantTouched: boolean;
  persistedTaskId: string | null;
};

type RewardFeedback = Readonly<{
  kicker: string;
  taskTitle: string;
  points: number;
  totalScore: number;
  reason: string;
}>;

type MoveUndo = Readonly<{
  taskId: string;
  taskTitle: string;
  from: Quadrant;
  to: Quadrant;
}>;

type CompletionUndo = Readonly<{
  taskId: string;
  taskTitle: string;
  points: number;
  previousStatus: 'pending' | 'in_progress';
}>;

type TaskWithProgress = Task & Readonly<{progress?: TaskProgress}>;

function progressForTask(task: Task): TaskProgress {
  const persisted = (task as TaskWithProgress).progress;
  return persisted ?? (task.status === 'in_progress' ? 25 : 0);
}

type SheetMetricRequest = Readonly<{
  name: 'task_sheet_open' | 'task_create_open';
  source: string;
  startedAtMs: number;
  taskRef?: string;
}>;

type MetricFields = Readonly<{
  source?: string;
  durationMs?: number;
  success?: boolean;
  errorCode?: string;
  taskRef?: string;
}>;

const EMPTY_DRAFT: TaskDraft = {
  quickInput: '',
  title: '',
  firstStep: '',
  quadrant: 'Q2',
  due: 'none',
  dueAt: null,
  estimatedMinutes: null,
  repeatRule: null,
  confidence: 0,
};

const TASK_PROGRESS_VALUES: readonly TaskProgress[] = [0, 25, 50, 75];

function dueAtForShortcut(shortcut: DueShortcut, now: string): string | null {
  if (shortcut === 'none') {
    return null;
  }
  const date = new Date(now);
  if (shortcut === 'tomorrow') {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  date.setUTCHours(23, 59, 59, 999);
  return date.toISOString();
}

function shortcutForDueAt(dueAt: string | null, now: string): DueShortcut {
  if (dueAt === null) {
    return 'none';
  }
  const today = now.slice(0, 10);
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (dueAt.slice(0, 10) === today) {
    return 'today';
  }
  if (dueAt.slice(0, 10) === tomorrow.toISOString().slice(0, 10)) {
    return 'tomorrow';
  }
  return 'none';
}

function formatRemaining(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function dueLabel(dueAt: string | null): string {
  return dueAt === null ? '未设置截止时间' : `截止 ${dueAt.slice(0, 10)}`;
}

function Action(props: Readonly<{
  label: string;
  displayLabel?: string;
  onPress(): void | Promise<void>;
  disabled?: boolean;
  secondary?: boolean;
  compact?: boolean;
}>): React.JSX.Element {
  const dark = React.useContext(DarkThemeContext);
  return (
    <Pressable
      accessibilityLabel={props.label}
      accessibilityRole="button"
      accessibilityState={{disabled: props.disabled === true}}
      disabled={props.disabled}
      onPress={props.onPress}
      style={[
        styles.action,
        props.secondary === true && styles.actionSecondary,
        props.secondary === true && dark && styles.actionSecondaryDark,
        props.compact === true && styles.actionCompact,
        props.disabled === true && styles.disabled,
      ]}>
      <Text
        style={[
          styles.actionText,
          props.secondary === true && styles.actionSecondaryText,
          props.secondary === true && dark && styles.textDark,
        ]}>
        {props.displayLabel ?? props.label}
      </Text>
    </Pressable>
  );
}

function SegmentedButton(props: Readonly<{
  label: string;
  selected: boolean;
  onPress(): void;
}>): React.JSX.Element {
  const dark = React.useContext(DarkThemeContext);
  return (
    <Pressable
      accessibilityLabel={props.label}
      accessibilityRole="tab"
      accessibilityState={{selected: props.selected}}
      onPress={props.onPress}
      style={[
        styles.segment,
        dark && styles.segmentDark,
        props.selected && styles.segmentSelected,
        props.selected && dark && styles.segmentSelectedDark,
      ]}>
      <Text style={[
        styles.segmentText,
        dark && styles.textMutedDark,
        props.selected && styles.segmentTextSelected,
        props.selected && dark && styles.textDark,
      ]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

function GrowthPlant(props: Readonly<{
  progress: GrowthProgress;
}>): React.JSX.Element {
  const rank: Readonly<Record<GrowthProgress['stage']['id'], number>> = {
    seed: 0,
    sprout: 1,
    two_leaves: 2,
    seedling: 3,
    branch: 4,
    bloom: 5,
  };
  const current = rank[props.progress.stage.id];
  return (
    <View
      accessibilityLabel={`成长阶段：${props.progress.stage.title}`}
      style={styles.growthPlant}>
      {current === 0 ? <View style={styles.growthSeed} /> : (
        <>
          <View style={[styles.growthStem, current >= 4 && styles.growthStemTall]} />
          <View style={[styles.growthLeaf, styles.growthLeafLeft]} />
          {current >= 2 ? <View style={[styles.growthLeaf, styles.growthLeafRight]} /> : null}
          {current >= 3 ? <View style={[styles.growthLeaf, styles.growthLeafUpper]} /> : null}
          {current >= 4 ? <View style={[styles.growthLeaf, styles.growthLeafBranch]} /> : null}
          {current >= 5 ? <View style={styles.growthFlower}><View style={styles.growthFlowerCore} /></View> : null}
        </>
      )}
      <View style={styles.growthPot} />
    </View>
  );
}

function TaskStatus(props: Readonly<{task: Task}>): React.JSX.Element {
  const dark = React.useContext(DarkThemeContext);
  return (
    <Text style={[styles.taskMeta, dark && styles.textMutedDark]}>
      {props.task.status === 'in_progress' ? '进行中' : '待开始'}
      {props.task.firstStep == null || props.task.firstStep.trim() === ''
        ? ''
        : ` · 第一小步：${props.task.firstStep}`}
    </Text>
  );
}

function MapTaskNode(props: Readonly<{
  disabled: boolean;
  task: Task;
  recommended: boolean;
  reduceMotion: boolean;
  selected: boolean;
  largeText: boolean;
  quadrantTaskCount: number;
  slot: number;
  nowInput: string;
  onPress(): void;
  onDragMove(x: number, y: number): void;
  onDragEnd(): void;
  onDrop(x: number, y: number): void;
}>): React.JSX.Element {
  const dark = React.useContext(DarkThemeContext);
  const touchStartedAt = React.useRef(0);
  const didDragRef = React.useRef(false);
  const [dragging, setDragging] = React.useState(false);
  const [dragOffset, setDragOffset] = React.useState({x: 0, y: 0});
  const panResponder = React.useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_event, gesture) =>
        !props.disabled &&
        Date.now() - touchStartedAt.current >= 320 &&
        Math.abs(gesture.dx) + Math.abs(gesture.dy) >= 8,
      onPanResponderGrant: () => {
        didDragRef.current = true;
        setDragging(true);
      },
      onPanResponderMove: (_event, gesture) => {
        setDragOffset({x: gesture.dx, y: gesture.dy});
        props.onDragMove(gesture.moveX, gesture.moveY);
      },
      onPanResponderRelease: (_event, gesture) => {
        props.onDrop(gesture.moveX, gesture.moveY);
        setDragging(false);
        setDragOffset({x: 0, y: 0});
      },
      onPanResponderTerminate: () => {
        props.onDragEnd();
        setDragging(false);
        setDragOffset({x: 0, y: 0});
      },
      onPanResponderTerminationRequest: () => false,
    }),
    [props.disabled, props.onDragEnd, props.onDragMove, props.onDrop],
  );
  const point = projectTaskToQuadrantMap(props.task, props.nowInput);
  const meta = QUADRANT_HOME_META[point.quadrant];
  const fallbackSlot = QUADRANT_NODE_SLOTS[props.slot] ?? QUADRANT_NODE_SLOTS[0];
  const collisionPoint = resolveMapNodeCollisions([{
    taskId: props.task.id,
    xPercent: point.xPercent,
    yPercent: point.yPercent,
  }])[0];
  const localX = point.quadrant === 'Q1' || point.quadrant === 'Q2'
    ? ((collisionPoint?.xPercent ?? point.xPercent) - 50) * 2
    : (collisionPoint?.xPercent ?? point.xPercent) * 2;
  const localY = point.quadrant === 'Q1' || point.quadrant === 'Q3'
    ? (collisionPoint?.yPercent ?? point.yPercent) * 2
    : ((collisionPoint?.yPercent ?? point.yPercent) - 50) * 2;
  const nodeLeft = Math.min(62, Math.max(4, localX));
  const nodeTop = Math.min(76, Math.max(22, localY));
  const dueLabel = props.task.dueAt === null
    ? '无截止时间'
    : `截止 ${props.task.dueAt.slice(0, 16).replace('T', ' ')}`;
  const firstStepLabel = props.task.firstStep == null || props.task.firstStep.trim() === ''
    ? '未填写第一小步'
    : `当前第一小步 ${props.task.firstStep}`;
  return (
    <Pressable
      accessibilityLabel={`${meta.title}任务：${props.task.title}`}
      accessibilityValue={{
        text: `${props.task.title}，${meta.title}，${dueLabel}，${firstStepLabel}，进度 ${point.progress}%`,
      }}
      accessibilityHint="双击打开；长按约 0.3 秒后可直接拖到其他象限"
      accessibilityRole="button"
      accessibilityState={{disabled: props.disabled, selected: props.selected}}
      disabled={props.disabled}
      onPress={() => {
        if (!didDragRef.current) {
          props.onPress();
        }
      }}
      onTouchStart={() => {
        touchStartedAt.current = Date.now();
        didDragRef.current = false;
      }}
      {...panResponder.panHandlers}
      style={[
        styles.mapNode,
        dark && styles.surfaceDark,
        {
          borderColor: meta.accent,
          borderWidth: Math.max(1, Math.round(point.progress / 25)),
          left: `${Number.isFinite(nodeLeft) ? nodeLeft : fallbackSlot?.left ?? 7}%`,
          top: `${Number.isFinite(nodeTop) ? nodeTop : fallbackSlot?.top ?? 23}%`,
        },
        point.estimatedSize === 'small' && styles.mapNodeSmall,
        point.estimatedSize === 'large' && styles.mapNodeLarge,
        point.hasDeadline && styles.mapNodeDeadline,
        props.recommended && styles.mapNodeRecommended,
        props.selected && styles.mapNodeSelected,
        dragging && {
          elevation: 14,
          opacity: 0.96,
          transform: [
            {translateX: dragOffset.x},
            {translateY: dragOffset.y},
            {scale: props.reduceMotion ? 1 : 1.06},
          ],
          zIndex: 15,
        },
      ]}>
      <View style={[styles.nodeDot, {backgroundColor: point.hasDeadline ? '#D97706' : meta.accent}]} />
      <Text
        numberOfLines={compactTaskLabelConfig(
          props.quadrantTaskCount,
          props.selected || props.recommended,
        ).numberOfLines}
        style={[
          styles.nodeTitle,
          dark && styles.textDark,
          {maxWidth: compactTaskLabelConfig(
            props.quadrantTaskCount,
            props.selected || props.recommended,
          ).maxWidth},
        ]}>
        {getCompactTaskLabel(
          props.task.title,
          props.largeText
            ? 14
            : compactTaskLabelConfig(
                props.quadrantTaskCount,
                props.selected || props.recommended,
              ).maxEquivalentChars,
        )}
      </Text>
      {dragging ? (
        <Text numberOfLines={2} style={[styles.dragCallout, dark && styles.textDark]}>
          {props.task.title}
        </Text>
      ) : null}
      {point.hasDeadline ? <Text style={styles.deadlineClock}>◷</Text> : null}
    </Pressable>
  );
}

function MapView(props: Readonly<{
  actionPending: boolean;
  tasks: readonly Task[];
  recommendedId: string | null;
  reduceMotion: boolean;
  largeText: boolean;
  selectedId: string | null;
  nowInput: string;
  onAdd(quadrant: Quadrant): void;
  onTask(taskId: string): void;
  onTaskDrop(
    taskId: string,
    scores: Readonly<{importanceScore: number; manualUrgencyScore: number}>,
  ): void;
  onShowList(quadrant: Quadrant): void;
}>): React.JSX.Element {
  const dark = React.useContext(DarkThemeContext);
  const gridRef = React.useRef<React.ElementRef<typeof View>>(null);
  const gridBoundsRef = React.useRef<Readonly<{
    left: number;
    top: number;
    width: number;
    height: number;
  }> | null>(null);
  const [dragTarget, setDragTarget] = React.useState<Quadrant | null>(null);

  function measureGrid(): void {
    gridRef.current?.measureInWindow((left, top, width, height) => {
      gridBoundsRef.current = {left, top, width, height};
    });
  }

  function moveDragTarget(x: number, y: number): void {
    const bounds = gridBoundsRef.current;
    if (bounds === null || bounds.width <= 0 || bounds.height <= 0) {
      measureGrid();
      return;
    }
    setDragTarget(quadrantForMapDrop(x, y, bounds));
  }

  function dropTask(taskId: string, x: number, y: number): void {
    const bounds = gridBoundsRef.current;
    setDragTarget(null);
    if (bounds !== null && isPointInsideMapBounds(x, y, bounds)) {
      props.onTaskDrop(taskId, scoresForMapDrop(x, y, bounds));
      return;
    }
    if (bounds !== null) return;
    gridRef.current?.measureInWindow((left, top, width, height) => {
      if (!isPointInsideMapBounds(x, y, {left, top, width, height})) return;
      props.onTaskDrop(
        taskId,
        scoresForMapDrop(x, y, {left, top, width, height}),
      );
    });
  }

  return (
    <View accessibilityLabel="四象限任务地图" style={styles.mapShell}>
      <Text style={[styles.urgencyAxis, dark && styles.textMutedDark]}>紧急程度 ↑</Text>
      <View onLayout={measureGrid} ref={gridRef} style={styles.mapGrid}>
        {QUADRANT_MAP_ROWS.map((row, rowIndex) => (
          <View key={`row-${rowIndex}`} style={styles.mapRow}>
            {row.map(quadrant => {
              const meta = QUADRANT_HOME_META[quadrant];
              const tasks = props.tasks.filter(
                task =>
                  projectTaskToQuadrantMap(task, props.nowInput).quadrant === quadrant,
              );
              const visible = selectVisibleQuadrantTasks(
                tasks,
                props.selectedId,
                props.recommendedId,
              );
              return (
                <Pressable
                  accessibilityLabel={`在${meta.title}添加任务`}
                  accessibilityRole="button"
                  key={quadrant}
                  onPress={() => props.onAdd(quadrant)}
                  style={[
                    styles.mapCell,
                    {backgroundColor: dark ? '#18312C' : meta.tint},
                    dark && styles.borderDark,
                    dragTarget === quadrant && styles.mapCellDragTarget,
                  ]}>
                  <View pointerEvents="none" style={styles.cellHeading}>
                    <Text style={[styles.cellTitle, {color: meta.accent}]}>
                      {meta.title} · {tasks.length}
                    </Text>
                    <Text style={[styles.cellDescription, dark && styles.textMutedDark]}>{meta.description}</Text>
                  </View>
                  {visible.map((task, index) => (
                    <MapTaskNode
                      disabled={props.actionPending}
                      key={task.id}
                      onDragEnd={() => setDragTarget(null)}
                      onDragMove={moveDragTarget}
                      onDrop={(x, y) => dropTask(task.id, x, y)}
                      quadrantTaskCount={tasks.length}
                      nowInput={props.nowInput}
                      onPress={() => props.onTask(task.id)}
                      recommended={props.recommendedId === task.id}
                      reduceMotion={props.reduceMotion}
                      largeText={props.largeText}
                      selected={props.selectedId === task.id}
                      slot={index}
                      task={task}
                    />
                  ))}
                  {tasks.length > visible.length ? (
                    <Pressable
                      accessibilityLabel={`查看${meta.title}其余${tasks.length - visible.length}项任务`}
                      accessibilityRole="button"
                      onPress={() => props.onShowList(quadrant)}
                      style={[styles.overflowBadge, dark && styles.surfaceDark]}>
                      <Text style={[styles.overflowText, dark && styles.textDark]}>+{tasks.length - visible.length} 项</Text>
                    </Pressable>
                  ) : null}
                  {tasks.length === 0 ? (
                    <Text pointerEvents="none" style={[styles.emptyCell, dark && styles.textMutedDark]}>点这里添加</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      {dragTarget === null ? null : (
        <Text accessibilityLiveRegion="polite" style={[styles.dragTargetText, dark && styles.textDark]}>
          松手移到：{QUADRANT_HOME_META[dragTarget].title}
        </Text>
      )}
      <Text style={[styles.importanceAxis, dark && styles.textMutedDark]}>重要程度 →</Text>
    </View>
  );
}

function ListView(props: Readonly<{
  tasks: readonly Task[];
  nowInput: string;
  recommendedId: string | null;
  defaultFocusMinutes: 2 | 5 | 15 | 25 | 45;
  onAdd(quadrant: Quadrant): void;
  onStart(task: Task): void;
  onTask(taskId: string): void;
}>): React.JSX.Element {
  const dark = React.useContext(DarkThemeContext);
  return (
    <View style={styles.listStack}>
      {QUADRANT_LIST_ORDER.map(quadrant => {
        const meta = QUADRANT_HOME_META[quadrant];
        const tasks = props.tasks.filter(
          task => effectiveQuadrantForTask(task, props.nowInput) === quadrant,
        );
        return (
          <View key={quadrant} style={[styles.listSection, dark && styles.surfaceDark]}>
            <View style={styles.sectionHeadingRow}>
              <View style={styles.sectionHeadingText}>
                <Text style={[styles.sectionTitle, {color: meta.accent}]}>
                  {meta.title} · {tasks.length}
                </Text>
                <Text style={[styles.cellDescription, dark && styles.textMutedDark]}>{meta.description}</Text>
              </View>
              <Action
                compact
                displayLabel="添加"
                label={`在${meta.title}添加任务`}
                onPress={() => props.onAdd(quadrant)}
                secondary
              />
            </View>
            {tasks.map(task => (
              <View key={task.id} style={[styles.taskRow, dark && styles.borderDark]}>
                <Pressable
                  accessibilityLabel={`${meta.title}任务：${task.title}`}
                  accessibilityRole="button"
                  onPress={() => props.onTask(task.id)}
                  style={styles.taskRowMain}>
                  <Text style={[styles.taskTitle, dark && styles.textDark]}>
                    {props.recommendedId === task.id ? '★ ' : ''}{task.title}
                  </Text>
                  <TaskStatus task={task} />
                </Pressable>
                <Action
                  compact
                  displayLabel={`${props.defaultFocusMinutes} 分钟`}
                  label={`开始任务${props.defaultFocusMinutes}分钟：${task.title}`}
                  onPress={() => props.onStart(task)}
                />
              </View>
            ))}
            {tasks.length === 0 ? (
              <Text style={[styles.emptySection, dark && styles.textMutedDark]}>这里还没有任务</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function TaskEditor(props: Readonly<{
  mode: 'create' | 'edit';
  initialLayer?: TaskPanelLayer;
  draft: TaskDraft;
  task: Task | null;
  pending: boolean;
  error: string | null;
  nowInput: string;
  onChange(draft: TaskDraft): void;
  onDismissAttempt(reason: SheetDismissReason, dirty: boolean): Promise<boolean>;
  onQuadrantTouched(): void;
  onComplete(): void;
  onFirstStepComplete(nextStep?: string | null): void;
  onFirstStepUndo(): void;
  onDelete(): void;
  onMove(quadrant: Quadrant): void;
  onCopy(): void;
  onProgress(progress: TaskProgress): void;
  onReschedule(shortcut: NextStartShortcut, customAt?: string): void;
  onRescue(plan: RescueSubmission): void;
  onRescueDismiss(): void;
  onSave(intent?: 'explicit' | 'dismiss'): Promise<boolean>;
  onStart(): void;
  onStopRepeat(): void;
  onStuckOpen(): void;
  onStuckRepair(submission: StuckRepairSubmission): void;
  onPostponePromptSeen(): void;
  onShrinkStep(): void;
  onAbandon(): void;
  onLongTermPlan(): void;
  rescuePromptVisible: boolean;
  postponeRepairVisible: boolean;
  defaultFocusMinutes: 2 | 5 | 15 | 25 | 45;
  reduceMotion: boolean;
  onUrgencyMode(mode: UrgencyMode): void;
}>): React.JSX.Element {
  const dark = React.useContext(DarkThemeContext);
  const [layer, setLayer] = React.useState<TaskPanelLayer>(
    props.initialLayer ?? (props.mode === 'create' ? 'details' : 'action'),
  );
  const [deleteConfirmation, setDeleteConfirmation] = React.useState(false);
  const [draftDirty, setDraftDirty] = React.useState(false);
  const [stuckReason, setStuckReason] = React.useState<StuckReason | null>(null);
  const [stuckPrimary, setStuckPrimary] = React.useState('');
  const [stuckSecondary, setStuckSecondary] = React.useState('');
  const [stuckStep, setStuckStep] = React.useState('');
  const [customStartAt, setCustomStartAt] = React.useState('');
  const [rescueMinimum, setRescueMinimum] = React.useState('');
  const [rescueStep, setRescueStep] = React.useState('');
  const [rescueDrop, setRescueDrop] = React.useState('');
  const [rescueMinutes, setRescueMinutes] = React.useState<5 | 15 | 25>(5);
  const [nextStepAfterCompletion, setNextStepAfterCompletion] = React.useState('');
  const [rescuePromptDismissed, setRescuePromptDismissed] = React.useState(false);
  const [postponeRepairVisible] = React.useState(props.postponeRepairVisible);
  const postponeSeenRef = React.useRef(false);
  React.useEffect(() => {
    if (postponeRepairVisible && !postponeSeenRef.current) {
      postponeSeenRef.current = true;
      props.onPostponePromptSeen();
    }
  }, [postponeRepairVisible, props.onPostponePromptSeen]);

  function changeDraft(next: TaskDraft): void {
    setDraftDirty(true);
    props.onChange(next);
  }

  function requestClose(reason: SheetDismissReason): Promise<boolean> {
    if (props.mode === 'edit' && layer !== 'action' && layer !== 'details') {
      setLayer('action');
      return Promise.resolve(false);
    }
    return props.onDismissAttempt(reason, draftDirty);
  }

  const quadrant = QUADRANT_HOME_META[props.draft.quadrant];
  const taskProgress = props.task === null ? 0 : progressForTask(props.task);
  const taskPriority = props.task === null ? null : priorityCoordinatesForTask(props.task);
  const sheetTitle = props.mode === 'create'
    ? '快速添加任务'
    : layer === 'action'
      ? props.task?.title ?? '快速编辑任务'
      : layer === 'details'
        ? '编辑更多'
        : layer === 'reschedule'
          ? '重新安排'
          : layer === 'stuck'
            ? '需要帮助'
            : layer === 'more'
              ? '更多操作'
              : '先做能交的版本';
  const sheetSubtitle = props.mode === 'create'
    ? '先写下任务，其他信息可以稍后补'
    : layer === 'action'
      ? `${quadrant.title} · ${props.task === null ? '未设置截止时间' : dueLabel(props.task.dueAt)}`
      : layer === 'details'
        ? '修改任务内容和所在象限'
        : layer === 'reschedule'
          ? '选择下一次开始时间，不修改最终截止日期'
          : layer === 'stuck'
            ? '选择现在最需要的帮助'
            : layer === 'more'
              ? '低频操作集中在这里'
              : '四个字段内确定最低版本，然后直接开始';
  return (
    <AppBottomSheet
      dark={dark}
      footer={
        layer === 'action' || layer === 'details' ? (
          <View style={styles.stickyActions}>
            {layer === 'details' ? (
              <Action
                disabled={props.pending || props.draft.title.trim() === ''}
                label={props.mode === 'create' ? '添加任务' : '保存修改'}
                onPress={() => void props.onSave('explicit')}
              />
            ) : null}
            {props.mode === 'edit' && layer === 'details' ? (
              <Action label="返回常用操作" onPress={() => setLayer('action')} secondary />
            ) : null}
            {props.mode === 'edit' && layer === 'action' ? (
              <>
                <Action label="编辑更多" onPress={() => setLayer('details')} secondary />
                <Action disabled={props.pending} label={`先做 ${props.defaultFocusMinutes} 分钟`} onPress={props.onStart} />
              </>
            ) : null}
          </View>
        ) : undefined
      }
      onDismissAttempt={requestClose}
      reduceMotion={props.reduceMotion}
      subtitle={sheetSubtitle}
      title={sheetTitle}>
        <ScrollView
          contentContainerStyle={styles.sheetScroll}
          keyboardShouldPersistTaps="handled">
        {props.mode === 'edit' && layer === 'action' && props.task !== null ? (
          <View style={styles.actionLayer}>
            <Text numberOfLines={2} style={[styles.actionTaskTitle, dark && styles.textDark]}>
              {props.task.title}
            </Text>
            <Text style={[styles.actionTaskMeta, dark && styles.textMutedDark]}>
              {quadrant.title} · {dueLabel(props.task.dueAt)}
            </Text>
            <View style={[styles.firstStepCard, dark && styles.surfaceRaisedDark]}>
              <Text style={[styles.fieldLabel, dark && styles.textDark]}>
                {props.task.firstStep == null || props.task.firstStep.trim() === ''
                  ? '这 5 分钟先做什么？'
                  : '第一小步'}
              </Text>
              {props.task.firstStep == null || props.task.firstStep.trim() === '' ? (
                <>
                  <TextInput
                    accessibilityLabel="第一小步"
                    onChangeText={firstStep => changeDraft({...props.draft, firstStep})}
                    placeholder="写下一个能立刻开始的小动作"
                    placeholderTextColor="#74827F"
                    style={[styles.input, dark && styles.inputDark]}
                    value={props.draft.firstStep}
                  />
                  <Action
                    disabled={props.pending || props.draft.firstStep.trim() === ''}
                    label="添加第一小步"
                    onPress={() => void props.onSave('explicit')}
                    secondary
                  />
                </>
              ) : (
                <Text numberOfLines={2} style={[styles.firstStepText, dark && styles.textDark]}>
                  {props.task.firstStep}
                </Text>
              )}
              {props.task.firstStep != null &&
              props.task.firstStep.trim() !== '' &&
              (props.task as TaskWithGrowth).firstStepCompletion == null ? (
                <>
                  <TextInput
                    accessibilityLabel="完成后下一步"
                    onChangeText={setNextStepAfterCompletion}
                    placeholder="完成后要接着做什么（可选）"
                    placeholderTextColor="#74827F"
                    style={[styles.input, dark && styles.inputDark]}
                    value={nextStepAfterCompletion}
                  />
                  <Action
                    disabled={
                      props.pending ||
                      props.task.firstStep == null ||
                      props.task.firstStep.trim() === ''
                    }
                    label="完成这一步"
                    onPress={() => props.onFirstStepComplete(
                      nextStepAfterCompletion.trim() || null,
                    )}
                    secondary
                  />
                </>
              ) : (props.task as TaskWithGrowth).firstStepCompletion == null ? null : (
                <View style={styles.segmentedRow}>
                  <Text style={[styles.sheetSubtitle, dark && styles.textMutedDark]}>
                    已记录第一小步完成，整项任务仍保持进行中。
                  </Text>
                  <Action
                    compact
                    disabled={props.pending}
                    label="撤销第一小步完成"
                    onPress={props.onFirstStepUndo}
                    secondary
                  />
                </View>
              )}
            </View>
            {props.task.completionDefinition == null ? null : (
              <View style={[styles.firstStepCard, dark && styles.surfaceRaisedDark]}>
                <Text style={[styles.fieldLabel, dark && styles.textDark]}>做到这里就算完成</Text>
                <Text numberOfLines={1} style={[styles.firstStepText, dark && styles.textDark]}>
                  {props.task.completionDefinition}
                </Text>
              </View>
            )}
            <View style={styles.progressSummary}>
              <Text style={[styles.fieldLabel, dark && styles.textDark]}>当前进度 {taskProgress}%</Text>
              <View style={styles.progressChoices}>
                {TASK_PROGRESS_VALUES.map(progress => (
                  <Pressable
                    accessibilityLabel={`更新进度为 ${progress}%`}
                    accessibilityRole="radio"
                    accessibilityState={{selected: taskProgress === progress}}
                    disabled={props.pending}
                    key={progress}
                    onPress={() => props.onProgress(progress)}
                    style={[
                      styles.progressChoice,
                      dark && styles.surfaceRaisedDark,
                      taskProgress === progress && styles.progressChoiceSelected,
                      props.pending && styles.disabled,
                    ]}>
                    <Text style={[
                      styles.progressChoiceText,
                      dark && styles.textDark,
                      taskProgress === progress && styles.progressChoiceTextSelected,
                    ]}>{progress}%</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            {props.rescuePromptVisible && !rescuePromptDismissed ? (
              <View style={[styles.firstStepCard, dark && styles.surfaceRaisedDark]}>
                <Text style={[styles.fieldLabel, dark && styles.textDark]}>
                  时间比较紧，要不要先做能交的版本？
                </Text>
                <View style={styles.segmentedRow}>
                  <Action label="制定最低版本" onPress={() => setLayer('rescue')} compact />
                  <Action
                    label="暂时不用"
                    onPress={() => {
                      setRescuePromptDismissed(true);
                      props.onRescueDismiss();
                    }}
                    compact
                    secondary
                  />
                </View>
              </View>
            ) : null}
            {postponeRepairVisible ? (
              <View style={[styles.firstStepCard, dark && styles.surfaceRaisedDark]}>
                <Text style={[styles.fieldLabel, dark && styles.textDark]}>
                  这项任务已经重新安排了几次，要不要把下一步再缩小一点？
                </Text>
                <Action label="缩小到 5 分钟" onPress={props.onShrinkStep} secondary />
                <Action label="降低完成标准" onPress={() => setLayer('rescue')} secondary />
                <Action label="确认不再需要" onPress={props.onAbandon} secondary />
              </View>
            ) : null}
            <View style={styles.quickActionGrid}>
              <Action disabled={props.pending} label="完成任务" onPress={props.onComplete} secondary />
              <Action
                disabled={props.pending}
                label="重新安排"
                onPress={() => setLayer('reschedule')}
                secondary
              />
              <Action
                disabled={props.pending}
                label="需要帮助"
                onPress={() => {
                  props.onStuckOpen();
                  setLayer('stuck');
                }}
                secondary
              />
              <Action
                disabled={props.pending}
                label="更多"
                onPress={() => setLayer('more')}
                secondary
              />
            </View>
          </View>
        ) : null}

        {props.mode === 'edit' && layer === 'more' && props.task !== null ? (
          <View style={styles.actionLayer}>
            <Action disabled={props.pending} label="复制任务" onPress={props.onCopy} secondary />
            <Action disabled={props.pending} label="长期任务计划" onPress={props.onLongTermPlan} secondary />
            {(props.task as TaskWithPriority).repeatRule == null ? null : (
              <Action disabled={props.pending} label="停止重复" onPress={props.onStopRepeat} secondary />
            )}
            <Text style={[styles.fieldLabel, dark && styles.textDark]}>移动到其他象限</Text>
            <View style={styles.choiceGrid}>
              {QUADRANT_LIST_ORDER.map(target => (
                <Action
                  compact
                  disabled={props.pending || props.draft.quadrant === target}
                  key={target}
                  label={`移动到${QUADRANT_HOME_META[target].title}`}
                  onPress={() => props.onMove(target)}
                  secondary
                />
              ))}
            </View>
            <Action label="编辑详细信息" onPress={() => setLayer('details')} secondary />
            {!deleteConfirmation ? (
              <Action disabled={props.pending} label="删除任务" onPress={() => setDeleteConfirmation(true)} secondary />
            ) : (
              <View style={styles.deleteConfirmation}>
                <Text accessibilityLiveRegion="polite" style={[styles.error, dark && styles.textDark]}>
                  删除后任务将从四象限移除，确定继续吗？
                </Text>
                <View style={styles.segmentedRow}>
                  <Action label="取消删除" onPress={() => setDeleteConfirmation(false)} secondary />
                  <Action disabled={props.pending} label="确认删除" onPress={props.onDelete} />
                </View>
              </View>
            )}
            <Action label="返回常用操作" onPress={() => setLayer('action')} secondary />
          </View>
        ) : null}

        {props.mode === 'edit' && layer === 'reschedule' ? (
          <View style={styles.actionLayer}>
            <Text style={[styles.fieldLabel, dark && styles.textDark]}>下一次什么时候开始</Text>
            <Text style={[styles.sheetSubtitle, dark && styles.textMutedDark]}>
              最终截止日期保持不变；开始提醒会在保存后重新检查。
            </Text>
            <View style={styles.choiceGrid}>
              {([
                ['ten_minutes', '10 分钟后'],
                ['later_today', '今天晚些时候'],
                ['tomorrow', '明天'],
                ['this_week', '本周'],
              ] as const).map(([shortcut, label]) => (
                <SegmentedButton
                  key={shortcut}
                  label={label}
                  onPress={() => props.onReschedule(shortcut)}
                  selected={false}
                />
              ))}
            </View>
            <TextInput
              accessibilityLabel="自定义下一次开始时间"
              onChangeText={setCustomStartAt}
              placeholder="例如 2026-08-16T09:00:00+08:00"
              placeholderTextColor="#74827F"
              style={[styles.input, dark && styles.inputDark]}
              value={customStartAt}
            />
            <Action
              disabled={customStartAt.trim() === '' || props.pending}
              label="保存自定义开始时间"
              onPress={() => props.onReschedule('custom', customStartAt)}
              secondary
            />
            <Action label="返回常用操作" onPress={() => setLayer('action')} secondary />
          </View>
        ) : null}

        {props.mode === 'edit' && layer === 'stuck' ? (
          <View style={styles.actionLayer}>
            <Text style={[styles.firstStepText, dark && styles.textDark]}>
              答案只保存在这台设备上；这里用于降低开始压力，不做医疗诊断。
            </Text>
            {stuckReason === null ? (
              <>
                {([
                  ['TOO_LARGE', '任务太大'],
                  ['DONT_KNOW_HOW', '不知道怎么开始'],
                  ['FEAR_OF_POOR_RESULT', '担心做不好'],
                  ['LOW_ENERGY', '现在太累'],
                  ['OTHER', '其他情况'],
                ] as const).map(([reason, label]) => (
                  <Action key={reason} label={label} onPress={() => setStuckReason(reason)} secondary />
                ))}
              </>
            ) : null}
            {stuckReason === 'TOO_LARGE' ? (
              <>
                <TextInput
                  accessibilityLabel="2到10分钟动作"
                  onChangeText={setStuckStep}
                  placeholder="写下 2-10 分钟能完成的动作"
                  placeholderTextColor="#74827F"
                  style={[styles.input, dark && styles.inputDark]}
                  value={stuckStep}
                />
                <Action
                  disabled={stuckStep.trim() === '' || props.pending}
                  label="保存并先做5分钟"
                  onPress={() => props.onStuckRepair({
                    reason: stuckReason,
                    action: 'SET_SMALLER_FIRST_STEP',
                    firstStep: stuckStep,
                    note: null,
                    focusMinutes: 5,
                  })}
                />
              </>
            ) : null}
            {stuckReason === 'DONT_KNOW_HOW' ? (
              <>
                <TextInput accessibilityLabel="最终交付" onChangeText={setStuckPrimary} placeholder="最终要交出什么" placeholderTextColor="#74827F" style={[styles.input, dark && styles.inputDark]} value={stuckPrimary} />
                <TextInput accessibilityLabel="已有材料" onChangeText={setStuckSecondary} placeholder="已经有什么材料" placeholderTextColor="#74827F" style={[styles.input, dark && styles.inputDark]} value={stuckSecondary} />
              <TextInput accessibilityLabel="第一小步" onChangeText={setStuckStep} placeholder="现在能做的第一小步" placeholderTextColor="#74827F" style={[styles.input, dark && styles.inputDark]} value={stuckStep} />
                <Action
                  disabled={stuckStep.trim() === '' || props.pending}
                label="保存第一小步并先做5分钟"
                  onPress={() => props.onStuckRepair({
                    reason: stuckReason,
                    action: 'CLARIFY_OUTPUT',
                    firstStep: stuckStep,
                    note: [stuckPrimary, stuckSecondary].filter(Boolean).join(' · '),
                    focusMinutes: 5,
                  })}
                />
              </>
            ) : null}
            {stuckReason === 'FEAR_OF_POOR_RESULT' ? (
              <>
                {['先写一个粗糙开头', '先列不完整提纲', '只做到最低标准'].map(step => (
                  <Action
                    key={step}
                    label={step}
                    onPress={() => props.onStuckRepair({
                      reason: stuckReason,
                      action: 'ROUGH_DRAFT',
                      firstStep: step,
                      note: null,
                      focusMinutes: 5,
                    })}
                    secondary
                  />
                ))}
              <TextInput accessibilityLabel="不完美的开头" onChangeText={setStuckStep} placeholder="写下一个不完美的开头" placeholderTextColor="#74827F" style={[styles.input, dark && styles.inputDark]} value={stuckStep} />
                <Action disabled={stuckStep.trim() === '' || props.pending} label="按自定义动作先做5分钟" onPress={() => props.onStuckRepair({reason: stuckReason, action: 'ROUGH_DRAFT', firstStep: stuckStep, note: null, focusMinutes: 5})} />
              </>
            ) : null}
            {stuckReason === 'LOW_ENERGY' ? (
              <>
                <Action label="先做2分钟" onPress={() => props.onStuckRepair({reason: stuckReason, action: 'START_TWO_MINUTES', firstStep: props.task?.firstStep ?? null, note: null, focusMinutes: 2})} />
                <Action label="先做5分钟" onPress={() => props.onStuckRepair({reason: stuckReason, action: 'START_FIVE_MINUTES', firstStep: props.task?.firstStep ?? null, note: null, focusMinutes: 5})} />
                <Action label="改到更好时间" onPress={() => setLayer('reschedule')} secondary />
                <TextInput accessibilityLabel="今日最低目标" onChangeText={setStuckStep} placeholder="今天最低只做到什么" placeholderTextColor="#74827F" style={[styles.input, dark && styles.inputDark]} value={stuckStep} />
                <Action disabled={stuckStep.trim() === '' || props.pending} label="保存最低目标并先做2分钟" onPress={() => props.onStuckRepair({reason: stuckReason, action: 'SET_MINIMUM_GOAL', firstStep: stuckStep, note: null, focusMinutes: 2})} secondary />
              </>
            ) : null}
            {stuckReason === 'OTHER' ? (
              <>
                <TextInput accessibilityLabel="其他情况" onChangeText={setStuckPrimary} placeholder="可选：简单记下情况" placeholderTextColor="#74827F" style={[styles.input, dark && styles.inputDark]} value={stuckPrimary} />
                <TextInput accessibilityLabel="其他情况下一步" onChangeText={setStuckStep} placeholder="选择一个现在能做的下一步" placeholderTextColor="#74827F" style={[styles.input, dark && styles.inputDark]} value={stuckStep} />
                <Action disabled={stuckStep.trim() === '' || props.pending} label="保存下一步并先做2分钟" onPress={() => props.onStuckRepair({reason: stuckReason, action: 'START_TWO_MINUTES', firstStep: stuckStep, note: stuckPrimary, focusMinutes: 2})} />
              </>
            ) : null}
            {stuckReason === null ? null : (
              <Action label="重新选择卡住原因" onPress={() => setStuckReason(null)} secondary />
            )}
            <Action label="返回常用操作" onPress={() => setLayer('action')} secondary />
          </View>
        ) : null}

        {props.mode === 'edit' && layer === 'rescue' ? (
          <View style={styles.actionLayer}>
            <TextInput accessibilityLabel="最低必须交出什么" onChangeText={setRescueMinimum} placeholder="最低必须交出什么" placeholderTextColor="#74827F" style={[styles.input, dark && styles.inputDark]} value={rescueMinimum} />
            <TextInput accessibilityLabel="现在必须做哪一步" onChangeText={setRescueStep} placeholder="现在必须做哪一步" placeholderTextColor="#74827F" style={[styles.input, dark && styles.inputDark]} value={rescueStep} />
            <TextInput accessibilityLabel="暂时放弃的内容" onChangeText={setRescueDrop} placeholder="哪些内容可以暂时放弃（可选）" placeholderTextColor="#74827F" style={[styles.input, dark && styles.inputDark]} value={rescueDrop} />
            <View style={styles.segmentedRow}>
              {([5, 15, 25] as const).map(minutes => (
                <SegmentedButton key={minutes} label={`${minutes} 分钟`} onPress={() => setRescueMinutes(minutes)} selected={rescueMinutes === minutes} />
              ))}
            </View>
            <Action
              disabled={rescueMinimum.trim() === '' || rescueStep.trim() === '' || props.pending}
              label={`保存最低版本并开始${rescueMinutes}分钟`}
              onPress={() => props.onRescue({
                minimumDeliverable: rescueMinimum,
                nextRequiredStep: rescueStep,
                optionalScopeToDrop: rescueDrop,
                focusMinutes: rescueMinutes,
              })}
            />
            <Action label="返回常用操作" onPress={() => setLayer('action')} secondary />
          </View>
        ) : null}

        {layer === 'details' ? (
          <>
        <TextInput
          accessibilityLabel="任务标题"
          autoFocus={props.mode === 'create'}
          onChangeText={value => {
            if (props.mode === 'edit') {
              changeDraft({...props.draft, quickInput: value, title: value});
              return;
            }
            const parsed = parseQuickTaskSentence(value, props.nowInput);
            changeDraft({
              ...props.draft,
              quickInput: value,
              title: parsed.title,
              due: shortcutForDueAt(parsed.dueAt, props.nowInput),
              dueAt: parsed.dueAt,
              estimatedMinutes: parsed.estimatedMinutes,
              repeatRule: parsed.repeatRule,
              confidence: parsed.confidence,
            });
          }}
          maxLength={500}
          placeholder="例如：明晚 8 点准备答辩 30 分钟"
          placeholderTextColor="#74827F"
          style={[styles.input, dark && styles.inputDark]}
          value={props.mode === 'create' ? props.draft.quickInput : props.draft.title}
        />
        {props.mode === 'create' && props.draft.quickInput.length >= QUICK_TASK_WARNING_LENGTH ? (
          <Text accessibilityLiveRegion="polite" style={styles.quickWarning}>
            内容接近 500 字上限，请精简后再继续输入。
          </Text>
        ) : null}
        {props.mode === 'create' && props.draft.quickInput.trim() !== '' ? (
          <View accessibilityLabel="已识别任务信息" style={styles.parseChips}>
            <Pressable
              accessibilityLabel="清除识别到的截止时间"
              disabled={props.draft.dueAt === null}
              onPress={() => changeDraft({...props.draft, due: 'none', dueAt: null})}
              style={styles.parseChip}>
              <Text style={styles.parseChipText}>
                {props.draft.dueAt === null ? '未识别时间' : `时间 ${props.draft.dueAt.slice(5, 16).replace('T', ' ')}`}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="调整预计时长"
              onPress={() => changeDraft({
                ...props.draft,
                estimatedMinutes:
                  props.draft.estimatedMinutes === null
                    ? 15
                    : props.draft.estimatedMinutes <= 15
                      ? 30
                      : props.draft.estimatedMinutes <= 30
                        ? 60
                        : null,
              })}
              style={styles.parseChip}>
              <Text style={styles.parseChipText}>
                {props.draft.estimatedMinutes === null ? '补充时长' : `预计 ${props.draft.estimatedMinutes} 分钟`}
              </Text>
            </Pressable>
            {props.draft.repeatRule === null ? null : (
              <Pressable
                accessibilityLabel="停止该任务重复"
                onPress={() => changeDraft({...props.draft, repeatRule: null})}
                style={styles.parseChip}>
                <Text style={styles.parseChipText}>
                  {props.draft.repeatRule.frequency === 'daily'
                    ? '每天重复'
                    : props.draft.repeatRule.frequency === 'weekly'
                      ? '每周重复'
                      : '每月重复'}
                </Text>
              </Pressable>
            )}
          </View>
        ) : null}
        <TextInput
          accessibilityLabel="第一小步"
          onChangeText={firstStep => changeDraft({...props.draft, firstStep})}
          placeholder="第一小步（可选）"
          placeholderTextColor="#74827F"
          style={[styles.input, dark && styles.inputDark]}
          value={props.draft.firstStep}
        />
        <Text style={[styles.fieldLabel, dark && styles.textDark]}>放在哪个象限</Text>
        <View style={styles.choiceGrid}>
          {QUADRANT_LIST_ORDER.map(quadrant => {
            const meta = QUADRANT_HOME_META[quadrant];
            const selected = props.draft.quadrant === quadrant;
            return (
              <Pressable
                accessibilityLabel={`选择${meta.title}`}
                accessibilityRole="radio"
                accessibilityState={{selected}}
                key={quadrant}
                onPress={() => {
                  props.onQuadrantTouched();
                  changeDraft({...props.draft, quadrant});
                }}
                style={[
                  styles.choice,
                  dark && styles.surfaceRaisedDark,
                  {borderColor: meta.accent},
                  selected && (dark
                    ? styles.choiceSelectedDark
                    : {backgroundColor: meta.tint}),
                ]}>
                <Text style={[styles.choiceTitle, {color: meta.accent}]}>{meta.title}</Text>
                <Text style={[styles.choiceDescription, dark && styles.textMutedDark]}>{meta.description}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.fieldLabel, dark && styles.textDark]}>截止时间</Text>
        <View style={styles.segmentedRow}>
          {(['none', 'today', 'tomorrow'] as const).map(shortcut => (
            <SegmentedButton
              key={shortcut}
              label={shortcut === 'none' ? '不设置' : shortcut === 'today' ? '今天' : '明天'}
              onPress={() => changeDraft({
                ...props.draft,
                due: shortcut,
                dueAt: dueAtForShortcut(shortcut, props.nowInput),
              })}
              selected={props.draft.due === shortcut}
            />
          ))}
        </View>
        {props.mode === 'edit' ? (
          <Action
            label={
              taskPriority?.urgencyMode === 'hybrid'
                ? '关闭临近截止时自动提高紧急度'
                : '临近截止时自动提高紧急度'
            }
            onPress={() => props.onUrgencyMode(
              taskPriority?.urgencyMode === 'hybrid' ? 'manual' : 'hybrid',
            )}
            secondary
          />
        ) : null}
        </>
        ) : null}
        {props.error === null ? null : (
          <Text accessibilityLiveRegion="assertive" style={styles.error}>{props.error}</Text>
        )}
        </ScrollView>
    </AppBottomSheet>
  );
}

export function QuadrantHomeScreen(props: QuadrantHomeScreenProps): React.JSX.Element {
  const workspace = useTaskWorkspaceRuntime();
  const focus = useAppFocusSessionRuntime();
  const systemScheme = useColorScheme();
  const {fontScale} = useWindowDimensions();
  const [tab, setTab] = React.useState<MainTab>('quadrants');
  const [viewMode, setViewMode] = React.useState<ViewMode>('map');
  const [viewPreferenceLoaded, setViewPreferenceLoaded] = React.useState(false);
  const [listTarget, setListTarget] = React.useState<Quadrant | null>(null);
  const [editorMode, setEditorMode] = React.useState<'create' | 'edit' | null>(null);
  const [editorInitialLayer, setEditorInitialLayer] = React.useState<TaskPanelLayer | undefined>(undefined);
  const [draft, setDraft] = React.useState<TaskDraft>(EMPTY_DRAFT);
  const createDraftRef = React.useRef<CreateDraftContext>({
    draftId: 'draft:initial',
    sourceQuadrant: null,
    quadrantTouched: false,
    persistedTaskId: null,
  });
  const draftSaveInFlightRef = React.useRef<Promise<boolean> | null>(null);
  const [actionPending, setActionPending] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [reward, setReward] = React.useState<RewardFeedback | null>(null);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [summaryOpen, setSummaryOpen] = React.useState(false);
  const [tomorrowSnapshot, setTomorrowSnapshot] =
    React.useState<DayClosureSnapshot | null>(null);
  const [tomorrowReminderStatus, setTomorrowReminderStatus] =
    React.useState<TomorrowFirstReminderResult>('idle');
  const [tomorrowReminderSettingsOpen, setTomorrowReminderSettingsOpen] =
    React.useState(false);
  const [tomorrowReminderEnabled, setTomorrowReminderEnabled] =
    React.useState(false);
  const [tomorrowReminderAcceptedTime, setTomorrowReminderAcceptedTime] =
    React.useState('08:00');
  const [tomorrowReminderDraftTime, setTomorrowReminderDraftTime] =
    React.useState('08:00');
  const [tomorrowReminderErrorCode, setTomorrowReminderErrorCode] =
    React.useState<string | null>(null);
  const [backupOpen, setBackupOpen] = React.useState(false);
  const [organizerMode, setOrganizerMode] = React.useState<TaskOrganizerMode | null>(null);
  const [organizerTaskId, setOrganizerTaskId] = React.useState<string | null>(null);
  const [progressTaskId, setProgressTaskId] = React.useState<string | null>(null);
  const [postFocusTaskId, setPostFocusTaskId] = React.useState<string | null>(null);
  const [focusDurationRecommendation, setFocusDurationRecommendation] =
    React.useState<FocusDurationRecommendation | null>(null);
  const [focusHistoryItems, setFocusHistoryItems] =
    React.useState<readonly FocusSession[]>([]);
  const [moreDurationsOpen, setMoreDurationsOpen] = React.useState(false);
  const [recentGrowthExpanded, setRecentGrowthExpanded] = React.useState(false);
  const [settingsSheet, setSettingsSheet] =
    React.useState<'theme' | 'focus-duration' | null>(null);
  const [lowEnergySheetOpen, setLowEnergySheetOpen] = React.useState(false);
  const [moveUndo, setMoveUndo] = React.useState<MoveUndo | null>(null);
  const [completionUndo, setCompletionUndo] = React.useState<CompletionUndo | null>(null);
  const [settings, setSettings] = React.useState<QuadrantHomeSettings>({
    viewMode: 'map',
    theme: 'system',
    reduceMotion: false,
    tipsSeen: false,
    lowEnergyMode: DEFAULT_LOW_ENERGY_MODE,
    insightDismissal: null,
    viewModeManuallySelected: false,
    screenReaderListApplied: false,
    preferredFocusMinutes: 5,
    focusDurationSuggestionDismissedAt: null,
  });
  const [tipsVisible, setTipsVisible] = React.useState(false);
  const [notificationTaskId, setNotificationTaskId] = React.useState<string | null>(null);
  const [pendingSystemEntry, setPendingSystemEntry] = React.useState<TomorrowFirstTap | null>(null);
  const [systemNotice, setSystemNotice] = React.useState<string | null>(null);
  const [priorityNow, setPriorityNow] = React.useState(() => props.now());
  const [actionPointerIndex, setActionPointerIndex] = React.useState(0);
  const [hybridMoveNotice, setHybridMoveNotice] = React.useState<string | null>(null);
  const [rescuePromptDismissedIds, setRescuePromptDismissedIds] = React.useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const moveUndoTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionUndoTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const rewardTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const homeReadyMetricRecordedRef = React.useRef(false);
  const homePrimaryShownRef = React.useRef<string | null>(null);
  const pendingSheetMetricRef = React.useRef<SheetMetricRequest | null>(null);
  const currentSheetOpenedAtRef = React.useRef<number | null>(null);
  const hybridMoveNoticeSeenRef = React.useRef(new Set<string>());
  const focusContinuationRef = React.useRef<FocusContinuationContext | null>(null);
  const handledFocusSessionsRef = React.useRef(new Set<string>());

  const recordMetric = React.useCallback((
    name: ProductEventName,
    fields: MetricFields = {},
  ) => {
    recordProductMetric(props.metricPort, {
      name,
      occurredAt: props.metricClock.now(),
      sessionId: props.metricSessionId,
      ...fields,
    });
  }, [props.metricClock, props.metricPort, props.metricSessionId]);

  const selectTab = React.useCallback((next: MainTab) => {
    setTab(next);
  }, []);

  const openOrganizer = React.useCallback((
    mode: TaskOrganizerMode,
    taskId: string | null = null,
  ) => {
    setOrganizerTaskId(taskId);
    setOrganizerMode(mode);
  }, []);

  const selectedTask = workspace?.selectedTask ?? null;
  const postFocusTask =
    postFocusTaskId === null
      ? null
      : workspace?.snapshot.tasks.find(task => task.id === postFocusTaskId) ?? null;
  const activeFocusTask =
    workspace === null || focus?.snapshot.activeSession == null
      ? null
      : workspace.snapshot.tasks.find(
          task => task.id === focus.snapshot.activeSession?.taskId,
        ) ?? null;
  const activeTasks = (workspace?.snapshot.tasks ?? []).filter(
    task =>
      task.deletedAt === null &&
      (task.status === 'pending' || task.status === 'in_progress'),
  );
  const tasks = selectHomeVisibleTasks(activeTasks);
  const unsortedTasks = activeTasks.filter(isTaskUnsorted);
  const continuation = workspace === null
    ? null
    : selectHomeContinuation({
        tasks,
        activeFocusTaskId: focus?.snapshot.activeSession?.taskId ?? null,
      });
  const lowEnergyMode = activeLowEnergyMode(settings.lowEnergyMode, priorityNow);
  const commonFocusMinutes = lowEnergyMode.enabled
    ? lowEnergyMode.defaultFocusMinutes
    : settings.preferredFocusMinutes;
  const actionTasks = lowEnergyMode.enabled
    ? lowEnergyTaskCandidates(tasks)
    : tasks;
  const actionPointer = continuation === null
    ? selectActionPointer(actionTasks, priorityNow, actionPointerIndex, {
        activeFocusTaskId: focus?.snapshot.activeSession?.taskId ?? null,
      })
    : null;
  const homePrimaryAction = selectHomePrimaryAction({
    tasks: activeTasks,
    activeFocus:
      focus?.snapshot.activeSession == null
        ? null
        : {
            taskId: focus.snapshot.activeSession.taskId,
            focusSessionId: focus.snapshot.activeSession.id,
          },
    recommended:
      actionPointer === null
        ? null
        : {
            taskId: actionPointer.task.id,
            reasons: actionPointer.reasons,
          },
    now: priorityNow,
  });
  const homePrimaryKey = homePrimaryActionKey(homePrimaryAction);

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        setPriorityNow(props.now());
      }
    });
    return () => subscription.remove();
  }, [props.now]);

  React.useEffect(() => {
    if (workspace?.snapshot.loaded === true) {
      setPriorityNow(props.now());
    }
  }, [props.now, workspace?.snapshot.loaded, workspace?.snapshot.revision]);

  React.useEffect(() => {
    const context = focusContinuationRef.current;
    if (
      focus?.snapshot.state !== 'finished' ||
      context === null ||
      handledFocusSessionsRef.current.has(context.focusSessionId)
    ) return;
    handledFocusSessionsRef.current.add(context.focusSessionId);
    setPostFocusTaskId(context.taskId);
    if (context.plannedSessionId !== undefined && workspace !== null) {
      const task = workspace.snapshot.tasks.find(item => item.id === context.taskId);
      if (task !== undefined) {
        try {
          const settled = settlePlannedWorkSession({
            task,
            plannedSessionId: context.plannedSessionId,
            outcome: 'DONE',
            now: props.now(),
          });
          const patch: P13TaskPatch = {
            plannedWorkSessions: settled.plannedWorkSessions ?? [],
            nextStartAt:
              (settled as Task & {nextStartAt?: string | null}).nextStartAt ?? null,
          };
          void workspace.updateTask(task.id, patch as never).catch(() => undefined);
        } catch {
          // The focus record remains durable even if its optional plan link is stale.
        }
      }
    }
  }, [focus?.snapshot.state, props.now, workspace, workspace?.snapshot.revision]);

  React.useEffect(() => {
    if (workspace?.snapshot.loaded !== true) return;
    const day = priorityNow.slice(0, 10);
    const candidate = workspace.snapshot.tasks.find(task => {
      const coordinates = priorityCoordinatesForTask(task);
      if (coordinates.urgencyMode !== 'hybrid') return false;
      const legacyQuadrant = task.important
        ? task.urgent ? 'Q1' : 'Q2'
        : task.urgent ? 'Q3' : 'Q4';
      const effective = effectiveQuadrantForTask(task, priorityNow);
      const key = `${day}:${task.id}:${effective}`;
      return legacyQuadrant !== effective && !hybridMoveNoticeSeenRef.current.has(key);
    });
    if (candidate === undefined) return;
    const effective = effectiveQuadrantForTask(candidate, priorityNow);
    const key = `${day}:${candidate.id}:${effective}`;
    hybridMoveNoticeSeenRef.current.add(key);
    setHybridMoveNotice(
      `${candidate.title} 因截止时间临近，已显示在${QUADRANT_HOME_META[effective].title}。`,
    );
  }, [priorityNow, workspace?.snapshot.loaded, workspace?.snapshot.revision, workspace?.snapshot.tasks]);

  React.useEffect(() => {
    if (
      workspace === null ||
      !workspace.snapshot.loaded ||
      !viewPreferenceLoaded ||
      homeReadyMetricRecordedRef.current
    ) {
      return;
    }
    homeReadyMetricRecordedRef.current = true;
    recordMetric('home_ready', {
      durationMs: Math.max(
        0,
        props.metricClock.monotonicNow() - props.homeStartedAtMs,
      ),
      success: true,
      source: 'app',
    });
  }, [
    props.homeStartedAtMs,
    props.metricClock,
    recordMetric,
    viewPreferenceLoaded,
    workspace,
  ]);

  React.useEffect(() => {
    if (
      workspace?.snapshot.loaded !== true ||
      !viewPreferenceLoaded ||
      homePrimaryShownRef.current === homePrimaryKey
    ) {
      return;
    }
    homePrimaryShownRef.current = homePrimaryKey;
    recordMetric('home_primary_shown', {
      durationMs: Math.max(
        0,
        props.metricClock.monotonicNow() - props.homeStartedAtMs,
      ),
      source: homePrimaryAction.type.toLowerCase(),
      success: true,
      ...('taskId' in homePrimaryAction
        ? {taskRef: homePrimaryAction.taskId}
        : {}),
    });
  }, [
    homePrimaryAction,
    homePrimaryKey,
    props.homeStartedAtMs,
    props.metricClock,
    recordMetric,
    viewPreferenceLoaded,
    workspace?.snapshot.loaded,
  ]);

  React.useEffect(() => {
    const pending = pendingSheetMetricRef.current;
    if (pending === null || editorMode === null) {
      return;
    }
    if (
      pending.name === 'task_sheet_open' &&
      selectedTask?.id !== pending.taskRef
    ) {
      return;
    }
    const openedAt = props.metricClock.monotonicNow();
    currentSheetOpenedAtRef.current = openedAt;
    recordMetric(pending.name, {
      durationMs: Math.max(0, openedAt - pending.startedAtMs),
      source: pending.source,
      success: true,
      ...(pending.taskRef === undefined ? {} : {taskRef: pending.taskRef}),
    });
    pendingSheetMetricRef.current = null;
  }, [editorMode, props.metricClock, recordMetric, selectedTask?.id]);

  React.useEffect(() => {
    let current = true;
    void props.preferences.readSettings().then(value => {
      if (current) {
        const lowEnergyMode = activeLowEnergyMode(
          value.lowEnergyMode,
          props.now(),
        );
        const resolved = {...value, lowEnergyMode};
        setSettings(resolved);
        setViewMode(value.viewMode);
        setTipsVisible(!value.tipsSeen);
        setViewPreferenceLoaded(true);
        if (value.lowEnergyMode.enabled && !lowEnergyMode.enabled) {
          void props.preferences.writeSettings({lowEnergyMode});
        }
      }
    }).catch(() => {
      if (current) setViewPreferenceLoaded(true);
    });
    return () => {
      current = false;
    };
  }, [props.now, props.preferences]);

  React.useEffect(() => () => {
    if (moveUndoTimerRef.current !== null) {
      clearTimeout(moveUndoTimerRef.current);
    }
    if (completionUndoTimerRef.current !== null) {
      clearTimeout(completionUndoTimerRef.current);
    }
    if (rewardTimerRef.current !== null) {
      clearTimeout(rewardTimerRef.current);
    }
  }, []);

  React.useEffect(() => {
    if (!viewPreferenceLoaded) return;
    let current = true;
    const applyScreenReaderDefault = (enabled: boolean) => {
      if (
        !current ||
        !enabled ||
        settings.viewModeManuallySelected ||
        settings.screenReaderListApplied
      ) return;
      setViewMode('list');
      setSettings(value => ({
        ...value,
        viewMode: 'list',
        screenReaderListApplied: true,
      }));
      void props.preferences.writeSettings({
        viewMode: 'list',
        screenReaderListApplied: true,
      }).catch(() => undefined);
    };
    void AccessibilityInfo.isScreenReaderEnabled()
      .then(applyScreenReaderDefault)
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      applyScreenReaderDefault,
    );
    return () => {
      current = false;
      subscription.remove();
    };
  }, [
    props.preferences,
    settings.screenReaderListApplied,
    settings.viewModeManuallySelected,
    viewPreferenceLoaded,
  ]);

  React.useEffect(() => {
    if (!viewPreferenceLoaded || props.focusHistory === undefined) return;
    let current = true;
    void props.focusHistory.listHistory()
      .then(sessions => {
        if (!current) return;
        setFocusHistoryItems(sessions);
        setFocusDurationRecommendation(selectFocusDurationRecommendation({
          sessions,
          currentDefault: settings.preferredFocusMinutes,
          now: props.now(),
          dismissedAt: settings.focusDurationSuggestionDismissedAt,
        }));
      })
      .catch(() => {
        if (current) {
          setFocusHistoryItems([]);
          setFocusDurationRecommendation(null);
        }
      });
    return () => { current = false; };
  }, [
    props.focusHistory,
    props.now,
    settings.focusDurationSuggestionDismissedAt,
    settings.preferredFocusMinutes,
    viewPreferenceLoaded,
  ]);

  React.useEffect(() => {
    let current = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(enabled => {
        if (current && enabled) {
          setSettings(value => ({...value, reduceMotion: true}));
        }
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);

  React.useEffect(() => {
    const notifications = props.notifications;
    if (notifications === undefined) {
      return;
    }
    let current = true;
    const openTap = (tap: TomorrowFirstTap) => {
      if (!current) return;
      recordMetric('notification_action', {
        source: tap.kind,
        success: true,
        ...('taskId' in tap ? {taskRef: tap.taskId} : {}),
      });
      setTab('quadrants');
      setHistoryOpen(false);
      setSummaryOpen(false);
      setBackupOpen(false);
      if (tap.kind === 'tomorrow_first') {
        setNotificationTaskId(tap.taskId);
      } else {
        setPendingSystemEntry(tap);
      }
    };
    void notifications.getInitialTap()
      .then(tap => {
        if (tap !== null) openTap(tap);
      })
      .catch(() => undefined);
    const unsubscribe = notifications.subscribeTap(openTap);
    return () => {
      current = false;
      unsubscribe();
    };
  }, [props.notifications, recordMetric]);

  React.useEffect(() => {
    const reminder = props.tomorrowFirstReminder;
    let current = true;
    void props.dayClosure.load()
      .then(async snapshot => {
        if (current) {
          setTomorrowSnapshot(snapshot);
        }
        if (reminder === undefined) {
          return;
        }
        let status: TomorrowFirstReminderResult = 'idle';
        try {
          status = await reminder.reconcile(snapshot);
        } catch (reason: unknown) {
          if (current) {
            setActionError(userFacingError(reason, USER_COPY.reminderFailed));
          }
        }
        const settings = await reminder.getSettings?.();
        if (!current) {
          return;
        }
        setTomorrowReminderStatus(status);
        if (settings !== undefined) {
          setTomorrowReminderEnabled(settings.enabled);
          setTomorrowReminderAcceptedTime(settings.wallClockTime);
          setTomorrowReminderDraftTime(settings.wallClockTime);
          setTomorrowReminderStatus(settings.status);
        }
      })
      .catch(reason => {
        if (current) {
          setActionError(userFacingError(reason, USER_COPY.reminderFailed));
        }
      });
    return () => {
      current = false;
    };
  }, [props.dayClosure, props.tomorrowFirstReminder]);

  function openTomorrowReminderSettings(): void {
    setTomorrowReminderDraftTime(tomorrowReminderAcceptedTime);
    setTomorrowReminderErrorCode(null);
    setTomorrowReminderSettingsOpen(true);
  }

  function enableTomorrowReminder(): void {
    const reminder = props.tomorrowFirstReminder;
    const snapshot = tomorrowSnapshot;
    if (reminder === undefined || snapshot === null) {
      return;
    }
    const requestedTime = tomorrowReminderDraftTime;
    setTomorrowReminderErrorCode(null);
    void reminder.enable(snapshot, requestedTime)
      .then(status => {
        setTomorrowReminderStatus(status);
        setTomorrowReminderEnabled(status === 'scheduled');
        if (status === 'scheduled') {
          setTomorrowReminderAcceptedTime(requestedTime);
        }
      })
      .catch(reason => {
        setTomorrowReminderStatus('idle');
        setTomorrowReminderErrorCode(
          reason instanceof Error ? reason.message : 'REMINDER_SETTINGS_FAILED',
        );
      });
  }

  function saveTomorrowReminderTime(): void {
    const reminder = props.tomorrowFirstReminder;
    const snapshot = tomorrowSnapshot;
    if (reminder?.saveTime === undefined || snapshot === null) {
      return;
    }
    const requestedTime = tomorrowReminderDraftTime;
    setTomorrowReminderErrorCode(null);
    void reminder.saveTime(snapshot, requestedTime)
      .then(status => {
        setTomorrowReminderStatus(status);
        setTomorrowReminderEnabled(status === 'scheduled');
        if (status === 'scheduled') {
          setTomorrowReminderAcceptedTime(requestedTime);
        }
      })
      .catch(reason => {
        setTomorrowReminderErrorCode(
          reason instanceof Error ? reason.message : 'REMINDER_SETTINGS_FAILED',
        );
      });
  }

  function disableTomorrowReminder(): void {
    const reminder = props.tomorrowFirstReminder;
    const snapshot = tomorrowSnapshot;
    if (reminder?.disable === undefined || snapshot === null) {
      return;
    }
    setTomorrowReminderErrorCode(null);
    void reminder.disable(snapshot)
      .then(status => {
        setTomorrowReminderStatus(status);
        setTomorrowReminderEnabled(false);
      })
      .catch(reason => {
        setTomorrowReminderErrorCode(
          reason instanceof Error ? reason.message : 'REMINDER_SETTINGS_FAILED',
        );
      });
  }

  function startTomorrowFirst(): void {
    if (focus === null || actionPending) {
      return;
    }
    setActionPending(true);
    setTomorrowReminderErrorCode(null);
    void props.dayClosure.startAndConsume(taskId => focus.start(taskId))
      .then(async next => {
        setTomorrowSnapshot(next);
        await workspace?.refreshAfterDurableCommit().catch(() => undefined);
        await props.tomorrowFirstReminder?.reconcile(next).catch(() => undefined);
        setTab('focus');
      })
      .catch(reason => {
        setActionError(userFacingError(reason, '明日第一项启动失败，请重试。'));
        void props.dayClosure.load().then(setTomorrowSnapshot).catch(() => undefined);
      })
      .finally(() => setActionPending(false));
  }

  React.useEffect(() => {
    if (
      workspace === null ||
      !workspace.snapshot.loaded ||
      notificationTaskId === null
    ) {
      return;
    }
    const task = workspace.snapshot.tasks.find(
      candidate =>
        candidate.id === notificationTaskId &&
        candidate.deletedAt === null &&
        (candidate.status === 'pending' || candidate.status === 'in_progress'),
    );
    if (task === undefined) {
      setActionError('提醒对应的任务已完成或不可用。');
      setNotificationTaskId(null);
      return;
    }
    openTask(task.id, 'notification');
    setNotificationTaskId(null);
  // React to hydrated task revisions while a notification route is pending.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notificationTaskId, workspace?.snapshot.loaded, workspace?.snapshot.revision]);

  React.useEffect(() => {
    if (
      workspace === null ||
      !workspace.snapshot.loaded ||
      pendingSystemEntry === null ||
      actionPending
    ) return;
    const entry = pendingSystemEntry;
    setPendingSystemEntry(null);
    setSystemNotice(null);

    if (entry.kind === 'shortcut_add') {
      openOrganizer('capture');
      return;
    }
    if (entry.kind === 'share_text') {
      const parsed = parseQuickTaskSentence(entry.text, props.now());
      if (
        parsed.confidence < 0.72 &&
        parsed.title.trim() !== '' &&
        !entry.truncated &&
        !parsed.truncated
      ) {
        recordMetric('quick_capture_started', {source: 'share_text'});
        setActionPending(true);
        void workspace.createTask({
          title: parsed.title,
          description: '',
          important: false,
          urgent: false,
          placementState: 'UNSORTED',
        }).then(task => {
          recordMetric('quick_capture_saved', {
            source: 'share_text',
            taskRef: task.id,
          });
          setSystemNotice('已保存到待判断，稍后两问就能放入四象限。');
        }).catch(reason => {
          setActionError(userFacingError(reason, '分享任务保存失败，请重试。'));
        }).finally(() => setActionPending(false));
        return;
      }
      openCreate(undefined, 'share_text');
      setDraft({
        ...EMPTY_DRAFT,
        quickInput: entry.text,
        title: parsed.title,
        due: shortcutForDueAt(parsed.dueAt, props.now()),
        dueAt: parsed.dueAt,
        estimatedMinutes: parsed.estimatedMinutes,
        repeatRule: parsed.repeatRule,
        confidence: parsed.confidence,
      });
      if (entry.truncated || parsed.truncated) {
        setActionError('分享内容已限制为 500 字，请确认后再保存。');
      }
      return;
    }
    if (entry.kind === 'shortcut_continue') {
      if (continuation === null) {
        setSystemNotice('当前没有可继续的任务。');
      } else if (continuation.kind === 'active_focus') {
        setTab('focus');
      } else {
        startFiveMinutes(continuation.task, 15, 'shortcut_continue');
      }
      return;
    }
    if (entry.kind === 'shortcut_start_five') {
      const target = selectActionPointer(
        workspace.snapshot.tasks.filter(task =>
          task.deletedAt === null &&
          (task.status === 'pending' || task.status === 'in_progress'),
        ),
        props.now(),
        0,
        {activeFocusTaskId: focus?.snapshot.activeSession?.taskId ?? null},
      );
      if (target === null) {
        setActionPointerIndex(0);
        setSystemNotice('当前没有可开始的任务，已回到“现在先做”。');
      } else {
        startFiveMinutes(target.task, 5, 'shortcut_start_five');
      }
      return;
    }

    if (!('taskId' in entry)) return;

    const task = workspace.snapshot.tasks.find(candidate =>
      candidate.id === entry.taskId &&
      candidate.deletedAt === null &&
      (candidate.status === 'pending' || candidate.status === 'in_progress'),
    );
    if (task === undefined) {
      setActionError('提醒对应的任务已完成、已删除或不可用。');
      return;
    }
    if (entry.kind === 'start_five') {
      startFiveMinutes(task, 5, 'notification_start_five');
      return;
    }
    if (entry.kind === 'reschedule') {
      openTask(task.id, 'notification_reschedule', 'reschedule');
      return;
    }
    const postponed = postponeTaskTenMinutes(task, props.now());
    const updateSupport = workspace.updateTask as unknown as (
      taskId: string,
      patch: {
        supportSchemaVersion: 1;
        nextStartAt: string;
        postponedCount: number;
      },
    ) => Promise<Task>;
    void updateSupport(task.id, {
      supportSchemaVersion: TASK_SUPPORT_SCHEMA_VERSION,
      nextStartAt: postponed.nextStartAt,
      postponedCount: postponed.postponedCount,
    }).then(() => {
      setSystemNotice(postponed.suggestSmallerStep
        ? '已延后 10 分钟，最终截止时间没有改变。下次打开任务时可以把第一小步再缩小一点。'
        : '已延后 10 分钟，最终截止时间没有改变。');
    }).catch(reason => {
      setActionError(userFacingError(reason, '延后失败，请重试。'));
    });
  // System entries are consumed once after the durable workspace hydrates.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    actionPending,
    pendingSystemEntry,
    props.now,
    workspace?.snapshot.loaded,
    workspace?.snapshot.revision,
  ]);

  React.useEffect(() => {
    if (editorMode !== 'edit' || selectedTask === null) {
      return;
    }
    setDraft({
      quickInput: selectedTask.title,
      title: selectedTask.title,
      firstStep: selectedTask.firstStep ?? '',
      quadrant: effectiveQuadrantForTask(selectedTask, priorityNow),
      due: shortcutForDueAt(selectedTask.dueAt, props.now()),
      dueAt: selectedTask.dueAt,
      estimatedMinutes: selectedTask.estimatedMinutes ?? null,
      repeatRule: (selectedTask as TaskWithPriority).repeatRule ?? null,
      confidence: 1,
    });
  }, [editorMode, priorityNow, props.now, selectedTask]);

  if (workspace === null) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{USER_COPY.homeUnavailable}</Text>
      </View>
    );
  }

  const runtime = workspace;
  const {snapshot} = runtime;
  const progressTask =
    progressTaskId === null
      ? null
      : snapshot.tasks.find(task => task.id === progressTaskId) ?? null;
  const dark = settings.theme === 'dark' ||
    (settings.theme === 'system' && systemScheme === 'dark');
  function openCreate(quadrant?: Quadrant, source = 'quadrant'): void {
    pendingSheetMetricRef.current = {
      name: 'task_create_open',
      source,
      startedAtMs: props.metricClock.monotonicNow(),
    };
    runtime.clearError();
    runtime.closeTask();
    const initialQuadrant = quadrant ?? 'Q2';
    createDraftRef.current = {
      draftId: `task-draft:${props.metricSessionId}:${Math.round(props.metricClock.monotonicNow())}`,
      sourceQuadrant: quadrant ?? null,
      quadrantTouched: quadrant !== undefined,
      persistedTaskId: null,
    };
    draftSaveInFlightRef.current = null;
    setDraft({...EMPTY_DRAFT, quadrant: initialQuadrant});
    setActionError(null);
    setEditorInitialLayer('details');
    setEditorMode('create');
  }

  function openTask(
    taskId: string,
    source = 'quadrant',
    initialLayer: TaskPanelLayer = 'action',
  ): void {
    pendingSheetMetricRef.current = {
      name: 'task_sheet_open',
      source,
      startedAtMs: props.metricClock.monotonicNow(),
      taskRef: taskId,
    };
    runtime.clearError();
    runtime.selectTask(taskId);
    const task = snapshot.tasks.find(candidate => candidate.id === taskId);
    if (task !== undefined) {
      setDraft({
        quickInput: task.title,
        title: task.title,
        firstStep: task.firstStep ?? '',
        quadrant: effectiveQuadrantForTask(task, priorityNow),
        due: shortcutForDueAt(task.dueAt, props.now()),
        dueAt: task.dueAt,
        estimatedMinutes: task.estimatedMinutes ?? null,
        repeatRule: (task as TaskWithPriority).repeatRule ?? null,
        confidence: 1,
      });
    }
    setActionError(null);
    setEditorInitialLayer(initialLayer);
    setEditorMode('edit');
  }

  function closeEditor(): void {
    setEditorMode(null);
    setEditorInitialLayer(undefined);
    setActionError(null);
    runtime.closeTask();
    currentSheetOpenedAtRef.current = null;
  }

  function saveDraft(intent: 'explicit' | 'dismiss' = 'explicit'): Promise<boolean> {
    const existing = draftSaveInFlightRef.current;
    if (existing !== null) return existing;
    if (draft.title.trim() === '') return Promise.resolve(false);
    if (editorMode === 'create' && createDraftRef.current.persistedTaskId !== null) {
      closeEditor();
      return Promise.resolve(true);
    }
    if (actionPending) return Promise.resolve(false);
    const flags = flagsForQuadrant(draft.quadrant);
    const selectedCoordinates = selectedTask === null
      ? null
      : priorityCoordinatesForTask(selectedTask);
    const selectedQuadrant = selectedTask === null
      ? null
      : effectiveQuadrantForTask(selectedTask, priorityNow);
    const coordinates =
      selectedCoordinates !== null && selectedQuadrant === draft.quadrant
        ? selectedCoordinates
        : legacyPriorityCoordinates(flags.important, flags.urgent);
    const dueAt = draft.dueAt ?? dueAtForShortcut(draft.due, priorityNow);
    const urgencyMode: UrgencyMode =
      selectedCoordinates !== null && selectedQuadrant === draft.quadrant
        ? selectedCoordinates.urgencyMode
        : dueAt === null ? 'manual' : 'hybrid';
    const saveAsUnsorted =
      editorMode === 'create' &&
      intent === 'dismiss' &&
      createDraftRef.current.sourceQuadrant === null &&
      !createDraftRef.current.quadrantTouched;
    setActionPending(true);
    setActionError(null);
    const createExtended = runtime.createTask as unknown as (
      input: Parameters<typeof runtime.createTask>[0] & {
        prioritySchemaVersion: 1;
        importanceScore: number;
        manualUrgencyScore: number;
        urgencyMode: UrgencyMode;
        repeatRule: RepeatRule | null;
        placementState?: 'QUADRANT' | 'UNSORTED';
      },
      idempotencyKey?: string,
    ) => Promise<Task>;
    const updateExtended = runtime.updateTask as unknown as (
      taskId: string,
      patch: Parameters<typeof runtime.updateTask>[1] & {
        prioritySchemaVersion: 1;
        importanceScore: number;
        manualUrgencyScore: number;
        urgencyMode: UrgencyMode;
        repeatRule: RepeatRule | null;
      },
    ) => Promise<Task>;
    const command = editorMode === 'create'
      ? createExtended({
          title: draft.title.trim(),
          description: '',
          important: saveAsUnsorted ? false : flags.important,
          urgent: saveAsUnsorted ? false : flags.urgent,
          placementState: saveAsUnsorted ? 'UNSORTED' : 'QUADRANT',
          scheduledStartAt: null,
          dueAt,
          estimatedMinutes: draft.estimatedMinutes ?? 5,
          firstStep: draft.firstStep.trim() === '' ? null : draft.firstStep,
          prioritySchemaVersion: TASK_PRIORITY_SCHEMA_VERSION,
          importanceScore: coordinates.importanceScore,
          manualUrgencyScore: coordinates.manualUrgencyScore,
          urgencyMode,
          repeatRule: draft.repeatRule,
        }, `p15r:${createDraftRef.current.draftId}`)
      : selectedTask === null
        ? Promise.reject(new Error('TASK_NOT_SELECTED'))
        : updateExtended(selectedTask.id, {
            title: draft.title.trim(),
            important: flags.important,
            urgent: flags.urgent,
            dueAt,
            estimatedMinutes: draft.estimatedMinutes,
            firstStep: draft.firstStep.trim() === '' ? null : draft.firstStep,
            prioritySchemaVersion: TASK_PRIORITY_SCHEMA_VERSION,
            importanceScore: coordinates.importanceScore,
            manualUrgencyScore: coordinates.manualUrgencyScore,
            urgencyMode,
            repeatRule: draft.repeatRule,
          });
    let pending: Promise<boolean>;
    pending = command
      .then(task => {
        if (editorMode === 'create') {
          recordMetric('task_create_saved', {
            durationMs:
              currentSheetOpenedAtRef.current === null
                ? 0
                : Math.max(
                    0,
                    props.metricClock.monotonicNow() -
                      currentSheetOpenedAtRef.current,
                  ),
            source: 'task_sheet',
            success: true,
            taskRef: task.id,
          });
          if (saveAsUnsorted) {
            recordMetric('quick_capture_saved', {
              source: 'task_sheet',
              taskRef: task.id,
            });
          }
        }
        if (editorMode === 'create') {
          createDraftRef.current.persistedTaskId = task.id;
          if (!saveAsUnsorted) runtime.selectTask(task.id);
          setSystemNotice(
            saveAsUnsorted
              ? '已先记下，稍后判断优先级 · 可在待判断中撤销'
              : `已添加到${QUADRANT_HOME_META[draft.quadrant].title}`,
          );
        }
        closeEditor();
        return true;
      })
      .catch(reason => {
        setActionError(userFacingError(reason, USER_COPY.taskSaveFailed));
        return false;
      })
      .finally(() => {
        setActionPending(false);
        if (draftSaveInFlightRef.current === pending) {
          draftSaveInFlightRef.current = null;
        }
      });
    draftSaveInFlightRef.current = pending;
    return pending;
  }

  function dismissEditor(
    _reason: SheetDismissReason,
    dirty: boolean,
  ): Promise<boolean> {
    if (editorMode === 'create') {
      if (draft.title.trim() === '') {
        closeEditor();
        return Promise.resolve(true);
      }
      return saveDraft('dismiss');
    }
    if (dirty) return saveDraft('dismiss');
    closeEditor();
    return Promise.resolve(true);
  }

  function startFiveMinutes(
    task: Task | null,
    plannedMinutes: 2 | 5 | 15 | 25 | 45 | 50 = 5,
    source = 'task_sheet',
  ): void {
    if (task === null || focus === null || actionPending) {
      return;
    }
    setActionPending(true);
    setActionError(null);
    const alreadyRewarded = growthRewardsForTask(task).some(
      candidate => candidate.kind === 'task_first_start',
    );
    void runtime
      .startSelectedTask(task.id)
      .then(started => focus.start(started.id, plannedMinutes).then(focusSession => ({
        started,
        focusSession,
        firstStartRewarded:
          !alreadyRewarded && growthRewardsForTask(started).some(
            candidate => candidate.kind === 'task_first_start',
          ),
      })))
      .then(({started, focusSession, firstStartRewarded}) => {
        focusContinuationRef.current = {
          taskId: started.id,
          focusSessionId: focusSession.id,
        };
        recordMetric('focus_started', {
          durationMs:
            currentSheetOpenedAtRef.current === null
              ? 0
              : Math.max(
                  0,
                  props.metricClock.monotonicNow() - currentSheetOpenedAtRef.current,
                ),
          source,
          success: true,
          taskRef: task.id,
        });
        if (firstStartRewarded) {
          setReward({
            kicker: '第一次开始',
            taskTitle: started.title,
            points: FIRST_START_REWARD_POINTS,
            totalScore: snapshot.growthScore + FIRST_START_REWARD_POINTS,
            reason: '第一次真正开始，行动已经计入成长。',
          });
          recordMetric('reward_shown', {
            source: 'task_first_start',
            success: true,
            taskRef: started.id,
          });
          if (rewardTimerRef.current !== null) clearTimeout(rewardTimerRef.current);
          rewardTimerRef.current = setTimeout(() => {
            setReward(null);
            rewardTimerRef.current = null;
          }, 4_000);
        }
        setEditorMode(null);
        setTab('focus');
      })
      .catch(reason => {
        setActionError(userFacingError(reason, USER_COPY.taskStartFailed));
      })
      .finally(() => setActionPending(false));
  }

  function startPlannedWork(
    task: Task,
    planned: PlannedWorkSession,
  ): Promise<void> {
    if (focus === null || actionPending) return Promise.resolve();
    if (planned.focusSessionId !== undefined) {
      return Promise.reject(new Error('PLANNED_WORK_ALREADY_STARTED'));
    }
    setActionPending(true);
    setActionError(null);
    return runtime
      .startSelectedTask(task.id)
      .then(started => focus.start(started.id, planned.plannedMinutes))
      .then(focusSession => {
        const linked = bindPlannedWorkSessionFocus({
          task,
          plannedSessionId: planned.id,
          focusSessionId: focusSession.id,
          now: props.now(),
        });
        focusContinuationRef.current = {
          taskId: task.id,
          focusSessionId: focusSession.id,
          plannedSessionId: planned.id,
        };
        const patch: P13TaskPatch = {
          plannedWorkSessions: linked.plannedWorkSessions ?? [],
        };
        return runtime.updateTask(task.id, patch as never).then(() => undefined);
      })
      .then(() => {
        setProgressTaskId(null);
        setEditorMode(null);
        setTab('focus');
      })
      .catch(reason => {
        setActionError(userFacingError(reason, USER_COPY.taskStartFailed));
        throw reason;
      })
      .finally(() => setActionPending(false));
  }

  function interruptCurrentFocus(): void {
    if (focus === null) return;
    const context = focusContinuationRef.current;
    void focus.interrupt().then(() => {
      if (context === null) return;
      handledFocusSessionsRef.current.add(context.focusSessionId);
      setPostFocusTaskId(context.taskId);
      if (context.plannedSessionId === undefined) return;
      const task = snapshot.tasks.find(item => item.id === context.taskId);
      if (task === undefined) return;
      try {
        const settled = settlePlannedWorkSession({
          task,
          plannedSessionId: context.plannedSessionId,
          outcome: 'DONE',
          now: props.now(),
        });
        const patch: P13TaskPatch = {
          plannedWorkSessions: settled.plannedWorkSessions ?? [],
          nextStartAt:
            (settled as Task & {nextStartAt?: string | null}).nextStartAt ?? null,
        };
        void runtime.updateTask(task.id, patch as never).catch(() => undefined);
      } catch {
        // The ended focus session is authoritative even if a stale plan link cannot settle.
      }
    });
  }

  function completePostFocusStep(task: Task): void {
    if ((task.steps?.length ?? 0) === 0) {
      void runtime.completeFirstStep(task.id, null)
        .then(() => setPostFocusTaskId(null))
        .catch(reason => setActionError(userFacingError(reason, '步骤记录失败，请重试。')));
      return;
    }
    const next = completeActiveTaskStep(task, props.now());
    const patch: P13TaskPatch = {
      steps: next.steps ?? [],
      firstStep: next.firstStep ?? null,
      ...((next as Task & {progress?: TaskProgress}).progress === undefined
        ? {}
        : {progress: (next as Task & {progress: TaskProgress}).progress}),
    };
    void runtime.updateTask(task.id, patch as never)
      .then(() => setPostFocusTaskId(null))
      .catch(reason => setActionError(userFacingError(reason, '步骤记录失败，请重试。')));
  }

  function completeSelectedTask(): void {
    if (selectedTask === null || actionPending) {
      return;
    }
    const completedTask = selectedTask;
    const previousStatus = completedTask.status === 'in_progress'
      ? 'in_progress'
      : 'pending';
    setActionPending(true);
    setActionError(null);
    const completionStartedAt = props.metricClock.monotonicNow();
    void runtime.completeTask(selectedTask.id)
      .then(result => {
        recordMetric('task_completed', {
          durationMs: Math.max(
            0,
            props.metricClock.monotonicNow() - completionStartedAt,
          ),
          source: 'task_sheet',
          success: true,
          taskRef: result.task.id,
        });
        const totalScore = snapshot.growthScore + result.points;
        const completedQuadrant = effectiveQuadrantForTask(
          result.task,
          result.task.completedAt ?? priorityNow,
        );
        setReward({
          kicker: '任务已完成',
          taskTitle: result.task.title,
          points: result.points,
          totalScore,
          reason: `完成${QUADRANT_HOME_META[completedQuadrant].title}任务，行动已计入成长。`,
        });
        AccessibilityInfo.announceForAccessibility(
          `任务已完成，成长值增加 ${result.points}，当前累计 ${totalScore}`,
        );
        recordMetric('reward_shown', {
          durationMs: Math.max(
            0,
            props.metricClock.monotonicNow() - completionStartedAt,
          ),
          source: 'task_completion',
          success: true,
          taskRef: result.task.id,
        });
        if (rewardTimerRef.current !== null) {
          clearTimeout(rewardTimerRef.current);
        }
        rewardTimerRef.current = setTimeout(() => {
          setReward(null);
          rewardTimerRef.current = null;
        }, 4_000);
        setCompletionUndo({
          taskId: result.task.id,
          taskTitle: result.task.title,
          points: result.points,
          previousStatus,
        });
        if (completionUndoTimerRef.current !== null) {
          clearTimeout(completionUndoTimerRef.current);
        }
        completionUndoTimerRef.current = setTimeout(() => {
          setCompletionUndo(null);
          completionUndoTimerRef.current = null;
        }, 5_000);
        setEditorMode(null);
        runtime.closeTask();
      })
      .catch(reason => {
        setActionError(userFacingError(reason, USER_COPY.taskCompleteFailed));
      })
      .finally(() => setActionPending(false));
  }

  function completeSelectedFirstStep(nextStep?: string | null): void {
    if (selectedTask === null || actionPending) return;
    setActionPending(true);
    setActionError(null);
    void runtime.completeFirstStep(selectedTask.id, nextStep)
      .then(result => {
        if (result.points > 0) {
          setReward({
            kicker: '第一小步完成',
            taskTitle: result.task.title,
            points: result.points,
            totalScore: snapshot.growthScore + result.points,
            reason: '第一小步已经完成，整项任务仍可继续推进。',
          });
          AccessibilityInfo.announceForAccessibility(
            `第一小步已完成，成长值增加 ${result.points}`,
          );
          recordMetric('reward_shown', {
            source: 'task_first_step',
            success: true,
            taskRef: result.task.id,
          });
          if (rewardTimerRef.current !== null) clearTimeout(rewardTimerRef.current);
          rewardTimerRef.current = setTimeout(() => {
            setReward(null);
            rewardTimerRef.current = null;
          }, 4_000);
        }
      })
      .catch(reason => {
        setActionError(userFacingError(reason, '第一小步记录失败，请重试。'));
      })
      .finally(() => setActionPending(false));
  }

  function undoSelectedFirstStep(): void {
    if (selectedTask === null || actionPending) return;
    setActionPending(true);
    setActionError(null);
    void runtime.undoFirstStep(selectedTask.id)
      .then(dismissReward)
      .catch(reason => {
        setActionError(userFacingError(reason, '撤销第一小步失败，请重试。'));
      })
      .finally(() => setActionPending(false));
  }

  function dismissReward(): void {
    if (rewardTimerRef.current !== null) {
      clearTimeout(rewardTimerRef.current);
      rewardTimerRef.current = null;
    }
    setReward(null);
  }

  function deleteSelectedTask(): void {
    if (selectedTask === null || actionPending) {
      return;
    }
    setActionPending(true);
    setActionError(null);
    void runtime.softDeleteTask(selectedTask.id)
      .then(() => {
        setEditorMode(null);
        runtime.closeTask();
      })
      .catch(reason => {
        setActionError(userFacingError(reason, USER_COPY.taskDeleteFailed));
      })
      .finally(() => setActionPending(false));
  }

  function undoLastCompletion(): void {
    if (completionUndo === null || actionPending) {
      return;
    }
    const pendingUndo = completionUndo;
    setActionPending(true);
    setActionError(null);
    void runtime.undoCompleteTask(
      pendingUndo.taskId,
      pendingUndo.previousStatus,
    )
      .then(() => {
        recordMetric('task_completion_undone', {
          source: 'undo',
          success: true,
          taskRef: pendingUndo.taskId,
        });
        setReward(null);
        setCompletionUndo(null);
        if (completionUndoTimerRef.current !== null) {
          clearTimeout(completionUndoTimerRef.current);
          completionUndoTimerRef.current = null;
        }
      })
      .catch(reason => {
        setActionError(userFacingError(reason, USER_COPY.completionUndoFailed));
      })
      .finally(() => setActionPending(false));
  }

  function rememberMove(move: MoveUndo): void {
    if (moveUndoTimerRef.current !== null) {
      clearTimeout(moveUndoTimerRef.current);
    }
    setMoveUndo(move);
    moveUndoTimerRef.current = setTimeout(() => {
      setMoveUndo(null);
      moveUndoTimerRef.current = null;
    }, 5_000);
  }

  function priorityPatchForQuadrant(quadrant: Quadrant): Readonly<{
    important: boolean;
    urgent: boolean;
    prioritySchemaVersion: 1;
    importanceScore: number;
    manualUrgencyScore: number;
    urgencyMode: 'manual';
  }> {
    const flags = flagsForQuadrant(quadrant);
    const coordinates = legacyPriorityCoordinates(flags.important, flags.urgent);
    return {
      ...flags,
      prioritySchemaVersion: TASK_PRIORITY_SCHEMA_VERSION,
      importanceScore: coordinates.importanceScore,
      manualUrgencyScore: coordinates.manualUrgencyScore,
      urgencyMode: 'manual',
    };
  }

  function moveSelectedTask(to: Quadrant): void {
    if (selectedTask === null || actionPending) {
      return;
    }
    const from = effectiveQuadrantForTask(selectedTask, priorityNow);
    if (from === to) {
      return;
    }
    const flags = priorityPatchForQuadrant(to);
    setActionPending(true);
    setActionError(null);
    void runtime.updateTask(selectedTask.id, flags)
      .then(updated => {
        recordMetric('task_move_committed', {
          source: 'task_sheet',
          success: true,
          taskRef: updated.id,
        });
        setDraft(current => ({...current, quadrant: to}));
        rememberMove({taskId: updated.id, taskTitle: updated.title, from, to});
        setEditorMode(null);
        runtime.closeTask();
      })
      .catch(reason => {
        setActionError(userFacingError(reason, USER_COPY.taskMoveFailed));
      })
      .finally(() => setActionPending(false));
  }

  function rescheduleSelectedTask(
    shortcut: NextStartShortcut,
    customAt?: string,
  ): void {
    if (selectedTask === null || actionPending) {
      return;
    }
    let nextStartAt: string | null;
    try {
      nextStartAt = resolveNextStartShortcut({
        shortcut,
        now: props.now(),
        ...(customAt === undefined ? {} : {customAt}),
        ...(props.currentTimeZone === undefined
          ? {}
          : {currentTimeZone: props.currentTimeZone}),
        ...(props.resolveLocalTrigger === undefined
          ? {}
          : {resolveLocalTrigger: props.resolveLocalTrigger}),
      });
    } catch (reason) {
      setActionError(userFacingError(reason, USER_COPY.taskSaveFailed));
      return;
    }
    setActionPending(true);
    setActionError(null);
    const currentPostponed = (selectedTask as TaskWithPriority).postponedCount ?? 0;
    const updateNextStart = runtime.updateTask as unknown as (
      taskId: string,
      patch: {
        supportSchemaVersion: 1;
        nextStartAt: string | null;
        postponedCount: number;
      },
    ) => Promise<Task>;
    void updateNextStart(selectedTask.id, {
      supportSchemaVersion: TASK_SUPPORT_SCHEMA_VERSION,
      nextStartAt,
      postponedCount: currentPostponed + 1,
    })
      .then(() => {
        setEditorMode(null);
        runtime.closeTask();
      })
      .catch(reason => {
        setActionError(userFacingError(reason, USER_COPY.taskSaveFailed));
      })
      .finally(() => setActionPending(false));
  }

  function saveSupportAndStart(
    patch: Record<string, unknown>,
    minutes: 2 | 5 | 15 | 25,
    source: string,
  ): void {
    if (selectedTask === null || focus === null || actionPending) return;
    const taskId = selectedTask.id;
    setActionPending(true);
    setActionError(null);
    const updateSupport = runtime.updateTask as unknown as (
      id: string,
      value: Record<string, unknown>,
    ) => Promise<Task>;
    void updateSupport(taskId, patch)
      .then(() => runtime.startSelectedTask(taskId))
      .then(started => focus.start(started.id, minutes))
      .then(() => {
        recordMetric('focus_started', {
          source,
          success: true,
          taskRef: taskId,
        });
        setEditorMode(null);
        setTab('focus');
      })
      .catch(reason => {
        setActionError(userFacingError(reason, USER_COPY.taskSaveFailed));
      })
      .finally(() => setActionPending(false));
  }

  function submitStuckRepair(submission: StuckRepairSubmission): void {
    if (selectedTask === null || submission.focusMinutes === null) return;
    const repair = createStuckRepairRecord({
      taskId: selectedTask.id,
      reason: submission.reason,
      action: submission.action,
      note: submission.note,
      firstStep: submission.firstStep,
      focusMinutes: submission.focusMinutes,
      now: props.now(),
    });
    saveSupportAndStart({
      supportSchemaVersion: TASK_SUPPORT_SCHEMA_VERSION,
      stuckRepair: repair,
      ...(submission.firstStep === null ? {} : {firstStep: submission.firstStep}),
    }, submission.focusMinutes, 'stuck_repair');
  }

  function submitRescuePlan(submission: RescueSubmission): void {
    if (selectedTask === null) return;
    const plan = createTaskRescuePlan({
      taskId: selectedTask.id,
      ...submission,
      now: props.now(),
    });
    saveSupportAndStart({
      supportSchemaVersion: TASK_SUPPORT_SCHEMA_VERSION,
      rescuePlan: plan,
      firstStep: plan.nextRequiredStep,
    }, submission.focusMinutes, 'rescue_plan');
  }

  function acknowledgePostponePrompt(): void {
    if (selectedTask === null) return;
    const updateSupport = runtime.updateTask as unknown as (
      id: string,
      value: Record<string, unknown>,
    ) => Promise<Task>;
    void updateSupport(selectedTask.id, {
      supportSchemaVersion: TASK_SUPPORT_SCHEMA_VERSION,
      postponePromptAcknowledgedKey: postponePromptKey(selectedTask, priorityNow),
    }).catch(() => undefined);
  }

  function shrinkSelectedStep(): void {
    if (selectedTask === null || actionPending) return;
    const step = selectedTask.firstStep == null
      ? `先用 5 分钟开始：${selectedTask.title}`
      : selectedTask.firstStep;
    const updateSupport = runtime.updateTask as unknown as (
      id: string,
      value: Record<string, unknown>,
    ) => Promise<Task>;
    setActionPending(true);
    void updateSupport(selectedTask.id, {
      firstStep: step,
      estimatedMinutes: 5,
      supportSchemaVersion: TASK_SUPPORT_SCHEMA_VERSION,
      postponePromptAcknowledgedKey: postponePromptKey(selectedTask, priorityNow),
    })
      .catch(reason => setActionError(userFacingError(reason, USER_COPY.taskSaveFailed)))
      .finally(() => setActionPending(false));
  }

  function abandonSelectedTask(): void {
    if (selectedTask === null || actionPending) return;
    const taskId = selectedTask.id;
    const updateSupport = runtime.updateTask as unknown as (
      id: string,
      value: Record<string, unknown>,
    ) => Promise<Task>;
    setActionPending(true);
    void updateSupport(taskId, {
      supportSchemaVersion: TASK_SUPPORT_SCHEMA_VERSION,
      abandonReason: 'no_longer_needed',
      postponePromptAcknowledgedKey: postponePromptKey(selectedTask, priorityNow),
    })
      .then(() => runtime.softDeleteTask(taskId))
      .then(() => {
        setEditorMode(null);
        runtime.closeTask();
      })
      .catch(reason => setActionError(userFacingError(reason, USER_COPY.taskDeleteFailed)))
      .finally(() => setActionPending(false));
  }

  function updateSelectedTaskProgress(progress: TaskProgress): void {
    if (selectedTask === null || actionPending) {
      return;
    }
    const currentProgress = progressForTask(selectedTask);
    if (currentProgress === progress) {
      return;
    }
    setActionPending(true);
    setActionError(null);
    const updateProgress = runtime.updateTask as unknown as (
      taskId: string,
      patch: {progress: TaskProgress},
    ) => Promise<Task>;
    void updateProgress(selectedTask.id, {progress})
      .catch(reason => {
        setActionError(userFacingError(reason, USER_COPY.progressSaveFailed));
      })
      .finally(() => setActionPending(false));
  }

  function updateSelectedUrgencyMode(mode: UrgencyMode): void {
    if (selectedTask === null || actionPending) return;
    const coordinates = priorityCoordinatesForTask(selectedTask);
    const patch = {
      prioritySchemaVersion: TASK_PRIORITY_SCHEMA_VERSION,
      importanceScore: coordinates.importanceScore,
      manualUrgencyScore:
        mode === 'manual'
          ? effectiveUrgencyForTask(selectedTask, priorityNow)
          : coordinates.manualUrgencyScore,
      urgencyMode: mode,
    };
    setActionPending(true);
    const updatePriority = runtime.updateTask as unknown as (
      taskId: string,
      value: typeof patch,
    ) => Promise<Task>;
    void updatePriority(selectedTask.id, patch)
      .catch(reason => setActionError(userFacingError(reason, USER_COPY.taskSaveFailed)))
      .finally(() => setActionPending(false));
  }

  function copySelectedTask(): void {
    if (selectedTask === null || actionPending) return;
    setActionPending(true);
    setActionError(null);
    const createCopy = runtime.createTask as unknown as (
      input: ReturnType<typeof copyTaskInput>,
    ) => Promise<Task>;
    void createCopy(copyTaskInput(selectedTask))
      .then(task => {
        if (
          selectedTask.steps === undefined &&
          selectedTask.completionDefinition == null
        ) return task;
        const template = cloneTaskStepTemplate({
          source: selectedTask,
          taskId: task.id,
          now: props.now(),
          idGenerator: (() => {
            let index = 0;
            return () => `${task.id}:copy-step:${++index}`;
          })(),
        });
        const patch: P13TaskPatch = {
          completionDefinition: selectedTask.completionDefinition ?? null,
          ...template,
        };
        return runtime.updateTask(task.id, patch as never);
      })
      .then(task => {
        setEditorMode(null);
        runtime.selectTask(task.id);
      })
      .catch(reason => setActionError(userFacingError(reason, USER_COPY.taskSaveFailed)))
      .finally(() => setActionPending(false));
  }

  function stopSelectedRepeat(): void {
    if (selectedTask === null || actionPending) return;
    setActionPending(true);
    const stopRepeat = runtime.updateTask as unknown as (
      taskId: string,
      patch: {repeatRule: null},
    ) => Promise<Task>;
    void stopRepeat(selectedTask.id, {repeatRule: null})
      .catch(reason => setActionError(userFacingError(reason, USER_COPY.taskSaveFailed)))
      .finally(() => setActionPending(false));
  }

  function dropTaskOnQuadrant(
    taskId: string,
    scores: Readonly<{importanceScore: number; manualUrgencyScore: number}>,
  ): void {
    const task = snapshot.tasks.find(candidate => candidate.id === taskId);
    if (task === undefined || actionPending) {
      return;
    }
    const from = effectiveQuadrantForTask(task, priorityNow);
    const to = deriveQuadrantFromPriority(
      scores.importanceScore,
      scores.manualUrgencyScore,
    );
    setActionPending(true);
    setActionError(null);
    const flags = flagsForQuadrant(to);
    const updatePriority = runtime.updateTask as unknown as (
      id: string,
      patch: Readonly<{
        important: boolean;
        urgent: boolean;
        prioritySchemaVersion: 1;
        importanceScore: number;
        manualUrgencyScore: number;
        urgencyMode: 'manual';
      }>,
    ) => Promise<Task>;
    void updatePriority(task.id, {
      ...flags,
      prioritySchemaVersion: TASK_PRIORITY_SCHEMA_VERSION,
      importanceScore: scores.importanceScore,
      manualUrgencyScore: scores.manualUrgencyScore,
      urgencyMode: 'manual',
    })
      .then(updated => {
        recordMetric('task_move_committed', {
          source: 'drag',
          success: true,
          taskRef: updated.id,
        });
        rememberMove({taskId: updated.id, taskTitle: updated.title, from, to});
        runtime.closeTask();
      })
      .catch(reason => {
        setActionError(userFacingError(reason, USER_COPY.taskMoveFailed));
      })
      .finally(() => setActionPending(false));
  }

  function undoLastMove(): void {
    if (moveUndo === null || actionPending) {
      return;
    }
    const pendingUndo = moveUndo;
    const flags = priorityPatchForQuadrant(pendingUndo.from);
    setActionPending(true);
    setActionError(null);
    void runtime.updateTask(pendingUndo.taskId, flags)
      .then(() => {
        recordMetric('task_move_undone', {
          source: 'undo',
          success: true,
          taskRef: pendingUndo.taskId,
        });
        setDraft(current => ({...current, quadrant: pendingUndo.from}));
        setMoveUndo(null);
        if (moveUndoTimerRef.current !== null) {
          clearTimeout(moveUndoTimerRef.current);
          moveUndoTimerRef.current = null;
        }
      })
      .catch(reason => {
        setActionError(userFacingError(reason, USER_COPY.taskMoveUndoFailed));
      })
      .finally(() => setActionPending(false));
  }

  if (historyOpen) {
    return (
      <FocusHistoryScreen
        day={props.now().slice(0, 10)}
        history={props.reviewHistory}
        onBack={() => setHistoryOpen(false)}
        onEndToday={() => {
          setHistoryOpen(false);
          setSummaryOpen(true);
        }}
      />
    );
  }
  if (summaryOpen) {
    return (
      <DayClosureScreen
        onBack={() => setSummaryOpen(false)}
        onConfirmed={setTomorrowSnapshot}
        service={props.dayClosure}
        {...(props.tomorrowFirstReminder === undefined
          ? {}
          : {tomorrowFirstReminder: props.tomorrowFirstReminder})}
      />
    );
  }
  if (
    backupOpen &&
    props.localBackup !== undefined &&
    props.backupFileBridge !== undefined
  ) {
    return (
      <LocalBackupScreen
        bridge={props.backupFileBridge}
        localBackup={props.localBackup}
        now={props.now}
        onBack={() => setBackupOpen(false)}
        onRestored={async () => {
          await runtime.refreshProjection();
          setBackupOpen(false);
        }}
      />
    );
  }

  const growth = growthProgressForScore(snapshot.growthScore);
  const tomorrowRecord = tomorrowSnapshot?.record ?? null;
  const tomorrowTarget = tomorrowSnapshot?.target ?? null;
  const tomorrowFirstVisible =
    tomorrowRecord !== null &&
    tomorrowTarget !== null &&
    (tomorrowRecord.state === 'pending' || tomorrowRecord.state === 'starting');
  const tomorrowFirstIsNextDay =
    tomorrowFirstVisible &&
    tomorrowSnapshot !== null &&
    tomorrowRecord.dayKey < tomorrowSnapshot.currentDay;
  const latestGrowthRewards = recentGrowthRewards(snapshot.tasks, 5);
  const growthInsight = selectGrowthInsight({
    tasks: snapshot.tasks,
    now: priorityNow,
    dismissal: settings.insightDismissal,
  });

  function selectViewMode(mode: ViewMode): void {
    setViewMode(mode);
    setSettings(current => ({
      ...current,
      viewMode: mode,
      viewModeManuallySelected: true,
    }));
    if (mode === 'map') {
      setListTarget(null);
    }
    void props.preferences.writeSettings({
      viewMode: mode,
      viewModeManuallySelected: true,
    }).catch(() => undefined);
  }

  function updateSettings(patch: Partial<QuadrantHomeSettings>): void {
    setSettings(current => ({...current, ...patch}));
    void props.preferences.writeSettings(patch).catch(() => undefined);
  }

  function acceptFocusDurationRecommendation(): void {
    if (focusDurationRecommendation === null) return;
    const minutes = focusDurationRecommendation.candidateMinutes;
    updateSettings({
      preferredFocusMinutes: minutes,
      focusDurationSuggestionDismissedAt: null,
    });
    setFocusDurationRecommendation(null);
    AccessibilityInfo.announceForAccessibility(`已将 ${minutes} 分钟设为常用时长`);
  }

  function dismissFocusDurationRecommendation(): void {
    updateSettings({focusDurationSuggestionDismissedAt: props.now()});
    setFocusDurationRecommendation(null);
  }

  function performGrowthInsight(insight: GrowthInsight): void {
    setTab('quadrants');
    openTask(
      insight.action.taskId,
      'growth_insight',
      insight.action.kind === 'reschedule_task' ? 'reschedule' : 'details',
    );
  }

  function dismissGrowthInsight(insight: GrowthInsight): void {
    updateSettings({
      insightDismissal: {id: insight.id, dismissedAt: props.now()},
    });
  }

  function setLowEnergyMode(minutes: 2 | 5): void {
    const lowEnergyMode = enableLowEnergyMode(props.now(), minutes);
    updateSettings({lowEnergyMode});
    setLowEnergySheetOpen(false);
    setActionPointerIndex(0);
  }

  function disableLowEnergyMode(): void {
    updateSettings({lowEnergyMode: DEFAULT_LOW_ENERGY_MODE});
    setLowEnergySheetOpen(false);
    setActionPointerIndex(0);
  }

  function dismissTips(): void {
    setTipsVisible(false);
    updateSettings({tipsSeen: true});
  }

  function showQuadrantList(quadrant: Quadrant): void {
    setListTarget(quadrant);
    selectViewMode('list');
  }

  function primaryTaskFor(action: HomePrimaryAction): Task | null {
    return 'taskId' in action
      ? tasks.find(task => task.id === action.taskId) ?? null
      : null;
  }

  function activateHomePrimary(): void {
    const action = homePrimaryAction;
    const task = primaryTaskFor(action);
    recordMetric('home_primary_activated', {
      source: action.type.toLowerCase(),
      success: action.type === 'CAPTURE_FIRST_TASK' || task !== null,
      ...(task === null ? {} : {taskRef: task.id}),
    });
    switch (action.type) {
      case 'RESUME_ACTIVE_FOCUS':
        if (task !== null) {
          recordMetric('focus_resumed', {
            source: 'home_primary',
            success: true,
            taskRef: task.id,
          });
          setTab('focus');
        }
        return;
      case 'CONTINUE_TASK':
        if (task !== null) startFiveMinutes(task, 15, 'home_primary');
        return;
      case 'TRIAGE_URGENT_UNSORTED':
        if (task !== null) openOrganizer('triage', task.id);
        return;
      case 'START_RECOMMENDED':
        if (task !== null) {
          startFiveMinutes(
            task,
            commonFocusMinutes,
            'home_primary',
          );
        }
        return;
      case 'CAPTURE_FIRST_TASK':
        openCreate(undefined, 'home_primary');
        return;
      case 'NONE':
        return;
    }
  }

  const homePrimaryTask = primaryTaskFor(homePrimaryAction);
  const focusAgenda = selectFocusAgenda(tasks);
  const nextFocusAgenda = focusAgenda[0] ?? null;
  const todayFocusAgenda = selectTodayFocusAgenda(tasks, priorityNow, 3);
  const todayFocusAgendaCount = selectTodayFocusAgenda(tasks, priorityNow, 256).length;
  const quickFocusTask = homePrimaryTask ?? tasks[0] ?? null;
  const hasStartedToday = focusHistoryItems.some(
    session => session.startedAt.slice(0, 10) === priorityNow.slice(0, 10),
  );
  const growthPageSummary = selectGrowthPageSummary({
    tasks: snapshot.tasks,
    sessions: focusHistoryItems,
    now: priorityNow,
  });

  return (
    <DarkThemeContext.Provider value={dark}>
    <View
      accessibilityLabel="先做5分钟应用"
      style={[styles.safeArea, dark && styles.safeAreaDark]}>
      <ScrollView contentContainerStyle={styles.content}>
        {tab === 'quadrants' ? (
          <>
            <PageHeader
              dark={dark}
              eyebrow={formatPageDate(priorityNow)}
              title={hasStartedToday ? '今天已经开始过了 ✓' : '今天先开始一次'}
              trailing={(
                <View style={styles.headerActions}>
                <Pressable
                  accessibilityLabel="查找任务"
                  accessibilityRole="button"
                  onPress={() => openOrganizer('search')}
                  style={styles.headerUtility}>
                  <Text style={styles.headerUtilityText}>查找</Text>
                </Pressable>
                {editorMode === null ? (
                  <Pressable
                    accessibilityLabel="添加任务"
                    accessibilityRole="button"
                    onPress={() => openCreate()}
                    style={styles.headerUtility}>
                    <Text style={styles.headerUtilityText}>＋</Text>
                  </Pressable>
                ) : null}
                </View>
              )}
            />
            {unsortedTasks.length === 0 ? null : (
              <Pressable
                accessibilityLabel={`待判断 ${unsortedTasks.length} 项`}
                accessibilityRole="button"
                onPress={() => openOrganizer('triage')}
                style={[styles.unsortedBadge, dark && styles.surfaceDark]}>
                <Text style={[styles.unsortedBadgeText, dark && styles.textDark]}>
                  待判断 · {unsortedTasks.length}
                </Text>
              </Pressable>
            )}
            {homePrimaryAction.type === 'NONE' ? null : (
              <View
                accessibilityLabel="首页主行动"
                style={[styles.actionPointer, dark && styles.surfaceDark]}>
                <Text style={[styles.continuationKicker, dark && styles.textMutedDark]}>
                  {homePrimaryAction.type === 'RESUME_ACTIVE_FOCUS'
                    ? '继续刚才的任务'
                    : homePrimaryAction.type === 'CONTINUE_TASK'
                      ? '继续刚才的任务'
                      : homePrimaryAction.type === 'TRIAGE_URGENT_UNSORTED'
                        ? '先判断这项即将到期的任务'
                        : homePrimaryAction.type === 'START_RECOMMENDED'
                          ? '现在先做'
                          : '先记下来'}
                </Text>
                <Text
                  numberOfLines={2}
                  style={[styles.continuationTitle, dark && styles.textDark]}>
                  {homePrimaryAction.type === 'CAPTURE_FIRST_TASK'
                    ? '记下第一项任务'
                    : homePrimaryTask?.title ?? '当前任务'}
                </Text>
                {homePrimaryTask?.firstStep == null ? null : (
                  <Text
                    numberOfLines={2}
                    style={[styles.firstStepText, dark && styles.textDark]}>
                    第一小步：{homePrimaryTask.firstStep}
                  </Text>
                )}
                {homePrimaryAction.type !== 'START_RECOMMENDED' ||
                homePrimaryAction.reasons.length === 0 ? null : (
                  <Text style={[styles.sheetSubtitle, dark && styles.textMutedDark]}>
                    {homePrimaryAction.reasons.join(' · ')}
                  </Text>
                )}
                <Action
                  compact
                  displayLabel={
                    homePrimaryAction.type === 'RESUME_ACTIVE_FOCUS'
                      ? '返回专注'
                      : homePrimaryAction.type === 'CONTINUE_TASK'
                        ? '继续 15 分钟'
                        : homePrimaryAction.type === 'TRIAGE_URGENT_UNSORTED'
                          ? '现在判断'
                          : homePrimaryAction.type === 'START_RECOMMENDED'
                            ? `先做 ${commonFocusMinutes} 分钟`
                            : '记下第一项'
                  }
                  label={
                    homePrimaryAction.type === 'RESUME_ACTIVE_FOCUS'
                      ? `返回正在进行的专注：${homePrimaryTask?.title ?? '当前任务'}`
                      : homePrimaryAction.type === 'CONTINUE_TASK'
                        ? `继续任务 15 分钟：${homePrimaryTask?.title ?? '当前任务'}`
                        : homePrimaryAction.type === 'TRIAGE_URGENT_UNSORTED'
                          ? `判断任务：${homePrimaryTask?.title ?? '当前任务'}`
                          : homePrimaryAction.type === 'START_RECOMMENDED'
                            ? `先做${commonFocusMinutes}分钟：${homePrimaryTask?.title ?? '当前任务'}`
                            : '记下第一项任务'
                  }
                  onPress={activateHomePrimary}
                />
                {homePrimaryAction.type === 'START_RECOMMENDED' ? (
                  <Action
                    compact
                    label="换一个行动建议"
                    displayLabel="换一个"
                    onPress={() => setActionPointerIndex(index => index + 1)}
                    secondary
                  />
                ) : null}
              </View>
            )}
            {!tomorrowFirstVisible || tomorrowTarget === null ? null : (
              <View
                accessibilityLabel="明日第一项"
                style={[styles.hybridNotice, dark && styles.surfaceDark]}>
                <Text style={[styles.sheetSubtitle, dark && styles.textDark]}>
                  {tomorrowFirstIsNextDay
                    ? `明日第一项：${tomorrowTarget.title}`
                    : `明日第一项已设定：${tomorrowTarget.title}`}
                </Text>
                {tomorrowFirstIsNextDay ? (
                  <Action
                    disabled={actionPending}
                    label="开始明日第一项5分钟"
                    onPress={startTomorrowFirst}
                    secondary
                  />
                ) : null}
                {props.tomorrowFirstReminder === undefined ? null : props.tomorrowFirstReminder.settingsEnabled === true ? (
                  <>
                    <Action
                      label="提醒设置"
                      onPress={openTomorrowReminderSettings}
                      secondary
                    />
                    {tomorrowReminderEnabled ? (
                      <Text style={[styles.sheetSubtitle, dark && styles.textMutedDark]}>
                        明日提醒：约 {tomorrowReminderAcceptedTime}
                      </Text>
                    ) : null}
                  </>
                ) : null}
                {tomorrowReminderSettingsOpen &&
                props.tomorrowFirstReminder?.settingsEnabled === true ? (
                  <View style={styles.sheetActions}>
                    <TextInput
                      accessibilityLabel="提醒时间"
                      onChangeText={setTomorrowReminderDraftTime}
                      style={[styles.input, dark && styles.inputDark]}
                      value={tomorrowReminderDraftTime}
                    />
                    {tomorrowReminderEnabled ? (
                      <>
                        <Action
                          label="保存提醒时间"
                          onPress={saveTomorrowReminderTime}
                          secondary
                        />
                        <Action
                          label="关闭提醒"
                          onPress={disableTomorrowReminder}
                          secondary
                        />
                      </>
                    ) : (
                      <Action label="开启提醒" onPress={enableTomorrowReminder} secondary />
                    )}
                  </View>
                ) : null}
                {tomorrowReminderStatus === 'denied' ? (
                  <Text style={[styles.sheetSubtitle, dark && styles.textMutedDark]}>
                    提醒未开启，不影响明日第一项
                  </Text>
                ) : null}
                {tomorrowReminderErrorCode === null ? null : (
                  <Text
                    accessibilityLabel={tomorrowReminderErrorCode}
                    accessibilityLiveRegion="assertive"
                    style={styles.error}>
                    {tomorrowReminderErrorCode === 'LOCAL_TRIGGER_NOT_FUTURE' ||
                    tomorrowReminderErrorCode === 'TOMORROW_FIRST_WALL_CLOCK_INVALID'
                      ? '提醒时间无效，请重试'
                      : '提醒设置失败，请重试'}
                  </Text>
                )}
              </View>
            )}
            {lowEnergyMode.enabled ? (
              <Pressable
                accessibilityLabel="今天只推进一小步"
                accessibilityRole="button"
                onPress={() => setLowEnergySheetOpen(true)}>
                <Text style={[styles.lowEnergyStatus, dark && styles.textMutedDark]}>
                  今天只推进一小步
                </Text>
              </Pressable>
            ) : null}
            {systemNotice === null ? null : (
              <Pressable
                accessibilityLabel="系统入口状态"
                accessibilityRole="button"
                onPress={() => setSystemNotice(null)}
                style={[styles.hybridNotice, dark && styles.surfaceDark]}>
                <Text style={[styles.sheetSubtitle, dark && styles.textDark]}>
                  {systemNotice}
                </Text>
              </Pressable>
            )}
            {hybridMoveNotice === null ? null : (
              <Pressable
                accessibilityLabel="截止时间象限变化提示"
                accessibilityRole="button"
                onPress={() => setHybridMoveNotice(null)}
                style={[styles.hybridNotice, dark && styles.surfaceDark]}>
                <Text style={[styles.sheetSubtitle, dark && styles.textDark]}>
                  {hybridMoveNotice}
                </Text>
              </Pressable>
            )}
            <View style={[styles.viewSwitcher, dark && styles.surfaceRaisedDark]}>
              <SegmentedButton label="地图" onPress={() => selectViewMode('map')} selected={viewMode === 'map'} />
              <SegmentedButton label="清单" onPress={() => selectViewMode('list')} selected={viewMode === 'list'} />
            </View>
            {!viewPreferenceLoaded ? null : viewMode === 'map' ? (
              <MapView
                actionPending={actionPending}
                onAdd={openCreate}
                onShowList={showQuadrantList}
                onTaskDrop={dropTaskOnQuadrant}
                onTask={openTask}
                 nowInput={priorityNow}
                recommendedId={snapshot.recommendation?.id ?? null}
                reduceMotion={settings.reduceMotion}
                largeText={fontScale >= 1.5}
                selectedId={selectedTask?.id ?? null}
                tasks={tasks}
              />
            ) : (
              <View style={styles.listStack}>
                {listTarget === null ? null : (
                  <Text accessibilityLiveRegion="polite" style={[styles.listTargetNotice, dark && styles.surfaceDark, dark && styles.textDark]}>
                    已定位到{QUADRANT_HOME_META[listTarget].title}，完整清单如下。
                  </Text>
                )}
                <ListView
                  defaultFocusMinutes={
                    commonFocusMinutes
                  }
                  nowInput={priorityNow}
                  onAdd={openCreate}
                 onStart={task => startFiveMinutes(
                   task,
                   commonFocusMinutes,
                 )}
                  onTask={openTask}
                  recommendedId={snapshot.recommendation?.id ?? null}
                  tasks={tasks}
                />
              </View>
            )}
            {snapshot.loaded && tasks.length === 0 ? (
              <View style={styles.emptyHome}>
                <Text style={[styles.emptyHomeTitle, dark && styles.textDark]}>四象限已经准备好</Text>
                <Text style={[styles.subtitle, dark && styles.textMutedDark]}>还没有活动任务。点任一象限，放入眼前最值得推进的一件事。</Text>
              </View>
            ) : null}
          </>
        ) : null}

        {tab === 'focus' ? (
          <View style={styles.tabPage}>
            <PageHeader dark={dark} title="专注" />
            {focus?.snapshot.state === 'running' ? (
              <View style={styles.focusHero}>
                <Text style={styles.focusLabel}>正在专注</Text>
                <Text style={styles.focusTask}>
                  {activeFocusTask?.title ?? '当前任务'}
                </Text>
                {activeFocusTask?.firstStep == null ? null : (
                  <Text style={styles.focusStep}>第一小步：{activeFocusTask.firstStep}</Text>
                )}
                <Text accessibilityLabel="5分钟剩余时间" style={styles.timer}>
                  {formatRemaining(focus.snapshot.remainingMs)}
                </Text>
                <Action
                  disabled={focus.lifecyclePending}
                  label="结束本次专注"
                  onPress={interruptCurrentFocus}
                  secondary
                />
              </View>
            ) : postFocusTask !== null ? (
              <View style={[styles.infoCard, dark && styles.surfaceDark]}>
                <Text style={[styles.infoTitle, dark && styles.textDark]}>
                  这几分钟推进得怎么样？
                </Text>
                {postFocusTask.completionDefinition == null ? null : (
                  <Text numberOfLines={2} style={[styles.subtitle, dark && styles.textMutedDark]}>
                    做到这里就算完成：{postFocusTask.completionDefinition}
                  </Text>
                )}
                <Action
                  label="完成了这一步"
                  onPress={() => completePostFocusStep(postFocusTask)}
                />
                <Action
                  label="继续 15 分钟"
                  onPress={() => {
                    setPostFocusTaskId(null);
                    startFiveMinutes(postFocusTask, 15, 'post_focus');
                  }}
                  secondary
                />
                <Action
                  label="安排下一次"
                  onPress={() => {
                    runtime.selectTask(postFocusTask.id);
                    setProgressTaskId(postFocusTask.id);
                    setPostFocusTaskId(null);
                  }}
                  secondary
                />
                <Action
                  label="这一步还没做完"
                  onPress={() => setPostFocusTaskId(null)}
                  secondary
                />
              </View>
            ) : nextFocusAgenda !== null ? (
              <HeroPanel accessibilityLabel="下一段专注" dark={dark}>
                <Text style={[styles.continuationKicker, dark && styles.textMutedDark]}>下一段专注</Text>
                <Text style={[styles.infoTitle, dark && styles.textDark]}>
                  {formatAgendaTime(nextFocusAgenda.session.plannedStartAt)} · {nextFocusAgenda.session.plannedMinutes} 分钟
                </Text>
                <Text style={[styles.continuationTitle, dark && styles.textDark]}>{nextFocusAgenda.task.title}</Text>
                {nextFocusAgenda.task.firstStep == null ? null : (
                  <Text style={[styles.firstStepText, dark && styles.textMutedDark]}>
                    第一步：{nextFocusAgenda.task.firstStep}
                  </Text>
                )}
                <Action label="现在开始" onPress={() => startPlannedWork(nextFocusAgenda.task, nextFocusAgenda.session)} />
                <Action
                  label="重新安排"
                  onPress={() => {
                    runtime.selectTask(nextFocusAgenda.task.id);
                    setProgressTaskId(nextFocusAgenda.task.id);
                  }}
                  secondary
                />
              </HeroPanel>
            ) : (
              <EmptyState
                action={<Action label="安排一段专注" onPress={() => {
                  if (quickFocusTask === null) {
                    selectTab('quadrants');
                    openCreate(undefined, 'focus_empty');
                    return;
                  }
                  runtime.selectTask(quickFocusTask.id);
                  setProgressTaskId(quickFocusTask.id);
                }} />}
                dark={dark}
                description="安排后，到时间会直接告诉你第一小步。"
                title="给重要任务留一小段时间"
              />
            )}

            {focus?.snapshot.state === 'running' || postFocusTask !== null || quickFocusTask === null ? null : (
              <View style={styles.pageSection}>
                <SectionHeader dark={dark} title="现在有一点时间？" />
                <View accessibilityLabel="快速专注时长" style={styles.durationGrid}>
                  {([2, 5, 15, 25] as const).map(minutes => (
                    <Action
                      compact
                      key={minutes}
                      label={`先做 ${minutes} 分钟`}
                      onPress={() => startFiveMinutes(quickFocusTask, minutes, 'focus_quick')}
                      secondary
                    />
                  ))}
                </View>
                <Pressable
                  accessibilityLabel="更多时长"
                  accessibilityRole="button"
                  onPress={() => setMoreDurationsOpen(value => !value)}>
                  <Text style={styles.textLink}>更多时长</Text>
                </Pressable>
                {moreDurationsOpen ? (
                  <View style={styles.durationGrid}>
                    <Action compact label="先做 50 分钟" onPress={() => startFiveMinutes(quickFocusTask, 50, 'focus_more')} secondary />
                    <Text style={[styles.sheetSubtitle, dark && styles.textMutedDark]}>自定义时长可在任务安排中选择。</Text>
                  </View>
                ) : null}
              </View>
            )}

            <View style={styles.pageSection}>
              <SectionHeader dark={dark} title="今天" />
              {todayFocusAgenda.length === 0 ? (
                <Text style={[styles.subtitle, dark && styles.textMutedDark]}>今天还没有已安排的专注。</Text>
              ) : todayFocusAgenda.map(item => (
                <Pressable
                  accessibilityLabel={`${formatAgendaTime(item.session.plannedStartAt)} ${item.task.title} ${item.session.plannedMinutes} 分钟`}
                  accessibilityRole="button"
                  key={item.session.id}
                  onPress={() => {
                    runtime.selectTask(item.task.id);
                    setProgressTaskId(item.task.id);
                  }}
                  style={styles.agendaRow}>
                  <Text style={[styles.agendaTime, dark && styles.textDark]}>{formatAgendaTime(item.session.plannedStartAt)}</Text>
                  <Text numberOfLines={1} style={[styles.agendaTitle, dark && styles.textDark]}>{item.task.title}</Text>
                  <Text style={[styles.agendaMinutes, dark && styles.textMutedDark]}>{item.session.plannedMinutes} 分钟</Text>
                </Pressable>
              ))}
              {todayFocusAgendaCount <= 3 ? null : (
                <Pressable accessibilityLabel="查看全部今日安排" accessibilityRole="button" onPress={() => openOrganizer('backlog')}>
                  <Text style={styles.textLink}>查看全部</Text>
                </Pressable>
              )}
            </View>

            <View style={[styles.settingsGroup, dark && styles.surfaceDark]}>
              <SettingsRow
                dark={dark}
                label="专注保护"
                onPress={() => setSystemNotice('专注保护的详细设置将在下一阶段接入。')}
                value="减少干扰 ›"
              />
              <SettingsRow dark={dark} label="最近专注" onPress={() => setHistoryOpen(true)} value="›" />
            </View>
          </View>
        ) : null}

        {tab === 'growth' ? (
          <View style={styles.tabPage}>
            <PageHeader dark={dark} title="成长" />
            <HeroPanel accessibilityLabel="成长状态" dark={dark} style={styles.growthHero}>
              <GrowthPlant progress={growth} />
              <Text style={styles.growthLevel}>{growth.stage.title}</Text>
              <Text style={[styles.growthScoreWithUnit, dark && styles.textDark]}>
                当前 {snapshot.growthScore} 成长值
              </Text>
              <Text style={[styles.subtitle, dark && styles.textMutedDark]}>{growth.stage.description}</Text>
              <View style={styles.progressTrackLarge}>
                <View style={[styles.progressFill, {width: `${growth.progressRatio * 100}%`}]} />
              </View>
              <Text style={styles.progressCaption}>
                {growth.nextStage === null
                  ? '当前成长阶段已完整展开'
                  : `距离${growth.nextStage.title}还差 ${growth.pointsToNext} 成长值`}
              </Text>
            </HeroPanel>

            <View style={styles.pageSection}>
              <SectionHeader dark={dark} title="今天" />
              <View accessibilityLabel="今日成长摘要" style={styles.metricRow}>
                {growthPageSummary.today.map(metric => (
                  <MetricItem dark={dark} key={metric.label} label={metric.label} value={metric.value} />
                ))}
              </View>
            </View>

            <View style={styles.pageSection}>
              <SectionHeader dark={dark} title="本周变好" />
              {growthPageSummary.hasWeeklySample ? (
                <View style={[styles.settingsGroup, dark && styles.surfaceDark]}>
                  {growthPageSummary.week.map(metric => (
                    <SettingsRow dark={dark} key={metric.label} label={metric.label} value={metric.value} />
                  ))}
                </View>
              ) : (
                <InlineNotice accessibilityLabel="成长样本不足" dark={dark}>
                  <Text style={[styles.subtitle, dark && styles.textMutedDark]}>
                    再使用几天，我们会在这里显示你的变化。
                  </Text>
                </InlineNotice>
              )}
            </View>

            <View style={[styles.settingsGroup, dark && styles.surfaceDark]}>
              <SettingsRow
                dark={dark}
                label="最近成长"
                onPress={() => setRecentGrowthExpanded(value => !value)}
                value={recentGrowthExpanded ? '收起' : '›'}
              />
              {!recentGrowthExpanded ? null : latestGrowthRewards.map(rewardItem => (
                  <Text key={rewardItem.businessKey} style={[styles.subtitle, dark && styles.textMutedDark]}>
                    +{rewardItem.points} · {rewardItem.taskTitle} · {
                      rewardItem.kind === 'task_first_start'
                        ? '第一次开始'
                        : rewardItem.kind === 'task_first_step'
                          ? '第一小步'
                          : '完成任务'
                    }
                  </Text>
                ))}
              {!recentGrowthExpanded || latestGrowthRewards.length > 0 ? null : (
                <Text style={[styles.subtitle, dark && styles.textMutedDark]}>第一次开始后，这里会保留奖励原因。</Text>
              )}
            </View>

            <View accessibilityLabel="给你的一个建议" style={[styles.infoCard, dark && styles.surfaceDark]}>
              <Text style={[styles.infoTitle, dark && styles.textDark]}>给你的一个建议</Text>
              {growthInsight !== null ? (
                <>
                  <Text style={[styles.infoTitle, dark && styles.textDark]}>{growthInsight.title}</Text>
                  <Text style={[styles.subtitle, dark && styles.textMutedDark]}>{growthInsight.description}</Text>
                  <View style={styles.segmentedRow}>
                    <Action label={growthInsight.actionLabel} onPress={() => performGrowthInsight(growthInsight)} />
                    <Action label="7 天内不再提示" onPress={() => dismissGrowthInsight(growthInsight)} secondary />
                  </View>
                </>
              ) : focusDurationRecommendation !== null ? (
                <>
                  <Text style={[styles.subtitle, dark && styles.textMutedDark]}>
                    你完成 {focusDurationRecommendation.candidateMinutes} 分钟专注的比例更高。
                  </Text>
                  <View style={styles.segmentedRow}>
                    <Action label={`设为常用 ${focusDurationRecommendation.candidateMinutes} 分钟`} onPress={acceptFocusDurationRecommendation} />
                    <Action label="暂时不用" onPress={dismissFocusDurationRecommendation} secondary />
                  </View>
                </>
              ) : (
                <Text style={[styles.subtitle, dark && styles.textMutedDark]}>
                  本地样本还不够，暂时不做结论。
                </Text>
              )}
            </View>
          </View>
        ) : null}

        {tab === 'mine' ? (
          <View style={styles.tabPage}>
            <PageHeader dark={dark} title="我的" />
            <Pressable
              accessibilityLabel="查看数据去向"
              accessibilityRole="button"
              onPress={() => setSystemNotice('任务、专注和偏好默认只保存在这台设备上。仅在你主动导出时生成文件。')}>
              <Text style={[styles.privacyIntro, dark && styles.textMutedDark]}>
                你的任务默认只保存在这台设备上。查看数据去向 ›
              </Text>
            </Pressable>

            <View style={styles.pageSection}>
              <SectionHeader dark={dark} title="我的节奏" />
              <View style={[styles.settingsGroup, dark && styles.surfaceDark]}>
                <SettingsRow dark={dark} label="常用专注时长" onPress={() => setSettingsSheet('focus-duration')} value={`${settings.preferredFocusMinutes} 分钟 ›`} />
                <SettingsRow dark={dark} label="常用工作日" value="暂未设置" />
                <SettingsRow dark={dark} label="更容易开始的时间" value="暂未设置" />
                <SettingsRow
                  dark={dark}
                  label="今天只推进一小步"
                  onPress={() => setLowEnergySheetOpen(true)}
                  value={lowEnergyMode.enabled ? `${lowEnergyMode.defaultFocusMinutes} 分钟 ›` : '未启用 ›'}
                />
              </View>
            </View>

            <View style={styles.pageSection}>
              <SectionHeader dark={dark} title="任务与象限" />
              <View style={[styles.settingsGroup, dark && styles.surfaceDark]}>
                <SettingsRow dark={dark} label="截止临近时提高紧急度" value="随截止变化" />
                <SettingsRow dark={dark} label="待整理任务" onPress={() => openOrganizer('backlog')} value="›" />
                <SettingsRow dark={dark} label="已完成任务" onPress={() => openOrganizer('completed')} value="›" />
                <SettingsRow dark={dark} label="今日回顾" onPress={() => setSummaryOpen(true)} value="›" />
              </View>
            </View>

            <View style={styles.pageSection}>
              <SectionHeader dark={dark} title="提醒与专注保护" />
              <View style={[styles.settingsGroup, dark && styles.surfaceDark]}>
                <SettingsRow
                  dark={dark}
                  label="通知权限"
                  onPress={props.tomorrowFirstReminder === undefined ? undefined : openTomorrowReminderSettings}
                  value={tomorrowReminderStatus === 'scheduled' ? '已开启 ›' : tomorrowReminderStatus === 'denied' ? '未开启 ›' : '按需开启 ›'}
                />
                <SettingsRow dark={dark} label="提醒强度" value="标准" />
                <SettingsRow dark={dark} label="专注时减少干扰" value="暂未设置" />
              </View>
            </View>

            <View style={styles.pageSection}>
              <SectionHeader dark={dark} title="外观与无障碍" />
              <View style={[styles.settingsGroup, dark && styles.surfaceDark]}>
                <SettingsRow
                  dark={dark}
                  label="外观"
                  onPress={() => setSettingsSheet('theme')}
                  value={`${settings.theme === 'system' ? '跟随系统' : settings.theme === 'light' ? '浅色' : '深色'} ›`}
                />
                <SettingsRow
                  checked={settings.reduceMotion}
                  dark={dark}
                  label="减少动态"
                  onPress={() => updateSettings({reduceMotion: !settings.reduceMotion})}
                  role="switch"
                  value={settings.reduceMotion ? '开启' : '关闭'}
                />
                <SettingsRow dark={dark} label="屏幕阅读器优化" value="自动" />
              </View>
            </View>

            <View style={styles.pageSection}>
              <SectionHeader dark={dark} title="数据与隐私" />
              <View style={[styles.settingsGroup, dark && styles.surfaceDark]}>
                <SettingsRow dark={dark} label="本机任务数据" value={`${snapshot.tasks.length} 项`} />
                <SettingsRow
                  dark={dark}
                  label="备份与恢复"
                  onPress={props.localBackup !== undefined && props.backupFileBridge !== undefined ? () => setBackupOpen(true) : undefined}
                  value={props.localBackup !== undefined && props.backupFileBridge !== undefined ? '›' : '不可用'}
                />
                <SettingsRow
                  dark={dark}
                  label="导出数据"
                  onPress={props.localBackup !== undefined && props.backupFileBridge !== undefined ? () => setBackupOpen(true) : undefined}
                  value={props.localBackup !== undefined && props.backupFileBridge !== undefined ? '›' : '不可用'}
                />
              </View>
            </View>

            <View style={styles.pageSection}>
              <SectionHeader dark={dark} title="帮助与关于" />
              <View style={[styles.settingsGroup, dark && styles.surfaceDark]}>
                <SettingsRow dark={dark} label="使用帮助" onPress={() => setTipsVisible(true)} value="›" />
                <SettingsRow dark={dark} label="关于先做 5 分钟" value="1.0" />
              </View>
            </View>
          </View>
        ) : null}

        {snapshot.errorText === null || editorMode !== null ? null : (
          <Text accessibilityLiveRegion="assertive" style={styles.error}>{USER_COPY.taskSaveFailed}</Text>
        )}
        {editorMode !== null || actionError === null ? null : (
          <Text accessibilityLiveRegion="assertive" style={styles.error}>{actionError}</Text>
        )}
        {snapshot.refreshErrorText === null ? null : (
          <View style={[styles.infoCard, dark && styles.surfaceDark]}>
            <Text accessibilityLiveRegion="assertive" style={styles.error}>{USER_COPY.refreshFailed}</Text>
            <Action
              disabled={snapshot.refreshPending}
              label="重试刷新象限"
              onPress={() => runtime.refresh().catch(() => undefined)}
            />
          </View>
        )}
        {snapshot.reminderSyncErrorText === null ? null : (
          <View style={[styles.infoCard, dark && styles.surfaceDark]}>
            <Text accessibilityLiveRegion="assertive" style={styles.error}>
              {USER_COPY.reminderFailed}
            </Text>
            <Action
              label="重试同步提醒"
              onPress={() => runtime.retryReminderSync().catch(() => undefined)}
            />
          </View>
        )}
      </ScrollView>

      {editorMode === null &&
      progressTask === null &&
      organizerMode === null &&
      !lowEnergySheetOpen &&
      settingsSheet === null &&
      focus?.snapshot.state !== 'running' ? (
      <View accessibilityLabel="底部导航" style={[styles.bottomNav, dark && styles.surfaceDark]}>
        {([
          ['quadrants', '象限'],
          ['focus', '专注'],
          ['growth', '成长'],
          ['mine', '我的'],
        ] as const).map(([key, label]) => (
          <Pressable
            accessibilityLabel={label}
            accessibilityRole="tab"
            accessibilityState={{selected: tab === key}}
            key={key}
            onPress={() => selectTab(key)}
            style={[
              styles.navItem,
              tab === key && styles.navItemSelected,
              tab === key && dark && styles.navItemSelectedDark,
            ]}>
            <Text style={[
              styles.navText,
              dark && styles.textMutedDark,
              tab === key && styles.navTextSelected,
            ]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      ) : null}

      {editorMode === null ? null : (
        <TaskEditor
          key={`${selectedTask?.id ?? 'create'}:${editorInitialLayer ?? 'default'}`}
          draft={draft}
          {...(editorInitialLayer === undefined ? {} : {initialLayer: editorInitialLayer})}
          defaultFocusMinutes={
            commonFocusMinutes
          }
          error={actionError}
          mode={editorMode}
          onChange={setDraft}
          onDismissAttempt={dismissEditor}
          onComplete={completeSelectedTask}
          onFirstStepComplete={completeSelectedFirstStep}
          onFirstStepUndo={undoSelectedFirstStep}
          onCopy={copySelectedTask}
          onDelete={deleteSelectedTask}
          onMove={moveSelectedTask}
          onQuadrantTouched={() => {
            createDraftRef.current.quadrantTouched = true;
          }}
          nowInput={priorityNow}
          onProgress={updateSelectedTaskProgress}
          onReschedule={rescheduleSelectedTask}
          onRescue={submitRescuePlan}
          onRescueDismiss={() => {
            if (selectedTask === null) return;
            setRescuePromptDismissedIds(current => {
              const next = new Set(current);
              next.add(selectedTask.id);
              return next;
            });
          }}
          onSave={saveDraft}
          onStart={() => startFiveMinutes(
            selectedTask,
            commonFocusMinutes,
          )}
          onStopRepeat={stopSelectedRepeat}
          onStuckOpen={() => {
            recordMetric('stuck_flow_open', {
              source: 'task_sheet',
              success: true,
              ...(selectedTask === null ? {} : {taskRef: selectedTask.id}),
            });
          }}
          onStuckRepair={submitStuckRepair}
          onPostponePromptSeen={acknowledgePostponePrompt}
          onShrinkStep={shrinkSelectedStep}
          onAbandon={abandonSelectedTask}
          onLongTermPlan={() => {
            if (selectedTask === null) return;
            setProgressTaskId(selectedTask.id);
            setEditorMode(null);
          }}
          rescuePromptVisible={
            selectedTask !== null &&
            isTaskEligibleForRescue(selectedTask, priorityNow) &&
            (selectedTask as TaskWithSupport).rescuePlan == null &&
            !rescuePromptDismissedIds.has(selectedTask.id)
          }
          postponeRepairVisible={
            selectedTask !== null && shouldShowPostponeRepair(selectedTask, priorityNow)
          }
          onUrgencyMode={updateSelectedUrgencyMode}
          pending={actionPending}
          reduceMotion={settings.reduceMotion}
          task={selectedTask}
        />
      )}

      {progressTask === null ? null : (
        <TaskProgressSheet
          error={actionError}
          now={props.now}
          onAdjustDueAt={() => {
            runtime.selectTask(progressTask.id);
            setProgressTaskId(null);
            setEditorInitialLayer('reschedule');
            setEditorMode('edit');
          }}
          onClose={() => setProgressTaskId(null)}
          onOpenRescue={() => {
            runtime.selectTask(progressTask.id);
            setProgressTaskId(null);
            setEditorInitialLayer('rescue');
            setEditorMode('edit');
          }}
          onStartPlanned={planned => startPlannedWork(progressTask, planned)}
          onUpdate={patch => runtime.updateTask(progressTask.id, patch as never)}
          pending={actionPending || snapshot.mutationPending}
          task={progressTask}
        />
      )}

      {moveUndo === null ? null : (
        <View accessibilityLiveRegion="polite" style={styles.undoSnackbar}>
          <Text style={styles.undoText}>
            “{moveUndo.taskTitle}”已移到{QUADRANT_HOME_META[moveUndo.to].title}
          </Text>
          <Pressable
            accessibilityLabel="撤销移动"
            accessibilityRole="button"
            onPress={undoLastMove}
            style={styles.undoAction}>
            <Text style={styles.undoActionText}>撤销</Text>
          </Pressable>
        </View>
      )}

      {completionUndo === null ? null : (
        <View accessibilityLiveRegion="polite" style={styles.undoSnackbar}>
          <Text style={styles.undoText}>
            “{completionUndo.taskTitle}”已完成，成长值 +{completionUndo.points}
          </Text>
          <Pressable
            accessibilityLabel="撤销完成"
            accessibilityRole="button"
            onPress={undoLastCompletion}
            style={styles.undoAction}>
            <Text style={styles.undoActionText}>撤销</Text>
          </Pressable>
        </View>
      )}

      {lowEnergySheetOpen ? (
        <AppBottomSheet
          dark={dark}
          onDismissAttempt={() => {
            setLowEnergySheetOpen(false);
            return true;
          }}
          reduceMotion={settings.reduceMotion}
          subtitle="只在今天生效，明天自动恢复；不会修改任务、截止日期或成长值。"
          title="今天只推进一小步">
          <View style={styles.sheetActions}>
            <Action label="今天默认先做 2 分钟" onPress={() => setLowEnergyMode(2)} />
            <Action label="今天默认先做 5 分钟" onPress={() => setLowEnergyMode(5)} secondary />
            <Action
              label="改到精力更好的时间"
              onPress={() => {
                setLowEnergySheetOpen(false);
                openOrganizer('backlog');
              }}
              secondary
            />
            {!lowEnergyMode.enabled ? null : (
              <Action label="恢复普通安排" onPress={disableLowEnergyMode} secondary />
            )}
          </View>
        </AppBottomSheet>
      ) : null}

      {settingsSheet === null ? null : (
        <AppBottomSheet
          dark={dark}
          onDismissAttempt={() => {
            setSettingsSheet(null);
            return true;
          }}
          reduceMotion={settings.reduceMotion}
          title={settingsSheet === 'theme' ? '选择外观' : '常用专注时长'}>
          <View style={styles.sheetActions}>
            {settingsSheet === 'theme' ? (
              (['system', 'light', 'dark'] as const).map(theme => (
                <Action
                  key={theme}
                  label={theme === 'system' ? '跟随系统' : theme === 'light' ? '浅色' : '深色'}
                  onPress={() => {
                    updateSettings({theme});
                    setSettingsSheet(null);
                  }}
                  secondary={settings.theme !== theme}
                />
              ))
            ) : (
              ([5, 15, 25, 45] as const).map(minutes => (
                <Action
                  key={minutes}
                  label={`${minutes} 分钟`}
                  onPress={() => {
                    updateSettings({preferredFocusMinutes: minutes});
                    setSettingsSheet(null);
                  }}
                  secondary={settings.preferredFocusMinutes !== minutes}
                />
              ))
            )}
          </View>
        </AppBottomSheet>
      )}

      {tipsVisible ? (
        <View accessibilityLiveRegion="polite" style={[styles.tipsCard, dark && styles.surfaceDark]}>
          <Text accessibilityRole="header" style={[styles.infoTitle, dark && styles.textDark]}>三步就能开始</Text>
          <Text style={[styles.subtitle, dark && styles.textMutedDark]}>1. 点象限空白添加任务</Text>
          <Text style={[styles.subtitle, dark && styles.textMutedDark]}>2. 点任务立即编辑，长按可移动</Text>
          <Text style={[styles.subtitle, dark && styles.textMutedDark]}>3. 点“先做5分钟”开始行动</Text>
          <Action label="知道了" onPress={dismissTips} />
        </View>
      ) : null}

      {reward === null ? null : (
        <View
          accessibilityLiveRegion="polite"
          pointerEvents="box-none"
          style={[styles.rewardOverlay, dark && styles.surfaceDark]}>
          <View style={styles.rewardScoreBadge}>
            <Text style={styles.rewardPoints}>+{reward.points}</Text>
          </View>
          <View style={styles.rewardCopy}>
            <Text style={styles.rewardKicker}>{reward.kicker}</Text>
            <Text numberOfLines={1} style={[styles.rewardTitle, dark && styles.textDark]}>任务：{reward.taskTitle}</Text>
            <Text style={[styles.rewardReason, dark && styles.textMutedDark]}>{reward.reason}</Text>
            <Text style={styles.rewardProgress}>当前累计 {reward.totalScore} 成长值</Text>
          </View>
          <Pressable
            accessibilityLabel="关闭成长提示"
            accessibilityRole="button"
            onPress={dismissReward}
            style={styles.rewardDismiss}>
            <Text style={styles.rewardDismissText}>×</Text>
          </Pressable>
        </View>
      )}
      {organizerMode === null ? null : (
        <TaskOrganizerSheet
          activeFocusTaskId={focus?.snapshot.activeSession?.taskId ?? null}
          initialTaskId={organizerTaskId}
          history={props.reviewHistory}
          mode={organizerMode}
          now={priorityNow}
          onClose={() => {
            setOrganizerMode(null);
            setOrganizerTaskId(null);
          }}
          onMetric={(name, fields = {}) => recordMetric(name, fields)}
          onOpenTask={taskId => {
            setOrganizerMode(null);
            openTask(taskId, 'organizer');
          }}
          onStartTask={taskId => {
            const task = snapshot.tasks.find(candidate => candidate.id === taskId);
            if (task === undefined) return;
            setOrganizerMode(null);
            startFiveMinutes(task, commonFocusMinutes, 'search');
          }}
        />
      )}
      {props.renderReviewSheet?.(() => selectTab('quadrants'))}
    </View>
    </DarkThemeContext.Provider>
  );
}

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: APP_PAGE_TOKENS.light.background},
  safeAreaDark: {backgroundColor: APP_PAGE_TOKENS.dark.background},
  surfaceDark: {backgroundColor: APP_PAGE_TOKENS.dark.surface},
  surfaceRaisedDark: {backgroundColor: APP_PAGE_TOKENS.dark.surfaceSubtle},
  borderDark: {borderColor: APP_PAGE_TOKENS.dark.border},
  textDark: {color: APP_PAGE_TOKENS.dark.text},
  textMutedDark: {color: APP_PAGE_TOKENS.dark.textMuted},
  centered: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24},
  content: {paddingHorizontal: 18, paddingTop: 18, paddingBottom: 110, gap: 16},
  headerRow: {flexDirection: 'row', alignItems: 'center', gap: 14},
  headerCopy: {flex: 1, gap: 4},
  eyebrow: {color: '#64736F', fontSize: 13, fontWeight: '700'},
  title: {color: '#153C37', fontSize: 27, fontWeight: '900'},
  subtitle: {color: '#5E716C', fontSize: 14, lineHeight: 21},
  floatingAdd: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#1F7466',
  },
  floatingAddText: {color: '#FFFFFF', fontSize: 30, fontWeight: '500', marginTop: -3},
  headerActions: {gap: 6},
  headerUtility: {backgroundColor: '#E5F2EE', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7},
  headerUtilityText: {color: '#1F675C', fontSize: 11, fontWeight: '900'},
  unsortedBadge: {alignSelf: 'flex-start', backgroundColor: '#FFF5E7', borderColor: '#E7B66D', borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7},
  unsortedBadgeText: {color: '#8A4B08', fontSize: 13, fontWeight: '900'},
  growthStrip: {backgroundColor: '#E5F2EE', borderRadius: 14, padding: 12, gap: 8},
  growthStripText: {color: '#1F675C', fontSize: 13, fontWeight: '800'},
  continuationStrip: {backgroundColor: '#FFFFFF', borderRadius: 16, padding: 13, gap: 10, borderWidth: 1, borderColor: '#CFE0DC'},
  continuationCopy: {gap: 3},
  continuationKicker: {color: '#5F746F', fontSize: 12, fontWeight: '800'},
  continuationTitle: {color: '#173F3A', fontSize: 17, fontWeight: '900'},
  continuationActions: {gap: 8},
  actionPointer: {backgroundColor: '#FFFFFF', borderRadius: 16, padding: 13, gap: 8, borderWidth: 1, borderColor: '#BFD8D2'},
  hybridNotice: {backgroundColor: '#FFF5E7', borderRadius: 12, padding: 11, borderWidth: 1, borderColor: '#E7B66D'},
  progressTrack: {height: 6, borderRadius: 99, backgroundColor: '#C5DBD5', overflow: 'hidden'},
  progressTrackLarge: {height: 10, borderRadius: 99, backgroundColor: '#C5DBD5', overflow: 'hidden', width: '100%'},
  progressFill: {height: '100%', borderRadius: 99, backgroundColor: '#2A8A77'},
  viewSwitcher: {flexDirection: 'row', padding: 4, borderRadius: 13, backgroundColor: '#E7ECEA'},
  segmentedRow: {flexDirection: 'row', gap: 8},
  segment: {flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingHorizontal: 12},
  segmentSelected: {backgroundColor: '#FFFFFF'},
  segmentDark: {backgroundColor: '#24423C'},
  segmentSelectedDark: {backgroundColor: '#31544C'},
  segmentText: {color: '#60716D', fontSize: 14, fontWeight: '700'},
  segmentTextSelected: {color: '#174F47', fontWeight: '900'},
  mapShell: {gap: 7},
  urgencyAxis: {color: '#4D625D', fontSize: 12, fontWeight: '800'},
  importanceAxis: {color: '#4D625D', fontSize: 12, fontWeight: '800', textAlign: 'right'},
  mapGrid: {height: 430, borderWidth: 1, borderColor: '#A9B9B5', borderRadius: 18, overflow: 'hidden'},
  mapRow: {flex: 1, flexDirection: 'row'},
  mapCell: {flex: 1, borderWidth: StyleSheet.hairlineWidth, borderColor: '#A9B9B5', minHeight: 200, overflow: 'visible'},
  mapCellDragTarget: {borderWidth: 3, borderColor: '#1F7466'},
  cellHeading: {position: 'absolute', left: 10, top: 9, right: 6, zIndex: 1},
  cellTitle: {fontSize: 14, fontWeight: '900'},
  cellDescription: {color: '#63736F', fontSize: 11, marginTop: 2},
  mapNode: {
    position: 'absolute',
    width: '35%',
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 6,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    zIndex: 2,
  },
  mapNodeRecommended: {borderWidth: 2, shadowColor: '#173F3A', shadowOpacity: 0.18, shadowRadius: 6, elevation: 3},
  mapNodeSelected: {borderWidth: 3, transform: [{scale: 1.03}]},
  mapNodeSmall: {width: '30%', minHeight: 42},
  mapNodeLarge: {width: '42%', minHeight: 58},
  mapNodeDeadline: {borderColor: '#D97706'},
  dragTargetText: {color: '#244D46', fontSize: 13, fontWeight: '900', textAlign: 'center'},
  nodeDot: {width: 8, height: 8, borderRadius: 4, marginTop: 4},
  nodeTitle: {flex: 1, color: '#203F3A', fontSize: 10, lineHeight: 13, fontWeight: '800'},
  dragCallout: {position: 'absolute', left: 0, bottom: '100%', minWidth: 120, maxWidth: 220, borderRadius: 10, backgroundColor: '#FFFFFF', color: '#203F3A', fontSize: 13, lineHeight: 18, padding: 8, elevation: 15},
  deadlineClock: {color: '#D97706', fontSize: 12, fontWeight: '900'},
  overflowBadge: {position: 'absolute', right: 8, bottom: 8, borderRadius: 10, backgroundColor: '#FFFFFF', paddingHorizontal: 8, paddingVertical: 5},
  overflowText: {color: '#35534E', fontSize: 11, fontWeight: '800'},
  emptyCell: {position: 'absolute', bottom: 12, alignSelf: 'center', color: '#71817D', fontSize: 12, fontWeight: '700'},
  listStack: {gap: 14},
  listTargetNotice: {color: '#244D46', fontSize: 13, fontWeight: '800', backgroundColor: '#E5F2EE', borderRadius: 12, padding: 12},
  listSection: {borderRadius: 16, backgroundColor: '#FFFFFF', padding: 14, gap: 10},
  sectionHeadingRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  sectionHeadingText: {flex: 1},
  sectionTitle: {fontSize: 18, fontWeight: '900'},
  taskRow: {flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#D7E0DE', paddingTop: 10},
  taskRowMain: {flex: 1, minHeight: 52, justifyContent: 'center', gap: 4},
  taskTitle: {color: '#193F39', fontSize: 15, fontWeight: '800'},
  taskMeta: {color: '#657672', fontSize: 12},
  emptySection: {color: '#71817D', fontSize: 13, paddingVertical: 7},
  emptyHome: {alignItems: 'center', gap: 4, padding: 16},
  emptyHomeTitle: {color: '#204D46', fontSize: 17, fontWeight: '900'},
  action: {minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1F7466', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10},
  actionCompact: {minHeight: 44, paddingHorizontal: 12, paddingVertical: 8},
  actionSecondary: {backgroundColor: '#E7EFED'},
  actionSecondaryDark: {backgroundColor: '#31544C'},
  actionText: {color: '#FFFFFF', fontSize: 14, fontWeight: '900'},
  actionSecondaryText: {color: '#244D46'},
  disabled: {opacity: 0.45},
  bottomNav: {position: 'absolute', left: 12, right: 12, bottom: 10, minHeight: 68, flexDirection: 'row', alignItems: 'center', borderRadius: 20, backgroundColor: '#FFFFFF', padding: 6, shadowColor: '#173F3A', shadowOpacity: 0.14, shadowRadius: 10, elevation: 8},
  navItem: {flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 15},
  navItemSelected: {backgroundColor: '#E0F0EC'},
  navItemSelectedDark: {backgroundColor: '#31544C'},
  navText: {color: '#71817D', fontSize: 14, fontWeight: '800'},
  navTextSelected: {color: '#1F7466'},
  tabPage: {gap: 16},
  pageSection: {gap: 10},
  durationGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  textLink: {color: APP_PAGE_TOKENS.light.primary, fontSize: 14, fontWeight: '900', paddingVertical: 6},
  agendaRow: {minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopColor: APP_PAGE_TOKENS.light.border, borderTopWidth: StyleSheet.hairlineWidth},
  agendaTime: {width: 48, color: APP_PAGE_TOKENS.light.text, fontSize: 14, fontWeight: '900'},
  agendaTitle: {flex: 1, color: APP_PAGE_TOKENS.light.text, fontSize: 14, fontWeight: '700'},
  agendaMinutes: {color: APP_PAGE_TOKENS.light.textMuted, fontSize: 12},
  settingsGroup: {backgroundColor: APP_PAGE_TOKENS.light.surface, borderRadius: APP_PAGE_TOKENS.radius.lg, paddingHorizontal: 16, overflow: 'hidden'},
  metricRow: {flexDirection: 'row', gap: 12, backgroundColor: APP_PAGE_TOKENS.light.surface, borderRadius: APP_PAGE_TOKENS.radius.lg, padding: 16},
  privacyIntro: {color: APP_PAGE_TOKENS.light.textMuted, fontSize: 14, lineHeight: 21},
  lowEnergyStatus: {color: APP_PAGE_TOKENS.light.textMuted, fontSize: 13, fontWeight: '800'},
  infoCard: {backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, gap: 12},
  infoTitle: {color: '#204D46', fontSize: 18, fontWeight: '900'},
  settingRow: {minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12},
  settingValue: {color: '#1F7466', fontSize: 14, fontWeight: '900'},
  focusHero: {backgroundColor: '#173F3A', borderRadius: 24, padding: 22, gap: 12},
  focusLabel: {color: '#A8D7CD', fontSize: 13, fontWeight: '800'},
  focusTask: {color: '#FFFFFF', fontSize: 24, fontWeight: '900'},
  focusStep: {color: '#D8ECE7', fontSize: 15, lineHeight: 22},
  timer: {color: '#FFFFFF', fontSize: 54, fontWeight: '900', textAlign: 'center', letterSpacing: 1},
  growthHero: {alignItems: 'center', backgroundColor: '#E5F2EE', borderRadius: 24, padding: 24, gap: 8},
  growthPlant: {width: 110, height: 120, alignItems: 'center', justifyContent: 'flex-end'},
  growthSeed: {position: 'absolute', bottom: 25, width: 22, height: 13, borderRadius: 12, backgroundColor: '#9A6A43'},
  growthPot: {width: 54, height: 28, borderBottomLeftRadius: 14, borderBottomRightRadius: 14, borderTopLeftRadius: 5, borderTopRightRadius: 5, backgroundColor: '#B77B4E'},
  growthStem: {position: 'absolute', bottom: 25, width: 7, height: 54, borderRadius: 8, backgroundColor: '#2F8A65'},
  growthStemTall: {height: 78},
  growthLeaf: {position: 'absolute', width: 32, height: 17, borderTopLeftRadius: 18, borderBottomRightRadius: 18, backgroundColor: '#55A879'},
  growthLeafLeft: {bottom: 49, left: 24, transform: [{rotate: '18deg'}]},
  growthLeafRight: {bottom: 61, right: 23, transform: [{rotate: '-18deg'}]},
  growthLeafUpper: {bottom: 78, left: 30, width: 27, transform: [{rotate: '28deg'}]},
  growthLeafBranch: {bottom: 91, right: 28, width: 27, transform: [{rotate: '-28deg'}]},
  growthFlower: {position: 'absolute', top: 4, width: 34, height: 34, borderRadius: 18, borderWidth: 9, borderColor: '#F4A6B7', backgroundColor: '#FFD86B', alignItems: 'center', justifyContent: 'center'},
  growthFlowerCore: {width: 9, height: 9, borderRadius: 5, backgroundColor: '#D98C2F'},
  growthLevel: {color: '#1F7466', fontSize: 18, fontWeight: '900'},
  growthTotal: {color: '#153C37', fontSize: 58, fontWeight: '900'},
  growthScoreWithUnit: {color: APP_PAGE_TOKENS.light.text, fontSize: 20, fontWeight: '900'},
  progressCaption: {color: '#59706A', fontSize: 13},
  sheetBackdrop: {position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end', backgroundColor: 'rgba(18, 42, 38, 0.42)', zIndex: 20},
  sheet: {maxHeight: '91%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12},
  sheetScroll: {paddingBottom: 12, gap: 13},
  dragSheet: {backgroundColor: '#FFFFFF', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 22, gap: 14},
  sheetHandle: {width: 48, height: 5, borderRadius: 99, alignSelf: 'center', backgroundColor: '#CAD5D2'},
  sheetHeadingRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12},
  sheetHeadingCopy: {flex: 1},
  sheetTitle: {color: '#173F3A', fontSize: 23, fontWeight: '900'},
  sheetSubtitle: {color: '#657672', fontSize: 12, marginTop: 2},
  priorityExplanation: {borderRadius: 12, backgroundColor: '#EEF5F3', padding: 11, gap: 8},
  input: {minHeight: 50, borderColor: '#9DB0AC', borderRadius: 12, borderWidth: 1, color: '#173F3A', fontSize: 16, paddingHorizontal: 14},
  quickWarning: {color: '#B45309', fontSize: 12, fontWeight: '700'},
  parseChips: {flexDirection: 'row', flexWrap: 'wrap', gap: 7},
  parseChip: {borderRadius: 99, backgroundColor: '#E5F2EE', paddingHorizontal: 10, paddingVertical: 7},
  parseChipText: {color: '#1F675C', fontSize: 12, fontWeight: '800'},
  inputDark: {borderColor: '#6D8982', color: '#F2FAF7', backgroundColor: '#24423C'},
  fieldLabel: {color: '#35534E', fontSize: 13, fontWeight: '900'},
  actionLayer: {gap: 13, paddingTop: 2},
  actionTaskTitle: {color: '#173F3A', fontSize: 21, lineHeight: 28, fontWeight: '900'},
  actionTaskMeta: {color: '#657672', fontSize: 13, lineHeight: 19},
  firstStepCard: {borderRadius: 14, backgroundColor: '#EEF5F3', padding: 14, gap: 6},
  firstStepText: {color: '#244D46', fontSize: 15, lineHeight: 22},
  progressSummary: {borderRadius: 12, borderWidth: 1, borderColor: '#D4E1DE', padding: 12, gap: 4},
  progressChoices: {flexDirection: 'row', gap: 6, paddingTop: 6},
  progressChoice: {flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#E7EFED'},
  progressChoiceSelected: {backgroundColor: '#1F7466'},
  progressChoiceText: {color: '#35534E', fontSize: 12, fontWeight: '900'},
  progressChoiceTextSelected: {color: '#FFFFFF'},
  quickActionGrid: {gap: 8},
  choiceGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  choice: {width: '48%', minHeight: 58, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8},
  choiceSelectedDark: {backgroundColor: '#31554D'},
  choiceTitle: {fontSize: 14, fontWeight: '900'},
  choiceDescription: {color: '#697975', fontSize: 11, marginTop: 2},
  sheetActions: {gap: 9},
  stickyActions: {flexDirection: 'row', gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#CAD5D2'},
  deleteConfirmation: {gap: 8, borderRadius: 12, padding: 10, backgroundColor: 'rgba(201, 80, 61, 0.10)'},
  error: {color: '#A33A2C', fontSize: 14, lineHeight: 20},
  rewardOverlay: {position: 'absolute', left: 18, right: 18, top: 16, borderRadius: 18, backgroundColor: '#FFFFFF', padding: 14, gap: 11, flexDirection: 'row', alignItems: 'center', zIndex: 30, shadowColor: '#173F3A', shadowOpacity: 0.22, shadowRadius: 14, elevation: 10},
  rewardScoreBadge: {width: 54, height: 54, borderRadius: 18, backgroundColor: '#E0F0EC', alignItems: 'center', justifyContent: 'center'},
  rewardCopy: {flex: 1, gap: 2},
  rewardKicker: {color: '#1F7466', fontSize: 12, fontWeight: '900'},
  rewardPoints: {color: '#1F7466', fontSize: 22, fontWeight: '900'},
  rewardTitle: {color: '#173F3A', fontSize: 16, fontWeight: '900'},
  rewardReason: {color: '#586C67', fontSize: 12, lineHeight: 17},
  rewardProgress: {color: '#2C5B53', fontSize: 12, fontWeight: '800'},
  rewardDismiss: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center'},
  rewardDismissText: {color: '#59706A', fontSize: 26, lineHeight: 30},
  moveInline: {gap: 8},
  moveChoice: {flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#FFFFFF'},
  moveChoiceSelected: {backgroundColor: '#CFE4DF', opacity: 0.6},
  moveChoiceText: {color: '#244D46', fontSize: 11, fontWeight: '900'},
  undoSnackbar: {position: 'absolute', left: 18, right: 18, bottom: 90, minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#173F3A', borderRadius: 15, paddingHorizontal: 14, paddingVertical: 10, zIndex: 28},
  undoText: {flex: 1, color: '#FFFFFF', fontSize: 13, lineHeight: 18, fontWeight: '700'},
  undoAction: {minWidth: 52, minHeight: 44, alignItems: 'center', justifyContent: 'center'},
  undoActionText: {color: '#9DE1D3', fontSize: 14, fontWeight: '900'},
  tipsCard: {position: 'absolute', left: 18, right: 18, bottom: 92, borderRadius: 20, backgroundColor: '#FFFFFF', padding: 18, gap: 10, zIndex: 35, shadowColor: '#173F3A', shadowOpacity: 0.2, shadowRadius: 14, elevation: 10},
});
