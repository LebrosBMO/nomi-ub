import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { Colors } from '@/constants/theme';
import { useStores } from '@/hooks/use-stores';
import { attentionCount, todayPlan } from '@/utils/helper';

/** The web has no native tab bar; the same two tabs, drawn by the router. Props match the native layout exactly. */
export default function TabsLayout() {
  const { personal, reminders, payments, ready } = useStores();
  const waiting = ready ? attentionCount(todayPlan(personal, reminders, payments)) : 0;

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
