import { formatAmount, monthInUB } from './payments.ts';
import { dayInUB } from './personal.ts';

/**
 * Бүртгэл — the user's own boxes (PRD Section 21). A box is a small log the user keeps about one part of their life: what they
 * spend, later their blood pressure or their car's services. Each box has a definition (name, fields, how it is summed up) and its
 * entries. Today the only definition comes from a built-in template (spending); the later step lets the AI propose a definition
 * from a sentence, which code validates against these same types before anything is saved. Stays on the device; nothing in a box
 * is ever sent to the server or written to the activity history except ids.
 */
export type BoxTemplate = 'spending';
export type BoxDef = {
  id: string;
  template: BoxTemplate;
  /** Shown as the section title: "Зардал". */
  name: string;
  /** The category choices offered when adding an entry; the user may type others. */
  categories: string[];
  createdAt: string;
};
export type BoxEntry = {
  id: string;
  /** Whole ₮. */
  amount: number;
  category: string;
  note?: string;
  /** The Ulaanbaatar day it counts for: "2026-10-01". */
  day: string;
  createdAt: string;
};
export type Box = { def: BoxDef; entries: BoxEntry[] };
/** `nomi:boxes:v1`. One sequence numbers both boxes and entries; every command names which it means. */
export type BoxStore = { version: 1; nextId: number; boxes: Box[] };
export const emptyBoxes = (): BoxStore => ({ version: 1, nextId: 1, boxes: [] });

export const BOX_CAP = 20;
/** Entries kept per box; the oldest go first once a box is full. */
export const ENTRY_CAP = 2000;
export const MAX_ENTRY = 100_000_000;
const NOTE_LIMIT = 120;
const CATEGORY_LIMIT = 30;

/** The ready-made boxes the user can add with one tap. Only spending for now; health, car and family come next. */
export const TEMPLATES: Record<BoxTemplate, { name: string; categories: string[] }> = {
  spending: { name: 'Зардал', categories: ['Хоол', 'Унаа', 'Дэлгүүр', 'Эрүүл мэнд', 'Зугаа', 'Бусад'] },
};
/** Words people write instead of the category name: "такси" is transport, "кофе" is food. */
const ALIASES: Record<string, string> = {
  хоол: 'Хоол',
  кофе: 'Хоол',
  цай: 'Хоол',
  ресторан: 'Хоол',
  унаа: 'Унаа',
  такси: 'Унаа',
  автобус: 'Унаа',
  бензин: 'Унаа',
  шатахуун: 'Унаа',
  дэлгүүр: 'Дэлгүүр',
  хүнс: 'Дэлгүүр',
  хувцас: 'Дэлгүүр',
  эм: 'Эрүүл мэнд',
  эмнэлэг: 'Эрүүл мэнд',
  'эрүүл мэнд': 'Эрүүл мэнд',
  кино: 'Зугаа',
  зугаа: 'Зугаа',
  бусад: 'Бусад',
};

export const SPENDING_HINT = 'Зардлаа ингэж бичээрэй: “Зардал: 15000 хоол” эсвэл “8000₮ такси”.';

export const spendingBox = (store: BoxStore) => store.boxes.find((b) => b.def.template === 'spending');

/** "15000", "15,000", "15 000" stays one token only without spaces; "15к" / "15k" is fifteen thousand. NaN for anything else. */
export function parseAmount(raw: string): number {
  const m = raw.trim().toLowerCase().match(/^(\d[\d.,]*)\s*(к|k|мянга|мян)?\s*(₮|төгрөг|төг)?$/u);
  if (!m) return NaN;
  const base = Number(m[1].replace(/[.,]/g, ''));
  return m[2] ? base * 1000 : base;
}

/** The category a word stands for: a known name or alias, else null so the caller files it under "Бусад" with the word kept as a note. */
export function categoryOf(word: string, categories: readonly string[]): string | null {
  const w = word.trim().toLowerCase();
  if (!w) return null;
  const named = categories.find((c) => c.toLowerCase() === w);
  return named ?? ALIASES[w] ?? null;
}

const validDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) === day;

