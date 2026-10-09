import { Ionicons } from '@expo/vector-icons';
import { Platform, StyleSheet, Text, TextInput, View, type NativeSyntheticEvent, type TextInputKeyPressEventData } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { Colors, MaxContentWidth } from '@/constants/theme';
import { LENGTH_HINT, MESSAGE_LIMIT } from '@/utils/understand';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  canSend: boolean;
  notice: string;
  footer: string;
};

export function Composer({ value, onChangeText, onSend, canSend, notice, footer }: Props) {
  const atLimit = value.length >= MESSAGE_LIMIT;
  // On the web, Enter sends and Shift+Enter starts a new line, as in other chats. Phones keep Return as a new line.
  function onKeyPress(e: NativeSyntheticEvent<TextInputKeyPressEventData & { shiftKey?: boolean }>) {
    if (Platform.OS !== 'web' || e.nativeEvent.key !== 'Enter' || e.nativeEvent.shiftKey) return;
    e.preventDefault();
    if (canSend) onSend();
  }
  return (
    <View style={styles.bottom}>
      {notice ? (
        <Text accessibilityRole="alert" style={styles.notice}>
          {notice}
        </Text>
      ) : null}
      {atLimit && (
        <Text accessibilityLiveRegion="polite" style={styles.hint}>
          {LENGTH_HINT}
        </Text>
      )}
      <View style={styles.composer}>
        <TextInput
          accessibilityLabel="Nomi-д бичих"
          placeholder="Nomi-д бичих…"
          placeholderTextColor={Colors.textMuted}
          multiline
          maxLength={MESSAGE_LIMIT}
          value={value}
          onChangeText={onChangeText}
          onKeyPress={onKeyPress}
          style={styles.input}
        />
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Илгээх"
          disabled={!canSend}
          onPress={onSend}
          scale={0.9}
          style={[styles.send, !canSend && styles.disabled]}>
          <Ionicons name="arrow-up" size={23} color="#fff" />
        </PressableScale>
      </View>
      <Text style={styles.footer}>{footer}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bottom: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  notice: { fontSize: 12, color: Colors.warning, paddingBottom: 8 },
  hint: { fontSize: 12, color: Colors.textSecondary, paddingBottom: 8 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    borderRadius: 28,
    padding: 8,
    paddingLeft: 19,
    gap: 8,
  },
  input: { flex: 1, minHeight: 40, maxHeight: 130, fontSize: 16, color: Colors.text, paddingTop: 10, paddingBottom: 9 },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  disabled: { backgroundColor: Colors.primaryDisabled },
  footer: { textAlign: 'center', fontSize: 11, color: Colors.textMuted, marginTop: 9 },
});
