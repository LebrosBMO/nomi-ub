import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyPayments, handlePayments } from './payments.ts';
import { emptyPersonal, handlePersonal, REMINDER_HINT } from './personal.ts';
import {
  answerReminder,
  attachNotification,
  cancelAllReminders,
  emptyReminders,
  formatAt,
  handleReminders,
  markFired,
  parseReminderTime,
  PAST_TIME_LINE,
  REMINDER_CAP,
  reminderQuestion,
  restoreReminders,
  type NotificationAdapter,
  type ReminderStore,
} from './reminders.ts';

/** 01:00 on 2026-09-19 in Ulaanbaatar. */
const now = new Date('2026-09-18T17:00:00Z');
const personal = () => handlePersonal('Ажил нэм: дугуй засвар руу залгах', emptyPersonal(), now)!.state;
/** An adapter that records every call and answers as told. */
function fakeAdapter(supported = true) {
  const calls = { cancel: [] as string[], cancelAll: 0 };
  const adapter: NotificationAdapter = {
    supported,
    granted: async () => true,
    request: async () => true,
    schedule: async (r) => 'n-' + r.id,
    cancel: async (id) => {
      calls.cancel.push(id);
    },
    cancelAll: async () => {
      calls.cancelAll++;
    },
  };
  return { adapter, calls };
}

test('AC 13.1: өнөөдөр, маргааш, ISO dates and HH:MM become Ulaanbaatar instants; past and impossible ones are refused', () => {
  assert.deepEqual(parseReminderTime('өнөөдөр', '10:00', now), { at: '2026-09-19T10:00:00+08:00' });
  assert.deepEqual(parseReminderTime('Маргааш', '09:30', now), { at: '2026-09-20T09:30:00+08:00' });
  assert.deepEqual(parseReminderTime('2026-10-01', '7:05', now), { at: '2026-10-01T07:05:00+08:00' });
  assert.deepEqual(parseReminderTime('өнөөдөр', '01:01', now), { at: '2026-09-19T01:01:00+08:00' });
  assert.deepEqual(parseReminderTime('маргааш', '00:00', new Date('2026-12-31T04:00:00Z')), { at: '2027-01-01T00:00:00+08:00' });
  assert.deepEqual(parseReminderTime('өнөөдөр', '00:30', now), { error: PAST_TIME_LINE });
  assert.deepEqual(parseReminderTime('өнөөдөр', '01:00', now), { error: PAST_TIME_LINE });
  assert.deepEqual(parseReminderTime('2026-09-18', '23:00', now), { error: PAST_TIME_LINE });
  for (const day of ['2026-02-30', '2026-13-01', 'даваа', '10:00']) assert.match((parseReminderTime(day, '10:00', now) as { error: string }).error, /Өдрийг/, day);
  for (const time of ['24:00', '09:60', '9h', '9', '9:5', '']) assert.match((parseReminderTime('маргааш', time, now) as { error: string }).error, /HH:MM/, time);
  assert.equal(formatAt('2026-09-19T10:00:00+08:00'), '2026-09-19 10:00');
  assert.equal(formatAt('2026-09-19T02:00:00Z'), '2026-09-19 10:00');
});

