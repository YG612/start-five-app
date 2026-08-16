import React from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import type {
  BackupPreview,
  LocalBackupService,
} from '../application/localBackupService';

export type BackupFileBridge = Readonly<{
  save(input: Readonly<{
    suggestedName: string;
    mimeType: 'application/json';
    bytes: string;
  }>): Promise<'saved' | 'cancelled'>;
  pick(): Promise<Readonly<{name: string; bytes: string}> | null>;
}>;

type Preview = Readonly<{
  name: string;
  bytes: Uint8Array;
  details: BackupPreview;
}>;

function Action(props: Readonly<{
  label: string;
  onPress(): void;
  disabled?: boolean;
}>): React.JSX.Element {
  return (
    <Pressable
      accessibilityLabel={props.label}
      accessibilityRole="button"
      accessibilityState={{disabled: props.disabled === true}}
      disabled={props.disabled}
      onPress={props.onPress}
      style={[styles.button, props.disabled === true && styles.disabled]}>
      <Text style={styles.buttonText}>{props.label}</Text>
    </Pressable>
  );
}

function utf8Encode(value: string): Uint8Array {
  const encoded = encodeURIComponent(value);
  const bytes: number[] = [];
  for (let index = 0; index < encoded.length; index += 1) {
    const character = encoded[index];
    if (character === '%') {
      bytes.push(Number.parseInt(encoded.slice(index + 1, index + 3), 16));
      index += 2;
    } else if (character !== undefined) {
      bytes.push(character.charCodeAt(0));
    }
  }
  return Uint8Array.from(bytes);
}

function utf8Decode(bytes: Uint8Array): string {
  let encoded = '';
  for (const byte of bytes) {
    encoded += `%${byte.toString(16).padStart(2, '0')}`;
  }
  return decodeURIComponent(encoded);
}

export function LocalBackupScreen(props: Readonly<{
  bridge: BackupFileBridge;
  localBackup: LocalBackupService;
  now(): string;
  onBack(): void;
  onRestored(): Promise<void>;
  onBackupSaved?(savedAt: string): void;
}>): React.JSX.Element {
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [confirmingReplace, setConfirmingReplace] = React.useState(false);

  function exportFile(): void {
    if (pending) return;
    setPending(true);
    setMessage(null);
    void props.localBackup.exportBackup()
      .then(artifact => props.bridge.save({
        suggestedName: `start-five-backup-${props.now().slice(0, 10)}.json`,
        mimeType: 'application/json',
        bytes: utf8Decode(artifact.bytes),
      }))
      .then(result => {
        if (result === 'saved') {
          setMessage('备份已保存');
          props.onBackupSaved?.(props.now());
        }
      })
      .catch(() => setMessage('导出失败'))
      .finally(() => setPending(false));
  }

  function importFile(): void {
    if (pending) return;
    setPending(true);
    setMessage(null);
    void props.bridge.pick()
      .then(async file => {
        if (file === null) return;
        const bytes = utf8Encode(file.bytes);
        const inspected = await props.localBackup.inspectBackup(bytes);
        setPreview({name: file.name, bytes, details: inspected.preview});
        setConfirmingReplace(false);
      })
      .catch(() => {
        setPreview(null);
        setMessage('无法读取备份文件，请选择有效的备份');
      })
      .finally(() => setPending(false));
  }

  function restore(): void {
    if (pending || preview === null) return;
    setPending(true);
    setMessage(null);
    void props.localBackup.replaceBackup(preview.bytes)
      .then(result => {
        setMessage(
          `已恢复 ${result.preview.taskCount} 项任务；提醒已重新协调，本机安全快照已保留。`,
        );
        return props.onRestored();
      })
      .catch(reason => {
        setMessage(
          reason instanceof Error && reason.message.trim() !== ''
            ? '恢复失败，原数据已回滚，请检查备份后重试。'
            : '恢复失败，原数据已回滚，请重试。',
        );
      })
      .finally(() => setPending(false));
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>数据与备份</Text>
        <Text style={styles.subtitle}>将本机数据保存为文件，或先检查文件再恢复。</Text>
        <Action disabled={pending} label="导出备份" onPress={exportFile} />
        <Action disabled={pending} label="导入备份" onPress={importFile} />
        {message === null ? null : <Text style={styles.message}>{message}</Text>}
        {preview === null ? null : (
          <View style={styles.panel}>
            <Text>备份文件：{preview.name}</Text>
            <Text>备份日期：{preview.details.backupDate ?? '旧备份未记录'}</Text>
            <Text>应用版本：{preview.details.applicationVersion} · Schema {preview.details.schemaVersion}</Text>
            <Text>任务：{preview.details.taskCount} 项 · 未完成 {preview.details.pendingTaskCount} · 已完成 {preview.details.completedTaskCount} · 待判断 {preview.details.unsortedTaskCount}</Text>
            <Text>专注记录：{preview.details.focusRecordCount}</Text>
            <Text>成长记录：{preview.details.growthRecordCount}</Text>
            <Text>提醒记录：{preview.details.notificationCount}</Text>
            <Text>警告或损坏记录：{preview.details.warningCount}</Text>
            {confirmingReplace ? (
              <>
                <Text style={styles.warning}>当前本机任务、专注与偏好将被替换；替换前会自动保留一份安全快照，失败时自动回滚。</Text>
                <Action disabled={pending} label="确认替换当前数据" onPress={restore} />
              </>
            ) : (
              <Action disabled={pending} label="用备份替换当前数据" onPress={() => setConfirmingReplace(true)} />
            )}
            <Action
              disabled={pending}
              label="取消恢复"
              onPress={() => {
                 setPreview(null);
                setConfirmingReplace(false);
                setMessage(null);
              }}
            />
          </View>
        )}
        <Action disabled={pending} label="回到象限" onPress={props.onBack} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#F3F7F6'},
  content: {padding: 24, gap: 14},
  title: {color: '#173F3A', fontSize: 28, fontWeight: '800'},
  subtitle: {color: '#526A66', fontSize: 16},
  panel: {gap: 10, padding: 16, borderRadius: 14, backgroundColor: '#FFFFFF'},
  button: {minHeight: 50, borderRadius: 12, backgroundColor: '#247A6B', alignItems: 'center', justifyContent: 'center'},
  buttonText: {color: '#FFFFFF', fontSize: 16, fontWeight: '800'},
  disabled: {opacity: 0.5},
  message: {color: '#173F3A', fontSize: 15, fontWeight: '700'},
  warning: {color: '#9A4C18', fontSize: 14, lineHeight: 20, fontWeight: '700'},
});
