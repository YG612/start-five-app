import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {ReceiptHistorySnapshot} from '../application/postFocusReviewService';
import type {FocusReviewReceipt} from '../domain/postFocusReview';
import type {Quadrant} from '../domain/quadrant';

export type FocusHistoryQuery = Readonly<{
  listReceiptHistory(): Promise<ReceiptHistorySnapshot>;
}>;

type FocusHistoryScreenProps = Readonly<{
  day: string;
  history: FocusHistoryQuery;
  onBack(): void;
  onEndToday?(): void;
}>;

const QUADRANT_LABELS: Readonly<Record<Quadrant, string>> = {
  Q1: '救火区',
  Q2: '成长区',
  Q3: '干扰区',
  Q4: '清理区',
};

function outcomeLabel(receipt: FocusReviewReceipt): string {
  return receipt.outcome === 'progress' ? '有进展' : '完成任务';
}

function HistoryButton({
  label,
  onPress,
}: Readonly<{
  label: string;
  onPress(): void | Promise<void>;
}>): React.JSX.Element {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.button}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export function FocusHistoryScreen({
  day,
  history,
  onBack,
  onEndToday,
}: FocusHistoryScreenProps): React.JSX.Element {
  const [receipts, setReceipts] = useState<readonly FocusReviewReceipt[]>([]);
  const [selected, setSelected] = useState<FocusReviewReceipt | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const requestGenerationRef = useRef(0);

  const reload = useCallback(async (): Promise<void> => {
    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    if (mountedRef.current) {
      setError(null);
    }
    try {
      const snapshot = await history.listReceiptHistory();
      if (
        !mountedRef.current ||
        requestGenerationRef.current !== generation
      ) {
        return;
      }
      setReceipts(snapshot.receipts.filter(receipt => receipt.statsDay === day));
      setLoaded(true);
    } catch (reason: unknown) {
      if (
        !mountedRef.current ||
        requestGenerationRef.current !== generation
      ) {
        return;
      }
      setError(
        reason instanceof Error && reason.message.trim() !== ''
          ? reason.message
          : 'HISTORY_QUERY_FAILED',
      );
      setLoaded(true);
      throw reason;
    }
  }, [day, history]);

  useEffect(() => {
    mountedRef.current = true;
    void reload().catch(() => undefined);
    return () => {
      mountedRef.current = false;
      requestGenerationRef.current += 1;
    };
  }, [reload]);

  function returnToWorkspace(): void {
    requestGenerationRef.current += 1;
    onBack();
  }

  if (selected !== null) {
    return (
      <View style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text accessibilityRole="header" style={styles.title}>
            记录详情
          </Text>
          <View style={styles.panel}>
            <Text style={styles.detail}>任务：{selected.taskTitle}</Text>
            <Text style={styles.detail}>
              象限：{QUADRANT_LABELS[selected.quadrant]}
            </Text>
            <Text style={styles.detail}>
              专注时长：{selected.actualSeconds}秒
            </Text>
            <Text style={styles.detail}>结果：{outcomeLabel(selected)}</Text>
            <Text style={styles.detail}>备注：{selected.note}</Text>
              <Text style={styles.detail}>成长值：{selected.awardedPoints}</Text>
          </View>
          <HistoryButton label="返回历史列表" onPress={() => setSelected(null)} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          专注历史
        </Text>
        <Text style={styles.subtitle}>日期：{day}（UTC）</Text>
        <Text style={styles.subtitle}>筛选：全部</Text>

        {loaded && receipts.length === 0 && error === null ? (
          <Text style={styles.empty}>今天还没有已确认的专注记录</Text>
        ) : null}

        {receipts.map(receipt => (
          <Pressable
            accessibilityLabel={`专注记录：${receipt.taskTitle}`}
            accessibilityRole="button"
            key={receipt.receiptId}
            onPress={() => setSelected(receipt)}
            style={styles.panel}>
            <Text style={styles.rowText}>
              {receipt.taskTitle} · {QUADRANT_LABELS[receipt.quadrant]} ·{' '}
              {receipt.actualSeconds}秒 · {outcomeLabel(receipt)} ·{' '}
              {receipt.awardedPoints}分
            </Text>
          </Pressable>
        ))}

        {error !== null ? (
          <Text accessibilityLiveRegion="assertive" style={styles.error}>
            {error}
          </Text>
        ) : null}
        <HistoryButton
          label="重新读取"
          onPress={() => {
            void reload().catch(() => undefined);
          }}
        />
        {onEndToday !== undefined ? (
        <HistoryButton label="今日回顾" onPress={onEndToday} />
        ) : null}
        <HistoryButton label="回到象限" onPress={returnToWorkspace} />
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
    gap: 8,
  },
  rowText: {color: '#173F3A', fontSize: 16, fontWeight: '700'},
  detail: {color: '#173F3A', fontSize: 16},
  empty: {color: '#526A66', textAlign: 'center', paddingVertical: 24},
  error: {color: '#9C2F24', fontSize: 14},
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#247A6B',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  buttonText: {color: '#FFFFFF', fontSize: 16, fontWeight: '800'},
});
