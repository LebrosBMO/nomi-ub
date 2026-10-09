import type { Place } from './core.ts';
import { dayInUB } from './personal.ts';
import type { FollowupOutcome, Report } from './reports.ts';

/**
 * Follow-ups after a call (PRD Section 14): the pure planner, with the clock injected. A call tap queues one pending item per
 * place; when the app comes back after at least 30 seconds away, or on the next open within 24 hours of the call, the chat asks
 * whether the place helped, with five tappable answers. Answers are feedback in the reports store (`kind: 'followup'`) and leave
 * the device only through the export. Storage lives in followups-storage.ts. Nothing here calls, messages or schedules anything.
 */
export type PendingFollowup = {
  placeId: string;
  /** The latest call to this place. */
  calledAt: string;
  /** When the question was last posted; absent until it was. */
  askedAt?: string;
  /** "Дараа" answers, and questions left unanswered, so far; at FOLLOWUP_LATER_LIMIT the item is dropped. */
  laterCount: number;
};
/** `nomi:followups:v1`. */
export type FollowupStore = { pending: PendingFollowup[] };
export const emptyFollowups = (): FollowupStore => ({ pending: [] });

/** A return to the foreground asks only after at least this long away; a question is never repeated within it either. */
export const FOLLOWUP_AWAY_MS = 30_000;
/** A call older than this is no longer asked about. */
export const FOLLOWUP_EXPIRY_MS = 24 * 3600000;
/** After this many "Дараа" answers the question is dropped for that call. */
export const FOLLOWUP_LATER_LIMIT = 2;

/** What brought the app to the front: a launch, or a return from the background after `awayMs`. */
export type FollowupTrigger = { kind: 'launch' } | { kind: 'foreground'; awayMs: number };

/** The five answers under the question, in the order shown; the keys are the stored outcomes (Section 6). */
export const FOLLOWUP_CHOICES = [
  { key: 'helped', label: 'Тийм' },
  { key: 'not_helped', label: 'Үгүй' },
  { key: 'closed', label: 'Хаагдсан' },
  { key: 'wrong_phone', label: 'Утас буруу' },
  { key: 'later', label: 'Дараа' },
] as const satisfies readonly { key: FollowupOutcome; label: string }[];
export type FollowupChoice = (typeof FOLLOWUP_CHOICES)[number]['key'];

export const FOLLOWUP_THANKS = 'Баярлалаа.';
/** After "Хаагдсан" or "Утас буруу": the answer goes to the export for the next verification round (AC 14.4). */
export const FOLLOWUP_RECHECK_LINE = 'Баярлалаа. Дараагийн шалгалтад тэмдэглэлээ.';
export const FOLLOWUP_LATER_LINE = 'За, дараа асууя.';
export const FOLLOWUP_DROPPED_LINE = 'За, энэ талаар дахиж асуухгүй.';
export const FOLLOWUP_SAVE_FAILED = 'Хариултыг хадгалж чадсангүй. Дахин оролдоно уу.';

const QUESTION = 'таны хэрэгтэйг олж өгсөн үү?';
/**
 * "{Place} — таны хэрэгтэйг олж өгсөн үү?". The name is always there, so a user who called two places knows which one is
 * meant; a pharmacy is named as one ("… эмийн сан таны хэрэгтэйг олж өгсөн үү?", the Section 14 wording) unless its catalog
 * name already says so.
 */
export function followupQuestion(place: Pick<Place, 'name' | 'category'>): string {
  const name = place.name.trim();
  const pharmacy = place.category === 'pharmacy' && !/эмийн\s+сан/iu.test(name);
  return `${name}${pharmacy ? ' эмийн сан' : ''} — ${QUESTION}`;
}

const time = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
export function validPending(v: unknown): v is PendingFollowup {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.placeId === 'string' &&
    p.placeId.length > 0 &&
    p.placeId.length <= 80 &&
    time(p.calledAt) &&
    (p.askedAt === undefined || time(p.askedAt)) &&
    Number.isSafeInteger(p.laterCount) &&
    (p.laterCount as number) >= 0
  );
}
const pick = (p: PendingFollowup): PendingFollowup => ({ placeId: p.placeId, calledAt: p.calledAt, ...(p.askedAt ? { askedAt: p.askedAt } : {}), laterCount: p.laterCount });

/** Reads a saved store. Malformed items are dropped, an unknown shape becomes an empty store, and one item per place remains (the last one). */
export function restoreFollowups(raw: unknown): FollowupStore {
  const v = raw as Partial<FollowupStore> | null;
  if (!v || !Array.isArray(v.pending)) return emptyFollowups();
  const byPlace = new Map<string, PendingFollowup>();
  for (const item of v.pending) if (validPending(item)) byPlace.set(item.placeId, pick(item));
  return { pending: [...byPlace.values()] };
}

