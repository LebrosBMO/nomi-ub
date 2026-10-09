import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';

import { PressableScale } from '@/components/pressable-scale';
import { Colors } from '@/constants/theme';

export type Choice<K extends string = string> = { key: K; label: string };

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

type Props<K extends string> = {
  choices: readonly Choice<K>[];
  /** The user's tap: the explicit consent every action needs. Nothing here fires on its own. */
  onChoose: (choice: Choice<K>) => void;
  disabled?: boolean;
};

/**
 * Answers to Nomi's last question, tapped instead of typed: the location question today (Section 7), the follow-up after
 * a call later (Section 14). Every answer has the same weight; there is no default and no highlighted one.
 */
export function ChoiceChips<K extends string>({ choices, onChoose, disabled = false }: Props<K>) {
  return (
    <View style={styles.row}>
      {choices.map((choice, index) => (
        <Chip key={choice.key} label={choice.label} index={index} disabled={disabled} onPress={() => onChoose(choice)} />
      ))}
    </View>
  );
}

function Chip({ label, index, disabled, onPress }: { label: string; index: number; disabled: boolean; onPress: () => void }) {
  const entering = useMemo(() => FadeInDown.duration(240).delay(120 + index * 60).easing(EASE_OUT), [index]);
  return (
    <Animated.View entering={entering}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={[styles.chip, disabled && styles.disabled]}>
        <Text style={styles.text}>{label}</Text>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Pulled up under the question it answers; the conversation itself spaces messages 26 apart.
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -12 },
  chip: {
    borderRadius: 20,
    paddingHorizontal: 16,
    minHeight: 40,
    justifyContent: 'center',
    backgroundColor: Colors.tint,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  disabled: { opacity: 0.5 },
  text: { fontSize: 15, fontWeight: '600', color: Colors.primary },
});
