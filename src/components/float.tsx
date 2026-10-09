import type { ReactNode } from 'react';
import Animated, { css, useReducedMotion } from 'react-native-reanimated';

const drift = css.keyframes({
  from: { transform: [{ translateY: 0 }, { rotate: '0deg' }] },
  '25%': { transform: [{ translateY: -5 }, { rotate: '3deg' }] },
  '50%': { transform: [{ translateY: 0 }, { rotate: '0deg' }] },
  '75%': { transform: [{ translateY: 5 }, { rotate: '-3deg' }] },
  to: { transform: [{ translateY: 0 }, { rotate: '0deg' }] },
});

/** Gentle floating for the welcome mark. Still when the system asks for reduced motion. */
export function Float({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <Animated.View
      style={!reduced && { animationName: drift, animationDuration: 3600, animationIterationCount: 'infinite', animationTimingFunction: 'ease-in-out' }}>
      {children}
    </Animated.View>
  );
}
