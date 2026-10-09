import {isClaimKind,isClaimStatus,readClaim,type Claim,type ClaimKind,type ClaimStatus} from '../utils/business.ts';
import {isEventKind,monthInUB,previousMonth,readCounts} from '../utils/counters.ts';
import {NOMI_WEB_URL} from '../utils/hosted.ts';
import {base64url,configFromEnv,hmacBase64url,installIdOf,json,sameSite,sameToken} from './assistant.ts';
import {storeFromEnv,type Store} from './store.ts';

/**
 * The business-owner side of the API (src/app/api/events, /api/business/*, /api/admin/*), on web-standard Request/Response like
 * the assistant. The counters take the same auth as /api/assistant (a pairing token or an install key); the owner pages need
 * none, since a correction is only a request to be called back; /admin needs NOMI_ADMIN_TOKEN. Everything is kept in
 * src/server/store.ts, and without a store the routes answer 503 instead of failing.
 */
export type Catalog={has:(placeId:string)=>boolean;name:(placeId:string)=>string|null};
export type PortalConfig={accessToken:string;signingSecret:string;adminToken:string;allowedOrigins:string[];store:Store|null;catalog:Catalog};
export type PortalRoute='events'|'claim'|'partner'|'report'|'admin-claims'|'admin-report-link';

export function portalConfigFromEnv(env:Record<string,string|undefined>,catalog:Catalog):PortalConfig{
 const {accessToken,signingSecret,allowedOrigins}=configFromEnv(env);
 return {accessToken,signingSecret,allowedOrigins,adminToken:env.NOMI_ADMIN_TOKEN||'',store:storeFromEnv(env),catalog};
}

/** About two events a second per install, enough for any amount of reading and far too little to move a count. */
const EVENTS_PER_MINUTE=120,CLAIMS_PER_HOUR=5,MAX_BODY=8000,ADMIN_PAGE=50,ADMIN_TOKEN_MIN=16;
/** How long a report link stays good. The founder makes a new one on /admin whenever it is needed. */
export const REPORT_LINK_DAYS=92;

const claimId=(kind:ClaimKind)=>`${kind==='partner'?'pt':'cl'}_${Date.now().toString(36)}${base64url(crypto.getRandomValues(new Uint8Array(6)))}`;
/** A rate-limit key names nobody: the install id or the address goes in as a short digest, and the key expires with its window. */
async function bucket(value:string){return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).slice(0,16);}

/**
 * The read-only report link: the place id and an expiry, signed with NOMI_SIGNING_SECRET over Web Crypto, the same HMAC-SHA256
 * the install keys use. The owner needs no account, and the link stops working on its own.
 */
export async function signReportLink(secret:string,placeId:string,expiresAt:number){
 const payload=base64url(new TextEncoder().encode(`${placeId}|${expiresAt}`));
 return `r1.${payload}.${await hmacBase64url(secret,'r1.'+payload)}`;
}
/** The place id inside a good link, or null when it was tampered with, unreadable or has expired. */
export async function readReportLink(token:string,secret:string,now=Date.now()):Promise<string|null>{
 const m=/^r1\.([A-Za-z0-9_-]{4,400})\.([A-Za-z0-9_-]{43})$/.exec(token);
 if(!m||secret.length<32)return null;
 if(!sameToken(m[2],await hmacBase64url(secret,'r1.'+m[1])))return null;
 let payload:string;
 try{payload=new TextDecoder().decode(Uint8Array.from(atob(m[1].replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0)));}catch{return null;}
 const cut=payload.lastIndexOf('|'),expiresAt=Number(payload.slice(cut+1));
 if(cut<1||!Number.isFinite(expiresAt)||expiresAt<=now)return null;
 return payload.slice(0,cut);
}

