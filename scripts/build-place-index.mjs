// Writes src/data/place-index.json: the place id and name of every record in the catalog, nothing else.
// The owner API routes (src/server/portal-hosted.ts) check a place id and show a business's name with it, so the
// 4.5 MB catalog stays out of the deployed workers (265 KB instead of 5.9 MB each). Run it after every catalog
// rebuild; scripts/build-place-index.test.ts fails when the file is stale, so a forgotten run is caught by npm test.
//
//   node scripts/build-place-index.mjs [--catalog src/data/directory.json] [--out src/data/place-index.json] [--check]
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf('--' + name);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const catalogPath = resolve(root, option('catalog', 'src/data/directory.json'));
const out = resolve(root, option('out', 'src/data/place-index.json'));

/** Catalog order, so the file changes only where the catalog did. */
export const buildIndex = (catalog) => Object.fromEntries(catalog.map((record) => [record.id, record.name]));
/** One entry per line, so a rebuild reads as a line diff. */
export const serializeIndex = (index) => JSON.stringify(index, null, 1) + '\n';

const index = serializeIndex(buildIndex(JSON.parse(await readFile(catalogPath, 'utf8'))));
const current = await readFile(out, 'utf8').catch(() => '');
if (args.includes('--check')) {
  if (index !== current) {
    console.error(`${out} is stale. Run: node scripts/build-place-index.mjs`);
    process.exit(1);
  }
} else if (index !== current) {
  await writeFile(out, index, 'utf8');
}
console.log(JSON.stringify({out: out.replace(root, ''), places: Object.keys(JSON.parse(index)).length, written: index !== current && !args.includes('--check')}, null, 0));
