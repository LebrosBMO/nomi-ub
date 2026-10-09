/**
 * The small key-value store the business-owner side needs (anonymous counters, pending claims, rate limits): the Upstash Redis
 * REST API over plain fetch, so it runs unchanged on the Workers runtime EAS Hosting serves. Hosted settings:
 * UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN. Tests and dev keep everything in memory instead; in production without the
 * two variables there is no store at all and the routes that need one answer 503 store_not_configured (src/server/portal.ts).
 */
export type Store={
 /** Adds to one field of a hash and answers its new value. The counters, c:<placeId>:<month>, are kept this way. */
 hincrby(key:string,field:string,by:number):Promise<number>;
 /** Every field of a hash as text; an unset key is an empty object. */
 hgetall(key:string):Promise<Record<string,string>>;
 /** One JSON value, or null when the key is unset or holds something unreadable. */
 get<T>(key:string):Promise<T|null>;
 /** Writes one JSON value, with an optional lifetime in seconds. */
 set(key:string,value:unknown,ttlSeconds?:number):Promise<void>;
 /** Puts a member at the head of a list: the claim ids, newest first. */
 push(key:string,member:string):Promise<void>;
 /** At most `limit` members of a list, newest first. */
 list(key:string,limit:number):Promise<string[]>;
 /** One step of a rate limit: the window's new count. The key goes on its own after `ttlSeconds`. */
 bump(key:string,ttlSeconds:number):Promise<number>;
};

/** The hosted store when both variables are set; in memory for tests and dev; nothing in production without them. */
export function storeFromEnv(env:Record<string,string|undefined>):Store|null{
 const url=env.UPSTASH_REDIS_REST_URL,token=env.UPSTASH_REDIS_REST_TOKEN;
 if(url&&token)return upstashStore(url,token);
 if(env.NODE_ENV==='production')return null;
 // The dev server loads each API route as its own module, so the one memory store lives on globalThis: without that a claim
 // stored by /api/business/claim would be invisible to /api/admin/claims. Tests call memoryStore() and stay separate.
 const shared=globalThis as {__nomiMemoryStore__?:Store};
 return (shared.__nomiMemoryStore__??=memoryStore());
}

/** The store used by the tests and by `npx expo start` without an Upstash database: the same behaviour, lost on restart. `keys` is for the tests, which check what a key may hold. */
export function memoryStore():Store&{keys:()=>string[]}{
 const data=new Map<string,{value:unknown;expires:number}>();
 const live=(key:string)=>{const e=data.get(key);if(!e)return undefined;if(e.expires&&e.expires<=Date.now()){data.delete(key);return undefined;}return e;};
 const put=(key:string,value:unknown,ttlSeconds?:number)=>{const e={value,expires:ttlSeconds?Date.now()+ttlSeconds*1000:0};data.set(key,e);return e;};
 const hash=(key:string)=>(live(key)??put(key,new Map<string,number>())).value as Map<string,number>;
 const items=(key:string)=>(live(key)??put(key,[] as string[])).value as string[];
 return {
  async hincrby(key,field,by){const h=hash(key),next=(h.get(field)??0)+by;h.set(field,next);return next;},
  async hgetall(key){const e=live(key);return e?Object.fromEntries([...(e.value as Map<string,number>)].map(([f,v])=>[f,String(v)])):{};},
  async get<T>(key:string){const e=live(key);return e?(e.value as T):null;},
  // A copy, so a later change to the caller's object never reaches the store, as it would not over the REST API.
  async set(key,value,ttlSeconds){put(key,JSON.parse(JSON.stringify(value)),ttlSeconds);},
  async push(key,member){items(key).unshift(member);},
  async list(key,limit){return items(key).slice(0,Math.max(0,limit));},
  async bump(key,ttlSeconds){const e=live(key);if(e){e.value=(e.value as number)+1;return e.value as number;}put(key,1,ttlSeconds);return 1;},
  keys(){return [...data.keys()].filter(key=>Boolean(live(key)));},
 };
}

/** The Upstash REST API: one command as a JSON array posted to the base URL, several through /pipeline. */
export function upstashStore(url:string,token:string):Store{
 const base=url.replace(/\/$/,'');
 async function send(path:string,body:unknown){
  const response=await fetch(base+path,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error('store_http_'+response.status);
  return response.json();
 }
 async function one(...command:(string|number)[]){
  const body=await send('',command) as {result?:unknown;error?:string};
  if(body.error)throw new Error('store_command');
  return body.result;
 }
 async function pipeline(...commands:(string|number)[][]){
  const body=await send('/pipeline',commands) as {result?:unknown;error?:string}[];
  if(!Array.isArray(body)||body.some(r=>r?.error))throw new Error('store_command');
  return body.map(r=>r.result);
 }
 const parse=<T>(raw:unknown):T|null=>{if(typeof raw!=='string')return null;try{return JSON.parse(raw) as T;}catch{return null;}};
 return {
  async hincrby(key,field,by){return Number(await one('HINCRBY',key,field,by));},
  async hgetall(key){
   // HGETALL comes back as a flat [field, value, field, value] array, and as null for a key that is not there.
   const flat=await one('HGETALL',key);
   if(!Array.isArray(flat))return {};
   const result:Record<string,string>={};
   for(let i=0;i+1<flat.length;i+=2)result[String(flat[i])]=String(flat[i+1]);
   return result;
  },
  async get<T>(key:string){return parse<T>(await one('GET',key));},
  async set(key,value,ttlSeconds){await one(...(ttlSeconds?['SET',key,JSON.stringify(value),'EX',ttlSeconds]:['SET',key,JSON.stringify(value)]) as (string|number)[]);},
  async push(key,member){await one('LPUSH',key,member);},
  async list(key,limit){const items=await one('LRANGE',key,0,Math.max(0,limit)-1);return Array.isArray(items)?items.map(String):[];},
  // The window is part of the key, so the lifetime is set again on every step without ever stretching the window.
  async bump(key,ttlSeconds){const [count]=await pipeline(['INCR',key],['EXPIRE',key,ttlSeconds]);return Number(count);},
 };
}
