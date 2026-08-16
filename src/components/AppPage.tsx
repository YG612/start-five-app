import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

export const APP_PAGE_TOKENS = {
  spacing: {xs: 4, sm: 8, md: 12, lg: 16, xl: 24},
  radius: {sm: 10, md: 14, lg: 20},
  light: {
    background: '#F5F7F6',
    surface: '#FFFFFF',
    surfaceSubtle: '#EAF3F0',
    text: '#173F3A',
    textMuted: '#5E716C',
    border: '#D3DFDC',
    primary: '#1F7466',
    primaryText: '#FFFFFF',
    warning: '#8A4B08',
  },
  dark: {
    background: '#0F1F1C',
    surface: '#18312C',
    surfaceSubtle: '#24423C',
    text: '#F2FAF7',
    textMuted: '#B7CAC5',
    border: '#48645E',
    primary: '#58B7A4',
    primaryText: '#071B17',
    warning: '#F2BE74',
  },
} as const;

type ToneProps = Readonly<{dark?: boolean}>;

export function PageScaffold(props: React.PropsWithChildren<ToneProps>): React.JSX.Element {
  return <View style={[styles.page, props.dark && styles.pageDark]}>{props.children}</View>;
}

export function PageHeader(props: ToneProps & Readonly<{
  title: string;
  eyebrow?: string;
  trailing?: React.ReactNode;
}>): React.JSX.Element {
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        {props.eyebrow === undefined ? null : (
          <Text style={[styles.eyebrow, props.dark && styles.mutedDark]}>{props.eyebrow}</Text>
        )}
        <Text accessibilityRole="header" style={[styles.title, props.dark && styles.textDark]}>
          {props.title}
        </Text>
      </View>
      {props.trailing}
    </View>
  );
}

export function HeroPanel(props: React.PropsWithChildren<ToneProps & Readonly<{
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}>>): React.JSX.Element {
  return (
    <View
      {...(props.accessibilityLabel === undefined ? {} : {accessibilityLabel: props.accessibilityLabel})}
      style={[styles.hero, props.dark && styles.surfaceDark, props.style]}>
      {props.children}
    </View>
  );
}

export function SectionHeader(props: ToneProps & Readonly<{
  title: string;
  action?: React.ReactNode;
}>): React.JSX.Element {
  return (
    <View style={styles.sectionHeader}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, props.dark && styles.textDark]}>
        {props.title}
      </Text>
      {props.action}
    </View>
  );
}

export function SettingsRow(props: ToneProps & Readonly<{
  label: string;
  value?: string;
  onPress?: (() => void) | undefined;
  role?: 'button' | 'switch';
  checked?: boolean;
}>): React.JSX.Element {
  const content = (
    <>
      <Text style={[styles.rowLabel, props.dark && styles.textDark]}>{props.label}</Text>
      <Text style={[styles.rowValue, props.dark && styles.mutedDark]}>
        {props.value ?? (props.onPress === undefined ? '' : '›')}
      </Text>
    </>
  );
  if (props.onPress === undefined) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      accessibilityLabel={props.label}
      accessibilityRole={props.role ?? 'button'}
      {...(props.role === 'switch' ? {accessibilityState: {checked: props.checked === true}} : {})}
      onPress={props.onPress}
      style={styles.row}>
      {content}
    </Pressable>
  );
}

export function MetricItem(props: ToneProps & Readonly<{
  label: string;
  value: string;
}>): React.JSX.Element {
  return (
    <View accessibilityLabel={`${props.label}：${props.value}`} style={styles.metric}>
      <Text style={[styles.metricValue, props.dark && styles.textDark]}>{props.value}</Text>
      <Text style={[styles.metricLabel, props.dark && styles.mutedDark]}>{props.label}</Text>
    </View>
  );
}

