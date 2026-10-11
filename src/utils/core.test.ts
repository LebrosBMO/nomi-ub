import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {interpretLocal,findPlaces,servesDistrict,distanceKm,validateIntent,mapsLink,safeUrl,validServerUrl,landmarkQuery,sourceLabel,verificationLabel,closingMinutes,wantsNight,openAtNight,inCategory,type Place} from './core.ts';
import {dayInUB} from './personal.ts';
const cases=JSON.parse(fs.readFileSync(new URL('./core.cases.json',import.meta.url),'utf8'));
for(const c of cases){test(`Mongolian regression ${c.id}: ${c.text}`,()=>{const got=interpretLocal(c.text,c.previous);for(const [k,v] of Object.entries(c.expected))assert.deepEqual((got as any)[k],v,k);});}
test('Distances and missing pins',()=>{assert.equal(distanceKm({latitude:47,longitude:106},{latitude:47,longitude:106}),0);const p=[{id:'unknown',name:'A',category:'tire',address:'',phones:[],latitude:null,longitude:null},{id:'near',name:'B',category:'tire',address:'',phones:[],latitude:47,longitude:106}] as unknown as Place[];assert.equal(findPlaces(p,{location:{latitude:47,longitude:106}})[0].id,'near');assert.equal(mapsLink(p[0]),null);});
test('Untrusted intent and URLs rejected',()=>{assert.throws(()=>validateIntent({action:'transfer',category:'tire'}));assert.equal(safeUrl('javascript:alert(1)'),false);assert.equal(safeUrl('https://maps.google.com'),true);});
test('Pairing URL rejects misleading insecure hostnames',()=>{assert.equal(validServerUrl('http://example.com/?192.168.1.1'),false);assert.equal(validServerUrl('http://localhost.evil.example'),false);assert.equal(validServerUrl('http://192.168.1.65:8787'),true);assert.equal(validServerUrl('https://nomi.example'),true);assert.equal(validServerUrl('https://user:password@example.com'),false);});
test('Landmark text can refine a search without guessing a district',()=>{assert.equal(landmarkQuery('zaisand emiin san'),'зайсан');assert.equal(landmarkQuery('ХУД эмийн сан'),undefined);});
test('Phone search accepts country code and spacing',()=>{const p=[{id:'a',name:'A',address:'',phones:['99956450']}] as Place[];assert.equal(findPlaces(p,{query:'+976 9995 6450'}).length,1);});
test('A business that comes to you and names no district shows in every district search',()=>{const p=[{id:'shop',name:'A',category:'plumber',district:'БГД',address:'',phones:['99000001'],qualityFlags:[]},{id:'oncall',name:'B',category:'plumber',district:null,address:'',phones:['99000002'],qualityFlags:['mobile_service']},{id:'nowhere',name:'C',category:'plumber',district:null,address:'',phones:['99000003'],qualityFlags:[]}] as unknown as Place[];assert.deepEqual(findPlaces(p,{category:'plumber',district:'БЗД'}).map(x=>x.id),['oncall']);assert.deepEqual(findPlaces(p,{category:'plumber',district:'БГД'}).map(x=>x.id).sort(),['oncall','shop']);});
test('AC 4.2: verification label says Шалгаагүй for null and Баталгаажсан plus the date otherwise',()=>{assert.equal(verificationLabel({verifiedAt:null}),'Шалгаагүй');assert.equal(verificationLabel({verifiedAt:'2026-09-18'}),'Баталгаажсан · 2026-09-18');assert.equal(verificationLabel({verifiedAt:'2026-09-18T17:30:00Z'}),'Баталгаажсан · 2026-09-19');assert.equal(verificationLabel({verifiedAt:'2026-09-18T23:30:00+08:00'}),'Баталгаажсан · 2026-09-18');assert.equal(verificationLabel({verifiedAt:''}),'Шалгаагүй');});
test('Source label comes from the hostname and never opens a non-web link',()=>{assert.equal(sourceLabel('https://www.facebook.com/ZuslanGazarHouse/'),'Facebook');assert.equal(sourceLabel('https://m.facebook.com/p/x'),'Facebook');assert.equal(sourceLabel('https://www.google.com/maps/place/x/data=!4m7?hl=en'),'Google Maps');assert.equal(sourceLabel('https://maps.app.goo.gl/abc'),'Google Maps');assert.equal(sourceLabel('https://apteka.mn/mn/stores'),'apteka.mn');assert.equal(sourceLabel('https://www.barilgiin-material.mn/'),'barilgiin-material.mn');assert.equal(sourceLabel('https://pharmacy.monos.mn/branches'),'pharmacy.monos.mn');assert.equal(sourceLabel('Field visit 2026-09-17'),'Field visit 2026-09-17');assert.equal(safeUrl('javascript:alert(1)'),false);assert.equal(safeUrl('tel:+97699119911'),false);});
test('A business nobody travels to is found in every district, and is not marked down for having no map pin',()=>{
 const p=[{id:'shop',name:'А нягтлан',category:'accountant',district:'СБД',address:'',phones:['99000001'],latitude:47,longitude:106,qualityFlags:[]},{id:'online',name:'Я нягтлан',category:'accountant',district:'СБД',address:'',phones:['99000002'],latitude:null,longitude:null,qualityFlags:['online_service']}] as unknown as Place[];
 // Its own district says nothing about who it can serve, so no district search leaves it out.
 assert.deepEqual(findPlaces(p,{category:'accountant',district:'ХУД'}).map(x=>x.id),['online']);
 assert.deepEqual(findPlaces(p,{category:'accountant',district:'СБД'}).map(x=>x.id).sort(),['online','shop']);
 assert.ok(servesDistrict({district:'СБД',qualityFlags:['online_service']},'Багануур'));
 assert.ok(!servesDistrict({district:'СБД',serviceAreas:[]},'Багануур'));
 // Neither has a pin, and the online one is named last, so only the exemption can put it first.
 const noPins=[{id:'a_shop',name:'А нягтлан',category:'accountant',address:'',phones:['99000001'],latitude:null,longitude:null,qualityFlags:[]},{id:'z_online',name:'Я нягтлан',category:'accountant',address:'',phones:['99000002'],latitude:null,longitude:null,qualityFlags:['online_service']}] as unknown as Place[];
 assert.deepEqual(findPlaces(noPins,{category:'accountant'}).map(x=>x.id),['z_online','a_shop']);
});

