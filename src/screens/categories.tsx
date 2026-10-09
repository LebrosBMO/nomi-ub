import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { CATEGORY_DATA, GROUPS, type CategoryDef } from '@/data/categories';
import { skeleton } from '@/utils/category-match';
import { countByCategory } from '@/utils/places';

/** Back to the chat, which asks for the category; `t` makes each tap a new request. */
function ask(c: CategoryDef) {
  router.dismissTo({ pathname: '/', params: { ask: c.mn, t: String(Date.now()) } });
}

/**
 * "Бүх ангилал": every category in the registry by group, with how many places Nomi lists for it. A filter matches names and
 * words in Cyrillic or Latin. A tap goes back to the chat and asks for that category there (chat reads the `ask` parameter).
 */
export function Categories() {
  const [filter, setFilter] = useState('');
  const sections = useMemo(() => {
    const q = skeleton(filter);
    const matches = (c: CategoryDef) => !q || skeleton([c.mn, c.en, ...c.words].join(' ')).includes(q);
    return GROUPS.map((g) => ({
      group: g,
      data: CATEGORY_DATA.filter((c) => c.group === g.id && matches(c)).sort(
        (a, b) => (countByCategory[b.id] ?? 0) - (countByCategory[a.id] ?? 0) || a.mn.localeCompare(b.mn, 'mn')
      ),
    })).filter((s) => s.data.length);
  }, [filter]);
  const listed = CATEGORY_DATA.filter((c) => (countByCategory[c.id] ?? 0) > 0).length;

  return (
    <View style={styles.sheet}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          Бүх ангилал
        </Text>
        <Text style={styles.subtitle}>
          {CATEGORY_DATA.length} ангилал · {listed}-д нь газар бүртгэлтэй
        </Text>
        <View style={styles.search}>
          <Ionicons name="search" size={17} color={Colors.textMuted} />
          <TextInput
            accessibilityLabel="Ангилал хайх"
            placeholder="Хайх: хувцас засвар, шүд, жолооны курс…"
            placeholderTextColor={Colors.textMuted}
            value={filter}
            onChangeText={setFilter}
            style={styles.input}
            autoCorrect={false}
          />
        </View>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Ийм ангилал олдсонгүй. Чатад шууд бичээд асуугаарай.</Text>}
        renderSectionHeader={({ section }) => (
          <Text accessibilityRole="header" style={styles.group}>
            {section.group.mn}
          </Text>
        )}
        renderItem={({ item }) => {
          const n = countByCategory[item.id] ?? 0;
          return (
            <Pressable accessibilityRole="button" accessibilityLabel={`${item.mn}, ${n} газар`} onPress={() => ask(item)} style={styles.row}>
              <Text style={[styles.name, !n && styles.nameEmpty]}>{item.mn}</Text>
              <Text style={styles.count}>{n ? `${n} газар` : 'цуглуулж байна'}</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8, width: '100%', maxWidth: 640, alignSelf: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: Colors.ink },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 4 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, borderRadius: 12, backgroundColor: Colors.panel, paddingHorizontal: 12 },
  input: { flex: 1, fontSize: 15, color: Colors.text, paddingVertical: 11 },
  list: { paddingHorizontal: 20, paddingBottom: 48, width: '100%', maxWidth: 640, alignSelf: 'center' },
  group: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, marginTop: 20, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  name: { flex: 1, fontSize: 15, color: Colors.text },
  nameEmpty: { color: Colors.textSecondary },
  count: { fontSize: 13, color: Colors.textMuted },
  empty: { fontSize: 14, color: Colors.textSecondary, marginTop: 24, textAlign: 'center' },
});