test('"Сануул:" adds with its own stable number, lists, refuses duplicates and past times, and cancels', () => {
  let r = handleReminders('Сануул: маргааш 10:00 дугуй засвар руу залгах', emptyReminders(), emptyPersonal(), now)!;
  assert.equal(r.changed, true);
  assert.equal(r.schedule, '1');
  assert.deepEqual(r.action, { kind: 'reminder_set', id: '1' });
  assert.deepEqual(r.store.items[0], {
    id: '1',
    text: 'дугуй засвар руу залгах',
    at: '2026-09-20T10:00:00+08:00',
    notificationId: null,
    status: 'scheduled',
    createdAt: now.toISOString(),
  });
  assert.equal(r.store.nextId, 2);
  assert.match(r.reply, /^Сануулга 1 · 2026-09-20 10:00\nдугуй засвар руу залгах$/);
  // The same text at the same time is one reminder; a different time is another.
  assert.equal(handleReminders('Сануул: маргааш 10:00 Дугуй засвар руу залгах', r.store, emptyPersonal(), now)!.changed, false);
  r = handleReminders('sanuul: 2026-10-01 08:00 уулзалт', r.store, emptyPersonal(), now)!;
  assert.equal(r.store.items.length, 2);
  assert.equal(r.store.items[1].id, '2');
  const past = handleReminders('Сануул: өнөөдөр 00:30 хоцорсон', r.store, emptyPersonal(), now)!;
  assert.equal(past.changed, false);
  assert.equal(past.reply, PAST_TIME_LINE);
  assert.equal(handleReminders('Сануул: 2026-02-30 10:00 байхгүй өдөр', r.store, emptyPersonal(), now)!.changed, false);
  assert.equal(handleReminders('Сануул: маргааш 24:00 байхгүй цаг', r.store, emptyPersonal(), now)!.changed, false);
  assert.equal(handleReminders('Сануул: маргааш 10:00 ' + 'х'.repeat(501), r.store, emptyPersonal(), now)!.changed, false);
  // Listed soonest first, with the cancel hint naming a real id.
  const list = handleReminders('Сануулгууд', r.store, emptyPersonal(), now)!;
  assert.equal(list.changed, false);
  assert.match(list.reply, /^1\. 2026-09-20 10:00 · дугуй засвар руу залгах · мэдэгдэлгүй\n2\. 2026-10-01 08:00 · уулзалт · мэдэгдэлгүй\n/);
  assert.match(list.reply, /“Сануулга 1 устга”/);
  assert.doesNotMatch(handleReminders('Сануулгууд?', attachNotification(r.store, '1', 'n-1'), emptyPersonal(), now)!.reply, /^1\..*мэдэгдэлгүй/);
  // Cancelling names the phone notification to cancel and keeps the id out of later lists.
  const cancel = handleReminders('Сануулга 1 устга', attachNotification(r.store, '1', 'n-1'), emptyPersonal(), now)!;
  assert.equal(cancel.changed, true);
  assert.equal(cancel.cancel, 'n-1');
  assert.equal(cancel.action, undefined);
  assert.equal(cancel.store.items[0].status, 'cancelled');
  assert.equal(cancel.store.items[0].notificationId, null);
  assert.match(handleReminders('sanuulguud', cancel.store, emptyPersonal(), now)!.reply, /^2\. 2026-10-01 08:00 · уулзалт/);
  assert.doesNotMatch(handleReminders('sanuulguud', cancel.store, emptyPersonal(), now)!.reply, /^1\./m);
  assert.equal(handleReminders('Сануулга 1 устга', cancel.store, emptyPersonal(), now)!.changed, false);
  assert.equal(handleReminders('Сануулга 9 устга', cancel.store, emptyPersonal(), now)!.changed, false);
  assert.equal(handleReminders('Сануулга 2 ustga', cancel.store, emptyPersonal(), now)!.cancel, undefined);
  assert.match(handleReminders('Сануулгууд', emptyReminders(), emptyPersonal(), now)!.reply, /сануулга алга/);
});

test('"Ажил N-ийг маргааш 09:30-д сануул" copies the open task; done or missing tasks are refused', () => {
  const tasks = personal();
  const r = handleReminders('Ажил 1-ийг маргааш 09:30-д сануул', emptyReminders(), tasks, now)!;
  assert.equal(r.changed, true);
  assert.equal(r.store.items[0].taskId, '1');
  assert.equal(r.store.items[0].text, 'дугуй засвар руу залгах');
  assert.equal(r.store.items[0].at, '2026-09-20T09:30:00+08:00');
  assert.match(r.reply, /^Сануулга 1 · 2026-09-20 09:30\nАжил 1: дугуй засвар руу залгах$/);
  assert.equal(handleReminders('Ажил 1-ийг маргааш 09:30-д сануул', r.store, tasks, now)!.changed, false);
  assert.equal(handleReminders('ajil 1 2026-10-01 18:00 sanuul', r.store, tasks, now)!.store.items.length, 2);
  assert.equal(handleReminders('Ажил 2-ыг маргааш 09:30-д сануул', r.store, tasks, now)!.changed, false);
  const done = handlePersonal('Ажил 1 дууссан', tasks, now)!.state;
  const refused = handleReminders('Ажил 1-ийг маргааш 09:30-д сануул', emptyReminders(), done, now)!;
  assert.equal(refused.changed, false);
  assert.match(refused.reply, /дууссан байна/);
  assert.match(handleReminders('Сануулгууд', r.store, tasks, now)!.reply, /\(Ажил 1\)/);
});

