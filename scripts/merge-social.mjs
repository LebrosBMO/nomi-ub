// Merges what the Facebook, Instagram and web agents found (../Nomi_All_Prepared_Files/08_Social/*.jsonl) into one clean list:
// one business per phone (or per name and category when it has no phone), its categories, sources, links and newest date combined.
//   ../social-businesses.csv                       for the owner: new businesses only, to call and pin
//   ../Nomi_All_Prepared_Files/07_Web/social.json  for the importer: every business, one record per category (the importer
//                                                  skips numbers it already lists and adds the category to that place)
// Run: node scripts/merge-social.mjs, then python scripts/import-directory.py.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const dir = new URL('Nomi_All_Prepared_Files/08_Social/', root);
const cats = JSON.parse(readFileSync(new URL('categories-to-search.json', dir), 'utf8'));
const byId = new Map(cats.map((c) => [c.id, c]));
const known = new Set(readFileSync(new URL('known-phones.txt', dir), 'utf8').split(/\s+/).filter(Boolean));
const DISTRICTS = ['БГД', 'БЗД', 'ХУД', 'СХД', 'СБД', 'ЧД', 'Налайх', 'Багануур', 'Багахангай'];
const PLATFORM = { facebook: 'Facebook', instagram: 'Instagram', web: 'Web', ads: 'Зарын сайт', secondhand: 'Дам сайт' };
const jsonl = (url) => (existsSync(url) ? readFileSync(url, 'utf8').split(/\r?\n/).filter((l) => l.trim()) : []);

// The same skeleton as src/utils/category-match.ts, so "Сантехник" and "santehnik" compare equal.
const CYR = Object.fromEntries([...'абвгдеёжзийклмноөпрстуүфхцчшщъыьэюя'].map((ch, i) => [ch, ['a', 'b', 'v', 'g', 'd', 'e', 'yo', 'j', 'z', 'i', 'i', 'k', 'l', 'm', 'n', 'o', 'o', 'p', 'r', 's', 't', 'u', 'u', 'f', 'h', 'ts', 'ch', 'sh', 'sh', 'i', 'i', 'i', 'e', 'yu', 'ya'][i]]));
const skel = (t) => [...String(t ?? '').normalize('NFKC').toLowerCase()].map((ch) => CYR[ch] ?? ch).join('')
  .replace(/[öó]/g, 'o').replace(/[üú]/g, 'u').replace(/kh/g, 'h').replace(/zh/g, 'j').replace(/w/g, 'v').replace(/c(?!h)/g, 'ts')
  .replace(/y(?![aeiouy])/g, 'i').replace(/q/g, 'k').replace(/[^a-z0-9 ]+/g, ' ').replace(/([a-z])\1+/g, '$1').replace(/\s+/g, ' ').trim();
// Words that say what kind of business it is, not which one: two plumbers are not the same business for sharing "сантехник".
const GENERIC = new Set(['hhk', 'llc', 'tbb', 'ulanbatar', 'ub', 'mongol', 'mongolia', 'service', 'servis', 'uilchilge', 'zasvar', 'tov', 'salbar', 'shop', 'delgur', 'store', 'company', 'group', 'grup']);
const words = (t) => skel(t).split(' ').filter((w) => w.length > 1 && !GENERIC.has(w));
const sameName = (a, b) => {
  const x = words(a), y = words(b);
  if (!x.length || !y.length) return false;
  if (x.join(' ') === y.join(' ')) return true;
  const shared = x.filter((w) => y.includes(w)).length;
  return shared / Math.min(x.length, y.length) >= 0.6;
};
const phone8 = (p) => { const d = String(p).replace(/\D/g, '').replace(/^976(?=\d{8}$)/, ''); return /^[5-9]\d{7}$/.test(d) ? d : null; };
const DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
// A phone read on the page, in a result title or URL, or in a quoted snippet is taken as published. One that appeared only in
// the search tool's written summary may have a wrong digit: it goes on the owner's call list marked to check, and into the app
// only after that call. Lines written before "phoneFrom" existed: Facebook ones and notes that say snippet/summary count as summary.
const strongPhone = (r) => r.phoneFrom ? ['page', 'title', 'url', 'quote'].includes(r.phoneFrom)
  : r.platform !== 'facebook' && !/snippet|summary|хураангуй/i.test(r.note ?? '');

