import {dayInUB} from './personal.ts';

/**
 * The anonymous counters behind the monthly report a business owner sees (/business/report): how often each business was shown
 * and called. One row per business, month and kind (supabase/schema.sql). Nothing else is ever stored with a count: no message
 * text, no position and no install id.
 */
export const EVENT_KINDS=['view','open','call','map','share'] as const;
export type EventKind=(typeof EVENT_KINDS)[number];
export const isEventKind=(value:unknown):value is EventKind=>typeof value==='string'&&(EVENT_KINDS as readonly string[]).includes(value);
export type Counts=Record<EventKind,number>;
/** What each kind means on the report, in the owner's words. Nothing sends `open` yet; it waits for a full page per business. */
export const KIND_LABELS:Record<EventKind,string>={view:'Харсан',open:'Дэлгэрэнгүй харсан',call:'Залгасан',map:'Газрын зураг',share:'Хуваалцсан'};

/** The Ulaanbaatar month, "YYYY-MM": a count belongs to the month it happened in there, not in UTC. */
export const monthInUB=(now=new Date())=>dayInUB(now).slice(0,7);
/** The month before it, "YYYY-MM". */
export function previousMonth(month:string){const [year,m]=month.split('-').map(Number);return m>1?`${year}-${String(m-1).padStart(2,'0')}`:`${year-1}-12`;}
export const emptyCounts=():Counts=>({view:0,open:0,call:0,map:0,share:0});

/** One month's row as whole numbers; a kind the store does not know is left out and anything unreadable counts as zero. */
export function readCounts(row:Record<string,string|number>):Counts{
 const counts=emptyCounts();
 for(const kind of EVENT_KINDS){const n=Number(row[kind]);counts[kind]=Number.isSafeInteger(n)&&n>0?n:0;}
 return counts;
}

/** The report's plain line: "Энэ сард 312 хүн таныг харж, 14 хүн залгасан." */
export function summaryLine(counts:Counts):string{
 if(!counts.view)return 'Энэ сард Nomi дээр таныг хараахан хэн ч хараагүй байна.';
 if(!counts.call)return `Энэ сард ${counts.view} хүн таныг харсан ч хэн ч залгаагүй.`;
 return `Энэ сард ${counts.view} хүн таныг харж, ${counts.call} хүн залгасан.`;
}
