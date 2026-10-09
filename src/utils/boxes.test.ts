import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addBox,
  addSpending,
  categoryOf,
  deleteEntry,
  emptyBoxes,
  handleBoxes,
  monthSummary,
  parseAmount,
  restoreBoxes,
  spendingBox,
  TEMPLATES,
  type BoxStore,
} from './boxes.ts';

/** 2026-10-01 10:00 in Ulaanbaatar. */
const now = new Date('2026-10-01T02:00:00Z');
const run = (text: string, store: BoxStore, at = now) => handleBoxes(text, store, at);
function after(commands: string[], at = now) {
  let store = emptyBoxes();
  for (const command of commands) {
    const result = run(command, store, at);
    assert.ok(result, command);
    store = result.store;
  }
  return store;
}

test('AC 21.1: "Зардал: 15000 хоол" saves an entry, making the spending box on the way, and says the month total', () => {
  const result = run('Зардал: 15000 хоол', emptyBoxes());
  assert.ok(result);
  assert.equal(result.changed, true);
  const box = spendingBox(result.store);
  assert.ok(box);
  assert.equal(box.def.name, 'Зардал');
  assert.deepEqual(box.entries.map((e) => [e.amount, e.category, e.day]), [[15000, 'Хоол', '2026-10-01']]);
  assert.deepEqual(result.action, { kind: 'entry_add', id: '2' });
  assert.match(result.reply, /Хоол · 15,000₮/);
  assert.match(result.reply, /Энэ сар нийт 15,000₮/);
  assert.match(result.reply, /шинэ бүртгэл/);
  // The second entry does not announce the box again.
  assert.doesNotMatch(run('Зардал: 8000 такси', result.store)!.reply, /шинэ бүртгэл/);
});

test('Section 21: amounts and categories as people write them', () => {
  assert.equal(parseAmount('15000'), 15000);
  assert.equal(parseAmount('15,000'), 15000);
  assert.equal(parseAmount('15к'), 15000);
  assert.equal(parseAmount('15k'), 15000);
  assert.equal(parseAmount('8000₮'), 8000);
  assert.equal(parseAmount('8000төг'), 8000);
  assert.ok(Number.isNaN(parseAmount('хоол')));
  const categories = TEMPLATES.spending.categories;
  assert.equal(categoryOf('такси', categories), 'Унаа');
  assert.equal(categoryOf('Кофе', categories), 'Хоол');
  assert.equal(categoryOf('эрүүл мэнд', categories), 'Эрүүл мэнд');
  assert.equal(categoryOf('ном', categories), null);

  const store = after([
    '8000₮ такси',
    'Зардал: 12к кофе найзтайгаа',
    'Зардал: хоол 20000',
    'Зардал: 35000 эрүүл мэнд шүдний эмч',
    'Зардал: 9000 ном',
    '5000 төгрөг кино',
  ]);
  const entries = spendingBox(store)!.entries.map((e) => [e.amount, e.category, e.note ?? '']);
  assert.deepEqual(entries, [
    [8000, 'Унаа', ''],
    [12000, 'Хоол', 'найзтайгаа'],
    [20000, 'Хоол', ''],
    [35000, 'Эрүүл мэнд', 'шүдний эмч'],
    // An unknown word is kept as the note under "Бусад", not lost.
    [9000, 'Бусад', 'ном'],
    [5000, 'Зугаа', ''],
  ]);
});

test('Section 21: a bare number is never spending — "15 хороолол эмийн сан" is a search', () => {
  assert.equal(run('15 хороолол эмийн сан', emptyBoxes()), null);
  assert.equal(run('15000 хоол', emptyBoxes()), null);
  assert.equal(run('Төлбөр нэм: түрээс 450000 5', emptyBoxes()), null);
  assert.equal(run('Ажил нэм: дэлгүүр орох', emptyBoxes()), null);
  const vague = run('Зардал юу байна', emptyBoxes());
  assert.equal(vague?.changed, false);
  assert.match(vague!.reply, /Юу ч хадгалаагүй/);
  assert.match(run('Зардал: хэд хэдэн', emptyBoxes())!.reply, /Дүнг ойлгосонгүй/);
  assert.equal(run('Зардал: 0 хоол', emptyBoxes())?.changed, false);
});

test('AC 21.2: "Зардал" shows this month by category, largest first, with the latest entries', () => {
  // One entry last month, which counts in "latest" but not in this month's total.
  let store = after(['Зардал: 50000 дэлгүүр'], new Date('2026-09-28T02:00:00Z'));
  for (const command of ['Зардал: 15000 хоол', '8000₮ такси', 'Зардал: 20000 хоол'])
    store = run(command, store)!.store;
  const summary = monthSummary(spendingBox(store)!, now);
  assert.equal(summary.total, 43000);
  assert.equal(summary.count, 3);
  assert.deepEqual(summary.categories, [
    { category: 'Хоол', amount: 35000 },
    { category: 'Унаа', amount: 8000 },
  ]);
  assert.equal(summary.latest[0].amount, 20000);
  const reply = run('Зардал', store)!.reply;
  assert.match(reply, /^Энэ сар: 43,000₮ · 3 удаа/);
  assert.match(reply, /Хоол · 35,000₮\nУнаа · 8,000₮/);
  assert.match(reply, /Дэлгүүр · 50,000₮ · 2026-09-28/);
  assert.match(run('Зардал', emptyBoxes())!.reply, /Одоогоор зардал бүртгээгүй/);
});

test('Section 21: an entry is deleted by number; the box stays', () => {
  const store = after(['Зардал: 15000 хоол', 'Зардал: 8000 такси']);
  const gone = run('Зардал 2 устга', store);
  assert.deepEqual(gone?.action, { kind: 'entry_delete', id: '2' });
  assert.deepEqual(spendingBox(gone!.store)!.entries.map((e) => e.id), ['3']);
  assert.equal(run('Зардал 9 устга', store)?.changed, false);
  assert.equal(deleteEntry(store, '99'), store);
});

test('Section 21: the ready-made box is added once, and the form path saves like the chat', () => {
  const made = addBox(emptyBoxes(), 'spending', now);
  assert.equal(made.store.boxes.length, 1);
  assert.equal(addBox(made.store, 'spending', now).store, made.store, 'a second tap adds nothing');
  const viaForm = addSpending(made.store, { amount: 15000, category: 'Хоол' }, now);
  assert.ok(!('error' in viaForm));
  assert.deepEqual(spendingBox(viaForm.store)!.entries.map((e) => [e.amount, e.category]), [[15000, 'Хоол']]);
  assert.ok('error' in addSpending(made.store, { amount: -5, category: 'Хоол' }, now));
});

test('AC 21.3: a corrupt store is rejected rather than silently emptied', () => {
  const store = after(['Зардал: 15000 хоол кофе']);
  assert.deepEqual(restoreBoxes(JSON.parse(JSON.stringify(store))), store);
  const broken = (change: (s: BoxStore) => unknown) => {
    const copy = JSON.parse(JSON.stringify(store)) as BoxStore;
    change(copy);
    assert.throws(() => restoreBoxes(copy));
  };
  broken((s) => (s.boxes[0].entries[0].amount = 0));
  broken((s) => ((s.boxes[0].entries[0] as { amount: unknown }).amount = '15000'));
  broken((s) => (s.boxes[0].entries[0].day = '2026-02-30'));
  broken((s) => (s.boxes[0].entries[0].id = s.boxes[0].def.id));
  broken((s) => ((s.boxes[0].def as { template: string }).template = 'unknown'));
  broken((s) => (s.nextId = 1));
  assert.throws(() => restoreBoxes(null));
});