// Dates the date checker found later for businesses collected without one (dates.jsonl, by source URL).
const lateDates = new Map();
for (const line of jsonl(new URL('dates.jsonl', dir))) {
  try { const d = JSON.parse(line); if (d?.source && DATE.test(d.date ?? '')) lateDates.set(d.source, d.date); } catch {}
}

const raw = [];
let bad = 0, classified = 0;
// facebook-2..4 are the parallel Facebook collectors for categories 851-1000 (2026-10-09).
for (const [file, platform] of [['facebook.jsonl', 'facebook'], ['facebook-2.jsonl', 'facebook'], ['facebook-3.jsonl', 'facebook'], ['facebook-4.jsonl', 'facebook'], ['instagram.jsonl', 'instagram'], ['google.jsonl', 'web']]) {
  for (const line of jsonl(new URL(file, dir))) {
    let r;
    try { r = JSON.parse(line); } catch { bad++; continue; }
    if (!r || !byId.has(r.category) || !String(r.name ?? '').trim()) { bad++; continue; }
    // Classified-ad sites forbid copying their listings and many posters are private people (an early collector run picked some
    // up), and copied directories (unread.today, tripadvisor, findglocal) are secondhand: owner's decision 2026-10-08, both stay on
    // the owner's call list, marked, and reach the app only after his call.
    const host = /^https?:\/\/(?:www\.)?([^/]+)/i.exec(r.source ?? '')?.[1]?.toLowerCase() ?? '';
    const adSite = /^(huree|unegui|onchzar|my-zar)\.mn$|^zar\./.test(host);
    const secondhand = /(^|\.)(unread\.today|tripadvisor\.[a-z.]+|findglocal\.com)$/.test(host);
    if (adSite || secondhand) classified++;
    raw.push({ ...r, date: r.date ?? lateDates.get(r.source) ?? null, platform: adSite ? 'ads' : secondhand ? 'secondhand' : r.platform === 'web' || platform === 'web' ? 'web' : platform, phones: [...new Set((r.phones ?? []).map(phone8).filter(Boolean))] });
  }
}

// One business per phone, but only when the names agree: a number found under two different names (a city ambulance line on a
// hospital, one office line for two schools) keeps them apart and marks both to check. Records without a phone join by name
// within the category.
const groups = [];
const byPhone = new Map();
for (const r of raw) {
  const holders = r.phones.flatMap((p) => byPhone.get(p) ?? []);
  let g = holders.find((x) => sameName(x.name, r.name));
  if (!g && !r.phones.length) g = groups.find((x) => x.categories.has(r.category) && sameName(x.name, r.name));
  if (!g && r.phones.length) g = groups.find((x) => !x.phones.size && x.categories.has(r.category) && sameName(x.name, r.name));
  if (!g) { g = { name: r.name.trim(), phones: new Set(), categories: new Set(), sources: new Map(), address: null, district: null, lat: null, lon: null, mobile: false, date: null, phoneChecked: false, sharedPhone: false, n: r.n }; groups.push(g); }
  for (const x of holders) if (x !== g) { x.sharedPhone = true; g.sharedPhone = true; }
  r.phones.forEach((p) => {
    g.phones.add(p);
    const list = byPhone.get(p) ?? [];
    if (!list.includes(g)) byPhone.set(p, [...list, g]);
  });
  if (r.phones.length && strongPhone(r)) g.phoneChecked = true;
  g.categories.add(r.category);
  if (r.source) g.sources.set(r.source, r.platform);
  if (r.platform !== 'ads' && r.platform !== 'secondhand') g.notOnlyAds = true;
  if (r.address && (!g.address || r.address.length > g.address.length)) g.address = String(r.address).trim();
  if (!g.district && DISTRICTS.includes(r.district)) g.district = r.district;
  const ok = typeof r.lat === 'number' && typeof r.lon === 'number' && r.lat > 47.5 && r.lat < 48.3 && r.lon > 106.3 && r.lon < 108.7;
  if (ok && g.lat == null) { g.lat = r.lat; g.lon = r.lon; }
  g.mobile ||= r.mobile === true;
  // The newest date any source showed for it (a post, a page update): lets the owner drop businesses that look abandoned.
  if (DATE.test(r.date ?? '') && (!g.date || r.date > g.date)) g.date = r.date;
  g.n = Math.min(g.n ?? Infinity, r.n ?? Infinity);
}