test('AC 4.5: "БЗД эмийн сан" finds only pharmacies in БЗД, and every catalog source has a label',()=>{const rows=JSON.parse(fs.readFileSync(new URL('../data/directory.json',import.meta.url),'utf8')) as Place[];const intent=interpretLocal('БЗД эмийн сан');assert.equal(intent.action,'search');const found=findPlaces(rows,{category:intent.category,district:intent.district});assert.ok(found.length>0);for(const p of found){assert.ok(inCategory(p,'pharmacy'),p.name);assert.equal(p.district,'БЗД');}for(const r of rows){assert.ok(sourceLabel(r.sources[0]).length>0,r.id);assert.ok(safeUrl(r.sources[0]),r.id);}});
test('AC 5.2: verifiedAt only with checkStatus Баталгаажсан and a real date not after the build; closed and wrong-number records are absent',()=>{const rows=JSON.parse(fs.readFileSync(new URL('../data/directory.json',import.meta.url),'utf8')) as Place[];assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
 // The build happened no later than the summary export, and never later than this test run.
 let built=Date.now();try{built=Math.min(built,Date.parse(JSON.parse(fs.readFileSync(new URL('../../data/check-summary.json',import.meta.url),'utf8')).exportedAt));}catch{}
 for(const r of rows){assert.ok(r.sources.length);assert.ok(typeof r.checkStatus==='string'&&r.checkStatus.length>0,r.id);assert.ok(!['Хаагдсан','Буруу дугаар'].includes(r.checkStatus),r.id);if(r.verifiedAt===null)assert.notEqual(r.checkStatus,'Баталгаажсан',r.id);else{assert.equal(r.checkStatus,'Баталгаажсан',r.id);const t=Date.parse(r.verifiedAt);assert.ok(Number.isFinite(t),r.id+' '+r.verifiedAt);if(/^\d{4}-\d{2}-\d{2}$/.test(r.verifiedAt))assert.ok(r.verifiedAt<=dayInUB(new Date(built)),r.id+' '+r.verifiedAt);else assert.ok(t<=built,r.id+' '+r.verifiedAt);}for(const p of r.phones)assert.match(p,/^[5-9]\d{7}$/);}});

