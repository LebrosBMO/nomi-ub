// How well each of the 1,000 categories was searched on each platform, from the collectors' logs and results
// (../Nomi_All_Prepared_Files/08_Social/<platform>-log.jsonl and <platform>.jsonl). Writes ../social-coverage.csv, one row per
// category: searches, businesses found and why each collector stopped ("saturated" = two searches in a row found nothing new,
// "max10" = ten searches, "nothing" = no Ulaanbaatar business at all, "budget" = cut off, "no log" = searched before logging
// began, "not yet" = not reached). Prints the categories that still need another pass.
// Run: node scripts/check-social.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const dir = new URL('Nomi_All_Prepared_Files/08_Social/', root);
const cats = JSON.parse(readFileSync(new URL('categories-to-search.json', dir), 'utf8'));
const PLATFORMS = [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['google', 'Web']];
const lines = (file) => {
  const url = new URL(file, dir);
  if (!existsSync(url)) return [];
  return readFileSync(url, 'utf8').split(/\r?\n/).filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
};

// Each platform's collectors and the categories each covers: Facebook was split on 2026-10-09 so three more collectors could
// take 851-1000 in parallel, each with its own files.
const PARTS = { facebook: [['facebook', 1, 850], ['facebook-2', 851, 900], ['facebook-3', 901, 950], ['facebook-4', 951, 1000]] };
const stats = {};
for (const [p] of PLATFORMS) {
  const parts = (PARTS[p] ?? [[p, 1, 1000]]).map(([file, from, to]) => {
    const prog = new URL(`${file}-progress.txt`, dir);
    return { file, from, to, progress: existsSync(prog) ? Number(/last_n=(\d+)/.exec(readFileSync(prog, 'utf8'))?.[1] ?? 0) : 0 };
  });
  const log = new Map(parts.flatMap(({ file }) => lines(`${file}-log.jsonl`)).map((l) => [l.n, l]));
  const added = {};
  for (const { file } of parts) for (const r of lines(`${file}.jsonl`)) added[r.n] = (added[r.n] ?? 0) + 1;
  // Searched up to: a category counts as reached when the collector covering it has passed it.
  const reached = (n) => parts.some((x) => n >= x.from && n <= x.to && n <= x.progress);
  stats[p] = { parts, log, added, reached };
}

const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
const header = ['№', 'Ангилал', ...PLATFORMS.flatMap(([, name]) => [`${name} хайлт`, `${name} олдсон`, `${name} төлөв`]), 'Нийт олдсон'];
const redo = Object.fromEntries(PLATFORMS.map(([p]) => [p, []]));
const rows = cats.map((c) => {
  let total = 0;
  const cells = PLATFORMS.flatMap(([p]) => {
    const { log, added, reached } = stats[p];
    const l = log.get(c.n);
    const found = added[c.n] ?? 0;
    total += found;
    const state = l ? l.stop : reached(c.n) ? 'no log' : 'not yet';
    if (state === 'budget' || state === 'not yet') redo[p].push(c.n);
    return [l?.searches ?? '', found, state];
  });
  return [c.n, c.mn, ...cells, total].map(q).join(',');
});
writeFileSync(new URL('social-coverage.csv', root), '﻿' + [header.map(q).join(',')].concat(rows).join('\r\n') + '\r\n');

for (const [p, name] of PLATFORMS) {
  const { parts, log } = stats[p];
  const by = {};
  for (const l of log.values()) by[l.stop] = (by[l.stop] ?? 0) + 1;
  console.log(`${name}: reached ${parts.map((x) => (x.progress >= x.to ? `${x.from}-${x.to} done` : `${x.from}-${x.to} at ${Math.max(x.progress, x.from - 1)}`)).join(', ')}; logged ${log.size} (${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}); still to do ${redo[p].length}`);
}
