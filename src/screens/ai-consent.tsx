import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useNomi } from '@/hooks/use-nomi';
import { tapFeedback } from '@/utils/feedback';
import { dayInUB } from '@/utils/personal';
import { AI_DISCLOSURE, aiStatus, withConsent, withoutConsent } from '@/utils/storage';

/** Back to the chat: popped to when it is underneath, opened in place when this page was loaded directly on web. */
const leave = () => router.dismissTo('/');

const FLOW: [ComponentProps<typeof Ionicons>['name'], string][] = [
  ['phone-portrait-outline', 'Энэ утас'],
  ['server-outline', 'Nomi сервер'],
  ['sparkles-outline', 'OpenAI'],
];

/**
 * The AI disclosure (Section 8), shown after a server URL is saved and from the chat's "AI-г холбох". Nothing reaches the server
 * before "Зөвшөөрч холбох", which stores `aiConsentAt`. "Болих" keeps every request on the phone and is not asked again this
 * session. Clearing the server URL in Settings withdraws the consent.
 */
export function AiConsent() {
  const { ready, settings, saveSettings, markConsentAsked } = useNomi();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const state = aiStatus(settings);

  async function agree() {
    if (busy) return;
    setBusy(true);
    setNotice('');
    tapFeedback();
    try {
      await saveSettings(withConsent(settings));
      leave();
    } catch {
      setNotice('Зөвшөөрлийг хадгалж чадсангүй. Дахин оролдоно уу.');
    } finally {
      setBusy(false);
    }
  }

  // Withdraws the agreement: requests are answered on the phone until it is given again here.
  async function turnOff() {
    if (busy) return;
    setBusy(true);
    setNotice('');
    try {
      await saveSettings(withoutConsent(settings));
    } catch {
      setNotice('Хадгалж чадсангүй. Дахин оролдоно уу.');
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (state === 'consent') markConsentAsked();
    leave();
  }

  if (!ready) return <View style={styles.sheet} />;

  return (
    <ScrollView style={styles.sheet} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>AI-г холбох</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Хаах" style={styles.iconButton} onPress={close}>
          <Ionicons name="close" size={23} color="#202925" />
        </Pressable>
      </View>

      <View style={styles.flow} accessible accessibilityLabel="Энэ утас, Nomi сервер, OpenAI">
        {FLOW.map(([icon, label], i) => (
          <View key={label} style={styles.flowStep}>
            {i > 0 && <Ionicons name="arrow-forward" size={14} color={Colors.textMuted} />}
            <View style={styles.flowItem}>
              <Ionicons name={icon} size={20} color={Colors.primary} />
              <Text style={styles.flowLabel}>{label}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.body}>{AI_DISCLOSURE}</Text>

      {state === 'consent' ? (
        <>
          {!!notice && <Text style={styles.notice}>{notice}</Text>}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={agree}
            style={[styles.primary, busy && styles.primaryDisabled]}>
            <Text style={styles.primaryText}>Зөвшөөрч холбох</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.secondary} onPress={close}>
            <Text style={styles.secondaryText}>Болих</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.hint}>
            {state === 'on' && settings.aiConsentAt
              ? `Та ${dayInUB(new Date(settings.aiConsentAt))}-нд зөвшөөрсөн.`
              : 'Эхлээд Тохиргоонд серверийн хаяг, холболтын кодоо оруулна уу.'}
          </Text>
          {!!notice && <Text style={styles.notice}>{notice}</Text>}
          <Pressable accessibilityRole="button" style={styles.primary} onPress={close}>
            <Text style={styles.primaryText}>Хаах</Text>
          </Pressable>
          {state === 'on' && (
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Хүсэлт энэ утсан дээр хариулагдана"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={turnOff}
              style={styles.secondary}>
              <Text style={styles.secondaryText}>AI-г унтраах</Text>
            </Pressable>
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
  flow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    padding: 14,
    borderRadius: 18,
    backgroundColor: Colors.panel,
  },
  flowStep: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  flowItem: { alignItems: 'center', gap: 4, minWidth: 72 },
  flowLabel: { fontSize: 12, color: Colors.textSecondary },
  body: { fontSize: 15, lineHeight: 23, color: Colors.text, marginTop: 18 },
  hint: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20, marginTop: 14 },
  notice: { fontSize: 12, color: Colors.warning, marginTop: 12 },
  primary: { marginTop: 22, borderRadius: 14, backgroundColor: Colors.primary, padding: 15, alignItems: 'center' },
  primaryDisabled: { backgroundColor: Colors.primaryDisabled },
  primaryText: { color: '#FFF', fontWeight: '600' },
  secondary: { alignItems: 'center', padding: 15, marginTop: 6 },
  secondaryText: { color: Colors.text },
});
