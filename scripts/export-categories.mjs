// Writes the category registry (src/data/categories.ts) as JSON for scripts/import-directory.py, which cannot read TypeScript.
// Run before the import: node scripts/export-categories.mjs
import fs from 'node:fs';
import { CATEGORY_DATA, GROUPS } from '../src/data/categories.ts';
import { skeleton } from '../src/utils/category-match.ts';

const out = new URL('./categories.export.json', import.meta.url);
const categories = CATEGORY_DATA.map((c) => ({ ...c, keys: [...new Set([c.mn, ...c.words].map(skeleton).filter((k) => k.length >= 3))] }));
fs.writeFileSync(out, JSON.stringify({ groups: GROUPS, categories }, null, 1));
console.log('categories', categories.length, 'with map tags', categories.filter((c) => c.osm?.length).length);
