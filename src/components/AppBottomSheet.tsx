import React from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export type SheetDismissReason =
  | 'drag'
  | 'backdrop'
  | 'close-button'
  | 'android-back'
  | 'saved'
  | 'completed';

export function shouldDismissBottomSheet(input: Readonly<{
  translationY: number;
  velocityY: number;
  visibleHeight: number;
}>): boolean {
  return input.translationY >= Math.max(72, input.visibleHeight * 0.18) ||
    input.velocityY >= 0.9;
}

type Props = Readonly<{
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  dark?: boolean;
  reduceMotion?: boolean;
  onDismissAttempt(reason: SheetDismissReason): Promise<boolean> | boolean;
}>;

export function AppBottomSheet(props: Props): React.JSX.Element {
  const [translationY, setTranslationY] = React.useState(0);
  const [visibleHeight, setVisibleHeight] = React.useState(1);
  const dismissInFlight = React.useRef<Promise<boolean> | null>(null);
  const headingRef = React.useRef<Text>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      const handle = findNodeHandle(headingRef.current);
      if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const requestDismiss = React.useCallback((reason: SheetDismissReason) => {
    if (dismissInFlight.current !== null) return dismissInFlight.current;
    const pending = Promise.resolve().then(() => props.onDismissAttempt(reason));
    dismissInFlight.current = pending;
    void pending.finally(() => {
      if (dismissInFlight.current === pending) dismissInFlight.current = null;
      setTranslationY(0);
    });
    return pending;
  }, [props.onDismissAttempt]);

  const panResponder = React.useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_event, gesture) => gesture.dy > 3,
    onPanResponderMove: (_event, gesture) => {
      setTranslationY(Math.max(0, gesture.dy));
    },
    onPanResponderRelease: (_event, gesture) => {
      if (shouldDismissBottomSheet({
        translationY: Math.max(0, gesture.dy),
        velocityY: Math.max(0, gesture.vy),
        visibleHeight,
      })) {
        void requestDismiss('drag');
      } else {
        setTranslationY(0);
      }
    },
    onPanResponderTerminate: () => setTranslationY(0),
  }), [requestDismiss, visibleHeight]);

  return (
    <Modal
      animationType={props.reduceMotion ? 'fade' : 'slide'}
      onRequestClose={() => void requestDismiss('android-back')}
      statusBarTranslucent
      transparent
      visible>
      <View accessibilityViewIsModal style={styles.modalRoot}>
        <Pressable
          accessibilityLabel="关闭"
          onPress={() => void requestDismiss('backdrop')}
          style={styles.scrim}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          pointerEvents="box-none"
          style={styles.keyboardLayer}>
          <View
            onLayout={event => setVisibleHeight(event.nativeEvent.layout.height)}
            style={[
              styles.sheet,
              props.dark && styles.sheetDark,
              {transform: [{translateY: translationY}]},
            ]}>
            <View
              accessibilityHint="向下拖动可以关闭"
              accessibilityLabel="拖动关闭"
              {...panResponder.panHandlers}
              style={styles.handleTouch}>
              <View style={[styles.handle, props.dark && styles.handleDark]} />
            </View>
            <View style={styles.headingRow}>
              <View style={styles.headingCopy}>
                <Text ref={headingRef} accessibilityRole="header" style={[styles.title, props.dark && styles.textDark]}>
                  {props.title}
                </Text>
                {props.subtitle === undefined ? null : (
                  <Text style={[styles.subtitle, props.dark && styles.textMutedDark]}>{props.subtitle}</Text>
                )}
              </View>
              <Pressable
                accessibilityLabel="关闭"
                accessibilityRole="button"
                onPress={() => void requestDismiss('close-button')}
                style={styles.closeButton}>
                <Text style={[styles.closeText, props.dark && styles.textDark]}>×</Text>
              </Pressable>
            </View>
            <View style={styles.body}>{props.children}</View>
            {props.footer === undefined ? null : (
              <View style={[styles.footer, props.dark && styles.footerDark]}>{props.footer}</View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {flex: 1, justifyContent: 'flex-end'},
  scrim: {
    backgroundColor: 'rgba(15, 31, 28, 0.48)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  keyboardLayer: {flex: 1, justifyContent: 'flex-end'},
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    maxHeight: '92%',
    paddingBottom: 12,
  },
  sheetDark: {backgroundColor: '#18312C'},
  handleTouch: {alignItems: 'center', height: 28, justifyContent: 'center'},
  handle: {backgroundColor: '#B8C7C3', borderRadius: 99, height: 4, width: 44},
  handleDark: {backgroundColor: '#6D8982'},
  headingRow: {alignItems: 'center', flexDirection: 'row', gap: 12, paddingHorizontal: 18},
  headingCopy: {flex: 1},
  title: {color: '#173F3A', fontSize: 22, fontWeight: '600'},
  subtitle: {color: '#657672', fontSize: 13, lineHeight: 19, marginTop: 2},
  textDark: {color: '#F2FAF7'},
  textMutedDark: {color: '#B7CAC5'},
  closeButton: {alignItems: 'center', height: 44, justifyContent: 'center', width: 44},
  closeText: {color: '#536964', fontSize: 28, lineHeight: 30},
  body: {minHeight: 0, paddingHorizontal: 18},
  footer: {borderTopColor: '#DCE5E1', borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 18, paddingTop: 10},
  footerDark: {borderTopColor: '#48645E'},
});
