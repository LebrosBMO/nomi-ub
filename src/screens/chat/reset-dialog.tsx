import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

/** Confirmation before clearing the conversation. A Modal rather than Alert so it also works on web. */
export function ResetDialog({ visible, onConfirm, onCancel }: { visible: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Шинэ яриа эхлэх үү?</Text>
          <Text style={styles.hint}>Одоогийн яриа арилна. Хадгалсан ажил, санамжууд үлдэнэ.</Text>
          <Pressable accessibilityRole="button" style={styles.primary} onPress={onConfirm}>
            <Text style={styles.primaryText}>Шинэ яриа эхлэх</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.secondary} onPress={onCancel}>
            <Text>Болих</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: Colors.scrim, alignItems: 'center', justifyContent: 'center', padding: 22 },
  sheet: { width: '100%', maxWidth: 420, borderRadius: 24, padding: 24, backgroundColor: Colors.background },
  title: { fontSize: 20, fontWeight: '600', color: Colors.text, marginBottom: 8 },
  hint: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
  primary: { marginTop: 20, borderRadius: 14, backgroundColor: Colors.primary, padding: 15, alignItems: 'center' },
  primaryText: { color: '#FFF', fontWeight: '600' },
  secondary: { alignItems: 'center', padding: 15, marginTop: 6 },
});
