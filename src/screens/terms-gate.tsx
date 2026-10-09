import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LegalDocView } from '@/components/legal-doc';
import { Colors } from '@/constants/theme';
import { useNomi } from '@/hooks/use-nomi';
import { tapFeedback } from '@/utils/feedback';
import { PRIVACY, TERMS, WELCOME_POINTS, withTerms } from '@/utils/legal';

/**
 * The first screen, over everything until the current terms are accepted (Section 8). One tap accepts the Terms of Use, the
 * Privacy Policy and the AI disclosure, so the chat never asks; "AI-гүйгээр эхлэх" accepts the terms and keeps every request on
 * the phone. Both documents open inside it, since the screens below it are covered.
 */
export function TermsGate() {
  const { settings, saveSettings } = useNomi();
  const [reading, setReading] = useState<'terms' | 'privacy' | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  async function start(ai: boolean) {
    if (busy) return;
    setBusy(true);
    setNotice('');
    tapFeedback();
    try {
      await saveSettings(withTerms(settings, ai));
    } catch {
      setNotice('Хадгалж чадсангүй. Дахин оролдоно уу.');
      setBusy(false);
    }
  }

  if (reading) {
    return (
      <SafeAreaView style={styles.screen}>
        <Pressable accessibilityRole="button" accessibilityLabel="Буцах" onPress={() => setReading(null)} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={Colors.primary} />
          <Text style={styles.backText}>Буцах</Text>
        </Pressable>
        <ScrollView contentContainerStyle={styles.content}>
          <LegalDocView doc={reading === 'terms' ? TERMS : PRIVACY} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.mark}>
          <Ionicons name="sparkles-outline" size={30} color={Colors.primary} />
        </View>
        <Text accessibilityRole="header" style={styles.title}>
          Nomi-д тавтай морил
        </Text>
        {WELCOME_POINTS.map((line) => (
          <View key={line} style={styles.point}>
            <Ionicons name="checkmark" size={16} color={Colors.primary} style={styles.pointIcon} />
            <Text style={styles.pointText}>{line}</Text>
          </View>
        ))}
        <Text style={styles.agree}>
          Эхэлснээр{' '}
          <Text accessibilityRole="link" style={styles.link} onPress={() => setReading('terms')}>
            Үйлчилгээний нөхцөл
          </Text>
          ,{' '}
          <Text accessibilityRole="link" style={styles.link} onPress={() => setReading('privacy')}>
            Нууцлалын бодлогыг
          </Text>{' '}
          зөвшөөрнө.
        </Text>
        {!!notice && <Text style={styles.notice}>{notice}</Text>}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => start(true)}
          style={[styles.primary, busy && styles.primaryDisabled]}>
          <Text style={styles.primaryText}>Зөвшөөрч эхлэх</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityHint="Хүсэлт энэ утсан дээр хариулагдана" disabled={busy} onPress={() => start(false)} style={styles.secondary}>
          <Text style={styles.secondaryText}>AI-гүйгээр эхлэх</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 1000, elevation: 1000, backgroundColor: Colors.background },
  content: { padding: 24, paddingBottom: 40, width: '100%', maxWidth: 480, alignSelf: 'center' },
  mark: { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.tint, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  title: { fontSize: 24, fontWeight: '700', color: Colors.ink, marginTop: 18, marginBottom: 10 },
  point: { flexDirection: 'row', gap: 10, marginTop: 12 },
  pointIcon: { marginTop: 3 },
  pointText: { flex: 1, fontSize: 15, lineHeight: 22, color: Colors.text },
  agree: { fontSize: 13, lineHeight: 20, color: Colors.textSecondary, marginTop: 26 },
  link: { color: Colors.primary, textDecorationLine: 'underline' },
  notice: { color: Colors.warning, marginTop: 12 },
  primary: { marginTop: 18, borderRadius: 14, backgroundColor: Colors.primary, padding: 15, alignItems: 'center' },
  primaryDisabled: { backgroundColor: Colors.primaryDisabled },
  primaryText: { color: '#FFF', fontWeight: '600', fontSize: 16 },
  secondary: { alignItems: 'center', padding: 15, marginTop: 6, minHeight: 48 },
  secondaryText: { color: Colors.text },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 16, paddingVertical: 12, minHeight: 48 },
  backText: { color: Colors.primary, fontSize: 15 },
});
