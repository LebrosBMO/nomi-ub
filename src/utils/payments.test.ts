import test from 'node:test';
import assert from 'node:assert/strict';
import {
  describePayment,
  duePayments,
  dueDate,
  emptyPayments,
  formatAmount,
  handlePayments,
  monthInUB,
  monthTotals,
  nextDue,
  PAYMENT_CAP,
  restorePayments,
  type PaymentStore,
} from './payments.ts';

/** 2026-09-19 10:00 Ulaanbaatar. */
const now = new Date('2026-09-19T02:00:00Z');
const run = (text: string, store: PaymentStore, at = now) => handlePayments(text, store, at);
/** The store after a list of commands, each of which must be understood. */
function after(commands: string[], at = now) {
  let store = emptyPayments();
  for (const command of commands) {
    const result = run(command, store, at);
    assert.ok(result, command);
    store = result.store;
  }
  return store;
}

test('AC 19.1: a monthly payment is saved with its name, amount and day, and the reply says how to mark it paid', () => {
  const result = run('Төлбөр нэм: түрээс 450000 5', emptyPayments());
  assert.ok(result);
  assert.equal(result.changed, true);
  assert.deepEqual(result.action, { kind: 'payment_add', id: '1' });
  const item = result.store.items[0];
  assert.equal(item.name, 'түрээс');
  assert.equal(item.amount, 450000);
  assert.equal(item.day, 5);
  assert.deepEqual(item.paid, []);
  assert.match(result.reply, /450,000₮/);
  assert.match(result.reply, /Төлбөр 1 төлсөн/);
  // Written amounts and the "сар бүр … -нд" wording parse the same way.
  const spelled = run('Төлбөр нэм: Интернет 35,000₮ сар бүр 20-нд', emptyPayments());
  assert.deepEqual(spelled?.store.items[0], { ...spelled!.store.items[0], name: 'Интернет', amount: 35000, day: 20 });
});

test('Section 19: the amount and the day are checked, and the same name is not saved twice', () => {
  const store = after(['Төлбөр нэм: түрээс 450000 5']);
  for (const [command, pattern] of [
    ['Төлбөр нэм: зээл 0 5', /Дүнг тоогоор/],
    ['Төлбөр нэм: зээл 450000 0', /1-31/],
    ['Төлбөр нэм: зээл 450000 32', /1-31/],
    ['Төлбөр нэм: зээл', /Ойлгосонгүй/],
  ] as const) {
    const result = run(command, store);
    assert.ok(result, command);
    assert.equal(result.changed, false, command);
    assert.match(result.reply, pattern);
  }
  const duplicate = run('Төлбөр нэм: Түрээс 500000 7', store);
  assert.equal(duplicate?.changed, false);
  assert.match(duplicate!.reply, /1 дугаартайгаар бүртгэлтэй/);
});

test('AC 19.2: "төлсөн" marks only this month, "төлөөгүй" takes it back, and the reply carries the monthly totals', () => {
  let store = after(['Төлбөр нэм: түрээс 450000 5', 'Төлбөр нэм: интернет 35000 20']);
  const paid = run('Төлбөр 1 төлсөн', store);
  assert.deepEqual(paid?.action, { kind: 'payment_paid', id: '1' });
  assert.deepEqual(paid!.store.items[0].paid, ['2026-09']);
  assert.match(paid!.reply, /нийт 485,000₮ · төлсөн 450,000₮ · үлдсэн 35,000₮/);
  store = paid!.store;
  // The same command twice changes nothing and says so.
  const again = run('Төлбөр 1 төлсөн', store);
  assert.equal(again?.changed, false);
  assert.match(again!.reply, /аль хэдийн/);
  // Next month it is unpaid again, without anything being written.
  const nextMonth = new Date('2026-10-02T02:00:00Z');
  assert.match(describePayment(store.items[0], nextMonth), /төлөөгүй/);
  const undone = run('Төлбөр 1 төлөөгүй', store);
  assert.deepEqual(undone?.action, { kind: 'payment_unpaid', id: '1' });
  assert.deepEqual(undone!.store.items[0].paid, []);
});

