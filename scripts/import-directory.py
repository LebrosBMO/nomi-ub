"""Builds src/data/directory.json from ../Nomi_All_Prepared_Files plus the exported check summary (PRD Section 5).

  python scripts/import-directory.py [--summary data/check-summary.json] [--out src/data/directory.json]

Verification rules: checkStatus is the field-tool status or "Шалгаагүй"; verifiedAt is the summary's checkedAt
only for Баталгаажсан; Хаагдсан and Буруу дугаар records are left out; the other statuses stay listed as
unverified. A verified coordinateStatus with a location overwrites latitude/longitude/mapUrl and adds the flag
coordinates_field_verified. Flags that the check has made false (not_contact_verified, missing_coordinates,
map_pin_not_field_verified) are removed at the same time. Tire listings sharing a phone are grouped and the
field tool checks the group by its top-level id, so the group's entry applies to its related listings too; an
entry keyed by a related listing's id counts only when the group has none. The output is deterministic (AC 5.4).
"""
import argparse,json,re,sys,unicodedata
from datetime import datetime
from pathlib import Path
for stream in (sys.stdout,sys.stderr):stream.reconfigure(encoding='utf-8')
root=Path(__file__).resolve().parents[1]
source=root.parent/'Nomi_All_Prepared_Files'
cli=argparse.ArgumentParser(description=__doc__.splitlines()[0])
cli.add_argument('--summary',type=Path,default=root/'data/check-summary.json',help='check-summary.json version 2 from scripts/export-checks.mjs')
cli.add_argument('--out',type=Path,default=root/'src/data/directory.json')
args=cli.parse_args()
read=lambda x:json.loads((source/x).read_text(encoding='utf-8'))
districts={'БГД':['баянгол','bayangol','bgd'],'БЗД':['баянзүрх','bayanzurkh','bzd'],'ХУД':['хан-уул','хан уул','khan-uul','hud'],'СХД':['сонгинохайрхан','сонгино хайрхан','songino','shd'],'ЧД':['чингэлтэй','chingeltei','chd'],'СБД':['сүхбаатар','sukhbaatar','sbd'],'Налайх':['налайх','nalaikh'],'Багануур':['багануур','baganuur'],'Багахангай':['багахангай']}
def district(text):
 text=(text or '').lower()
 return next((k for k,aliases in districts.items() if re.search(r'(?<!\w)'+k.lower()+r'(?!\w)',text) or any(a in text for a in aliases)),None)
def phones(values):
 result=[]
 for value in values:
  p=re.sub(r'\D','',value)
  if len(p)==11 and p.startswith('976'):p=p[3:]
  if re.fullmatch('[5-9][0-9]{7}',p) and p not in result:result.append(p)
 return result
# Google listing text left in an address ("Local Business · 2 reviews · $ · 0.4 mi · … · Open now", "Closes 10 PM", "7:30 PM", a
# phone, an English category such as "Tire repair shop", a bare plus code) is dropped piece by piece; what is left is the
# address. A plus code in front of a real address goes too.
NOISE=re.compile(r'(local business|open now|open 24 hours|open|closed|temporarily closed|permanently closed|(opens|closes) .+|no reviews|\d+ reviews?|\$+|[\d.]+ ?(mi|km)|[\d.]+\(\d+\)|[+\d][\d\s-]{6,}|\d{1,2}(:\d{2})?\s?[AP]M|mechanic|(tire|tyre|auto|car|wheel|truck)[\w\s-]*(shop|service|store|station|centre|center|dealer)|[23456789CFGHJMPQRVWX]{4}\+[23456789CFGHJMPQRVWX]{2,3})',re.I)
def clean_address(text):
 parts=[]
 for part in (text or '').split(' · '):
  part=re.sub(r'^[23456789CFGHJMPQRVWX]{4}\+[23456789CFGHJMPQRVWX]{2,3}(\s*,\s*|\s+)(?=\S)','',part.strip())
  if part and not NOISE.fullmatch(part) and part.lower() not in [x.lower() for x in parts]:parts.append(part)
 return ' · '.join(parts)
