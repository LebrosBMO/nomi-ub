import { CATEGORY_DATA, GROUPS, type CategoryDef } from '../data/categories.ts';

const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', ө: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ү: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: 'i', ы: 'i', ь: 'i', э: 'e',
  ю: 'yu', я: 'ya',
};

/**
 * One Latin skeleton for Cyrillic and for the ways people type Mongolian in Latin letters: "засвар", "zasvar" and "zaswar" all
 * become "zasvar", "шүдний" and "shudnii" become "shudni". Letters only, single spaces, a doubled letter written once.
 */
export function skeleton(text: string): string {
  let s = text.normalize('NFKC').toLowerCase();
  s = [...s].map((ch) => CYRILLIC[ch] ?? ch).join('');
  s = s
    .replace(/[öó]/g, 'o')
    .replace(/[üú]/g, 'u')
    .replace(/kh/g, 'h')
    .replace(/zh/g, 'j')
    .replace(/w/g, 'v')
    .replace(/c(?!h)/g, 'ts')
    .replace(/y(?![aeiouy])/g, 'i')
    .replace(/q/g, 'k')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/([a-z])\1+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

export const CATEGORIES: ReadonlyMap<string, CategoryDef> = new Map(CATEGORY_DATA.map((c) => [c.id, c]));
export { GROUPS };
export const categoryName = (id: string) => CATEGORIES.get(id)?.mn ?? id;
export const isCategory = (id: unknown): id is string => typeof id === 'string' && CATEGORIES.has(id);

// Every name and word of every category, as skeletons, longest first so the most specific phrase is found first.
const KEYS = CATEGORY_DATA.flatMap((c) => [c.mn, ...c.words].map((w) => ({ id: c.id, key: skeleton(w) })))
  .filter((k) => k.key.length >= 3)
  .sort((a, b) => b.key.length - a.key.length);

/**
 * The categories a message names. A phrase must start at a word ("эмийн сангаас" matches "эмийн сан"). Each category keeps its
 * longest match; a category whose match shares words with a longer match ("дугуй засвар" in "унадаг дугуй засвар") is dropped,
 * so only categories named separately remain. More than one left means the message named several.
 */
export function matchCategories(text: string): string[] {
  const s = ' ' + skeleton(text) + ' ';
  const best = new Map<string, { start: number; end: number }>();
  for (const { id, key } of KEYS) {
    if (best.has(id)) continue;
    const at = s.indexOf(' ' + key);
    if (at >= 0) best.set(id, { start: at + 1, end: at + 1 + key.length });
  }
  const spans = [...best.entries()];
  return spans
    .filter(([id, a]) => !spans.some(([other, b]) => other !== id && b.start < a.end && a.start < b.end && b.end - b.start > a.end - a.start))
    .sort((x, y) => x[1].start - y[1].start)
    .map(([id]) => id);
}

const stemsOf = (name: string) => new Set(skeleton(name).split(' ').filter((w) => w.length >= 4).map((w) => w.slice(0, 4)));
// How many category names each word beginning appears in: "mash" (машин), "zasv" (засвар) or "tavi" (тавих) say little.
const STEM_SPREAD = new Map<string, number>();
for (const c of CATEGORY_DATA) for (const s of stemsOf(c.mn)) STEM_SPREAD.set(s, (STEM_SPREAD.get(s) ?? 0) + 1);
const SPECIFIC = (s: string) => (STEM_SPREAD.get(s) ?? 0) <= 6;
/** Where a group has an obvious general place for its specialised services: a garage for car work, a clinic for a specialist. */
const GROUP_ANCHORS: Record<string, string[]> = {
  auto: ['car_repair'],
  health: ['private_hospital', 'medical_clinic', 'hospital'],
  beauty: ['beauty_salon'],
  sport: ['sports_complex', 'fitness'],
  pets: ['vet_clinic'],
};

/**
 * For a category with no place of its own, a category in the same group that has places and whose name starts with the same
 * specific word ("Шүдний имплант" → "Шүдний эмнэлэг"), the larger one if several; failing that, the group's general place where
 * it has one (car work → a garage). Null otherwise, so an unrelated list is never offered.
 */
/**
 * Specialised services that the general business of their family often does, offered when nothing is listed for them alone
 * (frozen pipes → a plumber, a Russian course → a language school). A service named under two families tries them in order.
 */
export const FAMILIES: Record<string, string[]> = {
  tailor: ['zipper_replacement', 'trouser_hemming', 'deel_tailoring', 'uniform_sewing', 'fur_leather_atelier', 'knitwear', 'embroidery', 'sewing_course'],
  shoe_repair: ['mongolian_boots', 'bag_repair'],
  key_cutting: ['intercom_key', 'knife_sharpening', 'skate_sharpening'],
  computer_repair: ['software_install', 'pc_building', 'data_recovery', 'printer_repair', 'toner_refill', 'console_repair'],
  tv_repair: ['camera_repair', 'audio_repair', 'tv_mounting'],
  appliance_repair: ['washing_machine_repair', 'fridge_repair', 'microwave_repair', 'stove_appliance_repair', 'heater_repair', 'small_appliance_repair', 'coffee_machine_repair'],
  dentist: ['dental_cleaning', 'kids_dentist', 'orthodontist', 'dental_implant', 'teeth_whitening', 'dentures', 'dental_crowns', 'dental_xray'],
  pharmacy: ['medicine_delivery'],
  family_health_center: ['vaccination'],
  diagnostic_center: ['mri', 'ultrasound', 'xray', 'mammography', 'endoscopy'],
  medical_lab: ['genetic_testing', 'paternity_test', 'std_testing'],
  rehabilitation: ['physiotherapy', 'therapeutic_exercise', 'medical_massage', 'chiropractor'],
  traditional_medicine: ['acupuncture', 'moxibustion_cupping', 'hirudotherapy'],
  eye_clinic: ['laser_eye_surgery', 'eye_exam'],
  ent_doctor: ['hearing_aids'],
  ambulance: ['private_ambulance'],
  childrens_hospital: ['pediatrician'],
  womens_clinic: ['pregnancy_care', 'fertility_clinic', 'family_planning', 'prenatal_classes'],
  maternity_hospital: ['pregnancy_care', 'postpartum_care', 'midwife_doula', 'lactation_consultant', 'prenatal_classes'],
  mental_health_center: ['psychiatrist'],
  psychologist: ['child_psychologist', 'family_counseling', 'crisis_helpline'],
  private_hospital: ['diabetes_care'],
  watch_repair: ['jewelry_repair'],
  optician: ['eyeglasses_repair'],
  bicycle_repair: ['e_scooter_repair'],
  music_instrument_shop: ['instrument_repair', 'piano_tuning', 'morin_khuur_repair'],
  plumber: ['drain_cleaning', 'water_meter', 'water_pump', 'water_tank', 'water_heater', 'pipe_thawing'],
  heating_repair: ['radiator_flushing', 'boiler_install', 'electric_heating', 'heat_pump', 'underfloor_heating'],
  electrician: ['lighting_install', 'power_connection', 'ev_charger_install'],
  cctv: ['intercom', 'smart_home'],
  internet_provider: ['home_network', 'cable_tv'],
  pvc_windows: ['window_repair', 'window_sealing', 'balcony', 'mosquito_net'],
  custom_furniture: ['furniture_assembly', 'countertops', 'furniture_repair', 'sofa_reupholstery', 'interior_design'],
  carpenter: ['staircase', 'wood_sawing'],
  welder: ['metal_fabrication', 'fence_building', 'canopy', 'stove_repair', 'blacksmith'],
  ger_assembly: ['ger_cover', 'ger_frame'],
  gardener: ['landscaping', 'tree_cutting'],
  materials: ['tools_shop'],
  driving_school: ['driving_instructor', 'motorcycle_school', 'truck_license', 'heavy_machinery_course'],
  language_school: ['russian_course', 'german_course', 'french_course', 'turkish_course', 'spanish_course', 'italian_course', 'arabic_course', 'kazakh_course', 'study_abroad'],
  english_course: ['ielts_prep'],
  korean_course: ['eps_topik'],
  private_tutor: ['math_tutoring', 'science_tutoring', 'mental_arithmetic', 'speed_reading', 'mongolian_script', 'school_readiness', 'child_development', 'kids_clubs'],
  programming_course: ['computer_literacy', 'robotics'],
  music_lessons: ['piano_lessons', 'guitar_lessons', 'violin_lessons', 'drum_lessons', 'singing_lessons', 'traditional_instrument_lessons', 'throat_singing'],
  dance_school: ['mongolian_dance', 'kpop_dance', 'ballroom_dance', 'ballet', 'belly_dance', 'pole_dance'],
  baking_course: ['cooking_course'],
  general_school: ['private_school'],
  lawyer: ['divorce_lawyer', 'criminal_lawyer', 'property_lawyer', 'labor_lawyer', 'mediation', 'debt_collection', 'company_registration', 'business_license'],
  accountant: ['tax_advisor', 'company_registration'],
  translation: ['certified_translation', 'interpreter', 'proofreading'],
  notary: ['certified_translation'],
  recruitment: ['work_abroad'],
  it_support: ['website_dev', 'app_dev', 'software_dev', 'domain_hosting', 'pos_systems'],
  marketing_agency: ['smm', 'pr_agency', 'market_research'],
  advertising_agency: ['billboard', 'smm', 'graphic_design', 'animation'],
  printing_house: ['book_printing', 'business_cards', 'banner_printing', 'sticker_printing', 'invitation_printing', 'tshirt_printing', 'mug_printing', 'graphic_design'],
  copy_print: ['bookbinding', 'business_cards'],
  sign_making: ['laser_cutting', 'engraving', 'stamp_making'],
  photographer: ['wedding_photographer', 'videographer', 'drone_filming', 'product_photography', 'video_editing', 'video_production'],
  photo_studio: ['family_photoshoot', 'graduation_photo', 'photo_restoration', 'digitizing', 'photo_printing', 'photo_book'],
  recording_studio: ['voice_over', 'song_writing', 'live_streaming'],
  land_surveying: ['cadastral'],
  real_estate_agent: ['apartment_rental', 'daily_apartment', 'office_rental', 'retail_space_rental', 'garage_rental'],
  banquet_hall: ['wedding_venue', 'corporate_party', 'graduation_party', 'anniversary_party', 'wedding_planner'],
  restaurant: ['wedding_venue', 'corporate_party', 'graduation_party', 'anniversary_party', 'catering', 'office_lunch'],
  florist: ['event_flowers', 'gift_basket', 'gift_wrapping'],
  event_decoration: ['new_year_decoration'],
  arcade: ['vr_center'],
  tea_house: ['buuz_orders'],
  mongolian_food: ['khorkhog'],
  cafe: ['bubble_tea'],
  travel_agency: ['outbound_tours', 'domestic_tours', 'visa_services', 'ereen_trips', 'horse_tours', 'camel_riding', 'fishing_tours', 'hunting_tours', 'hiking_guide', 'tour_guide', 'adventure_tours', 'train_tickets', 'visa_consultant'],
  embassy: ['visa_center', 'visa_services'],
  ger_camp: ['glamping'],
  car_rental: ['jeep_with_driver', 'wedding_cars'],
  bicycle_rental: ['scooter_rental'],
  moving: ['loaders', 'porter_truck', 'truck_rental', 'junk_removal', 'construction_waste'],
  taxi: ['airport_transfer'],
  water_delivery: ['water_truck'],
  coal_delivery: ['briquette_fuel'],
  medical_supply: ['medical_equipment_rental'],
  dry_cleaning: ['curtain_washing', 'blanket_washing', 'down_jacket_cleaning', 'leather_cleaning'],
  laundry: ['laundromat', 'curtain_washing', 'blanket_washing'],
  carpet_washing: ['sofa_cleaning', 'mattress_cleaning'],
  house_cleaning: ['deep_cleaning', 'post_renovation_cleaning', 'office_cleaning', 'window_cleaning', 'mold_removal', 'sofa_cleaning', 'housekeeper', 'facade_washing'],
  pest_control: ['disinfection'],
  bank: ['mortgage', 'leasing', 'safe_deposit'],
  pawnshop: ['gold_buying'],
  insurance: ['car_insurance', 'property_insurance', 'accident_insurance', 'cargo_insurance', 'health_insurance', 'travel_insurance'],
  civil_registration: ['marriage_registration', 'passport_office', 'property_registry'],
  public_service_center: ['emongolia_kiosk', 'criminal_record'],
  traffic_police: ['impound_lot'],
  lama_prayer: ['astrologer'],
  charity_ngo: ['clothing_donation', 'food_bank'],
  daycare: ['babysitter', 'after_school'],
  nbfi: ['loan_broker'],
  district_office: ['land_office'],
  social_insurance: ['work_capacity_commission'],
  post_office: ['international_express'],
  courier: ['international_express'],
  china_cargo: ['korea_cargo', 'turkey_europe_cargo', 'air_cargo', 'freight_forwarding'],
  fuel_station: ['lpg_refill'],
  intercity_bus: ['intercity_ride', 'bus_charter'],
  disability_support: ['disability_transport', 'special_needs_center'],
  hostel: ['luggage_storage'],
  kindergarten: ['montessori'],
  pizza: ['food_delivery'],
  fast_food: ['food_delivery'],
  cake_orders: ['tsagaan_sar_orders'],
  conference_room_rental: ['conference_organizing'],
  party_shop: ['fireworks'],
  beauty_salon: ['hairdresser_course', 'nail_course', 'makeup_course', 'beauty_course'],
  massage: ['massage_course'],
  doors: ['auto_gates'],
  ski_resort: ['ski_rental'],
  engineering_design: ['construction_supervision', 'construction_cost'],
  business_consulting: ['report_writing'],
};
const RELATED_FAMILIES: Record<string, string[]> = {};
for (const [general, specials] of Object.entries(FAMILIES)) for (const s of specials) (RELATED_FAMILIES[s] ??= []).push(general);

/** Categories whose first word misleads (forensic medicine is not a court; sound and light rental is not a photographer). */
const NO_RELATED = new Set(['forensic', 'sound_light_rental', 'tourist_info']);

export function relatedCategory(id: string, counts: Readonly<Record<string, number | undefined>>): string | null {
  const c = CATEGORIES.get(id);
  if (!c || NO_RELATED.has(id)) return null;
  const family = RELATED_FAMILIES[id]?.find((f) => (counts[f] ?? 0) > 0);
  if (family) return family;
  // The first main word names the subject in Mongolian ("Утасны дэлгэц солих", "Утас засвар"): both names must start with it.
  const head = (name: string) => [...stemsOf(name)][0];
  const mine = head(c.mn);
  let best: { id: string; n: number } | null = null;
  if (mine && SPECIFIC(mine))
    for (const other of CATEGORY_DATA) {
      const n = counts[other.id] ?? 0;
      if (other.id === id || other.group !== c.group || !n || head(other.mn) !== mine) continue;
      if (!best || n > best.n) best = { id: other.id, n };
    }
  return best?.id ?? GROUP_ANCHORS[c.group]?.find((a) => a !== id && (counts[a] ?? 0) > 0) ?? null;
}

/**
 * The AI's general answer gives way to the one specific category the user's own words name in the same group or family: "приус
 * засвар" is hybrid repair, not car repair; "хөлдсөн шугам" is pipe thawing, not plumber (whose place is then offered if the
 * specific one has none). Anything else keeps the AI's choice.
 */
export function preferNamed(chosen: string, message: string): string {
  const named = matchCategories(message);
  if (named.length !== 1 || named[0] === chosen) return chosen;
  const [specific] = named;
  const group = CATEGORIES.get(chosen)?.group;
  const general = (group && GROUP_ANCHORS[group]?.includes(chosen) && CATEGORIES.get(specific)?.group === group) || FAMILIES[chosen]?.includes(specific);
  return general ? specific : chosen;
}

/** How the customer gets the service: they go there ("visit"), the business comes to them ("callout"), or either ("both"). */
export type CategoryMode = 'visit' | 'callout' | 'both';
export const categoryMode = (id: string): CategoryMode => CATEGORIES.get(id)?.mode ?? 'visit';
