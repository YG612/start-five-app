import React from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {USER_COPY} from '../presentation/userCopy';

function Action(props: Readonly<{label: string; disabled?: boolean; onPress(): void}>): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      disabled={props.disabled}
      onPress={props.onPress}
      style={styles.button}>
      <Text style={styles.buttonText}>{props.label}</Text>
    </Pressable>
  );
}

export function FirstActivationScreen(props: Readonly<{
  pending: boolean;
  errorText: string | null;
  onActivate(title: string): void;
  onSkip(): void;
}>): React.JSX.Element {
  const [title, setTitle] = React.useState('');
  return (
    <View style={styles.screen}>
      <Text accessibilityRole="header" style={styles.title}>开始我的第一项</Text>
      <Text style={styles.subtitle}>先写下眼前最值得推进的一件事。</Text>
      <TextInput
        accessibilityLabel="第一项任务标题"
        onChangeText={setTitle}
        style={styles.input}
        value={title}
      />
      <Action
        disabled={props.pending || title.trim() === ''}
        label="开始5分钟"
        onPress={() => props.onActivate(title)}
      />
      <Action disabled={props.pending} label="暂时跳过" onPress={props.onSkip} />
      {props.errorText === null ? null : <Text style={styles.error}>{props.errorText}</Text>}
    </View>
  );
}

export function FirstActivationReadError(props: Readonly<{
  onRetry(): void;
}>): React.JSX.Element {
  return (
    <View style={styles.screen}>
      <Text accessibilityRole="alert" style={styles.error}>
        {USER_COPY.activationUnavailable}
      </Text>
      <Action label={USER_COPY.enterAgain} onPress={props.onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#F3F7F6', padding: 24, gap: 16, justifyContent: 'center'},
  title: {color: '#173F3A', fontSize: 30, fontWeight: '800'},
  subtitle: {color: '#526A66', fontSize: 16},
  input: {minHeight: 52, borderWidth: 1, borderColor: '#91A9A5', borderRadius: 12, paddingHorizontal: 14},
  button: {minHeight: 50, borderRadius: 12, backgroundColor: '#247A6B', alignItems: 'center', justifyContent: 'center'},
  buttonText: {color: '#FFFFFF', fontSize: 16, fontWeight: '800'},
  error: {color: '#9C2F24', fontSize: 15},
});