# A tire shop's "hours" are often its whole Facebook bio (emojis, hashtags, phones, "1K followers", greetings). Only the hours are
# kept: "24 цаг" when it says around the clock ("Always open", "24/7", "24 цагаар"), otherwise the time ranges it states
# ("Да-Ба 09:00-18:00", "өдөр бүр өглөө 10-аас 20 цаг хүртэл"); with neither, the card says to ask.
EMOJI=re.compile('[\U0001F000-\U0001FAFF☀-➿⬀-⯿️‍⏩-⏺�]')
RANGE=re.compile(r'((?:даваа|мягмар|лхагва|пүрэв|баасан|бямба|ням|да|ня|ба|бя|өдөр бүр)[^\d·|]{0,12})?\d{1,2}[:.]\d{2}\s*[-–—]\s*\d{1,2}[:.]\d{2}',re.I)
SPOKEN=re.compile(r'(өдөр бүр\s*)?(өглөө\s*)?\d{1,2}(:\d{2})?\s*-?\s*(аас|ээс|оос|өөс)\s*(орой\s*)?\d{1,2}(:\d{2})?\s*цаг\s*хүртэл',re.I)
def clean_hours(text,name):
 text=re.sub(r'\s+',' ',EMOJI.sub(' ',text or ''))
 if re.search(r'always open|open 24 hours|24\s*/\s*7|24\s*цаг',text+' '+(name or ''),re.I):return '24 цаг'
 found=[m.group(0).strip(' ,.;:-') for m in RANGE.finditer(text)]+[m.group(0).strip() for m in SPOKEN.finditer(text)]
 return '; '.join(dict.fromkeys(found))
# A shop that comes to the customer ("Дуудлагын", "хот дотор очно"): its distance does not matter, and the card says so.
MOBILE=re.compile(r'дуудлаг|очно|ирж\s*засна|mobile',re.I)
records=[]
def add(id,name,category,address,nums,lat=None,lon=None,maps=None,sources=None,hours=None,flags=None,dist=None):
 address=clean_address(address)
 if category=='tire':
  flags=list(flags or [])
  if MOBILE.search(' '.join(filter(None,(name,hours,address)))):flags.append('mobile_service')
  hours=clean_hours(hours,name)
 records.append(dict(id=id,name=name,category=category,address=address or 'Нарийвчилсан хаяг дутуу',district=dist or district(address),phones=phones(nums),latitude=lat,longitude=lon,mapUrl=maps,sources=sources or [],hoursClaim=hours or 'Ажиллах цагийг лавлана уу',qualityFlags=flags or [],verifiedAt=None,checkStatus='Шалгаагүй',retrievedAt='2026-09-17'))
for r in read('03_Pharmacy/Nomi_Pharmacy_Data.json')['branches']:
 add(r['external_id'],r['name'],'pharmacy',r['address'],r.get('phones_e164') or [],r.get('latitude'),r.get('longitude'),r.get('maps_url'),[r['source_url']],r.get('hours_summary'),r.get('quality_flags'),district(r.get('district')))
for r in read('04_Materials/Nomi_Standalone_Materials.json')['records']:
 add('material:'+r['id'],r['name'],'materials',r['address'],r['phones'],sources=[r['source_url']],hours=r.get('hours_claim'),flags=['unverified_source'])
tires=read('05_Tire_Repair/Nomi_Tire_Repair_Data.json')['records']
maps=read('05_Tire_Repair/Nomi_Tire_Repair_Google.json')['records']
used=set()
for r in tires:
 matches=[g for g in maps if r['id'] in g['facebook_candidate_ids'] and g['match_method']=='phone_overlap' and not any('conflict' in f for f in g['quality_flags'])]
 g=matches[0] if len(matches)==1 else None
 if g:used.add(g['id'])
 lines=[x for x in r['location_evidence'] if 'followers' not in x and "'s Reels" not in x]
 addr=' · '.join(lines)
 if g and g.get('detail_text'):
  detail=[x.strip() for x in g['detail_text'].splitlines() if 'Ulaanbaatar' in x]
  if detail:addr=detail[0]
 flags=list(r['quality_flags'])
 if any('conflict' in f for c in r.get('google_maps_candidates',[]) for f in c['quality_flags']):flags.append('location_conflict_review')
 add(r['id'],r['name'],'tire',addr,r['phones'],g['latitude'] if g else None,g['longitude'] if g else None,g['google_maps_url'] if g else None,[r['facebook_url']]+([g['google_maps_url']] if g else []),' · '.join(r['hours_claims']),flags,r['districts'][0] if len(r['districts'])==1 else None)
