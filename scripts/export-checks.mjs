// Exports phone-check outcomes from the field tool (../nomi-mobile) as data/check-summary.json, version 2
// (PRD Section 5). Only the status, the check date, the coordinate status and the map pin leave the field
// data. Notes, people, contacts, phone notes, permission answers, addresses, schedules and location history
// never do (AC 5.3). The summary lives outside src/ so it is never bundled; .easignore keeps it off EAS.
//
//   node scripts/export-checks.mjs [--input ../nomi-mobile/local-data/place-check.json] [--out data/check-summary.json]
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export const statuses = ['Шалгаагүй', 'Баталгаажсан', 'Утсаа аваагүй', 'Буруу дугаар', 'Хаагдсан', 'Дахин лавлах'];
const checkStates = ['Шалгаагүй', 'Баталгаажсан', 'Зөрүүтэй'];
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The check date. The date typed in the field tool's verification form is the most specific statement of when
 * the check happened, so it wins when it is set. Otherwise the record's `updatedAt`: the server writes it in
 * the same save as the outcome. Per-phone `checkedAt` values describe individual numbers, not the outcome.
 */
export function checkedAt(record) {
  const date = record.verification?.date;
  if (typeof date === 'string' && isoDate.test(date) && Number.isFinite(Date.parse(date))) return date;
  return record.updatedAt;
}

/** The business's map pin: the one placed in the tool, else the one the business sent through an invite. */
function pin(record) {
  const source = record.location ?? record.receivedLocation;
  if (!source || !Number.isFinite(source.lat) || !Number.isFinite(source.lng)) return undefined;
  return {lat: source.lat, lng: source.lng};
}

export function summarize(placeCheck, exportedAt = new Date().toISOString()) {
  if (!placeCheck || placeCheck.version !== 1 || !placeCheck.records || typeof placeCheck.records !== 'object' || Array.isArray(placeCheck.records)) {
    throw new Error('Expected place-check.json version 1 with a records object');
  }
  const records = {};
  for (const id of Object.keys(placeCheck.records).sort()) {
    const record = placeCheck.records[id];
    if (!statuses.includes(record.status)) throw new Error(`Unknown status for ${id}`);
    const coordinateStatus = record.verification?.coordinateStatus ?? 'Шалгаагүй';
    if (!checkStates.includes(coordinateStatus)) throw new Error(`Unknown coordinate status for ${id}`);
    const when = checkedAt(record);
    if (typeof when !== 'string' || !Number.isFinite(Date.parse(when))) throw new Error(`No usable check date for ${id}`);
    const location = pin(record);
    records[id] = {status: record.status, checkedAt: when, coordinateStatus, ...(location ? {location} : {})};
  }
  return {version: 2, exportedAt, records};
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? resolve(args[i + 1]) : fallback;
  };
  const input = option('--input', resolve(root, '../nomi-mobile/local-data/place-check.json'));
  const out = option('--out', resolve(root, 'data/check-summary.json'));
  const summary = summarize(JSON.parse(await readFile(input, 'utf8')));
  await mkdir(dirname(out), {recursive: true});
  await writeFile(out, JSON.stringify(summary, null, 2) + '\n', 'utf8');
  const byStatus = {};
  for (const r of Object.values(summary.records)) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  console.log(JSON.stringify({records: Object.keys(summary.records).length, byStatus, withLocation: Object.values(summary.records).filter((r) => r.location).length, out}));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