/** Reads a saved store. A corrupt one is rejected, not silently emptied (the same rule as the other personal stores). */
export function restoreBoxes(raw: unknown): BoxStore {
  const v = raw as BoxStore;
  if (!v || v.version !== 1 || !Array.isArray(v.boxes) || !Number.isSafeInteger(v.nextId) || v.nextId < 1) throw new Error('Invalid box store');
  const ids = new Set<string>();
  const id = (x: string) => {
    if (typeof x !== 'string' || !/^\d+$/.test(x) || Number(x) >= v.nextId || ids.has(x)) throw new Error('Invalid id');
    ids.add(x);
  };
  for (const box of v.boxes) {
    const d = box?.def;
    if (!d || !(d.template in TEMPLATES) || typeof d.name !== 'string' || !d.name.trim() || !Array.isArray(d.categories) || !Array.isArray(box.entries)) throw new Error('Invalid box');
    if (!d.categories.every((c) => typeof c === 'string' && c.trim() && c.length <= CATEGORY_LIMIT) || !Number.isFinite(Date.parse(d.createdAt))) throw new Error('Invalid box');
    id(d.id);
    for (const e of box.entries) {
      const valid =
        e &&
        Number.isSafeInteger(e.amount) &&
        e.amount > 0 &&
        e.amount <= MAX_ENTRY &&
        typeof e.category === 'string' &&
        e.category.trim().length > 0 &&
        e.category.length <= CATEGORY_LIMIT &&
        (e.note === undefined || (typeof e.note === 'string' && e.note.length <= NOTE_LIMIT)) &&
        typeof e.day === 'string' &&
        validDay(e.day) &&
        Number.isFinite(Date.parse(e.createdAt));
      if (!valid) throw new Error('Invalid entry');
      id(e.id);
    }
  }
  return v;
}

/** Adds a ready-made box. The same store comes back when the user already has one from that template. */
export function addBox(store: BoxStore, template: BoxTemplate, now = new Date()): { store: BoxStore; box: Box } {
  const existing = store.boxes.find((b) => b.def.template === template);
  if (existing) return { store, box: existing };
  const t = TEMPLATES[template];
  const box: Box = { def: { id: String(store.nextId), template, name: t.name, categories: [...t.categories], createdAt: now.toISOString() }, entries: [] };
  return { store: { version: 1, nextId: store.nextId + 1, boxes: [...store.boxes, box] }, box };
}

/** One spending entry, into the spending box (made on the way when there is none). The form in "Миний" and the chat both use this. */
export function addSpending(
  store: BoxStore,
  input: { amount: number; category: string; note?: string },
  now = new Date()
): { store: BoxStore; entry: BoxEntry } | { error: string } {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > MAX_ENTRY) return { error: 'Дүнг тоогоор бичээрэй. ' + SPENDING_HINT };
  const category = input.category.trim().slice(0, CATEGORY_LIMIT) || 'Бусад';
  const note = input.note?.trim().slice(0, NOTE_LIMIT) || undefined;
  const made = addBox(store, 'spending', now);
  if (made.store.boxes.length > BOX_CAP) return { error: `${BOX_CAP} бүртгэл байна. Хэрэггүйгээ устгаад нэмээрэй.` };
  const entry: BoxEntry = { id: String(made.store.nextId), amount: input.amount, category, ...(note ? { note } : {}), day: dayInUB(now), createdAt: now.toISOString() };
  const boxes = made.store.boxes.map((b) => (b.def.id === made.box.def.id ? { ...b, entries: [...b.entries, entry].slice(-ENTRY_CAP) } : b));
  return { store: { version: 1, nextId: made.store.nextId + 1, boxes }, entry };
}

/** Removes one entry by its number; the same store when no box has it. */
export function deleteEntry(store: BoxStore, id: string): BoxStore {
  if (!store.boxes.some((b) => b.entries.some((e) => e.id === id))) return store;
  return { ...store, boxes: store.boxes.map((b) => ({ ...b, entries: b.entries.filter((e) => e.id !== id) })) };
}

/** This month in one box: the total, each category's share (largest first), and the latest entries. */
export function monthSummary(box: Box, now = new Date()) {
  const month = monthInUB(now);
  const entries = box.entries.filter((e) => e.day.startsWith(month));
  const byCategory = new Map<string, number>();
  for (const e of entries) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  return {
    month,
    total: entries.reduce((sum, e) => sum + e.amount, 0),
    count: entries.length,
    categories: [...byCategory.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category)),
    /** Newest first, across months, so the start of a month still shows what came before. */
    latest: [...box.entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || Number(b.id) - Number(a.id)).slice(0, 5),
  };
}

/** "5. Хоол · 15,000₮ · кофе" for an entry, with its day when that is not today. */
export function describeEntry(e: BoxEntry, now = new Date()) {
  return `${e.id}. ${e.category} · ${formatAmount(e.amount)}${e.note ? ' · ' + e.note : ''}${e.day === dayInUB(now) ? '' : ' · ' + e.day}`;
}

