import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useNomi } from '@/hooks/use-nomi';
import { ACTIVITY_CAP, activityLine, dayLabel, groupByDay, timeInUB, type ActivityItem, type ActivityKind } from '@/utils/activity';
import { placeById } from '@/utils/places';

const ICONS: Record<ActivityKind, ComponentProps<typeof Ionicons>['name']> = {
  call: 'call-outline',
  map: 'location-outline',
  share: 'share-social-outline',
  source: 'open-outline',
  location: 'navigate-outline',
  ai_request: 'sparkles-outline',
  task_add: 'add-circle-outline',
  task_done: 'checkmark-circle-outline',
  task_restore: 'arrow-undo-outline',
  task_delete: 'trash-outline',
  memory_add: 'bookmark-outline',
  memory_delete: 'trash-outline',
  payment_add: 'wallet-outline',
  payment_paid: 'checkmark-done-outline',
  payment_unpaid: 'arrow-undo-outline',
  payment_delete: 'trash-outline',
  entry_add: 'receipt-outline',
  entry_delete: 'trash-outline',
  reminder_set: 'alarm-outline',
  reminder_fired: 'notifications-outline',
  report: 'flag-outline',
  followup: 'chatbubble-ellipses-outline',
  unsupported: 'help-circle-outline',
  delete_all: 'trash-outline',
};

const placeName = (id: string) => placeById(id)?.name;

/** "Үйлдлийн түүх": what Nomi did on the user's behalf, newest first, grouped by Ulaanbaatar day. Ids only; the place name is looked up in the catalog. */
export function ActivityHistory() {
  const { activity } = useNomi();
  const sections = groupByDay(activity.items).map((group) => ({ title: dayLabel(group.day), data: group.items }));

  return (
    <SectionList
      style={styles.sheet}
      contentContainerStyle={styles.content}
      sections={sections}
      keyExtractor={(item) => item.id}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={<Header count={activity.items.length} />}
      renderSectionHeader={({ section }) => <Text style={styles.day}>{section.title}</Text>}
      renderItem={({ item }) => <Row item={item} />}
      ListEmptyComponent={
        <Text style={styles.empty}>Одоогоор үйлдэл алга. Залгах, газрын зураг нээх, ажил нэмэх зэрэг үйлдэл энд бүртгэгдэнэ.</Text>
      }
    />
  );
}

function Header({ count }: { count: number }) {
  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.title}>Үйлдлийн түүх</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Хаах" style={styles.iconButton} onPress={() => router.back()}>
          <Ionicons name="close" size={23} color="#202925" />
        </Pressable>
      </View>
      <Text style={styles.hint}>
        Nomi таны өмнөөс хийсэн үйлдлүүд, Улаанбаатарын цагаар. Ажил, санамжийн текст энд хадгалагдахгүй; зөвхөн дугаар нь. Сүүлийн {ACTIVITY_CAP}{' '}
        үйлдэл үлдэнэ{count ? ` · одоо ${count}` : ''}.
      </Text>
    </View>
  );
}

function Row({ item }: { item: ActivityItem }) {
  return (
    <View style={styles.row}>
      <Ionicons name={ICONS[item.kind]} size={16} color={Colors.primary} />
      <Text style={styles.line}>
        {activityLine(item, placeName)}
        <Text style={styles.time}> · {timeInUB(item.at)}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 24, paddingBottom: 40, width: '100%', maxWidth: 480, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: '600', color: Colors.text, marginBottom: 8 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
  day: { fontSize: 13, fontWeight: '600', color: Colors.text, marginTop: 22, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36, borderLeftWidth: 2, borderLeftColor: Colors.line, paddingLeft: 12 },
  line: { flex: 1, fontSize: 14, lineHeight: 20, color: Colors.text },
  time: { color: Colors.textMuted },
  empty: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20, marginTop: 22 },
});
