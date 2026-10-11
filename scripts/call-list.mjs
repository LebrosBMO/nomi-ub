// Writes the call list: places to phone, as a spreadsheet (UTF-8 CSV that Excel opens). First those with a phone but no map pin
// (ask where they are), then unchecked places in starred categories. A business that comes to the customer (a come-to-you
// category, or flagged mobile_service) needs no pin: its row asks which districts it comes to instead, and one nobody travels to
// (online_service) is asked neither. Columns are in Mongolian for whoever makes the calls.
// Run: node scripts/call-list.mjs [out.csv]
import fs from 'node:fs';
import { CATEGORY_DATA } from '../src/data/categories.ts';

const places = JSON.parse(fs.readFileSync(new URL('../src/data/directory.json', import.meta.url), 'utf8'));
const cat = new Map(CATEGORY_DATA.map((c) => [c.id, c]));
const out = process.argv[2] ?? new URL('../../call-list.csv', import.meta.url);
const rows = places
  .map((p) => ({ ...p, online: p.qualityFlags.includes('online_service'), comes: !p.qualityFlags.includes('online_service') && (cat.get(p.category)?.mode === 'callout' || p.qualityFlags.includes('mobile_service')) }))
  .filter((p) => p.phones.length && !p.verifiedAt && (p.comes || (p.latitude == null && !p.online) || cat.get(p.category)?.star))
  .map((p) => ({
    why: p.comes ? 'Очдог дүүрэг асуух' : p.online ? 'Мэдээлэл шалгах' : p.latitude == null ? 'Байршил асуух' : 'Мэдээлэл шалгах',
    category: cat.get(p.category)?.mn ?? p.category,
    name: p.name,
    phones: p.phones.join(' / '),
    address: p.address,
    district: p.district ?? '',
    hours: p.hoursClaim,
    source: p.sources[0] ?? '',
    id: p.id,
  }))
  .sort((a, b) => a.why.localeCompare(b.why, 'mn') || a.category.localeCompare(b.category, 'mn') || a.name.localeCompare(b.name, 'mn'));
const head = ['Яагаад', 'Ангилал', 'Нэр', 'Утас', 'Хаяг', 'Дүүрэг', 'Цаг', 'Эх сурвалж', 'ID', 'Үр дүн', 'Байршил (lat,lon)', 'Очдог дүүрэг', 'Тэмдэглэл'];
const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const csv = '﻿' + [head, ...rows.map((r) => [r.why, r.category, r.name, r.phones, r.address, r.district, r.hours, r.source, r.id, '', '', '', ''])].map((r) => r.map(cell).join(',')).join('\r\n');
fs.writeFileSync(out, csv);
console.log(`call list: ${rows.length} places (${rows.filter((r) => r.why === 'Байршил асуух').length} need a location, ${rows.filter((r) => r.why === 'Очдог дүүрэг асуух').length} come to the customer) → ${out instanceof URL ? out.pathname : out}`);
