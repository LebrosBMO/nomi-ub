import { useState, type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { css, cubicBezier, useReducedMotion } from 'react-native-reanimated';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  /** How far it shrinks while held. Small icon buttons need more than 0.97 to be visible. */
  scale?: number;
  children?: ReactNode;
};

/** Pressable that squishes on press-in and settles back on release. */
export function PressableScale({ style, scale = 0.97, children, onPressIn, onPressOut, ...rest }: Props) {
  const [pressed, setPressed] = useState(false);
  const reduced = useReducedMotion();
  return (
    <Pressable
      hitSlop={8}
      pressRetentionOffset={16}
      {...rest}
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}>
      <Animated.View style={[styles.base, style, { transform: [{ scale: pressed && !reduced ? scale : 1 }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

const styles = css.create({
  base: {
    transitionProperty: 'transform',
    transitionDuration: 120,
    transitionTimingFunction: cubicBezier(0.23, 1, 0.32, 1),
  },
});
