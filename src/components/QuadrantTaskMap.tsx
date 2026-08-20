import React from 'react';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  BackHandler,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {Task} from '../domain/task';
import type {Quadrant} from '../domain/quadrant';
import {
  QUADRANT_HOME_META,
  QUADRANT_MAP_ROWS,
  selectVisibleQuadrantTasks,
  projectTaskToQuadrantMap,
} from '../domain/quadrantHome';
import {effectiveQuadrantForTask} from '../domain/taskPriority';
import {compactTaskLabelConfig, getCompactTaskLabel} from '../domain/taskDisplay';
import type {QuadrantTaskLayoutStore} from '../data/quadrantTaskLayoutStore';
import {
  IDLE_TASK_LAYOUT_MODE,
  TASK_LAYOUT_DRAG_START_SLOP_DP,
  TASK_LAYOUT_LONG_PRESS_MS,
  TASK_LAYOUT_PRE_ARM_SLOP_DP,
  clampPlacement,
  constrainTaskCenter,
  nearestAvailablePlacement,
  normalizePointInRect,
  pointForPlacement,
  quadrantAtTaskCenter,
  taskLayoutReducer,
  type LayoutRect,
  type LayoutSize,
  type QuadrantPlacement,
  type TaskLayoutMode,
} from '../domain/quadrantTaskLayout';

const DEFAULT_NODE_SIZE: LayoutSize = {width: 76, height: 52};

type MapBounds = Readonly<{left: number; top: number; width: number; height: number}>;

export type QuadrantTaskMapProps = Readonly<{
  actionPending: boolean;
  tasks: readonly Task[];
  recommendedId: string | null;
  reduceMotion: boolean;
  largeText: boolean;
  dark: boolean;
  nowInput: string;
  repository: QuadrantTaskLayoutStore;
  onAdd(quadrant: Quadrant): void;
  onTask(taskId: string): void;
  onShowList(quadrant: Quadrant): void;
  onCommit(input: Readonly<{
    taskId: string;
    originQuadrant: Quadrant;
    originPlacement: QuadrantPlacement;
    targetQuadrant: Quadrant;
    targetPlacement: QuadrantPlacement;
  }>): Promise<void>;
  onDraggingChange(dragging: boolean): void;
}>;

function contentRectForQuadrant(rect: LayoutRect): LayoutRect {
  const horizontalInset = Math.min(10, rect.width / 8);
  const headingHeight = Math.min(58, rect.height * 0.34);
  return {
    x: rect.x + horizontalInset,
    y: rect.y + headingHeight,
    width: Math.max(1, rect.width - horizontalInset * 2),
    height: Math.max(1, rect.height - headingHeight - 9),
  };
}

function fallbackPlacement(task: Task, nowInput: string): QuadrantPlacement {
  const point = projectTaskToQuadrantMap(task, nowInput);
  const right = point.quadrant === 'Q1' || point.quadrant === 'Q2';
  const lower = point.quadrant === 'Q2' || point.quadrant === 'Q4';
  const localX = right ? (point.xPercent - 50) * 2 : point.xPercent * 2;
  const localY = lower ? (point.yPercent - 50) * 2 : point.yPercent * 2;
  return clampPlacement({
    xRatio: Math.max(0.12, Math.min(0.88, localX / 100)),
    yRatio: Math.max(0.08, Math.min(0.92, (localY - 18) / 82)),
  });
}

function distance(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy);
}

