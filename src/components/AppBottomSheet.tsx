import React from 'react';
import {
  AccessibilityInfo,
  Alert,
  Animated,
  findNodeHandle,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
  type SectionListData,
  type SectionListProps,
} from 'react-native';

export type SheetCloseReason =
  | 'swipe'
  | 'backdrop'
  | 'back'
  | 'closeButton'
  | 'navigation'
  | 'programmatic'
  | 'saved'
  | 'completed';

// Existing business components use this name. Keeping it as an alias prevents
// a second, competing close vocabulary from growing outside this component.
export type SheetDismissReason = SheetCloseReason;

export type SheetDismissPolicy =
  | 'free'
  | 'flushBeforeClose'
  | 'confirmDirty'
  | 'cancelOnly';

export type BottomSheetGestureDecision = 'ignore' | 'drag-sheet';

export function bottomSheetGestureDecision(input: Readonly<{
  dx: number;
  dy: number;
  scrollOffsetY: number;
}>): BottomSheetGestureDecision {
  if (input.dy <= 4 || input.dy <= Math.abs(input.dx)) return 'ignore';
  return input.scrollOffsetY <= 0.5 ? 'drag-sheet' : 'ignore';
}

export function shouldDismissBottomSheet(input: Readonly<{
  translationY: number;
  velocityY: number;
  visibleHeight: number;
}>): boolean {
  return input.translationY >= Math.max(72, input.visibleHeight * 0.18) ||
    input.velocityY >= 0.9;
}

type ScrollCoordinator = Readonly<{
  record(event: NativeSyntheticEvent<NativeScrollEvent>): void;
}>;

const BottomSheetScrollContext = React.createContext<ScrollCoordinator | null>(
  null,
);

function useCoordinatedScroll(
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void,
): (event: NativeSyntheticEvent<NativeScrollEvent>) => void {
  const coordinator = React.useContext(BottomSheetScrollContext);
  return React.useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    coordinator?.record(event);
    onScroll?.(event);
  }, [coordinator, onScroll]);
}

export const AppBottomSheetScrollView = React.forwardRef<
  ScrollView,
  ScrollViewProps
>(function AppBottomSheetScrollView(props, ref): React.JSX.Element {
  const onScroll = useCoordinatedScroll(props.onScroll);
  return (
    <ScrollView
      {...props}
      onScroll={onScroll}
      ref={ref}
      scrollEventThrottle={props.scrollEventThrottle ?? 16}
    />
  );
});

export function AppBottomSheetSectionList<
  ItemT,
  SectionT extends SectionListData<ItemT> = SectionListData<ItemT>,
>(props: SectionListProps<ItemT, SectionT>): React.JSX.Element {
  const onScroll = useCoordinatedScroll(props.onScroll);
  return (
    <SectionList
      {...props}
      onScroll={onScroll}
      scrollEventThrottle={props.scrollEventThrottle ?? 16}
    />
  );
}

type Props = Readonly<{
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  dark?: boolean;
  reduceMotion?: boolean;
  dirty?: boolean;
  dirtyMessage?: string;
  dismissPolicy?: SheetDismissPolicy;
  onDismissAttempt(reason: SheetDismissReason): Promise<boolean> | boolean;
  returnFocusRef?: React.RefObject<React.ElementRef<typeof View> | null>;
}>;

