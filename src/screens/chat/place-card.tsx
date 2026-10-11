import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Linking, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';

import { Colors } from '@/constants/theme';
import { useNomi } from '@/hooks/use-nomi';
import { mapsLink, safeUrl, verificationLabel } from '@/utils/core';
import { recordPlaceEvent } from '@/utils/events';
import { COMES_TO_YOU, DISTANCE_UNKNOWN, formatDistance, MOBILE_SERVICE, ONLINE_SERVICE, travelLine, WORKS_ONLINE } from '@/utils/location';
import { NOMI_WEB_URL } from '@/utils/hosted';
import { placeById } from '@/utils/places';
import { REPORTED_LABEL, reportedPlaces } from '@/utils/reports';
import { shareText } from '@/utils/share';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** The importer's placeholder when a source gives no street address. */
const NO_ADDRESS = 'Нарийвчилсан хаяг дутуу';
/** The address, or for a place with only a map pin "Байршил газрын зураг дээр · БЗД", or a request to ask by phone. */
const addressLine = (p: { address: string; latitude: number | null; district: string | null }) =>
  p.address && p.address !== NO_ADDRESS ? p.address : p.latitude != null ? 'Байршил газрын зураг дээр' + (p.district ? ' · ' + p.district : '') : 'Хаягийг утсаар лавлана уу.';
/** A record may list several numbers; the card shows at most this many. */
const MAX_PHONES = 3;
/** For a business nobody travels to, the line that replaces the address: it is reached from anywhere, so no district is named. */
const ONLINE_LINE = 'Хаана ч байсан утсаар, онлайнаар холбогдоно.';
/** For a business that comes to the customer, where it comes instead of where it is: the districts it named, else a request to ask. */
const servesLine = (p: { serviceAreas?: string[]; district: string | null }) =>
  p.serviceAreas?.length ? 'Очдог дүүрэг: ' + p.serviceAreas.join(', ') : 'Аль дүүрэгт очдогийг утсаар асуугаарай' + (p.district ? ' · ' + p.district + '-д байрладаг' : '');

type Props = {
  id: string;
  index: number;
  animate: boolean;
  /** Kilometres from the phone in a located search (Section 7): null when the record has no coordinates, absent when no position was used. */
  distance?: number | null;
  /** Shown as a business that comes to the customer (plumber, towing): where it comes and a call button instead of an address and a map. */
  oncall?: boolean;
};

