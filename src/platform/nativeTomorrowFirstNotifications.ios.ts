import {NativeEventEmitter, NativeModules} from 'react-native';
import type {
  TomorrowFirstNotifications,
  TomorrowFirstTap,
} from '../application/tomorrowFirstNotifications';
import type {
  ReminderPermission,
  ReminderReplaceRequest,
  ReminderScheduleSnapshot,
} from '../application/reminderScheduling';

type StartFiveNotificationsNativeModule = Readonly<{
  getPermission(): Promise<ReminderPermission>;
  requestPermission(): Promise<ReminderPermission>;
  get(taskId: string): Promise<ReminderScheduleSnapshot | null>;
  replace(
    previous: ReminderScheduleSnapshot | null,
    next: ReminderScheduleSnapshot,
  ): Promise<void>;
  getInitialTap(): Promise<TomorrowFirstTap | null>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}>;

const nativeModule = NativeModules.StartFiveNotifications as
  | StartFiveNotificationsNativeModule
  | undefined;

function requireNativeModule(): StartFiveNotificationsNativeModule {
  if (nativeModule === undefined) {
    throw new Error('START_FIVE_NOTIFICATIONS_UNAVAILABLE');
  }
  return nativeModule;
}

export function createNativeTomorrowFirstNotifications(): TomorrowFirstNotifications {
  const module = requireNativeModule();
  const emitter = new NativeEventEmitter(module);
  return {
    getPermission: () => module.getPermission(),
    requestPermission: () => module.requestPermission(),
    get: taskId => module.get(taskId),
    replace: ({previous, next}: ReminderReplaceRequest) =>
      module.replace(previous, next),
    getInitialTap: () => module.getInitialTap(),
    subscribeTap(listener) {
      const subscription = emitter.addListener(
        'startFiveNotificationTap',
        (tap: TomorrowFirstTap) => listener(tap),
      );
      return () => subscription.remove();
    },
  };
}
