import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { Colors } from '@/constants/theme';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/** Progress bar that fills from empty when shown. `value` is 0–1. */
export function Meter({ value }: { value: number }) {
  const reduced = useReducedMotion();
  const fill = useSharedValue(0);

  useEffect(() => {
    const target = Math.max(0, Math.min(1, value));
    fill.set(reduced ? target : withTiming(target, { duration: 700, easing: EASE_OUT }));
  }, [value, reduced, fill]);

  // The fill is absolute and childless, so animating width does not re-lay-out anything else.
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.get() * 100}%` }));

  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, fillStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: 3, backgroundColor: Colors.track, overflow: 'hidden', marginTop: 12 },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3, backgroundColor: Colors.primary },
});