export function AppBottomSheet(props: Props): React.JSX.Element {
  const translateY = React.useRef(new Animated.Value(0)).current;
  const scrollOffsetRef = React.useRef(0);
  const visibleHeightRef = React.useRef(1);
  const dismissInFlight = React.useRef<Promise<boolean> | null>(null);
  const dirtyConfirmationVisible = React.useRef(false);
  const mountedRef = React.useRef(true);
  const headingRef = React.useRef<Text>(null);
  const dismissPolicy = props.dismissPolicy ?? 'free';

  const restoreTriggerFocus = React.useCallback(() => {
    const handle = findNodeHandle(props.returnFocusRef?.current ?? null);
    if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle);
  }, [props.returnFocusRef]);

  React.useEffect(() => {
    mountedRef.current = true;
    const timer = setTimeout(() => {
      const handle = findNodeHandle(headingRef.current);
      if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle);
    }, 0);
    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
      translateY.stopAnimation();
    };
  }, [translateY]);

  const resetPosition = React.useCallback(() => {
    if (props.reduceMotion) {
      translateY.setValue(0);
      return;
    }
    Animated.spring(translateY, {
      toValue: 0,
      damping: 24,
      stiffness: 260,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [props.reduceMotion, translateY]);

  const invokeDismiss = React.useCallback((reason: SheetDismissReason) => {
    if (dismissInFlight.current !== null) return dismissInFlight.current;
    Keyboard.dismiss();
    let pending: Promise<boolean>;
    pending = Promise.resolve()
      .then(() => props.onDismissAttempt(reason))
      .then(dismissed => {
        if (dismissed) restoreTriggerFocus();
        return dismissed;
      })
      .finally(() => {
        if (dismissInFlight.current === pending) dismissInFlight.current = null;
        if (mountedRef.current) resetPosition();
      });
    dismissInFlight.current = pending;
    return pending;
  }, [props.onDismissAttempt, resetPosition, restoreTriggerFocus]);

  const requestDismiss = React.useCallback((reason: SheetDismissReason) => {
    const indirect = reason === 'swipe' || reason === 'backdrop' || reason === 'back';
    if (dismissPolicy === 'cancelOnly' && indirect) {
      resetPosition();
      return Promise.resolve(false);
    }
    if (
      dismissPolicy === 'confirmDirty' &&
      props.dirty === true &&
      reason !== 'saved' &&
      reason !== 'completed' &&
      reason !== 'programmatic'
    ) {
      resetPosition();
      if (!dirtyConfirmationVisible.current) {
        dirtyConfirmationVisible.current = true;
        Alert.alert(
          '放弃未保存的修改？',
          props.dirtyMessage ?? '当前修改还没有保存。你可以继续编辑，或明确放弃修改。',
          [
            {
              text: '继续编辑',
              style: 'cancel',
              onPress: () => {
                dirtyConfirmationVisible.current = false;
              },
            },
            {
              text: '放弃修改',
              style: 'destructive',
              onPress: () => {
                dirtyConfirmationVisible.current = false;
                void invokeDismiss(reason);
              },
            },
          ],
          {
            cancelable: true,
            onDismiss: () => {
              dirtyConfirmationVisible.current = false;
            },
          },
        );
      }
      return Promise.resolve(false);
    }
    return invokeDismiss(reason);
  }, [dismissPolicy, invokeDismiss, props.dirty, props.dirtyMessage, resetPosition]);

  const panResponder = React.useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_event, gesture) =>
      bottomSheetGestureDecision({
        dx: gesture.dx,
        dy: gesture.dy,
        scrollOffsetY: scrollOffsetRef.current,
      }) === 'drag-sheet',
    onMoveShouldSetPanResponderCapture: (_event, gesture) =>
      bottomSheetGestureDecision({
        dx: gesture.dx,
        dy: gesture.dy,
        scrollOffsetY: scrollOffsetRef.current,
      }) === 'drag-sheet',
    onPanResponderMove: (_event, gesture) => {
      translateY.setValue(Math.max(0, gesture.dy));
    },
    onPanResponderRelease: (_event, gesture) => {
      const translationY = Math.max(0, gesture.dy);
      if (shouldDismissBottomSheet({
        translationY,
        velocityY: Math.max(0, gesture.vy),
        visibleHeight: visibleHeightRef.current,
      })) {
        void requestDismiss('swipe');
      } else {
        resetPosition();
      }
    },
    onPanResponderTerminate: resetPosition,
    onPanResponderTerminationRequest: () => false,
  }), [requestDismiss, resetPosition, translateY]);

  const scrollCoordinator = React.useMemo<ScrollCoordinator>(() => ({
    record(event) {
      scrollOffsetRef.current = Math.max(0, event.nativeEvent.contentOffset.y);
    },
  }), []);

  return (
    <Modal
      animationType={props.reduceMotion ? 'fade' : 'slide'}
      navigationBarTranslucent
      onRequestClose={() => void requestDismiss('back')}
      statusBarTranslucent
      transparent
      visible>
      <View accessibilityViewIsModal style={styles.modalRoot}>
        <Pressable
          accessibilityLabel="关闭弹层"
          accessibilityRole="button"
          onPress={() => void requestDismiss('backdrop')}
          style={styles.scrim}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          pointerEvents="box-none"
          style={styles.keyboardLayer}>
          <Animated.View
            {...panResponder.panHandlers}
            onLayout={event => {
              visibleHeightRef.current = event.nativeEvent.layout.height;
            }}
            style={[
              styles.sheet,
              props.dark && styles.sheetDark,
              {transform: [{translateY}]},
            ]}>
            <View
              accessibilityHint="向下拖动可以关闭"
              accessibilityLabel="弹层拖动把手"
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
                onPress={() => void requestDismiss('closeButton')}
                style={styles.closeButton}>
                <Text style={[styles.closeText, props.dark && styles.textDark]}>×</Text>
              </Pressable>
            </View>
            <BottomSheetScrollContext.Provider value={scrollCoordinator}>
              <View style={styles.body}>{props.children}</View>
            </BottomSheetScrollContext.Provider>
            {props.footer === undefined ? null : (
              <View style={[styles.footer, props.dark && styles.footerDark]}>{props.footer}</View>
            )}
          </Animated.View>
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
  handleTouch: {alignItems: 'center', minHeight: 32, justifyContent: 'center'},
  handle: {backgroundColor: '#B8C7C3', borderRadius: 99, height: 4, width: 44},
  handleDark: {backgroundColor: '#6D8982'},
  headingRow: {alignItems: 'center', flexDirection: 'row', gap: 12, paddingHorizontal: 18},
  headingCopy: {flex: 1},
  title: {color: '#173F3A', fontSize: 22, fontWeight: '600'},
  subtitle: {color: '#657672', fontSize: 13, lineHeight: 19, marginTop: 2},
  textDark: {color: '#F2FAF7'},
  textMutedDark: {color: '#B7CAC5'},
  closeButton: {alignItems: 'center', height: 48, justifyContent: 'center', width: 48},
  closeText: {color: '#536964', fontSize: 28, lineHeight: 30},
  body: {minHeight: 0, paddingHorizontal: 18},
  footer: {borderTopColor: '#DCE5E1', borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 18, paddingTop: 10},
  footerDark: {borderTopColor: '#48645E'},
});
