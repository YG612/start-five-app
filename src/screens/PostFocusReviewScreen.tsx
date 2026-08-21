import React, {useEffect, useState} from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  AppBottomSheet,
  AppBottomSheetScrollView,
} from '../components/AppBottomSheet';
import {usePostFocusReviewRuntime} from '../app/postFocusReviewRuntime';
import {useAppFocusSessionRuntime} from '../app/focusSessionRuntime';
import {useTaskWorkspaceRuntime} from '../app/taskWorkspaceRuntime';
import type {PostFocusReviewOutcome} from '../domain/postFocusReview';
import {formatFocusSummary} from '../presentation/focusSummary';

type ActionButtonProps = Readonly<{
  label: string;
  displayLabel?: string;
  onPress(): void;
  disabled?: boolean;
  secondary?: boolean;
  textOnly?: boolean;
}>;

function ActionButton({
  label,
  displayLabel,
  onPress,
  disabled = false,
  secondary = false,
  textOnly = false,
}: ActionButtonProps): React.JSX.Element {
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
        textOnly && styles.textButton,
        disabled && styles.disabledButton,
      ]}>
      <Text style={[
        styles.buttonText,
        (secondary || textOnly) && styles.secondaryButtonText,
      ]}>{displayLabel ?? label}</Text>
    </Pressable>
  );
}

type OutcomeRadioProps = Readonly<{
  label: string;
  displayLabel?: string;
  selected: boolean;
  onPress(): void;
  disabled: boolean;
}>;

function OutcomeRadio({
  label,
  displayLabel,
  selected,
  onPress,
  disabled,
}: OutcomeRadioProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{checked: selected, disabled}}
      disabled={disabled}
      onPress={onPress}
      style={[styles.radio, selected && styles.radioSelected]}>
      <Text style={styles.radioText}>{displayLabel ?? label}</Text>
    </Pressable>
  );
}

