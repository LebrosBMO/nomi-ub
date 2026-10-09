import { nextDue, type Payment } from './payments.ts';
import { dayInUB, REMINDER_HINT, validDay, type PersonalAction, type PersonalState } from './personal.ts';

/**
 * Reminders delivered as local notifications (PRD Section 13): the pure parsing, planning and store rules, with the clock injected.
 * Storage lives in reminders-storage.ts and the expo-notifications calls in notifications.ts, behind `NotificationAdapter`, so this
 * file and its tests run in Node. Reminder text stays on the device: never sent to the server, never written to the activity history.
 */
export type ReminderStatus = 'scheduled' | 'fired' | 'done' | 'cancelled';
export type Reminder = {
  id: string;
  text: string;
  /** The task this reminder was made from ("Ажил N-ийг … сануул"); its title is copied into `text`. */
  taskId?: string;
  /** The monthly payment this reminder was made from ("Төлбөр N-ийг сануул"); its name is copied into `text`. */
  paymentId?: string;
  /** When it is due, Ulaanbaatar time: "2026-09-19T10:00:00+08:00". */
  at: string;
  /** The phone's scheduled notification, or null when notifications were refused, unsupported (web) or could not be set. */
  notificationId: string | null;
  status: ReminderStatus;
  createdAt: string;
};
/**
 * `nomi:reminders:v1`. Reminders number themselves (`nextId`) instead of sharing the task and memory sequence in `nomi:personal:v1`:
 * every command names its kind ("Сануулга 3 устга" against "Ажил 3 устга"), so the numbers never collide in meaning, and one
 * command writes one store.
 */
export type ReminderStore = { version: 1; nextId: number; items: Reminder[] };
export const emptyReminders = (): ReminderStore => ({ version: 1, nextId: 1, items: [] });

/** At most this many reminders may wait at once. */
export const REMINDER_CAP = 50;
export const REMINDER_TEXT_LIMIT = 500;
/** Finished reminders (done or cancelled) kept for reference; older ones are dropped on the next change. */
const FINISHED_KEEP = 50;
/** "30 мин дараа". */
export const SNOOZE_MS = 30 * 60000;
/** The time of day a payment reminder fires on the due date, Ulaanbaatar time. */
export const PAYMENT_REMINDER_TIME = '10:00';
const UB_OFFSET_MS = 8 * 3600000;

export const PAST_TIME_LINE = 'Энэ цаг өнгөрсөн байна.';
const DATE_ERROR = 'Өдрийг “өнөөдөр”, “маргааш” эсвэл 2026-10-01 хэлбэрээр бичээрэй. Жишээ: “Сануул: маргааш 10:00 дугуй засвар руу залгах”.';
const TIME_ERROR = 'Цагийг 09:30 шиг HH:MM хэлбэрээр бичээрэй. Жишээ: “Сануул: маргааш 10:00 дугуй засвар руу залгах”.';
/** One line before the first system prompt (Section 13: "one-line explanation, then requestPermissionsAsync()"). */
export const REMINDER_EXPLANATION = 'Цаг болоход мэдэгдэл илгээхийн тулд утасны зөвшөөрөл асууна. Сануулга энэ утсанд л үлдэнэ.';
export const REMINDER_SET_LINE = 'Цаг болоход утсанд мэдэгдэл ирнэ.';
export const REMINDER_DENIED_LINE = 'Мэдэгдэл зөвшөөрөгдөөгүй тул төлөвлөгөөнд л хадгаллаа.';
export const REMINDER_WEB_LINE = 'Вэб дээр мэдэгдэл ирэхгүй; төлөвлөгөөнд хадгаллаа.';
export const REMINDER_FAILED_LINE = 'Мэдэгдэл тохируулж чадсангүй; төлөвлөгөөнд хадгаллаа.';
export { REMINDER_HINT };
/** Live step labels and summary steps around the phone's notification calls. */
export const PERMISSION_STATUS = 'Мэдэгдлийн зөвшөөрөл асууж байна';
export const PERMISSION_GRANTED_STEP = 'Мэдэгдэл зөвшөөрөгдлөө';
export const PERMISSION_DENIED_STEP = 'Мэдэгдэл зөвшөөрөгдсөнгүй';
export const SCHEDULING_STATUS = 'Мэдэгдэл тохируулж байна';
export const SCHEDULED_STEP = 'Мэдэгдэл тохирууллаа';
export const SCHEDULE_FAILED_STEP = 'Мэдэгдэл тохируулж чадсангүй';
export const CANCELLING_STATUS = 'Мэдэгдлийг цуцалж байна';
export const CANCELLED_STEP = 'Мэдэгдлийг цуцаллаа';
/** The two answers under "Сануулга: …" once a notification was tapped, in the order shown; the chat acts on the keys. */
export const REMINDER_CHOICES = [
  { key: 'done', label: 'Дууссан' },
  { key: 'snooze', label: '30 мин дараа' },
] as const;
export type ReminderChoice = (typeof REMINDER_CHOICES)[number]['key'];

