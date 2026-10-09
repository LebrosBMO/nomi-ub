import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ExpoSecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { deleteFollowups } from './followups-storage';
import { deleteReminders } from './reminders-storage';
import { deleteAllData, installKeyStore, settingsStore, type SecureStore } from './storage';

/**
 * The device side of storage.ts, kept thin so the settings and deletion logic run in Node with fakes. SecureStore works in Expo
 * Go on Android and iOS; `requireAuthentication` is not used. It has no web support, so there the token stays in browser storage.
 */
const secure: SecureStore | null =
  Platform.OS === 'web'
    ? null
    : {
        getItem: (key) => ExpoSecureStore.getItemAsync(key),
        setItem: (key, value) => ExpoSecureStore.setItemAsync(key, value),
        deleteItem: (key) => ExpoSecureStore.deleteItemAsync(key),
      };

/** False on web, where Settings says the code is kept in the browser's storage. */
export const tokenInSecureStore = secure !== null;

const settings = settingsStore(AsyncStorage, secure);
export const loadState = settings.load;
/** This install's key for Nomi's hosted server (install.ts). */
export const installKeys = installKeyStore(AsyncStorage, secure);
export const saveState = settings.save;

/** "Миний өгөгдлийг устгах": scheduled notifications, the secure token and every `nomi:` key. */
export async function deleteDeviceData() {
  try {
    await deleteAllData({ local: AsyncStorage, secure, deleteReminders, deleteFollowups });
  } finally {
    settings.forget();
  }
}
