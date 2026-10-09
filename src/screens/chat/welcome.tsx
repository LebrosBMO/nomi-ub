import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown } from 'react-native-reanimated';

import { Float } from '@/components/float';
import { PressableScale } from '@/components/pressable-scale';
import { Colors } from '@/constants/theme';
import { EXAMPLES, PRINCIPLES } from '@/utils/examples';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const GREETING = FadeInDown.delay(80).duration(420).easing(EASE_OUT);
const QUESTION = FadeInDown.delay(200).duration(420).easing(EASE_OUT);
const PRINCIPLE = FadeIn.delay(340).duration(300);
// One builder per chip so they arrive one after another, like the steps in a reply.
const CHIP = EXAMPLES.map((_, i) => FadeInDown.delay(420 + i * 45).duration(260).easing(EASE_OUT));
const FOOT = FadeIn.delay(720).duration(300);

type Props = {
  /** "444 газар · 3 төрөл · AI холбогдоогүй", computed by the caller from the catalog and settings. */
  status: string;
  /** Shows the three principle lines; true only on the very first launch. */
  firstLaunch: boolean;
  /** Fills the composer with an example without sending it. */
  onExample: (text: string) => void;
  onHelp: () => void;
};

export function Welcome({ status, firstLaunch, onExample, onHelp }: Props) {
  return (
    <View style={styles.welcome}>
      <Float>
        <View style={styles.mark}>
          <Ionicons name="sparkles-outline" size={32} color={Colors.primary} />
        </View>
      </Float>
      <Animated.Text entering={GREETING} style={styles.greeting}>
        Сайн уу.
      </Animated.Text>
      <Animated.Text entering={QUESTION} style={styles.question}>
        Юугаар туслах вэ?
      </Animated.Text>
      {firstLaunch && (
        <Animated.View entering={PRINCIPLE} style={styles.principles}>
          {PRINCIPLES.map((line) => (
            <View key={line} style={styles.principle}>
              <Ionicons name="checkmark" size={15} color={Colors.primary} />
              <Text style={styles.principleText}>{line}</Text>
            </View>
          ))}
        </Animated.View>
      )}
      <View style={styles.chips}>
        {EXAMPLES.map((example, i) => (
          <Animated.View key={example} entering={CHIP[i]} style={styles.chipSlot}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={'Жишээ: ' + example}
              accessibilityHint="Бичих талбарт оруулна, илгээхгүй"
              onPress={() => onExample(example)}
              style={styles.chip}>
              <Text style={styles.chipText}>{example}</Text>
            </PressableScale>
          </Animated.View>
        ))}
      </View>
      <Animated.View entering={FOOT} style={styles.foot}>
        <Text style={styles.status}>{status}</Text>
        <Link href="/categories" asChild>
          <Pressable accessibilityRole="button" style={styles.help}>
            <Text style={styles.link}>Бүх ангилал харах</Text>
          </Pressable>
        </Link>
        <Pressable accessibilityRole="button" onPress={onHelp} style={styles.help}>
          <Text style={styles.link}>Юу хийж болох вэ?</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  welcome: { alignItems: 'center', paddingBottom: 40 },
  mark: {
    width: 68,
    height: 68,
    borderRadius: 24,
    backgroundColor: Colors.tint,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  greeting: { fontSize: 31, fontWeight: '600', letterSpacing: -0.8, color: Colors.ink },
  question: { fontSize: 25, color: '#7C877E', marginTop: 8, letterSpacing: -0.5 },
  principles: { marginTop: 22, gap: 8, alignItems: 'flex-start' },
  principle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  principleText: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 26, maxWidth: 520 },
  chipSlot: { maxWidth: '100%' },
  chip: { backgroundColor: Colors.tint, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, minHeight: 36, justifyContent: 'center' },
  chipText: { fontSize: 14, color: Colors.ink, textAlign: 'center' },
  foot: { alignItems: 'center', marginTop: 18 },
  status: { fontSize: 12, color: Colors.textMuted, letterSpacing: 0.1 },
  help: { alignItems: 'center', padding: 15, marginTop: 2 },
  link: { fontSize: 13, color: Colors.primary },
});