function LayoutTaskNode(props: Readonly<{
  task: Task;
  quadrant: Quadrant;
  size: LayoutSize;
  position: Readonly<{left: number; top: number}>;
  recommended: boolean;
  selected: boolean;
  dragging: boolean;
  disabled: boolean;
  reduceMotion: boolean;
  largeText: boolean;
  dark: boolean;
  quadrantTaskCount: number;
  nowInput: string;
  onArm(pageX: number, pageY: number): void;
  onStartDrag(pageX: number, pageY: number): void;
  onDragMove(pageX: number, pageY: number): void;
  onRelease(): void;
  onCancel(): void;
  onPress(): void;
  onLayoutSize(size: LayoutSize): void;
  onAccessibleMove(quadrant: Quadrant): void;
}>): React.JSX.Element {
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = React.useRef({pageX: 0, pageY: 0});
  const armedThisGestureRef = React.useRef(false);
  const draggingThisGestureRef = React.useRef(false);
  const suppressPressRef = React.useRef(false);
  const selectedRef = React.useRef(props.selected);
  const wobble = React.useRef(new Animated.Value(0)).current;
  selectedRef.current = props.selected;

  const clearTimer = React.useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  React.useEffect(() => clearTimer, [clearTimer]);
  React.useEffect(() => {
    wobble.stopAnimation();
    wobble.setValue(0);
    if (!props.selected || props.dragging || props.reduceMotion) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(wobble, {toValue: 1, duration: 160, useNativeDriver: true}),
      Animated.timing(wobble, {toValue: -1, duration: 160, useNativeDriver: true}),
      Animated.timing(wobble, {toValue: 0, duration: 160, useNativeDriver: true}),
    ]));
    loop.start();
    return () => {
      loop.stop();
      wobble.setValue(0);
    };
  }, [props.dragging, props.reduceMotion, props.selected, wobble]);

  const panResponder = React.useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !props.disabled,
    onMoveShouldSetPanResponder: () => !props.disabled,
    onPanResponderGrant: event => {
      const {pageX, pageY} = event.nativeEvent;
      startedRef.current = {pageX, pageY};
      armedThisGestureRef.current = props.selected;
      draggingThisGestureRef.current = false;
      suppressPressRef.current = props.selected;
      clearTimer();
      if (props.selected) return;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        armedThisGestureRef.current = true;
        suppressPressRef.current = true;
        props.onArm(startedRef.current.pageX, startedRef.current.pageY);
      }, TASK_LAYOUT_LONG_PRESS_MS);
    },
    onPanResponderMove: (_event, gesture) => {
      const travelled = distance(gesture.dx, gesture.dy);
      if (!armedThisGestureRef.current && !selectedRef.current) {
        if (travelled > TASK_LAYOUT_PRE_ARM_SLOP_DP) clearTimer();
        return;
      }
      if (!draggingThisGestureRef.current && travelled > TASK_LAYOUT_DRAG_START_SLOP_DP) {
        draggingThisGestureRef.current = true;
        suppressPressRef.current = true;
        props.onStartDrag(gesture.moveX, gesture.moveY);
      }
      if (draggingThisGestureRef.current) props.onDragMove(gesture.moveX, gesture.moveY);
    },
    onPanResponderRelease: () => {
      clearTimer();
      if (draggingThisGestureRef.current) props.onRelease();
      suppressPressRef.current = armedThisGestureRef.current || props.selected;
      armedThisGestureRef.current = false;
      draggingThisGestureRef.current = false;
      setTimeout(() => {
        suppressPressRef.current = false;
      }, 0);
    },
    onPanResponderTerminate: () => {
      clearTimer();
      if (draggingThisGestureRef.current) props.onCancel();
      armedThisGestureRef.current = false;
      draggingThisGestureRef.current = false;
      suppressPressRef.current = true;
      setTimeout(() => {
        suppressPressRef.current = false;
      }, 0);
    },
    onPanResponderTerminationRequest: () => !armedThisGestureRef.current && !selectedRef.current,
  }), [
    clearTimer,
    props.disabled,
    props.onArm,
    props.onCancel,
    props.onDragMove,
    props.onRelease,
    props.onStartDrag,
    props.selected,
  ]);

  const point = projectTaskToQuadrantMap(props.task, props.nowInput);
  const meta = QUADRANT_HOME_META[props.quadrant];
  const dueLabel = props.task.dueAt === null
    ? '无截止时间'
    : `截止 ${props.task.dueAt.slice(0, 16).replace('T', ' ')}`;
  const firstStepLabel = props.task.firstStep == null || props.task.firstStep.trim() === ''
    ? '未填写第一小步'
    : `当前第一小步 ${props.task.firstStep}`;
  const rotate = wobble.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-0.8deg', '0deg', '0.8deg'],
  });
  return (
    <Animated.View
      style={[
        styles.nodePosition,
        {left: props.position.left, top: props.position.top},
        props.dragging && styles.nodePlaceholder,
        props.selected && {
          elevation: 9,
          transform: [{scale: 1.02}, {rotate}],
          zIndex: 8,
        },
      ]}>
      <Pressable
        accessibilityActions={[
          {name: 'moveQ1', label: '移动到救火区'},
          {name: 'moveQ2', label: '移动到成长区'},
          {name: 'moveQ3', label: '移动到干扰区'},
          {name: 'moveQ4', label: '移动到清理区'},
        ]}
        accessibilityHint={props.selected
          ? '已选中，可拖动改变位置或象限；点击其他区域退出布局模式'
          : '双击打开；按住一秒进入任务布局模式'}
        accessibilityLabel={`${meta.title}任务：${props.task.title}`}
        accessibilityRole="button"
        accessibilityState={{disabled: props.disabled, selected: props.selected || props.dragging}}
        accessibilityValue={{
          text: `${props.task.title}，${meta.title}，${dueLabel}，${firstStepLabel}，进度 ${point.progress}%`,
        }}
        disabled={props.disabled}
        hitSlop={4}
        onAccessibilityAction={event => {
          const target = ({moveQ1: 'Q1', moveQ2: 'Q2', moveQ3: 'Q3', moveQ4: 'Q4'} as const)[event.nativeEvent.actionName as 'moveQ1'];
          if (target !== undefined) props.onAccessibleMove(target);
        }}
        onLayout={event => props.onLayoutSize(event.nativeEvent.layout)}
        onPress={() => {
          if (!suppressPressRef.current) props.onPress();
        }}
        style={[
          styles.mapNode,
          props.dark && styles.mapNodeDark,
          {borderColor: meta.accent, width: props.size.width, minHeight: props.size.height},
          point.hasDeadline && styles.nodeDeadline,
          props.recommended && styles.nodeRecommended,
          props.selected && styles.nodeSelected,
        ]}
        {...panResponder.panHandlers}>
        <View style={[styles.nodeDot, {backgroundColor: point.hasDeadline ? '#D97706' : meta.accent}]} />
        <Text
          numberOfLines={compactTaskLabelConfig(
            props.quadrantTaskCount,
            props.selected || props.recommended,
          ).numberOfLines}
          style={[styles.nodeTitle, props.dark && styles.nodeTitleDark]}>
          {getCompactTaskLabel(props.task.title, props.largeText ? 14 : 22)}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function QuadrantTaskMap(props: QuadrantTaskMapProps): React.JSX.Element {
  const gridRef = React.useRef<React.ElementRef<typeof View>>(null);
  const cellRefs = React.useRef<Partial<Record<Quadrant, React.ElementRef<typeof View> | null>>>({});
  const gridBoundsRef = React.useRef<MapBounds | null>(null);
  const quadrantRectsRef = React.useRef<Partial<Record<Quadrant, LayoutRect>>>({});
  const nodeSizesRef = React.useRef<Record<string, LayoutSize>>({});
  const overlayPosition = React.useRef(new Animated.ValueXY()).current;
  const overlayTopLeftRef = React.useRef({x: 0, y: 0});
  const [mode, dispatch] = React.useReducer(taskLayoutReducer, IDLE_TASK_LAYOUT_MODE);
  const modeRef = React.useRef<TaskLayoutMode>(mode);
  const modeGenerationRef = React.useRef(0);
  const [placements, setPlacements] = React.useState<Readonly<Record<string, QuadrantPlacement>>>({});
  const [, setLayoutRevision] = React.useState(0);
  modeRef.current = mode;

  const activeTask = mode.status === 'idle'
    ? null
    : props.tasks.find(task => task.id === mode.taskId) ?? null;

  const exitMode = React.useCallback(() => {
    modeGenerationRef.current += 1;
    modeRef.current = IDLE_TASK_LAYOUT_MODE;
    dispatch({type: 'exit'});
    props.onDraggingChange(false);
  }, [props.onDraggingChange]);

  React.useEffect(() => {
    let current = true;
    const taskIds = new Set(props.tasks.map(task => task.id));
    void props.repository.read(taskIds).then(value => {
      if (current) setPlacements(value);
    }).catch(() => undefined);
    void props.repository.removeOrphans(taskIds).catch(() => undefined);
    return () => {
      current = false;
    };
  }, [props.repository, props.tasks]);

  React.useEffect(() => {
    if (mode.status !== 'idle' && !props.tasks.some(task => task.id === mode.taskId)) exitMode();
  }, [exitMode, mode, props.tasks]);

  React.useEffect(() => {
    const appState = AppState.addEventListener('change', state => {
      if (state !== 'active') exitMode();
    });
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (modeRef.current.status === 'idle') return false;
      exitMode();
      return true;
    });
    return () => {
      appState.remove();
      back.remove();
      props.onDraggingChange(false);
    };
  }, [exitMode, props.onDraggingChange]);

  const measureMap = React.useCallback(() => {
    gridRef.current?.measureInWindow((left, top, width, height) => {
      if (width <= 0 || height <= 0) return;
      gridBoundsRef.current = {left, top, width, height};
      const next: Partial<Record<Quadrant, LayoutRect>> = {};
      let pending = 4;
      const finish = () => {
        pending -= 1;
        if (pending === 0) {
          quadrantRectsRef.current = next;
          setLayoutRevision(value => value + 1);
        }
      };
      for (const quadrant of ['Q1', 'Q2', 'Q3', 'Q4'] as const) {
        const ref = cellRefs.current[quadrant];
        if (ref === null || ref === undefined) {
          finish();
          continue;
        }
        ref.measureInWindow((cellLeft, cellTop, cellWidth, cellHeight) => {
          next[quadrant] = {
            x: cellLeft - left,
            y: cellTop - top,
            width: cellWidth,
            height: cellHeight,
          };
          finish();
        });
      }
    });
  }, []);

  React.useEffect(() => {
    const handle = setTimeout(measureMap, 0);
    return () => clearTimeout(handle);
  }, [measureMap, props.largeText, props.tasks.length]);

  function placementFor(task: Task): QuadrantPlacement {
    return placements[task.id] ?? fallbackPlacement(task, props.nowInput);
  }

  function positionFor(task: Task, quadrant: Quadrant): Readonly<{left: number; top: number}> {
    const rect = quadrantRectsRef.current[quadrant];
    const size = nodeSizesRef.current[task.id] ?? DEFAULT_NODE_SIZE;
    if (rect === undefined) {
      const placement = placementFor(task);
      return {left: 8 + placement.xRatio * 72, top: 52 + placement.yRatio * 105};
    }
    const center = constrainTaskCenter(
      pointForPlacement(placementFor(task), contentRectForQuadrant(rect)),
      contentRectForQuadrant(rect),
      size,
    );
    return {
      left: center.x - rect.x - size.width / 2,
      top: center.y - rect.y - size.height / 2,
    };
  }

  function armTask(task: Task): void {
    const quadrant = effectiveQuadrantForTask(task, props.nowInput);
    const next: TaskLayoutMode = {
      status: 'armed',
      taskId: task.id,
      originQuadrant: quadrant,
      originPlacement: placementFor(task),
    };
    modeRef.current = next;
    dispatch({
      type: 'arm',
      taskId: task.id,
      originQuadrant: quadrant,
      originPlacement: placementFor(task),
    });
    AccessibilityInfo.announceForAccessibility('已选中，可拖动改变位置或象限；点击其他区域退出布局模式。');
  }

  function startDragging(task: Task, pageX: number, pageY: number): void {
    const current = modeRef.current;
    if (current.status !== 'armed' || current.taskId !== task.id) return;
    const bounds = gridBoundsRef.current;
    const rect = quadrantRectsRef.current[current.originQuadrant];
    if (bounds === null || rect === undefined) {
      measureMap();
      return;
    }
    const size = nodeSizesRef.current[task.id] ?? DEFAULT_NODE_SIZE;
    const center = constrainTaskCenter(
      pointForPlacement(current.originPlacement, contentRectForQuadrant(rect)),
      contentRectForQuadrant(rect),
      size,
    );
    const topLeft = {x: center.x - size.width / 2, y: center.y - size.height / 2};
    const pointerOffsetX = pageX - bounds.left - topLeft.x;
    const pointerOffsetY = pageY - bounds.top - topLeft.y;
    overlayTopLeftRef.current = topLeft;
    overlayPosition.setValue(topLeft);
    const next = taskLayoutReducer(current, {
      type: 'start_drag',
      pointerOffsetX,
      pointerOffsetY,
      candidateQuadrant: current.originQuadrant,
    });
    modeRef.current = next;
    dispatch({
      type: 'start_drag',
      pointerOffsetX,
      pointerOffsetY,
      candidateQuadrant: current.originQuadrant,
    });
    props.onDraggingChange(true);
  }

  function moveDragging(pageX: number, pageY: number): void {
    const current = modeRef.current;
    const bounds = gridBoundsRef.current;
    if (current.status !== 'dragging' || bounds === null) return;
    const taskSize = nodeSizesRef.current[current.taskId] ?? DEFAULT_NODE_SIZE;
    const topLeft = {
      x: pageX - bounds.left - current.pointerOffsetX,
      y: pageY - bounds.top - current.pointerOffsetY,
    };
    overlayTopLeftRef.current = topLeft;
    overlayPosition.setValue(topLeft);
    const candidate = quadrantAtTaskCenter({
      x: topLeft.x + taskSize.width / 2,
      y: topLeft.y + taskSize.height / 2,
    }, quadrantRectsRef.current);
    if (candidate !== current.candidateQuadrant) {
      modeRef.current = {...current, candidateQuadrant: candidate};
      dispatch({type: 'move', candidateQuadrant: candidate});
    }
  }

  async function releaseDragging(): Promise<void> {
    const current = modeRef.current;
    if (current.status !== 'dragging') return;
    props.onDraggingChange(false);
    const targetQuadrant = current.candidateQuadrant;
    const targetRect = targetQuadrant === null ? undefined : quadrantRectsRef.current[targetQuadrant];
    const task = props.tasks.find(candidate => candidate.id === current.taskId);
    if (targetQuadrant === null || targetRect === undefined || task === undefined) {
      modeRef.current = taskLayoutReducer(current, {type: 'cancel_drag'});
      dispatch({type: 'cancel_drag'});
      return;
    }
    const contentRect = contentRectForQuadrant(targetRect);
    const size = nodeSizesRef.current[current.taskId] ?? DEFAULT_NODE_SIZE;
    const desiredCenter = constrainTaskCenter({
      x: overlayTopLeftRef.current.x + size.width / 2,
      y: overlayTopLeftRef.current.y + size.height / 2,
    }, contentRect, size);
    const desired = normalizePointInRect(desiredCenter, contentRect);
    const occupied = props.tasks
      .filter(candidate => candidate.id !== current.taskId &&
        effectiveQuadrantForTask(candidate, props.nowInput) === targetQuadrant)
      .map(candidate => ({
        placement: placementFor(candidate),
        size: nodeSizesRef.current[candidate.id] ?? DEFAULT_NODE_SIZE,
      }));
    const targetPlacement = nearestAvailablePlacement({
      desired,
      contentRect,
      taskSize: size,
      occupied,
    });
    modeRef.current = {status: 'committing', taskId: current.taskId};
    dispatch({type: 'commit'});
    const commitGeneration = modeGenerationRef.current;
    try {
      await props.onCommit({
        taskId: current.taskId,
        originQuadrant: current.originQuadrant,
        originPlacement: current.originPlacement,
        targetQuadrant,
        targetPlacement,
      });
      if (commitGeneration !== modeGenerationRef.current) return;
      setPlacements(value => ({...value, [current.taskId]: targetPlacement}));
      const settled: TaskLayoutMode = {
        status: 'armed',
        taskId: current.taskId,
        originQuadrant: targetQuadrant,
        originPlacement: targetPlacement,
      };
      modeRef.current = settled;
      dispatch({type: 'settle', quadrant: targetQuadrant, placement: targetPlacement});
    } catch {
      if (commitGeneration !== modeGenerationRef.current) return;
      const restored: TaskLayoutMode = {
        status: 'armed',
        taskId: current.taskId,
        originQuadrant: current.originQuadrant,
        originPlacement: current.originPlacement,
      };
      modeRef.current = restored;
      dispatch({
        type: 'arm',
        taskId: current.taskId,
        originQuadrant: current.originQuadrant,
        originPlacement: current.originPlacement,
      });
    }
  }

  function accessibleMove(task: Task, targetQuadrant: Quadrant): void {
    const originQuadrant = effectiveQuadrantForTask(task, props.nowInput);
    const originPlacement = placementFor(task);
    const targetPlacement = targetQuadrant === originQuadrant
      ? originPlacement
      : {xRatio: 0.5, yRatio: 0.5};
    armTask(task);
    void props.onCommit({
      taskId: task.id,
      originQuadrant,
      originPlacement,
      targetQuadrant,
      targetPlacement,
    }).then(() => {
      setPlacements(value => ({...value, [task.id]: targetPlacement}));
      dispatch({
        type: 'arm',
        taskId: task.id,
        originQuadrant: targetQuadrant,
        originPlacement: targetPlacement,
      });
    }).catch(() => undefined);
  }

  const dragTarget = mode.status === 'dragging' ? mode.candidateQuadrant : null;
  const overlaySize = activeTask === null
    ? DEFAULT_NODE_SIZE
    : nodeSizesRef.current[activeTask.id] ?? DEFAULT_NODE_SIZE;
  return (
    <View accessibilityLabel="四象限任务地图" style={styles.mapShell}>
      <Text style={[styles.axis, props.dark && styles.axisDark]}>紧急程度 ↑</Text>
      <View onLayout={measureMap} ref={gridRef} style={styles.mapGrid}>
        {QUADRANT_MAP_ROWS.map((row, rowIndex) => (
          <View key={`row-${rowIndex}`} style={styles.mapRow}>
            {row.map(quadrant => {
              const meta = QUADRANT_HOME_META[quadrant];
              const quadrantTasks = props.tasks.filter(task =>
                effectiveQuadrantForTask(task, props.nowInput) === quadrant);
              const visible = selectVisibleQuadrantTasks(
                quadrantTasks,
                mode.status === 'idle' ? null : mode.taskId,
                props.recommendedId,
              );
              return (
                <View
                  key={quadrant}
                  onLayout={measureMap}
                  ref={ref => {
                    cellRefs.current[quadrant] = ref;
                  }}
                  style={[
                    styles.mapCell,
                    {backgroundColor: props.dark ? '#18312C' : meta.tint},
                    dragTarget === quadrant && styles.dragTarget,
                  ]}>
                  <Pressable accessibilityLabel={`${meta.title}地图空白`} onPress={exitMode} style={StyleSheet.absoluteFill} />
                  <View style={styles.heading}>
                    <Pressable accessibilityRole="button" onPress={exitMode} style={styles.headingText}>
                      <Text style={[styles.title, {color: meta.accent}]}>{meta.title} · {quadrantTasks.length}</Text>
                      <Text style={[styles.description, props.dark && styles.descriptionDark]}>{meta.description}</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`在${meta.title}添加任务`}
                      accessibilityRole="button"
                      disabled={props.actionPending}
                      hitSlop={8}
                      onPress={() => {
                        exitMode();
                        props.onAdd(quadrant);
                      }}
                      style={[styles.addButton, props.dark && styles.addButtonDark]}>
                      <Text style={[styles.addText, props.dark && styles.addTextDark]}>＋</Text>
                    </Pressable>
                  </View>
                  {visible.map(task => {
                    const size = nodeSizesRef.current[task.id] ?? DEFAULT_NODE_SIZE;
                    const selected = mode.status !== 'idle' && mode.taskId === task.id;
                    const dragging = selected && (mode.status === 'dragging' || mode.status === 'committing');
                    return (
                      <LayoutTaskNode
                        disabled={props.actionPending || mode.status === 'committing'}
                        dark={props.dark}
                        dragging={dragging}
                        key={task.id}
                        largeText={props.largeText}
                        onAccessibleMove={target => accessibleMove(task, target)}
                        onArm={() => armTask(task)}
                        onCancel={() => {
                          props.onDraggingChange(false);
                          if (modeRef.current.status === 'dragging') {
                            modeRef.current = taskLayoutReducer(modeRef.current, {type: 'cancel_drag'});
                            dispatch({type: 'cancel_drag'});
                          }
                        }}
                        onDragMove={moveDragging}
                        onLayoutSize={nextSize => {
                          if (Math.abs(nextSize.width - size.width) > 0.5 || Math.abs(nextSize.height - size.height) > 0.5) {
                            nodeSizesRef.current[task.id] = nextSize;
                            setLayoutRevision(value => value + 1);
                          }
                        }}
                        nowInput={props.nowInput}
                        onPress={() => {
                          if (modeRef.current.status !== 'idle') {
                            exitMode();
                            return;
                          }
                          props.onTask(task.id);
                        }}
                        onRelease={() => {
                          void releaseDragging();
                        }}
                        onStartDrag={(pageX, pageY) => startDragging(task, pageX, pageY)}
                        position={positionFor(task, quadrant)}
                        quadrant={quadrant}
                        quadrantTaskCount={quadrantTasks.length}
                        recommended={props.recommendedId === task.id}
                        reduceMotion={props.reduceMotion}
                        selected={selected}
                        size={size}
                        task={task}
                      />
                    );
                  })}
                  {quadrantTasks.length > visible.length ? (
                    <Pressable
                      accessibilityLabel={`查看${meta.title}其余${quadrantTasks.length - visible.length}项任务`}
                      onPress={() => {
                        exitMode();
                        props.onShowList(quadrant);
                      }}
                      style={styles.overflowBadge}>
                      <Text style={styles.overflowText}>+{quadrantTasks.length - visible.length} 项</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}
        {mode.status === 'dragging' && activeTask !== null ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.dragOverlay,
              props.dark && styles.dragOverlayDark,
              {width: overlaySize.width, minHeight: overlaySize.height},
              overlayPosition.getLayout(),
            ]}>
            <Text numberOfLines={3} style={[styles.overlayTitle, props.dark && styles.overlayTitleDark]}>{activeTask.title}</Text>
          </Animated.View>
        ) : null}
      </View>
      {mode.status === 'armed' ? (
        <Text accessibilityLiveRegion="polite" style={[styles.modeHint, props.dark && styles.axisDark]}>任务已选中：拖动调整，点击其他区域退出</Text>
      ) : dragTarget === null ? null : (
        <Text accessibilityLiveRegion="polite" style={[styles.modeHint, props.dark && styles.axisDark]}>松手移到：{QUADRANT_HOME_META[dragTarget].title}</Text>
      )}
      <Text style={[styles.axis, styles.axisRight, props.dark && styles.axisDark]}>重要程度 →</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mapShell: {gap: 7},
  axis: {color: '#4D625D', fontSize: 12, fontWeight: '800'},
  axisDark: {color: '#B8CCC7'},
  axisRight: {textAlign: 'right'},
  mapGrid: {height: 430, borderWidth: 1, borderColor: '#A9B9B5', borderRadius: 18, overflow: 'hidden'},
  mapRow: {flex: 1, flexDirection: 'row'},
  mapCell: {flex: 1, borderWidth: StyleSheet.hairlineWidth, borderColor: '#A9B9B5', minHeight: 200, overflow: 'hidden'},
  dragTarget: {borderWidth: 3, borderColor: '#1F7466'},
  heading: {position: 'absolute', left: 10, top: 8, right: 7, zIndex: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 4},
  headingText: {flex: 1},
  title: {fontSize: 14, fontWeight: '900'},
  description: {color: '#63736F', fontSize: 11, marginTop: 2},
  descriptionDark: {color: '#A9BDB8'},
  addButton: {width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.86)'},
  addText: {color: '#244D46', fontSize: 20, lineHeight: 22, fontWeight: '800'},
  addButtonDark: {backgroundColor: '#31544C'},
  addTextDark: {color: '#F5FAF8'},
  nodePosition: {position: 'absolute', zIndex: 3},
  nodePlaceholder: {opacity: 0},
  mapNode: {borderWidth: 1, borderRadius: 12, backgroundColor: '#FFFFFF', paddingHorizontal: 6, paddingVertical: 6, flexDirection: 'row', alignItems: 'flex-start', gap: 5},
  mapNodeDark: {backgroundColor: '#24423C'},
  nodeRecommended: {borderWidth: 2, shadowColor: '#173F3A', shadowOpacity: 0.18, shadowRadius: 6, elevation: 3},
  nodeSelected: {borderWidth: 3},
  nodeDeadline: {borderColor: '#D97706'},
  nodeDot: {width: 8, height: 8, borderRadius: 4, marginTop: 4},
  nodeTitle: {flex: 1, color: '#203F3A', fontSize: 10, lineHeight: 13, fontWeight: '800'},
  nodeTitleDark: {color: '#F5FAF8'},
  dragOverlay: {position: 'absolute', zIndex: 50, elevation: 22, borderWidth: 3, borderColor: '#1F7466', borderRadius: 12, backgroundColor: '#FFFFFF', padding: 8, justifyContent: 'center'},
  overlayTitle: {color: '#173F3A', fontSize: 12, lineHeight: 16, fontWeight: '900'},
  dragOverlayDark: {backgroundColor: '#24423C'},
  overlayTitleDark: {color: '#F5FAF8'},
  modeHint: {color: '#244D46', fontSize: 13, fontWeight: '900', textAlign: 'center'},
  overflowBadge: {position: 'absolute', right: 8, bottom: 8, zIndex: 9, borderRadius: 10, backgroundColor: '#FFFFFF', paddingHorizontal: 8, paddingVertical: 5},
  overflowText: {color: '#35534E', fontSize: 11, fontWeight: '800'},
});
