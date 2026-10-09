import {isCategory,skeleton} from './category-match.ts';
import {districtNames,type Place} from './core.ts';

/**
 * The business-owner side (/business): finding one's own listing, the correction a claim carries and the partner request. Shared
 * by the page and by the API routes (src/server/portal.ts), so both check the same rules. Nothing here touches the store.
 */
export const CLAIM_KINDS=['claim','partner'] as const;
export type ClaimKind=(typeof CLAIM_KINDS)[number];
export const CLAIM_STATUSES=['pending','approved','rejected','called'] as const;
export type ClaimStatus=(typeof CLAIM_STATUSES)[number];
/** What the founder sees on /admin for each state. */
export const STATUS_LABELS:Record<ClaimStatus,string>={pending:'Хүлээгдэж байна',approved:'Зөвшөөрсөн',rejected:'Татгалзсан',called:'Залгасан'};

/** Mongolian numbers are 8 digits, as the catalog's importer also requires (scripts/import-directory.py). */
export const MONGOLIAN_PHONE=/^[5-9]\d{7}$/;
export const LIMITS={businessName:120,hours:160,addressNote:240,ownerName:80,note:400,phones:3,areas:9} as const;
/** The partner offer: 49,000₮ for three months paid upfront, a free month after a month with no calls, three partners at most per category per district. */
export const PARTNER={price:49000,months:3,perCategoryPerDistrict:3} as const;

/** One correction or partner request, as the page sends it. `placeId` is null only when the business is not in the catalog yet. */
export type ClaimDraft={
 kind:ClaimKind;
 placeId:string|null;
 businessName:string;
 /** A registry category id, for a business that is not in the catalog yet. */
 category:string|null;
 phones:string[];
 hours:string;
 addressNote:string;
 /** The districts a business that comes to the customer serves, for `serviceAreas` on the place. */
 serviceAreas:string[];
 ownerName:string;
 contactPhone:string;
 /** "Би энэ газрын эзэн/менежер": a correction is not taken without it. */
 isOwner:boolean;
 note:string;
};
export type Claim=ClaimDraft&{id:string;status:ClaimStatus;createdAt:string};

export type ClaimError='invalid_body'|'invalid_kind'|'unknown_place'|'missing_business'|'invalid_category'|'invalid_phone'|'too_many_phones'|'invalid_district'|'missing_contact'|'not_owner'|'too_long';
/** What the page says when a check fails, whether its own or the server's answer. */
export const CLAIM_ERRORS:Record<ClaimError,string>={
 invalid_body:'Хүсэлтийг уншиж чадсангүй. Дахин оролдоно уу.',
 invalid_kind:'Хүсэлтийг уншиж чадсангүй. Дахин оролдоно уу.',
 unknown_place:'Газраа дахин сонгоно уу.',
 missing_business:'Газрын нэрээ бичнэ үү.',
 invalid_category:'Үйлчилгээний төрлөө сонгоно уу.',
 invalid_phone:'Утасны дугаар 8 оронтой байх ёстой.',
 too_many_phones:`Утасны дугаар ${LIMITS.phones} хүртэл байж болно.`,
 invalid_district:'Дүүргийг дахин сонгоно уу.',
 missing_contact:'Холбоо барих нэр, утсаа бичнэ үү.',
 not_owner:'Эзэн эсвэл менежер гэдгээ тэмдэглэнэ үү.',
 too_long:'Бичсэн текст хэт урт байна.',
};
export const isClaimKind=(value:unknown):value is ClaimKind=>typeof value==='string'&&(CLAIM_KINDS as readonly string[]).includes(value);
export const isClaimStatus=(value:unknown):value is ClaimStatus=>typeof value==='string'&&(CLAIM_STATUSES as readonly string[]).includes(value);

/** Digits only, without the country code: "+976 9905-1234" and "99051234" are the same number. */
export const phoneDigits=(value:string)=>value.replace(/\D/g,'').replace(/^976(?=\d{8}$)/,'');

