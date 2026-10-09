import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Summary = { version: number; exportedAt: string; records: Record<string, Record<string, unknown>> };

const script = fileURLToPath(new URL('./export-checks.mjs', import.meta.url));
const live = fileURLToPath(new URL('../data/check-summary.json', import.meta.url));
/** Field-tool keys that must never leave it (AC 5.3), and the only keys a summary record may carry. */
const forbidden = ['notes', 'person', 'contact', 'permission', 'note', 'name', 'map', 'address', 'phones', 'week', 'scheduleNote', 'coordinateNote', 'locationHistory', 'receivedLocation', 'verification', 'revision'];
const allowed = ['status', 'checkedAt', 'coordinateStatus', 'location'];
const statuses = ['Шалгаагүй', 'Баталгаажсан', 'Утсаа аваагүй', 'Буруу дугаар', 'Хаагдсан', 'Дахин лавлах'];

function keysOf(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => keysOf(v, into));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { into.add(k); keysOf(v, into); }
  return into;
}

function assertClean(summary: Summary) {
  assert.equal(summary.version, 2);
  assert.ok(Number.isFinite(Date.parse(summary.exportedAt)));
  const keys = keysOf(summary);
  for (const k of forbidden) assert.ok(!keys.has(k), `forbidden key ${k}`);
  for (const [id, r] of Object.entries(summary.records)) {
    for (const k of Object.keys(r)) assert.ok(allowed.includes(k), `${id}: unexpected key ${k}`);
    assert.ok(statuses.includes(r.status as string), id);
    assert.ok(Number.isFinite(Date.parse(r.checkedAt as string)), id);
    if (r.location) assert.deepEqual(Object.keys(r.location).sort(), ['lat', 'lng'], id);
  }
}

/** A field-tool file shaped like the real one, with markers where private text would be. */
const secret = (what: string) => `SECRET_${what}`;
const week = Array.from({ length: 7 }, () => ({ state: 'Шалгаагүй', lunch: 'Шалгаагүй', open: '', close: '', lunchStart: '', lunchEnd: '' }));
const verification = (extra: Record<string, unknown>) => ({ phones: [{ phone: '99110011', status: 'Холбогдсон', contact: secret('CONTACT'), note: secret('PHONE_NOTE'), checkedAt: '2026-09-18T09:00:00.000Z' }], week, address: secret('ADDRESS'), addressStatus: 'Шалгаагүй', coordinateStatus: 'Шалгаагүй', coordinateNote: secret('COORDINATE_NOTE'), person: secret('PERSON'), date: '', scheduleNote: secret('SCHEDULE'), updatedAt: '2026-09-18T09:00:00.000Z', ...extra });
const input = { version: 1, records: {
  'TIRE-0002': { name: secret('NAME'), status: 'Хаагдсан', notes: secret('NOTES'), map: '', permission: 'Татгалзсан', revision: 2, updatedAt: '2026-09-18T09:44:41.969Z', location: null, receivedLocation: { lat: 47.92, lng: 106.91, accuracy: 12, method: 'gps', receivedAt: '2026-09-18T08:00:00.000Z' }, verification: verification({}) },
  'TIRE-0001': { name: secret('NAME'), status: 'Баталгаажсан', notes: secret('NOTES'), map: 'https://maps.example/x', permission: 'Зөвшөөрсөн', revision: 5, updatedAt: '2026-09-18T10:00:00.000Z', location: { lat: 47.9, lng: 106.9 }, locationSavedAt: '2026-09-18T10:00:00.000Z', locationHistory: [{ location: null, savedAt: null, replacedAt: '2026-09-18T10:00:00.000Z' }], verification: verification({ date: '2026-09-16', coordinateStatus: 'Баталгаажсан' }) },
  'TIRE-0003': { name: secret('NAME'), status: 'Шалгаагүй', notes: '', map: '', permission: 'Лавлаагүй', revision: 0, updatedAt: '2026-09-18T11:00:00.000Z', location: null },
} };

test('AC 5.3: the export keeps only status, check date, coordinate status and the pin', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-export-'));
  const inFile = path.join(dir, 'place-check.json');
  const outFile = path.join(dir, 'nested', 'check-summary.json');
  fs.writeFileSync(inFile, JSON.stringify(input), 'utf8');
  const run = spawnSync(process.execPath, [script, '--input', inFile, '--out', outFile], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const text = fs.readFileSync(outFile, 'utf8');
  assert.ok(!text.includes('SECRET_'), 'private text leaked');
  const summary = JSON.parse(text) as Summary;
  assertClean(summary);
  assert.deepEqual(Object.keys(summary.records), ['TIRE-0001', 'TIRE-0002', 'TIRE-0003'], 'ids are sorted');
  assert.deepEqual(summary.records['TIRE-0001'], { status: 'Баталгаажсан', checkedAt: '2026-09-16', coordinateStatus: 'Баталгаажсан', location: { lat: 47.9, lng: 106.9 } }, 'the typed check date wins');
  assert.deepEqual(summary.records['TIRE-0002'], { status: 'Хаагдсан', checkedAt: '2026-09-18T09:44:41.969Z', coordinateStatus: 'Шалгаагүй', location: { lat: 47.92, lng: 106.91 } }, 'updatedAt otherwise; a received pin keeps only lat and lng');
  assert.deepEqual(summary.records['TIRE-0003'], { status: 'Шалгаагүй', checkedAt: '2026-09-18T11:00:00.000Z', coordinateStatus: 'Шалгаагүй' });
  const lines = run.stdout.trim().split('\n');
  assert.deepEqual(JSON.parse(lines[lines.length - 1]).byStatus, { Баталгаажсан: 1, Хаагдсан: 1, Шалгаагүй: 1 });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('AC 5.3: data/check-summary.json, the summary the catalog was built from, is clean', { skip: fs.existsSync(live) ? false : 'data/check-summary.json has not been exported' }, () => {
  assertClean(JSON.parse(fs.readFileSync(live, 'utf8')) as Summary);
});
