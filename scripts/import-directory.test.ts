import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The catalog fields these tests look at. */
type Row = { id: string; category: string; latitude: number | null; longitude: number | null; mapUrl: string | null; qualityFlags: string[]; verifiedAt: string | null; checkStatus: string; relatedListings?: Row[] };
type Log = { verified: number; leftOut: Record<string, number>; leftOutTotal: number; coordinatesFieldVerified: number; unmatched: string[] };

const script = fileURLToPath(new URL('./import-directory.py', import.meta.url));
/** The v1 summary's 42 tire statuses (23 confirmed, 9 closed, 1 wrong number, 3 no answer, 1 call back, 5 unchecked) in the version 2 shape. */
const fixture = fileURLToPath(new URL('./fixtures/check-summary.fixture.json', import.meta.url));

/** The first interpreter that answers: the PATH `python`, then the Windows launcher, then `python3`. */
function findPython(): { cmd: string; args: string[] } | null {
  for (const candidate of [{ cmd: 'python', args: [] }, { cmd: 'py', args: ['-3'] }, { cmd: 'python3', args: [] }]) {
    const probe = spawnSync(candidate.cmd, [...candidate.args, '--version'], { encoding: 'utf8' });
    if (!probe.error && probe.status === 0) return candidate;
  }
  return null;
}
const python = findPython();
const skip = python ? false : 'No Python interpreter found (python, py or python3)';

function build(summary: string, out: string) {
  if (!python) throw new Error(skip as string);
  const run = spawnSync(python.cmd, [...python.args, script, '--summary', summary, '--out', out], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
  assert.equal(run.status, 0, run.stderr);
  const lines = run.stdout.trim().split('\n');
  return { log: JSON.parse(lines[lines.length - 1]) as Log, rows: JSON.parse(fs.readFileSync(out, 'utf8')) as Row[], bytes: fs.readFileSync(out) };
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-import-'));
}

test('AC 5.1: with the v1 statuses as fixture, 23 tire records are verified, 10 are absent and every other record stays null', { skip }, () => {
  const dir = tempDir();
  const { rows, log } = build(fixture, path.join(dir, 'directory.json'));
  const statuses = (JSON.parse(fs.readFileSync(fixture, 'utf8')) as { records: Record<string, { status: string }> }).records;
  const verifiedIds = Object.keys(statuses).filter((id) => statuses[id].status === 'Баталгаажсан');
  const absentIds = Object.keys(statuses).filter((id) => ['Хаагдсан', 'Буруу дугаар'].includes(statuses[id].status));
  assert.equal(verifiedIds.length, 23);
  assert.equal(absentIds.length, 10);
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const id of verifiedIds) {
    const row = byId.get(id);
    assert.ok(row, id);
    assert.equal(row.category, 'tire', id);
    assert.equal(row.checkStatus, 'Баталгаажсан', id);
    assert.equal(row.verifiedAt, '2026-09-17T10:00:00.000Z', id);
  }
  for (const id of absentIds) assert.equal(byId.has(id), false, id);
  assert.equal(rows.filter((r) => r.verifiedAt !== null).length, 23);
  for (const r of rows) {
    if (verifiedIds.includes(r.id)) continue;
    assert.equal(r.verifiedAt, null, r.id);
    assert.notEqual(r.checkStatus, 'Баталгаажсан', r.id);
  }
  assert.equal(log.verified, 23);
  assert.equal(log.leftOutTotal, 10);
  assert.deepEqual(log.leftOut, { Хаагдсан: 9, 'Буруу дугаар': 1 });
  assert.deepEqual(log.unmatched, []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('AC 5.4 and the grouping and coordinate rules: two runs are byte-identical, a group inherits its check, a verified pin overwrites coordinates', { skip }, () => {
  const dir = tempDir();
  const first = build(fixture, path.join(dir, 'a.json'));
  const second = build(fixture, path.join(dir, 'b.json'));
  assert.ok(first.bytes.equals(second.bytes), 'AC 5.4: the two builds differ');

  const group = first.rows.find((r) => r.relatedListings?.length);
  assert.ok(group?.relatedListings, 'expected a phone-grouped tire record in the catalog');
  const related = group.relatedListings[0].id;
  const summary = path.join(dir, 'summary.json');
  const entry = (status: string, extra = {}) => ({ status, checkedAt: '2026-09-17', coordinateStatus: 'Шалгаагүй', ...extra });

  fs.writeFileSync(summary, JSON.stringify({ version: 2, exportedAt: '2026-09-17T12:00:00.000Z', records: { [group.id]: entry('Баталгаажсан', { coordinateStatus: 'Баталгаажсан', location: { lat: 47.91, lng: 106.88 } }), [related]: entry('Хаагдсан'), 'TIRE-9999': entry('Хаагдсан') } }), 'utf8');
  const withPin = build(summary, path.join(dir, 'c.json'));
  const built = withPin.rows.find((r) => r.id === group.id);
  assert.ok(built?.relatedListings, 'the group keeps its listings');
  assert.equal(built.checkStatus, 'Баталгаажсан');
  assert.equal(built.verifiedAt, '2026-09-17');
  assert.equal(built.relatedListings[0].checkStatus, 'Баталгаажсан', 'the related listing shares the phone that was called');
  assert.equal(built.relatedListings[0].verifiedAt, '2026-09-17');
  assert.equal(built.latitude, 47.91);
  assert.equal(built.longitude, 106.88);
  assert.equal(built.mapUrl, 'https://www.google.com/maps/search/?api=1&query=47.91,106.88');
  assert.ok(built.qualityFlags.includes('coordinates_field_verified'));
  assert.ok(!built.qualityFlags.includes('missing_coordinates'));
  assert.ok(!built.qualityFlags.includes('not_contact_verified'));
  assert.equal(withPin.log.coordinatesFieldVerified, 1);
  assert.deepEqual(withPin.log.unmatched, ['TIRE-9999']);
  assert.deepEqual(withPin.log.leftOut, {}, 'the related entry does not override the group');

  fs.writeFileSync(summary, JSON.stringify({ version: 2, exportedAt: '2026-09-17T12:00:00.000Z', records: { [related]: entry('Буруу дугаар') } }), 'utf8');
  const relatedOnly = build(summary, path.join(dir, 'd.json'));
  assert.equal(relatedOnly.rows.some((r) => r.id === group.id), false, 'a check keyed by a related listing applies to the group when the group has none');
  assert.deepEqual(relatedOnly.log.leftOut, { 'Буруу дугаар': 1 });
  fs.rmSync(dir, { recursive: true, force: true });
});