export function PlaceCard({ id, index, animate, distance, oncall }: Props) {
  const { setNotice, recordActivity, recordCall, reports } = useNomi();
  const entering = useMemo(() => FadeInDown.duration(260).delay(160 + index * 70).easing(EASE_OUT), [index]);
  const place = placeById(id);
  // The anonymous count of how often this business was shown (src/utils/events.ts): once per card, nothing waited for.
  useEffect(() => {
    if (place) recordPlaceEvent(id, 'view');
  }, [id, place]);
  if (!place) return null;
  const map = mapsLink(place);
  const phones = place.phones.slice(0, MAX_PHONES);
  const verified = Boolean(place.verifiedAt);
  const mobile = place.qualityFlags.includes(MOBILE_SERVICE);
  // A business nobody travels to (the owner answered "online"): it has no address to show, no district to serve and no map.
  const online = place.qualityFlags.includes(ONLINE_SERVICE);
  // A business that comes to the customer: its address and distance do not matter, the call does.
  const comes = !online && (oncall || mobile);
  // Either way the one thing to do is call, so the big button and the hidden map are shared.
  const callFirst = comes || online;
  const [firstPhone, ...otherPhones] = phones;
  const call = (phone: string) => open('tel:+976' + phone.replace(/\D/g, '').replace(/^976(?=\d{8}$)/, ''), 'call');
  // A "Мэдээлэл буруу" report, or a Хаагдсан / Утас буруу answer to the follow-up after a call.
  const reported = reportedPlaces(reports).has(id);

  // Every external action needs a tap, and only web links and +976 numbers ever open. Each one that opened goes to the activity history (AC 10.2).
  async function open(target: string, kind: 'call' | 'map') {
    if (!safeUrl(target) && !/^tel:\+976[5-9]\d{7}$/.test(target)) return;
    try {
      await Linking.openURL(target);
      recordActivity({ kind, placeId: id });
      recordPlaceEvent(id, kind);
      // The follow-up question (Section 14) is queued here and asked once the app comes back from the call.
      if (kind === 'call') recordCall(id);
    } catch {
      setNotice('Холбоосыг нээж чадсангүй.');
    }
  }

  // The system share sheet (Messenger, Viber, SMS): the place and where to find Nomi, never the distance. Android reports a
  // share even when the sheet was dismissed, so the history says "Хуваалцсан" for an opened sheet.
  async function share() {
    if (!place) return;
    try {
      const result = await Share.share({ message: shareText(place, NOMI_WEB_URL || undefined) });
      if (result.action === Share.sharedAction) {
        recordActivity({ kind: 'share', placeId: id });
        recordPlaceEvent(id, 'share');
      }
    } catch {
      setNotice('Хуваалцаж чадсангүй.');
    }
  }

  return (
    <Animated.View entering={animate ? entering : undefined} style={styles.place}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{place.name}</Text>
        <View style={[styles.badge, verified ? styles.badgeVerified : styles.badgeUnverified]}>
          <Text style={[styles.badgeText, verified ? styles.badgeTextVerified : styles.badgeTextUnverified]}>{verificationLabel(place)}</Text>
        </View>
      </View>
      <Text style={styles.address}>{online ? ONLINE_LINE : comes ? servesLine(place) : addressLine(place)}</Text>
      {online ? (
        <View style={styles.distanceRow}>
          <Ionicons name="globe-outline" size={14} color={Colors.primary} />
          <Text style={styles.distance}>{WORKS_ONLINE}</Text>
        </View>
      ) : comes ? (
        <View style={styles.distanceRow}>
          <Ionicons name="car-outline" size={14} color={Colors.primary} />
          <Text style={styles.distance}>{COMES_TO_YOU}</Text>
        </View>
      ) : typeof distance === 'number' ? (
        <View style={styles.distanceRow}>
          <Ionicons name="navigate-outline" size={13} color={Colors.primary} />
          <Text style={styles.distance}>{[formatDistance(distance), travelLine(distance)].filter(Boolean).join(' · ')}</Text>
        </View>
      ) : (
        distance === null && (
          <View style={styles.distanceRow}>
            <Ionicons name="navigate-outline" size={13} color={Colors.textMuted} />
            <Text style={styles.detail}>{DISTANCE_UNKNOWN}</Text>
          </View>
        )
      )}
      {!!place.hoursClaim && (
        <Text style={styles.detail}>
          <Text style={styles.detailLabel}>{verified ? 'Цаг: ' : 'Цаг (баталгаажаагүй): '}</Text>
          {place.hoursClaim}
        </Text>
      )}
      {callFirst && firstPhone && (
        // The one thing to do with a business that comes to you, or that you never meet: call it.
        <Pressable accessibilityRole="button" accessibilityLabel={place.name + ' руу залгах: ' + firstPhone} onPress={() => call(firstPhone)} style={styles.callButton}>
          <Ionicons name="call" size={17} color={Colors.surface} />
          <Text style={styles.callText}>Залгах {firstPhone}</Text>
        </Pressable>
      )}
      <View style={styles.actions}>
        {(callFirst ? otherPhones : phones).map((phone) => (
          <Pressable key={phone} accessibilityRole="button" accessibilityLabel={place.name + ' руу залгах: ' + phone} onPress={() => call(phone)} style={styles.action}>
            <Ionicons name="call-outline" size={16} color={Colors.primary} />
            <Text style={styles.link}>{phone}</Text>
          </Pressable>
        ))}
        {map && !callFirst && (
          <Pressable accessibilityRole="button" accessibilityLabel={place.name + ' газрын зураг'} onPress={() => open(map, 'map')} style={styles.action}>
            <Ionicons name="location-outline" size={16} color={Colors.primary} />
            <Text style={styles.link}>Газрын зураг</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel={place.name + ': хуваалцах'} onPress={share} style={styles.action}>
          <Ionicons name="share-social-outline" size={16} color={Colors.primary} />
          <Text style={styles.link}>Хуваалцах</Text>
        </Pressable>
        {reported ? (
          <View accessibilityLabel={REPORTED_LABEL} style={styles.action}>
            <Ionicons name="checkmark-circle-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.reported}>{REPORTED_LABEL}</Text>
          </View>
        ) : (
          <Link href={{ pathname: '/report/[placeId]', params: { placeId: id } }} asChild>
            <Pressable accessibilityRole="button" accessibilityLabel={place.name + ': мэдээлэл буруу гэж мэдэгдэх'} style={styles.action}>
              <Ionicons name="flag-outline" size={16} color={Colors.textSecondary} />
              <Text style={styles.quiet}>Мэдээлэл буруу</Text>
            </Pressable>
          </Link>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  place: { borderLeftWidth: 2, borderLeftColor: Colors.line, paddingLeft: 14, marginTop: 18 },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '600', color: Colors.text, flexShrink: 1 },
  badge: { borderRadius: 9, paddingHorizontal: 8, paddingVertical: 2 },
  badgeVerified: { backgroundColor: Colors.tint },
  badgeUnverified: { borderWidth: 1, borderColor: Colors.border },
  badgeText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.1 },
  badgeTextVerified: { color: Colors.primary },
  badgeTextUnverified: { color: Colors.textSecondary },
  address: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20, marginTop: 4 },
  detail: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
  detailLabel: { color: Colors.textMuted },
  distanceRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  distance: { fontSize: 13, color: Colors.primary, fontWeight: '600', lineHeight: 20 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 6 },
  action: { flexDirection: 'row', gap: 5, alignItems: 'center', minHeight: 44 },
  callButton: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', minHeight: 44, marginTop: 8, paddingHorizontal: 18, borderRadius: 22, backgroundColor: Colors.primary },
  callText: { fontSize: 15, fontWeight: '700', color: Colors.surface },
  link: { fontSize: 13, color: Colors.primary },
  quiet: { fontSize: 13, color: Colors.textSecondary },
  reported: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
});
