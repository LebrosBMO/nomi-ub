import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./apply-owner-edits.mjs', import.meta.url));

type Row = { id: string; address: string; phones: string[]; hoursClaim: string; qualityFlags: string[]; verifiedAt: string | null; checkStatus: string; serviceAreas?: string[] };
type Log = { edits: number; applied: number; comesToYou: number; online: number; phoneVerified: number; newBusinesses: number; unmatched: string[]; written: boolean };

const record = (id: string, extra: Partial<Row> = {}): Row => ({
  id,
  address: 'Нарийвчилсан хаяг дутуу',
  phones: ['99000000'],
  hoursClaim: 'Ажиллах цагийг лавлана уу',
  qualityFlags: ['not_contact_verified', 'mobile_service'],
  verifiedAt: null,
  checkStatus: 'Шалгаагүй',
  ...extra,
});

function run(dir: string) {
  const result = spawnSync(process.execPath, [script, '--edits', path.join(dir, 'owner-edits.json'), '--catalog', path.join(dir, 'directory.json')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return {
    log: JSON.parse(result.stdout.trim()) as Log,
    rows: JSON.parse(fs.readFileSync(path.join(dir, 'directory.json'), 'utf8')) as Row[],
    file: fs.readFileSync(path.join(dir, 'directory.json'), 'utf8'),
    stderr: result.stderr,
  };
}

test('An approved correction reaches the catalog, an owner saying their hours is still unchecked, and a second run changes nothing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-owner-edits-'));
  const catalog = [record('tire:7'), record('apteka:2086'), record('tire:9'), record('acc:5', { serviceAreas: ['БЗД'] })];
  fs.writeFileSync(path.join(dir, 'directory.json'), JSON.stringify(catalog, null, 2), 'utf8');
  fs.writeFileSync(
    path.join(dir, 'owner-edits.json'),
    JSON.stringify(
      {
        version: 1,
        edits: [
          { claimId: 'cl_1', placeId: 'tire:7', serviceStyle: 'callout', phones: ['+976 8844 5566', '88445566', '123'], hours: 'Да-Ба  09:00-19:00', address: ' 3-р хороолол, Их дэлгүүрийн баруун талд ', serviceAreas: ['БЗД', 'БЗД', 'Дархан'] },
          { claimId: 'cl_2', placeId: 'apteka:2086', serviceStyle: 'visit', phones: [], hours: '', address: '', serviceAreas: [], phoneVerifiedAt: '2026-10-09' },
          { claimId: 'cl_3', placeId: 'tire:404', phones: ['99112233'], hours: '', address: '', serviceAreas: [] },
          { claimId: 'cl_4', placeId: null, businessName: 'Шинэ дугуй засвар', category: 'tire', phones: ['99112233'], hours: '', address: '', serviceAreas: [] },
          { claimId: 'cl_5', placeId: 'acc:5', serviceStyle: 'online', phones: [], hours: '', address: '', serviceAreas: [] },
        ],
      },
      null,
      2
    ),
    'utf8'
  );

  const first = run(dir);
  assert.deepEqual(first.log, { catalog: path.join(dir, 'directory.json'), edits: 5, applied: 3, comesToYou: 1, online: 1, phoneVerified: 1, newBusinesses: 1, unmatched: ['tire:404'], written: true } as unknown as Log);
  const [tire, pharmacy, untouched, accountant] = first.rows;
  // Phones are kept as 8 digits, each once, and a number that is not one is left out.
  assert.deepEqual(tire.phones, ['88445566']);
  assert.equal(tire.hoursClaim, 'Да-Ба 09:00-19:00');
  assert.equal(tire.address, '3-р хороолол, Их дэлгүүрийн баруун талд');
  // Only the nine districts, each once.
  assert.deepEqual(tire.serviceAreas, ['БЗД']);
  assert.ok(tire.qualityFlags.includes('owner_corrected'));
  // The owner said they go out, so the card leads with the call button and the districts (mobile_service).
  assert.ok(tire.qualityFlags.includes('mobile_service'));
  // The owner's own word is not a check.
  assert.equal(tire.checkStatus, 'Шалгаагүй');
  assert.equal(tire.verifiedAt, null);
  // A phone verification the founder dated does mark it, and drops the flag the check has made false.
  assert.equal(pharmacy.checkStatus, 'Баталгаажсан');
  assert.equal(pharmacy.verifiedAt, '2026-10-09');
  assert.ok(!pharmacy.qualityFlags.includes('not_contact_verified'));
  // And "customers come to me" takes the flag back off, whatever the category assumed.
  assert.ok(!pharmacy.qualityFlags.includes('mobile_service'));
  // An empty field leaves what the catalog had.
  assert.deepEqual(pharmacy.phones, ['99000000']);
  assert.equal(pharmacy.hoursClaim, 'Ажиллах цагийг лавлана уу');
  // A place no edit names is untouched, down to its flags.
  assert.deepEqual(untouched, record('tire:9'));
  // "Nobody travels to me": the card drops the address and the map, and the districts it was listed under say nothing true.
  assert.ok(accountant.qualityFlags.includes('online_service'));
  assert.ok(!accountant.qualityFlags.includes('mobile_service'));
  assert.equal(accountant.serviceAreas, undefined);
  assert.match(first.stderr, /tire:404/);

  const second = run(dir);
  assert.equal(second.file, first.file);
  assert.equal(second.log.written, false);
});

test('A file that is not an owner-edits export is refused rather than half applied', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-owner-edits-'));
  const catalog = JSON.stringify([record('tire:7')], null, 2);
  fs.writeFileSync(path.join(dir, 'directory.json'), catalog, 'utf8');
  fs.writeFileSync(path.join(dir, 'owner-edits.json'), JSON.stringify({ version: 2, edits: [] }), 'utf8');
  const result = spawnSync(process.execPath, [script, '--edits', path.join(dir, 'owner-edits.json'), '--catalog', path.join(dir, 'directory.json')], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /owner-edits version 1/);
  assert.equal(fs.readFileSync(path.join(dir, 'directory.json'), 'utf8'), catalog);
});