test('Questions, negations, quotations and other sentences about reminding never match; the personal fallback states the format', () => {
  const tasks = personal();
  for (const text of [
    'Сануулга 1 устга?',
    'Сануулга 1 устга битгий',
    '“Сануулга 1 устга” гэж хэлсэн',
    'Сануул: маргааш 10:00',
    'Сануул: ',
    'Маргааш 10 цагт сануулаарай',
    'Ажил 1-ийг маргааш сануул',
    'Ажил 1-ийг маргааш 09:30-д сануулаарай',
    'Ажил 1-ийг маргааш 09:30-д сануул уу?',
    'Сануулгуудаа устга',
  ]) {
    const r = handleReminders(text, emptyReminders(), tasks, now);
    assert.ok(!r || !r.changed, text);
  }
  const fallback = handlePersonal('Маргааш 10 цагт сануулаарай', tasks, now)!;
  assert.equal(fallback.changed, false);
  assert.equal(fallback.reply, REMINDER_HINT);
  assert.equal(handlePersonal('Сануулга 1 устга?', tasks, now)!.changed, false);
});

test('At most 50 reminders wait at once; finished ones are kept to the latest 50', () => {
  let store = emptyReminders();
  for (let i = 0; i < REMINDER_CAP; i++) store = handleReminders(`Сануул: 2026-10-01 ${String(i % 24).padStart(2, '0')}:${String(Math.floor(i / 24)).padStart(2, '0')} ажил ${i}`, store, emptyPersonal(), now)!.store;
  const full = handleReminders('Сануул: 2026-10-02 10:00 нэг ихдэлт', store, emptyPersonal(), now)!;
  assert.equal(full.changed, false);
  assert.match(full.reply, /50 сануулга/);
  for (let i = 1; i <= REMINDER_CAP; i++) store = handleReminders(`Сануулга ${i} устга`, store, emptyPersonal(), now)!.store;
  store = handleReminders('Сануул: 2026-10-02 10:00 дахин', store, emptyPersonal(), now)!.store;
  for (let i = 51; i <= 60; i++) store = handleReminders(`Сануул: 2026-10-03 ${i - 40}:00 дахин ${i}`, store, emptyPersonal(), now)!.store;
  for (let i = 51; i <= 60; i++) store = handleReminders(`Сануулга ${i} устга`, store, emptyPersonal(), now)!.store;
  assert.equal(store.items.filter((r) => r.status === 'cancelled').length, 50);
  assert.equal(store.items.filter((r) => r.status === 'scheduled').length, 1);
  assert.equal(store.nextId, 62);
  assert.ok(!store.items.some((r) => r.id === '1'));
});

test('Reminders of a day appear in that day\'s plan, after the tasks', () => {
  let tasks = handlePersonal('Маргааш хийх: дэлгүүр орох', emptyPersonal(), now)!.state;
  let store = handleReminders('Сануул: маргааш 18:00 гэрлүү залгах', emptyReminders(), tasks, now)!.store;
  store = handleReminders('Сануул: маргааш 09:00 өглөөний уулзалт', store, tasks, now)!.store;
  store = handleReminders('Сануул: 2026-10-05 09:00 хол', store, tasks, now)!.store;
  const plan = handlePersonal('Маргаашийн төлөвлөгөө', tasks, now, store.items)!.reply;
  assert.match(plan, /^1\. дэлгүүр орох · 2026-09-20\n\nСануулга:\nСануулга 2 · 09:00 · өглөөний уулзалт\nСануулга 1 · 18:00 · гэрлүү залгах\n\nОгноог/);
  assert.doesNotMatch(handlePersonal('Өнөөдрийн төлөвлөгөө', tasks, now, store.items)!.reply, /Сануулга/);
  assert.doesNotMatch(handlePersonal('Миний ажлууд', tasks, now, store.items)!.reply, /Сануулга/);
  const cancelled = handleReminders('Сануулга 1 устга', store, tasks, now)!.store;
  assert.doesNotMatch(handlePersonal('Маргаашийн төлөвлөгөө', tasks, now, cancelled.items)!.reply, /гэрлүү/);
  tasks = handlePersonal('Ажил нэм: хугацаагүй', tasks, now)!.state;
  assert.match(handlePersonal('Маргаашийн төлөвлөгөө', tasks, now, emptyReminders().items)!.reply, /^1\. дэлгүүр орох · 2026-09-20\n\nОгноог/);
});

