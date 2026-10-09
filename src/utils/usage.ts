import {dayInUB} from './personal.ts';
export type TokenUsage={input:number;output:number;total:number};
export type ServerDaily={used:number;limit:number};
/** Today's usage on this device, counted in Ulaanbaatar time. Storage lives in usage-storage.ts. */
export type DailyUsage={day:string;messages:number;aiRequests:number;tokens:number;server:ServerDaily|null};
export const count=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:0;
export const emptyUsage=(day=dayInUB()):DailyUsage=>({day,messages:0,aiRequests:0,tokens:0,server:null});
export const todayUsage=(u:DailyUsage)=>u.day===dayInUB()?u:emptyUsage();
export function readTokens(v:unknown):TokenUsage|undefined{if(!v||typeof v!=='object')return;const u=v as Record<string,unknown>,total=count(u.total);return total?{input:count(u.input),output:count(u.output),total}:undefined;}
export function readDaily(v:unknown):ServerDaily|undefined{if(!v||typeof v!=='object')return;const d=v as Record<string,unknown>,limit=count(d.limit);return limit?{used:Math.min(count(d.used),limit),limit}:undefined;}
export function addUsage(prev:DailyUsage,add:{ai:boolean;tokens?:TokenUsage;server?:ServerDaily}):DailyUsage{
 const base=prev.day===dayInUB()?prev:emptyUsage();
 return {...base,messages:base.messages+1,aiRequests:base.aiRequests+(add.ai?1:0),tokens:base.tokens+(add.tokens?.total??0),server:add.server??base.server};
}