/**
 * The phone's notification calls, behind an interface so the logic runs in Node with a mock; notifications.ts is the
 * expo-notifications implementation. Only ever called for reminders the user typed or answered.
 */
export type NotificationAdapter = {
  /** False on web: nothing is scheduled and the reply says so. */
  supported: boolean;
  /** The system's standing answer, read without any prompt. */
  granted: () => Promise<boolean>;
  /** The system prompt; resolves with the answer. */
  request: () => Promise<boolean>;
  /** Schedules the phone notification for one reminder and resolves with its id. */
  schedule: (reminder: Reminder) => Promise<string>;
  cancel: (notificationId: string) => Promise<void>;
  /** Every scheduled notification of the app, for "delete my data". */
  cancelAll: () => Promise<void>;
};

const isActive = (r: Reminder) => r.status === 'scheduled' || r.status === 'fired';
const byTime = (a: Reminder, b: Reminder) => Date.parse(a.at) - Date.parse(b.at) || Number(a.id) - Number(b.id);
const tomorrow = (now: Date) => dayInUB(new Date(now.getTime() + 86400000));

/** An instant as Ulaanbaatar time: "2026-09-19T10:00:00+08:00". */
export function isoInUB(ms: number) {
  return new Date(ms + UB_OFFSET_MS).toISOString().slice(0, 19) + '+08:00';
}
/** "2026-09-19 10:00" for a stored `at`. */
export function formatAt(at: string) {
  const iso = isoInUB(Date.parse(at));
  return iso.slice(0, 10) + ' ' + iso.slice(11, 16);
}
const timeOf = (at: string) => formatAt(at).slice(11);

/** AC 13.1: өнөөдөр, маргааш or YYYY-MM-DD with HH:MM, as an Ulaanbaatar instant that must still be ahead of `now`. */
export function parseReminderTime(day: string, time: string, now: Date): { at: string } | { error: string } {
  const word = day.toLowerCase();
  const date = word === 'өнөөдөр' ? dayInUB(now) : word === 'маргааш' ? tomorrow(now) : word;
  if (!validDay(date)) return { error: DATE_ERROR };
  const clock = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!clock || Number(clock[1]) > 23 || Number(clock[2]) > 59) return { error: TIME_ERROR };
  const at = `${date}T${clock[1].padStart(2, '0')}:${clock[2]}:00+08:00`;
  if (Date.parse(at) <= now.getTime()) return { error: PAST_TIME_LINE };
  return { at };
}

