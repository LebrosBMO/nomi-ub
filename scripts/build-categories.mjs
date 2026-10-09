// Builds src/data/categories.ts from scripts/categories.source.json (the merged category list). Run after editing the source:
// node scripts/build-categories.mjs && node scripts/export-categories.mjs && python scripts/import-directory.py
import fs from 'node:fs';

const src = JSON.parse(fs.readFileSync(new URL('./categories.source.json', import.meta.url), 'utf8'));
const groups = src.groups.map(({ id, mn, en }) => ({ id, mn, en }));
const groupIds = new Set(groups.map((g) => g.id));
const seen = new Set();
const categories = src.categories.map((c) => {
  if (seen.has(c.id)) throw new Error('duplicate id ' + c.id);
  seen.add(c.id);
  if (!groupIds.has(c.group)) throw new Error(`${c.id}: unknown group ${c.group}`);
  const out = { id: c.id, mn: c.mn.trim(), en: c.en.trim(), group: c.group, words: [...new Set(c.words.map((w) => w.trim()).filter(Boolean))] };
  if (c.star) out.star = true;
  if (c.osm?.length) out.osm = [...new Set(c.osm)];
  if (c.mode && c.mode !== 'visit') {
    if (!['callout', 'both'].includes(c.mode)) throw new Error(`${c.id}: unknown mode ${c.mode}`);
    out.mode = c.mode;
  }
  return out;
});
const header = fs.readFileSync(new URL('../src/data/categories.ts', import.meta.url), 'utf8').split('export const GROUPS')[0];
const body =
  `export const GROUPS: CategoryGroup[] = ${JSON.stringify(groups, null, 2)};\n\n` +
  `export const CATEGORY_DATA: CategoryDef[] = ${JSON.stringify(categories, null, 1)};\n`;
fs.writeFileSync(new URL('../src/data/categories.ts', import.meta.url), header + body);
console.log(`categories.ts: ${categories.length} categories in ${groups.length} groups, ${categories.filter((c) => c.star).length} starred, ${categories.filter((c) => c.osm).length} with map tags, ${categories.filter((c) => c.mode === 'callout').length} come-to-you, ${categories.filter((c) => c.mode === 'both').length} both`);