// Importer batch: one record per category, so the importer files the business under each and merges them by phone.
// A business known only from a classified ad or a copied directory, or whose number another business also claims, waits for
// the owner's call before it reaches the app.
const records = groups.filter((g) => g.phones.size && g.phoneChecked && g.notOnlyAds && !g.sharedPhone).flatMap((g) => [...g.categories].map((category) => ({
  category, categoryName: byId.get(category).mn, name: g.name, phones: [...g.phones], address: g.address, district: g.district,
  lat: g.lat, lon: g.lon, hours: null, sourceUrl: [...g.sources.keys()].find((u) => /^https?:/.test(u)) ?? null,
  retrievedAt: '2026-10-08', lastActive: g.date, mobile: g.mobile,
}))).filter((r) => r.sourceUrl);
writeFileSync(new URL('Nomi_All_Prepared_Files/07_Web/social.json', root), JSON.stringify({ source: 'Facebook, Instagram and web pages found by search; business-published contacts only; unchecked', retrievedAt: '2026-10-08', records }, null, 1) + '\n');

// Owner's list: businesses Nomi does not have yet, in category order.
const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
const fresh = groups.filter((g) => ![...g.phones].some((p) => known.has(p))).sort((a, b) => a.n - b.n || a.name.localeCompare(b.name, 'mn'));
const header = ['№', 'Бүлэг', 'Ангилал', 'Бас', 'Нэр', 'Утас', 'Хаяг', 'Дүүрэг', 'Дуудлагын', 'Утас шалгах', 'Байршил', 'Сүүлд идэвхтэй', 'Эх сурвалж', 'Холбоос', 'Тэмдэглэл'];
const rows = fresh.map((g, i) => {
  const [first, ...rest] = [...g.categories].sort((a, b) => byId.get(a).n - byId.get(b).n);
  return [i + 1, byId.get(first).group, byId.get(first).mn, rest.map((c) => byId.get(c).mn).join('; '), g.name, [...g.phones].join(', '), g.address, g.district,
    g.mobile ? 'Тийм' : '', g.phones.size && (!g.phoneChecked || g.sharedPhone) ? 'Тийм' : '', g.lat != null ? `${g.lat},${g.lon}` : '', g.date ?? '', [...new Set(g.sources.values())].map((p) => PLATFORM[p]).join(', '), [...g.sources.keys()].join(' '),
    g.sharedPhone ? 'Энэ утас өөр нэртэй газарт ч бүртгэгдсэн — залгаж шалгах' : ''].map(q).join(',');
});
writeFileSync(new URL('social-businesses.csv', root), '﻿' + [header.join(',')].concat(rows).join('\r\n') + '\r\n');

const catsFound = new Set(fresh.flatMap((g) => [...g.categories]));
console.log(`read ${raw.length} records (${bad} unreadable, ${classified} from classified-ad sites, call list only) →${groups.length} businesses after removing duplicates; ${fresh.length} new to Nomi in ${catsFound.size} categories (${fresh.filter((g) => g.mobile).length} on call, ${fresh.filter((g) => !g.phones.size).length} without a phone, ${fresh.filter((g) => g.date).length} with a date, ${fresh.filter((g) => g.phones.size && !g.phoneChecked).length} phones to check, ${fresh.filter((g) => g.sharedPhone).length} sharing a number with another name); importer batch ${records.length} records`);
