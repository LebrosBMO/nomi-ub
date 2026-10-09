import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { NotificationAdapter, Reminder } from './reminders';

/**
 * The expo-notifications side of reminders (Section 13), kept thin so reminders.ts and understand.ts run in Node with a mock.
 * Local notifications work in Expo Go on Android and iOS (only remote push needs a development build there); the web has none,
 * so `supported` is false and every reply says the reminder went to the plan only. The Android channel is created before the
 * permission prompt, which Android 13 will not show without one, and before anything is scheduled.
 */
const CHANNEL_ID = 'reminders';
const supported = Platform.OS !== 'web';

async function ensureChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, { name: 'Сануулга', importance: Notifications.AndroidImportance.HIGH });
  }
}

/** A reminder that comes due while Nomi is in the foreground is still shown: banner, notification list and sound, no badge. Called once from the root layout. */
export function prepareNotifications() {
  if (!supported) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

export const notifications: NotificationAdapter = {
  supported,
  async granted() {
    try {
      return (await Notifications.getPermissionsAsync()).granted;
    } catch {
      return false;
    }
  },
  async request() {
    try {
      await ensureChannel();
      return (await Notifications.requestPermissionsAsync()).granted;
    } catch {
      return false;
    }
  },
  async schedule(reminder: Reminder) {
    await ensureChannel();
    // Only the reminder's id travels in the notification's data; the chat looks the text up in the store when it is tapped.
    return Notifications.scheduleNotificationAsync({
      content: { title: 'Nomi', body: reminder.text, data: { reminderId: reminder.id } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(reminder.at), channelId: CHANNEL_ID },
    });
  },
  cancel: (notificationId) => Notifications.cancelScheduledNotificationAsync(notificationId),
  cancelAll: () => Notifications.cancelAllScheduledNotificationsAsync(),
};

function reminderId(notification: Notifications.Notification): string | null {
  const id = notification.request.content.data?.reminderId;
  return typeof id === 'string' ? id : null;
}

/**
 * Reminder notifications for the chat: `opened` is true when the user tapped one (including the tap that launched Nomi, read once
 * from the last response and then cleared so a remount does not repeat it), false when one arrived while Nomi was in the
 * foreground. Each notification is reported once per kind. Returns the unsubscribe; a no-op on web.
 */
export function subscribeReminders(listener: (id: string, opened: boolean) => void): () => void {
  if (!supported) return () => {};
  const seen = new Set<string>();
  const report = (notification: Notifications.Notification, opened: boolean) => {
    const id = reminderId(notification);
    const key = `${notification.request.identifier}:${opened ? 'opened' : 'received'}`;
    if (!id || seen.has(key)) return;
    seen.add(key);
    listener(id, opened);
  };
  const received = Notifications.addNotificationReceivedListener((notification) => report(notification, false));
  const responded = Notifications.addNotificationResponseReceivedListener((response) => report(response.notification, true));
  Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (!response) return;
      report(response.notification, true);
      return Notifications.clearLastNotificationResponseAsync();
    })
    .catch(() => {});
  return () => {
    received.remove();
    responded.remove();
  };
}
