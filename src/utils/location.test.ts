import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { distanceKm, findPlaces, inCategory, type Place } from './core.ts';
import { countLocated, DISTANCE_UNKNOWN, formatDistance, knownLocationLine, LOCATION_CHOICES, POSITION_TIMEOUT_MS, travelLine, withTimeout } from './location.ts';

const places = JSON.parse(fs.readFileSync(new URL('../data/directory.json', import.meta.url), 'utf8')) as Place[];
/** Sükhbaatar Square: the fixed test location. */
const SQUARE = { latitude: 47.9187, longitude: 106.9176 };

test('AC 7.2: a fixed location orders every category by ascending distance with coordinate-less records last', () => {
  for (const category of ['pharmacy', 'tire', 'materials'] as const) {
    const ranked = findPlaces(places, { category, location: SQUARE });
    const known = ranked.filter((p) => p.distance !== null);
    assert.equal(known.length, countLocated(places, category), category);
    for (let i = 1; i < known.length; i++) assert.ok((known[i - 1].distance as number) <= (known[i].distance as number), category);
    // Every record without coordinates comes after every record with one.
    assert.ok(ranked.slice(known.length).every((p) => p.distance === null && p.latitude === null), category);
    for (const p of known) assert.equal(p.distance, distanceKm(SQUARE, { latitude: p.latitude as number, longitude: p.longitude as number }));
  }
  assert.ok(countLocated(places) > 0);
  assert.equal(countLocated(places), places.filter((p) => p.latitude != null && p.longitude != null).length);

  const sample = [
    { id: 'far', latitude: 47.95, longitude: 107.0 },
    { id: 'none1', latitude: null, longitude: null },
    { id: 'near', latitude: 47.919, longitude: 106.918 },
    { id: 'none2', latitude: null, longitude: null },
    { id: 'mid', latitude: 47.93, longitude: 106.95 },
  ].map((p) => ({ ...p, name: p.id, category: 'tire', address: '', phones: [] })) as unknown as Place[];
  assert.deepEqual(
    findPlaces(sample, { location: SQUARE }).map((p) => p.id),
    ['near', 'mid', 'far', 'none1', 'none2']
  );
  // Without a location nothing is measured and the order is by name.
  assert.ok(findPlaces(sample, {}).every((p) => p.distance === null));
});

test('Distance formatting: "≈ 1.2 км", metres under a kilometre, whole kilometres from ten', () => {
  assert.equal(formatDistance(1.234), '≈ 1.2 км');
  assert.equal(formatDistance(1.26), '≈ 1.3 км');
  assert.equal(formatDistance(0.349), '≈ 350 м');
  assert.equal(formatDistance(0.004), '≈ 10 м');
  assert.equal(formatDistance(0), '≈ 10 м');
  assert.equal(formatDistance(0.96), '≈ 1.0 км');
  assert.equal(formatDistance(9.96), '≈ 10 км');
  assert.equal(formatDistance(12.6), '≈ 13 км');
  assert.equal(formatDistance(Number.NaN), DISTANCE_UNKNOWN);
  assert.equal(formatDistance(-1), DISTANCE_UNKNOWN);
});

test('The known-location count comes from the catalog and its line never shows a typed number', () => {
  const pharmacies = countLocated(places, 'pharmacy');
  assert.equal(knownLocationLine(pharmacies), `${pharmacies} газрын байршил мэдэгдэж байна.`);
  assert.equal(countLocated(places, 'materials'), places.filter((p) => inCategory(p, 'materials') && p.latitude != null && p.longitude != null).length);
  assert.ok(!/\d/.test(knownLocationLine(0)));
  assert.deepEqual(
    LOCATION_CHOICES.map((c) => c.label),
    ['Зөвшөөрөх', 'Дүүргээ хэлье']
  );
});

test('A slow fix is dropped after the timeout; a quick answer or failure passes through', async () => {
  assert.equal(POSITION_TIMEOUT_MS, 10_000);
  assert.equal(await withTimeout(Promise.resolve(1), 50), 1);
  await assert.rejects(withTimeout(new Promise<never>(() => {}), 10), /timeout/);
  await assert.rejects(withTimeout(Promise.reject(new Error('gps')), 50), /gps/);
});

test('Travel time on the card: one estimate, on foot under a kilometre and by car from there, rounded so it reads as an estimate', () => {
  assert.equal(travelLine(0.45), 'алхаж ~8 мин');
  assert.equal(travelLine(0.05), 'алхаж ~1 мин');
  assert.equal(travelLine(0.94), 'алхаж ~15 мин');
  // 0.96 km is shown as "≈ 1.0 км", so it already counts as a drive.
  assert.equal(travelLine(0.96), 'машинаар ~5 мин');
  assert.equal(travelLine(1.8), 'машинаар ~9 мин');
  assert.equal(travelLine(5), 'машинаар ~25 мин');
  assert.equal(travelLine(12), 'машинаар ~55 мин');
  assert.equal(travelLine(Number.NaN), '');
  assert.equal(travelLine(-1), '');
});
