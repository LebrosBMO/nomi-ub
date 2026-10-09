import {dayInUB} from './personal.ts';
/** "Мэдээлэл буруу" reports from cards (PRD Section 6) and, later, follow-up answers after a call (Section 14, `kind: 'followup'`). Kept on the device; leaves it only through the export the user taps. Storage lives in reports-storage.ts. */
export const REPORT_REASONS=[['closed','Хаагдсан'],['wrong_phone','Утас буруу'],['wrong_address','Хаяг буруу'],['wrong_hours','Цаг буруу'],['other','Өөр']] as const;
export type ReportReason=(typeof REPORT_REASONS)[number][0];
export const FOLLOWUP_OUTCOMES=['helped','not_helped','closed','wrong_phone','later'] as const;
export type FollowupOutcome=(typeof FOLLOWUP_OUTCOMES)[number];
export type Report={id:string;kind:'report'|'followup';placeId:string;reason:ReportReason|null;outcome?:FollowupOutcome;note:string;createdAt:string;appVersion:string};
export type ReportStore={version:1;items:Report[]};
export type ReportDraft={kind?:Report['kind'];placeId:string;reason?:ReportReason|null;outcome?:FollowupOutcome;note?:string;appVersion:string};
/** The store keeps this many of the latest reports. */
export const REPORT_CAP=200;
export const NOTE_LIMIT=200;
/** The same place, kind, reason and outcome inside this window is one report (AC 6.3). */
export const REPORT_WINDOW_MS=24*3600000;
export const REPORT_THANKS='Баярлалаа. Мэдээлэл энэ утсанд хадгалагдлаа; дараагийн шалгалтад ашиглана.';
export const REPORTED_LABEL='Та мэдэгдсэн';
export const emptyReports=():ReportStore=>({version:1,items:[]});
const reasons=new Set<string>(REPORT_REASONS.map(([r])=>r)),outcomes=new Set<string>(FOLLOWUP_OUTCOMES);
const text=(v:unknown,max:number)=>typeof v==='string'&&v.length>0&&v.length<=max;
/** Only the listed fields, in a fixed order; `outcome` only when set. Used by restore and by the export (AC 6.2). */
const pick=(r:Report):Report=>({id:r.id,kind:r.kind,placeId:r.placeId,reason:r.reason,...(r.outcome?{outcome:r.outcome}:{}),note:r.note,createdAt:r.createdAt,appVersion:r.appVersion});
export function validReport(v:unknown):v is Report{
 if(!v||typeof v!=='object')return false;const r=v as Record<string,unknown>;
 return text(r.id,80)&&(r.kind==='report'||r.kind==='followup')&&text(r.placeId,80)&&(r.reason===null||reasons.has(r.reason as string))&&(r.outcome===undefined||outcomes.has(r.outcome as string))&&typeof r.note==='string'&&r.note.length<=NOTE_LIMIT&&typeof r.createdAt==='string'&&Number.isFinite(Date.parse(r.createdAt))&&typeof r.appVersion==='string';
}
/** Reads a saved store. Malformed items are dropped, an unknown shape becomes an empty store, and the cap applies. */
export function restoreReports(raw:unknown):ReportStore{
 const v=raw as Partial<ReportStore>|null;if(!v||v.version!==1||!Array.isArray(v.items))return emptyReports();
 return {version:1,items:v.items.filter(validReport).map(pick).slice(-REPORT_CAP)};
}
let sequence=0;
const sameCase=(a:Report,b:Pick<Report,'kind'|'placeId'|'reason'|'outcome'>)=>a.kind===b.kind&&a.placeId===b.placeId&&a.reason===b.reason&&(a.outcome??null)===(b.outcome??null);
/**
 * Adds one report. `report` is null when the same place, kind, reason and outcome was already saved inside the last 24 hours (AC 6.3);
 * the store is returned unchanged then. Notes are trimmed and cut at NOTE_LIMIT; the store keeps the latest REPORT_CAP.
 */
export function addReport(store:ReportStore,draft:ReportDraft,now=new Date()):{store:ReportStore;report:Report|null}{
 const report:Report=pick({id:`${now.getTime().toString(36)}-${(sequence++).toString(36)}`,kind:draft.kind??'report',placeId:draft.placeId,reason:draft.reason??null,outcome:draft.outcome,note:(draft.note??'').trim().slice(0,NOTE_LIMIT),createdAt:now.toISOString(),appVersion:draft.appVersion});
 if(store.items.some(r=>sameCase(r,report)&&Math.abs(now.getTime()-Date.parse(r.createdAt))<REPORT_WINDOW_MS))return {store,report:null};
 return {store:{version:1,items:[...store.items,report].slice(-REPORT_CAP)},report};
}
/** Ids of places this device flagged as wrong: "Мэдээлэл буруу" reports and the follow-up answers Хаагдсан / Утас буруу (Section 14: the user never explains twice). For the "Та мэдэгдсэн" state and the reported-last ordering. */
export function reportedPlaces(store:ReportStore):ReadonlySet<string>{return new Set(store.items.filter(r=>r.kind==='report'||r.outcome==='closed'||r.outcome==='wrong_phone').map(r=>r.placeId));}
/** The export file: the listed fields only (AC 6.2), pretty-printed for a reviewer. */
export function serializeReports(store:ReportStore):string{return JSON.stringify({version:1,items:store.items.map(pick)},null,2)+'\n';}
export function exportFileName(now=new Date()){return `nomi-reports-${dayInUB(now)}.json`;}
