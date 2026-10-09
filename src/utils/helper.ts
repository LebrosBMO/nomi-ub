import type { ActivityItem } from './activity.ts';
import { duePayments, isPaid, monthInUB, type Payment, type PaymentStore } from './payments.ts';
import { dayInUB, type PersonalState, type Task } from './personal.ts';
import type { Reminder, ReminderStore } from './reminders.ts';

/**
 * What the personal helper tab shows (PRD Section 20). The chat answers questions; this tab is the standing view of the user's own
 * things — today first, then the lists. Pure: the screen renders what these return and changes stores through the same functions
 * the chat commands use, so both ways round agree.
 */
export type TodayPlan = {
  /** Unfinished tasks due today or earlier, earliest first. */
  tasks: Task[];
  /** Reminders still waiting today, earliest first. */
  reminders: Reminder[];
  /** Payments whose day has arrived this month and are not marked paid. */
  payments: Payment[];
};

const taskOrder = (a: Task, b: Task) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || Number(a.id) - Number(b.id);

export function todayPlan(personal: PersonalState, reminders: ReminderStore, payments: PaymentStore, now = new Date()): TodayPlan {
  const today = dayInUB(now);
  return {
    tasks: personal.tasks.filter((t) => !t.done && t.dueDate && t.dueDate <= today).sort(taskOrder),
    reminders: reminders.items
      .filter((r) => (r.status === 'scheduled' || r.status === 'fired') && r.at.slice(0, 10) === today)
      .sort((a, b) => a.at.localeCompare(b.at) || Number(a.id) - Number(b.id)),
    payments: duePayments(payments.items, now),
  };
}

/** The number on the tab: everything waiting for the user today. Zero hides the badge. */
export const attentionCount = (plan: TodayPlan) => plan.tasks.length + plan.reminders.length + plan.payments.length;

/** Unfinished tasks, dated ones first in date order; the tab's task list. */
export const openTasks = (personal: PersonalState) => personal.tasks.filter((t) => !t.done).sort(taskOrder);
/** Finished tasks, newest id first, shown under "Дууссан". */
export const doneTasks = (personal: PersonalState) => personal.tasks.filter((t) => t.done).sort((a, b) => Number(b.id) - Number(a.id));

/**
 * "Сүүлд залгасан": the places the user called in the last 30 days, newest first, each once, at most 5. The chat is put away after
 * 2 hours (Section 20), so this keeps a place found there one tap from another call. Read from the activity history, which already
 * holds every call by place id; `known` drops places that have left the catalog.
 */
export function recentlyCalled(items: readonly ActivityItem[], now = new Date(), known: (id: string) => boolean = () => true): string[] {
  const since = now.getTime() - 30 * 86400000;
  const ids: string[] = [];
  for (const item of [...items].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))) {
    if (item.kind !== 'call' || !item.placeId || Date.parse(item.at) < since || ids.includes(item.placeId) || !known(item.placeId)) continue;
    ids.push(item.placeId);
    if (ids.length === 5) break;
  }
  return ids;
}

/** Payments by day of the month, with this month's state resolved for the row. */
export function paymentRows(payments: PaymentStore, now = new Date()) {
  const month = monthInUB(now);
  return [...payments.items].sort((a, b) => a.day - b.day || Number(a.id) - Number(b.id)).map((p) => ({ payment: p, paid: isPaid(p, month) }));
}