export function createPortal(config:PortalConfig){
 const {accessToken,signingSecret,adminToken,store,catalog}=config;
 const bearer=(request:Request)=>(request.headers.get('authorization')||'').replace(/^Bearer /,'');
 /** The same auth as /api/assistant: a server paired by hand, or an install key from /register. */
 async function caller(request:Request){
  const supplied=bearer(request);
  if(accessToken.length>=24&&sameToken(supplied,accessToken))return 'paired';
  return installIdOf(supplied,signingSecret);
 }
 /** The posted JSON, or null when it is too large, not JSON or not an object. */
 async function readBody(request:Request){
  try{
   const body=await request.text();
   if(new TextEncoder().encode(body).length>MAX_BODY)return null;
   const payload=JSON.parse(body);
   return payload&&typeof payload==='object'?payload as Record<string,unknown>:null;
  }catch{return null;}
 }

 /** POST /api/events: one anonymous count. Only the business, the month and the kind are stored. */
 async function events(request:Request,cors:Record<string,string>){
  const who=await caller(request);
  if(!who)return json(401,{error:'pairing_required'},cors);
  if(!store)return json(503,{error:'store_not_configured'},cors);
  const payload=await readBody(request);
  if(!payload)return json(400,{error:'invalid_body'},cors);
  const placeId=typeof payload.placeId==='string'?payload.placeId:'';
  if(!placeId||!catalog.has(placeId))return json(400,{error:'unknown_place'},cors);
  if(!isEventKind(payload.kind))return json(400,{error:'invalid_kind'},cors);
  if(await store.bump(`rl:ev:${await bucket(who)}:${Math.floor(Date.now()/60000)}`,120)>EVENTS_PER_MINUTE)return json(429,{error:'rate_limit'},cors);
  await store.addEvent(placeId,monthInUB(),payload.kind);
  return json(200,{ok:true},cors);
 }

 /**
  * POST /api/business/claim and /api/business/partner: a pending claim with an id and a time. Nothing changes in the catalog
  * until the founder has called the number it lists. The cap is per address, and only a claim that passed every check counts
  * against it, so a mistyped form costs nothing.
  */
 async function claim(kind:ClaimKind,request:Request,client:string,cors:Record<string,string>){
  if(!store)return json(503,{error:'store_not_configured'},cors);
  const payload=await readBody(request);
  if(!payload)return json(400,{error:'invalid_body'},cors);
  const read=readClaim({...payload,kind},id=>catalog.has(id));
  if('error' in read)return json(400,{error:read.error},cors);
  if(await store.bump(`rl:cl:${await bucket(client)}:${Math.floor(Date.now()/3600000)}`,3600)>CLAIMS_PER_HOUR)return json(429,{error:'rate_limit'},cors);
  // A claim about a listed business keeps the catalog's name, so /admin and the export read as a name rather than an id.
  const businessName=read.claim.businessName||(read.claim.placeId?catalog.name(read.claim.placeId)??'':'');
  const record:Claim={...read.claim,businessName,id:claimId(kind),status:'pending',createdAt:new Date().toISOString()};
  await store.saveClaim(record);
  return json(200,{id:record.id,status:record.status},cors);
 }

 /** GET /api/business/report?k=: this month and last month for the business the link names. */
 async function report(request:Request,cors:Record<string,string>){
  const placeId=await readReportLink(new URL(request.url).searchParams.get('k')||'',signingSecret);
  if(!placeId)return json(404,{error:'invalid_link'},cors);
  if(!store)return json(503,{error:'store_not_configured'},cors);
  const month=monthInUB(),before=previousMonth(month);
  const [now,last]=await Promise.all([store.counts(placeId,month),store.counts(placeId,before)]);
  return json(200,{placeId,name:catalog.name(placeId),month,previousMonth:before,counts:readCounts(now),previousCounts:readCounts(last)},cors);
 }

 const adminReady=()=>adminToken.length>=ADMIN_TOKEN_MIN;
 const admin=(request:Request)=>adminReady()&&sameToken(bearer(request),adminToken);

 /** GET /api/admin/claims lists them newest first; POST marks one approved, rejected or called. */
 async function adminClaims(request:Request,cors:Record<string,string>){
  if(!adminReady())return json(503,{error:'admin_not_configured'},cors);
  if(!admin(request))return json(401,{error:'admin_token_required'},cors);
  if(!store)return json(503,{error:'store_not_configured'},cors);
  if(request.method==='POST'){
   const payload=await readBody(request);
   const id=typeof payload?.id==='string'?payload.id:'';
   if(!id||!isClaimStatus(payload?.status))return json(400,{error:'invalid_body'},cors);
   const record=await store.getClaim(id);
   if(!record)return json(404,{error:'not_found'},cors);
   const updated:Claim={...record,status:payload!.status};
   await store.saveClaim(updated);
   return json(200,{claim:updated},cors);
  }
  const params=new URL(request.url).searchParams,kind=params.get('kind'),status=params.get('status');
  if(kind&&!isClaimKind(kind))return json(400,{error:'invalid_kind'},cors);
  if(status&&!isClaimStatus(status))return json(400,{error:'invalid_status'},cors);
  const limit=Math.min(Math.max(Number(params.get('limit'))||ADMIN_PAGE,1),500);
  // The database filters and orders them, so the export asking for approved claims gets every one, not the newest page filtered.
  const items=await store.listClaims({...(kind?{kind:kind as ClaimKind}:{}),...(status?{status:status as ClaimStatus}:{}),limit});
  return json(200,{items},cors);
 }

 /** GET /api/admin/report-link?placeId=: the signed link the founder sends the owner. */
 async function reportLink(request:Request,cors:Record<string,string>){
  if(!adminReady())return json(503,{error:'admin_not_configured'},cors);
  if(!admin(request))return json(401,{error:'admin_token_required'},cors);
  if(signingSecret.length<32)return json(503,{error:'links_unavailable'},cors);
  const placeId=new URL(request.url).searchParams.get('placeId')||'';
  if(!placeId||!catalog.has(placeId))return json(400,{error:'unknown_place'},cors);
  const expiresAt=Date.now()+REPORT_LINK_DAYS*86400000;
  const token=await signReportLink(signingSecret,placeId,expiresAt);
  return json(200,{placeId,name:catalog.name(placeId),expiresAt:new Date(expiresAt).toISOString(),link:`${NOMI_WEB_URL}/business/report?k=${token}`},cors);
 }

 /** `client` identifies the caller for the caps: `clientAddress` hosted, the socket address locally. */
 return async function handle(route:PortalRoute|null,request:Request,client:string):Promise<Response>{
  const origin=request.headers.get('origin');let cors:Record<string,string>={};
  // The same rule as the assistant: the listed origins and the site the API is served with. EAS Hosting replaces Origin with an
  // address of the deployment itself, so there the check is against Host.
  if(origin){
   if(!config.allowedOrigins.includes(origin)&&!sameSite(origin,request))return json(403,{error:'origin_not_allowed'});
   cors={'Access-Control-Allow-Origin':origin,Vary:'Origin','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'POST,GET,OPTIONS'};
  }
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  try{
   if(route==='events'&&request.method==='POST')return await events(request,cors);
   if(route==='claim'&&request.method==='POST')return await claim('claim',request,client,cors);
   if(route==='partner'&&request.method==='POST')return await claim('partner',request,client,cors);
   if(route==='report'&&request.method==='GET')return await report(request,cors);
   if(route==='admin-claims'&&(request.method==='GET'||request.method==='POST'))return await adminClaims(request,cors);
   if(route==='admin-report-link'&&request.method==='GET')return await reportLink(request,cors);
   return json(404,{error:'not_found'},cors);
  }catch{
   // A store that cannot be reached, or answers with an error, never takes a route down with it.
   return json(503,{error:'store_unavailable'},cors);
  }
 };
}
