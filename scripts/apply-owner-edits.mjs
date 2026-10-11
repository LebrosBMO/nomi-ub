// Applies the approved owner corrections in data/owner-edits.json to the catalog: phones, the hours claim, the address
// and the districts a business comes to (serviceAreas, which the search reads). A separate pass after
// scripts/import-directory.py, so the full import stays byte-identical and can be re-run at any time; run this after it.
// Running it twice changes nothing.
//
// checkStatus stays "Шалгаагүй": an owner saying their own hours is not a check. Only an edit carrying phoneVerifiedAt
// (the date Nomi reached the business by phone) marks it "Баталгаажсан", the same rule the field tool's import follows.
//
// serviceStyle is the owner's own answer to how the service works, which beats the category's guess. It sets the two flags the
// card reads and nothing else: "callout" and "both" set mobile_service, "online" sets online_service (and drops the districts,
// since nobody travels), "visit" clears both.
//
//   node scripts/apply-owner-edits.mjs [--edits data/owner-edits.json] [--catalog src/data/directory.json] [--check]
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf('--' + name);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const editsPath = resolve(root, option('edits', 'data/owner-edits.json'));
const catalogPath = resolve(root, option('catalog', 'src/data/directory.json'));
const dryRun = args.includes('--check');

const districts = new Set(['БГД', 'БЗД', 'ХУД', 'СХД', 'СБД', 'ЧД', 'Налайх', 'Багануур', 'Багахангай']);
/** The same rule as the importer: 8 digits, without the country code, each number once. */
const phones = (list) => [
  ...new Set(
    (Array.isArray(list) ? list : [])
      .map((p) => String(p).replace(/\D/g, '').replace(/^976(?=\d{8}$)/, ''))
      .filter((p) => /^[5-9]\d{7}$/.test(p))
  ),
];
const text = (value) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '');
const isDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) && Number.isFinite(Date.parse(value));

const edits = JSON.parse(await readFile(editsPath, 'utf8'));
if (edits?.version !== 1 || !Array.isArray(edits.edits)) {
  console.error(`${editsPath} must be owner-edits version 1 from scripts/export-owner-edits.mjs`);
  process.exit(1);
}
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const byId = new Map(catalog.map((record) => [record.id, record]));

const applied = [];
const unmatched = [];
let newBusinesses = 0;
let verified = 0;
let comesToYou = 0;
let online = 0;
for (const edit of edits.edits) {
  if (!edit?.placeId) {
    newBusinesses++;
    continue;
  }
  const record = byId.get(edit.placeId);
  if (!record) {
    unmatched.push(edit.placeId);
    continue;
  }
  const nums = phones(edit.phones);
  if (nums.length) record.phones = nums;
  if (text(edit.hours)) record.hoursClaim = text(edit.hours);
  if (text(edit.address)) record.address = text(edit.address);
  const areas = (Array.isArray(edit.serviceAreas) ? edit.serviceAreas : []).filter((d) => districts.has(d));
  if (areas.length) record.serviceAreas = [...new Set(areas)];
  record.qualityFlags = [...new Set([...(record.qualityFlags ?? []), 'owner_corrected'])];
  if (edit.serviceStyle) {
    const goesOut = edit.serviceStyle === 'callout' || edit.serviceStyle === 'both';
    const isOnline = edit.serviceStyle === 'online';
    record.qualityFlags = record.qualityFlags.filter((flag) => flag !== 'mobile_service' && flag !== 'online_service');
    if (goesOut) record.qualityFlags.push('mobile_service');
    if (isOnline) record.qualityFlags.push('online_service');
    // Nobody travels to an online business, so a district it was listed under before says nothing true about it.
    if (isOnline) delete record.serviceAreas;
  }
  if (isDate(edit.phoneVerifiedAt)) {
    record.checkStatus = 'Баталгаажсан';
    record.verifiedAt = edit.phoneVerifiedAt;
    record.qualityFlags = record.qualityFlags.filter((flag) => flag !== 'not_contact_verified');
    verified++;
  }
  if (edit.serviceStyle === 'callout' || edit.serviceStyle === 'both') comesToYou++;
  if (edit.serviceStyle === 'online') online++;
  applied.push(edit.placeId);
}

// The same formatting as scripts/import-directory.py, so only the edited records show up in the diff.
const next = JSON.stringify(catalog, null, 2);
const changed = next !== (await readFile(catalogPath, 'utf8'));
if (changed && !dryRun) await writeFile(catalogPath, next, 'utf8');
console.log(
  JSON.stringify(
    {
      catalog: catalogPath.replace(root, ''),
      edits: edits.edits.length,
      applied: [...new Set(applied)].length,
      comesToYou: comesToYou,
      online: online,
      phoneVerified: verified,
      newBusinesses,
      unmatched: [...new Set(unmatched)].sort(),
      written: changed && !dryRun,
    },
    null,
    0
  )
);
if (unmatched.length) console.error(`Edit(s) name a place id the catalog does not have: ${[...new Set(unmatched)].sort().join(', ')}. Rebuild the catalog first.`);
