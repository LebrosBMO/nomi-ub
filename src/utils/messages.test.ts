import test from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGE_CAP, chatExpired, messageTime, restoreMessages, storedMessage, type Message } from './messages.ts';

const message = (i: number): Message => ({ id: String(i), role: i % 2 ? 'assistant' : 'user', text: `m${i}` });

test('AC 1.2: a restored conversation never holds more than 100 messages and keeps the latest ones', () => {
  assert.equal(MESSAGE_CAP, 100);
  const saved = Array.from({ length: 150 }, (_, i) => message(i));
  const restored = restoreMessages(JSON.stringify(saved));
  assert.equal(restored.length, 100);
  assert.equal(restored[0].id, '50');
  assert.equal(restored[99].id, '149');
  assert.equal(restoreMessages(JSON.stringify(saved.slice(0, 3))).length, 3);
});

test('Restore drops malformed entries and empty or non-array stores', () => {
  assert.deepEqual(restoreMessages(null), []);
  assert.deepEqual(restoreMessages(''), []);
  assert.deepEqual(restoreMessages('{"not":"a list"}'), []);
  const mixed = [message(1), null, { id: 2, role: 'user', text: 'no' }, { id: '3', role: 'system', text: 'no' }, { id: '4', role: 'assistant' }, message(5)];
  assert.deepEqual(
    restoreMessages(JSON.stringify(mixed)).map((m) => m.id),
    ['1', '5']
  );
  assert.throws(() => restoreMessages('{broken'));
});

test('Section 7: distances stay in the session and never reach the saved conversation', () => {
  const located: Message = { id: 'a', role: 'assistant', text: 'x', places: ['p1', 'p2'], distances: { p1: 1.2, p2: null } };
  assert.deepEqual(storedMessage(located), { id: 'a', role: 'assistant', text: 'x', places: ['p1', 'p2'] });
  const plain = message(1);
  assert.equal(storedMessage(plain), plain);
  assert.ok(!JSON.stringify([located, message(1)].map(storedMessage)).includes('distances'));
  // A store written with distances (or by hand) loses them on the way in as well.
  const restored = restoreMessages(JSON.stringify([located]));
  assert.equal(restored.length, 1);
  assert.ok(!('distances' in restored[0]));
});

test('Section 20: the chat is put away after more than 2 hours, reading the time from `at` or from an old id', () => {
  const now = new Date('2026-10-06T12:00:00Z');
  const at = (ms: number) => ({ id: 'x-1', at: new Date(now.getTime() - ms).toISOString() });
  assert.equal(chatExpired([], now), false, 'an empty chat stays as it is');
  assert.equal(chatExpired([at(10 * 60000)], now), false, 'back after 10 minutes: still there');
  assert.equal(chatExpired([at(2 * 3600000)], now), false, 'exactly 2 hours: still there');
  assert.equal(chatExpired([at(2 * 3600000 + 60000)], now), true, 'over 2 hours: a fresh chat');
  // Only the last message counts: an old start with a recent reply stays.
  assert.equal(chatExpired([at(5 * 3600000), at(5 * 60000)], now), false);
  // Messages saved before `at` existed carry their time in the id.
  const oldId = (ms: number) => ({ id: `${(now.getTime() - ms).toString(36)}-0` });
  assert.equal(chatExpired([oldId(3 * 3600000)], now), true);
  assert.equal(chatExpired([oldId(30 * 60000)], now), false);
  assert.equal(chatExpired([{ id: 'not-a-time' }], now), false, 'an unreadable time keeps the chat');
  assert.equal(messageTime({ id: 'x', at: '2026-10-06T10:00:00.000Z' }), Date.parse('2026-10-06T10:00:00.000Z'));
});
