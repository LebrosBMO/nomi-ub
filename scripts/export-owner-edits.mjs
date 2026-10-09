// Pulls the approved owner corrections from the admin API (GET /api/admin/claims) into data/owner-edits.json, the
// build input scripts/apply-owner-edits.mjs applies to the catalog. The token comes from the environment, never from
// the command line; data/ is a build input only (.easignore keeps it out of the app).
//
// Only what the catalog needs leaves the store: the claim id, the place id, the phones, the hours claim, the address
// note and the districts a business comes to. The owner's own name and the number Nomi called stay in the store and
// on /admin, since nothing in the app shows them.
//
//   NOMI_ADMIN_TOKEN=… node scripts/export-owner-edits.mjs [--site https://nomi-ub.expo.app] [--out data/owner-edits.json]
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf('--' + name);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const site = option('site', process.env.NOMI_SITE || 'https://nomi-ub.expo.app').replace(/\/$/, '');
const out = resolve(root, option('out', 'data/owner-edits.json'));
const limit = Number(option('limit', '500'));
const token = process.env.NOMI_ADMIN_TOKEN || '';
if (!token) {
  console.error('Set NOMI_ADMIN_TOKEN (the same value as on expo.dev) before running this.');
  process.exit(1);
}

const response = await fetch(`${site}/api/admin/claims?kind=claim&status=approved&limit=${limit}`, {headers: {Authorization: 'Bearer ' + token}});
if (!response.ok) {
  console.error(`${site} answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
  process.exit(1);
}
const body = await response.json();
const items = Array.isArray(body?.items) ? body.items : [];

/**
 * One edit per approved claim, oldest first so a later correction of the same business wins when the pass applies them.
 * `phoneVerifiedAt` is left out: the apply pass only marks a business verified when that date is there, and a phone check
 * belongs to the field tool (node scripts/export-checks.mjs), so the founder adds it by hand for a call made here.
 */
const edits = items
  .map((claim) => ({
    claimId: claim.id,
    placeId: claim.placeId ?? null,
    businessName: claim.businessName ?? '',
    category: claim.category ?? null,
    phones: Array.isArray(claim.phones) ? claim.phones : [],
    hours: claim.hours ?? '',
    address: claim.addressNote ?? '',
    serviceAreas: Array.isArray(claim.serviceAreas) ? claim.serviceAreas : [],
    createdAt: claim.createdAt ?? '',
  }))
  .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

await mkdir(dirname(out), {recursive: true});
await writeFile(out, JSON.stringify({version: 1, exportedAt: new Date().toISOString(), edits}, null, 2) + '\n', 'utf8');
const newBusinesses = edits.filter((e) => !e.placeId).length;
console.log(JSON.stringify({out: out.replace(root, ''), approved: edits.length, withPlaceId: edits.length - newBusinesses, newBusinesses}, null, 0));
if (newBusinesses) console.error(`${newBusinesses} approved claim(s) are businesses not in the catalog yet: add them to the sources, the apply pass leaves them alone.`);
