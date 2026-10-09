import test from 'node:test';
import assert from 'node:assert/strict';
import { shareText } from './share.ts';

const place = { name: 'Тавин ус эмийн сан', address: 'БЗД, 13-р хороолол', phones: ['77001234', '99112233'], mapUrl: null, latitude: 47.915, longitude: 106.951 };

test('A shared place carries its name, address, phones, map link and where to find Nomi, and never the distance', () => {
  assert.equal(
    shareText(place, 'https://nomi.expo.app'),
    [
      'Nomi-гоор олсон: Тавин ус эмийн сан',
      'БЗД, 13-р хороолол',
      'Утас: 77001234, 99112233',
      'Газрын зураг: https://www.google.com/maps/search/?api=1&query=47.915,106.951',
      'Nomi: https://nomi.expo.app',
    ].join('\n')
  );
  assert.doesNotMatch(shareText(place), /км|мин| м\b/);
});

test('Missing parts are left out rather than shown empty', () => {
  assert.equal(shareText({ ...place, address: '  ', phones: [], latitude: null, longitude: null }), 'Nomi-гоор олсон: Тавин ус эмийн сан');
});
