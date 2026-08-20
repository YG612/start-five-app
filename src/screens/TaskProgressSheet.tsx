import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {AppBottomSheet} from '../components/AppBottomSheet';
import type {
  DeliveryRiskDismissedBand,
  PlannedWorkSession,
  Task,
  TaskProgress,
  TaskProgressSource,
  TaskStep,
} from '../domain/task';
import {
  completeActiveTaskStep,
  createTaskStepPlan,
  deliveryRiskDismissedBand,
  deriveDeliveryRisk,
  firstStepQualityHint,
  generatePlannedWorkSessions,
  moveTaskStep,
  nextPlannedWorkSession,
  normalizeCompletionDefinition,
  plannedMinutesBeforeDue,
  remainingMinutesForTask,
  shiftUnstartedPlanByLocalDay,
  shouldShowDeliveryRisk,
  skipOrRemoveTaskStep,
} from '../domain/taskExecutionPlan';

export type P13TaskPatch = Readonly<{
  completionDefinition?: string | null;
  progressSource?: TaskProgressSource;
  steps?: TaskStep[];
  plannedWorkSessions?: PlannedWorkSession[];
  firstStep?: string | null;
  progress?: TaskProgress;
  nextStartAt?: string | null;
  deliveryRiskDismissedAt?: string | null;
  deliveryRiskDismissedBand?: DeliveryRiskDismissedBand | null;
}>;

type Props = Readonly<{
  task: Task;
  now(): string;
  pending: boolean;
  error: string | null;
  onClose(): void;
  onUpdate(patch: P13TaskPatch): Promise<Task>;
  onStartPlanned(session: PlannedWorkSession): Promise<void>;
  onOpenRescue(): void;
  onAdjustDueAt(): void;
}>;

let executionIdSequence = 0;

function nextExecutionId(taskId: string, kind: string): string {
  executionIdSequence += 1;
  return `p13:${taskId}:${kind}:${executionIdSequence}`;
}

function patchFor(task: Task): P13TaskPatch {
  const progress = task.progress;
  const nextStartAt = (task as Task & {nextStartAt?: string | null}).nextStartAt;
  return {
    completionDefinition: task.completionDefinition ?? null,
    ...(task.progressSource === undefined
      ? {}
      : {progressSource: task.progressSource}),
    ...(task.steps === undefined
      ? {}
      : {steps: task.steps.map(step => ({...step}))}),
    ...(task.plannedWorkSessions === undefined
      ? {}
      : {
          plannedWorkSessions: task.plannedWorkSessions.map(session => ({
            ...session,
          })),
        }),
    firstStep: task.firstStep ?? null,
    ...(progress === undefined ? {} : {progress}),
    ...(nextStartAt === undefined ? {} : {nextStartAt}),
    ...(task.deliveryRiskDismissedAt === undefined
      ? {}
      : {deliveryRiskDismissedAt: task.deliveryRiskDismissedAt}),
    ...(task.deliveryRiskDismissedBand === undefined
      ? {}
      : {deliveryRiskDismissedBand: task.deliveryRiskDismissedBand}),
  };
}

function Button(props: Readonly<{
  label: string;
  onPress(): void;
  disabled?: boolean;
  secondary?: boolean;
}>): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={[
        styles.button,
        props.secondary && styles.buttonSecondary,
        props.disabled && styles.disabled,
      ]}>
      <Text style={[styles.buttonText, props.secondary && styles.buttonTextSecondary]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

function localStart(value: string, nowInput: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/.exec(value.trim());
  if (match === null) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    0,
    0,
  );
  if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.parse(nowInput)) {
    return null;
  }
  return date.toISOString();
}