/**
 * The claim behind a POST body, or the first thing wrong with it. One text field at a time: a field over its length is refused
 * rather than cut, so nothing the owner typed is silently lost. `knownPlace` is the catalog on the server, the loaded places on
 * the page.
 */
export function readClaim(body:unknown,knownPlace:(placeId:string)=>boolean):{claim:ClaimDraft}|{error:ClaimError}{
 if(!body||typeof body!=='object')return {error:'invalid_body'};
 const v=body as Record<string,unknown>;
 if(!isClaimKind(v.kind))return {error:'invalid_kind'};
 const text=(value:unknown,max:number):string|null=>{
  if(value==null||value==='')return '';
  if(typeof value!=='string')return null;
  const trimmed=value.trim().replace(/\s+/g,' ');
  return trimmed.length<=max?trimmed:null;
 };
 const businessName=text(v.businessName,LIMITS.businessName),hours=text(v.hours,LIMITS.hours),addressNote=text(v.addressNote,LIMITS.addressNote);
 const ownerName=text(v.ownerName,LIMITS.ownerName),note=text(v.note,LIMITS.note);
 if([businessName,hours,addressNote,ownerName,note].includes(null))return {error:'too_long'};
 const placeId=typeof v.placeId==='string'&&v.placeId?v.placeId:null;
 if(placeId&&!knownPlace(placeId))return {error:'unknown_place'};
 // A partner request is always about a listed business; a correction may be the "add my business" path instead.
 if(!placeId&&v.kind==='partner')return {error:'unknown_place'};
 if(!placeId&&!businessName)return {error:'missing_business'};
 const category=typeof v.category==='string'&&v.category?v.category:null;
 if(category&&!isCategory(category))return {error:'invalid_category'};
 if(!placeId&&!category)return {error:'invalid_category'};
 const supplied=Array.isArray(v.phones)?v.phones:[];
 if(supplied.length>LIMITS.phones)return {error:'too_many_phones'};
 const phones=[...new Set(supplied.map(p=>typeof p==='string'?phoneDigits(p):'').filter(Boolean))];
 if(phones.some(p=>!MONGOLIAN_PHONE.test(p)))return {error:'invalid_phone'};
 const serviceAreas=Array.isArray(v.serviceAreas)?[...new Set(v.serviceAreas.filter((a):a is string=>typeof a==='string'))]:[];
 if(serviceAreas.length>LIMITS.areas||serviceAreas.some(a=>!districtNames.includes(a)))return {error:'invalid_district'};
 const contactPhone=typeof v.contactPhone==='string'?phoneDigits(v.contactPhone):'';
 if(!ownerName)return {error:'missing_contact'};
 if(!MONGOLIAN_PHONE.test(contactPhone))return {error:'invalid_phone'};
 const isOwner=v.isOwner===true;
 if(v.kind==='claim'&&!isOwner)return {error:'not_owner'};
 return {claim:{kind:v.kind,placeId,businessName:businessName as string,category,phones,hours:hours as string,addressNote:addressNote as string,serviceAreas,ownerName:ownerName as string,contactPhone,isOwner,note:note as string}};
}

/**
 * The owner's search for their own listing: by phone once four digits are typed, otherwise by name with the same skeleton the
 * chat matches categories with, so "dugui zasvar" finds "Дугуй засвар". Every word must start a word in the name; a name that
 * starts with the first word comes first.
 */
export function searchBusinesses(places:Place[],query:string,limit=8):Place[]{
 const digits=phoneDigits(query);
 if(digits.length>=4)return places.filter(p=>p.phones.some(n=>n.includes(digits))).slice(0,limit);
 const words=skeleton(query).split(' ').filter(Boolean);
 if(!words.length||words.join('').length<2)return [];
 const found:{place:Place;rank:number}[]=[];
 for(const place of places){
  const name=' '+skeleton(place.name)+' ';
  if(!words.every(word=>name.includes(' '+word)))continue;
  found.push({place,rank:name.startsWith(' '+words[0])?0:1});
 }
 return found.sort((a,b)=>a.rank-b.rank||a.place.name.localeCompare(b.place.name,'mn')).slice(0,limit).map(f=>f.place);
}
