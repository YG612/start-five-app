import React from 'react';
import {Alert, Keyboard, Text} from 'react-native';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {
  AppBottomSheet,
  bottomSheetGestureDecision,
  shouldDismissBottomSheet,
} from '../../src/components/AppBottomSheet';

describe('P19 bottom-sheet close contract', () => {
  it('hands a downward gesture to content until the coordinated scroll is at the top', () => {
    expect(bottomSheetGestureDecision({dx: 0, dy: 20, scrollOffsetY: 40})).toBe('ignore');
    expect(bottomSheetGestureDecision({dx: 0, dy: 20, scrollOffsetY: 0})).toBe('drag-sheet');
    expect(bottomSheetGestureDecision({dx: 20, dy: 8, scrollOffsetY: 0})).toBe('ignore');
    expect(shouldDismissBottomSheet({translationY: 20, velocityY: 0.95, visibleHeight: 600})).toBe(true);
    expect(shouldDismissBottomSheet({translationY: 30, velocityY: 0.2, visibleHeight: 600})).toBe(false);
  });

  it('coalesces repeated close requests and dismisses the keyboard once per close attempt', async () => {
    let resolve!: (value: boolean) => void;
    const pending = new Promise<boolean>(next => { resolve = next; });
    const onDismissAttempt = jest.fn(() => pending);
    const keyboard = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    const screen = await render(
      <AppBottomSheet onDismissAttempt={onDismissAttempt} title="测试弹层">
        <Text>内容</Text>
      </AppBottomSheet>,
    );
    await fireEvent.press(screen.getByRole('button', {name: '关闭'}));
    await fireEvent.press(screen.getByRole('button', {name: '关闭弹层'}));
    await waitFor(() => expect(onDismissAttempt).toHaveBeenCalledTimes(1));
    expect(keyboard).toHaveBeenCalledTimes(1);
    resolve(true);
    await pending;
    await screen.unmount();
  });

  it('does not silently discard a dirty form', async () => {
    const onDismissAttempt = jest.fn(() => true);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = await render(
      <AppBottomSheet
        dirty
        dismissPolicy="confirmDirty"
        onDismissAttempt={onDismissAttempt}
        title="脏表单">
        <Text>内容</Text>
      </AppBottomSheet>,
    );
    await fireEvent.press(screen.getByRole('button', {name: '关闭'}));
    expect(onDismissAttempt).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledTimes(1);
    const buttons = alert.mock.calls[0]?.[2];
    buttons?.[1]?.onPress?.();
    await waitFor(() => expect(onDismissAttempt).toHaveBeenCalledTimes(1));
    await screen.unmount();
  });
});