/** Which store change a command made, by id only, for the activity history; amounts and notes never go there. */
export type BoxAction = { kind: 'entry_add' | 'entry_delete'; id: string };
export type BoxResult = { store: BoxStore; reply: string; changed: boolean; action?: BoxAction };

/**
 * The spending commands: `Зардал: <дүн> <ангилал> [тэмдэглэл]`, `<дүн>₮ <ангилал> [тэмдэглэл]`, `Зардал` / `Энэ сарын зардал` for the
 * month, `Зардал N устга`, with the Latin `zardal`. A bare number without "Зардал:" or ₮ is never taken for spending: "15 хороолол
 * эмийн сан" is a search. Null for anything else.
 */
export function handleBoxes(input: string, store: BoxStore, now = new Date()): BoxResult | null {
  const text = input.trim();
  const normalized = text.toLowerCase().replace(/[?!.]+$/, '').trim();
  const result = (reply: string, next = store, action?: BoxAction): BoxResult => ({ store: next, reply, changed: next !== store, ...(action ? { action } : {}) });

  if (/^(зардал|зардлууд|миний зардал|энэ сарын зардал|zardal)$/.test(normalized)) {
    const box = spendingBox(store);
    if (!box || !box.entries.length) return result('Одоогоор зардал бүртгээгүй байна. ' + SPENDING_HINT);
    const s = monthSummary(box, now);
    const lines = [
      `Энэ сар: ${formatAmount(s.total)} · ${s.count} удаа`,
      ...s.categories.map((c) => `${c.category} · ${formatAmount(c.amount)}`),
      '',
      'Сүүлийнх:',
      ...s.latest.map((e) => describeEntry(e, now)),
    ];
    return result(lines.join('\n'));
  }

  let match = text.match(/^(?:зардал|zardal)\s+(\d+)\s+(?:устга|ustga)[.!]?$/iu);
  if (match) {
    const next = deleteEntry(store, match[1]);
    if (next === store) return result(`${match[1]} дугаартай зардал олдсонгүй.`);
    return result('Зардлыг устгалаа.', next, { kind: 'entry_delete', id: match[1] });
  }

  // "Зардал: 15000 хоол кофе" or "15000₮ хоол": the amount, then a category word, then an optional note.
  match = text.match(/^(?:зардал|zardal)\s*:\s*(\S+)\s*(.*)$/isu) ?? text.match(/^(\d[\d.,]*\s*(?:к|k)?\s*(?:₮|төгрөг|төг))\s*(.*)$/isu);
  if (match) {
    let amount = parseAmount(match[1]);
    let rest = match[2].trim();
    // "Зардал: хоол 15000": the amount written last.
    if (!Number.isFinite(amount)) {
      const all = (match[1] + ' ' + rest).trim().split(/\s+/);
      amount = parseAmount(all[all.length - 1]);
      rest = all.slice(0, -1).join(' ');
    }
    if (!Number.isFinite(amount)) return result('Дүнг ойлгосонгүй. ' + SPENDING_HINT);
    const box = spendingBox(store);
    const categories = box?.def.categories ?? TEMPLATES.spending.categories;
    // Two-word categories ("эрүүл мэнд") first, then the first word.
    const words = rest.split(/\s+/).filter(Boolean);
    let category: string | null = null;
    let used = 0;
    if (words.length >= 2) {
      category = categoryOf(words.slice(0, 2).join(' '), categories);
      if (category) used = 2;
    }
    if (!category && words.length) {
      category = categoryOf(words[0], categories);
      if (category) used = 1;
    }
    const note = words.slice(used).join(' ') || undefined;
    const added = addSpending(store, { amount, category: category ?? 'Бусад', note }, now);
    if ('error' in added) return result(added.error);
    const month = monthSummary(spendingBox(added.store)!, now);
    return result(
      `Зардал ${added.entry.id}: ${added.entry.category} · ${formatAmount(added.entry.amount)}${added.entry.note ? ' · ' + added.entry.note : ''}\nЭнэ сар нийт ${formatAmount(month.total)}.${box ? '' : '\n“Миний” хэсэгт Зардал гэж шинэ бүртгэл нэмэгдлээ.'}`,
      added.store,
      { kind: 'entry_add', id: added.entry.id }
    );
  }

  if (/^(?:зардал|zardal)(\s|:|$)/i.test(text)) return result('Яг юу хийхийг ойлгосонгүй. Юу ч хадгалаагүй. ' + SPENDING_HINT);
  return null;
}
