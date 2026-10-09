import { askAssistant, AssistantError, type AssistantReply } from './assistant-api.ts';
import { closingMinutes, findOnCall, findPlaces, inCategory, interpretLocal, landmarkQuery, openAtNight, validateIntent, wantsNight, type Category, type Intent, type Place } from './core.ts';
import {
  countLocated,
  knownLocationLine,
  LOCATED_STEP,
  LOCATING_STATUS,
  LOCATION_DENIED_LINE,
  LOCATION_FAILED_STEP,
  LOCATION_QUESTION,
  MOBILE_SERVICE,
  NOT_SORTED_LINE,
  type Coordinates,
  type LocationMode,
} from './location.ts';
import { handleBoxes, type BoxAction, type BoxStore } from './boxes.ts';
import { handlePayments, type PaymentAction, type PaymentStore } from './payments.ts';
import { handlePersonal, type PersonalAction, type PersonalState } from './personal.ts';
import {
  attachNotification,
  CANCELLED_STEP,
  CANCELLING_STATUS,
  handleReminders,
  PERMISSION_DENIED_STEP,
  PERMISSION_GRANTED_STEP,
  PERMISSION_STATUS,
  REMINDER_DENIED_LINE,
  REMINDER_EXPLANATION,
  REMINDER_FAILED_LINE,
  REMINDER_SET_LINE,
  REMINDER_WEB_LINE,
  SCHEDULE_FAILED_STEP,
  SCHEDULED_STEP,
  SCHEDULING_STATUS,
  type NotificationAdapter,
  type ReminderAction,
  type ReminderResult,
  type ReminderStore,
} from './reminders.ts';
import { categoryMode, categoryName, relatedCategory } from './category-match.ts';
import { HOSTED_API_URL } from './hosted.ts';
import { hostedAsk, memoryInstallKeys, type InstallKeyStore } from './install.ts';
import { aiStatus, type LocalState } from './storage.ts';
import type { ServerDaily, TokenUsage } from './usage.ts';

/** The server accepts at most this many characters per request (server/index.ts); the composer stops at the same point. */
export const MESSAGE_LIMIT = 1000;
export const LENGTH_HINT = '1000 тэмдэгтэд багтаана уу.';
/** Each live step stays on screen at least this long so it can be read. */
export const STEP_MS = 600;
export const FALLBACK_STEP = 'Энгийн хайлт руу шилжлээ';
export const FALLBACK_LINE = 'AI холбогдсонгүй тул энгийн хайлтаар хариуллаа.';
export const DAILY_LIMIT_LINE = 'Өнөөдрийн AI хязгаар дууссан. Энгийн хайлт ажиллана.';
const FALLBACK_STATUS = 'Энгийн хайлт руу шилжиж байна';
/** Paired, but the AI disclosure has not been agreed to (Section 8): the phone answered and nothing was sent. */
/**
 * A night search ("шөнө ажилладаг эмийн сан") shows only places whose own hours say they are open past midnight or around the
 * clock. None in the district: the whole city. None anywhere: the latest-closing ones, and the reply says so. Hours are claims.
 */
export const NIGHT_LINE = 'Шөнө ажилладаг (24 цаг эсвэл шөнө дундаас хойш) гэж бичсэн газрууд. Цаг нь баталгаажаагүй тул утсаар лавлаарай.';
export const nightWiderLine = (district: string) =>
  `${district}-д шөнө ажилладаг гэж бичсэн газар олдсонгүй. Хотын бусад хэсэгт эдгээр байна. Цаг нь баталгаажаагүй тул утсаар лавлаарай.`;
/** A district with none of the category: the rest of the city instead. */
export const widerLine = (district: string) => `${district}-д олдсонгүй. Хотын бусад хэсгээс эдгээрийг оллоо. Очихоосоо өмнө утсаар лавлаарай.`;
/** Cards shown at once, and how many more a "Дахиад N харах" button reveals. */
export const SHOWN = 3;
export const MORE = 5;
/**
 * The reply for businesses that come to the customer (plumbers, towing, catering): which district they come to, or how to see
 * those first; at night, whether any say they work then. Their own address does not matter, so there is no distance.
 */
