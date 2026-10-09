import type {Claim,ClaimKind,ClaimStatus} from '../utils/business.ts';

/**
 * Where the business-owner side keeps what has to outlive one request: the anonymous counters, the owner requests and the rate
 * limits. Supabase (Postgres) over its REST API with plain fetch, no SDK, so it runs unchanged on the Workers runtime EAS
 * Hosting serves. The tables and the two functions are in supabase/schema.sql.
 *
 * Hosted settings: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The service key bypasses Row Level Security and never leaves the
 * server. Tests and dev keep everything in memory instead; in production without the two variables there is no store at all and
 * the routes that need one answer 503 store_not_configured (src/server/portal.ts).
 */
export type Store={
 /** One anonymous count: this business, this Ulaanbaatar month, this kind. Nothing about who sent it. */
 addEvent(placeId:string,month:string,kind:string):Promise<void>;
 /** Every kind's count for one business in one month; a month with nothing counted is an empty object. */
 counts(placeId:string,month:string):Promise<Record<string,number>>;
 /** Stores a new claim, or writes back one whose status the founder changed. */
 saveClaim(claim:Claim):Promise<void>;
 getClaim(id:string):Promise<Claim|null>;
 /** Newest first, filtered where asked. */
 listClaims(opts:{kind?:ClaimKind;status?:ClaimStatus;limit:number}):Promise<Claim[]>;
 /** One step of a rate limit: the window's new count. The row goes on its own once the window passes. */
 bump(key:string,windowSeconds:number):Promise<number>;
};

/** The hosted store when both variables are set; in memory for tests and dev; nothing in production without them. */
export function storeFromEnv(env:Record<string,string|undefined>):Store|null{
 const url=env.SUPABASE_URL,key=env.SUPABASE_SERVICE_ROLE_KEY;
 if(url&&key)return supabaseStore(url,key);
 if(env.NODE_ENV==='production')return null;
 // The dev server loads each API route as its own module, so the one memory store lives on globalThis: without that a claim
 // stored by /api/business/claim would be invisible to /api/admin/claims. Tests call memoryStore() and stay separate.
 const shared=globalThis as {__nomiMemoryStore__?:Store};
 return (shared.__nomiMemoryStore__??=memoryStore());
}

/** The store the tests use, and `npx expo start` without a database: the same behaviour, lost on restart. */
export function memoryStore():Store&{claims:()=>Claim[]}{
 const counts=new Map<string,Map<string,number>>(),claims=new Map<string,Claim>(),limits=new Map<string,{n:number;expires:number}>();
 const countKey=(placeId:string,month:string)=>placeId+'\u0000'+month;
 return {
  async addEvent(placeId,month,kind){
   const key=countKey(placeId,month),row=counts.get(key)??new Map<string,number>();
   row.set(kind,(row.get(kind)??0)+1);counts.set(key,row);
  },
  async counts(placeId,month){return Object.fromEntries(counts.get(countKey(placeId,month))??[]);},
  // A copy, so a later change to the caller's object never reaches the store, as it would not over the REST API.
  async saveClaim(claim){claims.set(claim.id,JSON.parse(JSON.stringify(claim)));},
  async getClaim(id){const claim=claims.get(id);return claim?JSON.parse(JSON.stringify(claim)):null;},
  async listClaims({kind,status,limit}){
   return [...claims.values()]
    .filter(c=>(!kind||c.kind===kind)&&(!status||c.status===status))
    .sort((a,b)=>b.createdAt.localeCompare(a.createdAt))
    .slice(0,Math.max(0,limit))
    .map(c=>JSON.parse(JSON.stringify(c)));
  },
  async bump(key,windowSeconds){
   const now=Date.now(),row=limits.get(key);
   if(row&&row.expires>now){row.n++;return row.n;}
   limits.set(key,{n:1,expires:now+windowSeconds*1000});return 1;
  },
  claims:()=>[...claims.values()],
 };
}

/** The claims table as the app reads it, and back. Postgres keeps snake_case; the app keeps the shape the pages send. */
type ClaimRow={id:string;kind:string;status:string;place_id:string|null;business_name:string;category:string|null;phones:string[];hours:string;address_note:string;service_areas:string[];owner_name:string;contact_phone:string;is_owner:boolean;note:string;created_at:string};
const toRow=(c:Claim):ClaimRow=>({id:c.id,kind:c.kind,status:c.status,place_id:c.placeId,business_name:c.businessName,category:c.category,phones:c.phones,hours:c.hours,address_note:c.addressNote,service_areas:c.serviceAreas,owner_name:c.ownerName,contact_phone:c.contactPhone,is_owner:c.isOwner,note:c.note,created_at:c.createdAt});
const fromRow=(r:ClaimRow):Claim=>({id:r.id,kind:r.kind as ClaimKind,status:r.status as ClaimStatus,placeId:r.place_id,businessName:r.business_name??'',category:r.category,phones:r.phones??[],hours:r.hours??'',addressNote:r.address_note??'',serviceAreas:r.service_areas??[],ownerName:r.owner_name??'',contactPhone:r.contact_phone??'',isOwner:Boolean(r.is_owner),note:r.note??'',createdAt:new Date(r.created_at).toISOString()});

/** Supabase's REST API (PostgREST) and the two functions in supabase/schema.sql. */
export function supabaseStore(url:string,serviceKey:string):Store{
 const base=url.replace(/\/$/,'')+'/rest/v1';
 const headers={apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'};
 async function send(path:string,init:RequestInit){
  const response=await fetch(base+path,{...init,headers:{...headers,...init.headers},signal:AbortSignal.timeout(6000)});
  if(!response.ok)throw new Error(`store_http_${response.status}`);
  const body=await response.text();
  return body?JSON.parse(body):null;
 }
 const rpc=(name:string,args:Record<string,unknown>)=>send('/rpc/'+name,{method:'POST',body:JSON.stringify(args)});
 return {
  async addEvent(placeId,month,kind){await rpc('add_place_event',{p_place_id:placeId,p_month:month,p_kind:kind});},
  async counts(placeId,month){
   const rows=await send(`/place_counts?select=kind,n&place_id=eq.${encodeURIComponent(placeId)}&month=eq.${encodeURIComponent(month)}`,{method:'GET'}) as {kind:string;n:number}[]|null;
   return Object.fromEntries((rows??[]).map(r=>[r.kind,Number(r.n)]));
  },
  // One row per id: a new claim is inserted, a marked one replaces itself.
  async saveClaim(claim){await send('/claims',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(toRow(claim))});},
  async getClaim(id){
   const rows=await send(`/claims?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,{method:'GET'}) as ClaimRow[]|null;
   return rows?.length?fromRow(rows[0]):null;
  },
  async listClaims({kind,status,limit}){
   const where=[kind?`&kind=eq.${kind}`:'',status?`&status=eq.${status}`:''].join('');
   const rows=await send(`/claims?select=*&order=created_at.desc&limit=${Math.max(1,limit)}${where}`,{method:'GET'}) as ClaimRow[]|null;
   return (rows??[]).map(fromRow);
  },
  async bump(key,windowSeconds){return Number(await rpc('bump_rate_limit',{p_key:key,p_window_seconds:windowSeconds}));},
 };
}
