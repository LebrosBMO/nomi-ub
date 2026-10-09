import {dayInUB} from './personal.ts';
/** Every side-effect action Nomi took on the user's behalf (PRD Section 10). Ids only: never memory, task, location or conversation text. Storage lives in activity-storage.ts. */
export const ACTIVITY_KINDS=['call','map','share','source','location','ai_request','task_add','task_done','task_restore','task_delete','memory_add','memory_delete','payment_add','payment_paid','payment_unpaid','payment_delete','entry_add','entry_delete','reminder_set','reminder_fired','report','followup','unsupported','delete_all'] as const;
export type ActivityKind=(typeof ACTIVITY_KINDS)[number];
export type ActivityItem={id:string;at:string;kind:ActivityKind;placeId?:string;refId?:string;tokens?:number};
export type ActivityEntry=Omit<ActivityItem,'id'|'at'>;
export type ActivityStore={version:1;items:ActivityItem[]};
/** The history keeps this many of the latest items (AC 10.3). */
export const ACTIVITY_CAP=500;
export const emptyActivity=():ActivityStore=>({version:1,items:[]});
const kinds=new Set<string>(ACTIVITY_KINDS);
const optionalId=(v:unknown)=>v===undefined||typeof v==='string'&&v.length>0&&v.length<=80;
export function validActivityItem(v:unknown):v is ActivityItem{
 if(!v||typeof v!=='object')return false;const i=v as Record<string,unknown>;
 return typeof i.id==='string'&&typeof i.at==='string'&&Number.isFinite(Date.parse(i.at))&&kinds.has(i.kind as string)&&optionalId(i.placeId)&&optionalId(i.refId)&&(i.tokens===undefined||typeof i.tokens==='number'&&Number.isSafeInteger(i.tokens)&&i.tokens>=0);
}
/** Reads a saved store. Malformed items are dropped, an unknown shape becomes an empty history, and the cap applies. */
export function restoreActivity(raw:unknown):ActivityStore{
 const v=raw as Partial<ActivityStore>|null;if(!v||v.version!==1||!Array.isArray(v.items))return emptyActivity();
 return {version:1,items:v.items.filter(validActivityItem).map(({id,at,kind,placeId,refId,tokens})=>({id,at,kind,...(placeId?{placeId}:{}),...(refId?{refId}:{}),...(tokens?{tokens}:{})})).slice(-ACTIVITY_CAP)};
}
let sequence=0;
/** Appends one action (oldest first in storage) and keeps the latest ACTIVITY_CAP. Every tap is its own entry: nothing is merged. */
export function addActivity(store:ActivityStore,entry:ActivityEntry,now=new Date()):ActivityStore{
 const item:ActivityItem={id:`${now.getTime().toString(36)}-${(sequence++).toString(36)}`,at:now.toISOString(),kind:entry.kind,...(entry.placeId?{placeId:entry.placeId}:{}),...(entry.refId?{refId:entry.refId}:{}),...(entry.tokens?{tokens:entry.tokens}:{})};
 return {version:1,items:[...store.items,item].slice(-ACTIVITY_CAP)};
}
/** "HH:MM" in Ulaanbaatar time (UTC+8, no daylight saving). */
export function timeInUB(at:string){return new Date(Date.parse(at)+8*3600000).toISOString().slice(11,16);}
/** Newest first, grouped by Ulaanbaatar day. Items inside a day are newest first too. */
export function groupByDay(items:readonly ActivityItem[]):{day:string;items:ActivityItem[]}[]{
 const groups:{day:string;items:ActivityItem[]}[]=[];
 for(const item of [...items].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))){const day=dayInUB(new Date(Date.parse(item.at)));const last=groups[groups.length-1];if(last&&last.day===day)last.items.push(item);else groups.push({day,items:[item]});}
 return groups;
}
export function dayLabel(day:string,now=new Date()){return day===dayInUB(now)?'Өнөөдөр':day===dayInUB(new Date(now.getTime()-86400000))?'Өчигдөр':day;}
const groupDigits=(n:number)=>String(n).replace(/\B(?=(\d{3})+(?!\d))/g,',');
const MISSING_PLACE='Хасагдсан газар';
/** The line for one item, without the time: "Залгасан: Apteka эмийн сан", "AI хүсэлт · 1,240 token". `placeName` resolves a catalog id; a removed record says so. */
export function activityLine(item:ActivityItem,placeName?:(id:string)=>string|undefined):string{
 const place=item.placeId?placeName?.(item.placeId)??MISSING_PLACE:MISSING_PLACE,ref=item.refId?' '+item.refId:'';
 switch(item.kind){
  case 'call':return 'Залгасан: '+place;
  case 'map':return 'Газрын зураг: '+place;
  case 'share':return 'Хуваалцсан: '+place;
  case 'source':return 'Эх сурвалж нээсэн: '+place;
  case 'location':return 'Байршил ашигласан';
  case 'ai_request':return 'AI хүсэлт'+(item.tokens?' · '+groupDigits(item.tokens)+' token':'');
  case 'task_add':return 'Ажил'+ref+' нэмсэн';
  case 'task_done':return 'Ажил'+ref+' дууссан';
  case 'task_restore':return 'Ажил'+ref+' сэргээсэн';
  case 'task_delete':return 'Ажил'+ref+' устгасан';
  case 'memory_add':return 'Санамж'+ref+' хадгалсан';
  case 'memory_delete':return 'Санамж'+ref+' устгасан';
  case 'payment_add':return 'Төлбөр'+ref+' нэмсэн';
  case 'payment_paid':return 'Төлбөр'+ref+' төлсөн';
  case 'payment_unpaid':return 'Төлбөр'+ref+' төлөөгүй болгосон';
  case 'payment_delete':return 'Төлбөр'+ref+' устгасан';
  case 'entry_add':return 'Зардал'+ref+' бүртгэсэн';
  case 'entry_delete':return 'Зардал'+ref+' устгасан';
  case 'reminder_set':return 'Сануулга'+ref+' тохируулсан';
  case 'reminder_fired':return 'Сануулга'+ref+' ирсэн';
  case 'report':return 'Мэдэгдэл: '+place;
  case 'followup':return 'Залгасны дараах хариулт: '+place;
  case 'unsupported':return 'Хийж чадаагүй хүсэлт';
  case 'delete_all':return 'Бүх өгөгдлийг устгасан';
 }
}
