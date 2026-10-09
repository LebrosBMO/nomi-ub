import test from 'node:test';
import assert from 'node:assert/strict';
import { counterKey, isEventKind, monthInUB, previousMonth, readCounts, summaryLine } from './counters.ts';

test('A count belongs to the Ulaanbaatar month, so an evening in UTC is already the next month here', () => {
  assert.equal(monthInUB(new Date('2026-10-09T03:00:00Z')), '2026-10');
  // 2026-09-30 17:00 UTC is 2026-10-01 01:00 in Ulaanbaatar.
  assert.equal(monthInUB(new Date('2026-09-30T17:00:00Z')), '2026-10');
  assert.equal(monthInUB(new Date('2026-09-30T15:59:00Z')), '2026-09');
  assert.equal(counterKey('apteka:2086', '2026-10'), 'c:apteka:2086:2026-10');
  assert.equal(previousMonth('2026-10'), '2026-09');
  assert.equal(previousMonth('2026-01'), '2025-12');
  assert.equal(previousMonth(monthInUB(new Date('2026-03-15T03:00:00Z'))), '2026-02');
});

test('Only the known kinds are counted, and anything unreadable in the hash counts as zero', () => {
  for (const kind of ['view', 'open', 'call', 'map', 'share']) assert.ok(isEventKind(kind));
  for (const kind of ['order', '', 'VIEW', null, 7]) assert.ok(!isEventKind(kind));
  assert.deepEqual(readCounts({ view: '312', call: '14' }), { view: 312, open: 0, call: 14, map: 0, share: 0 });
  assert.deepEqual(readCounts({}), { view: 0, open: 0, call: 0, map: 0, share: 0 });
  assert.deepEqual(readCounts({ view: 'хоёр', call: '-3', share: '1.5', order: '99' }), { view: 0, open: 0, call: 0, map: 0, share: 0 });
});

test('The report line says it in one sentence, and says it honestly when nobody called', () => {
  assert.equal(summaryLine({ view: 312, open: 0, call: 14, map: 8, share: 2 }), 'Энэ сард 312 хүн таныг харж, 14 хүн залгасан.');
  assert.equal(summaryLine({ view: 40, open: 0, call: 0, map: 0, share: 0 }), 'Энэ сард 40 хүн таныг харсан ч хэн ч залгаагүй.');
  assert.equal(summaryLine({ view: 0, open: 0, call: 0, map: 0, share: 0 }), 'Энэ сард Nomi дээр таныг хараахан хэн ч хараагүй байна.');
});
