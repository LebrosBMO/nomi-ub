import { dayInUB, validDay } from './personal.ts';

/**
 * Monthly payments (PRD Section 19): rent, a loan, internet, a subscription — what the user pays every month, with the day it
 * falls on, whether this month's is paid, and the monthly total. Pure logic with the clock injected, like reminders.ts; storage
 * lives in payments-storage.ts. Amounts stay on the device: never sent to the server, never written to the activity history.
 */
export type Payment = {
  id: string;
  /** What it is, as the user typed it: "Түрээс", "Интернет". */
  name: string;
  /** Whole ₮. No other currency and no fractions: nobody pays 450,000.25₮ of rent. */
  amount: number;
  /** Day of the month it is due, 1-31. A month too short for it uses its last day. */
  day: number;
  /** The months already paid, "2026-09", oldest first. */
  paid: string[];
  createdAt: string;
};
/** `nomi:payments:v1`. Payments number themselves, like reminders: every command names its kind ("Төлбөр 3 төлсөн"). */
export type PaymentStore = { version: 1; nextId: number; items: Payment[] };
export const emptyPayments = (): PaymentStore => ({ version: 1, nextId: 1, items: [] });

export const PAYMENT_CAP = 100;
export const NAME_LIMIT = 60;
/** One payment of a billion ₮ is a typo, not a bill. */
export const MAX_AMOUNT = 1_000_000_000;
/** Months of paid history kept per payment; older ones are dropped on the next change. */
const PAID_KEEP = 24;

const AMOUNT_ERROR = 'Дүнг тоогоор бичээрэй. Жишээ: “Төлбөр нэм: түрээс 450000 5”.';
const DAY_ERROR = 'Сарын өдрийг 1-31 хооронд бичээрэй. Жишээ: “Төлбөр нэм: интернет 35000 20”.';
export const PAYMENT_HINT = 'Сарын төлбөрөө ингэж нэмээрэй: “Төлбөр нэм: түрээс 450000 5”. Жагсаалтаа “Төлбөрүүд” гэж харна.';