const STATUSES = new Set<string>(['scheduled', 'fired', 'done', 'cancelled']);
const AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/;
/** Reads a saved store. A corrupt one is rejected, not silently reset (the same rule as the personal store, AC 11.4). */
export function restoreReminders(raw: unknown): ReminderStore {
  const v = raw as ReminderStore;
  if (!v || v.version !== 1 || !Array.isArray(v.items) || !Number.isSafeInteger(v.nextId) || v.nextId < 1) throw new Error('Invalid reminder store');
  const ids = new Set<string>();
  for (const r of v.items) {
    const valid =
      r &&
      /^\d+$/.test(r.id) &&
      Number(r.id) < v.nextId &&
      !ids.has(r.id) &&
      typeof r.text === 'string' &&
      r.text.trim().length > 0 &&
      r.text.length <= REMINDER_TEXT_LIMIT &&
      (r.taskId === undefined || /^\d+$/.test(r.taskId)) &&
      (r.paymentId === undefined || /^\d+$/.test(r.paymentId)) &&
      typeof r.at === 'string' &&
      AT.test(r.at) &&
      // Date.parse rolls "2026-02-30" over into March; only an instant that prints back the same is a real one.
      isoInUB(Date.parse(r.at)) === r.at &&
      (r.notificationId === null || (typeof r.notificationId === 'string' && r.notificationId.length > 0)) &&
      STATUSES.has(r.status) &&
      typeof r.createdAt === 'string' &&
      Number.isFinite(Date.parse(r.createdAt));
    if (!valid) throw new Error('Invalid reminder');
    ids.add(r.id);
  }
  return v;
}

/** Keeps every waiting reminder and the latest FINISHED_KEEP finished ones, so the store stays small. */
function prune(store: ReminderStore): ReminderStore {
  const finished = store.items.filter((r) => !isActive(r));
  if (finished.length <= FINISHED_KEEP) return store;
  const drop = new Set(finished.slice(0, finished.length - FINISHED_KEEP).map((r) => r.id));
  return { ...store, items: store.items.filter((r) => !drop.has(r.id)) };
}

/** What a reminder command changed, by id only, for the activity history; the text never goes there. */
export type ReminderAction = { kind: 'reminder_set'; id: string };
export type ReminderResult = {
  store: ReminderStore;
  reply: string;
  changed: boolean;
  action?: ReminderAction;
  /** The reminder whose phone notification must now be scheduled, before the store is saved with its id. */
  schedule?: string;
  /** The phone notification to cancel. */
  cancel?: string;
};

/** "1. 2026-09-19 10:00 · дугуй засвар руу залгах (Ажил 3)", plus what state it is in when that is not the plain waiting one. */
function describe(r: Reminder, now: Date) {
  const state = r.status === 'fired' ? ' · ирсэн' : Date.parse(r.at) <= now.getTime() ? ' · өнгөрсөн' : r.notificationId ? '' : ' · мэдэгдэлгүй';
  return `${r.id}. ${formatAt(r.at)} · ${r.text}${source(r)}${state}`;
}
/** " (Ажил 3)" or " (Төлбөр 1)" when the reminder was made from one. */
const source = (r: Reminder) => (r.taskId ? ` (Ажил ${r.taskId})` : r.paymentId ? ` (Төлбөр ${r.paymentId})` : '');

/**
 * The reminder commands: `Сануул: <өнөөдөр|маргааш|YYYY-MM-DD> HH:MM <text>`, `Ажил N-ийг маргааш 09:30-д сануул`, `Сануулгууд`,
 * `Сануулга N устга`, with the Latin command words `sanuul`, `sanuulguud`, `sanuulga … ustga`. Null for anything else, so
 * `handlePersonal` gets its turn. Questions, negations and quoted commands match nothing here and change nothing.
 */
