import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useNomi } from '@/hooks/use-nomi';
import { tapFeedback } from '@/utils/feedback';
import { placeById } from '@/utils/places';
import { NOTE_LIMIT, REPORT_REASONS, REPORT_THANKS, type ReportReason } from '@/utils/reports';

/** "Мэдээлэл буруу": one reason, an optional note, "Хадгалах". The report stays on this device (Section 6). */
export function ReportSheet() {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const { saveReport } = useNomi();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const place = typeof placeId === 'string' ? placeById(placeId) : undefined;

  async function save() {
    if (!place || !reason || busy) return;
    setBusy(true);
    setNotice('');
    tapFeedback();
    try {
      // A repeat of the same reason inside 24 hours is already on the phone, so it is thanked the same way.
      await saveReport({ placeId: place.id, reason, note });
      setSaved(true);
    } catch {
      setNotice('Мэдэгдлийг хадгалж чадсангүй. Дахин оролдоно уу.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.sheet} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.title}>Мэдээлэл буруу</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Хаах" style={styles.iconButton} onPress={() => router.back()}>
          <Ionicons name="close" size={23} color="#202925" />
        </Pressable>
      </View>
      {!place ? (
        <Text style={styles.hint}>Энэ газар каталогид олдсонгүй.</Text>
      ) : (
        <>
          <Text style={styles.place}>{place.name}</Text>
          {!!place.address && <Text style={styles.hint}>{place.address}</Text>}
          {saved ? (
            <>
              <Text style={styles.thanks}>{REPORT_THANKS}</Text>
              <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.primary}>
                <Text style={styles.primaryText}>Хаах</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.label}>Юу буруу байна?</Text>
              <View style={styles.reasons}>
                {REPORT_REASONS.map(([value, label]) => {
                  const selected = reason === value;
                  return (
                    <Pressable
                      key={value}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      onPress={() => setReason(value)}
                      style={[styles.reason, selected && styles.reasonSelected]}>
                      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? Colors.primary : Colors.textMuted} />
                      <Text style={styles.reasonText}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.label}>Тайлбар (заавал биш)</Text>
              <TextInput
                accessibilityLabel="Тайлбар"
                value={note}
                onChangeText={setNote}
                multiline
                maxLength={NOTE_LIMIT}
                placeholder="Жишээ: 9-р сарын 18-нд очиход хаалттай байсан"
                placeholderTextColor={Colors.textMuted}
                style={styles.field}
              />
              <Text style={styles.counter}>
                {note.length}/{NOTE_LIMIT}
              </Text>
              <Text style={styles.hint}>Мэдэгдэл зөвхөн энэ утсанд хадгалагдана. Байршил, яриа, санамж орохгүй.</Text>
              {!!notice && <Text style={styles.notice}>{notice}</Text>}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !reason || busy }}
                disabled={!reason || busy}
                onPress={save}
                style={[styles.primary, (!reason || busy) && styles.primaryDisabled]}>
                <Text style={styles.primaryText}>Хадгалах</Text>
              </Pressable>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 24, paddingBottom: 40, width: '100%', maxWidth: 480, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: '600', color: Colors.text, marginBottom: 8 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  place: { fontSize: 15, fontWeight: '600', color: Colors.text, marginTop: 4 },
  hint: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
  label: { fontSize: 13, marginTop: 18, marginBottom: 6, color: Colors.text },
  reasons: { gap: 2 },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 12, borderRadius: 12 },
  reasonSelected: { backgroundColor: Colors.tint },
  reasonText: { fontSize: 15, color: Colors.text },
  field: {
    borderWidth: 1,
    borderColor: '#DDE3D9',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    backgroundColor: Colors.surface,
    color: Colors.text,
  },
  counter: { fontSize: 11, color: Colors.textMuted, textAlign: 'right', marginTop: 4, marginBottom: 8 },
  thanks: { fontSize: 15, lineHeight: 23, color: Colors.text, marginTop: 20 },
  notice: { fontSize: 12, color: Colors.warning, marginTop: 8 },
  primary: { marginTop: 20, borderRadius: 14, backgroundColor: Colors.primary, padding: 15, alignItems: 'center' },
  primaryDisabled: { backgroundColor: Colors.primaryDisabled },
  primaryText: { color: '#FFF', fontWeight: '600' },
});
