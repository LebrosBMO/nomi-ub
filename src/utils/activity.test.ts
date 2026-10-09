import test from 'node:test';
import assert from 'node:assert/strict';
import {ACTIVITY_CAP,ACTIVITY_KINDS,activityLine,addActivity,dayLabel,emptyActivity,groupByDay,restoreActivity,timeInUB,type ActivityItem} from './activity.ts';
const at=(hoursUtc:number,minutes=0)=>new Date(Date.UTC(2026,8,18,hoursUtc,minutes));
test('AC 10.3: the history never exceeds 500 items and keeps the latest ones',()=>{
 assert.equal(ACTIVITY_CAP,500);
 let s=emptyActivity();
 for(let i=0;i<600;i++)s=addActivity(s,{kind:'call',placeId:'p'+i},at(0,i));
 assert.equal(s.items.length,500);
 assert.equal(s.items[0].placeId,'p100');assert.equal(s.items[499].placeId,'p599');
 const oversized={version:1,items:Array.from({length:700},(_,i)=>({id:'i'+i,at:at(0).toISOString(),kind:'map',placeId:'p'+i}))};
 const restored=restoreActivity(JSON.parse(JSON.stringify(oversized)));
 assert.equal(restored.items.length,500);assert.equal(restored.items[0].placeId,'p200');
});
test('Entries hold ids and counts only; every item survives a JSON round trip unchanged',()=>{
 let s=addActivity(emptyActivity(),{kind:'memory_add',refId:'2'},at(1));
 s=addActivity(s,{kind:'ai_request',tokens:1240},at(2));
 s=addActivity(s,{kind:'call',placeId:'pharmacy-1'},at(3));
 for(const item of s.items)assert.ok(Object.keys(item).every(k=>['id','at','kind','placeId','refId','tokens'].includes(k)),JSON.stringify(item));
 assert.deepEqual(s.items[0],{id:s.items[0].id,at:at(1).toISOString(),kind:'memory_add',refId:'2'});
 assert.deepEqual(restoreActivity(JSON.parse(JSON.stringify(s))),s);
 assert.notEqual(s.items[0].id,s.items[1].id);
});
test('Grouped by Ulaanbaatar day, newest first',()=>{
 let s=addActivity(emptyActivity(),{kind:'call',placeId:'a'},at(15,30));// 23:30 UB, 09-18
 s=addActivity(s,{kind:'map',placeId:'b'},at(16,30));// 00:30 UB, 09-19
 s=addActivity(s,{kind:'source',placeId:'c'},at(2));// 10:00 UB, 09-18
 const groups=groupByDay(s.items);
 assert.deepEqual(groups.map(g=>g.day),['2026-09-19','2026-09-18']);
 assert.deepEqual(groups[1].items.map(i=>i.placeId),['a','c']);
 assert.equal(timeInUB(at(6,2).toISOString()),'14:02');
 assert.equal(timeInUB(at(16,30).toISOString()),'00:30');
 assert.equal(dayLabel('2026-09-18',at(6)),'Өнөөдөр');
 assert.equal(dayLabel('2026-09-17',at(6)),'Өчигдөр');
 assert.equal(dayLabel('2026-09-01',at(6)),'2026-09-01');
 assert.equal(dayLabel('2026-09-19',at(16,30)),'Өнөөдөр');
});
test('Lines follow the PRD examples and every kind has wording',()=>{
 const name=(id:string)=>id==='p1'?'Apteka эмийн сан':undefined;
 const item=(kind:ActivityItem['kind'],extra:Partial<ActivityItem>={}):ActivityItem=>({id:'x',at:at(6,2).toISOString(),kind,...extra});
 assert.equal(activityLine(item('call',{placeId:'p1'}),name),'Залгасан: Apteka эмийн сан');
 assert.equal(activityLine(item('ai_request',{tokens:1240})),'AI хүсэлт · 1,240 token');
 assert.equal(activityLine(item('ai_request')),'AI хүсэлт');
 assert.equal(activityLine(item('task_add',{refId:'3'})),'Ажил 3 нэмсэн');
 assert.equal(activityLine(item('memory_delete',{refId:'2'})),'Санамж 2 устгасан');
 assert.equal(activityLine(item('task_restore',{refId:'2'})),'Ажил 2 сэргээсэн');
 assert.equal(activityLine(item('reminder_set',{refId:'4'})),'Сануулга 4 тохируулсан');
 assert.equal(activityLine(item('reminder_fired',{refId:'4'})),'Сануулга 4 ирсэн');
 assert.equal(activityLine(item('report',{placeId:'p1'}),name),'Мэдэгдэл: Apteka эмийн сан');
 assert.match(activityLine(item('call',{placeId:'gone'}),name),/Хасагдсан газар/);
 for(const kind of ACTIVITY_KINDS)assert.ok(activityLine(item(kind,{placeId:'p1',refId:'1',tokens:5}),name).length>0,kind);
});
test('Restore drops malformed items and unknown stores',()=>{
 const good={id:'1',at:at(1).toISOString(),kind:'call',placeId:'p'};
 const bad=[null,{...good,kind:'text'},{...good,at:'yesterday'},{...good,id:1},{...good,placeId:''},{...good,tokens:-1},{...good,tokens:1.5},{...good,refId:'x'.repeat(81)}];
 assert.deepEqual(restoreActivity({version:1,items:[good,...bad]}).items,[good]);
 assert.deepEqual(restoreActivity({version:1,items:[{...good,text:'secret'}]}).items,[good]);
 assert.deepEqual(restoreActivity(null),emptyActivity());
 assert.deepEqual(restoreActivity({version:2,items:[good]}),emptyActivity());
 assert.deepEqual(restoreActivity({version:1,items:'no'}),emptyActivity());
});