for g in maps:
 if g['id'] in used or any('conflict' in f or 'review' in f for f in g['quality_flags']):continue
 text=g.get('detail_text') or g['listing_text']
 lines=[x.strip() for x in text.splitlines() if x.strip() and x.strip()!=g['name'] and x.strip() not in ['Directions','Website','No reviews'] and not re.fullmatch(r'[\d.]+\(\d+\)',x.strip()) and not re.fullmatch(r'[-]+',x.strip())]
 add(g['id'],g['name'],'tire',' · '.join(lines),g['phones'],g['latitude'],g['longitude'],g['google_maps_url'],[g['google_maps_url']],flags=g['quality_flags'])
# OpenStreetMap (06_OpenStreetMap, ODbL 1.0, © OpenStreetMap contributors; fetched by its fetch.mjs). A pharmacy with a name and a
# phone that Nomi does not list is added unchecked, with its map position. A pharmacy matched one to one by phone lends the position
# Nomi was missing. A number several branches share (a chain's hotline) is never used to match, and a pharmacy whose number Nomi
# already lists is never added again. Districts come from the OSM district borders by position; any record with a position and no
# district gets its district the same way.
osm_dir=source/'06_OpenStreetMap'
def inside(lat,lon,segments):
 # Even-odd crossings over every border way: the ways need not be joined into rings first.
 hit=False
 for seg in segments:
  for (y1,x1),(y2,x2) in zip(seg,seg[1:]):
   if (y1>lat)!=(y2>lat) and lon<x1+(lat-y1)*(x2-x1)/(y2-y1):hit=not hit
 return hit
