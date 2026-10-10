import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';

import { Colors } from '@/constants/theme';
import { useStores } from '@/hooks/use-stores';
import { attentionCount, todayPlan } from '@/utils/helper';
import { IS_BUSINESS_APP } from '@/utils/variant';

/** The web has no native tab bar; the same two tabs, drawn by the router. Props match the native layout exactly. */
export default function TabsLayout() {
  const { personal, reminders, payments, ready } = useStores();
  const waiting = ready ? attentionCount(todayPlan(personal, reminders, payments)) : 0;
  // The owner app has no chat and no personal helper: it opens on the business pages instead (app.config.ts).
  if (IS_BUSINESS_APP) return <Redirect href="/business" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textSecondary,
        sceneStyle: { backgroundColor: Colors.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Асуух', tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="helper"
        options={{
          title: 'Миний',
          tabBarBadge: waiting || undefined,
          tabBarIcon: ({ color, size }) => <Ionicons name="checkbox-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
