import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyPersonal,handlePersonal,restorePersonal,dayInUB,REMINDER_HINT} from './personal.ts';
const now=new Date('2026-09-18T17:00:00Z');
test('Tasks persist through serialization; duplicate is not added',()=>{
 const first=handlePersonal('Ажил нэм: газрууд руу залгах',emptyPersonal(),now)!;
 assert.equal(first.changed,true);assert.equal(first.state.tasks[0].title,'газрууд руу залгах');
 const restored=restorePersonal(JSON.parse(JSON.stringify(first.state)));
 assert.deepEqual(restored,first.state);
 assert.equal(handlePersonal('Ажил нэм: газрууд руу залгах',restored,now)!.changed,false);
 assert.equal(emptyPersonal().tasks.length,0);
});
test('Stable IDs survive completion, restore and deletion',()=>{
 let s=handlePersonal('Ажил нэм: нэг',emptyPersonal(),now)!.state;
 s=handlePersonal('Ажил нэм: хоёр',s,now)!.state;
 s=handlePersonal('Ажил 1 дууссан',s,now)!.state;assert.equal(s.tasks[0].done,true);
 assert.doesNotMatch(handlePersonal('Миний ажлууд',s,now)!.reply,/нэг/);
 s=handlePersonal('Ажил 1 сэргээ',s,now)!.state;assert.equal(s.tasks[0].done,false);
 s=handlePersonal('Ажил 1 устга',s,now)!.state;assert.equal(s.tasks[0].id,'2');
 assert.equal(handlePersonal('Ажил 1 устга',s,now)!.changed,false);
});
test('Mongolia midnight and year rollover',()=>{
 assert.equal(dayInUB(now),'2026-09-19');
 assert.equal(handlePersonal('Маргааш хийх: уулзалт',emptyPersonal(),now)!.state.tasks[0].dueDate,'2026-09-20');
 assert.equal(handlePersonal('Маргааш хийх: уулзалт',emptyPersonal(),new Date('2026-12-31T04:00:00Z'))!.state.tasks[0].dueDate,'2027-01-01');
 // Typed in Latin, as many people do.
 assert.equal(handlePersonal('margaash hiih: dugui zasvar ruu zalgah',emptyPersonal(),now)!.state.tasks[0].dueDate,'2026-09-20');
 assert.equal(handlePersonal('Unuudur hiih: delguur oroh',emptyPersonal(),now)!.state.tasks[0].dueDate,'2026-09-19');
});
test('Impossible dates and past dates do not mutate',()=>{
 for(const day of ['2026-02-30','2026-99-01','2026-09-18'])assert.equal(handlePersonal(day+' хийх: уулзалт',emptyPersonal(),now)!.changed,false);
});
test('Daily view excludes future items and shows overdue separately',()=>{
 let s=handlePersonal('Өнөөдөр хийх: өнөөдөр',emptyPersonal(),now)!.state;
 s=handlePersonal('Маргааш хийх: ирээдүй',s,now)!.state;
 const today=handlePersonal('Өнөөдрийн төлөвлөгөө',s,now)!.reply;
 assert.match(today,/өнөөдөр/);assert.doesNotMatch(today,/ирээдүй/);
 assert.match(handlePersonal('Өнөөдрийн төлөвлөгөө',s,new Date(now.getTime()+86400000))!.reply,/Хугацаа өнгөрсөн/);
});
test('Explicit memory only; deduplicate, list and delete',()=>{
 assert.equal(handlePersonal('Би халуун ногоонд дургүй',emptyPersonal(),now),null);
 let s=handlePersonal('Санаж ав: би халуун ногоонд дургүй',emptyPersonal(),now)!.state;
 assert.equal(handlePersonal('Санаж ав: би халуун ногоонд дургүй',s,now)!.changed,false);
 assert.match(handlePersonal('Миний тухай юу санаж байна?',s,now)!.reply,/халуун ногоонд/);
 assert.equal(handlePersonal('Санамж 1 дууссан',s,now)!.changed,false);
 s=handlePersonal('Санамж 1 устга',s,now)!.state;assert.equal(s.memories.length,0);
});
test('Ambiguity, negation and quotations never execute a mutation',()=>{
 for(const text of ['Ажил 1 устгаж болох уу?','Ажил 1 устга битгий','“Ажил 1 устга” гэж хэлсэн','Ажил нэмэхгүй','Ажил нэм:   ','Ажил 1 устга, бас 2']){
  const result=handlePersonal(text,emptyPersonal(),now);assert.ok(!result||!result.changed,text);
 }
 const reminding=handlePersonal('Маргааш 10 цагт сануулаарай',emptyPersonal(),now)!;assert.equal(reminding.changed,false);assert.equal(reminding.reply,REMINDER_HINT);
});
test('Each store change names its kind and id; replies and reads carry no action',()=>{
 let r=handlePersonal('Санаж ав: би халуун ногоонд дургүй',emptyPersonal(),now)!;assert.deepEqual(r.action,{kind:'memory_add',id:'1'});
 r=handlePersonal('Маргааш хийх: уулзалт',r.state,now)!;assert.deepEqual(r.action,{kind:'task_add',id:'2'});
 assert.deepEqual(handlePersonal('Ажил 2 дууссан',r.state,now)!.action,{kind:'task_done',id:'2'});
 assert.deepEqual(handlePersonal('Ажил 2 устга',r.state,now)!.action,{kind:'task_delete',id:'2'});
 assert.deepEqual(handlePersonal('Санамж 1 устга',r.state,now)!.action,{kind:'memory_delete',id:'1'});
 assert.deepEqual(handlePersonal('Ажил 2 сэргээ',handlePersonal('Ажил 2 дууссан',r.state,now)!.state,now)!.action,{kind:'task_restore',id:'2'});
 for(const text of ['Миний ажлууд','Санамж 1 дууссан','Ажил 7 устга','Маргааш хийх: уулзалт','Тусламж'])assert.equal(handlePersonal(text,r.state,now)!.action,undefined,text);
});
test('Corrupt store is rejected, not silently reset',()=>{
 assert.throws(()=>restorePersonal({version:1,nextId:1,tasks:[{id:'1',title:'a'}],memories:[]}));
 assert.throws(()=>restorePersonal(null));
});
