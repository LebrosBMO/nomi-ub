import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { interpretLocal, type Place } from './core.ts';
import { EXAMPLES, PRINCIPLES, statusLine } from './examples.ts';
import { emptyPayments, handlePayments } from './payments.ts';
import { emptyPersonal, handlePersonal } from './personal.ts';

const places = JSON.parse(fs.readFileSync(new URL('../data/directory.json', import.meta.url), 'utf8')) as Place[];

test('AC 9.2: the status line counts equal the catalog counts', () => {
  const total = places.length;
  const kinds = new Set(places.flatMap((p) => [p.category, ...(p.alsoCategories ?? [])])).size;
  assert.ok(total > 0 && kinds > 0);
  assert.equal(statusLine(places, false), `${total} газар · ${kinds} төрөл · AI холбогдоогүй`);
  assert.equal(statusLine(places, true), `${total} газар · ${kinds} төрөл · AI холбогдсон`);
  assert.match(statusLine(places, false), /^\d+ газар · \d+ төрөл · AI холбогдоогүй$/);
  assert.equal(statusLine([], false), '0 газар · 0 төрөл · AI холбогдоогүй');
  assert.equal(statusLine([{ category: 'tire' }, { category: 'tire' }], true), '2 газар · 1 төрөл · AI холбогдсон');
});

test('Every example works offline as a search or a personal command', () => {
  assert.equal(EXAMPLES.length, 7);
  assert.equal(PRINCIPLES.length, 3);
  for (const text of EXAMPLES) {
    if (handlePayments(text, emptyPayments())) continue;
    const personal = handlePersonal(text, emptyPersonal());
    if (personal) continue;
    const intent = interpretLocal(text);
    assert.equal(intent.action, 'search', text);
    assert.ok(intent.category, text);
  }
  assert.equal(interpretLocal('БЗД эмийн сан').district, 'БЗД');
  assert.equal(interpretLocal('Ойрхон дугуй засвар').nearby, true);
  assert.equal(interpretLocal('ХУД будаг зардаг газар').category, 'materials');
  assert.equal(interpretLocal('СБД шүдний эмнэлэг').category, 'dentist');
  assert.equal(interpretLocal('БГД нотариат').category, 'notary');
  assert.equal(handlePersonal('Маргааш хийх: дугуй засвар руу залгах', emptyPersonal())?.changed, true);
  assert.equal(handlePersonal('Санаж ав: миний машин Prius', emptyPersonal())?.changed, true);
  assert.equal(handlePersonal('Өнөөдрийн төлөвлөгөө', emptyPersonal())?.changed, false);
  assert.equal(handlePayments('Төлбөр нэм: түрээс 450000 5', emptyPayments())?.changed, true);
});