/** Places whose follow-up got a final answer on `now`'s Ulaanbaatar day: one follow-up per place per day. "Дараа" is not final, and a card report is not a follow-up. */
export function answeredToday(reports: readonly Pick<Report, 'kind' | 'placeId' | 'outcome' | 'createdAt'>[], now: Date): ReadonlySet<string> {
  const today = dayInUB(now);
  return new Set(
    reports.filter((r) => r.kind === 'followup' && r.outcome && r.outcome !== 'later' && dayInUB(new Date(Date.parse(r.createdAt))) === today).map((r) => r.placeId)
  );
}

/**
 * A call tap, once the dialer has opened. A place answered today is not queued again; a place already waiting keeps its count
 * and takes the newer call time. The same store comes back when nothing changed.
 */
export function withCall(store: FollowupStore, placeId: string, now: Date, answered: ReadonlySet<string> = new Set()): FollowupStore {
  if (answered.has(placeId)) return store;
  const calledAt = now.toISOString();
  const existing = store.pending.find((p) => p.placeId === placeId);
  if (existing) return { pending: store.pending.map((p) => (p === existing ? { ...p, calledAt } : p)) };
  return { pending: [...store.pending, { placeId, calledAt, laterCount: 0 }] };
}

/** Drops calls older than FOLLOWUP_EXPIRY_MS, items deferred FOLLOWUP_LATER_LIMIT times and places no longer in the catalog. The same store comes back when nothing changed. */
export function pruneFollowups(store: FollowupStore, now: Date, known: (placeId: string) => boolean = () => true): FollowupStore {
  const kept = store.pending.filter((p) => now.getTime() - Date.parse(p.calledAt) < FOLLOWUP_EXPIRY_MS && p.laterCount < FOLLOWUP_LATER_LIMIT && known(p.placeId));
  return kept.length === store.pending.length ? store : { pending: kept };
}

/** Calls not yet asked about first, the most recent of them ahead; then the ones asked longest ago. */
function askOrder(a: PendingFollowup, b: PendingFollowup) {
  if (!a.askedAt !== !b.askedAt) return a.askedAt ? 1 : -1;
  return a.askedAt && b.askedAt ? Date.parse(a.askedAt) - Date.parse(b.askedAt) : Date.parse(b.calledAt) - Date.parse(a.calledAt);
}

/**
 * The planner: the one item to ask about on this trigger, or null. A return to the foreground counts only after FOLLOWUP_AWAY_MS
 * away; a launch always counts. One question per trigger, in `askOrder`, and never one asked less than FOLLOWUP_AWAY_MS ago, so
 * a doubled trigger posts nothing twice. The returned store has that item marked asked and the expired ones dropped. Without a
 * call there is nothing to ask (AC 14.3).
 */
export function planFollowup(store: FollowupStore, trigger: FollowupTrigger, now: Date, known?: (placeId: string) => boolean): { store: FollowupStore; ask: PendingFollowup | null } {
  const pruned = pruneFollowups(store, now, known);
  if (trigger.kind === 'foreground' && trigger.awayMs < FOLLOWUP_AWAY_MS) return { store: pruned, ask: null };
  const due = pruned.pending.filter((p) => !p.askedAt || now.getTime() - Date.parse(p.askedAt) >= FOLLOWUP_AWAY_MS).sort(askOrder)[0];
  if (!due) return { store: pruned, ask: null };
  const asked = { ...due, askedAt: now.toISOString() };
  return { store: { pending: pruned.pending.map((p) => (p === due ? asked : p)) }, ask: asked };
}

/** "Дараа", or a question left unanswered (the user typed or started a new conversation instead): asked again on a later trigger, dropped after FOLLOWUP_LATER_LIMIT. */
export function deferFollowup(store: FollowupStore, placeId: string): { store: FollowupStore; dropped: boolean } {
  const item = store.pending.find((p) => p.placeId === placeId);
  if (!item) return { store, dropped: true };
  const laterCount = item.laterCount + 1;
  const dropped = laterCount >= FOLLOWUP_LATER_LIMIT;
  return { store: { pending: dropped ? store.pending.filter((p) => p !== item) : store.pending.map((p) => (p === item ? { ...p, laterCount } : p)) }, dropped };
}

/** The tap on one of the five answers: a final one closes the item, "Дараа" defers it. `reply` is Nomi's one-line acknowledgement. */
export function answerFollowup(store: FollowupStore, placeId: string, choice: FollowupChoice): { store: FollowupStore; reply: string } {
  if (choice === 'later') {
    const deferred = deferFollowup(store, placeId);
    return { store: deferred.store, reply: deferred.dropped ? FOLLOWUP_DROPPED_LINE : FOLLOWUP_LATER_LINE };
  }
  const recheck = choice === 'closed' || choice === 'wrong_phone';
  return { store: { pending: store.pending.filter((p) => p.placeId !== placeId) }, reply: recheck ? FOLLOWUP_RECHECK_LINE : FOLLOWUP_THANKS };
}
