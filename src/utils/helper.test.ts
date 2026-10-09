import test from 'node:test';
import assert from 'node:assert/strict';
import { attentionCount, doneTasks, openTasks, paymentRows, recentlyCalled, todayPlan } from './helper.ts';
import { emptyPayments, handlePayments, setPaid, type PaymentStore } from './payments.ts';
import { emptyPersonal, handlePersonal, setTaskDone, type PersonalState } from './personal.ts';
import { emptyReminders, handleReminders, type ReminderStore } from './reminders.ts';

/** 2026-09-19 10:00 in Ulaanbaatar. */
const now = new Date('2026-09-19T02:00:00Z');

function device() {
  let personal: PersonalState = emptyPersonal();
  for (const command of ['Өнөөдөр хийх: эм авах', 'Ажил нэм: дугуй засвар руу залгах', 'Маргааш хийх: цемент авах', 'Санаж ав: миний машин Prius']) {
    personal = handlePersonal(command, personal, now)!.state;
  }
  // An overdue task: written as if it was added earlier, which the parser refuses for a past day.
  personal = { ...personal, nextId: personal.nextId + 1, tasks: [...personal.tasks, { id: String(personal.nextId), title: 'хуучин ажил', done: false, createdAt: now.toISOString(), dueDate: '2026-09-17' }] };
  let payments: PaymentStore = emptyPayments();
  for (const command of ['Төлбөр нэм: түрээс 450000 5', 'Төлбөр нэм: интернет 35000 20', 'Төлбөр нэм: гар утас 25000 19']) {
    payments = handlePayments(command, payments, now)!.store;
  }
  let reminders: ReminderStore = emptyReminders();
  for (const command of ['Сануул: өнөөдөр 18:00 эмээ рүү залгах', 'Сануул: маргааш 09:00 уулзалт']) {
    reminders = handleReminders(command, reminders, personal, now)!.store;
  }
  return { personal, payments, reminders };
}

test('Section 20: today shows unfinished tasks due today or before, today\'s reminders, and payments due and unpaid', () => {
  const { personal, payments, reminders } = device();
  const plan = todayPlan(personal, reminders, payments, now);
  // The overdue one first, then today's; the undated and tomorrow's tasks are not today's business.
  assert.deepEqual(plan.tasks.map((t) => t.title), ['хуучин ажил', 'эм авах']);
  assert.deepEqual(plan.reminders.map((r) => r.text), ['эмээ рүү залгах']);
  // The 5th has passed and the 19th is today; the 20th has not come.
  assert.deepEqual(plan.payments.map((p) => p.name), ['түрээс', 'гар утас']);
  assert.equal(attentionCount(plan), 5);
});

test('Section 20: a tick in the tab and the typed command change the store the same way', () => {
  const { personal, payments, reminders } = device();
  // Payments: tapping the row and typing "Төлбөр 1 төлсөн" give the same store.
  const tapped = setPaid(payments, '1', true, '2026-09');
  const typed = handlePayments('Төлбөр 1 төлсөн', payments, now)!.store;
  assert.deepEqual(tapped, typed);
  assert.equal(setPaid(tapped, '1', true, '2026-09'), tapped, 'already paid: the same store comes back, nothing to save');
  assert.equal(setPaid(payments, '99', true, '2026-09'), payments);
  // Tasks likewise.
  const done = setTaskDone(personal, '1', true);
  assert.deepEqual(done, handlePersonal('Ажил 1 дууссан', personal, now)!.state);
  assert.equal(setTaskDone(done, '1', true), done);
  // And the badge goes down as things are ticked off.
  assert.equal(attentionCount(todayPlan(done, reminders, tapped, now)), 3);
});

test('Section 20: the lists keep dated tasks first, finished ones apart, and payments by day with this month\'s state', () => {
  const { personal, payments } = device();
  assert.deepEqual(openTasks(personal).map((t) => t.title), ['хуучин ажил', 'эм авах', 'цемент авах', 'дугуй засвар руу залгах']);
  const finished = setTaskDone(setTaskDone(personal, '1', true), '2', true);
  assert.deepEqual(doneTasks(finished).map((t) => t.id), ['2', '1']);
  const rows = paymentRows(setPaid(payments, '2', true, '2026-09'), now);
  assert.deepEqual(rows.map((r) => [r.payment.name, r.paid]), [['түрээс', false], ['гар утас', false], ['интернет', true]]);
  // Next month every payment starts unpaid again.
  assert.ok(paymentRows(setPaid(payments, '2', true, '2026-09'), new Date('2026-10-02T02:00:00Z')).every((r) => !r.paid));
});

test('Section 20: an empty phone has nothing waiting', () => {
  const plan = todayPlan(emptyPersonal(), emptyReminders(), emptyPayments(), now);
  assert.equal(attentionCount(plan), 0);
  assert.deepEqual(openTasks(emptyPersonal()), []);
  assert.deepEqual(paymentRows(emptyPayments(), now), []);
});

test('Section 20: "Сүүлд залгасан" lists the places called in the last 30 days, newest first, each once, at most 5', () => {
  const at = (days: number) => new Date(now.getTime() - days * 86400000).toISOString();
  const items = [
    { id: '1', at: at(1), kind: 'call' as const, placeId: 'a' },
    { id: '2', at: at(0.5), kind: 'map' as const, placeId: 'b' },
    { id: '3', at: at(0.2), kind: 'call' as const, placeId: 'c' },
    { id: '4', at: at(0.1), kind: 'call' as const, placeId: 'a' },
    { id: '5', at: at(40), kind: 'call' as const, placeId: 'old' },
    { id: '6', at: at(2), kind: 'call' as const, placeId: 'gone' },
    { id: '7', at: at(3), kind: 'call' as const, placeId: 'd' },
    { id: '8', at: at(4), kind: 'call' as const, placeId: 'e' },
    { id: '9', at: at(5), kind: 'call' as const, placeId: 'f' },
    { id: '10', at: at(6), kind: 'call' as const, placeId: 'g' },
  ];
  // Map taps are not calls; a place out of the catalog and one called 40 days ago are left out; "a" counts once, by its latest call.
  assert.deepEqual(recentlyCalled(items, now, (id) => id !== 'gone'), ['a', 'c', 'd', 'e', 'f']);
  assert.deepEqual(recentlyCalled([], now), []);
});