if (osm_dir/'ub-pharmacies.json').is_file():
 osm=json.loads((osm_dir/'ub-pharmacies.json').read_text(encoding='utf-8'))
 borders=json.loads((osm_dir/'ub-districts.json').read_text(encoding='utf-8'))['districts']
 osm_district=lambda lat,lon:next((d['district'] for d in borders if inside(lat,lon,d['segments'])),None)
 osm_phones=lambda t:phones([p for k in ('phone','contact:phone','mobile','contact:mobile') for p in re.split(r'[;,/]',t.get(k) or '')])
 days={'Mo':'Да','Tu':'Мя','We':'Лх','Th':'Пү','Fr':'Ба','Sa':'Бя','Su':'Ня'}
 def osm_hours(h):
  if not h:return None
  if h.strip()=='24/7':return '24 цаг'
  return re.sub(r'\b(Mo|Tu|We|Th|Fr|Sa|Su)\b',lambda m:days[m.group(1)],h).replace('off','амарна')
 owners={};osm_owners={}
 for r in records:
  if r['category']=='pharmacy':
   for p in r['phones']:owners.setdefault(p,[]).append(r)
 for i in osm['items']:
  for p in osm_phones(i['tags']):osm_owners.setdefault(p,[]).append(i)
 near=lambda a,b:abs(a[0]-b[0])<0.001 and abs(a[1]-b[1])<0.0015
 filled=added=0;taken=[]
 for i in osm['items']:
  t=i['tags'];nums=osm_phones(t);name=t.get('name:mn') or t.get('name')
  if not nums or not name:continue
  # Veterinary pharmacies ("Малын эмийн сан") share the tag; Nomi finds pharmacies for people. So do supplement shops (4Life and
  # the like) and clinics whose name has no pharmacy in it ("Хүслэн эмнэлэг").
  label=' '.join(filter(None,(name,t.get('name'),t.get('description'))))
  if re.search(r'(?<!\w)малын(?!\w)|ветеринар|veterinar|4\s?life|трансфер фактор|transfer factor|herbalife|хербалайф|amway|амвэй|atomy|атоми|nu ?skin|oriflame|орифлэйм',label,re.I):continue
  if re.search(r'эмнэлэг|clinic|клиник|hospital',label,re.I) and not re.search(r'эмийн сан|фарм|farm|pharm|аптек|apte',label,re.I):continue
  url='https://www.openstreetmap.org/'+i['osm']
  shared=[p for p in nums if p in owners]
  if shared:
   known={x['id']:x for p in shared for x in owners[p]}
   r=next(iter(known.values()))
   if len(known)==1 and all(len(owners[p])==1 and len(osm_owners[p])==1 for p in shared) and r['latitude'] is None:
    r['latitude']=i['lat'];r['longitude']=i['lon'];r['mapUrl']=f"https://www.google.com/maps/search/?api=1&query={i['lat']},{i['lon']}"
    r['sources']=list(dict.fromkeys(r['sources']+[url]))
    r['qualityFlags']=[f for f in r['qualityFlags'] if f!='missing_coordinates']+['coordinates_from_openstreetmap']
    filled+=1
   continue
  # The same pharmacy drawn twice in OSM (a point and a building) shares a number and sits within about 100 m.
  if any(set(nums)&set(n) and near((i['lat'],i['lon']),pos) for n,pos in taken):continue
  taken.append((nums,(i['lat'],i['lon'])))
  addr=t.get('addr:full') or ', '.join(x for x in (t.get('addr:street'),t.get('addr:housenumber')) if x)
  add('osm-'+i['osm'].replace('/','-'),name,'pharmacy',addr,nums,i['lat'],i['lon'],f"https://www.google.com/maps/search/?api=1&query={i['lat']},{i['lon']}",[url],osm_hours(t.get('opening_hours')),['source_openstreetmap','not_contact_verified'],osm_district(i['lat'],i['lon']) or district(addr))
  records[-1]['retrievedAt']=osm['retrievedAt']
  added+=1

 # Every other named place in ub-pois.json (fetch-pois.mjs) that the category registry claims: by a map tag the registry lists
 # ("craft=tailor"), or, for loosely tagged places (shop=yes, office=company, no type at all), by a category word in its name.
 # Registry: scripts/categories.export.json (node scripts/export-categories.mjs). Pharmacies were imported above. A place whose
 # number Nomi already lists is the same business and is skipped. Places without a phone are kept, with their map pin, and
 # flagged no_phone for the call list.
 pois_file=osm_dir/'ub-pois.json';reg_file=root/'scripts'/'categories.export.json'
 if pois_file.is_file() and reg_file.is_file():
  pois=json.loads(pois_file.read_text(encoding='utf-8'))
  reg=json.loads(reg_file.read_text(encoding='utf-8'))['categories']
  by_tag={}
  for c in reg:
   for sel in c.get('osm') or []:by_tag.setdefault(sel,c['id'])
  name_keys=sorted(((k,c['id']) for c in reg for k in c['keys']),key=lambda x:-len(x[0]))
  CYR=dict(zip('абвгдеёжзийклмноөпрстуүфхцчшщъыьэюя',['a','b','v','g','d','e','yo','j','z','i','i','k','l','m','n','o','o','p','r','s','t','u','u','f','h','ts','ch','sh','sh','i','i','i','e','yu','ya']))
  def skel(text):
   # The same skeleton as src/utils/category-match.ts, so the exported keys match.
   s=''.join(CYR.get(ch,ch) for ch in unicodedata.normalize('NFKC',text).lower())
   s=re.sub('[öó]','o',s);s=re.sub('[üú]','u',s);s=s.replace('kh','h').replace('zh','j').replace('w','v')
   s=re.sub(r'c(?!h)','ts',s);s=re.sub(r'y(?![aeiouy])','i',s).replace('q','k')
   s=re.sub(r'[^a-z0-9 ]+',' ',s);s=re.sub(r'([a-z])\1+',r'\1',s)
   return re.sub(r'\s+',' ',s).strip()
  def by_name(text):
   s=' '+skel(text)+' '
   return next((cid for k,cid in name_keys if ' '+k in s),None)
  def by_name_long(text):
   s=' '+skel(text)+' '
   return next((cid for k,cid in name_keys if len(k)>=8 and ' '+k in s),None)
  MAIN=('shop','craft','amenity','office','healthcare','leisure','tourism','club','emergency','education','sport')
  GENERIC={'amenity=place_of_worship','shop=yes','office=company','office=yes','craft=yes','amenity=yes','shop=general','shop=trade','office=commercial','amenity=marketplace'}
  # Well-known brands the map tags wrongly (Mobicom branches as office=foundation or office=government, airlines as travel
  # agencies): the brand decides unless the tag already names one of its own services.
  BRANDS=[(r'мобиком|mobicom|юнител|unitel|скайтел|skytel|g-?mobile|жи мобайл','mobile_operator',{'mobile_operator','phone_shop','phone_repair','internet_provider'}),
          (r'^(miat|миат|eznis|изнис|hunnu air|хүннү эйр|aero mongolia|аэро монголиа)(\s|$)','airline_tickets',{'airline_tickets'})]
  # Map entries whose tag is wrong and that no category fits: a housing complex tagged office=lawyer, a sports body tagged NGO.
  WRONG={'node/4974703023','way/129013296'}
  key_set={k for k,_ in name_keys};near={}
  group_of={c['id']:c['group'] for c in reg}
  SHORT_NEVER={'bank','general_school','pub_bar','theatre','campground'}
  def metres(a,b,c,d):
   import math
   x=math.radians(d-b)*math.cos(math.radians((a+c)/2));y=math.radians(c-a)
   return 6371000*math.hypot(x,y)
  seen={r['id'] for r in records};known={p for r in records for p in r['phones']};per={}
  for i in pois['items']:
   t=i['tags'];name=t.get('name:mn') or t.get('name')
   rid='osm-'+i['osm'].replace('/','-')
   if not name or rid in seen or t.get('amenity')=='pharmacy' or t.get('healthcare')=='pharmacy':continue
   # A map note rather than a business name ("Mamba datsan bish": "not Mamba datsan").
   if re.search(r'(^|\s)(bish|биш)$',name.strip().lower()):continue
   # A tag can hold several values ("cuisine=italian;pizza"); each one counts.
   pairs=[f'{k}={v.strip()}' for k,val in t.items() for v in str(val).split(';') if v.strip()]
   main=[x for x in pairs if x.split('=',1)[0] in MAIN]
   cat=next((by_tag[x] for x in main+pairs if x in by_tag),None)
   if cat is None and (not main or any(x in GENERIC for x in main)):cat=by_name(' '.join(filter(None,(name,t.get('name'),t.get('description')))))
   # Buddhist monasteries (the map data here has no religion tag): where people go to have prayers read.
   if cat is None and t.get('amenity')=='place_of_worship' and re.search(r'хийд|дацан|гандан|gandan|datsan|temple|monastery',(name+' '+(t.get('name') or '')).lower()):cat='lama_prayer'
   if cat is None or i['osm'] in WRONG:continue
   low=name.lower()+' '+(t.get('name') or '').lower()
   branded=None
   for rx,brand,own in BRANDS:
    if re.search(rx,low):
     if cat not in own:cat=brand
     branded=own
   # Names that say more than the tag: a numbered khoroo or bag is its office, "өрхийн эмнэлэг" a family health centre, a
   # district governor's office its district office.
   if re.search(r'өрхийн эмнэлэг|хорооны эмнэлэг',low):cat='family_health_center'
   elif cat=='government_office' and re.search(r'\d+\s*-?\s*(р|г|н|дүгээр|дугаар)?\s*хороо|khoroo|багийн (төв|байр)',low) and 'эмнэлэг' not in low:cat='khoroo_office'
   elif cat=='government_office' and re.search(r'засаг даргын тамгын газар|здтг',low) and re.search(r'дүүрэг|бзд|сбд|худ|схд|бгд|чд|нд|бн|налайх|багануур',low):cat='district_office'
   # The map's NGO tags are loose (a fence factory, a supermarket): keep the names that read as one.
   if cat=='charity_ngo' and not re.search(r'сан(\s|$)|нийгэмлэг|холбоо|форум|тбб|unicef|foundation|ngo|lab(\s|$)|world vision|save the children|улаан загалмай|red cross',low):continue
   nums=osm_phones(t)
   # The same business drawn twice on the map: same specific name and category within 100 m of its building outline, or 40 m
   # of another point, is one place (two stations of a chain across a road stay two); a phone on the second fills an empty first. Names that are only a category word ("Кино кафе")
   # can be different businesses side by side and stay apart.
   twin=skel(name) not in key_set and next((r for r in near.get((cat,skel(name)),[]) if metres(r['latitude'],r['longitude'],i['lat'],i['lon'])<(100 if 'way' in r['id']+i['osm'] else 40)),None)
   if twin:
    if nums and not twin['phones'] and not set(nums)&known:twin['phones']=phones(nums);known.update(nums);twin['qualityFlags']=[f for f in twin['qualityFlags'] if f!='no_phone']
    continue
   if set(nums)&known:continue
   known.update(nums);seen.add(rid)
   url='https://www.openstreetmap.org/'+i['osm']
   addr=t.get('addr:full') or ', '.join(x for x in (t.get('addr:street'),t.get('addr:housenumber')) if x)
   add(rid,name,cat,addr,nums,i['lat'],i['lon'],f"https://www.google.com/maps/search/?api=1&query={i['lat']},{i['lon']}",[url],osm_hours(t.get('opening_hours')),['source_openstreetmap','not_contact_verified']+([] if nums else ['no_phone']),osm_district(i['lat'],i['lon']) or district(addr))
   records[-1]['retrievedAt']=pois['retrievedAt']
   # Other registry tags on the same place ("cuisine=korean" on a restaurant, "service:vehicle:tyres" on a garage) add categories.
   also={by_tag[x] for x in pairs if x in by_tag}
   # A name that says something more specific than the tag ("…хумсны салон" under shop=beauty) adds that category too, but
   # only on a long phrase (8+ letters), so a short word does not drag a place into the wrong list.
   # A shorter word counts too when it names a service of the same kind as the tag (a garage called "Anar Hybrid Service",
   # "…-ӨЭМТ" under clinic), except where the word misleads: a bank's name on its ATM, "сургууль" on a university faculty,
   # "lounge" on a café, "театр" in a museum's name, "Кемпински" read as a camp.
   named=by_name_long(name) or (lambda n:n if n and group_of.get(n)==group_of.get(cat) and n not in SHORT_NEVER else None)(by_name(name))
   if named:also.add(named)
   # A brand keeps only its own services; a loose NGO tag adds "charity" only to a name that reads as one.
   if branded:also&=branded
   if 'charity_ngo' in also and not re.search(r'сан(\s|$)|нийгэмлэг|холбоо|форум|тбб|unicef|foundation|ngo|lab(\s|$)|world vision|save the children|улаан загалмай|red cross',low):also.discard('charity_ngo')
   also=sorted(also-{cat})
   if also:records[-1]['alsoCategories']=also
   near.setdefault((cat,skel(name)),[]).append(records[-1])
   per[cat]=per.get(cat,0)+1
  print(f'openstreetmap places: {sum(per.values())} added in {len(per)} categories',file=sys.stderr)

 # Businesses found by Mongolian web search (07_Web/*.json, one file per batch): each record names its registry category, the
 # page it came from, and a map position only when that page gives one. A record whose phone Nomi already lists is skipped; one
 # without a phone is left out (nothing to call). Without a position it is flagged no_location for the morning call list.
 web_dir=root.parent/'Nomi_All_Prepared_Files'/'07_Web'
 if web_dir.is_dir() and reg_file.is_file():
  ids={c['id'] for c in json.loads(reg_file.read_text(encoding='utf-8'))['categories']}
  # Ids the web batches used for registry categories worded differently (merged registry, 2026-10-08).
  WEB_ALIASES={'car_ac_refill':'car_ac','internet_install':'internet_provider','furniture_making':'custom_furniture','door_window':'doors','welding':'welder','heating':'heating_repair','it_course':'programming_course','maternity':'maternity_hospital','appraisal':'property_valuation','exam_prep':'eyesh_prep','cleaning_service':'house_cleaning','security_camera':'cctv','air_conditioning':'ac_install'}
  known={p for r in records for p in r['phones']};web_added=0;web_skipped={};web_also=0
  def same_business(a,b):
   x,y=skel(a),skel(b)
   if not x or not y:return False
   if x==y or x in y or y in x:return True
   wx,wy=set(x.split()),set(y.split())
   return len(wx&wy)/max(1,min(len(wx),len(wy)))>=0.6
  owner={}
  for r in records:
   for p in r['phones']:owner.setdefault(p,r)
  for f in sorted(web_dir.glob('*.json')):
   for n,w in enumerate(json.loads(f.read_text(encoding='utf-8')).get('records',[])):
    cat=w.get('category');nums=phones(w.get('phones') or []);name=(w.get('name') or '').strip();src=w.get('sourceUrl') or ''
    # A batch written before the registry was final may use a near-miss id: a known alias, else its Mongolian category name.
    cat=WEB_ALIASES.get(cat,cat)
    if cat not in ids and 'by_name' in dir():cat=by_name(w.get('categoryName') or str(cat or '').replace('_',' ')) or cat
    why='unknown_category' if cat not in ids else 'no_phone' if not nums else 'no_name' if not name else 'no_source' if not src.startswith('http') else 'known_phone' if set(nums)&known else None
    if why=='known_phone':
     # The same business listed again under another service (a garage that also changes oil) gains that category. A shared
     # number under a different name (a hospital and the pharmacy inside it, a chain hotline) is a different place: added.
     r=next((owner[p] for p in nums if p in owner),None)
     if r and same_business(name,r['name']):
      if cat!=r['category'] and cat not in r.setdefault('alsoCategories',[]):r['alsoCategories'].append(cat);web_also+=1
      if not r.get('alsoCategories'):r.pop('alsoCategories',None)
     else:why=None
    if why:web_skipped[why]=web_skipped.get(why,0)+1;continue
    known.update(nums)
    # A business that comes to the customer ("mobile": plumbers on call, catering) needs no pin: flagged mobile_service, not no_location.
    lat,lon=w.get('lat'),w.get('lon')
    ok=isinstance(lat,(int,float)) and isinstance(lon,(int,float)) and 47.5<lat<48.3 and 106.3<lon<108.7
    add(f'web-{f.stem}-{n}',name,cat,w.get('address') or '',nums,lat if ok else None,lon if ok else None,f"https://www.google.com/maps/search/?api=1&query={lat},{lon}" if ok else None,[src],w.get('hours') or None,['source_web','not_contact_verified']+(['mobile_service'] if w.get('mobile') else [] if ok else ['no_location']),(w.get('district') if w.get('district') in districts else None) or (osm_district(lat,lon) if ok else None) or district(w.get('address') or ''))
    records[-1]['retrievedAt']=w.get('retrievedAt') or '2026-10-08'
    for p in nums:owner.setdefault(p,records[-1])
    web_added+=1
  print(f'web: {web_added} added, {web_also} extra categories on known places, skipped {web_skipped}',file=sys.stderr)
 placed=0
 for r in records:
  if r['district'] is None and r['latitude'] is not None:
   r['district']=osm_district(r['latitude'],r['longitude'])
   if r['district']:r['qualityFlags']=r['qualityFlags']+['district_from_position'];placed+=1
 print(f'openstreetmap: {added} pharmacies added, {filled} positions filled, {placed} districts placed by position',file=sys.stderr)
