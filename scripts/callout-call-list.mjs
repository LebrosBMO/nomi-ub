// The come-to-you businesses waiting to be called, out of ../social-businesses.csv (written by scripts/merge-social.mjs).
//
// Those are the ones Nomi needs most and has least of: a plumber or an electrician has no address, so OpenStreetMap never had
// them and Google Maps cannot show them. They were found on Facebook and the classified sites, where a number read off an ad is
// not enough to publish — the owner has to be asked. One call settles all of it: is this a real business, which districts do you
// go to, may we list you.
//
// Writes ../callout-call-list.csv, in the order worth calling: the emptiest categories first, since a category with three
// businesses cannot answer a search, and within a category the ones that look most alive.
//
//   node scripts/callout-call-list.mjs [--in ../social-businesses.csv] [--out ../callout-call-list.csv] [--min 25]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import categories from './categories.export.json' with { type: 'json' };
import directory from '../src/data/directory.json' with { type: 'json' };

// The generated JSON rather than src/data/categories.ts, so this runs on any Node without type stripping.
const CATEGORY_DATA = categories.categories;

const root = new URL('../../', import.meta.url);
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf('--' + name);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const input = new URL(option('in', 'social-businesses.csv'), root);
const out = new URL(option('out', 'callout-call-list.csv'), root);
/** How many businesses a category needs before a search in it is worth answering. */
const TARGET = Number(option('min', '25'));

if (!existsSync(input)) {
  console.error(`${input.pathname} is not there. Run: node scripts/merge-social.mjs`);
  process.exit(1);
}

/** A CSV row, respecting quotes and the commas and newlines inside them. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f !== ''));
}

const byName = new Map(CATEGORY_DATA.map((c) => [c.mn, c]));
const comesToYou = (name) => { const c = byName.get(name); return !!c && c.mode && c.mode !== 'visit'; };
/** What the catalog already holds per category, so the emptiest are called first. */
const listed = {};
for (const place of directory) for (const id of [place.category, ...(place.alsoCategories ?? [])]) listed[id] = (listed[id] ?? 0) + 1;

const [header, ...rows] = parseCsv(readFileSync(input, 'utf8').replace(/^﻿/, ''));
const at = Object.fromEntries(header.map((h, i) => [h, i]));
for (const column of ['Ангилал', 'Нэр', 'Утас']) if (at[column] === undefined) {
  console.error(`${input.pathname} has no "${column}" column — is it the file scripts/merge-social.mjs writes?`);
  process.exit(1);
}

const wanted = rows
  .filter((r) => r[at['Утас']] && comesToYou(r[at['Ангилал']]))
  .map((r) => {
    const category = byName.get(r[at['Ангилал']]);
    return {
      category,
      have: listed[category.id] ?? 0,
      name: r[at['Нэр']],
      phones: r[at['Утас']],
      district: r[at['Дүүрэг']] ?? '',
      lastActive: r[at['Сүүлд идэвхтэй']] ?? '',
      source: r[at['Эх сурвалж']] ?? '',
      link: r[at['Холбоос']] ?? '',
      note: r[at['Тэмдэглэл']] ?? '',
    };
  })
  // The emptiest category first; inside it, the most recently active, because a dead number wastes the call.
  .sort((a, b) => a.have - b.have || b.lastActive.localeCompare(a.lastActive) || a.name.localeCompare(b.name, 'mn'));

const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
const columns = ['№', 'Ангилал', 'Nomi-д одоо', 'Дутуу', 'Нэр', 'Утас', 'Дүүрэг', 'Сүүлд идэвхтэй', 'Эх сурвалж', 'Холбоос', 'Тэмдэглэл', 'Залгасан', 'Хариу', 'Очдог дүүрэг'];
const lines = wanted.map((w, i) =>
  [i + 1, w.category.mn, w.have, Math.max(0, TARGET - w.have), w.name, w.phones, w.district, w.lastActive, w.source, w.link, w.note, '', '', ''].map(q).join(',')
);
writeFileSync(out, '﻿' + [columns.join(',')].concat(lines).join('\r\n') + '\r\n', 'utf8');

const perCategory = {};
for (const w of wanted) perCategory[w.category.mn] = (perCategory[w.category.mn] ?? 0) + 1;
const short = Object.entries(perCategory).sort((a, b) => b[1] - a[1]);
console.log(`${wanted.length} come-to-you businesses to call, in ${short.length} categories → ${out.pathname.replace(root.pathname, '')}`);
for (const [name, n] of short.slice(0, 15)) console.log(`  ${String(n).padStart(4)}  ${name}  (Nomi has ${listed[byName.get(name).id] ?? 0})`);