export function InlineNotice(props: React.PropsWithChildren<ToneProps & Readonly<{
  accessibilityLabel?: string;
}>>): React.JSX.Element {
  return (
    <View
      {...(props.accessibilityLabel === undefined ? {} : {accessibilityLabel: props.accessibilityLabel})}
      style={[styles.notice, props.dark && styles.noticeDark]}>
      {props.children}
    </View>
  );
}

export function EmptyState(props: ToneProps & Readonly<{
  title: string;
  description: string;
  action?: React.ReactNode;
}>): React.JSX.Element {
  return (
    <View accessibilityLabel="空状态" style={[styles.empty, props.dark && styles.surfaceDark]}>
      <Text style={[styles.emptyTitle, props.dark && styles.textDark]}>{props.title}</Text>
      <Text style={[styles.body, props.dark && styles.mutedDark]}>{props.description}</Text>
      {props.action}
    </View>
  );
}

export function ErrorState(props: ToneProps & Readonly<{
  message: string;
  action?: React.ReactNode;
}>): React.JSX.Element {
  return (
    <View accessibilityLiveRegion="assertive" style={[styles.empty, props.dark && styles.surfaceDark]}>
      <Text style={styles.error}>{props.message}</Text>
      {props.action}
    </View>
  );
}

type ButtonProps = Readonly<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
  dark?: boolean;
}>;

function Button(props: ButtonProps & Readonly<{kind: 'primary' | 'secondary' | 'text'}>): React.JSX.Element {
  return (
    <Pressable
      accessibilityLabel={props.label}
      accessibilityRole="button"
      accessibilityState={{disabled: props.disabled === true}}
      disabled={props.disabled}
      onPress={props.onPress}
      style={[
        styles.button,
        props.kind === 'primary' && styles.primary,
        props.kind === 'secondary' && styles.secondary,
        props.kind === 'text' && styles.textButton,
        props.dark && props.kind === 'secondary' && styles.secondaryDark,
        props.disabled && styles.disabled,
      ]}>
      <Text style={[
        styles.buttonText,
        props.kind !== 'primary' && styles.secondaryText,
        props.dark && props.kind !== 'primary' && styles.textDark,
      ]}>{props.label}</Text>
    </Pressable>
  );
}

export function PrimaryButton(props: ButtonProps): React.JSX.Element {
  return <Button {...props} kind="primary" />;
}

export function SecondaryButton(props: ButtonProps): React.JSX.Element {
  return <Button {...props} kind="secondary" />;
}

export function TextButton(props: ButtonProps): React.JSX.Element {
  return <Button {...props} kind="text" />;
}

export function BottomActionBar(props: React.PropsWithChildren<ToneProps>): React.JSX.Element {
  return <View style={[styles.actionBar, props.dark && styles.surfaceDark]}>{props.children}</View>;
}

