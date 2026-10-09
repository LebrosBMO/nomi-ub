import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { Colors } from '@/constants/theme';
import { HOSTED_API_URL } from '@/utils/hosted';

/**
 * The pieces the three owner pages share (/business, /business/report, /admin). They are plain web pages in the same
 * deployment as the API: phone-friendly at 375 px, one column, no store install and no account.
 */
export const API_BASE = Platform.OS === 'web' ? '/api' : HOSTED_API_URL;

/** One JSON call that never throws: the server's `error` code comes back as it is, so each page can say it in Mongolian. */
export async function callApi<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T | null; error: string }> {
  try {
    const response = await fetch(API_BASE + path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
    const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
    return { ok: response.ok, status: response.status, data: response.ok ? body : null, error: (!response.ok && body?.error) || (response.ok ? '' : 'request_failed') };
  } catch {
    return { ok: false, status: 0, data: null, error: 'network' };
  }
}

/** What the page says for a failed call: the server's code where it has words of its own, else one honest line. */
export const apiMessage = (error: string, codes: Record<string, string> = {}) =>
  codes[error] ??
  (error === 'network'
    ? 'Интернэт холболтоо шалгаад дахин оролдоно уу.'
    : error === 'store_not_configured' || error === 'store_unavailable'
      ? 'Сервер хариу өгсөнгүй. Хэсэг хүлээгээд дахин оролдоно уу.'
      : error === 'rate_limit'
        ? 'Хэт олон хүсэлт илгээлээ. Жаахан хүлээгээд дахин оролдоно уу.'
        : 'Илгээж чадсангүй. Дахин оролдоно уу.');

export function Page({ children }: { children: ReactNode }) {
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export const Title = ({ children }: { children: ReactNode }) => <Text style={styles.title}>{children}</Text>;
export const Lede = ({ children }: { children: ReactNode }) => <Text style={styles.lede}>{children}</Text>;
export const Hint = ({ children }: { children: ReactNode }) => <Text style={styles.hint}>{children}</Text>;
export const Notice = ({ children }: { children: ReactNode }) => <Text style={styles.notice}>{children}</Text>;
export const Label = ({ children }: { children: ReactNode }) => <Text style={styles.label}>{children}</Text>;

export function Section({ heading, children }: { heading?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      {!!heading && <Text style={styles.heading}>{heading}</Text>}
      {children}
    </View>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={styles.fieldRow}>
      <Label>{label}</Label>
      <TextInput accessibilityLabel={label} placeholderTextColor={Colors.textMuted} {...props} style={[styles.field, props.multiline && styles.fieldTall]} />
      {!!hint && <Hint>{hint}</Hint>}
    </View>
  );
}

export function Check({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label} onPress={onToggle} style={styles.check}>
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={22} color={checked ? Colors.primary : Colors.textMuted} />
      <Text style={styles.checkText}>{label}</Text>
    </Pressable>
  );
}

export function Primary({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={[styles.primary, disabled && styles.primaryOff]}>
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

export function Quiet({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.quiet}>
      <Text style={styles.quietText}>{label}</Text>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingBottom: 56, width: '100%', maxWidth: 520, alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: Colors.ink, marginTop: 8 },
  lede: { fontSize: 15, lineHeight: 24, color: Colors.text, marginTop: 10 },
  hint: { fontSize: 12, lineHeight: 19, color: Colors.textSecondary, marginTop: 4 },
  notice: { fontSize: 13, lineHeight: 20, color: Colors.warning, marginTop: 10 },
  label: { fontSize: 13, color: Colors.text, marginBottom: 6 },
  section: { marginTop: 26, borderRadius: 16, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, padding: 16 },
  heading: { fontSize: 17, fontWeight: '600', color: Colors.ink, marginBottom: 10 },
  fieldRow: { marginTop: 12 },
  field: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 12, minHeight: 46, fontSize: 15, backgroundColor: Colors.surface, color: Colors.text },
  fieldTall: { minHeight: 84, paddingTop: 10, textAlignVertical: 'top' },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingRight: 8 },
  checkText: { fontSize: 14, color: Colors.text, flexShrink: 1 },
  primary: { marginTop: 18, borderRadius: 14, backgroundColor: Colors.primary, padding: 15, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  primaryOff: { backgroundColor: Colors.primaryDisabled },
  primaryText: { color: Colors.surface, fontWeight: '700', fontSize: 15 },
  quiet: { minHeight: 44, justifyContent: 'center', marginTop: 10 },
  quietText: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
});