export function handleReminders(
  input: string,
  store: ReminderStore,
  personal: PersonalState,
  now = new Date(),
  payments: readonly Payment[] = []
): ReminderResult | null {
  const text = input.trim();
  const normalized = text.toLowerCase().replace(/[?!.]+$/, '').trim();
  const result = (reply: string, next = store, extra: Pick<ReminderResult, 'action' | 'schedule' | 'cancel'> = {}): ReminderResult => ({
    store: next,
    reply,
    changed: next !== store,
    ...extra,
  });
  const add = (day: string, time: string, body: string, taskId?: string, paymentId?: string): ReminderResult => {
    const parsed = parseReminderTime(day, time, now);
    if ('error' in parsed) return result(parsed.error);
    if (body.length > REMINDER_TEXT_LIMIT) return result('Сануулгын текстийг 500 тэмдэгтэд багтаагаарай.');
    const waiting = store.items.filter(isActive);
    const duplicate = waiting.find((r) =>
      r.at === parsed.at && (taskId ? r.taskId === taskId : paymentId ? r.paymentId === paymentId : r.text.toLowerCase() === body.toLowerCase())
    );
    if (duplicate) return result(`Энэ сануулга ${duplicate.id} дугаартайгаар бүртгэлтэй байна.`);
    if (waiting.filter((r) => r.status === 'scheduled').length >= REMINDER_CAP) return result(`${REMINDER_CAP} сануулга хүлээгдэж байна. Хэрэггүйгээ устгаад нэмээрэй.`);
    const id = String(store.nextId);
    const item: Reminder = {
      id,
      text: body,
      ...(taskId ? { taskId } : {}),
      ...(paymentId ? { paymentId } : {}),
      at: parsed.at,
      notificationId: null,
      status: 'scheduled',
      createdAt: now.toISOString(),
    };
    return result(
      `Сануулга ${id} · ${formatAt(parsed.at)}\n${taskId ? `Ажил ${taskId}: ` : paymentId ? `Төлбөр ${paymentId}: ` : ''}${body}`,
      prune({ version: 1, nextId: store.nextId + 1, items: [...store.items, item] }),
      { action: { kind: 'reminder_set', id }, schedule: id }
    );
  };

  if (/^(сануулгууд|миний сануулгууд|sanuulguud)$/.test(normalized)) {
    const rows = store.items.filter(isActive).sort(byTime);
    if (!rows.length) return result('Одоогоор сануулга алга. “Сануул: маргааш 10:00 дугуй засвар руу залгах” гэж бичээрэй.');
    return result(rows.map((r) => describe(r, now)).join('\n') + `\n\nЦагийг Улаанбаатарын цагаар тооцов. Цуцлах бол “Сануулга ${rows[0].id} устга” гэж бичээрэй.`);
  }
  let match = text.match(/^(?:сануул|sanuul)\s*:\s*(\S+)\s+(\S+)\s+(.+)$/isu);
  if (match) return add(match[1], match[2], match[3].trim());
  match = text.match(/^(?:ажил|ajil)\s+(\d+)(?:-ыг|-ийг|-г)?\s+(\S+)\s+(\S+?)(?:-д|-т)?\s+(?:сануул|sanuul)[.!]?$/iu);
  if (match) {
    const task = personal.tasks.find((t) => t.id === match?.[1]);
    if (!task) return result(`${match[1]} дугаартай ажил олдсонгүй.`);
    if (task.done) return result(`Ажил ${task.id} дууссан байна. “Ажил ${task.id} сэргээ” гэж сэргээгээд сануулаарай.`);
    return add(match[2], match[3], task.title, task.id);
  }
  match = text.match(/^(?:төлбөр|tulbur)\s+(\d+)(?:-ыг|-ийг|-г)?\s+(?:сануул|sanuul)[.!]?$/iu);
  if (match) {
    const payment = payments.find((p) => p.id === match?.[1]);
    if (!payment) return result(`${match[1]} дугаартай төлбөр олдсонгүй.`);
    // The due day at 10:00; once that has passed today, the next month's due day instead.
    let day = nextDue(payment, now);
    if (Date.parse(`${day}T${PAYMENT_REMINDER_TIME}:00+08:00`) <= now.getTime()) day = nextDue(payment, new Date(now.getTime() + 86400000));
    return add(day, PAYMENT_REMINDER_TIME, `${payment.name} төлөх`, undefined, payment.id);
  }
  match = text.match(/^(?:сануулга|sanuulga)\s+(\d+)\s+(?:устга|ustga)[.!]?$/iu);
  if (match) {
    const id = match[1];
    const item = store.items.find((r) => r.id === id && isActive(r));
    if (!item) return result(`${id} дугаартай сануулга олдсонгүй.`);
    const next = prune({ ...store, items: store.items.map((r) => (r.id === id ? { ...r, status: 'cancelled' as const, notificationId: null } : r)) });
    return result('Сануулгыг устгалаа.', next, item.notificationId ? { cancel: item.notificationId } : {});
  }
  return null;
}