test('A tapped notification fires the reminder once; "Дууссан" closes it and its task, "30 мин дараа" moves it ahead', () => {
  const tasks = personal();
  const store = attachNotification(handleReminders('Ажил 1-ийг маргааш 09:30-д сануул', emptyReminders(), tasks, now)!.store, '1', 'n-1');
  const fired = markFired(store, '1');
  assert.equal(fired.changed, true);
  assert.equal(fired.store.items[0].status, 'fired');
  assert.equal(fired.store.items[0].notificationId, null);
  assert.equal(markFired(fired.store, '1').changed, false);
  assert.equal(markFired(fired.store, '7').changed, false);
  assert.equal(reminderQuestion(fired.store.items[0]), 'Сануулга: дугуй засвар руу залгах (Ажил 1)');
  assert.match(handleReminders('Сануулгууд', fired.store, tasks, now)!.reply, /ирсэн/);
  assert.match(handlePersonal('Маргаашийн төлөвлөгөө', tasks, now, fired.store.items)!.reply, /Сануулга 1 · 09:30/);

  const later = new Date('2026-09-20T01:30:00Z');
  const done = answerReminder(fired.store, tasks, '1', 'done', later);
  assert.equal(done.store.items[0].status, 'done');
  assert.equal(done.personal.tasks[0].done, true);
  assert.deepEqual(done.actions, [{ kind: 'task_done', id: '1' }]);
  assert.equal(done.schedule, undefined);
  assert.match(done.reply, /Ажил 1-ийг ч дууссан/);
  assert.match(handleReminders('Сануулгууд', done.store, done.personal, later)!.reply, /сануулга алга/);
  // A reminder without a task, or whose task is already done, changes only itself.
  const plain = answerReminder(markFired(handleReminders('Сануул: маргааш 10:00 юм', emptyReminders(), tasks, now)!.store, '1').store, tasks, '1', 'done', later);
  assert.equal(plain.personal, tasks);
  assert.deepEqual(plain.actions, []);
  assert.equal(plain.reply, 'Дууссан гэж тэмдэглэлээ.');

  const snoozed = answerReminder(fired.store, tasks, '1', 'snooze', later);
  assert.equal(snoozed.store.items[0].status, 'scheduled');
  assert.equal(snoozed.store.items[0].at, '2026-09-20T10:00:00+08:00');
  assert.equal(snoozed.store.items[0].notificationId, null);
  assert.equal(snoozed.schedule, '1');
  assert.equal(snoozed.personal, tasks);
  assert.deepEqual(snoozed.actions, [{ kind: 'reminder_set', id: '1' }]);
  assert.equal(snoozed.reply, '10:00-д дахин сануулна.');
  assert.deepEqual(answerReminder(done.store, tasks, '1', 'done', later).actions, []);
  assert.equal(answerReminder(done.store, tasks, '1', 'snooze', later).store, done.store);
});

test('The store survives a round trip and a corrupt one is rejected, not silently reset', () => {
  const store = attachNotification(handleReminders('Ажил 1-ийг маргааш 09:30-д сануул', emptyReminders(), personal(), now)!.store, '1', 'n-1');
  assert.deepEqual(restoreReminders(JSON.parse(JSON.stringify(store))), store);
  assert.deepEqual(restoreReminders(JSON.parse(JSON.stringify(emptyReminders()))), emptyReminders());
  const item = store.items[0];
  const broken: unknown[] = [
    null,
    { version: 2, nextId: 2, items: [item] },
    { version: 1, nextId: 0, items: [] },
    { version: 1, nextId: 1, items: [item] },
    { version: 1, nextId: 2, items: [item, item] },
    { version: 1, nextId: 2, items: [{ ...item, at: '2026-09-20T09:30:00Z' }] },
    { version: 1, nextId: 2, items: [{ ...item, at: '2026-02-30T09:30:00+08:00' }] },
    { version: 1, nextId: 2, items: [{ ...item, status: 'snoozed' }] },
    { version: 1, nextId: 2, items: [{ ...item, notificationId: '' }] },
    { version: 1, nextId: 2, items: [{ ...item, notificationId: undefined }] },
    { version: 1, nextId: 2, items: [{ ...item, text: ' ' }] },
    { version: 1, nextId: 2, items: [{ ...item, taskId: 'x' }] },
    { version: 1, nextId: 2, items: [{ ...item, createdAt: 'yesterday' }] },
  ];
  for (const raw of broken) assert.throws(() => restoreReminders(raw), JSON.stringify(raw));
});

