/** Offline personal tools. Deliberately explicit commands until an AI adapter is connected. */
import type {Payment} from './payments.ts';
import {describePayment,duePayments} from './payments.ts';
import type {Reminder} from './reminders.ts';
export type Task={id:string;title:string;done:boolean;createdAt:string;dueDate?:string};
export type Memory={id:string;text:string;createdAt:string};
export type PersonalState={version:1;nextId:number;tasks:Task[];memories:Memory[]};
export const emptyPersonal=():PersonalState=>({version:1,nextId:1,tasks:[],memories:[]});
export const PERSONAL_HELP='Хийх ажлаа ингэж нэмээрэй:\n“Ажил нэм: дугуй засварууд руу залгах”\n“Маргааш хийх: дэлгүүр орох”\n“2026-10-01 хийх: уулзалтад очих”\n\n“Миний ажлууд”, “Өнөөдрийн төлөвлөгөө”, “Маргаашийн төлөвлөгөө” гэж жагсаалтаа харна. Дугаараар нь “Ажил 1 дууссан”, “Ажил 1 сэргээ”, “Ажил 1 устга” гэж болно.\n\n“Сануул: маргааш 10:00 дугуй засвар руу залгах”\n“Ажил 1-ийг маргааш 09:30-д сануул”\n“Сануулгууд”, “Сануулга 1 устга”\n\n“Төлбөр нэм: түрээс 450000 5” — сар бүрийн төлбөр\n“Төлбөрүүд”, “Төлбөр 1 төлсөн”, “Төлбөр 1 устга”, “Сарын нийт”\n“Төлбөр 1-ийг сануул” — төлөх өдрийн 10:00-д мэдэгдэнэ\n\n“Зардал: 15000 хоол” эсвэл “8000₮ такси” — өдрийн зардал\n“Зардал” — энэ сарын нийт, ангиллаар; “Зардал 3 устга”\n\n“Санаж ав: би халуун ногоогүй хоол иддэг”\n“Миний тухай юу санаж байна?”\n“Санамж 2 устга”\n\nЭдгээр нь энэ төхөөрөмжид хадгалагдана. Сануулга цаг болоход утсанд мэдэгдэл болж ирнэ; вэб дээр мэдэгдэл ирэхгүй.';
/** The exact command shape, answered to any other sentence about reminding so nothing is guessed from it (Section 13). */
export const REMINDER_HINT='Сануулга тавих бол “Сануул: маргааш 10:00 дугуй засвар руу залгах” эсвэл “Ажил 1-ийг маргааш 09:30-д сануул” гэж бичээрэй.';
export function dayInUB(now=new Date()):string{return new Date(now.getTime()+8*3600000).toISOString().slice(0,10);}
function tomorrow(now:Date){return dayInUB(new Date(now.getTime()+86400000));}
export function validDay(day:string){return /^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day))&&new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day;}
export function restorePersonal(raw:unknown):PersonalState{
 const v=raw as PersonalState;
 if(!v||v.version!==1||!Array.isArray(v.tasks)||!Array.isArray(v.memories)||!Number.isSafeInteger(v.nextId)||v.nextId<1)throw new Error('Invalid personal store');
 const ids=new Set<string>();
 for(const item of [...v.tasks,...v.memories]){if(!item||!/^\d+$/.test(item.id)||Number(item.id)>=v.nextId||ids.has(item.id)||typeof item.createdAt!=='string'||!Number.isFinite(Date.parse(item.createdAt)))throw new Error('Invalid item');ids.add(item.id);}
 for(const t of v.tasks)if(typeof t.title!=='string'||!t.title.trim()||typeof t.done!=='boolean'||(t.dueDate!==undefined&&!validDay(t.dueDate)))throw new Error('Invalid task');
 for(const m of v.memories)if(typeof m.text!=='string'||!m.text.trim())throw new Error('Invalid memory');
 return v;
}
/** Marks one task done or unfinished. The chat command and the helper tab tap both go through here, so they cannot drift apart. */
export function setTaskDone(state:PersonalState,id:string,done:boolean):PersonalState{
 const task=state.tasks.find(t=>t.id===id);
 if(!task||task.done===done)return state;
 return {...state,tasks:state.tasks.map(t=>t.id===id?{...t,done}:t)};
}
/** Which store change a command made, by id only, so the activity history (Section 10) never needs the reply text. */
export type PersonalAction={kind:'task_add'|'task_done'|'task_restore'|'task_delete'|'memory_add'|'memory_delete';id:string};
export type PersonalResult={state:PersonalState;reply:string;changed:boolean;action?:PersonalAction};
/** `reminders`: the reminder store's items, so a day's plan lists the reminders due that day (Section 13); the reminder commands themselves live in reminders.ts and run first. */
export function handlePersonal(input:string,state:PersonalState,now=new Date(),reminders:readonly Reminder[]=[],payments:readonly Payment[]=[]):PersonalResult|null{
 const text=input.trim(),normalized=text.toLowerCase().replace(/[?!.]+$/,'').trim();
 const result=(reply:string,next=state,action?:PersonalAction):PersonalResult=>({state:next,reply,changed:next!==state,...(action?{action}:{})});
 if(/^(тусламж|чадварууд|юу хийж чадах вэ|help|tuslamj)$/.test(normalized))return result(PERSONAL_HELP);
 if(/^(миний тухай юу санаж байна|миний санамжууд|санамжууд|minii sanamjuud)$/.test(normalized))return result(state.memories.length?'Чиний хадгалуулсан зүйлс:\n'+state.memories.map(m=>`${m.id}. ${m.text}`).join('\n'):'Одоогоор чиний тухай хадгалсан зүйл алга. “Санаж ав: …” гэж бичээрэй.');
 const list=/^(миний ажлууд|ажлууд|төлөвлөгөө|minii ajluud|өнөөдрийн төлөвлөгөө|маргаашийн төлөвлөгөө|дууссан ажлууд)$/.test(normalized);
 if(list){
  const done=normalized==='дууссан ажлууд';const day=normalized==='өнөөдрийн төлөвлөгөө'?dayInUB(now):normalized==='маргаашийн төлөвлөгөө'?tomorrow(now):null;
  const rows=state.tasks.filter(t=>t.done===done&&(!day||t.dueDate===day)).sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999')||Number(a.id)-Number(b.id));
  const overdue=day===dayInUB(now)?state.tasks.filter(t=>!t.done&&t.dueDate&&t.dueDate<day):[];
  const format=(t:Task)=>`${t.id}. ${t.title}${t.dueDate?' · '+t.dueDate:''}`;
  // A stored `at` is always "YYYY-MM-DDTHH:MM:SS+08:00" (restoreReminders checks), so its day and clock are read straight off it.
  // Today's plan also carries what is due to be paid and still unpaid; a payment has no day of its own in the plan.
  const bills=day===dayInUB(now)?duePayments(payments,now):[];
  const alarms=day?reminders.filter(r=>(r.status==='scheduled'||r.status==='fired')&&r.at.slice(0,10)===day).sort((a,b)=>a.at.localeCompare(b.at)||Number(a.id)-Number(b.id)).map(r=>`Сануулга ${r.id} · ${r.at.slice(11,16)} · ${r.text}`):[];
  return result((rows.length?rows.map(format).join('\n'):'Энд бүртгэсэн ажил алга.')+(alarms.length?'\n\nСануулга:\n'+alarms.join('\n'):'')+(bills.length?'\n\nТөлбөр:\n'+bills.map(p=>describePayment(p,now)).join('\n'):'')+(overdue.length?'\n\nХугацаа өнгөрсөн, дуусаагүй:\n'+overdue.map(format).join('\n'):'')+(day?'\n\nОгноог Улаанбаатарын цагаар тооцов.':''));
 }
 let match=text.match(/^(?:санаж ав|sanaj av)\s*:\s*(.+)$/isu);
 if(match){const value=match[1].trim();if(value.length>500)return result('Сануулах зүйлээ 500 тэмдэгтэд багтаагаарай.');if(state.memories.some(m=>m.text.toLowerCase()===value.toLowerCase()))return result('Үүнийг өмнө нь хадгалсан байна.');if(state.memories.length>=200)return result('200 санамж хадгалсан байна. Хэрэггүйгээ устгаад нэмээрэй.');const id=String(state.nextId);return result(`Санаж авлаа: ${value}\n(Санамж ${id} · зөвхөн энэ төхөөрөмжид)`,{...state,nextId:state.nextId+1,memories:[...state.memories,{id,text:value,createdAt:now.toISOString()}]},{kind:'memory_add',id});}
 match=text.match(/^(ажил нэм|ажил|хийх ажил|ajil nem|өнөөдөр хийх|маргааш хийх|(?:unuudur|onoodor|margaash) k?hiik?h|\d{4}-\d{2}-\d{2} хийх)\s*:\s*(.+)$/isu);
 if(match){const title=match[2].trim(),prefix=match[1].toLowerCase();let dueDate:string|undefined;
  if(/^(өнөөдөр|unuudur|onoodor) /.test(prefix))dueDate=dayInUB(now);else if(/^(маргааш|margaash) /.test(prefix))dueDate=tomorrow(now);else if(/^\d/.test(prefix))dueDate=prefix.slice(0,10);
  if(dueDate&&!validDay(dueDate))return result('Энэ огноо зөв биш байна. Жишээ: “2026-10-01 хийх: уулзалтад очих”.');
  if(dueDate&&dueDate<dayInUB(now))return result('Энэ өдөр өнгөрсөн байна. Хийх өдрөө дахин бичээрэй.');
  if(title.length>500)return result('Ажлынхаа нэрийг 500 тэмдэгтэд багтаагаарай.');
  const duplicate=state.tasks.find(t=>!t.done&&t.title.toLowerCase()===title.toLowerCase()&&t.dueDate===dueDate);
  if(duplicate)return result(`Энэ ажил ${duplicate.id} дугаартайгаар бүртгэлтэй байна.`);
  if(state.tasks.length>=500)return result('500 ажил хадгалсан байна. Хэрэггүйгээ устгаад нэмээрэй.');
  const id=String(state.nextId);return result(`Нэмлээ: ${title}${dueDate?' · '+dueDate:''}\nАжил ${id}. Дуусгаад “Ажил ${id} дууссан” гэж бичээрэй.${dueDate?`\nЭнэ нь төлөвлөгөөнд хадгалагдана. Цагт нь мэдэгдэл авах бол “Ажил ${id}-ийг ${dueDate} 09:30-д сануул” гэж бичээрэй.`:''}`,{...state,nextId:state.nextId+1,tasks:[...state.tasks,{id,title,done:false,createdAt:now.toISOString(),...(dueDate?{dueDate}:{})}]},{kind:'task_add',id});
 }
 match=text.match(/^(ажил|санамж|ajil|sanamj)\s+(\d+)\s+(дууссан|сэргээ|устга|duussan|sergee|ustga)[.!]?$/iu);
 if(match){const kind=match[1].toLowerCase(),id=match[2],verb=match[3].toLowerCase();const memory=['санамж','sanamj'].includes(kind),remove=['устга','ustga'].includes(verb);
  if(memory&&!remove)return result('Санамжийг устгах бол “Санамж '+id+' устга” гэж бичээрэй.');
  const item=memory?state.memories.find(m=>m.id===id):state.tasks.find(t=>t.id===id);if(!item)return result(`${id} дугаартай ${memory?'санамж':'ажил'} олдсонгүй.`);
  if(memory)return result('Санамжийг устгалаа.',{...state,memories:state.memories.filter(m=>m.id!==id)},{kind:'memory_delete',id});
  if(remove)return result('Ажлыг устгалаа.',{...state,tasks:state.tasks.filter(t=>t.id!==id)},{kind:'task_delete',id});
  const done=['дууссан','duussan'].includes(verb),next=setTaskDone(state,id,done);
  // Already in that state: nothing to save and no activity entry, and the reply does not claim a change.
  if(next===state)return result(done?`Ажил ${id} аль хэдийн дууссан байна.`:`Ажил ${id} дуусаагүй, хийх ажлуудад байгаа.`);
  return result(done?'Дууссан гэж тэмдэглэлээ.':'Хийх ажлуудад буцааж орууллаа.',next,{kind:done?'task_done':'task_restore',id});
 }
 if(/сануул|sanuul/i.test(text))return result(REMINDER_HINT);
 if(/^(ажил|санамж|санаж ав|ajil|sanamj|sanaj av)(\s|:|$)/i.test(text))return result('Яг юу өөрчлөхийг сайн ойлгосонгүй. Юу ч хадгалаагүй. “Тусламж” гэж бичвэл ажил, санамж нэмэх жишээ гарна.');
 return null;
}
