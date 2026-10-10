import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { ALL_DAY_LABEL, CLOSED_LABEL, DAYS, dayText, formatHours, TIMES, type Week } from '@/utils/hours';

import { Check, Hint, Label } from './parts';

/**
 * Opening hours chosen rather than typed, the way Google and Facebook ask: a row per day, open or closed, around the clock
 * or a pair of times. What the owner picks becomes the one line the card shows (`formatHours`), so nothing downstream has to
 * read free text that could say anything at all.
 */
export function HoursPicker({ week, onChange }: { week: Week; onChange: (week: Week) => void }) {
  const [picking, setPicking] = useState<{ day: number; field: 'open' | 'close' } | null>(null);
  const set = (index: number, change: Partial<Week[number]>) => onChange(week.map((day, i) => (i === index ? { ...day, ...change } : day)));

  return (
    <View style={styles.block}>
      <Label>Ажиллах цаг</Label>
      {week.map((day, index) => (
        <View key={DAYS[index]} style={styles.row}>
          <Text style={styles.day}>{DAYS[index]}</Text>
          {day.closed ? (
            <Text style={styles.closed}>{CLOSED_LABEL}</Text>
          ) : day.allDay ? (
            <Text style={styles.allDay}>{ALL_DAY_LABEL}</Text>
          ) : (
            <View style={styles.times}>
              <Pressable accessibilityRole="button" accessibilityLabel={`${DAYS[index]}: нээх цаг, одоо ${day.open}`} onPress={() => setPicking({ day: index, field: 'open' })} style={styles.time}>
                <Text style={styles.timeText}>{day.open}</Text>
              </Pressable>
              <Text style={styles.dash}>—</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`${DAYS[index]}: хаах цаг, одоо ${day.close}`} onPress={() => setPicking({ day: index, field: 'close' })} style={styles.time}>
                <Text style={styles.timeText}>{day.close}</Text>
              </Pressable>
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: day.allDay }}
            accessibilityLabel={`${DAYS[index]}: 24 цаг`}
            onPress={() => set(index, { allDay: !day.allDay, closed: false })}
            style={[styles.tag, day.allDay && styles.tagOn]}>
            <Text style={[styles.tagText, day.allDay && styles.tagTextOn]}>24ц</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: day.closed }}
            accessibilityLabel={`${DAYS[index]}: амарна`}
            onPress={() => set(index, { closed: !day.closed, allDay: false })}
            style={[styles.tag, day.closed && styles.tagOff]}>
            <Ionicons name={day.closed ? 'close-circle' : 'close-circle-outline'} size={16} color={day.closed ? Colors.warning : Colors.textMuted} />
          </Pressable>
        </View>
      ))}
      {/* The same line a customer will see on the card, so there is no guessing what was saved. */}
      <Hint>{formatHours(week) ? `Картан дээр ингэж харагдана: ${formatHours(week)}` : 'Нэг ч өдөр нээлттэй биш байна.'}</Hint>

      <Modal visible={!!picking} transparent animationType="fade" onRequestClose={() => setPicking(null)}>
        <Pressable accessibilityLabel="Хаах" onPress={() => setPicking(null)} style={styles.scrim}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{picking ? `${DAYS[picking.day]} · ${picking.field === 'open' ? 'нээх цаг' : 'хаах цаг'}` : ''}</Text>
            <ScrollView style={styles.list}>
              {TIMES.map((time) => (
                <Pressable
                  key={time}
                  accessibilityRole="button"
                  onPress={() => {
                    if (picking) set(picking.day, { [picking.field]: time });
                    setPicking(null);
                  }}
                  style={styles.option}>
                  <Text style={styles.optionText}>{time}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

/** "Бүх өдөр ижил": one day's hours copied across the week, which is how most shops answer. */
export function CopyToAll({ week, onChange }: { week: Week; onChange: (week: Week) => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Check
      label={`Долоо хоногийн бүх өдөр Даваа гаригийнхтай ижил (${dayText(week[0])})`}
      checked={copied}
      onToggle={() => {
        const next = !copied;
        setCopied(next);
        if (next) onChange(week.map(() => ({ ...week[0] })));
      }}
    />
  );
}

const styles = StyleSheet.create({
  block: { marginTop: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 46, borderTopWidth: 1, borderTopColor: Colors.border },
  day: { width: 30, fontSize: 14, fontWeight: '600', color: Colors.text },
  times: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  time: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: Colors.surface },
  timeText: { fontSize: 14, color: Colors.text, fontVariant: ['tabular-nums'] },
  dash: { color: Colors.textMuted },
  closed: { flex: 1, fontSize: 14, color: Colors.warning },
  allDay: { flex: 1, fontSize: 14, color: Colors.primary, fontWeight: '600' },
  tag: { minWidth: 38, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: Colors.border },
  tagOn: { backgroundColor: Colors.tint, borderColor: Colors.primary },
  tagOff: { backgroundColor: Colors.panel },
  tagText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  tagTextOn: { color: Colors.primary },
  scrim: { flex: 1, backgroundColor: Colors.scrim, justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: { width: '100%', maxWidth: 320, maxHeight: 420, backgroundColor: Colors.surface, borderRadius: 16, padding: 12 },
  sheetTitle: { fontSize: 15, fontWeight: '600', color: Colors.ink, marginBottom: 8 },
  list: { flexGrow: 0 },
  option: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 },
  optionText: { fontSize: 15, color: Colors.text, fontVariant: ['tabular-nums'] },
});
