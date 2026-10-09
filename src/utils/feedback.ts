import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** One light tap per user action; web browsers mostly ignore vibration, so skip it there. */
export function tapFeedback() {
  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export const groupDigits = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
