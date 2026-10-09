import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { css, FadeIn, FadeInDown, FadeOut, useReducedMotion } from 'react-native-reanimated';

import { Colors } from '@/constants/theme';

// Loops that play while Nomi works. Pure CSS keyframes: they run on the UI thread with no shared values.
const glow = css.keyframes({
  from: { opacity: 0.45 },
  '25%': { opacity: 1 },
  '50%': { opacity: 0.45 },
  to: { opacity: 0.45 },
});
const hop = css.keyframes({
  from: { opacity: 0.35, transform: [{ translateY: 0 }] },
  '20%': { opacity: 1, transform: [{ translateY: -4 }] },
  '40%': { opacity: 0.35, transform: [{ translateY: 0 }] },
  to: { opacity: 0.35, transform: [{ translateY: 0 }] },
});
const wobble = css.keyframes({
  from: { transform: [{ rotate: '0deg' }, { scale: 1 }] },
  '25%': { transform: [{ rotate: '14deg' }, { scale: 1.12 }] },
  '50%': { transform: [{ rotate: '0deg' }, { scale: 1 }] },
  '75%': { transform: [{ rotate: '-14deg' }, { scale: 1.12 }] },
  to: { transform: [{ rotate: '0deg' }, { scale: 1 }] },
});

const APPEAR = FadeIn.duration(200);
const LEAVE = FadeOut.duration(150);
const NEXT_STEP = FadeInDown.duration(180);

/** A light sweeping across the letters, like a "working on it" label. */
function Shimmer({ text }: { text: string }) {
  const reduced = useReducedMotion();
  if (reduced) return <Text style={styles.status}>{text}</Text>;
  return (
    <View accessible accessibilityLabel={text} style={styles.row}>
      {[...text].map((char, i) => (
        <Animated.Text
          key={i}
          style={[
            styles.status,
            styles.dim,
            { animationName: glow, animationDuration: 1600, animationDelay: i * 45, animationIterationCount: 'infinite', animationTimingFunction: 'linear' },
          ]}>
          {char}
        </Animated.Text>
      ))}
    </View>
  );
}

function Dots() {
  const reduced = useReducedMotion();
  return (
    <View style={styles.dots}>
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            !reduced && { animationName: hop, animationDuration: 1100, animationDelay: i * 160, animationIterationCount: 'infinite', animationTimingFunction: 'ease-in-out' },
          ]}
        />
      ))}
    </View>
  );
}

function Spark() {
  const reduced = useReducedMotion();
  return (
    <Animated.View
      style={!reduced && { animationName: wobble, animationDuration: 1800, animationIterationCount: 'infinite', animationTimingFunction: 'ease-in-out' }}>
      <Ionicons name="sparkles" size={17} color={Colors.primary} />
    </Animated.View>
  );
}

/** Live status while a request runs: wobbling sparkle, shimmering step label, hopping dots. */
export function Thinking({ label }: { label: string }) {
  return (
    <Animated.View entering={APPEAR} exiting={LEAVE} accessibilityLiveRegion="polite" style={styles.thinking}>
      <Spark />
      <Animated.View key={label} entering={NEXT_STEP} style={styles.row}>
        <Shimmer text={label} />
        <Dots />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 28 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  status: { fontSize: 14, color: '#4E6457' },
  dim: { opacity: 0.45 },
  dots: { flexDirection: 'row', gap: 3, marginLeft: 4, paddingTop: 4 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.primary, opacity: 0.5 },
});