test('Closing time from an hours claim: the latest range end, over midnight past 24:00, 24 hours after any range, nothing written as null', () => {
  assert.equal(closingMinutes('Да-Ня 09:00-23:00'), 23 * 60);
  assert.equal(closingMinutes('Даваа–Баасан 08:30–21:00; Бямба–Ням 09:00–20:30'), 21 * 60);
  assert.equal(closingMinutes('Даваа–Ням 24 цаг'), 2880);
  assert.equal(closingMinutes('Даваа–Баасан 08:30–00:00'), 1440);
  assert.equal(closingMinutes('Даваа–Ням 18:00–02:00'), 26 * 60);
  assert.equal(closingMinutes('Цагийн мэдээлэл эх сурвалжид байхгүй'), null);
  assert.equal(closingMinutes('Даваа–Ням 00:00–24:00'), 2880);
  // Night means open past midnight or around the clock; 'until 23:00' and 'until 00:00' are not night.
  assert.equal(openAtNight('Да-Ня 09:00-23:00'), false);
  assert.equal(openAtNight('Даваа–Баасан 08:30–00:00'), false);
  assert.equal(openAtNight('Даваа–Ням 24 цаг'), true);
  assert.equal(openAtNight('Даваа–Ням 18:00–02:00'), true);
});

test('A night request is told from an ordinary one, in Cyrillic and Latin, and only whole English words count', () => {
  for (const t of ['шөнө ажилладаг эмийн сан', 'шөнийн эмийн сан', '24 цаг ажилладаг эмийн сан', 'shono emiin san', 'oroin emiin san', 'pharmacy open late']) assert.equal(wantsNight(t), true, t);
  for (const t of ['bzd emiin san', 'БГД дугуй засвар', 'chocolate', 'ойрхон эмийн сан']) assert.equal(wantsNight(t), false, t);
});

test('Catalog cleanliness: no Google or Facebook leftovers in addresses or tire hours, and shops that come to you are marked', () => {
  const rows = JSON.parse(fs.readFileSync(new URL('../data/directory.json', import.meta.url), 'utf8')) as Place[];
  for (const r of rows) assert.doesNotMatch(r.address, /\b(Local Business|Open now|Closes|reviews?)\b|\b[23456789CFGHJMPQRVWX]{4}\+[23456789CFGHJMPQRVWX]{2,3}\b|\d\s?[AP]M\b/, r.id + ': ' + r.address);
  const tires = rows.filter((r) => r.category === 'tire');
  for (const r of tires) assert.doesNotMatch(r.hoursClaim, /\p{Extended_Pictographic}|#\S|\b\d{4}\s?\d{4}\b|followers|Always open/u, r.id + ': ' + r.hoursClaim);
  const mobile = tires.filter((r) => r.qualityFlags.includes('mobile_service'));
  assert.ok(mobile.length >= 10);
  assert.ok(mobile.every((r) => /дуудлаг|очно|ирж\s*засна|mobile/i.test([r.name, r.address, r.hoursClaim].join(' ')) || r.qualityFlags.includes('mobile_service')));
  // No supplement shop or clinic is filed as a pharmacy.
  assert.ok(!rows.some((r) => r.category === 'pharmacy' && /4\s?life|трансфер фактор/i.test(r.name)));
});