/** "2026-09", the Ulaanbaatar month. */
export const monthInUB = (now = new Date()) => dayInUB(now).slice(0, 7);
const daysInMonth = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
/** The day this payment falls on in `month`: the 31st becomes the 30th in April and the 28th in February. */
export const dueDate = (month: string, day: number) => `${month}-${String(Math.min(day, daysInMonth(month))).padStart(2, '0')}`;
const nextMonth = (month: string) => {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, '0')}`;
};
/** The next day this payment falls due: this month's while it is still ahead and unpaid, otherwise next month's. */
export function nextDue(payment: Payment, now = new Date()) {
  const month = monthInUB(now);
  const due = dueDate(month, payment.day);
  return !isPaid(payment, month) && due >= dayInUB(now) ? due : dueDate(nextMonth(month), payment.day);
}
/** "450,000₮". */
export const formatAmount = (amount: number) => String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '₮';

export const isPaid = (payment: Payment, month: string) => payment.paid.includes(month);
/**
 * Marks one payment paid or unpaid for `month`, the only write the helper tab makes; the "Төлбөр N төлсөн" command goes through
 * here too, so a tap and the typed command cannot drift apart. An unknown id, or a state it is already in, returns the same store.
 */
export function setPaid(store: PaymentStore, id: string, paid: boolean, month: string): PaymentStore {
  const item = store.items.find((p) => p.id === id);
  if (!item || isPaid(item, month) === paid) return store;
  const months = paid ? [...item.paid, month].slice(-PAID_KEEP) : item.paid.filter((m) => m !== month);
  return { ...store, items: store.items.map((p) => (p.id === id ? { ...p, paid: months } : p)) };
}
const byDay = (a: Payment, b: Payment) => a.day - b.day || Number(a.id) - Number(b.id);

/** Reads a saved store. A corrupt one is rejected, not silently reset (the same rule as the personal store, AC 11.4). */
export function restorePayments(raw: unknown): PaymentStore {
  const v = raw as PaymentStore;
  if (!v || v.version !== 1 || !Array.isArray(v.items) || !Number.isSafeInteger(v.nextId) || v.nextId < 1) throw new Error('Invalid payment store');
  const ids = new Set<string>();
  for (const p of v.items) {
    const valid =
      p &&
      /^\d+$/.test(p.id) &&
      Number(p.id) < v.nextId &&
      !ids.has(p.id) &&
      typeof p.name === 'string' &&
      p.name.trim().length > 0 &&
      p.name.length <= NAME_LIMIT &&
      Number.isSafeInteger(p.amount) &&
      p.amount > 0 &&
      p.amount <= MAX_AMOUNT &&
      Number.isSafeInteger(p.day) &&
      p.day >= 1 &&
      p.day <= 31 &&
      Array.isArray(p.paid) &&
      p.paid.every((month) => typeof month === 'string' && /^\d{4}-\d{2}$/.test(month) && validDay(month + '-01')) &&
      new Set(p.paid).size === p.paid.length &&
      typeof p.createdAt === 'string' &&
      Number.isFinite(Date.parse(p.createdAt));
    if (!valid) throw new Error('Invalid payment');
    ids.add(p.id);
  }
  return v;
}

/** What one month costs: everything due, what is already paid, and what is left. */
export function monthTotals(items: readonly Payment[], month: string) {
  const total = items.reduce((sum, p) => sum + p.amount, 0);
  const paid = items.filter((p) => isPaid(p, month)).reduce((sum, p) => sum + p.amount, 0);
  return { total, paid, left: total - paid };
}
/** "Энэ сар: нийт 690,000₮ · төлсөн 240,000₮ · үлдсэн 450,000₮". */
export function totalsLine(items: readonly Payment[], month: string) {
  const { total, paid, left } = monthTotals(items, month);
  return `Энэ сар: нийт ${formatAmount(total)} · төлсөн ${formatAmount(paid)} · үлдсэн ${formatAmount(left)}`;
}

/** Unpaid payments whose day has arrived or passed this month, soonest first: the plan's "Төлбөр" lines (Section 11). */
export function duePayments(items: readonly Payment[], now = new Date()): Payment[] {
  const month = monthInUB(now);
  const today = dayInUB(now);
  return items.filter((p) => !isPaid(p, month) && dueDate(month, p.day) <= today).sort(byDay);
}

/** "1. Түрээс · 450,000₮ · сар бүр 5-нд · хугацаа хэтэрсэн". */
export function describePayment(p: Payment, now = new Date()) {
  const month = monthInUB(now);
  const due = dueDate(month, p.day);
  const today = dayInUB(now);
  const state = isPaid(p, month) ? 'төлсөн' : due === today ? 'өнөөдөр төлөх' : due < today ? 'хугацаа хэтэрсэн' : 'төлөөгүй';
  return `${p.id}. ${p.name} · ${formatAmount(p.amount)} · сар бүр ${p.day}-нд · ${state}`;
}

/** Which store change a command made, by id only, for the activity history (Section 10); the name and the amount never go there. */
export type PaymentAction = { kind: 'payment_add' | 'payment_paid' | 'payment_unpaid' | 'payment_delete'; id: string };
export type PaymentResult = { store: PaymentStore; reply: string; changed: boolean; action?: PaymentAction };

/**
 * The payment commands: `Төлбөр нэм: <нэр> <дүн> <өдөр>`, `Төлбөрүүд`, `Төлбөр N төлсөн`, `Төлбөр N төлөөгүй`, `Төлбөр N устга`,
 * and `Сарын нийт`, with the Latin command words `tulbur nem`, `tulburuud`, `tulbur N tulsun|ustga`. Null for anything else, so
 * `handlePersonal` gets its turn. Nothing here reaches the network.
 */
export function handlePayments(input: string, store: PaymentStore, now = new Date()): PaymentResult | null {
  const text = input.trim();
  const normalized = text.toLowerCase().replace(/[?!.]+$/, '').trim();
  const month = monthInUB(now);
  const result = (reply: string, next = store, action?: PaymentAction): PaymentResult => ({
    store: next,
    reply,
    changed: next !== store,
    ...(action ? { action } : {}),
  });

  if (/^(төлбөрүүд|миний төлбөрүүд|сарын төлбөр|төлбөр|tulburuud|tulbur)$/.test(normalized)) {
    if (!store.items.length) return result('Одоогоор бүртгэсэн төлбөр алга. “Төлбөр нэм: түрээс 450000 5” гэж нэмээрэй.');
    const sorted = [...store.items].sort(byDay);
    const rows = sorted.map((p) => describePayment(p, now));
    // The example names the first one still unpaid; with everything paid there is nothing to suggest.
    const next = sorted.find((p) => !isPaid(p, month));
    return result(`${rows.join('\n')}\n\n${totalsLine(store.items, month)}${next ? `\nТөлсөн бол “Төлбөр ${next.id} төлсөн” гэж бичээрэй.` : ''}`);
  }
  if (/^(сарын нийт|нийт төлбөр|энэ сар хэд төлөх вэ|энэ сарын төлбөр)$/.test(normalized)) {
    if (!store.items.length) return result('Одоогоор бүртгэсэн төлбөр алга. “Төлбөр нэм: түрээс 450000 5” гэж нэмээрэй.');
    return result(totalsLine(store.items, month));
  }

  let match = text.match(/^(?:төлбөр нэм|tulbur nem)\s*:\s*(.+)$/isu);
  if (match) {
    // Name, then the amount, then the day of the month: "түрээс 450000 5", "интернет 35,000₮ сар бүр 20-нд".
    const parts = match[1].trim().match(/^(.+?)\s+(\d[\d.,\s]*?)\s*(?:₮|төг|төгрөг)?\s*(?:сар\s*бүр\s+)?(\d{1,2})\s*(?:-[^\s]*)?$/iu);
    if (!parts) return result(`Ойлгосонгүй. ${PAYMENT_HINT}`);
    const name = parts[1].trim().replace(/[:,]$/, '');
    const amount = Number(parts[2].replace(/[.,\s]/g, ''));
    const day = Number(parts[3]);
    if (!name) return result(`Ойлгосонгүй. ${PAYMENT_HINT}`);
    if (name.length > NAME_LIMIT) return result(`Төлбөрийн нэрийг ${NAME_LIMIT} тэмдэгтэд багтаагаарай.`);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) return result(AMOUNT_ERROR);
    if (!Number.isSafeInteger(day) || day < 1 || day > 31) return result(DAY_ERROR);
    const duplicate = store.items.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (duplicate) return result(`“${duplicate.name}” нэртэй төлбөр ${duplicate.id} дугаартайгаар бүртгэлтэй байна. Өөрчлөх бол эхлээд “Төлбөр ${duplicate.id} устга” гэж бичээрэй.`);
    if (store.items.length >= PAYMENT_CAP) return result(`${PAYMENT_CAP} төлбөр бүртгэсэн байна. Хэрэггүйгээ устгаад нэмээрэй.`);
    const id = String(store.nextId);
    const item: Payment = { id, name, amount, day, paid: [], createdAt: now.toISOString() };
    return result(
      `Төлбөр ${id} нэмлээ: ${name} · ${formatAmount(amount)} · сар бүр ${day}-нд.${day > 28 ? '\nБогино сард сүүлийн өдрөөр тооцно.' : ''}\nТөлсөн бол “Төлбөр ${id} төлсөн” гэж бичээрэй. Зөвхөн энэ утсанд хадгалагдана.`,
      { version: 1, nextId: store.nextId + 1, items: [...store.items, item] },
      { kind: 'payment_add', id }
    );
  }

  match = text.match(/^(?:төлбөр|tulbur)\s+(\d+)(?:-ийг|-ыг|-г)?\s+(төлсөн|төлөөгүй|устга|tulsun|tuluugui|ustga)[.!]?$/iu);
  if (match) {
    const id = match[1];
    const verb = match[2].toLowerCase();
    const item = store.items.find((p) => p.id === id);
    if (!item) return result(`${id} дугаартай төлбөр олдсонгүй.`);
    if (['устга', 'ustga'].includes(verb)) {
      return result(`Төлбөр ${id} (${item.name})-г устгалаа.`, { ...store, items: store.items.filter((p) => p.id !== id) }, { kind: 'payment_delete', id });
    }
    const paid = ['төлсөн', 'tulsun'].includes(verb);
    if (paid === isPaid(item, month)) {
      return result(paid ? `Төлбөр ${id} (${item.name})-г энэ сард төлсөн гэж аль хэдийн тэмдэглэсэн байна.` : `Төлбөр ${id} (${item.name}) энэ сард төлөөгүй хэвээр байна.`);
    }
    const next = setPaid(store, id, paid, month);
    return result(
      `${paid ? `Төлбөр ${id} (${item.name})-г төлсөн гэж тэмдэглэлээ.` : `Төлбөр ${id} (${item.name})-г төлөөгүй болголоо.`}\n${totalsLine(next.items, month)}`,
      next,
      { kind: paid ? 'payment_paid' : 'payment_unpaid', id }
    );
  }

  if (/^(?:төлбөр|tulbur)(\s|:|$)/i.test(text)) return result(`Яг юу өөрчлөхийг сайн ойлгосонгүй. Юу ч хадгалаагүй. ${PAYMENT_HINT}`);
  return null;
}