export const onCallLine = (district: string | null, serving: number, night?: NightResult) =>
  (district
    ? serving
      ? `${district}-д очиж үйлчилдэг эдгээрийг оллоо.`
      : `${district}-д очдог гэж тодорхой бичсэн газар алга. Эдгээр нь хотын бусад хэсэгт байдаг ч танайд очиж магадгүй.`
    : 'Танай хаяг дээр очиж үйлчилдэг эдгээрийг оллоо. Дүүргээ бичвэл тэнд очдогийг эхэнд гаргана.') +
  (night === 'found' ? ' Шөнө ажилладаг гэж бичсэн нь эдгээр.' : night === 'none' ? ' Шөнө ажилладаг гэж бичсэн нь алга.' : '') +
  ' Залгаад хаяг, цагаа тохироорой.';
/** A category Nomi has no place for yet: said plainly, instead of blaming the district. */
/** A category with no place of its own, answered with a related one that may offer it. */
export const relatedLine = (name: string, related: string) =>
  `${name}: тусгайлан бүртгэсэн газар алга. ${related} энэ үйлчилгээг үзүүлдэг байж магадгүй тул утсаар асуугаарай.`;
export const emptyCategoryLine = (name: string) => `${name}: одоогоор Nomi-д бүртгэлтэй газар алга. Мэдээллийг удахгүй нэмнэ.`;
export const NO_NIGHT_LINE = 'Шөнө ажилладаг гэж бичсэн газар олдсонгүй. Хамгийн орой хаадгийг харууллаа.';
type NightResult = 'found' | 'wider' | 'none';
export const CONSENT_LINE = 'AI-г зөвшөөрөөгүй тул энэ утсан дээрх энгийн хайлтаар хариуллаа.';
/** The answers under CONSENT_LINE, once per session: the first opens the disclosure, where the actual consent is given. */
export const CONSENT_CHOICES = [
  { key: 'open', label: 'AI-г холбох' },
  { key: 'later', label: 'Одоо биш' },
] as const;
export type ConsentChoice = (typeof CONSENT_CHOICES)[number]['key'];

const GREETING = /^(сайн\s*уу|сайн\s*байна\s*уу|sain\s*(uu|baina\s*uu)|hello|hi)[!?.\s]*$/i;
const GREETING_REPLY =
  'Сайн уу! Хийх ажлаа бүртгүүлж, төлөвлөгөөгөө харж, хэрэгтэй зүйлээ надад хадгалуулж болно. “Тусламж” гэж бичвэл жишээ гарна.\n\nAI-г хараахан холбоогүй тул одоохондоо тодорхой хэлбэрийн хүсэлтүүд ажиллана.';
/** The search step's wording; a category without its own phrase uses its name: "Шүдний эмнэлэг: 14 газраас хайж байна". */
const SEARCHING_IN: Partial<Record<Category, string>> = {
  pharmacy: 'эмийн сангаас',
  tire: 'дугуй засварын газраас',
  materials: 'барилгын материалын дэлгүүрээс',
};

/** The paired assistant. Injected so tests can fail it, cap it or answer with garbage. */
export type Ask = (message: string, previous?: Intent) => Promise<AssistantReply>;

/**
 * The assistant the chat may call: only with a server and the user's agreement to the AI disclosure (AC 8.2). Without both there
 * is no `ask` at all, so no request can reach the server. A server paired by hand in Settings comes first; otherwise Nomi's
 * hosted one, with this install's key (install.ts). `fetchImpl` and `installKeys` are injected by tests.
 */
