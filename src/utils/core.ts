import {dayInUB} from './personal.ts';
import {CATEGORIES,categoryName,isCategory,matchCategories} from './category-match.ts';
/** A category id from the registry (data/categories.ts), e.g. 'pharmacy', 'tire', 'tailor'. */
export type Category = string;
export type Intent = { category: Category | null; district: string | null; query: string; nearby: boolean; openNow: boolean; action: 'search' | 'clarify' | 'unsupported'; clarification: string | null };
/** checkStatus is the field-tool outcome written by scripts/import-directory.py (Шалгаагүй, Баталгаажсан, Утсаа аваагүй, Дахин лавлах); Хаагдсан and Буруу дугаар records never reach the catalog. verifiedAt is set only for Баталгаажсан. */
export type Place = {id:string; name:string; category:Category; address:string; district:string|null; phones:string[]; latitude:number|null; longitude:number|null; mapUrl:string|null; sources:string[]; hoursClaim:string; qualityFlags:string[]; retrievedAt:string; verifiedAt:string|null; checkStatus:string; relatedListings?:Place[]; alsoCategories?:Category[]; serviceAreas?:string[]};
export type Visit = {placeId:string; status:'visited'|'closed'|'wrong'|'call'; note:string; checkedAt:string};
/** Category id → its Mongolian name, for every category in the registry. */
export const categories:Record<Category,string> = Object.fromEntries([...CATEGORIES.values()].map(c=>[c.id,c.mn]));
export const districtNames = ['БГД','БЗД','ХУД','СХД','СБД','ЧД','Налайх','Багануур','Багахангай'];
const districtRules:[string,RegExp][]=[['БГД',/бгд|баянгол|bayangol|\bbgd\b/i],['БЗД',/бзд|баянзүрх|bayanz[uü]rkh|\bbzd\b/i],['ХУД',/\bkhud\b|\bhud\b|хан[ -]?уул|khan[ -]?uul|(?<![а-яөүё])худ(?![а-яөүё])/i],['СХД',/схд|сонгино[ -]?хайрхан|songino|\bshd\b|\bskhd\b/i],['СБД',/сбд|сүхбаатар|sukhbaatar|\bsbd\b/i],['ЧД',/чингэлтэй|chingeltei|\bchd\b|(?<![а-яөүё])чд(?![а-яөүё])/i],['Налайх',/налайх|nalaikh/i],['Багануур',/багануур|baganuur/i],['Багахангай',/багахангай|bagakhangai/i]];
export function normalize(s:string){return s.normalize('NFKC').toLowerCase().replace(/(\p{L})\1{2,}/gu,'$1$1').replace(/[^\p{L}\p{N} +.-]/gu,' ').replace(/\s+/g,' ').trim();}
export const UNSUPPORTED_LINE='Nomi Улаанбаатарын үйлчилгээний газрыг хайж, утас, байршлыг нь харуулна. Захиалга, төлбөр хийх холболт хараахан байхгүй.';
export const WHAT_LINE='Юу хайж байна вэ? Жишээ нь: эмийн сан, дугуй засвар, шүдний эмнэлэг, хувцас засвар.';
export function interpretLocal(message:string, previous?:Intent):Intent {
 const t=normalize(message); let relevant=t;
 // A correction may discard the first category, but never perform an external action.
 const parts=t.split(/\s+(?:биш|bish|not)\s*/);if(parts.length>1)relevant=parts.slice(1).join(' ');
 const cats=matchCategories(relevant);
 let districts=districtRules.filter(([,rx])=>rx.test(relevant)).map(([d])=>d);
 if(!districts.length&&parts.length>1)districts=districtRules.filter(([,rx])=>rx.test(parts[0])).map(([d])=>d);
 // Actions Nomi cannot take: ordering, booking, buying tickets, moving money, deleting or cancelling. Finding the place is fine.
 const unsupported=/тасалбар ав|ticket|шилжүүл|transfer|order|захиал|zahial|booking|устга|delete|cancel|цуцал/.test(t);
 const negatedOnly=parts.length>1&&!cats.length&&!districts.length;
 const category=cats.length===1?cats[0]:cats.length===0&&!unsupported&&!negatedOnly?(previous?.category??null):null;
 const district=districts.length===1?districts[0]:districts.length===0?(previous?.district??null):null;
 const nearby=/ойр.*(?:албагүй|шаардлагагүй)|not near|oir.*hereggui/.test(t)?false:/ойр|oir|near|хажуу|hajuu/.test(t)||(previous?.nearby??false);
 const openNow=/нээлттэй.*(?:албагүй|шаардлагагүй)|open.*not required/.test(t)?false:/нээлттэй|neelttei|одоо|odoo|24\s*цаг|24\s*tsag|open/.test(t)||(previous?.openNow??false);
 let clarification:string|null=null;
 if(unsupported)clarification=UNSUPPORTED_LINE;
 else if(cats.length>1)clarification='Эхлээд аль үйлчилгээг хайх вэ: '+cats.slice(0,4).map(c=>categoryName(c).toLowerCase()).join(', ')+'?';
 else if(districts.length>1)clarification='Аль дүүргээс эхэлж хайх вэ?';
 else if(/^(дугуй|dugui)$/.test(t)&&!previous?.category)clarification='Автомашины дугуй засвар хайж байна уу, унадаг дугуй юу?';
 else if(!category)clarification=WHAT_LINE;
 return {category,district,query:t,nearby,openNow,action:unsupported?'unsupported':clarification?'clarify':'search',clarification};
}
export function distanceKm(a:{latitude:number;longitude:number},b:{latitude:number;longitude:number}){const rad=(n:number)=>n*Math.PI/180;const dlat=rad(b.latitude-a.latitude),dlon=rad(b.longitude-a.longitude);const x=Math.sin(dlat/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dlon/2)**2;return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
/** A place belongs to its own category and to the others it also offers (a garage that also changes oil). */
export const inCategory=(p:Pick<Place,'category'|'alsoCategories'>,c:Category)=>p.category===c||!!p.alsoCategories?.includes(c);
/** `online_service` in src/utils/location.ts: a business nobody travels to, by the owner's own answer. */
const ONLINE='online_service';
/** Lower is more useful on a card: checked by phone, then has a number to call, then has a map pin — which a business nobody travels to is not asked for. Ties keep name order. */
const usefulness=(p:Place)=>(p.verifiedAt?0:4)+(p.phones.length?0:2)+(p.latitude!=null||p.qualityFlags?.includes(ONLINE)?0:1);
/** Places of a category in a district (a business that comes to the customer and names no district of its own serves every one, and one nobody travels to serves all of them), nearest first with a position, else the most useful first. */
export function findPlaces(all:Place[],opts:{category?:Category|null;district?:string|null;query?:string;location?:{latitude:number;longitude:number}|null;saved?:string[]}){
 const q=normalize(opts.query??''),digits=/^[+\d .-]+$/.test(q)?q.replace(/\D/g,'').replace(/^976(?=\d{8}$)/,''):'';
 return all.filter(p=>(!opts.category||inCategory(p,opts.category))&&(!opts.district||p.district===opts.district||!!p.qualityFlags?.includes(ONLINE)||!p.district&&!!p.qualityFlags?.includes('mobile_service'))&&(!opts.saved||opts.saved.includes(p.id))&&(!q||normalize([p.name,p.address,...p.phones].join(' ')).includes(q)||!!digits&&p.phones.some(n=>n.includes(digits)))).map(p=>({...p,distance:opts.location&&p.latitude!=null&&p.longitude!=null?distanceKm(opts.location,{latitude:p.latitude,longitude:p.longitude}):null})).sort((a,b)=>opts.location?(a.distance??Infinity)-(b.distance??Infinity)||usefulness(a)-usefulness(b):usefulness(a)-usefulness(b)||a.name.localeCompare(b.name,'mn'));
}
/** Whether a business that comes to the customer serves a district: the districts it named, else its own; one that names neither may come anywhere, and one nobody travels to serves every district. */
export const servesDistrict=(p:Pick<Place,'district'|'serviceAreas'>&{qualityFlags?:string[]},district:string)=>p.qualityFlags?.includes(ONLINE)?true:p.serviceAreas?.length?p.serviceAreas.includes(district):!p.district||p.district===district;
/** Businesses that come to the customer, for a district (or the whole city): those that serve it first, then the most useful; the rest of the city after them, since many go further than they say. Their own address does not matter, so there is no distance. */
export function findOnCall(all:Place[],opts:{category:Category;district?:string|null}){
 return all.filter(p=>inCategory(p,opts.category)).map(p=>({...p,distance:null as number|null,serves:!opts.district||servesDistrict(p,opts.district)})).sort((a,b)=>Number(b.serves)-Number(a.serves)||usefulness(a)-usefulness(b)||a.name.localeCompare(b.name,'mn'));
}
/** The latest closing time an hours claim states, in minutes after midnight: past 1440 for a range that runs over midnight, 2880 for "24 цаг" (open the whole night, so it ranks before "until 00:00"), null when no time is written. A claim, not a check. */
export function closingMinutes(hours:string):number|null{if(/24\s*(?:цаг|tsag|\/\s*7|hours?)|бүтэн\s*хоног/i.test(hours))return 2880;let latest:number|null=null;for(const m of hours.matchAll(/(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})/g)){const start=+m[1]*60+ +m[2];let end=+m[3]*60+ +m[4];if(end<=start)end+=1440;if(end-start>=1440)end=2880;if(latest===null||end>latest)latest=end;}return latest;}
/** Open at night by its own claim: past midnight or around the clock. "Until 00:00" is not night. */
export const openAtNight=(hours:string)=>(closingMinutes(hours)??0)>1440;
/** A request for a place open at night or around the clock: шөнө, 24 цаг, оройн, night (Cyrillic and Latin). */
export const wantsNight=(text:string)=>/шөнө|шөнийн|shon[oi]|shunu|24\s*(?:цаг|tsag|\/\s*7|hours?)|оройн|oroin|орой\s*(?:болтол|хүртэл|ажилл)|\bnight\b|\blate\b/i.test(text);
export function safeUrl(url:string){try{const u=new URL(url);return ['https:','http:'].includes(u.protocol);}catch{return false;}}
export function validServerUrl(url:string){try{const u=new URL(url);if(u.username||u.password||u.search||u.hash)return false;const parts=u.hostname.split('.');const nums=parts.map(Number);const ip=parts.length===4&&parts.every(p=>/^\d+$/.test(p))&&nums.every(n=>n>=0&&n<=255);const local=u.hostname==='localhost'||ip&&(nums[0]===127||nums[0]===10||nums[0]===192&&nums[1]===168||nums[0]===172&&nums[1]>=16&&nums[1]<=31);return u.protocol==='https:'||u.protocol==='http:'&&local;}catch{return false;}}
export function mapsLink(place:Place){if(place.mapUrl&&safeUrl(place.mapUrl))return place.mapUrl;if(place.latitude!=null&&place.longitude!=null)return `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`;return null;}
/** "Facebook", "Google Maps" or the bare hostname of a source URL; text that is not a URL is shown as it is. */
export function sourceLabel(url:string){let host:string;try{host=new URL(url).hostname.toLowerCase();}catch{return url.trim();}if(/(^|\.)(facebook|fb)\.com$/.test(host))return 'Facebook';if(/(^|\.)google\.[a-z.]+$/.test(host)&&/maps/i.test(url)||host==='maps.app.goo.gl')return 'Google Maps';return host.replace(/^www\./,'');}
/** "Баталгаажсан · 2026-09-18" (the check date in Ulaanbaatar time) or "Шалгаагүй". Never anything in between. */
export function verificationLabel(place:Pick<Place,'verifiedAt'>){const v=place.verifiedAt;if(!v)return 'Шалгаагүй';const t=Date.parse(v);return 'Баталгаажсан · '+(Number.isFinite(t)?dayInUB(new Date(t)):v.slice(0,10));}
export function landmarkQuery(text:string){const t=normalize(text);return [['зайсан',/зайсан|zaisan/],['яармаг',/яармаг|yaarmag/],['нисэх',/нисэх|niseh/],['баянхошуу',/баянхошуу|bayanhoshuu/],['дарь эх',/дарь\s*эх|dari\s*ekh/],['орбит',/орбит|orbit/]].find(([,rx])=>(rx as RegExp).test(t))?.[0] as string|undefined;}
export function validateIntent(value:unknown):Intent {
 if(!value||typeof value!=='object')throw Error('invalid_intent');const v=value as Record<string,unknown>;
 if(!(v.category===null||isCategory(v.category))||!(v.district===null||districtNames.includes(v.district as string))||!['search','clarify','unsupported'].includes(v.action as string)||typeof v.nearby!=='boolean'||typeof v.openNow!=='boolean'||typeof v.query!=='string'||!(v.clarification===null||typeof v.clarification==='string'))throw Error('invalid_intent');
 if(v.action==='search'&&!v.category)throw Error('missing_category');
 return {category:v.category as Category|null,district:v.district as string|null,action:v.action as Intent['action'],nearby:v.nearby,openNow:v.openNow,query:v.query.slice(0,1000),clarification:typeof v.clarification==='string'?v.clarification.slice(0,600):null};
}
