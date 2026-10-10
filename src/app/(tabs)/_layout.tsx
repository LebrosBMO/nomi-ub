import { Redirect } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

import { Colors } from '@/constants/theme';
import { useStores } from '@/hooks/use-stores';
import { attentionCount, todayPlan } from '@/utils/helper';
import { IS_BUSINESS_APP } from '@/utils/variant';

/**
 * The two halves of Nomi (Section 20): "Асуух" is the chat, where questions are asked and places are found; "Миний" is the
 * standing view of the user's own tasks, reminders and payments. The badge counts what is waiting today, so the tab says there is
 * something to do without the user having to open it.
 */
export default function TabsLayout() {
  const { personal, reminders, payments, ready } = useStores();
  // The owner app has no chat and no personal helper: it opens on the business pages instead (app.config.ts).
  if (IS_BUSINESS_APP) return <Redirect href="/business" />;
  const waiting = ready ? attentionCount(todayPlan(personal, reminders, payments)) : 0;

  return (
    // Android draws Material's default lavender bar unless told otherwise; Nomi's greens instead. iOS keeps its system bar (and
    // liquid glass on iOS 26), so only the tint is set there.
    <NativeTabs
      tintColor={Colors.primary}
      iconColor={{ default: Colors.textSecondary, selected: Colors.primary }}
      labelStyle={{ default: { color: Colors.textSecondary }, selected: { color: Colors.primary } }}
      backgroundColor={Platform.OS === 'android' ? Colors.panel : undefined}
      indicatorColor={Colors.line}
      rippleColor={Colors.tint}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf="bubble.left.and.bubble.right.fill" md="chat" />
        <NativeTabs.Trigger.Label>Асуух</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="helper">
        <NativeTabs.Trigger.Icon sf="checklist" md="checklist" />
        <NativeTabs.Trigger.Label>Миний</NativeTabs.Trigger.Label>
        {waiting > 0 && <NativeTabs.Trigger.Badge>{String(waiting)}</NativeTabs.Trigger.Badge>}
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