export function assistantFor(
  settings: Pick<LocalState, 'apiUrl' | 'token' | 'aiConsentAt' | 'aiConsentFor'>,
  fetchImpl?: typeof fetch,
  installKeys: InstallKeyStore = memoryInstallKeys()
): Ask | undefined {
  if (aiStatus(settings) !== 'on') return undefined;
  if (!settings.apiUrl || !settings.token) return hostedAsk(HOSTED_API_URL, installKeys, fetchImpl);
  const server = { apiUrl: settings.apiUrl, token: settings.token };
  return (message, previous) => askAssistant(server, message, previous, fetchImpl);
}

/** Where a nearby search gets the phone's position (Section 7). The chat provides both; tests inject fixed answers. */
export type LocationAccess = {
  /**
   * Consulted once per nearby search, before any step and without any prompt: 'ask' makes the reply the in-chat question,
   * 'use' calls `position`, 'off' searches without distance and says so.
   */
  mode: () => LocationMode | Promise<LocationMode>;
  /** One fix, or null when the system refused or no fix came in time. Called only after `mode` said 'use'; used for this search and dropped. */
  position: () => Promise<Coordinates | null>;
};

export type UnderstandOptions = {
  places: Place[];
  personal: PersonalState;
  savePersonal: (state: PersonalState) => Promise<unknown>;
  reminders: ReminderStore;
  saveReminders: (store: ReminderStore) => Promise<unknown>;
  payments: PaymentStore;
  savePayments: (store: PaymentStore) => Promise<unknown>;
  boxes: BoxStore;
  saveBoxes: (store: BoxStore) => Promise<unknown>;
  /** The phone's notification calls for reminders (Section 13). Absent, or `supported: false`, on web: reminders go to the plan only. */
  notifications?: NotificationAdapter;
  /** Posts one line before the very first notification permission prompt, so the user knows what it is for. */
  onExplain?: (text: string) => void;
  /** Undefined when no server is paired or the AI is not agreed to: the offline parser answers directly. */
  ask?: Ask;
  /**
   * Paired without the AI consent, and not yet asked this session (Section 8). Without `ask`, a request that would have gone to the
   * AI is answered offline, the reply starts with CONSENT_LINE and `question` is 'consent'. Personal commands are unaffected.
   */
  askConsent?: boolean;
  previous?: Intent;
  /** Places this device reported as wrong (Section 6). They rank last among the matches, so a fresh record takes the card. */
  reported?: ReadonlySet<string>;
  /** Absent: a nearby search runs without distance and says so. */
  location?: LocationAccess;
  /** Skips understanding and searches this intent: the chat resumes a nearby request this way once the location question is answered, so the assistant is never asked twice. */
  intent?: Intent;
  /** Receives each live step label as it starts. */
  onStatus?: (label: string) => void;
  stepMs?: number;
};

export type Understanding = {
  text: string;
  /** Catalog ids of the cards to show, on the search path only. */
  places?: string[];
  /** Up to five more matches in the same order, behind a "Дахиад N харах" button. */
  more?: string[];
  /** For a service both shops and come-to-you businesses offer (tire repair): businesses that come to the customer, shown in their own section. */
  comes?: string[];
  /** True when the whole answer is businesses that come to the customer: the cards lead with the call button instead of the map. */
  oncall?: boolean;
  intent?: Intent;
  steps: string[];
  ms: number;
  tokens?: TokenUsage;
  daily?: ServerDaily;
  /** True when the server answered at all, even with an intent that was then rejected. */
  aiUsed: boolean;
  /** The personal store after this request; identical to the input unless a command changed it. */
  personal: PersonalState;
  /** The reminder store after this request, likewise. */
  reminders: ReminderStore;
  /** The payment store after this request, likewise. */
  payments: PaymentStore;
  /** The box store after this request, likewise. */
  boxes: BoxStore;
  /** The store change a personal or reminder command made, by id, once it has been saved. For the activity history; never the task, memory or reminder text. */
  action?: PersonalAction | ReminderAction | PaymentAction | BoxAction;
  /**
   * Set when the reply is a question the chat answers with buttons: 'location' asks whether the phone's position may be used,
   * 'consent' offers the AI disclosure after an offline answer.
   */
  question?: 'location' | 'consent';
  /** Kilometres from the phone to each card's place (null without coordinates), only when a position was used. For this session's cards; never saved. */
  distances?: Record<string, number | null>;
};

