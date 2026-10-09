import type {EventKind} from './counters.ts';
import {HOSTED_API_URL} from './hosted.ts';
import {registerInstall,type InstallKeyStore} from './install.ts';

/**
 * The anonymous counters (POST /api/events): how often each business was shown and called, so Nomi can tell the business. Fire
 * and forget — nothing waits for it, nothing is retried and a failure is dropped without a word, so a count never slows a card
 * down or shows an error. What is stored is the business, the month and the kind; never the message, the position or the install
 * id (src/utils/counters.ts).
 */
export type EventSender=(placeId:string,kind:EventKind)=>void;

export function eventSender(opts:{keys:InstallKeyStore;apiUrl?:string;fetchImpl?:typeof fetch}):EventSender{
 const apiUrl=(opts.apiUrl??HOSTED_API_URL).replace(/\/$/,''),fetchImpl=opts.fetchImpl??fetch,keys=opts.keys;
 let pending:Promise<string>|null=null;
 const fresh=()=>(pending??=registerInstall(apiUrl,fetchImpl).then(async key=>{await keys.set(key).catch(()=>undefined);return key;}).finally(()=>(pending=null)));
 // The install key this phone already has (install.ts), else one new key, fetched once however many counts are waiting for it.
 const key=async()=>(await keys.get().catch(()=>null))||fresh();
 async function post(placeId:string,kind:EventKind){
  const response=await fetchImpl(apiUrl+'/events',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+(await key())},body:JSON.stringify({placeId,kind}),signal:AbortSignal.timeout(6000)});
  // A key the server no longer accepts is dropped, so the next count asks for a new one. This one is not sent again.
  if(response.status===401)await keys.clear().catch(()=>undefined);
 }
 return (placeId,kind)=>{void post(placeId,kind).catch(()=>undefined);};
}

let send:EventSender|null=null;
/**
 * Installed by the app once the terms have been accepted, and `null` before that and after "delete my data": nothing is counted
 * until the first screen's Privacy Policy, which says these counts exist, has been accepted.
 */
export function configureEvents(opts:{keys:InstallKeyStore;apiUrl?:string;fetchImpl?:typeof fetch}|null){send=opts?eventSender(opts):null;}
/** One count, from the place card. Returns at once and never throws. */
export function recordPlaceEvent(placeId:string,kind:EventKind){send?.(placeId,kind);}