# Pages sharing a phone and category are grouped for this pilot; retain all source links.
# Keep pharmacy branches separate because chain call centers are shared.
out=[]
for r in records:
 same=next((x for x in out if r['category']=='tire' and x['category']=='tire' and set(r['phones'])&set(x['phones'])),None)
 if same:
  same['sources']=list(dict.fromkeys(same['sources']+r['sources']))
  same['phones']=list(dict.fromkeys(same['phones']+r['phones']))
  same.setdefault('relatedListings',[]).append(r)
  same['qualityFlags']=list(dict.fromkeys(same['qualityFlags']+['multiple_listings_shared_phone']))
 else:out.append(r)
assert len({r['id'] for r in out})==len(out)
# Verification outcomes from the field tool (see the module docstring).
statuses=['Шалгаагүй','Баталгаажсан','Утсаа аваагүй','Буруу дугаар','Хаагдсан','Дахин лавлах']
left_out_statuses={'Хаагдсан','Буруу дугаар'}
if not args.summary.is_file():sys.exit(f'Missing {args.summary}. Export it first: node scripts/export-checks.mjs')
summary=json.loads(args.summary.read_text(encoding='utf-8'))
if summary.get('version')!=2 or not isinstance(summary.get('records'),dict):sys.exit(f'{args.summary} must be check-summary version 2')
checks=summary['records']
for id,c in checks.items():
 if not isinstance(c,dict) or c.get('status') not in statuses:sys.exit(f'{id}: unknown check status')