/** Records the phone notification a reminder got (or null when it got none) before the store is saved. */
export function attachNotification(store: ReminderStore, id: string, notificationId: string | null): ReminderStore {
  return { ...store, items: store.items.map((r) => (r.id === id ? { ...r, notificationId } : r)) };
}

/** The notification came: a waiting reminder becomes `fired`. `changed` is false when it already had, so the activity entry is written once. */
export function markFired(store: ReminderStore, id: string): { store: ReminderStore; changed: boolean } {
  const item = store.items.find((r) => r.id === id);
  if (!item || item.status !== 'scheduled') return { store, changed: false };
  return { store: { ...store, items: store.items.map((r) => (r.id === id ? { ...r, status: 'fired' as const, notificationId: null } : r)) }, changed: true };
}

/** What the chat shows when a reminder's notification was tapped, above the "Дууссан" / "30 мин дараа" buttons. */
export function reminderQuestion(item: Reminder) {
  return `Сануулга: ${item.text}${source(item)}`;
}

export type ReminderAnswer = {
  store: ReminderStore;
  /** Same reference unless "Дууссан" also completed the task the reminder was made from. */
  personal: PersonalState;
  reply: string;
  actions: (ReminderAction | PersonalAction)[];
  /** Set after "30 мин дараа": the reminder to schedule again. */
  schedule?: string;
};

/**
 * The tap on one of the two answers. "Дууссан" closes the reminder and, when it was made from an open task, that task too.
 * "30 мин дараа" moves it 30 minutes ahead and asks for a new notification.
 */
export function answerReminder(store: ReminderStore, personal: PersonalState, id: string, choice: ReminderChoice, now = new Date()): ReminderAnswer {
  const item = store.items.find((r) => r.id === id);
  if (!item || !isActive(item)) return { store, personal, reply: 'Энэ сануулга олдсонгүй.', actions: [] };
  if (choice === 'snooze') {
    const at = isoInUB(now.getTime() + SNOOZE_MS);
    const next = { ...store, items: store.items.map((r) => (r.id === id ? { ...r, at, status: 'scheduled' as const, notificationId: null } : r)) };
    return { store: next, personal, reply: `${timeOf(at)}-д дахин сануулна.`, actions: [{ kind: 'reminder_set', id }], schedule: id };
  }
  const next = prune({ ...store, items: store.items.map((r) => (r.id === id ? { ...r, status: 'done' as const, notificationId: null } : r)) });
  const task = item.taskId ? personal.tasks.find((t) => t.id === item.taskId && !t.done) : undefined;
  if (!task) return { store: next, personal, reply: 'Дууссан гэж тэмдэглэлээ.', actions: [] };
  return {
    store: next,
    personal: { ...personal, tasks: personal.tasks.map((t) => (t.id === task.id ? { ...t, done: true } : t)) },
    reply: `Дууссан гэж тэмдэглэлээ. Ажил ${task.id}-ийг ч дууссан гэж тэмдэглэлээ.`,
    actions: [{ kind: 'task_done', id: task.id }],
  };
}

/**
 * "Delete my data" (Section 8, AC 13.5): cancels every notification Nomi scheduled, then everything the app still has scheduled,
 * and returns the empty store for the caller to drop. Each cancel is best effort so one failure never leaves the rest in place.
 */
export async function cancelAllReminders(store: ReminderStore, adapter: NotificationAdapter): Promise<ReminderStore> {
  if (adapter.supported) {
    for (const r of store.items) if (r.notificationId) await adapter.cancel(r.notificationId).catch(() => {});
    await adapter.cancelAll().catch(() => {});
  }
  return emptyReminders();
}
