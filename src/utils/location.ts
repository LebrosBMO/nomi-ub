import { inCategory, type Category, type Place } from './core.ts';

/** A position used for one nearby search and then dropped. It is never stored and never sent to the server (PRD Section 7). */
export type Coordinates = { latitude: number; longitude: number };

/** What a nearby search may do with the phone's position, decided without any prompt (see `LocationAccess` in understand.ts). */
export type LocationMode = 'ask' | 'use' | 'off';

/** Asked in chat before any system prompt. Only the "Зөвшөөрөх" tap goes on to the system permission. */
export const LOCATION_QUESTION = 'Ойролцоох газрыг олохын тулд байршлаа ашиглах уу? Байршил зөвхөн энэ утсанд үлдэнэ.';
/** The two answers, in the order they are shown; the chat acts on the keys. */
export const LOCATION_CHOICES = [
  { key: 'allow', label: 'Зөвшөөрөх' },
  { key: 'district', label: 'Дүүргээ хэлье' },
] as const;
export type LocationChoice = (typeof LOCATION_CHOICES)[number]['key'];
/** Said when the user declined in chat, the system refused, or no fix came in time: Nomi asks for the district instead. */
export const LOCATION_DENIED_LINE = 'Байршил зөвшөөрөгдөөгүй. Дүүрэг эсвэл хороолол хэлбэл хайж өгье.';
/** The live step while the phone is located, the completed step in the summary, and the step when no position came. */
export const LOCATING_STATUS = 'Байршлыг энэ утсан дээр ашиглаж байна';
export const LOCATED_STEP = 'Байршлыг энэ утсан дээр ашигласан';
export const LOCATION_FAILED_STEP = 'Байршил авч чадсангүй';
/** Added to a nearby reply that had no position, so the order is not mistaken for distance. */
export const NOT_SORTED_LINE = 'Зайгаар эрэмбэлээгүй.';
/** The card line for a record without coordinates in a located search: say what to do, not only what is missing. */
export const DISTANCE_UNKNOWN = 'Байршил тодорхойгүй, утсаар асуугаарай';
/** The card line for a shop that comes to the customer (the import flags it "mobile_service"): its distance does not matter. */
export const COMES_TO_YOU = 'Таны байршил дээр очдог';
export const MOBILE_SERVICE = 'mobile_service';
/** How long one fix may take before the search goes on without it. */
export const POSITION_TIMEOUT_MS = 10_000;

/** "≈ 1.2 км": metres (to 10 m) under one kilometre, one decimal under ten, whole kilometres from there. */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km) || km < 0) return DISTANCE_UNKNOWN;
  const tenths = Math.round(km * 10) / 10;
  if (tenths < 1) return `≈ ${Math.max(10, Math.round(km * 100) * 10)} м`;
  return `≈ ${tenths < 10 ? tenths.toFixed(1) : Math.round(km)} км`;
}

/**
 * Travel time estimated on the phone from the straight-line distance: no route service, so the position never leaves the device.
 * Streets run about 1.3× the straight line on foot and 1.4× by car; walking is taken at 4.8 km/h and a car in Ulaanbaatar traffic at
 * 18 km/h. One time per card: on foot under a kilometre (as `formatDistance` rounds it), by car from there, since past ~15 minutes
 * on foot people in Ulaanbaatar drive or take a taxi. Estimates, not routes: the card's "Газрын зураг" opens the real route.
 */
export const WALK_DETOUR = 1.3;
export const WALK_KMH = 4.8;
export const CAR_DETOUR = 1.4;
export const CAR_KMH = 18;

/** "~8 мин" under ten minutes, then to the nearest 5: an estimate should not look precise. */
const minutes = (min: number) => `~${min < 10 ? Math.max(1, Math.ceil(min)) : Math.round(min / 5) * 5} мин`;

/** "алхаж ~8 мин" under a kilometre, "машинаар ~25 мин" from there; empty for a distance it cannot use. */
export function travelLine(km: number): string {
  if (!Number.isFinite(km) || km < 0) return '';
  if (Math.round(km * 10) / 10 < 1) return `алхаж ${minutes(((km * WALK_DETOUR) / WALK_KMH) * 60)}`;
  return `машинаар ${minutes(((km * CAR_DETOUR) / CAR_KMH) * 60)}`;
}

/** How many catalog places (of one category, when given) have coordinates. Always computed, never typed (PRD Section 7). */
export function countLocated(places: readonly Pick<Place, 'category' | 'alsoCategories' | 'latitude' | 'longitude'>[], category?: Category | null) {
  return places.filter((p) => (!category || inCategory(p, category)) && p.latitude != null && p.longitude != null).length;
}

/** "206 газрын байршил мэдэгдэж байна." on a located reply; honest wording when nothing in the category has a pin yet. */
export function knownLocationLine(count: number) {
  return count > 0 ? `${count} газрын байршил мэдэгдэж байна.` : 'Эдгээр газрын байршил хараахан мэдэгдэхгүй байна.';
}

/** Settles with `promise`, or rejects after `ms` so a slow fix cannot hold the search. A late result is dropped. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