export function PostFocusReviewScreen(props: Readonly<{
  onReturned?(): void;
}> = {}): React.JSX.Element | null {
  const runtime = usePostFocusReviewRuntime();
  const workspace = useTaskWorkspaceRuntime();
  const focus = useAppFocusSessionRuntime();
  const review = runtime?.visibleReview ?? null;
  const receipt = runtime?.visibleReceipt ?? null;
  const [outcome, setOutcome] = useState<PostFocusReviewOutcome | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (review === null) {
      return;
    }
    const active = runtime?.snapshot.active;
    if (active?.kind === 'settling' && active.review.reviewId === review.reviewId) {
      setOutcome(active.outcome);
      setNote(active.note);
      return;
    }
    setOutcome(null);
    setNote('');
  }, [review?.reviewId, runtime?.snapshot.active]);

  if (runtime === null || workspace === null || focus === null) {
    return null;
  }

  if (receipt !== null) {
    const refreshLabel = runtime.snapshot.receiptAcknowledgementFailed
      ? '重试确认并回到象限'
      : runtime.snapshot.workspaceRefreshFailed
        ? '重试刷新象限'
        : '回到象限';
    return (
      <AppBottomSheet
        onDismissAttempt={() => runtime
          .returnToWorkspace(async () => {
            await workspace.refreshProjection();
          }, workspace.closeTask)
          .then(() => {
            props.onReturned?.();
            return true;
          })
          .catch(() => false)}
        title="本次专注已记录">
        <AppBottomSheetScrollView contentContainerStyle={styles.content}>
          <Text style={styles.kicker}>这几分钟推进得怎么样？</Text>
          <View style={styles.panel}>
            <Text style={styles.fact}>本次任务：{receipt.taskTitle}</Text>
            <Text style={styles.points}>+{receipt.awardedPoints}</Text>
            <Text style={styles.fact}>本次成长值：{receipt.awardedPoints}</Text>
            <Text style={styles.fact}>成长值原因：{receipt.reason}</Text>
            <Text style={styles.fact}>
              今日专注：{formatFocusSummary(receipt.todayFocusCount, receipt.todayFocusMinutes)}
            </Text>
          </View>
          {runtime.snapshot.workspaceRefreshFailed ? (
            <Text accessibilityLiveRegion="assertive" style={styles.error}>
              象限暂时没有刷新；可以重试，专注记录仍在本机。
            </Text>
          ) : null}
          {runtime.snapshot.receiptAcknowledgementFailed ? (
            <Text accessibilityLiveRegion="assertive" style={styles.error}>
              这次记录暂时没有确认；可以重试，内容仍在本机。
            </Text>
          ) : null}
          <ActionButton
            label={refreshLabel}
            displayLabel={refreshLabel}
            disabled={runtime.snapshot.workspaceRefreshPending}
            onPress={() => {
              void runtime
                .returnToWorkspace(async () => {
                  await workspace.refreshProjection();
                }, workspace.closeTask)
                .then(() => props.onReturned?.())
                .catch(() => undefined);
            }}
          />
        </AppBottomSheetScrollView>
      </AppBottomSheet>
    );
  }

  if (review === null) {
    return null;
  }

  const pending = runtime.snapshot.settlementPending;
  return (
    <AppBottomSheet
      dirty={outcome !== null || note.trim() !== ''}
      dismissPolicy="confirmDirty"
      onDismissAttempt={() => runtime.dismissReview().then(() => true).catch(() => false)}
      subtitle="选择本次结果，再决定下一步。"
      title="5 分钟结束">
      <AppBottomSheetScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>这几分钟推进得怎么样？</Text>
        <View style={styles.panel}>
          <Text style={styles.fact}>复盘任务：{review.taskTitle}</Text>
          <Text style={styles.fact}>实际专注：{review.actualSeconds}秒</Text>
          <Text style={styles.fact}>
            结束状态：{review.endKind === 'natural' ? '自然完成' : '提前结束'}
          </Text>
          <Text style={styles.fact}>计时状态：已结束</Text>
        </View>
        <Text style={styles.sectionTitle}>接下来怎么做？</Text>
        <View accessibilityRole="radiogroup" style={styles.radioGroup}>
          <OutcomeRadio
            label="有进展"
            displayLabel="稍后继续"
            selected={outcome === 'progress'}
            disabled={pending}
            onPress={() => setOutcome('progress')}
          />
          <OutcomeRadio
            label="完成任务"
            selected={outcome === 'complete'}
            disabled={pending}
            onPress={() => setOutcome('complete')}
          />
        </View>
        <TextInput
          accessibilityLabel="复盘备注"
          editable={!pending}
          multiline
          onChangeText={setNote}
          placeholder="更新进度（可选）"
          style={styles.input}
          value={note}
        />
        {runtime.snapshot.errorText !== null ? (
          <Text accessibilityLiveRegion="assertive" style={styles.error}>
            {runtime.snapshot.errorText}
          </Text>
        ) : null}
        <ActionButton
          label="确认结算"
          displayLabel={outcome === 'complete' ? '完成任务' : '保存进度'}
          disabled={outcome === null || pending}
          onPress={() => {
            if (outcome !== null) {
              void runtime.settle(outcome, note).catch(() => undefined);
            }
          }}
        />
        <ActionButton
          label="继续15分钟"
          secondary
          disabled={pending}
          onPress={() => {
            void runtime
              .settle('progress', note.trim() === '' ? '继续 15 分钟' : note)
              .then(async receipt => {
                await runtime.returnToWorkspace(
                  workspace.refreshProjection,
                  workspace.closeTask,
                );
                props.onReturned?.();
                await focus.start(receipt.taskId, 15);
              })
              .catch(() => undefined);
          }}
        />
        <ActionButton
          label="稍后继续"
          textOnly
          disabled={pending}
          onPress={() => {
            void runtime.dismissReview().catch(() => undefined);
          }}
        />
        {review.legacyCompletionShortcut ? (
          <ActionButton
            label="完成任务"
            disabled={pending}
            onPress={() => {
              void runtime.settle('complete', note).catch(() => undefined);
            }}
          />
        ) : null}
      </AppBottomSheetScrollView>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 24,
    gap: 16,
  },
  kicker: {
    color: '#5e716c',
    fontSize: 13,
    fontWeight: '700',
  },
  panel: {
    padding: 18,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    gap: 10,
  },
  fact: {
    color: '#33433a',
    fontSize: 16,
  },
  points: {
    color: '#176b4d',
    fontSize: 24,
    fontWeight: '800',
  },
  sectionTitle: {
    color: '#1f2a24',
    fontSize: 18,
    fontWeight: '700',
  },
  radioGroup: {
    flexDirection: 'row',
    gap: 12,
  },
  radio: {
    flex: 1,
    padding: 14,
    borderWidth: 1,
    borderColor: '#9ca89f',
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  radioSelected: {
    borderColor: '#176b4d',
    backgroundColor: '#e7f3ed',
  },
  radioText: {
    color: '#1f2a24',
    textAlign: 'center',
    fontWeight: '700',
  },
  input: {
    minHeight: 88,
    padding: 14,
    borderWidth: 1,
    borderColor: '#b6c0b9',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    color: '#1f2a24',
    textAlignVertical: 'top',
  },
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: '#176b4d',
  },
  disabledButton: {
    opacity: 0.5,
  },
  secondaryButton: {
    backgroundColor: '#e7f3ed',
  },
  textButton: {
    backgroundColor: 'transparent',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButtonText: {
    color: '#176b4d',
  },
  error: {
    color: '#a72d24',
    fontWeight: '700',
  },
});