type Found = ReturnType<typeof findPlaces>[number];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** How many places each category has, own and also-offered, computed once per catalog. */
const countCache = new WeakMap<readonly Place[], Record<string, number>>();
function countsFor(places: readonly Place[]) {
  let counts = countCache.get(places);
  if (!counts) {
    counts = {};
    for (const p of places) for (const c of [p.category, ...(p.alsoCategories ?? [])]) counts[c] = (counts[c] ?? 0) + 1;
    countCache.set(places, counts);
  }
  return counts;
}

/** `known`: how many places of the category have coordinates, given only when the search used a position. */
function describeSearch(text: string, intent: Intent, found: readonly Place[], known?: number, night?: NightResult) {
  if (night === 'wider' && intent.district) return nightWiderLine(intent.district);
  let answer = found.length
    ? `${intent.district ? intent.district + '-ээс ' : ''}эдгээр газрыг оллоо. Очихоосоо өмнө утсаар лавлаарай.`
    : 'Энэ байршилд тохирох газар олдсонгүй. Өөр дүүрэг эсвэл ойролцоох газраа хэлнэ үү.';
  // A located search says how much of the category has a pin; one without a position says the order is not by distance.
  if (intent.nearby && found.length) answer += ' ' + (known === undefined ? NOT_SORTED_LINE : knownLocationLine(known));
  if (night && found.length) answer += ' ' + (night === 'found' ? NIGHT_LINE : NO_NIGHT_LINE);
  else if (intent.openNow) answer += ' Яг одоо нээлттэй эсэх нь баталгаажаагүй.';
  if (/үнэ|хямд|hyamd|төсөв|\d+\s*(к|k|₮|төг|мян)/i.test(text)) answer += ' Баталгаатай үнийн мэдээлэл байхгүй.';
  return answer;
}

/** Which one line tells the user why the offline parser answered. Only the server's daily cap gets its own wording. */
function fallbackLine(error: unknown) {
  return error instanceof AssistantError && error.status === 429 && error.code !== 'rate_limit' ? DAILY_LIMIT_LINE : FALLBACK_LINE;
}

/**
 * Understand one request and gather the reply: personal commands first (never sent anywhere), then the paired
 * assistant when there is one, then the catalog search. Any AI failure falls back to the offline parser and says so.
 * A nearby search asks for the position in chat first (Section 7); the chat resumes it with `intent` once answered.
 */
