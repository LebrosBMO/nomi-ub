import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown } from 'react-native-reanimated';

import { Steps } from '@/components/steps';
import { Colors } from '@/constants/theme';
import type { Message } from '@/hooks/use-nomi';
import { PlaceCard } from '@/screens/chat/place-card';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const SENT = FadeInDown.duration(260).easing(EASE_OUT);
const REPLIED = FadeIn.duration(300).easing(EASE_OUT);
/** The heading over businesses that come to the customer, when shops are listed above them (tire repair). */
export const COMES_SECTION = 'Танай хаяг дээр очиж үйлчилдэг';
export const moreLabel = (n: number) => `Дахиад ${n} харах`;

export function MessageView({ message, animate, onExpand }: { message: Message; animate: boolean; onExpand?: () => void }) {
  const [showMore, setShowMore] = useState(false);
  const isUser = message.role === 'user';
  const steps = Array.isArray(message.steps) ? message.steps.filter((s): s is string => typeof s === 'string') : [];
  const ids = (list: unknown) => (Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : []);
  const places = ids(message.places);
  const more = ids(message.more);
  const comes = ids(message.comes);
  const oncall = message.oncall === true;
  // Distances exist only while the located reply is in memory; a restored reply shows its cards without them.
  const distance = (id: string) => (message.distances ? (message.distances[id] ?? null) : undefined);
  return (
    <Animated.View entering={animate ? (isUser ? SENT : REPLIED) : undefined} style={[styles.message, isUser ? styles.user : styles.assistant]}>
      {!isUser && <Text style={styles.author}>Nomi</Text>}
      {!isUser && steps.length > 0 && (
        <Steps steps={steps} ms={message.ms} tokens={typeof message.tokens === 'number' ? message.tokens : undefined} />
      )}
      <Text selectable style={styles.text}>
        {message.text}
      </Text>
      {places.map((id, index) => (
        <PlaceCard key={id} id={id} index={index} animate={animate} oncall={oncall} distance={distance(id)} />
      ))}
      {showMore &&
        // They appear at once under the finger: a fade would leave the screen blank for a moment.
        more.map((id, index) => <PlaceCard key={id} id={id} index={index} animate={false} oncall={oncall} distance={distance(id)} />)}
      {more.length > 0 && !showMore && (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onExpand?.();
            setShowMore(true);
          }}
          style={styles.more}>
          <Text style={styles.moreText}>{moreLabel(more.length)}</Text>
          <Ionicons name="chevron-down" size={15} color={Colors.primary} />
        </Pressable>
      )}
      {comes.length > 0 && (
        <>
          <View style={styles.section}>
            <Ionicons name="car-outline" size={16} color={Colors.primary} />
            <Text accessibilityRole="header" style={styles.sectionText}>
              {COMES_SECTION}
            </Text>
          </View>
          {comes.map((id, index) => (
            <PlaceCard key={id} id={id} index={places.length + index} animate={animate} oncall />
          ))}
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  message: { maxWidth: '100%' },
  user: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.bubble,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 22,
    maxWidth: '86%',
  },
  assistant: { alignSelf: 'stretch' },
  author: { fontSize: 13, fontWeight: '600', color: Colors.primary, marginBottom: 9 },
  text: { fontSize: 16, lineHeight: 25, color: Colors.text },
  more: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 44, marginTop: 10, paddingHorizontal: 14, borderRadius: 22, backgroundColor: Colors.tint },
  moreText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  section: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 22 },
  sectionText: { fontSize: 14, fontWeight: '700', color: Colors.ink },
});