test('AC 13.5: cancel-all cancels every scheduled notification through the adapter and empties the store', async () => {
  let store = emptyReminders();
  for (const text of ['Сануул: маргааш 10:00 нэг', 'Сануул: маргааш 11:00 хоёр', 'Сануул: маргааш 12:00 гурав']) store = handleReminders(text, store, emptyPersonal(), now)!.store;
  store = attachNotification(attachNotification(store, '1', 'n-1'), '3', 'n-3');
  const { adapter, calls } = fakeAdapter();
  const cleared = await cancelAllReminders(store, adapter);
  assert.deepEqual(calls.cancel, ['n-1', 'n-3']);
  assert.equal(calls.cancelAll, 1);
  assert.deepEqual(cleared, emptyReminders());
  // One failing cancel does not stop the rest; the web has nothing to cancel.
  const failing: NotificationAdapter = { ...adapter, cancel: async (id) => {
    calls.cancel.push(id);
    throw new Error('gone');
  } };
  assert.deepEqual(await cancelAllReminders(store, failing), emptyReminders());
  assert.equal(calls.cancelAll, 2);
  const web = fakeAdapter(false);
  await cancelAllReminders(store, web.adapter);
  assert.deepEqual(web.calls, { cancel: [], cancelAll: 0 });
  const stored: ReminderStore = cleared;
  assert.equal(stored.items.length, 0);
});

test('Section 19: "Төлбөр N-ийг сануул" sets a reminder for the due day at 10:00 and names the payment', () => {
  let payments = emptyPayments();
  for (const command of ['Төлбөр нэм: түрээс 450000 5', 'Төлбөр нэм: интернет 35000 20']) {
    payments = handlePayments(command, payments, now)!.store;
  }
  // 2026-09-19 01:00 Ulaanbaatar: the 20th is tomorrow, the 5th has passed, so it goes to October.
  const soon = handleReminders('Төлбөр 2-ийг сануул', emptyReminders(), emptyPersonal(), now, payments.items);
  assert.ok(soon);
  const item = soon.store.items[0];
  assert.equal(item.at, '2026-09-20T10:00:00+08:00');
  assert.equal(item.text, 'интернет төлөх');
  assert.equal(item.paymentId, '2');
  assert.equal(item.taskId, undefined);
  assert.match(soon.reply, /Төлбөр 2: интернет төлөх/);
  assert.deepEqual(soon.action, { kind: 'reminder_set', id: '1' });
  const later = handleReminders('Төлбөр 1-ийг сануул', soon.store, emptyPersonal(), now, payments.items);
  assert.equal(later?.store.items[1].at, '2026-10-05T10:00:00+08:00');
  // The list names the payment it came from, and the same one twice is refused.
  assert.match(handleReminders('Сануулгууд', later!.store, emptyPersonal(), now)!.reply, /интернет төлөх \(Төлбөр 2\)/);
  assert.match(handleReminders('Төлбөр 2-ийг сануул', later!.store, emptyPersonal(), now, payments.items)!.reply, /1 дугаартайгаар бүртгэлтэй/);
  assert.match(handleReminders('Төлбөр 9-ийг сануул', emptyReminders(), emptyPersonal(), now, payments.items)!.reply, /олдсонгүй/);
  // Typed on the due day after 10:00, it waits for the next month instead of firing in the past.
  const afterTen = new Date('2026-09-20T04:00:00Z');
  const missed = handleReminders('Төлбөр 2-ийг сануул', emptyReminders(), emptyPersonal(), afterTen, payments.items);
  assert.equal(missed?.store.items[0].at, '2026-10-20T10:00:00+08:00');
  // A saved payment reminder survives a round trip through the store.
  assert.deepEqual(restoreReminders(JSON.parse(JSON.stringify(soon.store))), soon.store);
});