export function SegmentedControl<T extends string>(props: ToneProps & Readonly<{
  value: T;
  items: readonly Readonly<{value: T; label: string}>[];
  onChange(value: T): void;
}>): React.JSX.Element {
  return (
    <View accessibilityRole="tablist" style={[styles.segmented, props.dark && styles.segmentedDark]}>
      {props.items.map(item => (
        <Pressable
          accessibilityLabel={item.label}
          accessibilityRole="tab"
          accessibilityState={{selected: item.value === props.value}}
          key={item.value}
          onPress={() => props.onChange(item.value)}
          style={[styles.segment, item.value === props.value && styles.segmentSelected, item.value === props.value && props.dark && styles.segmentSelectedDark]}>
          <Text style={[styles.segmentText, props.dark && styles.mutedDark, item.value === props.value && styles.segmentTextSelected, item.value === props.value && props.dark && styles.textDark]}>
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {gap: 16, backgroundColor: APP_PAGE_TOKENS.light.background},
  pageDark: {backgroundColor: APP_PAGE_TOKENS.dark.background},
  header: {minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12},
  headerCopy: {flex: 1, gap: 3},
  eyebrow: {color: APP_PAGE_TOKENS.light.textMuted, fontSize: 13, fontWeight: '700'},
  title: {color: APP_PAGE_TOKENS.light.text, fontSize: 27, fontWeight: '900'},
  textDark: {color: APP_PAGE_TOKENS.dark.text},
  mutedDark: {color: APP_PAGE_TOKENS.dark.textMuted},
  hero: {backgroundColor: APP_PAGE_TOKENS.light.surface, borderColor: APP_PAGE_TOKENS.light.border, borderWidth: 1, borderRadius: APP_PAGE_TOKENS.radius.lg, padding: APP_PAGE_TOKENS.spacing.lg, gap: APP_PAGE_TOKENS.spacing.sm},
  surfaceDark: {backgroundColor: APP_PAGE_TOKENS.dark.surface, borderColor: APP_PAGE_TOKENS.dark.border},
  sectionHeader: {minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  sectionTitle: {color: APP_PAGE_TOKENS.light.text, fontSize: 18, fontWeight: '900'},
  row: {minHeight: 52, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, borderTopColor: APP_PAGE_TOKENS.light.border, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 12},
  rowLabel: {flex: 1, color: APP_PAGE_TOKENS.light.text, fontSize: 15, fontWeight: '700'},
  rowValue: {flexShrink: 1, maxWidth: '48%', color: APP_PAGE_TOKENS.light.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'right'},
  metric: {flex: 1, minWidth: 88, gap: 3},
  metricValue: {color: APP_PAGE_TOKENS.light.text, fontSize: 22, fontWeight: '900'},
  metricLabel: {color: APP_PAGE_TOKENS.light.textMuted, fontSize: 12},
  notice: {borderRadius: APP_PAGE_TOKENS.radius.md, backgroundColor: '#FFF5E7', padding: 12, gap: 6},
  noticeDark: {backgroundColor: '#3A3020'},
  empty: {backgroundColor: APP_PAGE_TOKENS.light.surface, borderRadius: APP_PAGE_TOKENS.radius.lg, padding: 18, gap: 10},
  emptyTitle: {color: APP_PAGE_TOKENS.light.text, fontSize: 18, fontWeight: '900'},
  body: {color: APP_PAGE_TOKENS.light.textMuted, fontSize: 14, lineHeight: 21},
  error: {color: '#A33A2C', fontSize: 14, lineHeight: 20},
  button: {minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 9},
  primary: {backgroundColor: APP_PAGE_TOKENS.light.primary},
  secondary: {backgroundColor: APP_PAGE_TOKENS.light.surfaceSubtle},
  secondaryDark: {backgroundColor: APP_PAGE_TOKENS.dark.surfaceSubtle},
  textButton: {backgroundColor: 'transparent', minHeight: 42},
  buttonText: {color: APP_PAGE_TOKENS.light.primaryText, fontSize: 14, fontWeight: '900'},
  secondaryText: {color: APP_PAGE_TOKENS.light.text},
  disabled: {opacity: 0.45},
  actionBar: {backgroundColor: APP_PAGE_TOKENS.light.surface, borderTopColor: APP_PAGE_TOKENS.light.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 8, paddingTop: 10},
  segmented: {flexDirection: 'row', borderRadius: 13, backgroundColor: '#E7ECEA', padding: 4},
  segmentedDark: {backgroundColor: APP_PAGE_TOKENS.dark.surface},
  segment: {flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingHorizontal: 10},
  segmentSelected: {backgroundColor: APP_PAGE_TOKENS.light.surface},
  segmentSelectedDark: {backgroundColor: APP_PAGE_TOKENS.dark.surfaceSubtle},
  segmentText: {color: APP_PAGE_TOKENS.light.textMuted, fontSize: 14, fontWeight: '700'},
  segmentTextSelected: {color: APP_PAGE_TOKENS.light.primary, fontWeight: '900'},
});
