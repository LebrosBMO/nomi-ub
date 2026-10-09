import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildIndex, serializeIndex } from './build-place-index.mjs';

const catalog = fileURLToPath(new URL('../src/data/directory.json', import.meta.url));
const index = fileURLToPath(new URL('../src/data/place-index.json', import.meta.url));

test('src/data/place-index.json matches the catalog, so the owner routes know every place id and name', () => {
  const places = JSON.parse(fs.readFileSync(catalog, 'utf8')) as { id: string; name: string }[];
  const built = buildIndex(places) as Record<string, string>;
  // A stale file would let the routes refuse a place the app shows: rebuild with node scripts/build-place-index.mjs.
  assert.equal(fs.readFileSync(index, 'utf8'), serializeIndex(built), 'place-index.json is stale: node scripts/build-place-index.mjs');
  assert.equal(Object.keys(built).length, places.length);
  // Ids and names only; nothing else about a place reaches the deployed workers through it.
  for (const value of Object.values(built)) assert.equal(typeof value, 'string');
});