function defaultStart(nowInput: string, dayOffset: number): string {
  const date = new Date(nowInput);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(20, 30, 0, 0);
  if (date.getTime() <= Date.parse(nowInput)) date.setDate(date.getDate() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function displayTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TaskProgressSheet(props: Props): React.JSX.Element {
  const [definition, setDefinition] = React.useState(
    props.task.completionDefinition ?? '',
  );
  const [stepDraft, setStepDraft] = React.useState(
    [...(props.task.steps ?? [])]
      .sort((left, right) => left.order - right.order)
      .map(step => `${step.title}${step.estimatedMinutes === undefined ? '' : ` | ${step.estimatedMinutes}`}`)
      .join('\n'),
  );
  const [progressSource, setProgressSource] = React.useState<TaskProgressSource>(
    props.task.progressSource ?? 'STEPS',
  );
  const [plannedMinutes, setPlannedMinutes] = React.useState<15 | 25 | 45>(25);
  const [startText, setStartText] = React.useState(() => defaultStart(props.now(), 0));
  const [preview, setPreview] = React.useState<readonly string[]>([]);
  const [notice, setNotice] = React.useState<string | null>(null);
  const currentStep = (props.task.steps ?? []).find(step => step.status === 'ACTIVE');
  const quality = currentStep === undefined
    ? null
    : firstStepQualityHint({
        taskTitle: props.task.title,
        stepTitle: currentStep.title,
        ...(currentStep.estimatedMinutes === undefined
          ? {}
          : {estimatedMinutes: currentStep.estimatedMinutes}),
      });
  const remaining = remainingMinutesForTask(props.task);
  const plannedBeforeDue = plannedMinutesBeforeDue(props.task);
  const nextPlan = nextPlannedWorkSession(props.task);
  const risk = deriveDeliveryRisk({
    remainingMinutes: remaining,
    plannedMinutesBeforeDue: plannedBeforeDue,
    dueAt: props.task.dueAt,
    nextStartAt: nextPlan?.plannedStartAt ?? null,
    now: props.now(),
  });

  function saveDefinition(): void {
    let normalized: string | null;
    try {
      normalized = normalizeCompletionDefinition(definition);
    } catch {
      setNotice('完成标准最多 300 字。');
      return;
    }
    void props.onUpdate({completionDefinition: normalized})
      .then(() => setNotice('完成标准已保存在本机。'))
      .catch(() => setNotice('保存失败，草稿已保留。'));
  }

  function saveSteps(): void {
    const drafts = stepDraft
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const [title = '', estimate] = line.split('|').map(value => value.trim());
        const parsed = estimate === undefined || estimate === ''
          ? undefined
          : Number.parseInt(estimate, 10);
        return {
          title,
          ...(parsed === undefined || !Number.isFinite(parsed)
            ? {}
            : {estimatedMinutes: parsed}),
        };
      });
    try {
      const next = createTaskStepPlan({
        task: props.task,
        drafts,
        progressSource,
        now: props.now(),
        idGenerator: () => nextExecutionId(props.task.id, 'step'),
      });
      void props.onUpdate(patchFor(next))
        .then(() => setNotice('推进步骤已保存，首页会显示当前一步。'))
        .catch(() => setNotice('保存失败，步骤草稿已保留。'));
    } catch {
      setNotice('请输入 1–12 个非空步骤；预计分钟需为正整数。');
    }
  }

  function updateStep(next: Task): void {
    void props.onUpdate(patchFor(next)).catch(() =>
      setNotice('步骤更新失败，请重试。'),
    );
  }

  function buildPreview(): void {
    const first = localStart(startText, props.now());
    if (first === null) {
      setNotice('请输入未来的本地时间，例如 2026-08-16 20:30。');
      return;
    }
    const count = Math.max(
      1,
      Math.min(10, Math.ceil((remaining ?? plannedMinutes) / plannedMinutes)),
    );
    const starts = Array.from({length: count}, (_, index) => {
      const date = new Date(first);
      date.setDate(date.getDate() + index);
      return date.toISOString();
    });
    setPreview(starts);
    setNotice(null);
  }

  function savePlan(): void {
    try {
      const next = generatePlannedWorkSessions({
        task: props.task,
        plannedMinutes,
        plannedStartTimes: preview,
        now: props.now(),
        idGenerator: () => nextExecutionId(props.task.id, 'plan'),
      });
      void props.onUpdate(patchFor(next))
        .then(() => {
          setPreview([]);
          setNotice('推进计划已保存，只会提醒最近一次行动。');
        })
        .catch(() => setNotice('计划保存失败，预览已保留。'));
    } catch {
      setNotice('请先生成 1–10 次未来行动。');
    }
  }

  function dismissRisk(): void {
    const now = props.now();
    void props.onUpdate({
      deliveryRiskDismissedAt: now,
      deliveryRiskDismissedBand: deliveryRiskDismissedBand(props.task, now),
    });
  }

  return (
    <AppBottomSheet
      onDismissAttempt={() => {
        props.onClose();
        return true;
      }}
      subtitle={props.task.title}
      title="长期任务计划">
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.label}>做到这里就算完成</Text>
            <TextInput
              accessibilityLabel="做到这里就算完成"
              maxLength={300}
              multiline
              onChangeText={setDefinition}
              placeholder="例如：提交一份包含结论和引用的论文初稿（可选）"
              style={[styles.input, styles.multiline]}
              value={definition}
            />
            <Text style={styles.hint}>{definition.length}/300 · 只保存在本机</Text>
            <Button disabled={props.pending} label="保存完成标准" onPress={saveDefinition} />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>添加推进步骤</Text>
            <Text style={styles.hint}>每行一步，可写“步骤 | 预计分钟”，最多 12 步。</Text>
            <TextInput
              accessibilityLabel="推进步骤列表"
              multiline
              onChangeText={setStepDraft}
              placeholder={'打开论文文档 | 10\n列出三个小标题 | 15'}
              style={[styles.input, styles.stepsInput]}
              value={stepDraft}
            />
            <View style={styles.row}>
              <Button
                label="按步骤计算进度"
                onPress={() => setProgressSource('STEPS')}
                secondary={progressSource !== 'STEPS'}
              />
              <Button
                label="保留手动进度"
                onPress={() => setProgressSource('MANUAL')}
                secondary={progressSource !== 'MANUAL'}
              />
            </View>
            <Button disabled={props.pending} label="保存步骤计划" onPress={saveSteps} />
            {quality?.needsSuggestion === true ? (
              <View style={styles.suggestion}>
                <Text style={styles.label}>这一步可能还是有点大。</Text>
                <Text style={styles.hint}>{quality.suggestion}</Text>
                <Text style={styles.hint}>也可以从：打开… / 找到… / 列出… / 阅读第一页… / 发送一条… 开始。</Text>
              </View>
            ) : null}
            {[...(props.task.steps ?? [])]
              .sort((left, right) => left.order - right.order)
              .map((step, index, all) => (
                <View key={step.id} style={styles.stepRow}>
                  <View style={styles.flex}>
                    <Text style={styles.stepTitle}>
                      {step.status === 'ACTIVE' ? '现在：' : ''}{step.title}
                    </Text>
                    <Text style={styles.hint}>
                      {step.status}{step.estimatedMinutes === undefined ? '' : ` · ${step.estimatedMinutes} 分钟`}
                    </Text>
                  </View>
                  {step.status === 'ACTIVE' ? (
                    <Button
                      label="完成了这一步"
                      onPress={() => updateStep(completeActiveTaskStep(props.task, props.now()))}
                      secondary
                    />
                  ) : null}
                  <Button
                    disabled={index === 0}
                    label="上移"
                    onPress={() => updateStep(moveTaskStep(props.task, step.id, 'UP'))}
                    secondary
                  />
                  <Button
                    disabled={index === all.length - 1}
                    label="下移"
                    onPress={() => updateStep(moveTaskStep(props.task, step.id, 'DOWN'))}
                    secondary
                  />
                  <Button
                    label="跳过"
                    onPress={() => updateStep(skipOrRemoveTaskStep({
                      task: props.task,
                      stepId: step.id,
                      now: props.now(),
                      hasFocusHistory: step.status === 'ACTIVE',
                    }))}
                    secondary
                  />
                </View>
              ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>安排推进计划</Text>
            <Text style={styles.hint}>
              {remaining === null ? '剩余时间还没有估计。' : `这项任务还需要大约 ${remaining} 分钟。`}
            </Text>
            <Text style={styles.label}>每次做多久？</Text>
            <View style={styles.row}>
              {([15, 25, 45] as const).map(minutes => (
                <Button
                  key={minutes}
                  label={`${minutes} 分钟`}
                  onPress={() => setPlannedMinutes(minutes)}
                  secondary={plannedMinutes !== minutes}
                />
              ))}
            </View>
            <View style={styles.row}>
              <Button label="今天" onPress={() => setStartText(defaultStart(props.now(), 0))} secondary />
              <Button label="明天" onPress={() => setStartText(defaultStart(props.now(), 1))} secondary />
            </View>
            <TextInput
              accessibilityLabel="计划开始时间"
              onChangeText={setStartText}
              placeholder="YYYY-MM-DD HH:mm"
              style={styles.input}
              value={startText}
            />
            <Button label="预览计划" onPress={buildPreview} />
            {preview.map((value, index) => (
              <View key={`${value}:${index}`} style={styles.previewRow}>
                <Text style={styles.flex}>{displayTime(value)} · {plannedMinutes} 分钟{currentStep === undefined ? '' : ` · ${currentStep.title}`}</Text>
                <Button
                  label="删除这次"
                  onPress={() => setPreview(current => current.filter((_, itemIndex) => itemIndex !== index))}
                  secondary
                />
              </View>
            ))}
            {preview.length === 0 ? null : (
              <Button disabled={props.pending} label="保存推进计划" onPress={savePlan} />
            )}
            {(props.task.plannedWorkSessions ?? [])
              .filter(session => session.status === 'PLANNED')
              .sort((left, right) => Date.parse(left.plannedStartAt) - Date.parse(right.plannedStartAt))
              .map((session, index) => (
                <View key={session.id} style={styles.previewRow}>
                  <Text style={styles.flex}>
                    {index === 0 ? '最近一次 · ' : ''}{displayTime(session.plannedStartAt)} · {session.plannedMinutes} 分钟
                  </Text>
                  {index === 0 ? (
                    <Button label={`开始 ${session.plannedMinutes} 分钟`} onPress={() => void props.onStartPlanned(session)} />
                  ) : null}
                </View>
              ))}
            {(props.task.plannedWorkSessions ?? []).some(session => session.status === 'PLANNED') ? (
              <Button
                label="所有未开始行动顺延一天"
                onPress={() => {
                  const shifted = shiftUnstartedPlanByLocalDay({task: props.task, now: props.now()});
                  setNotice(
                    shifted.crossesDueAt
                      ? '顺延会越过最终截止，请先调整截止时间。'
                      : '未开始行动已顺延一天。',
                  );
                  if (!shifted.crossesDueAt) void props.onUpdate(patchFor(shifted.task));
                }}
                secondary
              />
            ) : null}
          </View>

          {(risk === 'AT_RISK' || risk === 'NEEDS_PLAN') &&
          shouldShowDeliveryRisk(props.task, props.now()) ? (
            <View style={styles.riskCard}>
              <Text style={styles.label}>按现在的安排，时间可能不够。</Text>
              <Text style={styles.hint}>不会自动修改截止时间或删减范围。</Text>
              <View style={styles.row}>
                <Button label="增加一次行动" onPress={() => setStartText(defaultStart(props.now(), 0))} />
                <Button label="先做能交的版本" onPress={props.onOpenRescue} secondary />
                <Button label="调整截止时间" onPress={props.onAdjustDueAt} secondary />
                <Button label="24 小时内不再提示" onPress={dismissRisk} secondary />
              </View>
            </View>
          ) : null}

          {notice === null ? null : (
            <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>
          )}
          {props.error === null ? null : (
            <Text accessibilityLiveRegion="assertive" style={styles.error}>保存失败，请重试；当前草稿仍保留。</Text>
          )}
        </ScrollView>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {padding: 18, gap: 14, paddingBottom: 36},
  card: {backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, gap: 10},
  riskCard: {backgroundColor: '#FFF4E5', borderRadius: 16, padding: 14, gap: 10},
  label: {fontSize: 15, fontWeight: '800', color: '#173F3A'},
  hint: {fontSize: 13, lineHeight: 19, color: '#60716D'},
  input: {borderWidth: 1, borderColor: '#C9D7D3', borderRadius: 12, padding: 12, color: '#173F3A'},
  multiline: {minHeight: 78, textAlignVertical: 'top'},
  stepsInput: {minHeight: 120, textAlignVertical: 'top'},
  row: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  stepRow: {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#D7E1DE', paddingTop: 10, gap: 7},
  previewRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  suggestion: {backgroundColor: '#EEF6F3', borderRadius: 12, padding: 10, gap: 4},
  stepTitle: {fontSize: 14, fontWeight: '700', color: '#173F3A'},
  button: {backgroundColor: '#176B5B', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9},
  buttonSecondary: {backgroundColor: '#E6F0ED'},
  buttonText: {color: '#FFFFFF', fontWeight: '800', fontSize: 13},
  buttonTextSecondary: {color: '#1D5A4E'},
  disabled: {opacity: 0.42},
  notice: {color: '#1D5A4E', fontWeight: '700'},
  error: {color: '#A23A2A', fontWeight: '700'},
  flex: {flex: 1},
});
