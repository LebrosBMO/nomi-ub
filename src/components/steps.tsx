import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { css, cubicBezier, FadeInDown, LinearTransition } from 'react-native-reanimated';

import { Colors } from '@/constants/theme';
import { groupDigits } from '@/utils/feedback';

const RESIZE = LinearTransition.duration(220);

function StepRow({ text, index }: { text: string; index: number }) {
  const entering = useMemo(() => FadeInDown.duration(200).delay(index * 50), [index]);
  return (
    <Animated.View entering={entering} style={styles.step}>
      <View style={styles.stepLine} />
      <Text style={styles.stepText}>{text}</Text>
    </Animated.View>
  );
}

/** Collapsed "2 алхам · 0.8 сек · 1,240 token" row that expands to the completed steps. */
export function Steps({ steps, ms, tokens }: { steps: string[]; ms?: number; tokens?: number }) {
  const [open, setOpen] = useState(false);
  const meta = [
    `${steps.length} алхам`,
    typeof ms === 'number' ? (ms / 1000).toFixed(1) + ' сек' : '',
    tokens ? groupDigits(tokens) + ' token' : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Animated.View layout={RESIZE} style={styles.steps}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={meta}
        hitSlop={8}
        onPress={() => setOpen((v) => !v)}
        style={styles.head}>
        <Ionicons name="checkmark-circle" size={15} color={Colors.primary} />
        <Text style={styles.meta}>{meta}</Text>
        <Animated.View style={[chevron.base, { transform: [{ rotate: open ? '180deg' : '0deg' }] }]}>
          <Ionicons name="chevron-down" size={14} color="#8A948C" />
        </Animated.View>
      </Pressable>
      {open && steps.map((step, i) => <StepRow key={i} text={step} index={i} />)}
    </Animated.View>
  );
}

const chevron = css.create({
  base: { transitionProperty: 'transform', transitionDuration: 200, transitionTimingFunction: cubicBezier(0.77, 0, 0.175, 1) },
});

const styles = StyleSheet.create({
  steps: { marginBottom: 10, alignSelf: 'flex-start' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28 },
  meta: { fontSize: 12, color: '#7C877E' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 6, minHeight: 24 },
  stepLine: { width: 2, height: 16, borderRadius: 1, backgroundColor: Colors.line },
  stepText: { fontSize: 12, color: '#5F6E64' },
});