def valid_date(value):
 try:return isinstance(value,str) and bool(datetime.fromisoformat(value.replace('Z','+00:00')))
 except ValueError:return False
matched=set()
kept=[];left_out={};coordinates_verified=0
for r in out:
 ids=[r['id']]+[x['id'] for x in r.get('relatedListings',[])]
 found=[i for i in ids if i in checks]
 matched.update(found)
 if len(found)>1:print(f'note: {r["id"]} takes the check of {found[0]}; other entries in its group ignored: {found[1:]}',file=sys.stderr)
 c=checks[found[0]] if found else None
 status=c['status'] if c else 'Шалгаагүй'
 verified_at=None
 if status=='Баталгаажсан':
  verified_at=c.get('checkedAt')
  if not valid_date(verified_at):sys.exit(f'{r["id"]}: Баталгаажсан without a usable checkedAt')
 for x in [r]+r.get('relatedListings',[]):
  x['checkStatus']=status;x['verifiedAt']=verified_at
  if verified_at:x['qualityFlags']=[f for f in x['qualityFlags'] if f!='not_contact_verified']
 loc=c.get('location') if c else None
 if c and c.get('coordinateStatus')=='Баталгаажсан' and isinstance(loc,dict) and all(isinstance(loc.get(k),(int,float)) for k in ('lat','lng')):
  r['latitude']=loc['lat'];r['longitude']=loc['lng'];r['mapUrl']=f"https://www.google.com/maps/search/?api=1&query={loc['lat']},{loc['lng']}"
  r['qualityFlags']=[f for f in r['qualityFlags'] if f not in ('missing_coordinates','map_pin_not_field_verified')]+['coordinates_field_verified']
  coordinates_verified+=1
 if status in left_out_statuses:left_out[status]=left_out.get(status,0)+1
 else:kept.append(r)
args.out.parent.mkdir(parents=True,exist_ok=True)
args.out.write_text(json.dumps(kept,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'total':len(kept),'byCategory':{c:sum(r['category']==c for r in kept) for c in sorted({r['category'] for r in kept})},'coordinates':sum(r['latitude'] is not None for r in kept),'summaryByStatus':{s:n for s in statuses if (n:=sum(c['status']==s for c in checks.values()))},'catalogByStatus':{s:n for s in statuses if (n:=sum(r['checkStatus']==s for r in kept))},'verified':sum(r['verifiedAt'] is not None for r in kept),'leftOut':left_out,'leftOutTotal':sum(left_out.values()),'coordinatesFieldVerified':coordinates_verified,'unmatched':sorted(set(checks)-matched)},ensure_ascii=False))
