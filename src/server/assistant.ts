import {validateIntent} from '../utils/core.ts';
import {dayInUB} from '../utils/personal.ts';
import {isCategory,matchCategories,preferNamed} from '../utils/category-match.ts';
import {SYSTEM_PROMPT,intentSchema} from './prompt.ts';

/**
 * The assistant endpoint on web-standard Request/Response, so it runs both as the local Node server (server/index.ts) and as
 * Expo Router API routes on EAS Hosting (src/app/api). Only the request text and the previous intent reach OpenAI.
 */
export type AssistantConfig={key:string;accessToken:string;signingSecret:string;blocked:string[];api:string;model:string;dailyLimit:number;effort:string;allowedOrigins:string[]};
export type Route='health'|'assistant'|'register';

export function configFromEnv(env:Record<string,string|undefined>):AssistantConfig{
 // 'none' leaves reasoning out.
 const effort=env.OPENAI_REASONING_EFFORT||'low';
 return {key:env.OPENAI_API_KEY||'',accessToken:env.NOMI_ACCESS_TOKEN||'',signingSecret:env.NOMI_SIGNING_SECRET||'',blocked:(env.NOMI_BLOCKED_INSTALLS||'').split(',').map(i=>i.trim()).filter(Boolean),api:(env.OPENAI_BASE_URL||'https://api.openai.com/v1').replace(/\/$/,''),model:env.OPENAI_MODEL||'gpt-6-luna',dailyLimit:Number(env.MAX_DAILY_AI_REQUESTS||200),effort:effort==='none'?'':effort,allowedOrigins:(env.ALLOWED_ORIGINS||'http://localhost:8081,http://localhost:8082').split(',').map(o=>o.trim()).filter(Boolean)};
}

const MAX_BODY=12000,PER_MINUTE=10,REGISTRATIONS_PER_HOUR=5;
const json=(status:number,body:unknown,headers:Record<string,string>={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
/** Constant-time comparison without Node's Buffer, which the Workers runtime lacks. */
function sameToken(supplied:string,expected:string){const a=new TextEncoder().encode(supplied),b=new TextEncoder().encode(expected);if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a[i]^b[i];return d===0;}

/**
 * Install keys: what a phone that was not paired by hand gets from POST /register, without any sign-up. "i1.<random id>.<HMAC>"
 * signed with NOMI_SIGNING_SECRET, so the server checks it without storing anything and can refuse one install
 * (NOMI_BLOCKED_INSTALLS) without touching the rest. Web Crypto, which both Node and the Workers runtime have.
 */
const base64url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function signature(secret:string,id:string){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return base64url(new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode('i1.'+id))));}
export async function issueInstallKey(secret:string){const id=base64url(crypto.getRandomValues(new Uint8Array(16)));return `i1.${id}.${await signature(secret,id)}`;}
/** The install id inside a valid key, or null. */
export async function installIdOf(key:string,secret:string){const m=/^i1\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(key);if(!m||secret.length<32)return null;return sameToken(m[2],await signature(secret,m[1]))?m[1]:null;}

/** The project label of an EAS Hosting address: "nomi-ub" for nomi-ub.expo.app and for a deployment such as nomi-ub--ckn34llwqb.expo.app. */
const projectOf=(host:string)=>host.endsWith('.expo.app')?host.split('.')[0].split('--')[0]:null;
/** EAS Hosting replaces Origin with an address of the deployment itself (the production alias and the deployment address can differ), so a browser's own origin never reaches this check there; browsers are held back by the CORS reply instead. */
function sameSite(origin:string,request:Request){let o:string;try{o=new URL(origin).host;}catch{return false;}const hosts=[request.headers.get('host'),request.headers.get('x-forwarded-host'),new URL(request.url).host].filter((h):h is string=>Boolean(h));return hosts.some(h=>h===o||(projectOf(h)!==null&&projectOf(h)===projectOf(o)));}

/** The caller's address on EAS Hosting, which forwards it in X-Real-IP and X-Forwarded-For. */
export function clientAddress(request:Request){return request.headers.get('x-real-ip')||request.headers.get('x-forwarded-for')?.split(',')[0].trim()||request.headers.get('cf-connecting-ip')||'unknown';}

/**
 * One assistant with its own counters. On EAS Hosting each worker instance keeps its own, so the per-address and daily caps
 * are per instance: the OpenAI account's monthly budget is the hard limit on the bill.
 */