test('AC 19.3: the list shows every payment with its state, and the month totals', () => {
  const store = after(['Төлбөр нэм: түрээс 450000 5', 'Төлбөр нэм: интернет 35000 20', 'Төлбөр нэм: гар утас 25000 19']);
  const list = run('Төлбөрүүд', store);
  assert.ok(list);
  assert.equal(list.changed, false);
  const rows = list.reply.split('\n');
  // Sorted by the day of the month: 5, 19, 20.
  assert.match(rows[0], /^1\. түрээс · 450,000₮ · сар бүр 5-нд · хугацаа хэтэрсэн$/);
  assert.match(rows[1], /^3\. гар утас · 25,000₮ · сар бүр 19-нд · өнөөдөр төлөх$/);
  assert.match(rows[2], /^2\. интернет · 35,000₮ · сар бүр 20-нд · төлөөгүй$/);
  assert.match(list.reply, /нийт 510,000₮ · төлсөн 0₮ · үлдсэн 510,000₮/);
  assert.match(run('Сарын нийт', store)!.reply, /нийт 510,000₮/);
  assert.match(run('Төлбөрүүд', emptyPayments())!.reply, /Одоогоор бүртгэсэн төлбөр алга/);
});

test('Section 19: a payment is deleted by number, and an unknown number changes nothing', () => {
  const store = after(['Төлбөр нэм: түрээс 450000 5']);
  const gone = run('Төлбөр 1 устга', store);
  assert.deepEqual(gone?.action, { kind: 'payment_delete', id: '1' });
  assert.deepEqual(gone!.store.items, []);
  const missing = run('Төлбөр 7 төлсөн', store);
  assert.equal(missing?.changed, false);
  assert.match(missing!.reply, /олдсонгүй/);
});

test('Section 19: a day the month is too short for falls on its last day', () => {
  assert.equal(dueDate('2026-09', 31), '2026-09-30');
  assert.equal(dueDate('2027-02', 31), '2027-02-28');
  assert.equal(dueDate('2028-02', 31), '2028-02-29');
  assert.equal(dueDate('2026-10', 5), '2026-10-05');
  assert.match(run('Төлбөр нэм: зээл 300000 31', emptyPayments())!.reply, /Богино сард сүүлийн өдрөөр/);
});

test('Section 19: the plan asks for what is due and unpaid, and a paid one drops out', () => {
  const store = after(['Төлбөр нэм: түрээс 450000 5', 'Төлбөр нэм: интернет 35000 20', 'Төлбөр нэм: гар утас 25000 19']);
  // On the 19th: the 5th has passed, the 19th is today, the 20th has not come.
  assert.deepEqual(duePayments(store.items, now).map((p) => p.id), ['1', '3']);
  const paid = run('Төлбөр 1 төлсөн', store)!.store;
  assert.deepEqual(duePayments(paid.items, now).map((p) => p.id), ['3']);
  assert.deepEqual(duePayments(store.items, new Date('2026-09-01T02:00:00Z')), []);
});

test('Section 19: totals, amount formatting and the Ulaanbaatar month', () => {
  const store = after(['Төлбөр нэм: түрээс 450000 5', 'Төлбөр нэм: интернет 35000 20']);
  assert.deepEqual(monthTotals(store.items, '2026-09'), { total: 485000, paid: 0, left: 485000 });
  assert.equal(formatAmount(450000), '450,000₮');
  assert.equal(formatAmount(700), '700₮');
  // 2026-09-30 17:00 UTC is already the 1st of October in Ulaanbaatar.
  assert.equal(monthInUB(new Date('2026-09-30T17:00:00Z')), '2026-10');
});

