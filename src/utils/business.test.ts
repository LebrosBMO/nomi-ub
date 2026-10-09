import test from 'node:test';
import assert from 'node:assert/strict';
import { phoneDigits, readClaim, searchBusinesses } from './business.ts';
import type { Place } from './core.ts';

const place = (id: string, name: string, phones: string[], extra: Partial<Place> = {}): Place => ({
  id,
  name,
  category: 'pharmacy',
  address: 'Нарийвчилсан хаяг дутуу',
  district: 'БЗД',
  phones,
  latitude: null,
  longitude: null,
  mapUrl: null,
  sources: [],
  hoursClaim: 'Ажиллах цагийг лавлана уу',
  qualityFlags: [],
  retrievedAt: '2026-09-17',
  verifiedAt: null,
  checkStatus: 'Шалгаагүй',
  ...extra,
});
const catalog = [
  place('a', 'Монос 12 эмийн сан', ['99112233']),
  place('b', 'Хүслэн дугуй засвар', ['88445566'], { category: 'tire' }),
  place('c', 'Дугуй засвар 24', ['70114455'], { category: 'tire' }),
  place('d', 'Эмийн сан Амгалан', ['99112233']),
];
const known = (id: string) => catalog.some((p) => p.id === id);
const draft = (extra: Record<string, unknown> = {}) => ({ kind: 'claim', placeId: 'a', ownerName: 'Б. Ганбат', contactPhone: '99112233', isOwner: true, ...extra });

test('An owner finds their own listing by name, in Cyrillic or Latin, or by phone', () => {
  assert.deepEqual(searchBusinesses(catalog, 'монос').map((p) => p.id), ['a']);
  assert.deepEqual(searchBusinesses(catalog, 'dugui zasvar').map((p) => p.id), ['c', 'b']);
  // The name that starts with the first word comes first; the other one still matches.
  assert.deepEqual(searchBusinesses(catalog, 'huslen').map((p) => p.id), ['b']);
  assert.deepEqual(searchBusinesses(catalog, 'эмийн сан').map((p) => p.id), ['d', 'a']);
  // A phrase must start a word, so half a word finds nothing.
  assert.deepEqual(searchBusinesses(catalog, 'ийн сан'), []);
  // A number finds every listing that carries it, however it is typed.
  assert.deepEqual(searchBusinesses(catalog, '9911').map((p) => p.id), ['a', 'd']);
  assert.deepEqual(searchBusinesses(catalog, '+976 9911 2233').map((p) => p.id), ['a', 'd']);
  assert.deepEqual(searchBusinesses(catalog, ''), []);
  assert.deepEqual(searchBusinesses(catalog, '   '), []);
  assert.equal(searchBusinesses(catalog, 'эмийн сан', 1).length, 1);
  assert.equal(phoneDigits('+976 9911-2233'), '99112233');
});

test('A correction is taken only with the owner checkbox, a contact and 8-digit numbers', () => {
  const taken = readClaim(draft({ phones: ['+976 9911 2233', '88445566'], hours: '  Да-Ба   09:00-19:00 ' }), known);
  assert.ok('claim' in taken);
  // The numbers are stored as digits and the text is tidied, so the founder reads one shape.
  assert.deepEqual(taken.claim.phones, ['99112233', '88445566']);
  assert.equal(taken.claim.hours, 'Да-Ба 09:00-19:00');
  assert.equal(taken.claim.contactPhone, '99112233');

  const error = (body: unknown) => {
    const result = readClaim(body, known);
    return 'error' in result ? result.error : null;
  };
  assert.equal(error(draft({ isOwner: false })), 'not_owner');
  assert.equal(error(draft({ contactPhone: '123' })), 'invalid_phone');
  assert.equal(error(draft({ contactPhone: '11551155' })), 'invalid_phone');
  assert.equal(error(draft({ ownerName: '   ' })), 'missing_contact');
  assert.equal(error(draft({ phones: ['99112233', '88445566', '70114455', '99009900'] })), 'too_many_phones');
  assert.equal(error(draft({ phones: ['9911223'] })), 'invalid_phone');
  assert.equal(error(draft({ placeId: 'unknown' })), 'unknown_place');
  assert.equal(error(draft({ serviceAreas: ['БЗД', 'Дархан'] })), 'invalid_district');
  assert.equal(error(draft({ ownerName: 'х'.repeat(81) })), 'too_long');
  assert.equal(error(draft({ note: 'х'.repeat(401) })), 'too_long');
  assert.equal(error(draft({ kind: 'sponsor' })), 'invalid_kind');
  assert.equal(error('{}'), 'invalid_body');
  assert.equal(error(null), 'invalid_body');
  // The nine districts a business comes to are kept once each.
  const areas = readClaim(draft({ serviceAreas: ['БЗД', 'БЗД', 'ЧД'] }), known);
  assert.deepEqual('claim' in areas ? areas.claim.serviceAreas : null, ['БЗД', 'ЧД']);
});

test('A business that is not in the catalog yet needs a name and a registry category; a partner request needs the place', () => {
  const added = readClaim(draft({ placeId: null, businessName: 'Шинэ дугуй засвар', category: 'tire' }), known);
  assert.ok('claim' in added);
  assert.equal(added.claim.placeId, null);
  assert.equal(added.claim.category, 'tire');
  const error = (body: unknown) => {
    const result = readClaim(body, known);
    return 'error' in result ? result.error : null;
  };
  assert.equal(error(draft({ placeId: null, businessName: '' })), 'missing_business');
  assert.equal(error(draft({ placeId: null, businessName: 'Шинэ газар' })), 'invalid_category');
  assert.equal(error(draft({ placeId: null, businessName: 'Шинэ газар', category: 'no_such_category' })), 'invalid_category');
  // A partner request carries the business and a contact; the owner checkbox is not asked for there.
  const partner = readClaim({ kind: 'partner', placeId: 'a', ownerName: 'Б. Ганбат', contactPhone: '88445566' }, known);
  assert.ok('claim' in partner);
  assert.equal(partner.claim.isOwner, false);
  assert.equal(error({ kind: 'partner', placeId: null, businessName: 'Шинэ газар', category: 'tire', ownerName: 'Б', contactPhone: '88445566' }), 'unknown_place');
});