export function createAssistant(config:AssistantConfig){
 const requests=new Map<string,{count:number;reset:number}>(),registrations=new Map<string,{count:number;reset:number}>();let day='',used=0,effort=config.effort;
 const {key,accessToken,signingSecret,api,model,dailyLimit}=config,blocked=new Set(config.blocked);
 const counted=(counts:Map<string,{count:number;reset:number}>,who:string,max:number,windowMs:number)=>{const now=Date.now();let c=counts.get(who);if(!c||now>c.reset){c={count:0,reset:now+windowMs};counts.set(who,c);}return c.count++<max;};
 // store:false keeps the request out of OpenAI's stored responses.
 const ask=(input:string)=>fetch(api+'/responses',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify({model,instructions:SYSTEM_PROMPT,input,text:{format:{type:'json_schema',name:'nomi_intent',schema:intentSchema,strict:true}},...(effort?{reasoning:{effort}}:{}),max_output_tokens:2000,store:false}),signal:AbortSignal.timeout(15000)});
 const allowed=(supplied:string)=>accessToken.length>=24&&sameToken(supplied,accessToken);

 async function assist(request:Request,client:string,cors:Record<string,string>){
  // The pairing token of a laptop server, or an install key from /register.
  const supplied=(request.headers.get('authorization')||'').replace(/^Bearer /,''),install=allowed(supplied)?null:await installIdOf(supplied,signingSecret);
  if(!allowed(supplied)&&(!install||blocked.has(install)))return json(401,{error:'pairing_required'},cors);
  if(!key)return json(503,{error:'ai_not_configured'},cors);
  // Per address, since new install keys cost nothing to get.
  if(!counted(requests,client,PER_MINUTE,60000))return json(429,{error:'rate_limit'},cors);
  const today=dayInUB();if(today!==day){day=today;used=0;}if(used>=dailyLimit)return json(429,{error:'daily_limit'},cors);
  try{
   const body=await request.text();if(new TextEncoder().encode(body).length>MAX_BODY)return json(413,{error:'too_large'},cors);
   const payload=JSON.parse(body);if(typeof payload.message!=='string'||!payload.message.trim()||payload.message.length>1000)return json(400,{error:'invalid_message'},cors);
   const previous=payload.previous?validateIntent(payload.previous):null;used++;
   const input=JSON.stringify({previous,message:payload.message});
   let result=await ask(input);
   // A model that rejects the reasoning setting gets requests without it for the rest of this instance.
   if(result.status===400&&effort){const e=await result.clone().json().catch(()=>null) as any;if(/reasoning/i.test(e?.error?.message||'')){effort='';result=await ask(input);}}
   // OpenAI's error code (e.g. insufficient_quota vs rate_limit_exceeded) goes to the log only, never the request text.
   if(!result.ok){const e=await result.json().catch(()=>null) as any;console.warn(`OpenAI ${result.status} ${e?.error?.code||e?.error?.type||'unknown'}`);return json(result.status===429?429:502,{error:'provider_unavailable'},cors);}
   const data=await result.json() as any;if(data.status!=='completed')return json(502,{error:'invalid_or_unavailable_response'},cors);
   // A refusal has no output_text, so it fails to parse and the app answers offline.
   const text=(data.output||[]).flatMap((o:any)=>o.type==='message'&&Array.isArray(o.content)?o.content:[]).filter((c:any)=>c.type==='output_text'&&typeof c.text==='string').map((c:any)=>c.text).join('');
   // A category the registry does not know (a near-miss such as "tailor_shop" or a Mongolian name) is matched by its words, then
   // by the request; failing both it is null, and the app asks what service is meant.
   const raw=JSON.parse(text);if(raw&&raw.category!=null&&!isCategory(raw.category))raw.category=matchCategories(String(raw.category).replace(/_/g,' '))[0]??matchCategories(String(raw.query??''))[0]??null;
   if(raw&&typeof raw.category==='string'&&isCategory(raw.category))raw.category=preferNamed(raw.category,payload.message);
   const intent=validateIntent(raw);
   // OpenAI counts reasoning tokens inside output_tokens; both are billed as output.
   const meta=data.usage||{},n=(v:unknown)=>Number.isSafeInteger(v)&&(v as number)>=0?v as number:0;
   const usage={input:n(meta.input_tokens),output:n(meta.output_tokens),total:n(meta.total_tokens)};
   return json(200,{intent,model,mode:'openai',usage,daily:{used,limit:dailyLimit}},cors);
  }catch{return json(502,{error:'invalid_or_unavailable_response'},cors);}
 }

 /** `client` identifies the caller for the per-minute cap: the socket address locally, `clientAddress` hosted. */
 return async function handle(route:Route|null,request:Request,client:string):Promise<Response>{
  const origin=request.headers.get('origin');let cors:Record<string,string>={};
  // Phones send no Origin. A browser is let in from the listed origins and from the site the API is served with. EAS Hosting
  // sets Origin to the address it was called on (the host), so there the check is against Host, not the request URL.
  if(origin){if(!config.allowedOrigins.includes(origin)&&!sameSite(origin,request))return json(403,{error:'origin_not_allowed'});cors={'Access-Control-Allow-Origin':origin,Vary:'Origin','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'POST,GET,OPTIONS'};}
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(route==='health'&&request.method==='GET')return json(200,{ready:Boolean(key&&(accessToken.length>=24||signingSecret.length>=32)),model,mode:key?'openai':'not_configured'},cors);
  if(route==='register'&&request.method==='POST'){
   if(signingSecret.length<32)return json(503,{error:'registration_unavailable'},cors);
   if(!counted(registrations,client,REGISTRATIONS_PER_HOUR,3600000))return json(429,{error:'rate_limit'},cors);
   return json(200,{token:await issueInstallKey(signingSecret)},cors);
  }
  if(route!=='assistant'||request.method!=='POST')return json(404,{error:'not_found'},cors);
  return assist(request,client,cors);
 };
}