test('Section 19: a half-typed payment command changes nothing, and other sentences fall through', () => {
  const store = after(['Төлбөр нэм: түрээс 450000 5']);
  const vague = run('Төлбөр юу байна', store);
  assert.equal(vague?.changed, false);
  assert.match(vague!.reply, /Юу ч хадгалаагүй/);
  assert.equal(run('БЗД эмийн сан', store), null);
  assert.equal(run('Ажил нэм: дугуй засвар руу залгах', store), null);
  assert.equal(run('Сануул: маргааш 10:00 түрээс төлөх', store), null);
});

test('AC 19.4: a corrupt store is rejected rather than silently emptied', () => {
  const store = after(['Төлбөр нэм: түрээс 450000 5']);
  assert.deepEqual(restorePayments(JSON.parse(JSON.stringify(store))), store);
  const broken = (change: (s: PaymentStore) => unknown) => {
    const copy = JSON.parse(JSON.stringify(store)) as PaymentStore;
    change(copy);
    assert.throws(() => restorePayments(copy));
  };
  broken((s) => ((s.items[0] as { amount: unknown }).amount = '450000'));
  broken((s) => (s.items[0].amount = 0));
  broken((s) => (s.items[0].day = 32));
  broken((s) => (s.items[0].name = ' '));
  broken((s) => (s.items[0].paid = ['2026-13']));
  broken((s) => (s.items[0].paid = ['2026-09', '2026-09']));
  broken((s) => (s.items[0].id = '9'));
  broken((s) => (s.version = 2 as 1));
  assert.throws(() => restorePayments(null));
});

test('Section 19: the store stops at the cap', () => {
  let store = emptyPayments();
  for (let i = 0; i < PAYMENT_CAP; i++) {
    const result = run(`Төлбөр нэм: төлбөр${i} 1000 5`, store);
    store = result!.store;
  }
  assert.equal(store.items.length, PAYMENT_CAP);
  const full = run('Төлбөр нэм: дахиад нэг 1000 5', store);
  assert.equal(full?.changed, false);
  assert.match(full!.reply, /Хэрэггүйгээ устгаад/);
});

test('Section 19: the next due day is this month while it is ahead and unpaid, otherwise next month', () => {
  const store = after(['Төлбөр нэм: түрээс 450000 5', 'Төлбөр нэм: интернет 35000 20', 'Төлбөр нэм: зээл 300000 31']);
  const [rent, internet, loan] = store.items;
  // On the 19th of September: the 5th has gone, the 20th is tomorrow, the 31st is the 30th here.
  assert.equal(nextDue(rent, now), '2026-10-05');
  assert.equal(nextDue(internet, now), '2026-09-20');
  assert.equal(nextDue(loan, now), '2026-09-30');
  // Paid this month means next month, even when the day is still ahead.
  const paid = run('Төлбөр 2 төлсөн', store)!.store.items[1];
  assert.equal(nextDue(paid, now), '2026-10-20');
  // December rolls into the next year.
  assert.equal(nextDue(rent, new Date('2026-12-06T02:00:00Z')), '2027-01-05');
  // The 31st is still today on the 31st; in a month too short for it, it moves back to the last day.
  assert.equal(nextDue(loan, new Date('2027-01-31T14:00:00Z')), '2027-01-31');
  assert.equal(nextDue(loan, new Date('2027-02-01T02:00:00Z')), '2027-02-28');
});

test('Section 19: the list suggests marking the first unpaid payment, and nothing once all are paid', () => {
  let store = after(['Төлбөр нэм: түрээс 450000 5', 'Төлбөр нэм: интернет 35000 20']);
  store = run('Төлбөр 1 төлсөн', store)!.store;
  assert.match(run('Төлбөрүүд', store)!.reply, /“Төлбөр 2 төлсөн”/);
  store = run('Төлбөр 2 төлсөн', store)!.store;
  assert.doesNotMatch(run('Төлбөрүүд', store)!.reply, /гэж бичээрэй/);
});
