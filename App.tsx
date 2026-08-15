import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {createStartFiveApp} from './src/app/startFiveApp';
import {resolveIanaLocalTrigger} from './src/application/tomorrowFirstNotifications';
import {createNativeTomorrowFirstNotifications} from './src/platform/nativeTomorrowFirstNotifications';
import {createNativeBackupFileBridge} from './src/platform/nativeBackupFileBridge';

let idSequence = 0;

function createTaskId(): string {
  idSequence = (idSequence + 1) % Number.MAX_SAFE_INTEGER;
  const timestamp = Date.now().toString(36);
  const sequence = idSequence.toString(36);
  const entropy = Math.random().toString(36).slice(2, 10);
  return `task-${timestamp}-${sequence}-${entropy}`;
}

const tomorrowFirstNotifications = createNativeTomorrowFirstNotifications();
const backupFileBridge = createNativeBackupFileBridge();

const {AppRoot} = createStartFiveApp({
  storageBackend: AsyncStorage,
  now: () => new Date().toISOString(),
  idGenerator: createTaskId,
  ...(tomorrowFirstNotifications === undefined
    ? {}
    : {
        tomorrowFirstNotifications,
        currentTimeZone: () =>
          Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        resolveLocalTrigger: resolveIanaLocalTrigger,
      }),
  ...(backupFileBridge === undefined ? {} : {backupFileBridge}),
});

export default function App(): React.JSX.Element {
  return <AppRoot />;
}