export async function understand(text: string, opts: UnderstandOptions): Promise<Understanding> {
  const { places, ask, previous, stepMs = STEP_MS } = opts;
  const started = Date.now();
  const steps: string[] = [];
  let personal = opts.personal;
  let reminders = opts.reminders;
  let payments = opts.payments;
  let boxes = opts.boxes;
  let tokens: TokenUsage | undefined;
  let daily: ServerDaily | undefined;
  let aiUsed = false;

  // Each step names real work and stays on screen at least stepMs so it can be read.
  // A null done-label keeps the step out of the summary.
  async function stage<T>(active: string, work: () => T | Promise<T>, done: (value: T) => string | null): Promise<T> {
    opts.onStatus?.(active);
    const [value] = await Promise.all([Promise.resolve().then(work), wait(stepMs)]);
    const label = done(value);
    if (label) steps.push(label);
    return value;
  }
  // Set once a request that would have gone to the AI was kept on the phone for want of consent.
  let consent = false;
  const finish = (reply: Pick<Understanding, 'text' | 'places' | 'more' | 'comes' | 'oncall' | 'intent' | 'action' | 'question' | 'distances'>): Understanding => ({
    ...reply,
    question: reply.question ?? (consent ? 'consent' : undefined),
    steps,
    ms: Date.now() - started,
    tokens,
    daily,
    aiUsed,
    personal,
    reminders,
    payments,
    boxes,
  });

  /**
   * The phone side of a reminder command (Section 13): the permission prompt, once, with its one-line explanation before it; the
   * notification itself; and one save of the store with the outcome. A refusal, the web, or a failed call all keep the reminder in
   * the plan and say so in the reply.
   */
  async function applyReminder(command: ReminderResult): Promise<Pick<Understanding, 'text' | 'action'>> {
    const adapter = opts.notifications;
    let store = command.store;
    let notificationId: string | null = null;
    let line = '';
    const item = command.schedule ? store.items.find((r) => r.id === command.schedule) : undefined;
    if (item) {
      if (!adapter?.supported) line = REMINDER_WEB_LINE;
      else {
        let allowed = await adapter.granted().catch(() => false);
        if (!allowed) {
          opts.onExplain?.(REMINDER_EXPLANATION);
          allowed = await stage(PERMISSION_STATUS, () => adapter.request().catch(() => false), (value) => (value ? PERMISSION_GRANTED_STEP : PERMISSION_DENIED_STEP));
        }
        if (allowed) {
          notificationId = await stage(SCHEDULING_STATUS, () => adapter.schedule(item).catch(() => null), (value) => (value ? SCHEDULED_STEP : SCHEDULE_FAILED_STEP));
          line = notificationId ? REMINDER_SET_LINE : REMINDER_FAILED_LINE;
        } else line = REMINDER_DENIED_LINE;
      }
      store = attachNotification(store, item.id, notificationId);
    }
    if (command.cancel && adapter?.supported) {
      const notification = command.cancel;
      await stage(CANCELLING_STATUS, () => adapter.cancel(notification).catch(() => {}), () => CANCELLED_STEP);
    }
    if (command.changed) {
      try {
        await stage('Хадгалж байна', () => opts.saveReminders(store), () => 'Энэ утсанд хадгаллаа');
      } catch (error) {
        // Nothing may fire for a reminder that was never saved.
        if (notificationId && adapter) adapter.cancel(notificationId).catch(() => {});
        throw error;
      }
      reminders = store;
    }
    return { text: line ? command.reply + '\n' + line : command.reply, action: command.changed ? command.action : undefined };
  }

  let parsed: Intent | undefined = opts.intent;
  let fallback = '';
  if (!parsed) {
    // Reminder commands first, then payments, then the other personal commands; none of them ever leaves the device.
    const command = await stage(
      'Хүсэлтийг ойлгож байна',
      () => {
        const reminder = handleReminders(text, reminders, personal, new Date(), payments.items);
        if (reminder) return { reminder };
        const payment = handlePayments(text, payments, new Date());
        if (payment) return { payment };
        const box = handleBoxes(text, boxes, new Date());
        return box ? { box } : { personal: handlePersonal(text, personal, new Date(), reminders.items, payments.items) };
      },
      (value) => (value.reminder || value.payment || value.box || value.personal || !ask ? 'Хүсэлтийг ойлголоо' : null)
    );
    if (command.reminder) return finish(await applyReminder(command.reminder));
    if (command.payment) {
      const paymentResult = command.payment;
      if (paymentResult.changed) {
        await stage('Хадгалж байна', () => opts.savePayments(paymentResult.store), () => 'Энэ утсанд хадгаллаа');
        payments = paymentResult.store;
      }
      return finish({ text: paymentResult.reply, action: paymentResult.changed ? paymentResult.action : undefined });
    }
    if (command.box) {
      const boxResult = command.box;
      if (boxResult.changed) {
        await stage('Хадгалж байна', () => opts.saveBoxes(boxResult.store), () => 'Энэ утсанд хадгаллаа');
        boxes = boxResult.store;
      }
      return finish({ text: boxResult.reply, action: boxResult.changed ? boxResult.action : undefined });
    }
    const personalResult = command.personal;
    if (personalResult) {
      if (personalResult.changed) {
        await stage('Хадгалж байна', () => opts.savePersonal(personalResult.state), () => 'Энэ утсанд хадгаллаа');
        personal = personalResult.state;
      }
      return finish({ text: personalResult.reply, action: personalResult.changed ? personalResult.action : undefined });
    }

    if (ask) {
      let answered: { reply: AssistantReply; intent?: Intent } | undefined;
      try {
        answered = await stage(
          'AI бодож байна',
          async () => {
            const reply = await ask(text, previous);
            try {
              return { reply, intent: validateIntent(reply.intent) };
            } catch {
              return { reply };
            }
          },
          (value) => (value.intent ? 'AI хүсэлтийг задаллаа' : null)
        );
      } catch (error) {
        fallback = fallbackLine(error);
      }
      if (answered) {
        aiUsed = true;
        tokens = answered.reply.tokens;
        daily = answered.reply.daily;
        if (answered.intent) parsed = answered.intent;
        else fallback = FALLBACK_LINE;
      }
    } else if (opts.askConsent) consent = true;
    if (!ask || fallback) {
      // The offline path: the same parser the unpaired app uses. A greeting keeps its fixed reply.
      const offline = () => (GREETING.test(text) ? undefined : interpretLocal(text, previous));
      parsed = fallback ? await stage(FALLBACK_STATUS, offline, () => FALLBACK_STEP) : offline();
    }
  }
  const withFallback = (answer: string) => {
    const lead = fallback || (consent ? CONSENT_LINE : '');
    return lead ? lead + '\n\n' + answer : answer;
  };

  let answer = GREETING_REPLY;
  let found: Found[] = [];
  let extra: Found[] = [];
  let comes: string[] | undefined;
  let oncall = false;
  let distances: Understanding['distances'];
  if (parsed?.action === 'search' && parsed.category) {
    // A category with no place of its own searches the closest related one that has places (relatedCategory).
    const asked = parsed.category;
    const related = places.some((p) => inCategory(p, asked)) ? null : relatedCategory(asked, countsFor(places));
    const category = related ?? asked;
    const { district } = parsed;
    // How the customer gets the service: a business that comes to them needs no position, only the district to come to.
    const mode = categoryMode(category);
    let location: Coordinates | null = null;
    // A search that says neither where (a district or a landmark) nor "near me" still needs a where: it is treated as a nearby
    // search, so the phone's position is asked for (or used, once allowed), and without one the user is asked for the district.
    if (mode !== 'callout' && (parsed.nearby || (!district && !landmarkQuery(text)))) {
      // The position is asked for in chat first, used for this one search and never kept (Section 7).
      const access = opts.location;
      const mode = access ? await access.mode() : 'off';
      if (mode === 'ask') return finish({ text: withFallback(LOCATION_QUESTION), intent: parsed, question: 'location' });
      if (mode === 'use' && access) {
        location = await stage(LOCATING_STATUS, () => access.position().catch(() => null), (value) => (value ? LOCATED_STEP : LOCATION_FAILED_STEP));
      }
      // Without a position and without a district there is nothing sensible to rank: ask for the district instead.
      if (!location && !district) return finish({ text: withFallback(LOCATION_DENIED_LINE), intent: parsed, places: [] });
    }
    const count = places.filter((p) => inCategory(p, category)).length;
    const pool = SEARCHING_IN[category] ? `${count} ${SEARCHING_IN[category]}` : `${categoryName(category)}: ${count} газраас`;
    const night = wantsNight(text);
    let nightResult: NightResult | undefined;
    let widened = false;
    let serving = 0;
    const reported = opts.reported;
    found = await stage(
      pool + ' хайж байна',
      () => {
        if (mode === 'callout') {
          // Those that come to the district first; at night only those that say they work at night, when there are any.
          let ranked = findOnCall(places, { category, district });
          serving = ranked.filter((p) => p.serves).length;
          if (night) {
            const open = ranked.filter((p) => openAtNight(p.hoursClaim));
            nightResult = open.length ? 'found' : 'none';
            if (open.length) ranked = open;
          }
          if (reported?.size) ranked.sort((a, b) => Number(reported.has(a.id)) - Number(reported.has(b.id)));
          return ranked.slice(0, SHOWN + MORE);
        }
        // Where shops and come-to-you businesses both offer it, this list is the shops; the others get their own section below.
        const here = (d: string | null) => findPlaces(places, { category, district: d, query: landmarkQuery(text), location }).filter((p) => mode !== 'both' || !p.qualityFlags.includes(MOBILE_SERVICE));
        let ranked = here(district);
        // None in the district named: the rest of the city, nearest first with a position, and the reply says so.
        if (!night && !ranked.length && district) {
          ranked = here(null);
          widened = ranked.length > 0;
        }
        if (night) {
          // Only places open at night; nearest first with a position, otherwise 24-hour places first.
          const byClosing = (list: Found[]) => (location ? list : [...list].sort((a, b) => (closingMinutes(b.hoursClaim) ?? -1) - (closingMinutes(a.hoursClaim) ?? -1)));
          let open = ranked.filter((p) => openAtNight(p.hoursClaim));
          nightResult = 'found';
          if (!open.length && district) {
            open = here(null).filter((p) => openAtNight(p.hoursClaim));
            nightResult = 'wider';
          }
          if (open.length) ranked = byClosing(open);
          else {
            ranked = byClosing(ranked);
            nightResult = 'none';
          }
        }
        // Stable sort: reported places keep their order among themselves but move behind the rest.
        if (reported?.size) ranked.sort((a, b) => Number(reported.has(a.id)) - Number(reported.has(b.id)));
        return ranked.slice(0, SHOWN + MORE);
      },
      () => pool + ' хайлаа'
    );
    // Three cards first, the next five behind a button.
    extra = found.slice(SHOWN);
    found = found.slice(0, SHOWN);
    if (mode === 'both') {
      // Shops and come-to-you businesses both offer it (tire repair): the ones that come to the customer get their own section.
      const shown = new Set([...found, ...extra].map((p) => p.id));
      comes = findOnCall(places, { category, district })
        .filter((p) => p.qualityFlags.includes(MOBILE_SERVICE) && p.serves && !shown.has(p.id))
        .slice(0, SHOWN)
        .map((p) => p.id);
    }
    answer = related && count
      ? relatedLine(categoryName(asked), categoryName(related)) + (widened && district ? ` ${district}-д байхгүй тул хотын бусад хэсгээс.` : '')
      : !count
      ? emptyCategoryLine(categoryName(category))
      : mode === 'callout'
      ? onCallLine(district, serving, nightResult)
      : widened && district
        ? widerLine(district)
        : describeSearch(text, parsed, found, location ? countLocated(places, category) : undefined, nightResult);
    if (location) distances = Object.fromEntries([...found, ...extra].map((p) => [p.id, p.distance]));
    oncall = mode === 'callout';
  } else if (parsed) {
    answer = parsed.clarification || 'Хүсэлтээ арай тодруулж хэлнэ үү.';
  }
  return finish({
    text: withFallback(answer),
    places: found.map((p) => p.id),
    ...(extra.length ? { more: extra.map((p) => p.id) } : {}),
    ...(comes?.length ? { comes } : {}),
    ...(oncall ? { oncall } : {}),
    intent: parsed,
    distances,
  });
}
